import { $, appState, categories, esc, fmtDate, money, orderedCategories, save, selectedMonth, today } from './estado.js';
import { render } from './renderizacao.js';
import { askConfirm } from './dialogos.js';
import { cents, dueDate, goalMonthly, goalPlan, uid, ymd } from './calculos.js';
import { createBackup, restoreBackup, validateBackup } from './backup.js';

const titles = {
  inicio: 'Visão geral',
  lancamentos: 'Lançamentos',
  fixos: 'Movimentações fixas',
  graficos: 'Análise financeira',
  alertas: 'Avisos e orçamento',
  metas: 'Planejamento de metas',
  juros: 'Juros compostos',
  admin: 'Administração'
};

function showPage(p) {
  appState.current = p;
  if (typeof window.granaSetAdminTop === 'function') window.granaSetAdminTop(p === 'admin');
  document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === p));
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', x.dataset.page === p));
  $('pageTitle').textContent = titles[p];
  render();
}

function fillCats() {
  const type = $('txType').value;
  // Mantém a ordem original das categorias padrão; novas categorias são acrescentadas ao final.
  $('txCat').innerHTML = orderedCategories(categories[type]).map(c => `<option>${esc(c)}</option>`).join('');
  $('fixedCat').innerHTML = orderedCategories(categories.despesa).map(c => `<option>${esc(c)}</option>`).join('');
}

function fillFilterCats() {
  const type = $('filterType').value;
  const list = orderedCategories(type === 'todos' ? [...new Set([...categories.receita, ...categories.despesa])] : categories[type]);
  const previous = $('filterCat').value;
  $('filterCat').innerHTML = '<option value="todas">Todas as categorias</option>' + list.map(c => `<option>${esc(c)}</option>`).join('');
  $('filterCat').value = list.includes(previous) ? previous : 'todas';
}

function openModal(id) {
  $(id).hidden = false;
}

function closeModal(id) {
  $(id).hidden = true;
}

function fillEditCats(selected) {
  const list = orderedCategories(categories[$('editType').value]);
  $('editCat').innerHTML = list.map(c => `<option>${esc(c)}</option>`).join('');
  if (list.includes(selected)) $('editCat').value = selected;
}

function openEditTx(id) {
  const t = appState.data.transactions.find(x => x.id === id);
  if (!t || t.fixedId || t.goalId) return; // pagamentos vinculados são editados em sua origem
  appState.editingTxId = id;
  $('editType').value = t.type;
  fillEditCats(t.cat);
  $('editAmount').value = t.amount;
  $('editDesc').value = t.desc;
  $('editDate').value = t.date;
  $('editNote').value = t.note || '';
  openModal('txModal');
  $('editAmount').focus();
}

async function removeTx(id) {
  const t0 = appState.data.transactions.find(x => x.id === id);
  const okTx = await askConfirm({
    title: 'Excluir lançamento',
    message: t0 && t0.fixedId ? 'Este é o pagamento de uma despesa fixa. Ao excluir, a conta volta a ficar pendente neste mês.' : 'Deseja realmente excluir este lançamento? Esta ação não pode ser desfeita.',
    detail: t0 ? `${t0.desc} · ${t0.type === 'receita' ? '+' : '-'} ${money(t0.amount)} · ${fmtDate(t0.date)}` : '',
    confirmText: 'Excluir',
    danger: true
  });
  if (!okTx) return;
  const t = appState.data.transactions.find(x => x.id === id);
  // Se era o pagamento de uma conta fixa, desmarca o "pago" dela
  if (t && t.fixedId) {
    const f = appState.data.fixed.find(x => x.id === t.fixedId);
    if (f && f.paid) delete f.paid[t.date.slice(0, 7)];
  }
  if (t && t.incomeFixedId && window.granaUnreceive) window.granaUnreceive(t.incomeFixedId, t.date.slice(0, 7));
  if (t && t.goalId && t.goalContributionMonth) {
    const goal = appState.data.goals.find(item => item.id === t.goalId);
    if (goal?.contributions) {
      goal.saved = Math.max(0, Number(goal.saved || 0) - Number(goal.contributions[t.goalContributionMonth] || 0));
      delete goal.contributions[t.goalContributionMonth];
    }
  }
  appState.data.transactions = appState.data.transactions.filter(x => x.id !== id);
  save();
}

function markFixed(id, checked) {
  const key = selectedMonth();
  const f = appState.data.fixed.find(x => x.id === id);
  if (!f) return;
  f.paid = f.paid || {};
  appState.data.transactions = appState.data.transactions.filter(t => !(t.fixedId === id && t.date.slice(0, 7) === key));
  if (checked) {
    f.paid[key] = true;
    appState.data.transactions.push({
      id: uid(),
      type: 'despesa',
      amount: f.amount,
      desc: f.name,
      cat: f.cat,
      date: dueDate(key, f.due),
      kind: 'fixo',
      fixedId: id
    });
  } else {
    delete f.paid[key];
  }
  save();
}

async function removeFixed(id) {
  const f0 = appState.data.fixed.find(x => x.id === id);
  const okFx = await askConfirm({
    title: 'Excluir despesa fixa',
    message: 'Os pagamentos já registrados continuam nos lançamentos.',
    detail: f0 ? `${f0.name} · ${money(f0.amount)} · vence dia ${f0.due}` : '',
    confirmText: 'Excluir',
    danger: true
  });
  if (!okFx) return;
  appState.data.transactions.forEach(t => {
    if (t.fixedId === id) delete t.fixedId;
  });
  appState.data.fixed = appState.data.fixed.filter(x => x.id !== id);
  save();
}

function openEditFixed(id) {
  const fixed = appState.data.fixed.find(item => item.id === id);
  if (!fixed) return;
  $('fixedEditId').value = id;
  $('fixedEditAmount').value = fixed.amount;
  $('fixedEditHint').textContent = `${fixed.name} · altere somente o valor mensal desta conta.`;
  openModal('fixedEditModal');
  $('fixedEditAmount').focus();
}

function openGoalContribution(id) {
  const goal = appState.data.goals.find(item => item.id === id);
  if (!goal) return;
  const month = selectedMonth() || monthNow();
  $('contributionGoalId').value = id;
  $('contributionMonth').value = month;
  fillGoalContributionAmount();
  $('goalContributionHint').textContent = `${goal.name} · o valor substitui o aporte registrado para o mês escolhido.`;
  openModal('goalContributionModal');
  $('contributionAmount').focus();
}

function fillGoalContributionAmount() {
  const goal = appState.data.goals.find(item => String(item.id) === $('contributionGoalId').value);
  const month = $('contributionMonth').value;
  $('contributionAmount').value = goal?.contributions?.[month] ?? '';
}

function saveGoalContribution(goal, month, amount) {
  goal.contributions = goal.contributions || {};
  const previous = Number(goal.contributions[month] || 0);
  goal.contributions[month] = amount;
  goal.saved = Math.max(0, Number(goal.saved || 0) + amount - previous);
  const existing = appState.data.transactions.find(t => t.goalId === goal.id && t.goalContributionMonth === month);
  if (amount === 0) {
    appState.data.transactions = appState.data.transactions.filter(t => t !== existing);
  } else if (existing) {
    existing.amount = amount;
    existing.date = dueDate(month, new Date().getDate());
  } else {
    appState.data.transactions.push({id:uid(),type:'despesa',amount,desc:`Aporte mensal - ${goal.name}`,cat:'Investimento',date:dueDate(month,new Date().getDate()),kind:'variavel',goalId:goal.id,goalContributionMonth:month});
  }
  save();
}

async function addGoalMonthly(id) {
  const goal = appState.data.goals.find(item => item.id === id);
  const month = selectedMonth();
  if (!goal || goal.contributions?.[month]) return;
  const plan = goalMonthly(goal.target, goal.saved, goal.deadline, new Date());
  const amount = Math.round(plan.monthly * 100) / 100;
  if (!(amount > 0)) return;
  const confirmed = await askConfirm({title:'Adicionar aporte mensal',message:'Registrar o valor mensal planejado como despesa variável?',detail:`${goal.name} · ${month} · ${money(amount)}`,confirmText:'Adicionar'});
  if (confirmed) saveGoalContribution(goal, month, amount);
}

function previewGoal() {
  const pl = goalPlan(+$('goalTarget').value, +$('goalSaved').value, Math.max(1, +$('goalTime').value || 1), $('goalUnit').value, new Date());
  $('goalPreview').textContent = money(pl.monthly);
}

function previewEditGoal() {
  const gm = goalMonthly(+$('editGoalTarget').value, +$('editGoalSaved').value, $('editGoalDeadline').value || today(), new Date());
  $('editGoalPreview').textContent = gm.remaining <= 0 ? 'Meta atingida' : gm.dleft < 0 ? 'Prazo vencido · faltam ' + money(gm.remaining) : money(gm.monthly) + ' por mês';
}

function openEditGoal(id) {
  const g = appState.data.goals.find(x => x.id === id);
  if (!g) return;
  appState.editingGoalId = id;
  $('editGoalName').value = g.name;
  $('editGoalTarget').value = g.target;
  $('editGoalSaved').value = g.saved;
  $('editGoalDeadline').value = g.deadline;
  previewEditGoal();
  openModal('goalModal');
  $('editGoalTarget').focus();
}

async function removeGoal(id) {
  const g0 = appState.data.goals.find(g => g.id === id);
  const okGl = await askConfirm({
    title: 'Excluir meta',
    message: 'Deseja realmente excluir esta meta? Esta ação não pode ser desfeita.',
    detail: g0 ? `${g0.name} · ${money(g0.saved)} de ${money(g0.target)}` : '',
    confirmText: 'Excluir',
    danger: true
  });
  if (okGl) {
    appState.data.goals = appState.data.goals.filter(g => g.id !== id);
    save();
  }
}

function exportJSON() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(createBackup(), null, 1)], {
    type: 'application/json'
  }));
  a.download = 'grana-backup-' + today() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function initAcoes() {
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => showPage(b.dataset.page));
$('monthFilter').onchange = render;
$('txType').addEventListener('change', fillCats);
$('filterType').addEventListener('change', () => {
  fillFilterCats();
  render();
});
$('filterCat').addEventListener('change', render);
$('filterClear').onclick = () => {
  $('filterType').value = 'todos';
  $('filterCat').value = 'todas';
  fillFilterCats();
  render();
};
$('txForm').onsubmit = e => {
  e.preventDefault();
  appState.data.transactions.push({
    id: uid(),
    type: $('txType').value,
    amount: cents($('txAmount').value) / 100,
    desc: $('txDesc').value.trim(),
    cat: $('txCat').value,
    date: $('txDate').value,
    kind: 'variavel',
    note: $('txNote').value
  });
  e.target.reset();
  $('txDate').value = today();
  fillCats();
  save();
};
$('editType').addEventListener('change', () => fillEditCats($('editCat').value));
$('editTxForm').onsubmit = e => {
  e.preventDefault();
  const t = appState.data.transactions.find(x => x.id === appState.editingTxId);
  const amount = cents($('editAmount').value) / 100;
  if (!t || amount <= 0) return;
  t.type = $('editType').value;
  t.kind = t.type === 'receita' ? 'variavel' : t.kind || 'variavel';
  t.amount = amount;
  t.desc = $('editDesc').value.trim();
  t.cat = $('editCat').value;
  t.date = $('editDate').value;
  t.note = $('editNote').value;
  closeModal('txModal');
  save();
};
$('fixedForm').onsubmit = e => {
  e.preventDefault();
  appState.data.fixed.push({
    id: uid(),
    name: $('fixedName').value.trim(),
    amount: cents($('fixedAmount').value) / 100,
    cat: $('fixedCat').value,
    due: Math.min(31, Math.max(1, +$('fixedDue').value || 1)),
    start: selectedMonth(),
    // passa a valer a partir do mês selecionado
    paid: {}
  });
  e.target.reset();
  $('fixedDue').value = 10;
  fillCats();
  save();
};
['goalTarget', 'goalSaved', 'goalTime', 'goalUnit'].forEach(id => $(id).addEventListener('input', previewGoal));
$('goalForm').onsubmit = e => {
  e.preventDefault();
  const n = Math.max(1, +$('goalTime').value || 1);
  const pl = goalPlan(+$('goalTarget').value, +$('goalSaved').value, n, $('goalUnit').value, new Date());
  appState.data.goals.push({
    id: uid(),
    name: $('goalName').value.trim(),
    target: +$('goalTarget').value,
    saved: +$('goalSaved').value || 0,
    deadline: ymd(pl.deadline)
  });
  e.target.reset();
  $('goalTime').value = 6;
  previewGoal();
  save();
};
$('fixedEditForm').onsubmit = e => {
  e.preventDefault();
  const fixed = appState.data.fixed.find(item => String(item.id) === $('fixedEditId').value);
  const amount = Number($('fixedEditAmount').value);
  if (!fixed || !(amount > 0)) return;
  fixed.amount = amount;
  closeModal('fixedEditModal');
  save();
};
$('goalContributionForm').onsubmit = e => {
  e.preventDefault();
  const goal = appState.data.goals.find(item => String(item.id) === $('contributionGoalId').value);
  const month = $('contributionMonth').value;
  const amount = Number($('contributionAmount').value);
  if (!goal || !/^\d{4}-\d{2}$/.test(month) || !(amount >= 0)) return;
  closeModal('goalContributionModal');
  saveGoalContribution(goal, month, amount);
};
$('contributionMonth').addEventListener('change', fillGoalContributionAmount);
['editGoalTarget', 'editGoalSaved', 'editGoalDeadline'].forEach(id => $(id).addEventListener('input', previewEditGoal));
$('editGoalForm').onsubmit = e => {
  e.preventDefault();
  const g = appState.data.goals.find(x => x.id === appState.editingGoalId);
  const target = +$('editGoalTarget').value;
  const saved = +$('editGoalSaved').value;
  if (!g || !(target > 0) || !(saved >= 0) || !$('editGoalDeadline').value) return;
  g.name = $('editGoalName').value.trim() || g.name;
  g.target = target;
  g.saved = saved;
  g.deadline = $('editGoalDeadline').value;
  closeModal('goalModal');
  save();
};
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => {
    if (e.target === o) o.hidden = true;
  });
});
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closeModal(b.dataset.close));
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const top = ['confirmModal', 'dateModal'].map($).find(o => !o.hidden); // cards por cima de outros
  if (top) {
    top.hidden = true;
    return;
  }
  document.querySelectorAll('.modal-overlay').forEach(o => o.hidden = true);
});
$('importFile').onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    try {
      const d = JSON.parse(r.result);
      validateBackup(d);
      if (await askConfirm({
        title: 'Importar backup',
        message: 'Os dados atuais serão substituídos pelos do arquivo escolhido. Esta ação não pode ser desfeita.',
        detail: f.name,
        confirmText: 'Substituir dados',
        danger: true
      })) {
        restoreBackup(d);
      }
    } catch (x) {
      askConfirm({
        title: 'Backup inválido',
        message: 'O arquivo escolhido não é um backup válido do GRANA.',
        confirmText: 'Entendi',
        single: true
      });
    }
    e.target.value = '';
  };
  r.readAsText(f);
};
}

export { titles, showPage, fillCats, fillFilterCats, openModal, closeModal, fillEditCats, openEditTx, removeTx, markFixed, removeFixed, openEditFixed, openGoalContribution, addGoalMonthly, previewGoal, previewEditGoal, openEditGoal, removeGoal, exportJSON, initAcoes };
