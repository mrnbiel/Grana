// Gerado por tools/build.cjs. Edite os módulos.
(() => {
// Fonte: js/core/armazenamento.js
// Isola o armazenamento financeiro provisório por conta. Dados legados são preservados.
const userStorage = {
  key(key) {
    if (!window.granaUserId) throw Error('Sessão necessária para acessar dados financeiros.');
    return 'grana_usuario:' + window.granaUserId + ':' + key;
  },
  getItem(key) { return localStorage.getItem(this.key(key)); },
  setItem(key, value) { localStorage.setItem(this.key(key), value); },
  removeItem(key) { localStorage.removeItem(this.key(key)); }
};


// Fonte: js/core/calculos.js


const p2 = n => String(n).padStart(2, '0');

const cents = v => Math.round((Number(v) || 0) * 100);

const ymd = d => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());

const dim = m => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();

const dueDate = (m, d) => m + '-' + p2(Math.min(Math.max(1, d), dim(m)));

const uid = () => Date.now() * 1000 + Math.floor(Math.random() * 1000);

const sumC = (arr, f = () => true) => arr.filter(f).reduce((s, x) => s + cents(x.amount), 0);

const fixedActive = (f, m) => f.cardPurchaseId !== undefined ? f.start === m : (f.start || '0000-00') <= m;

const isPaid = (f, m) => !!(f.paid && f.paid[m]);

function addMonths(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1);
  x.setDate(Math.min(d.getDate(), dim(x.getFullYear() + '-' + p2(x.getMonth() + 1))));
  return x;
}

function goalPlan(target, saved, n, unit, from) {
  const remaining = Math.max(0, cents(target) - cents(saved)) / 100;
  let months;
  let deadline = new Date(from);
  if (unit === 'dias') {
    months = n / 30.4375;
    deadline.setDate(deadline.getDate() + n);
  } else {
    const k = unit === 'anos' ? n * 12 : n;
    months = k;
    deadline = addMonths(from, k);
  }
  // Prazo menor que 1 mês: o valor restante deve ser guardado de uma vez
  const monthly = remaining / Math.max(1, months);
  return {
    remaining,
    months,
    monthly,
    deadline
  };
}

function goalMonthly(target, saved, deadlineStr, now) {
  const dleft = Math.ceil((new Date(deadlineStr + 'T12:00:00') - now) / 864e5);
  const months = Math.max(0, dleft / 30.4375);
  const remaining = Math.max(0, cents(target) - cents(saved)) / 100;
  const monthly = remaining / Math.max(1, months);
  return {
    dleft,
    months,
    remaining,
    monthly
  };
}

function monthlyRate(r, unit) {
  const x = (Number(r) || 0) / 100;
  return unit === 'ano' ? Math.pow(1 + x, 1 / 12) - 1 : x;
}

function compound(p, c, rm, n) {
  const g = Math.pow(1 + rm, n);
  const fv = p * g + (rm ? c * (g - 1) / rm : c * n);
  const invested = p + c * n;
  return {
    fv,
    invested,
    interest: fv - invested
  };
}

function requiredContribution(target, principal, rm, n) {
  const g = Math.pow(1 + rm, n);
  const need = target - principal * g;
  if (need <= 0) return 0;
  return rm ? need * rm / (g - 1) : need / n;
}

function budget(data, m, todayStr) {
  const cm = todayStr.slice(0, 7);
  const tx = data.transactions.filter(t => t.date.slice(0, 7) === m);
  const income = sumC(tx, t => t.type === 'receita');
  const expense = sumC(tx, t => t.type === 'despesa');
  const fixedPaid = sumC(tx, t => t.type === 'despesa' && t.kind === 'fixo');

  // Fixas cadastradas que ainda não foram pagas neste mês
  const pendList = data.fixed.filter(f => fixedActive(f, m) && !isPaid(f, m));
  const fixedPending = pendList.reduce((s, f) => s + cents(f.amount), 0);
  const variable = expense - fixedPaid;
  const varToday = m === cm ? sumC(tx, t => t.type === 'despesa' && t.kind !== 'fixo' && t.date === todayStr) : 0;

  // Saldo livre = receitas - fixas (pagas e pendentes) - variáveis já gastas
  const free = income - fixedPaid - fixedPending - variable;

  // Dias restantes (inclui hoje); mês futuro = mês inteiro; mês passado = 0
  let days = 0;
  if (m > cm) days = dim(m);else if (m === cm) days = dim(m) - +todayStr.slice(8, 10) + 1;

  // Orçamento diário: o saldo livre dividido pelos dias restantes.
  // Cada compra variável reduz o saldo livre e, portanto, o valor diário.
  const daily = days ? Math.max(0, free) / days : 0;
  return {
    income,
    expense,
    fixedPaid,
    fixedPending,
    variable,
    varToday,
    free,
    days,
    daily,
    balance: income - expense
  };
}

function initCalculos() {

}



// Fonte: js/core/estado.js

const $ = id => document.getElementById(id);

const R = c => (c / 100).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const money = v => R(cents(v));

const today = () => ymd(new Date());

const monthNow = () => today().slice(0, 7);

const esc = s => String(s).replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);

const fmtDate = s => s.split('-').reverse().join('/');

const categories = {
  despesa: ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Contas', 'Pets', 'Impostos', 'Investimento', 'Outros'],
  receita: ['Salário', 'Freelance', 'Investimentos', 'Vendas', 'Reembolso', 'Outros']
};

const orderedCategories = list => [
  ...list.filter(name => name.toLocaleLowerCase('pt-BR') !== 'outros'),
  ...list.filter(name => name.toLocaleLowerCase('pt-BR') === 'outros')
];

const appState = { data: { transactions: [], fixed: [], goals: [] }, current: 'inicio', editingTxId: null, editingGoalId: null };

function save() {
  try {
    userStorage.setItem('vertice_data', JSON.stringify(appState.data));
  } catch (e) {
    askConfirm({
      title: 'Não foi possível salvar',
      message: 'Não foi possível salvar no navegador. Use Exportar para guardar um backup.',
      confirmText: 'Entendi',
      single: true
    });
  }
  render();
}

const selectedMonth = () => $('monthFilter').value || monthNow();

const monthTx = () => appState.data.transactions.filter(t => t.date.slice(0, 7) === selectedMonth());

function initEstado() {
window.granaExpenseCategories = () => orderedCategories(categories.despesa);
try {
  const saved = JSON.parse(userStorage.getItem('vertice_data') || 'null');
  if (saved && Array.isArray(saved.transactions)) {
    appState.data = {
      transactions: saved.transactions,
      fixed: saved.fixed || [],
      goals: saved.goals || []
    };
  }
} catch (e) {/* dados corrompidos: começa vazio */}
}



// Fonte: js/core/backup.js

const backupKeys = ['grana_prioridades_v1', 'grana_receitas_fixas_v1',
  'grana_categorias_personalizadas_v1', 'grana_categorias_padroes_excluidas_v1', 'grana_privacy_mode'];

function writeRecords(records) {
  const before = Object.fromEntries(Object.keys(records).map(k => [k, userStorage.getItem(k)]));
  try {
    for (const [key, value] of Object.entries(records)) {
      if (value === null) userStorage.removeItem(key);
      else userStorage.setItem(key, value);
    }
  } catch (error) {
    for (const [key, value] of Object.entries(before)) {
      if (value === null) userStorage.removeItem(key); else userStorage.setItem(key, value);
    }
    throw error;
  }
}

function createBackup() {
  return { ...appState.data, format: 'grana', version: 2,
    extensions: Object.fromEntries(backupKeys.map(k => [k, userStorage.getItem(k)])) };
}

function validateBackup(input) {
  const fail = () => { throw new Error('Estrutura de backup inválida'); };
  const obj = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const str = x => typeof x === 'string';
  const num = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const id = x => (str(x) && x.length > 0 && /^[\w-]+$/.test(x)) || (typeof x === 'number' && Number.isSafeInteger(x));
  const month = x => str(x) && /^\d{4}-(0[1-9]|1[0-2])$/.test(x);
  const date = x => str(x) && /^\d{4}-\d{2}-\d{2}$/.test(x) && ymd(new Date(x + 'T12:00:00')) === x;
  const flags = x => x === undefined || (obj(x) && Object.entries(x).every(([k,v]) => month(k) && typeof v === 'boolean'));
  const day = x => Number.isInteger(x) && x >= 1 && x <= 31;
  const list = (x, check) => { if (!Array.isArray(x) || !x.every(v => obj(v) && check(v)) || new Set(x.map(v => v.id)).size !== x.length) fail(); };
  if (!obj(input)) fail();
  if (input.version !== undefined && (input.version !== 2 || input.format !== 'grana')) fail();
  const d = { transactions: input.transactions, fixed: input.fixed ?? [], goals: input.goals ?? [] };
  list(d.transactions, t => id(t.id) && ['receita','despesa'].includes(t.type) && num(t.amount) && str(t.desc) && str(t.cat) && date(t.date) && (t.fixedId === undefined || id(t.fixedId)) && (t.incomeFixedId === undefined || id(t.incomeFixedId)) && (t.goalId === undefined || id(t.goalId)) && (t.goalContributionMonth === undefined || month(t.goalContributionMonth)));
  list(d.fixed, f => id(f.id) && str(f.name) && str(f.cat) && num(f.amount) && day(f.due) && (f.start === undefined || month(f.start)) && flags(f.paid) && (f.cardPurchaseId === undefined || id(f.cardPurchaseId)));
  list(d.goals, g => id(g.id) && str(g.name) && num(g.target) && g.target > 0 && num(g.saved) && date(g.deadline) &&
    (g.contributions === undefined || (obj(g.contributions) && Object.entries(g.contributions).every(([key,value]) => month(key) && num(value)))));
  let ext = {};
  if (input.version === 2) {
    if (!obj(input.extensions) || !backupKeys.every(k => k in input.extensions)) fail();
    for (const k of backupKeys) {
      const raw = input.extensions[k];
      if (raw !== null && !str(raw)) fail();
      ext[k] = raw;
      if (k === 'grana_privacy_mode') { if (raw !== null && !['0','1'].includes(raw)) fail(); continue; }
      if (raw === null) continue;
      const value = JSON.parse(raw);
      if (k === 'grana_prioridades_v1') {
        if (!obj(value)) fail();
        list(value.cards, c => id(c.id) && str(c.name) && num(c.limit) && day(c.close) && day(c.due));
        list(value.purchases, p => id(p.id) && id(p.cardId) && value.cards.some(c => c.id === p.cardId) && str(p.desc) && num(p.amount) && Number.isInteger(p.parts) && p.parts >= 1 && p.parts <= 48 && date(p.date) && month(p.firstMonth) && num(p.partValue) && str(p.category) && (p.fixedIds === undefined || (Array.isArray(p.fixedIds) && p.fixedIds.every(id))));
        list(value.budgets, b => id(b.id) && str(b.category) && month(b.month) && num(b.limit) && b.limit > 0);
        if (!Array.isArray(value.paidInvoices) || !value.paidInvoices.every(str)) fail();
      } else if (k === 'grana_receitas_fixas_v1') {
        list(value, r => id(r.id) && str(r.name) && num(r.amount) && str(r.cat) && day(r.due) && month(r.start) && flags(r.received));
      } else if (!obj(value) || !['receita','despesa'].every(t => Array.isArray(value[t]) && value[t].every(str))) fail();
    }
  }
  return { data: JSON.parse(JSON.stringify(d)), extensions: ext };
}

function restoreBackup(input) {
  const validated = validateBackup(input);
  writeRecords({vertice_data: JSON.stringify(validated.data), ...validated.extensions});
  appState.data = validated.data;
  // Reinicializa os escopos das extensões com os registros restaurados.
  location.reload();
}

function initBackup() {

}



// Fonte: js/core/acoes.js

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



// Fonte: js/core/dialogos.js

let confirmFinish = null;

function askConfirm(o) {
  if (confirmFinish) confirmFinish(false);
  return new Promise(resolve => {
    const ov = $('confirmModal'),
      ok = $('confirmOk'),
      cancel = $('confirmCancel');
    $('confirmTitle').textContent = o.title || 'Confirmar';
    $('confirmMsg').textContent = o.message || '';
    const det = $('confirmDetail');
    det.textContent = o.detail || '';
    det.hidden = !o.detail;
    const ico = $('confirmIco');
    ico.textContent = o.danger ? '!' : o.single ? 'i' : '?';
    ico.className = 'confirm-ico' + (o.danger ? '' : ' info');
    ok.textContent = o.confirmText || 'Confirmar';
    ok.className = 'btn ' + (o.danger ? 'danger' : 'primary');
    cancel.textContent = o.cancelText || 'Cancelar';
    cancel.hidden = !!o.single;

    // Se o card for fechado por Esc ou clique fora, conta como "cancelar"
    const obs = new MutationObserver(() => {
      if (ov.hidden) finish(false);
    });
    function finish(v) {
      if (confirmFinish !== finish) return;
      confirmFinish = null;
      obs.disconnect();
      ov.hidden = true;
      resolve(v);
    }
    confirmFinish = finish;
    ok.onclick = () => finish(true);
    cancel.onclick = () => finish(false);
    obs.observe(ov, {
      attributes: true,
      attributeFilter: ['hidden']
    });
    ov.hidden = false;
    (o.danger && !o.single ? cancel : ok).focus(); // em exclusões o foco começa em "Cancelar"
  });
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const monthLabel = m => MONTHS[+m.slice(5, 7) - 1] + ' de ' + m.slice(0, 4);

const dp = {
  input: null,
  trigger: null,
  mode: 'date',
  view: 'days',
  y: 0,
  m: 0,
  base: 0,
  sel: ''
};

function dpOpen(input, trigger) {
  dp.input = input;
  dp.trigger = trigger;
  dp.mode = input.dataset.picker;
  dp.sel = input.value || '';
  const v = input.value || today();
  dp.y = +v.slice(0, 4);
  dp.m = +v.slice(5, 7) - 1;
  dp.view = dp.mode === 'month' ? 'months' : 'days'; // filtro de mês abre direto na lista de meses
  $('dpToday').textContent = dp.mode === 'month' ? 'Mês atual' : 'Hoje';
  dpRender();
  openModal('dateModal');
}

function dpRender() {
  const head = $('dpHead'),
    body = $('dpBody');
  const nav = (act, txt, label) => `<button type="button" class="dp-nav" data-act="${act}" aria-label="${label}">${txt}</button>`;
  const t = today();
  if (dp.view === 'days') {
    head.innerHTML = nav('prev', '‹', 'Mês anterior') + `<div class="dp-title"><button type="button" class="dp-pick" data-act="months">${MONTHS[dp.m]}</button><button type="button" class="dp-pick" data-act="years">${dp.y}</button></div>` + nav('next', '›', 'Próximo mês');
    const first = new Date(dp.y, dp.m, 1).getDay();
    const ym = dp.y + '-' + p2(dp.m + 1);
    let h = WEEKDAYS.map(w => `<span class="dp-wd">${w}</span>`).join('') + '<span></span>'.repeat(first);
    for (let d = 1; d <= dim(ym); d++) {
      const iso = ym + '-' + p2(d);
      h += `<button type="button" class="dp-day${iso === t ? ' today' : ''}${iso === dp.sel ? ' sel' : ''}" data-act="day" data-v="${iso}">${d}</button>`;
    }
    body.className = 'dp-days';
    body.innerHTML = h;
  } else if (dp.view === 'months') {
    head.innerHTML = nav('prevY', '‹', 'Ano anterior') + `<div class="dp-title"><button type="button" class="dp-pick" data-act="years">${dp.y}</button></div>` + nav('nextY', '›', 'Próximo ano');
    body.className = 'dp-opts';
    body.innerHTML = MONTHS_SHORT.map((n, i) => {
      const k = dp.y + '-' + p2(i + 1);
      return `<button type="button" class="dp-opt${k === t.slice(0, 7) ? ' today' : ''}${k === dp.sel.slice(0, 7) ? ' sel' : ''}" data-act="month" data-v="${i}">${n}</button>`;
    }).join('');
  } else {
    head.innerHTML = nav('prevR', '‹', 'Anos anteriores') + `<div class="dp-title">${dp.base} – ${dp.base + 11}</div>` + nav('nextR', '›', 'Próximos anos');
    body.className = 'dp-opts';
    let h = '';
    for (let y = dp.base; y < dp.base + 12; y++) {
      h += `<button type="button" class="dp-opt${String(y) === t.slice(0, 4) ? ' today' : ''}${String(y) === dp.sel.slice(0, 4) ? ' sel' : ''}" data-act="year" data-v="${y}">${y}</button>`;
    }
    body.innerHTML = h;
  }
}

function dpCommit(v) {
  const inp = dp.input;
  inp.value = v;
  inp.dispatchEvent(new Event('input', {
    bubbles: true
  }));
  inp.dispatchEvent(new Event('change', {
    bubbles: true
  }));
  closeModal('dateModal');
  if (dp.trigger) dp.trigger.focus();
}

function enhancePicker(inp) {
  const mode = inp.dataset.picker;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dp-trigger' + (mode === 'month' ? ' month' : '');
  btn.setAttribute('aria-haspopup', 'dialog');
  inp.insertAdjacentElement('afterend', btn);

  // Quando o código do sistema faz input.value = '...', o botão acompanha
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const refresh = () => {
    const v = proto.get.call(inp);
    btn.innerHTML = '<span class="dp-ico">▦</span><span></span>';
    btn.lastChild.textContent = v ? mode === 'month' ? monthLabel(v) : fmtDate(v) : 'Selecionar';
  };
  Object.defineProperty(inp, 'value', {
    configurable: true,
    get() {
      return proto.get.call(inp);
    },
    set(v) {
      proto.set.call(inp, v);
      refresh();
    }
  });
  btn.onclick = () => dpOpen(inp, btn);
  refresh();
}

function exportData() {
  $('expPdfInfo').textContent = 'Resumo, despesas por categoria, lançamentos, despesas fixas e metas de ' + monthLabel(selectedMonth()) + '. Ideal para ler e imprimir (não pode ser importado de volta).';
  openModal('exportModal');
}

function initDialogos() {
$('dateModal').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act,
    v = b.dataset.v;
  if (act === 'prev') {
    if (--dp.m < 0) {
      dp.m = 11;
      dp.y--;
    }
  } else if (act === 'next') {
    if (++dp.m > 11) {
      dp.m = 0;
      dp.y++;
    }
  } else if (act === 'months') dp.view = 'months';else if (act === 'years') {
    dp.base = Math.floor(dp.y / 12) * 12;
    dp.view = 'years';
  } else if (act === 'prevY') dp.y--;else if (act === 'nextY') dp.y++;else if (act === 'prevR') dp.base -= 12;else if (act === 'nextR') dp.base += 12;else if (act === 'day') return dpCommit(v);else if (act === 'month') {
    if (dp.mode === 'month') return dpCommit(dp.y + '-' + p2(+v + 1));
    dp.m = +v;
    dp.view = 'days'; // escolheu o mês: volta ao calendário
  } else if (act === 'year') {
    dp.y = +v;
    dp.view = dp.mode === 'month' ? 'months' : 'days'; // escolheu o ano: volta
  }
  dpRender();
});
$('dpToday').onclick = () => dpCommit(dp.mode === 'month' ? monthNow() : today());
window.granaEnhancePicker = enhancePicker;
document.querySelectorAll('[data-picker]').forEach(enhancePicker);
$('expJson').onclick = () => {
  closeModal('exportModal');
  exportJSON();
};
$('expPdf').onclick = () => {
  closeModal('exportModal');
  exportPDF();
};
}



// Fonte: js/core/pdf.js

const PDF_W_REG = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

const PDF_W_BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

function pdfEnc(s) {
  const map = {
    '−': '-',
    '–': '\x96',
    '—': '\x97',
    '…': '\x85',
    '“': '\x93',
    '”': '\x94',
    '‘': '\x91',
    '’': '\x92',
    '•': '\x95',
    '\u00a0': ' '
  };
  return Array.from(String(s)).map(ch => {
    if (map[ch] !== undefined) return map[ch];
    const c = ch.charCodeAt(0);
    return c >= 32 && c <= 126 || c >= 160 && c <= 255 ? ch : '?';
  }).join('');
}

const pdfStr = s => pdfEnc(s).replace(/[\\()]/g, '\\$&');

function pdfW(s, size, bold) {
  const t = bold ? PDF_W_BOLD : PDF_W_REG;
  let w = 0;
  for (const ch of pdfEnc(s)) {
    let c = ch.charCodeAt(0);
    if (c < 32 || c > 126) {
      const b = ch.normalize('NFD').charCodeAt(0);
      c = b >= 32 && b <= 126 ? b : 63;
    }
    w += t[c - 32];
  }
  return w * size / 1000;
}

function pdfBuild(pages) {
  const o = [];
  o[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  o[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => 5 + 2 * i + ' 0 R').join(' ')}] /Count ${pages.length} >>`;
  o[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  o[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((p, i) => {
    const c = p.join('\n');
    o[5 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`;
    o[6 + 2 * i] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const off = [];
  for (let i = 1; i < o.length; i++) {
    off[i] = out.length;
    out += `${i} 0 obj\n${o[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${o.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < o.length; i++) out += String(off[i]).padStart(10, '0') + ' 00000 n \n';
  out += `trailer\n<< /Size ${o.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return bytes;
}

function exportPDF() {
  const m = selectedMonth();
  const label = monthLabel(m);
  const tx = monthTx().slice().sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  const b = budget(appState.data, m, today());
  const act = appState.data.fixed.filter(f => fixedActive(f, m));
  const W = 595,
    H = 842,
    M = 40,
    CW = W - 2 * M;
  const C = {
    purple: '#5d3bb5',
    green: '#12a36f',
    red: '#d63a57',
    text: '#222233',
    muted: '#77768a',
    line: '#d9d3ea',
    head: '#ece8f7',
    zebra: '#f8f6fc',
    box: '#f3f0fa'
  };
  const pages = [];
  let ops, y;
  const col = h => [1, 3, 5].map(i => (parseInt(h.slice(i, i + 2), 16) / 255).toFixed(3)).join(' ');
  const T = (x, yy, s, size = 9, bold = false, color = C.text) => ops.push(`BT ${col(color)} rg /${bold ? 'F2' : 'F1'} ${size} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td (${pdfStr(s)}) Tj ET`);
  const TR = (xr, yy, s, size = 9, bold = false, color = C.text) => T(xr - pdfW(s, size, bold), yy, s, size, bold, color);
  const RECT = (x, yy, w, h, color) => ops.push(`${col(color)} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const fit = (s, w, size, bold) => {
    s = String(s);
    if (pdfW(s, size, bold) <= w) return s;
    while (s.length && pdfW(s + '...', size, bold) > w) s = s.slice(0, -1);
    return s + '...';
  };
  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = H - M;
  };
  const ensure = n => {
    if (y - n < M + 18) newPage();
  };
  const section = title => {
    ensure(70);
    y -= 10;
    T(M, y - 12, title, 12, true, C.purple);
    RECT(M, y - 18, CW, 0.8, C.line);
    y -= 28;
  };

  // cols: [{ x, w, right, label }]; rows: [[{ t, color, bold }, ...]]
  const table = (cols, rows, emptyMsg) => {
    const rh = 17;
    const head = () => {
      RECT(M, y - 16, CW, 16, C.head);
      cols.forEach(c => (c.right ? TR : T)(c.x, y - 11, c.label, 8, true, C.purple));
      y -= 18;
    };
    if (!rows.length) {
      T(M, y - 10, emptyMsg, 9, false, C.muted);
      y -= 24;
      return;
    }
    ensure(60);
    head();
    rows.forEach((r, i) => {
      if (y - rh < M + 25) {
        newPage();
        head();
      }
      if (i % 2) RECT(M, y - rh, CW, rh, C.zebra);
      r.forEach((cell, j) => {
        const c = cols[j];
        (c.right ? TR : T)(c.x, y - 12, fit(cell.t, c.w, 9, cell.bold), 9, !!cell.bold, cell.color || C.text);
      });
      y -= rh;
    });
    y -= 8;
  };

  /* ----- Cabeçalho ----- */
  newPage();
  RECT(0, H - 86, W, 86, '#1b1030');
  RECT(0, H - 88, W, 2, '#9a6bff');
  T(M, H - 44, 'GRANA', 22, true, '#ffffff');
  T(M, H - 64, 'Relatório financeiro · ' + label, 10, false, '#d9c8ff');
  TR(W - M, H - 44, 'Gerado em ' + fmtDate(today()), 9, false, '#d9c8ff');
  y = H - 88 - 24;

  /* ----- Resumo ----- */
  const bw = (CW - 20) / 3;
  const boxes = [['RECEITAS', R(b.income), C.green], ['DESPESAS', R(b.expense), C.red], ['SALDO DO MÊS', R(b.balance), b.balance >= 0 ? C.green : C.red]];
  boxes.forEach(([lab, val, color], i) => {
    const x = M + i * (bw + 10);
    RECT(x, y - 52, bw, 52, C.box);
    RECT(x, y - 52, 3, 52, color);
    T(x + 14, y - 19, lab, 8, true, C.muted);
    T(x + 14, y - 40, val, 15, true, color);
  });
  y -= 52 + 14;
  T(M, y - 8, `Despesas fixas pagas: ${R(b.fixedPaid)}   ·   Despesas variáveis: ${R(b.variable)}   ·   Fixas pendentes: ${R(b.fixedPending)}`, 9, false, C.muted);
  y -= 16;

  /* ----- Despesas por categoria ----- */
  const cats = {};
  tx.filter(t => t.type === 'despesa').forEach(t => {
    cats[t.cat] = (cats[t.cat] || 0) + cents(t.amount);
  });
  const catRows = Object.entries(cats).sort((a, b2) => b2[1] - a[1]).map(([name, v]) => [{
    t: name
  }, {
    t: (b.expense ? v / b.expense * 100 : 0).toFixed(1).replace('.', ',') + '%',
    color: C.muted
  }, {
    t: R(v),
    color: C.red,
    bold: true
  }]);
  section('Despesas por categoria');
  table([{
    x: M + 6,
    w: 260,
    label: 'CATEGORIA'
  }, {
    x: M + 400,
    w: 60,
    right: true,
    label: '% DAS DESPESAS'
  }, {
    x: W - M - 6,
    w: 110,
    right: true,
    label: 'VALOR'
  }], catRows, 'Nenhuma despesa neste mês.');

  /* ----- Lançamentos ----- */
  section('Lançamentos do mês');
  table([{
    x: M + 6,
    w: 56,
    label: 'DATA'
  }, {
    x: M + 66,
    w: 200,
    label: 'DESCRIÇÃO'
  }, {
    x: M + 272,
    w: 100,
    label: 'CATEGORIA'
  }, {
    x: M + 376,
    w: 62,
    label: 'TIPO'
  }, {
    x: W - M - 6,
    w: 100,
    right: true,
    label: 'VALOR'
  }], tx.map(t => [{
    t: fmtDate(t.date)
  }, {
    t: t.desc
  }, {
    t: t.cat,
    color: C.muted
  }, {
    t: t.type === 'receita' ? 'Receita' : t.kind === 'fixo' ? 'Desp. fixa' : 'Despesa',
    color: C.muted
  }, {
    t: (t.type === 'receita' ? '+ ' : '- ') + money(t.amount),
    color: t.type === 'receita' ? C.green : C.red,
    bold: true
  }]), 'Nenhum lançamento neste mês.');

  /* ----- Despesas fixas ----- */
  section('Despesas fixas');
  table([{
    x: M + 6,
    w: 190,
    label: 'CONTA'
  }, {
    x: M + 206,
    w: 100,
    label: 'CATEGORIA'
  }, {
    x: M + 316,
    w: 60,
    label: 'VENCE'
  }, {
    x: M + 376,
    w: 62,
    label: 'SITUAÇÃO'
  }, {
    x: W - M - 6,
    w: 100,
    right: true,
    label: 'VALOR'
  }], act.map(f => {
    const p = isPaid(f, m);
    return [{
      t: f.name
    }, {
      t: f.cat,
      color: C.muted
    }, {
      t: 'dia ' + Math.min(f.due, dim(m)),
      color: C.muted
    }, {
      t: p ? 'Pago' : 'Pendente',
      color: p ? C.green : C.red,
      bold: true
    }, {
      t: money(f.amount),
      bold: true
    }];
  }), 'Nenhuma despesa fixa cadastrada.');

  /* ----- Metas ----- */
  section('Metas (situação atual)');
  table([{
    x: M + 6,
    w: 165,
    label: 'META'
  }, {
    x: M + 285,
    w: 105,
    right: true,
    label: 'GUARDADO'
  }, {
    x: M + 385,
    w: 95,
    right: true,
    label: 'VALOR DA META'
  }, {
    x: M + 430,
    w: 40,
    right: true,
    label: '%'
  }, {
    x: M + 445,
    w: 70,
    label: 'PRAZO'
  }], appState.data.goals.map(g => [{
    t: g.name
  }, {
    t: money(g.saved)
  }, {
    t: money(g.target)
  }, {
    t: (g.target > 0 ? Math.min(100, g.saved / g.target * 100) : 0).toFixed(0) + '%',
    color: C.purple,
    bold: true
  }, {
    t: fmtDate(g.deadline),
    color: C.muted
  }]), 'Nenhuma meta criada.');

  /* ----- Rodapé de cada página ----- */
  pages.forEach((p, i) => {
    ops = p;
    RECT(M, 34, CW, 0.5, C.line);
    T(M, 20, 'GRANA · Gestão Financeira · ' + label, 8, false, C.muted);
    TR(W - M, 20, `Página ${i + 1} de ${pages.length}`, 8, false, C.muted);
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([pdfBuild(pages)], {
    type: 'application/pdf'
  }));
  a.download = 'grana-relatorio-' + m + '.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function initPdf() {

}



// Fonte: js/core/graficos.js

const palette = ['#a77bff', '#2ee6a0', '#ff5470', '#e0c27a', '#4fb3ff', '#e07fd0', '#5fd4c0', '#b9b6c9', '#f08a4b', '#7f96c9', '#c25bff', '#8fe36b'];

const FONT = "'Segoe UI',system-ui,Arial,sans-serif";

function setupCanvas(c) {
  const r = c.getBoundingClientRect();
  const d = window.devicePixelRatio || 1;
  if (r.width < 10) return null;
  c.width = r.width * d;
  c.height = r.height * d;
  const ctx = c.getContext('2d');
  ctx.setTransform(d, 0, 0, d, 0, 0);
  return {
    ctx,
    w: r.width,
    h: r.height
  };
}

function pie(id, items, legendId, label) {
  const c = $(id);
  if (!c) return;
  const s = setupCanvas(c);
  if (!s) return;
  const {
    ctx,
    w,
    h
  } = s;
  const total = items.reduce((a, b) => a + b.value, 0);
  const cx = w / 2,
    cy = h / 2;
  const r = Math.min(w, h) * .42,
    ri = r * .6;
  ctx.clearRect(0, 0, w, h);

  // Sem dados: anel cinza
  if (!total) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 7);
    ctx.arc(cx, cy, ri, 7, 0, true);
    ctx.fillStyle = '#ffffff0d';
    ctx.fill();
  }

  // Cada fatia
  let a = -Math.PI / 2;
  if (total) items.forEach((it, i) => {
    const v = it.value / total * Math.PI * 2;
    const col = it.color || palette[i % palette.length];
    ctx.beginPath();
    ctx.arc(cx, cy, r, a, a + v);
    ctx.arc(cx, cy, ri, a + v, a, true);
    ctx.closePath();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, col);
    g.addColorStop(1, col + '99');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = '#0b0911';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Porcentagem escrita na fatia (só se ela for grande o bastante)
    if (v / (Math.PI * 2) >= .06) {
      const m = a + v / 2,
        rr = (r + ri) / 2;
      ctx.fillStyle = '#fff';
      ctx.font = '700 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText((it.value / total * 100).toFixed(1).replace('.', ',') + '%', cx + Math.cos(m) * rr, cy + Math.sin(m) * rr + 4);
    }
    a += v;
  });

  // Total no centro da rosca
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f3f2f8';
  ctx.font = '600 16px ' + FONT;
  ctx.fillText(R(total), cx, cy + 2);
  ctx.fillStyle = '#9291a5';
  ctx.font = '11px ' + FONT;
  ctx.fillText(label || 'Total', cx, cy + 19);

  // Legenda
  if (legendId) {
    $(legendId).innerHTML = items.length ? items.map((it, i) => `<span><i class="dot" style="background:${it.color || palette[i % palette.length]}"></i>${esc(it.name)} · ${(it.value / total * 100).toFixed(1).replace('.', ',')}% · ${R(it.value)}</span>`).join('') : '<span>Sem dados neste período</span>';
  }
}

const short = c => {
  const v = c / 100;
  return v >= 1000 ? 'R$ ' + (v / 1000).toFixed(1).replace('.', ',') + 'k' : 'R$ ' + Math.round(v);
};

function bars(id, months) {
  const c = $(id);
  if (!c) return;
  const s = setupCanvas(c);
  if (!s) return;
  const {
    ctx,
    w,
    h
  } = s;
  ctx.clearRect(0, 0, w, h);
  const max = Math.max(100, ...months.flatMap(m => [m.in, m.out])) * 1.2;
  const left = 48,
    top = 14,
    bottom = h - 26,
    usable = bottom - top;
  ctx.font = '10px ' + FONT;

  // Linhas de grade e valores do eixo
  for (let i = 0; i <= 3; i++) {
    const y = top + usable * i / 3;
    ctx.strokeStyle = '#ffffff14';
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(w - 6, y);
    ctx.stroke();
    ctx.fillStyle = '#858498';
    ctx.textAlign = 'right';
    ctx.fillText(short(max * (1 - i / 3)), left - 6, y + 3);
  }

  // Duas barras por mês
  const grp = (w - left - 8) / months.length;
  const bw = Math.min(26, grp * .32);
  months.forEach((m, i) => {
    const x = left + i * grp + grp / 2 - bw - 2;
    [[m.in, '#2ee6a0', '#0f8a60', x], [m.out, '#ff5470', '#a02440', x + bw + 4]].forEach(([v, c1, c2, xx]) => {
      const bh = v / max * usable;
      const g = ctx.createLinearGradient(0, bottom - bh, 0, bottom);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      ctx.fillStyle = g;
      ctx.fillRect(xx, bottom - bh, bw, bh);
      if (v > 0) {
        ctx.fillStyle = '#e8e6f2';
        ctx.textAlign = 'center';
        ctx.fillText(short(v), xx + bw / 2, bottom - bh - 4);
      }
    });
    ctx.fillStyle = '#9998aa';
    ctx.textAlign = 'center';
    ctx.fillText(m.label, left + i * grp + grp / 2, bottom + 16);
  });
}

function sixMonths() {
  const [y, mo] = selectedMonth().split('-').map(Number);
  const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return Array.from({
    length: 6
  }, (_, i) => {
    const d = new Date(y, mo - 1 - 5 + i, 1);
    const key = d.getFullYear() + '-' + p2(d.getMonth() + 1);
    const tx = appState.data.transactions.filter(t => t.date.slice(0, 7) === key);
    return {
      label: names[d.getMonth()] + '/' + String(d.getFullYear()).slice(2),
      in: sumC(tx, t => t.type === 'receita'),
      out: sumC(tx, t => t.type === 'despesa')
    };
  });
}

function initGraficos() {

}



// Fonte: js/core/renderizacao.js

function renderCore() {
  const m = selectedMonth();
  const tx = monthTx();
  const b = budget(appState.data, m, today());

  // Despesas fixas válidas neste mês e seu total cadastrado
  const act = appState.data.fixed.filter(f => fixedActive(f, m));
  const fixedTotal = act.reduce((s, f) => s + cents(f.amount), 0);

  // Despesas do mês agrupadas por categoria (maior primeiro)
  const cats = {};
  tx.filter(t => t.type === 'despesa').forEach(t => {
    cats[t.cat] = (cats[t.cat] || 0) + cents(t.amount);
  });
  const catItems = Object.entries(cats).map(([name, value]) => ({
    name,
    value
  })).sort((a, b) => b.value - a.value);
  renderStats(b, tx, act, fixedTotal);
  if (appState.current === 'graficos') {
    pie('pieFull', catItems, 'pieLegendFull', 'Despesas');
    bars('barFull', sixMonths());
  }
  renderRecent(tx);
  renderDaily(b, m);
  renderHomeFixedDue(act, m);
  renderHomeGoals();
  renderTransactions(tx);
  renderFixed(act, m);
  renderAlerts(b, tx, act, m, catItems);
  renderGoals();
  if (appState.current === 'juros') {
    calcInterest();
    calcSaving();
  }
}

function renderHomeFixedDue(act, m) {
  const list = act.slice().sort((a, b) => Math.min(a.due, dim(m)) - Math.min(b.due, dim(m)));
  $('homeFixedDue').innerHTML = list.map(f => {
    const paid = isPaid(f, m);
    return `<div class="home-line ${paid ? 'paid' : ''}"><input class="check" type="checkbox" ${paid ? 'checked' : ''} onchange="markFixed(${f.id},this.checked)" aria-label="Marcar ${esc(f.name)} como paga"><div><strong>${esc(f.name)}</strong><small>Vence dia ${Math.min(f.due, dim(m))} · <span class="home-fixed-category">${esc(f.cat)}</span></small></div><span>${money(f.amount)}</span><span class="home-fixed-badge ${paid ? 'paid' : ''}">${paid ? 'PAGO' : 'PENDENTE'}</span></div>`;
  }).join('') || '<div class="empty">Nenhuma conta fixa cadastrada para este mês.</div>';
}

function renderHomeGoals() {
  const month = selectedMonth();
  $('homeGoals').innerHTML = appState.data.goals.map(g => {
    const gm = goalMonthly(g.target, g.saved, g.deadline, new Date());
    const pct = Math.min(100, g.target ? g.saved / g.target * 100 : 0);
    const contribution = g.contributions?.[month] ?? 0;
    const status = gm.remaining <= 0 ? 'Meta atingida' : gm.dleft < 0 ? 'Prazo vencido' : `Faltam ${money(gm.remaining)} · ${money(gm.monthly)}/mês`;
    return `<div class="home-goal"><div class="goalhead"><strong>${esc(g.name)}</strong><small>${pct.toFixed(0)}%</small></div><div class="progress"><span style="width:${pct}%"></span></div><div class="goalhead"><small>${money(g.saved)} de ${money(g.target)}</small><small>${esc(status)}</small></div><div class="home-goal-month"><small>${contribution ? 'Aporte de ' + month + ': ' + money(contribution) : 'Sem aporte em ' + month}</small></div><div class="home-goal-actions"><button class="btn" type="button" onclick="addGoalMonthly(${g.id})" ${contribution || gm.remaining <= 0 ? 'disabled' : ''}>Adicionar aporte mensal</button><button class="btn" type="button" onclick="openGoalContribution(${g.id})" ${gm.remaining <= 0 ? 'disabled' : ''}>Adicionar aporte mensal variável</button></div></div>`;
  }).join('') || '<div class="empty">Você ainda não criou metas.</div>';
}

function renderStats(b, tx, act, fixedTotal) {
  // Cada card: [título, valor, classe de cor, borda, legenda]
  const saldo = ['Saldo do mês', R(b.balance), b.balance >= 0 ? 'positive' : 'negative', 'bal', 'Receitas menos despesas pagas'];
  const receitas = ['Receitas', R(b.income), 'positive', 'inc', tx.filter(t => t.type === 'receita').length + ' entradas'];
  const despesas = ['Despesas', R(b.expense), 'negative', 'exp', tx.filter(t => t.type === 'despesa').length + ' saídas · fixas ' + R(b.fixedPaid) + ' · variáveis ' + R(b.variable)];
  const aPagar = ['Fixas a pagar', R(b.fixedPending), 'purple', 'bal', act.length + ' contas fixas · total ' + R(fixedTotal)];
  const fixas = ['Despesas fixas', R(fixedTotal), 'purple', 'bal', 'Pagas ' + R(fixedTotal - b.fixedPending) + ' · pendentes ' + R(b.fixedPending) + ' · ' + act.length + ' contas'];
  const html = arr => arr.map(x => `
    <div class="card ${x[3]}">
      <div class="stathead"><span>${x[0]}</span></div>
      <div class="value ${x[2]}">${x[1]}</div>
      <div class="sub">${x[4]}</div>
    </div>`).join('');
  $('stats').innerHTML = html([saldo, receitas, despesas, aPagar]);
  $('statsCharts').innerHTML = html([saldo, receitas, despesas, fixas]);
}

function renderRecent(tx) {
  $('recent').innerHTML = tx.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map(t => `
    <div class="transaction">
      <div class="txicon ${t.type === 'receita' ? 'positive' : 'negative'}">${t.type === 'receita' ? '↗' : '↘'}</div>
      <div class="txinfo">
        <strong>${esc(t.desc)}</strong>
        <small>${esc(t.cat)} · ${t.type === 'despesa' ? (t.kind === 'fixo' ? 'fixa' : 'variável') + ' · ' : ''}${fmtDate(t.date)}</small>
      </div>
      <div class="txamount ${t.type === 'receita' ? 'positive' : 'negative'}">${t.type === 'receita' ? '+' : '−'} ${money(t.amount)}</div>
    </div>`).join('') || '<div class="empty">Nenhum lançamento neste mês. Adicione sua primeira receita ou despesa.</div>';
}

function renderDaily(b, m) {
  const cm = monthNow();
  let value, info;
  if (m < cm) {
    value = '—';
    info = 'Mês encerrado. Saldo livre final: ' + R(b.free);
  } else {
    value = R(b.daily);
    info = `${R(Math.max(0, b.free))} livres no mês · ${b.days} dia(s) restantes` + (b.free < 0 ? ' · atenção: saldo livre negativo' : '');
  }
  const detail = `Variáveis: ${R(b.variable)}${m === cm ? ' (hoje ' + R(b.varToday) + ')' : ''} · Fixas pagas: ${R(b.fixedPaid)} · Fixas pendentes: ${R(b.fixedPending)}`;
  const pct = Math.max(0, Math.min(100, b.income ? b.free / b.income * 100 : 0));
  ['', '2'].forEach(k => {
    $('dailyValue' + k).textContent = value;
    $('dailyInfo' + k).textContent = info;
    $('dailySpent' + k).textContent = detail;
    $('dailyProgress' + k).style.width = pct + '%';
  });
}

function renderTransactions(tx) {
  const ft = $('filterType').value;
  const fc = $('filterCat').value;
  const list = tx.filter(t => (ft === 'todos' || t.type === ft) && (fc === 'todas' || t.cat === fc)).sort((a, b) => b.date.localeCompare(a.date));

  // Resumo do que está sendo exibido
  const entradas = sumC(list, t => t.type === 'receita');
  const saidas = sumC(list, t => t.type === 'despesa');
  $('txSummary').textContent = `${list.length} lançamento(s) · Entradas ${R(entradas)} · Saídas ${R(saidas)}`;
  $('txTable').innerHTML = list.map(t => `
    <tr>
      <td>${esc(t.desc)}<br><span class="muted">${esc(t.cat)}${t.type === 'despesa' ? ' · ' + (t.kind === 'fixo' ? 'fixa' : 'variável') : ''}</span></td>
      <td>${fmtDate(t.date)}</td>
      <td class="${t.type === 'receita' ? 'pos' : 'neg'}">${t.type === 'receita' ? '+' : '−'} ${money(t.amount)}</td>
      <td class="rowactions">
        ${t.fixedId || t.goalId ? '' : `<button onclick="openEditTx(${t.id})" title="Editar" aria-label="Editar lançamento">✎</button>`}
        <button onclick="removeTx(${t.id})" title="Excluir" aria-label="Excluir lançamento">×</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="4" class="empty">Nenhum lançamento encontrado com estes filtros.</td></tr>';
}

function renderFixed(act, m) {
  $('fixedList').innerHTML = act.map(f => {
    const p = isPaid(f, m);
    return `
    <div class="fixeditem ${p ? 'paid' : ''}">
      <input class="check" type="checkbox" ${p ? 'checked' : ''} onchange="markFixed(${f.id},this.checked)" aria-label="Marcar ${esc(f.name)} como paga">
      <div class="meta">
        <strong>${esc(f.name)}</strong>
        <small>${esc(f.cat)} · vence dia ${Math.min(f.due, dim(m))} · ${money(f.amount)}</small>
      </div>
      <span class="pill ${p ? 'ok' : 'bad'}">${p ? 'PAGO' : 'PENDENTE'}</span>
      <button class="btn" onclick="openEditFixed(${f.id})" title="Editar valor">Editar</button>
      <button class="btn" onclick="removeFixed(${f.id})" title="Excluir">×</button>
    </div>`;
  }).join('') || '<div class="empty">Cadastre suas contas recorrentes para acompanhar os vencimentos.</div>';
}

function renderAlerts(b, tx, act, m, catItems) {
  const cm = monthNow();
  const day = new Date().getDate();
  const al = [];

  // Contas fixas não pagas
  act.forEach(f => {
    if (isPaid(f, m)) return;
    const due = Math.min(f.due, dim(m));
    const diff = due - day;
    if (m < cm) {
      al.push(`<div class="alert">⚠ <b>${esc(f.name)}</b> não foi marcada como paga em ${fmtDate(dueDate(m, f.due))} · ${money(f.amount)}.</div>`);
    } else if (m === cm) {
      if (diff < 0) al.push(`<div class="alert">⚠ <b>${esc(f.name)}</b> venceu há ${-diff} dia(s) · ${money(f.amount)}.</div>`);else if (diff <= 5) al.push(`<div class="alert warn">◷ <b>${esc(f.name)}</b> vence ${diff === 0 ? 'hoje' : 'em ' + diff + ' dia(s)'} · ${money(f.amount)}.</div>`);
    }
  });

  // Despesas acima das receitas / mês fechando no negativo
  if (b.expense > b.income) al.push(`<div class="alert">⚠ Suas despesas superaram as receitas em ${R(b.expense - b.income)} neste mês.</div>`);else if (b.free < 0) al.push(`<div class="alert warn">Com as fixas pendentes, o mês fecha ${R(-b.free)} no negativo.</div>`);

  // Gasto alto: acima de R$ 500 ou 25% da receita do mês (o que for maior)
  const lim = Math.max(50000, b.income * .25);
  tx.filter(t => t.type === 'despesa' && cents(t.amount) >= lim).forEach(t => al.push(`<div class="alert warn">Gasto alto: <b>${esc(t.desc)}</b> · ${money(t.amount)}.</div>`));

  // Uma categoria ocupando mais de 40% das despesas
  if (catItems.length > 1 && b.expense > 0 && catItems[0].value / b.expense > .4) {
    al.push(`<div class="alert info">${esc(catItems[0].name)} concentra ${(catItems[0].value / b.expense * 100).toFixed(0)}% das despesas do mês.</div>`);
  }

  // Gasto de hoje acima da média diária prevista
  if (m === cm && b.days > 0 && b.varToday > 0) {
    const avg = (b.free + b.varToday) / b.days;
    if (avg > 0 && b.varToday > avg) al.push(`<div class="alert warn">Você já gastou hoje mais do que a média diária prevista (${R(avg)}).</div>`);
  }
  // Alertas de orçamento são centralizados nesta tela.
  if (typeof window.granaBudgetAlerts === 'function') {
    al.push(...window.granaBudgetAlerts(m));
  }
  $('alertsList').innerHTML = al.join('') || '<div class="empty">Tudo em ordem. Não há avisos para este período.</div>';
}

function renderGoals() {
  $('goalsList').innerHTML = appState.data.goals.map(g => {
    const gm = goalMonthly(g.target, g.saved, g.deadline, new Date());
    const pct = Math.min(100, g.saved / g.target * 100);
    const status = gm.remaining <= 0 ? 'Meta atingida' : gm.dleft < 0 ? 'Prazo vencido · faltam ' + money(gm.remaining) : money(gm.monthly) + '/mês';
    const restante = gm.dleft >= 0 ? ' · ' + (gm.months >= 1 ? gm.months.toFixed(1).replace('.', ',') + ' meses' : gm.dleft + ' dia(s)') + ' restantes' : '';
    return `
    <div class="goal">
      <div class="goalhead"><strong>${esc(g.name)}</strong><small>${pct.toFixed(0)}%</small></div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="goalhead"><small>${money(g.saved)} de ${money(g.target)}</small><small>${status}</small></div>
      <div class="sub" style="margin-top:6px">Prazo: ${fmtDate(g.deadline)}${restante}</div>
      <div class="goalactions">
        <button class="btn" onclick="openEditGoal(${g.id})">✎ Editar meta</button>
        <button class="btn" onclick="removeGoal(${g.id})">Excluir</button>
      </div>
    </div>`;
  }).join('') || '<div class="empty">Você ainda não criou metas.</div>';
}

const renderHooks = [];

function registerRenderHook(callback) { renderHooks.push(callback); }

function render() { renderCore(); for (const callback of renderHooks) callback(); }

function initRenderizacao() {

}



// Fonte: js/core/calculadoras.js

function calcInterest() {
  const p = Math.max(0, +$('principal').value || 0);
  const c = Math.max(0, +$('contribution').value || 0);
  const rm = monthlyRate(+$('rate').value, $('rateUnit').value);
  let n = Math.max(1, Math.round(+$('period').value || 1));
  if ($('periodUnit').value === 'anos') n *= 12;
  const r = compound(p, c, rm, n);
  $('interestTotal').textContent = money(r.fv);
  $('interestDetails').textContent = `Total investido: ${money(r.invested)} · Juros: ${money(r.interest)} · ${n} meses · taxa equivalente ${(rm * 100).toFixed(4).replace('.', ',')}% ao mês`;
  pie('interestPie', [{
    name: 'Capital + aportes',
    value: cents(r.invested),
    color: '#a77bff'
  }, {
    name: 'Juros',
    value: Math.max(0, cents(r.interest)),
    color: '#2ee6a0'
  }], 'interestLegend', 'Montante');
}

function calcSaving() {
  const target = Math.max(0, +$('sgTarget').value || 0);
  const p = Math.max(0, +$('sgStart').value || 0);
  const rm = monthlyRate(+$('sgRate').value, $('sgRateUnit').value);
  let n = Math.max(1, Math.round(+$('sgPeriod').value || 1));
  if ($('sgPeriodUnit').value === 'anos') n *= 12;
  const pmt = requiredContribution(target, p, rm, n);
  const r = compound(p, pmt, rm, n);
  $('sgResult').textContent = money(pmt);
  $('sgDetails').textContent = pmt === 0 && target > 0 ? 'O capital inicial, com os juros, já alcança o valor desejado no prazo.' : `Em ${n} meses você guarda ${money(r.invested)} do seu bolso e os juros somam ${money(r.interest)}.`;
  pie('sgPie', [{
    name: 'Capital + aportes',
    value: cents(r.invested),
    color: '#a77bff'
  }, {
    name: 'Juros',
    value: Math.max(0, cents(r.interest)),
    color: '#2ee6a0'
  }], 'sgLegend', 'Objetivo');
}

function initCalculadoras() {
$('interestForm').onsubmit = e => {
  e.preventDefault();
  calcInterest();
};
['principal', 'contribution', 'rate', 'rateUnit', 'period', 'periodUnit'].forEach(id => $(id).addEventListener('input', calcInterest));
$('savingForm').onsubmit = e => {
  e.preventDefault();
  calcSaving();
};
['sgTarget', 'sgStart', 'sgRate', 'sgRateUnit', 'sgPeriod', 'sgPeriodUnit'].forEach(id => $(id).addEventListener('input', calcSaving));
}



// Fonte: js/core/inicializacao.js



function initInicializacao() {
window.addEventListener('resize', () => {
  if (['graficos', 'juros'].includes(appState.current)) render();
});
$('monthFilter').value = monthNow();
$('txDate').value = today();
fillCats();
fillFilterCats();
previewGoal();
render();
}



// Fonte: js/core/auth.js

function validCpf(value) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(value[i]) * (length + 1 - i);
    const digit = (sum * 10 % 11) % 10;
    if (digit !== Number(value[length])) return false;
  }
  return true;
}
function profileValues(prefix) {
  const value = id => document.getElementById(prefix + id).value.trim();
  const profile = { nome: value('Name'), sobrenome: value('Surname'), nascimento: value('Birth'), cpf: value('Cpf').replace(/\D/g, '') };
  const date = new Date(profile.nascimento + 'T00:00:00');
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 16);
  if (profile.nome.length < 2 || profile.nome.length > 80 || profile.sobrenome.length < 2 || profile.sobrenome.length > 100) throw Error('Informe nome e sobrenome válidos.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.nascimento) || Number.isNaN(date.getTime()) || date.getFullYear() !== Number(profile.nascimento.slice(0,4)) || date.getMonth()+1 !== Number(profile.nascimento.slice(5,7)) || date.getDate() !== Number(profile.nascimento.slice(8,10)) || date > cutoff) throw Error('Informe uma data válida. Você precisa ter pelo menos 16 anos.');
  if (!validCpf(profile.cpf)) throw Error('O CPF informado é inválido.');
  return profile;
}
async function initAuth(onReady) {
  const $ = id => document.getElementById(id);
  const db = window.granaDB;
  let user = null, profile = null, epoch = 0, activeId = null;
  let completion = false;
  for (const id of ['registerBirth', 'registerCpf']) {
    $(id).closest('.auth-field').hidden = true;
    $(id).required = false;
  }
  let recovering = new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
  const recoveryForm = document.createElement('form');
  recoveryForm.hidden = true;
  recoveryForm.innerHTML = '<div class="auth-field"><label for="recoveryPassword">Nova senha</label><input id="recoveryPassword" type="password" autocomplete="new-password" minlength="6" required></div><p id="recoveryError" class="auth-error" role="alert" hidden></p><button class="btn primary" type="submit">Salvar nova senha</button>';
  $('registerForm').after(recoveryForm);
  const resetButton = document.createElement('button');
  resetButton.type = 'button'; resetButton.className = 'btn auth-forgot'; resetButton.textContent = 'Esqueci minha senha';
  $('loginForm').append(resetButton);
  const requestForm = document.createElement('form');
  requestForm.hidden = true;
  requestForm.innerHTML = '<div class="auth-field"><label for="resetEmail">E-mail da sua conta</label><input id="resetEmail" type="email" autocomplete="email" placeholder="voce@exemplo.com" required></div><p id="resetError" class="auth-error" role="alert" hidden></p><p id="resetStatus" class="auth-status" role="status" hidden></p><button class="btn primary auth-submit" type="submit">Enviar link de recuperação</button><button class="btn auth-back" type="button" id="resetBack">Voltar para entrar</button>';
  $('registerForm').after(requestForm);
  const recoveryGate = () => {
    gate(); requestForm.hidden = true; document.querySelector('.auth-switch').hidden = true; $('loginForm').hidden = true; $('registerForm').hidden = true; recoveryForm.hidden = false;
    $('authTitle').textContent = 'Redefina sua senha';
  };
  const message = (id, text) => { $(id).textContent = text; $(id).hidden = !text; };
  const errorText = error => error.code === '23505' ? 'Não foi possível salvar este CPF. Confira os dados ou entre em contato com o suporte.' : error.message || 'Não foi possível concluir. Tente novamente.';
  const run = (form, errorId, action) => form.addEventListener('submit', async event => {
    event.preventDefault(); message(errorId, '');
    const button = form.querySelector('[type=submit]'); button.disabled = true;
    try { await action(); } catch (error) { message(errorId, errorText(error)); }
    finally { button.disabled = false; }
  });
  const mode = register => {
    if (completion || recovering) return;
    requestForm.hidden = true; recoveryForm.hidden = true; document.querySelector('.auth-switch').hidden = false;
    $('authDesc').textContent = register ? 'Preencha seus dados para criar sua conta.' : 'Entre para acessar seu painel financeiro.';
    $('loginForm').hidden = register; $('registerForm').hidden = !register;
    $('authTitle').textContent = register ? 'Crie sua conta' : 'Bem-vindo';
    $('loginModeBtn').classList.toggle('active', !register); $('registerModeBtn').classList.toggle('active', register);
    $('loginModeBtn').setAttribute('aria-selected', String(!register)); $('registerModeBtn').setAttribute('aria-selected', String(register));
  };
  const gate = () => { document.body.classList.add('auth-required'); $('authGate').hidden = false; $('profileMenu').hidden = true; $('profileBtn').hidden = true; };
  const fill = prefix => { for (const [field, column] of Object.entries({Name:'nome',Surname:'sobrenome',Birth:'nascimento',Cpf:'cpf'})) $(prefix+field).value = profile?.[column] || ''; };
  const saveProfile = async values => {
    const id = user?.id, ticket = epoch;
    if (!id) throw Error('Entre novamente para salvar seu perfil.');
    const { data, error } = await db.from('perfis').update({...values, atualizado_em:new Date().toISOString()}).eq('id', id).select('id,nome,sobrenome,nascimento,cpf').single();
    if (error) throw error;
    if (ticket !== epoch) throw Error('Sua sessão mudou. Entre novamente.');
    profile = data;
  };
  const show = async session => {
    const ticket = ++epoch;
    if (activeId && session?.user?.id !== activeId) { location.reload(); return; }
    user = session?.user || null; gate();
    if (!user) return;
    if (recovering) { recoveryGate(); return; }
    const {data, error} = await db.from('perfis').select('id,nome,sobrenome,nascimento,cpf').eq('id', user.id).maybeSingle();
    if (ticket !== epoch) return;
    if (error) throw error;
    if (!data) throw Error('Perfil ausente. Solicite a execução do backfill de perfis no banco.');
    profile = data;
    completion = !data.nome || !data.sobrenome || !data.nascimento || !data.cpf;
    if (completion) {
      requestForm.hidden = true; recoveryForm.hidden = true;
      document.querySelector('.auth-switch').hidden = true;
      $('loginForm').hidden = true; $('registerForm').hidden = false;
      $('registerForm').querySelector('[type=submit]').textContent = 'Salvar perfil';
      $('authTitle').textContent = 'Complete seu perfil';
      $('authDesc').textContent = 'Salve seus dados para continuar.';
      fill('register');
      for (const id of ['registerBirth', 'registerCpf']) {
        $(id).closest('.auth-field').hidden = false;
        $(id).required = true;
      }
      for (const id of ['registerEmail','registerPassword']) { $(id).closest('.auth-field').hidden = true; $(id).required = false; $(id).value = ''; }
      return;
    }
    if (!activeId) { activeId = user.id; window.granaUserId = user.id; onReady(); }
    $('profileName').textContent = data.nome + ' ' + data.sobrenome; $('profileEmail').textContent = user.email;
    $('authGate').hidden = true; $('profileBtn').hidden = false; document.body.classList.remove('auth-required');
  };
  if (!db) { message('loginError','Não foi possível carregar o Supabase. Confira a conexão.'); return; }
  resetButton.onclick = () => {
    $('loginForm').hidden = true; $('registerForm').hidden = true;
    document.querySelector('.auth-switch').hidden = true;
    requestForm.hidden = false;
    $('authTitle').textContent = 'Recupere sua senha';
    $('authDesc').textContent = 'Informe seu e-mail para receber o link de recuperação.';
    $('resetEmail').value = $('loginEmail').value;
    message('resetError', ''); message('resetStatus', '');
    $('resetEmail').focus();
  };
  $('resetBack').onclick = () => { mode(false); $('loginEmail').focus(); };
  run(requestForm, 'resetError', async () => {
    message('resetStatus', '');
    if (!$('resetEmail').checkValidity()) throw Error('Informe um e-mail válido.');
    const {error} = await db.auth.resetPasswordForEmail($('resetEmail').value.trim(), {redirectTo:location.origin+location.pathname});
    if (error) throw error;
    message('resetStatus','Se houver uma conta para esse e-mail, você receberá as instruções.');
  });
  run(recoveryForm,'recoveryError',async () => {
    if ($('recoveryPassword').value.length < 6) throw Error('Use pelo menos 6 caracteres.');
    const {error} = await db.auth.updateUser({password:$('recoveryPassword').value});
    if(error) throw error;
    recoveryForm.reset(); recovering = false; recoveryForm.hidden = true;
    history.replaceState(null,'',location.pathname+location.search);
    await show({user});
  });
  $('loginModeBtn').onclick = () => mode(false); $('registerModeBtn').onclick = () => mode(true);
  run($('loginForm'), 'loginError', async () => {
    const {data,error} = await db.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});
    $('loginPassword').value = ''; if(error) throw error; await show(data.session);
  });
  run($('registerForm'), 'registerError', async () => {
    if (completion) {
      await saveProfile(profileValues('register'));
      await show({user});
      return;
    }
    const values = {nome:$('registerName').value.trim(), sobrenome:$('registerSurname').value.trim()};
    if (values.nome.length < 2 || values.nome.length > 80 || values.sobrenome.length < 2 || values.sobrenome.length > 100) throw Error('Informe nome e sobrenome válidos.');
    if (!$('registerEmail').checkValidity()) throw Error('Informe um e-mail válido.');
    if ($('registerPassword').value.length < 6) throw Error('Use pelo menos 6 caracteres na senha.');
    const {data,error} = await db.auth.signUp({email:$('registerEmail').value.trim(), password:$('registerPassword').value, options:{emailRedirectTo:location.origin+location.pathname, data:{nome:values.nome,sobrenome:values.sobrenome}}});
    $('registerPassword').value = ''; if(error) throw error;
    if(data.session) { await show(data.session); }
    else { $('registerForm').reset(); mode(false); message('loginError','Confira seu e-mail para confirmar o cadastro. Após entrar, complete CPF e nascimento.'); }
  });
  $('profileBtn').onclick = () => { $('profileMenu').hidden = !$('profileMenu').hidden; $('profileBtn').setAttribute('aria-expanded',String(!$('profileMenu').hidden)); };
  $('profileEditBtn').onclick = () => { fill('profileEdit'); $('profileEditForm').hidden = false; $('changePasswordForm').hidden = true; };
  $('cancelProfileBtn').onclick = () => { $('profileEditForm').hidden = true; $('profileEditForm').reset(); };
  run($('profileEditForm'),'profileEditError',async () => { await saveProfile(profileValues('profileEdit')); $('profileEditForm').hidden=true; await show({user}); });
  $('profilePasswordBtn').onclick = () => { $('changePasswordForm').hidden=false; $('profileEditForm').hidden=true; };
  $('cancelPasswordBtn').onclick = () => { $('changePasswordForm').hidden=true; $('changePasswordForm').reset(); };
  run($('changePasswordForm'),'changePasswordError',async () => {
    const {error:loginError}=await db.auth.signInWithPassword({email:user.email,password:$('currentPassword').value});
    if(loginError) throw loginError;
    const {error}=await db.auth.updateUser({password:$('newPassword').value}); if(error) throw error;
    $('changePasswordForm').reset(); $('changePasswordForm').hidden=true;
    askConfirm({title:'Senha alterada',message:'Sua senha foi atualizada.',single:true});
  });
  $('profileLogoutBtn').onclick = async () => {
    gate(); ++epoch;
    const {error}=await db.auth.signOut();
    if(error) { message('loginError',errorText(error)); return; }
    location.reload();
  };
  db.auth.onAuthStateChange((event,session) => {
    if(event==='SIGNED_OUT' || (activeId && session?.user?.id!==activeId)) { gate(); location.reload(); }
    if(event==='PASSWORD_RECOVERY') { recovering=true; user=session.user; setTimeout(recoveryGate,0); }
    if(event==='TOKEN_REFRESHED') user=session.user;
  });
  try { const {data,error}=await db.auth.getSession(); if(error) throw error; await show(data.session); }
  catch(error) { message('loginError',errorText(error)); }
}


// Fonte: js/features/cartoes-orcamentos.js

/* GRANA PLUS — módulos complementares isolados do código original. */
function initCartoesOrcamentos() {
  'use strict';

  const KEY = 'grana_prioridades_v1';
  const $p = id => document.getElementById(id);
  const brl = n => Number(n || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
  const escp = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  const ym = d => d.slice(0, 7);
  const addMonth = (m, n) => {
    const [y, mo] = m.split('-').map(Number);
    const d = new Date(y, mo - 1 + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  };
  const dueDate = (m, day) => {
    const [y, mo] = m.split('-').map(Number);
    return m + '-' + String(Math.min(day, new Date(y, mo, 0).getDate())).padStart(2, '0');
  };
  const selected = () => $p('monthFilter')?.value || ym(today());
  const uidp = () => Date.now() + Math.floor(Math.random() * 10000);
  const categories = ['Moradia', 'Alimentação', 'Transporte', 'Saúde', 'Educação', 'Lazer', 'Compras', 'Assinaturas', 'Contas', 'Pets', 'Impostos', 'Investimento', 'Outros'];
  const CARD_COLORS = ['#9a6bff', '#2ee6a0', '#4fb3ff', '#ff7aa2', '#e0c27a', '#ff8a4c', '#58d5c9', '#c47cff'];
  const cardColor = (card, index = 0) => card?.color || CARD_COLORS[(index < 0 ? 0 : index) % CARD_COLORS.length];
  const nextCardColor = () => CARD_COLORS.find(color => !state.cards.some(card => card.color === color)) || CARD_COLORS[state.cards.length % CARD_COLORS.length];
  const monthName = m => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric'
    });
  };
  let state = {
    cards: [],
    purchases: [],
    budgets: [],
    paidInvoices: []
  };
  try {
    const old = JSON.parse(userStorage.getItem(KEY) || 'null');
    if (old && typeof old === 'object') state = {
      cards: Array.isArray(old.cards) ? old.cards : [],
      purchases: Array.isArray(old.purchases) ? old.purchases : [],
      budgets: Array.isArray(old.budgets) ? old.budgets : [],
      paidInvoices: Array.isArray(old.paidInvoices) ? old.paidInvoices : []
    };
  } catch (_) {}
  // Repara vínculos incompletos, inclusive compras salvas pela versão antiga.
  let repaired = false;
  state.purchases.forEach(p => {
    const oldIds = Array.isArray(p.fixedIds) ? p.fixedIds : [];
    const ids = [];
    const card = state.cards.find(c => c.id === p.cardId);
    if (!p.cardColor) { p.cardColor = cardColor(card || {}, state.cards.indexOf(card)); repaired = true; }
    const parts = Math.max(1, Number(p.parts || 1));
    const partValue = Number(p.partValue ?? Math.floor(Number(p.amount) / parts * 100) / 100);
    for (let i = 0; i < parts; i++) {
      const month = addMonth(p.firstMonth || ym(p.date || today()), i);
      let fixed = appState.data.fixed.find(f => f.id === oldIds[i]) || appState.data.fixed.find(f => f.cardPurchaseId === p.id && f.start === month);
      if (!fixed) {
        const fixedId = oldIds[i] && !appState.data.fixed.some(f => f.id === oldIds[i]) ? oldIds[i] : uid();
        const paid = {};
        appState.data.transactions.filter(t => t.fixedId === fixedId).forEach(t => { paid[t.date.slice(0,7)] = true; });
        fixed = { id: fixedId, name: `fatura do mês ${monthName(month)} - cartão ${card?.name || 'removido'}`,
          amount: Math.round((i === parts-1 ? Number(p.amount)-partValue*(parts-1) : partValue)*100)/100,
          cat: p.category || 'Outros', due: Number(card?.due || 10), start: month, paid, cardPurchaseId: p.id };
        appState.data.fixed.push(fixed); repaired = true;
      }
      ids.push(fixed.id);
    }
    if (JSON.stringify(ids) !== JSON.stringify(oldIds)) { p.fixedIds = ids; repaired = true; }
  });
  function persist() {
    writeRecords({vertice_data: JSON.stringify(appState.data), [KEY]: JSON.stringify(state)});
  }
  if (repaired) persist();
  const save = () => {
    try { persist(); } catch (e) {
      askConfirm({title:'Não foi possível salvar', message:'Exporte um backup antes de fechar a página.', single:true});
    }
    window.render(); render();
  };
  function refreshCategories() {
    ['gpPurchaseCat','gpBudgetCat'].forEach(id => {
      const select = $p(id); if (!select) return;
      const previous = select.value;
      select.innerHTML = window.granaExpenseCategories().map(c => '<option>' + escp(c) + '</option>').join('');
      if (window.granaExpenseCategories().includes(previous)) select.value = previous;
    });
  }
  document.addEventListener('grana-categories-changed', refreshCategories);

  const nav = document.querySelector('.nav');
  nav.querySelector('[data-page="metas"]').insertAdjacentHTML('afterend', '<button type="button" data-page="prioridades" data-gp-nav="cards"><span class="ico gp-card-menu-icon"><img src="data:image/png;base64,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" alt="" aria-hidden="true"></span><span>Cartões de crédito</span></button><button type="button" data-page="prioridades" data-gp-nav="budgets"><span class="ico">◷</span><span>Orçamentos</span></button><button type="button" data-page="calendario" data-gp-nav="calendar"><span class="ico">▦</span><span>Calendário financeiro</span></button>');
  const main = document.querySelector('main.main');
  const page = document.createElement('section');
  page.className = 'page';
  page.id = 'prioridades';
  page.innerHTML = `
    <div class="sectiondesc">Organize seus cartões e defina limites de gastos por categoria. As compras parceladas também entram nas suas despesas fixas.</div>
    <div class="gp-summary" id="gpSummary"></div>
    <div class="gp-panel active" id="gp-cards">
      <button type="button" class="gp-toggle" id="gpShowCard"><span><b>＋ Cadastrar cartão</b><small>Adicione um cartão e informe limite, fechamento e vencimento.</small></span><span>⌄</span></button>
      <div class="gp-formbox" id="gpCardBox"><div class="card">
        <form id="gpCardForm"><input type="hidden" id="gpCardId"><div class="formgrid">
          <div class="field full"><label>Nome do cartão</label><input id="gpCardName" placeholder="Ex.: Cartão principal" required maxlength="50"></div>
          <div class="field"><label>Cor do cartão</label><input id="gpCardColor" class="gp-color-input" type="color" value="#9a6bff" title="Escolha a cor do cartão"></div>
          <div class="field"><label>Limite total (R$)</label><input id="gpCardLimit" type="number" min="0.01" step="0.01" required></div>
          <div class="field"><label>Dia de fechamento</label><input id="gpCardClose" type="hidden" value="20" required><button class="gp-day-trigger" type="button" data-day-input="gpCardClose"><span>Dia 20</span><span aria-hidden="true">▦</span></button></div>
          <div class="field"><label>Dia de vencimento</label><input id="gpCardDue" type="hidden" value="28" required><button class="gp-day-trigger" type="button" data-day-input="gpCardDue"><span>Dia 28</span><span aria-hidden="true">▦</span></button></div>
        </div><div class="formactions"><button class="btn primary" id="gpCardSave">Salvar cartão</button><button class="btn" type="button" id="gpCardCancel">Cancelar</button></div></form>
      </div></div>

      <button type="button" class="gp-toggle" id="gpShowPurchase" style="margin-top:12px"><span><b>＋ Registrar compra no cartão</b><small>Informe a compra, categoria e quantidade de parcelas.</small></span><span>⌄</span></button>
      <div class="gp-formbox" id="gpPurchaseBox"><div class="card">
        <form id="gpPurchaseForm"><div class="formgrid">
          <div class="field full"><label>Cartão</label><select id="gpPurchaseCard" required></select></div>
          <div class="field full"><label>Descrição da compra</label><input id="gpPurchaseDesc" placeholder="Ex.: Celular" required maxlength="70"></div>
          <div class="field"><label>Valor total (R$)</label><input id="gpPurchaseAmount" type="number" min="0.01" step="0.01" required></div>
          <div class="field"><label>Quantidade de parcelas</label><div class="gp-stepper"><button type="button" data-parts-step="-1" aria-label="Diminuir parcelas">−</button><input id="gpPurchaseParts" type="number" min="1" max="48" value="1" required><button type="button" data-parts-step="1" aria-label="Aumentar parcelas">＋</button></div></div>
          <div class="field"><label>Data da compra</label><input id="gpPurchaseDate" type="hidden" data-picker="date" value="${today()}" required></div>
          <div class="field"><label>Categoria</label><select id="gpPurchaseCat">${categories.map(c => `<option>${c}</option>`).join('')}</select></div>
        </div><div class="formactions"><button class="btn primary">Registrar compra</button><button class="btn" type="button" id="gpPurchaseCancel">Cancelar</button></div></form>
        <div class="gp-note">Cada parcela será cadastrada automaticamente em Despesas fixas, no mês em que vencer.</div>
      </div></div>

      <div class="card" style="margin-top:16px"><h3 class="sectiontitle">Meus cartões</h3><div class="sectiondesc">Acompanhe limite disponível e gerencie seus cartões.</div><div id="gpCardsList" class="gp-list"></div></div>
      <div class="card" style="margin-top:16px"><h3 class="sectiontitle">Compras parceladas e faturas</h3><div class="sectiondesc">Veja o mês atual e os dois próximos meses.</div><div id="gpInvoices"></div></div>
    </div>
    <div class="gp-panel" id="gp-budgets">
      <div class="card">
        <h3 class="sectiontitle">Seu planejamento de gastos</h3>
        <div class="sectiondesc">Escolha quanto deseja gastar em cada categoria. O GRANA acompanha suas despesas e avisa quando você chegar a 50%, 80% e 100% do limite.</div>
        <button type="button" class="gp-toggle" id="gpShowBudget" style="margin-top:14px"><span><b>＋ Definir orçamento</b><small>Crie ou atualize um limite mensal para uma categoria.</small></span><span>⌄</span></button>
        <div class="gp-formbox" id="gpBudgetBox"><form id="gpBudgetForm"><div class="formgrid">
          <div class="field"><label>Categoria</label><select id="gpBudgetCat">${categories.map(c => `<option>${c}</option>`).join('')}</select></div>
          <div class="field"><label>Limite mensal (R$)</label><input id="gpBudgetLimit" type="number" min="0.01" step="0.01" placeholder="Ex.: 500,00" required></div>
        </div><div class="formactions"><button class="btn primary">Salvar orçamento</button><button class="btn" type="button" id="gpBudgetCancel">Cancelar</button></div></form></div>
      </div>
      <div class="card" style="margin-top:14px"><h3 class="sectiontitle">Acompanhamento por categoria</h3><div class="sectiondesc">Os valores consideram os lançamentos de despesas do mês selecionado no topo.</div><div id="gpBudgetsList" class="gp-budget-grid" style="margin-top:14px"></div></div>
    </div>
  `;
  main.insertBefore(page, main.querySelector('.dock'));
  if (typeof window.granaEnhancePicker === 'function') window.granaEnhancePicker($p('gpPurchaseDate'));
  const dayModal = document.createElement('div');
  dayModal.className = 'gp-modal-backdrop';
  dayModal.hidden = true;
  dayModal.innerHTML = `<div class="gp-modal-card" role="dialog" aria-modal="true" aria-labelledby="gpDayTitle">
    <h3 class="sectiontitle" id="gpDayTitle">Selecionar dia</h3>
    <div class="sectiondesc">Escolha um dia entre 1 e 31.</div>
    <div class="gp-day-grid">${Array.from({ length: 31 }, (_, i) => `<button type="button" data-day="${i + 1}">${i + 1}</button>`).join('')}</div>
    <div class="formactions"><button class="btn" type="button" data-day-cancel>Cancelar</button></div>
  </div>`;
  document.body.appendChild(dayModal);
  let activeDayInput = null;
  function refreshDayTriggers() {
    page.querySelectorAll('[data-day-input]').forEach(button => {
      const input = $p(button.dataset.dayInput);
      button.firstElementChild.textContent = 'Dia ' + input.value;
    });
  }
  function closeDayPicker() {
    dayModal.hidden = true;
    activeDayInput = null;
  }
  page.addEventListener('click', event => {
    const trigger = event.target.closest('[data-day-input]');
    if (!trigger) return;
    activeDayInput = $p(trigger.dataset.dayInput);
    dayModal.querySelectorAll('[data-day]').forEach(button => button.classList.toggle('selected', button.dataset.day === activeDayInput.value));
    dayModal.hidden = false;
    dayModal.querySelector('[data-day].selected, [data-day]').focus();
  });
  dayModal.addEventListener('click', event => {
    const option = event.target.closest('[data-day]');
    if (option && activeDayInput) {
      activeDayInput.value = option.dataset.day;
      refreshDayTriggers();
      closeDayPicker();
    } else if (event.target === dayModal || event.target.closest('[data-day-cancel]')) closeDayPicker();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !dayModal.hidden) closeDayPicker();
  });
  refreshDayTriggers();
  if (typeof titles === 'object') titles.prioridades = 'Cartões de crédito';
  function goPlus() {
    if (typeof showPage === 'function') showPage('prioridades');else {
      document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === 'prioridades'));
      $p('pageTitle').textContent = 'Cartões e orçamentos';
    }
    render();
  }
  function openPlusSection(section, button) {
    goPlus();
    page.querySelectorAll('.gp-panel').forEach(x => x.classList.toggle('active', x.id === 'gp-' + section));
    nav.querySelectorAll('[data-gp-nav]').forEach(x => x.classList.toggle('active', x === button));
    $p('pageTitle').textContent = section === 'cards' ? 'Cartões de crédito' : 'Orçamentos';
    render();
  }
  nav.querySelectorAll('[data-gp-nav]').forEach(b => b.addEventListener('click', () => openPlusSection(b.dataset.gpNav, b)));
  document.querySelectorAll('.nav button[data-page]:not([data-gp-nav])').forEach(b => b.addEventListener('click', () => {
    if (typeof appState.current !== 'undefined' && appState.current === 'prioridades') appState.current = b.dataset.page;
  }));
  function toggleBox(button, box) {
    $p(button).addEventListener('click', () => {
      $p(box).classList.toggle('open');
    });
  }
  toggleBox('gpShowCard', 'gpCardBox');
  toggleBox('gpShowPurchase', 'gpPurchaseBox');
  toggleBox('gpShowBudget', 'gpBudgetBox');
  ['gpCardCancel', 'gpPurchaseCancel', 'gpBudgetCancel'].forEach(id => $p(id).addEventListener('click', () => {
    const box = id === 'gpCardCancel' ? 'gpCardBox' : id === 'gpPurchaseCancel' ? 'gpPurchaseBox' : 'gpBudgetBox';
    $p(box).classList.remove('open');
  }));
  $p('gpCardForm').addEventListener('submit', e => {
    e.preventDefault();
    const id = Number($p('gpCardId').value);
    const previous = state.cards.find(c => c.id === id);
    const card = {
      id: id || uidp(),
      name: $p('gpCardName').value.trim(),
      limit: Number($p('gpCardLimit').value),
      close: Number($p('gpCardClose').value),
      due: Number($p('gpCardDue').value),
      color: $p('gpCardColor').value || (previous ? cardColor(previous, state.cards.indexOf(previous)) : nextCardColor())
    };
    if (!(card.limit > 0)) return;
    if (id) {
      const i = state.cards.findIndex(c => c.id === id);
      if (i >= 0) state.cards[i] = card;
    } else state.cards.push(card);
    e.target.reset();
    $p('gpCardId').value = '';
    $p('gpCardClose').value = 20;
    $p('gpCardDue').value = 28;
    $p('gpCardColor').value = nextCardColor();
    refreshDayTriggers();
    $p('gpCardBox').classList.remove('open');
    $p('gpCardSave').textContent = 'Salvar cartão';
    save();
  });
  $p('gpPurchaseForm').addEventListener('click', e => {
    const b = e.target.closest('[data-parts-step]');
    if (!b) return;
    const input = $p('gpPurchaseParts');
    const next = Math.max(1, Math.min(48, Number(input.value || 1) + Number(b.dataset.partsStep)));
    input.value = next;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  $p('gpPurchaseForm').addEventListener('submit', e => {
    e.preventDefault();
    const cardId = Number($p('gpPurchaseCard').value);
    if (!state.cards.some(c => c.id === cardId)) {
      void askConfirm({ title: 'Cartão necessário', message: 'Cadastre ou selecione um cartão antes de registrar a compra.', single: true });
      return;
    }
    const amount = Number($p('gpPurchaseAmount').value),
      parts = Math.max(1, Math.min(48, Number($p('gpPurchaseParts').value) || 1));
    if (!(amount > 0)) return;
    const date = $p('gpPurchaseDate').value,
      card = state.cards.find(c => c.id === cardId);
    const [y, mo, day] = date.split('-').map(Number);
    // Compras após o fechamento entram na fatura seguinte.
    const firstMonth = day > card.close ? addMonth(ym(date), 1) : ym(date);
    const partValue = Math.floor(amount / parts * 100) / 100;
    const purchase = {
      id: uidp(),
      cardId,
      desc: $p('gpPurchaseDesc').value.trim(),
      amount,
      parts,
      date,
      firstMonth,
      partValue,
      cardColor: cardColor(card, state.cards.indexOf(card)),
      category: $p('gpPurchaseCat').value,
      fixedIds: []
    };
    state.purchases.push(purchase);
    // Uma despesa fixa vinculada para cada parcela, no mês de sua fatura.
    for (let i = 0; i < parts; i++) {
      const m = addMonth(firstMonth, i);
      const fixedId = uid();
      appState.data.fixed.push({
        id: fixedId,
        name: `fatura do mês ${monthName(m)} - cartão ${card.name}`,
        amount: Math.round((i === parts - 1 ? amount - partValue * (parts - 1) : partValue) * 100) / 100,
        cat: purchase.category,
        due: card.due,
        start: m,
        paid: {},
        cardPurchaseId: purchase.id
      });
      purchase.fixedIds.push(fixedId);
    }
    e.target.reset();
    $p('gpPurchaseDate').value = today();
    $p('gpPurchaseParts').value = 1;
    $p('gpPurchaseBox').classList.remove('open');
    if (typeof save === 'function') save();
    render();
  });
  $p('gpBudgetForm').addEventListener('submit', e => {
    e.preventDefault();
    const category = $p('gpBudgetCat').value,
      limit = Number($p('gpBudgetLimit').value),
      month = selected();
    if (!(limit > 0)) return;
    const found = state.budgets.find(b => b.category === category && b.month === month);
    if (found) found.limit = limit;else state.budgets.push({
      id: uidp(),
      category,
      month,
      limit
    });
    e.target.reset();
    $p('gpBudgetBox').classList.remove('open');
    save();
  });
  function invoicesForMonth(month) {
    const rows = [];
    state.purchases.forEach(p => {
      for (let i = 0; i < p.parts; i++) {
        const m = addMonth(p.firstMonth, i);
        if (m === month) rows.push({
          purchase: p,
          part: i + 1,
          value: i === p.parts - 1 ? Math.round((p.amount - p.partValue * (p.parts - 1)) * 100) / 100 : p.partValue
        });
      }
    });
    return rows;
  }
  function removePurchase(p) {
    const ids = Array.isArray(p.fixedIds) ? p.fixedIds : [];
    // Remove também os lançamentos gerados pelas parcelas, caso já tenham sido marcados como pagos.
    appState.data.transactions = appState.data.transactions.filter(t => !ids.includes(t.fixedId));
    appState.data.fixed = appState.data.fixed.filter(f => !ids.includes(f.id));
    state.purchases = state.purchases.filter(x => x.id !== p.id);
  }
  async function action(action, id) {
    const n = Number(id);
    if (action === 'delete-card') {
      if (state.purchases.some(p => p.cardId === n)) {
        void askConfirm({ title: 'Cartão com compras', message: 'Exclua as compras vinculadas antes de remover este cartão.', single: true });
        return;
      }
      const card = state.cards.find(c => c.id === n);
      if (await askConfirm({
        title: 'Excluir cartão',
        message: 'Deseja realmente excluir este cartão?',
        detail: card ? `${card.name} · Limite ${brl(card.limit)}` : '',
        confirmText: 'Excluir', danger: true
      })) state.cards = state.cards.filter(c => c.id !== n);
    } else if (action === 'edit-card') {
      const c = state.cards.find(x => x.id === n);
      if (!c) return;
      $p('gpCardId').value = c.id;
      $p('gpCardName').value = c.name;
      $p('gpCardLimit').value = c.limit;
      $p('gpCardClose').value = c.close;
      $p('gpCardDue').value = c.due;
      $p('gpCardColor').value = cardColor(c, state.cards.indexOf(c));
      refreshDayTriggers();
      $p('gpCardSave').textContent = 'Salvar alterações';
      $p('gpCardBox').classList.add('open');
      $p('gpCardName').focus();
    } else if (action === 'delete-purchase') {
      const p = state.purchases.find(x => x.id === n);
      if (p && await askConfirm({
        title: 'Excluir compra',
        message: 'As parcelas correspondentes também serão removidas das despesas fixas.',
        detail: `${p.desc} · ${brl(p.amount)} · ${p.parts} parcela(s)`,
        confirmText: 'Excluir', danger: true
      })) removePurchase(p);
    } else if (action === 'invoice-toggle') {
      const key = String(id);
      state.paidInvoices = state.paidInvoices || [];
      state.paidInvoices = state.paidInvoices.includes(key) ? state.paidInvoices.filter(x => x !== key) : [...state.paidInvoices, key];
    } else if (action === 'delete-budget') {
      state.budgets = state.budgets.filter(b => b.id !== n);
    }
    save();
  }
  page.addEventListener('click', e => {
    const b = e.target.closest('[data-gp-action]');
    if (b) void action(b.dataset.gpAction, b.dataset.id);
  });
  function renderCards() {
    $p('gpPurchaseCard').innerHTML = state.cards.map(c => `<option value="${c.id}">${escp(c.name)}</option>`).join('') || '<option value="">Cadastre um cartão primeiro</option>';
    $p('gpCardsList').innerHTML = state.cards.map((c, index) => {
      const now = ym(today());
      const used = state.purchases.filter(p => p.cardId === c.id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const available = c.limit - used,
        pct = c.limit ? Math.min(100, used / c.limit * 100) : 0;
      const color = cardColor(c, index);
      return `<div class="gp-item gp-credit-card" style="--card-color:${color}">
        <div class="gp-card-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.5h19M6 15h4"/></svg></div>
        <div class="gp-meta"><strong class="gp-card-title">${escp(c.name)}</strong><span class="gp-card-badge">CARTÃO DE CRÉDITO</span><small>Limite ${brl(c.limit)} · Utilizado ${brl(used)} · Disponível ${brl(available)}<br>Fecha dia ${c.close} · Vence dia ${c.due}<div class="gp-bar"><span class="gp-limit-fill" data-width="${pct}%"></span></div></small></div>
        <span class="gp-status ${available >= 0 ? 'ok' : 'bad'}">${pct.toFixed(0)}% usado</span><div class="gp-actions"><button class="btn" data-gp-action="edit-card" data-id="${c.id}">Editar</button><button class="btn" data-gp-action="delete-card" data-id="${c.id}">Excluir</button></div></div>`;
    }).join('') || '<div class="empty">Nenhum cartão cadastrado. Use o botão acima para adicionar o primeiro.</div>';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $p('gpCardsList').querySelectorAll('.gp-limit-fill').forEach(bar => { bar.style.width = bar.dataset.width; });
    }));
    const months = [ym(today()), addMonth(ym(today()), 1), addMonth(ym(today()), 2)];
    const monthSections = months.map(m => {
      const rows = invoicesForMonth(m);
      if (!rows.length) return '';
      const total = rows.reduce((s, r) => s + r.value, 0);
      const details = rows.map(r => { const usedCard = state.cards.find(c => c.id === r.purchase.cardId); const usedColor = r.purchase.cardColor || cardColor(usedCard || {}, state.cards.indexOf(usedCard)); return `<div class="gp-item"><div class="gp-meta"><strong class="gp-purchase-desc">${escp(r.purchase.desc)}</strong><small class="gp-purchase-card-label" style="--purchase-color:${usedColor}"><i class="gp-purchase-card-dot" aria-hidden="true"></i>${escp(usedCard?.name || 'Cartão removido')} · parcela ${r.part}/${r.purchase.parts}</small></div><strong>${brl(r.value)}</strong></div>`; }).join('');
      return `<section class="gp-month-section"><div class="gp-month-heading"><span class="gp-month-badge">${escp(monthName(m))}</span><strong>${brl(total)}</strong></div>${details}</section>`;
    }).join('');
    const noUpcoming = monthSections ? '' : `<div class="gp-all-clear"><div class="gp-clear-icon">✓</div><strong>Tudo certo por aqui!</strong><span>Você não tem parcelas ou faturas previstas para os próximos três meses.</span></div>`;
    $p('gpInvoices').innerHTML = noUpcoming + monthSections;
    const all = state.purchases.map(p => { const usedCard = state.cards.find(c => c.id === p.cardId); const usedColor = p.cardColor || cardColor(usedCard || {}, state.cards.indexOf(usedCard)); return `<div class="gp-item"><div class="gp-meta"><strong class="gp-purchase-desc">${escp(p.desc)}</strong><small class="gp-purchase-card-label" style="--purchase-color:${usedColor}"><i class="gp-purchase-card-dot" aria-hidden="true"></i>${escp(usedCard?.name || 'Cartão removido')} · ${p.parts} parcela(s) · ${escp(p.category)}</small></div><strong>${brl(p.amount)}</strong><button class="btn" data-gp-action="delete-purchase" data-id="${p.id}">Excluir</button></div>`; }).join('');
    if (all) $p('gpInvoices').innerHTML += '<h4 class="sectiontitle" style="margin-top:18px">Todas as compras</h4>' + all;
  }
  function budgetAlertItems(month) {
    const tx = typeof appState.data !== 'undefined' && Array.isArray(appState.data.transactions) ? appState.data.transactions : [];
    return state.budgets.filter(b => b.month === month).flatMap(b => {
      const spent = tx.filter(t => t.type === 'despesa' && t.cat === b.category && t.date?.slice(0, 7) === month).reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const pct = b.limit ? spent / b.limit * 100 : 0;
      if (pct >= 100) return [`<div class="alert">⚠ Orçamento de <b>${escp(b.category)}</b> atingido: ${brl(spent)} de ${brl(b.limit)}.</div>`];
      if (pct >= 80) return [`<div class="alert warn">⚠ Orçamento de <b>${escp(b.category)}</b> em ${pct.toFixed(0)}%: ${brl(spent)} de ${brl(b.limit)}.</div>`];
      if (pct >= 50) return [`<div class="alert info">◷ Orçamento de <b>${escp(b.category)}</b> em ${pct.toFixed(0)}%: ${brl(spent)} de ${brl(b.limit)}.</div>`];
      return [];
    });
  }
  window.granaBudgetAlerts = budgetAlertItems;
  function renderBudgets() {
    const month = selected();
    const tx = typeof appState.data !== 'undefined' && Array.isArray(appState.data.transactions) ? appState.data.transactions : [];
    const list = state.budgets.filter(b => b.month === month);
    const cards = list.map(b => {
      const spent = tx.filter(t => t.type === 'despesa' && t.cat === b.category && t.date?.slice(0, 7) === month).reduce((s, t) => s + Number(t.amount || 0), 0);
      const pct = b.limit ? spent / b.limit * 100 : 0;
      const status = pct >= 100 ? 'Limite atingido' : pct >= 80 ? 'Atenção: perto do limite' : pct >= 50 ? 'Metade do orçamento utilizado' : 'Dentro do planejado';
      const color = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--gold)' : 'linear-gradient(90deg,#9a6bff,#2ee6a0)';
      return `<div class="gp-budget-card"><div class="gp-budget-head"><strong>${escp(b.category)}</strong><span class="gp-status ${pct >= 100 ? 'bad' : pct >= 50 ? 'warn' : 'ok'}">${pct.toFixed(0)}%</span></div><div class="gp-bar"><span style="width:${Math.min(100, pct)}%;background:${color}"></span></div><div style="display:flex;justify-content:space-between;gap:8px;font-size:11px"><span>Gasto: <b>${brl(spent)}</b></span><span>Limite: <b>${brl(b.limit)}</b></span></div><div class="gp-note">${pct >= 100 ? 'Você ultrapassou o limite em ' + brl(spent - b.limit) : 'Restam ' + brl(Math.max(0, b.limit - spent)) + ' neste mês.'} · ${status}</div><button class="btn" data-gp-action="delete-budget" data-id="${b.id}" style="margin-top:10px">Excluir orçamento</button></div>`;
    }).join('');
    $p('gpBudgetsList').innerHTML = cards || '<div class="empty">Você ainda não definiu orçamentos para este mês. Clique em “Definir orçamento” para começar.</div>';
  }
  function render() {
    const month = selected();
    const rows = invoicesForMonth(month),
      total = rows.reduce((s, r) => s + r.value, 0);
    $p('gpSummary').innerHTML = `<div class="card"><div class="stathead">Cartões cadastrados</div><div class="value purple">${state.cards.length}</div><div class="sub">Cartões sob controle</div></div><div class="card"><div class="stathead">Compras na fatura do mês selecionado</div><div class="value negative">${brl(total)}</div><div class="sub">${escp(monthName(month))}</div></div>`;
    renderCards();
    renderBudgets();
  }
  $p('monthFilter').addEventListener('change', render);
  refreshCategories();
  render();
}



// Fonte: js/features/calendario-privacidade-excel.js

/* GRANA — calendário, privacidade e exportação Excel */
function initCalendarioPrivacidadeExcel() {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
  const money = v => Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
  const dateNow = new Date();
  const ymNow = () => `${dateNow.getFullYear()}-${String(dateNow.getMonth() + 1).padStart(2, '0')}`;
  const plusMonth = (ym, n) => {
    let [y, m] = ym.split('-').map(Number);
    let d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const monthLabel = ym => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
  const root = document.querySelector('.main');
  const nav = document.querySelector('.nav');

  const cal = document.createElement('section');
  cal.className = 'page';
  cal.id = 'calendario';
  cal.innerHTML = `<div class="card"><div class="cal-head"><div><h3 class="sectiontitle">Calendário financeiro</h3><div class="sectiondesc">Visualize lançamentos e vencimentos ao longo do mês.</div></div><div style="display:flex;gap:7px"><button class="btn" id="calPrev" type="button">‹</button><button class="btn" id="calToday" type="button">Hoje</button><button class="btn" id="calNext" type="button">›</button></div></div><h3 id="calMonth" style="text-transform:capitalize;margin-top:14px"></h3><div class="cal-week"><span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span></div><div class="cal-wrap" id="calGrid"></div><div class="sectiondesc" style="margin-top:12px">As despesas fixas aparecem pela data de vencimento; lançamentos aparecem pela data registrada.</div></div>`;
  root.insertBefore(cal, root.querySelector('.dock'));
  let calMonth = ymNow();
  function getData() {
    return typeof appState.data !== 'undefined' ? appState.data : {
      transactions: [],
      fixed: []
    };
  }
  function calendarEvents(ym) {
    const d = getData(),
      map = {};
    const add = (day, item) => {
      (map[day] ??= []).push(item);
    };
    (d.transactions || []).forEach(t => {
      if (t.fixedId && d.fixed.some(f => f.id === t.fixedId && fixedActive(f, ym))) return;
      if (t.date?.slice(0, 7) === ym) add(Number(t.date.slice(8, 10)), {
        label: t.desc || t.description || t.cat || 'Lançamento',
        amount: t.amount,
        type: t.type === 'receita' ? 'income' : 'expense'
      });
    });
    (d.fixed || []).forEach(f => {
      if (fixedActive(f, ym)) {
        const day = Math.min(dim(ym), Math.max(1, Number(f.due) || 1));
        add(day, {
          label: f.name || 'Despesa fixa',
          amount: f.amount,
          type: 'expense',
          paid: !!(f.paid && f.paid[ym])
        });
      }
    });
    return map;
  }
  function renderCalendar() {
    const [y, m] = calMonth.split('-').map(Number),
      first = new Date(y, m - 1, 1),
      offset = first.getDay(),
      days = new Date(y, m, 0).getDate(),
      prevDays = new Date(y, m - 1, 0).getDate(),
      events = calendarEvents(calMonth),
      todayKey = ymNow();
    $('calMonth').textContent = monthLabel(calMonth);
    let html = '';
    for (let i = 0; i < 42; i++) {
      let day,
        other = false,
        month = calMonth;
      if (i < offset) {
        day = prevDays - offset + i + 1;
        month = plusMonth(calMonth, -1);
        other = true;
      } else if (i >= offset + days) {
        day = i - offset - days + 1;
        month = plusMonth(calMonth, 1);
        other = true;
      } else day = i - offset + 1;
      const key = `${month}-${String(day).padStart(2, '0')}`,
        items = calendarEvents(month)[day] || [];
      html += `<div class="cal-day ${other ? 'muted' : ''} ${key === `${dateNow.getFullYear()}-${String(dateNow.getMonth() + 1).padStart(2, '0')}-${String(dateNow.getDate()).padStart(2, '0')}` ? 'today' : ''}"><div class="cal-daynum">${day}</div>${items.slice(0, 3).map(e => `<div class="cal-event ${e.type}" title="${esc(e.label)} · ${money(e.amount)}">${esc(e.label)}<br><b>${money(e.amount)}</b>${e.paid ? ' · pago' : ''}</div>`).join('')}${items.length > 3 ? `<small>+${items.length - 3} eventos</small>` : ''}</div>`;
    }
    $('calGrid').innerHTML = html;
    if (typeof protectTooltips === 'function' && document.body.classList.contains('privacy-mode')) protectTooltips();
  }
  $('calPrev').onclick = () => {
    calMonth = plusMonth(calMonth, -1);
    renderCalendar();
  };
  $('calNext').onclick = () => {
    calMonth = plusMonth(calMonth, 1);
    renderCalendar();
  };
  $('calToday').onclick = () => {
    calMonth = ymNow();
    renderCalendar();
  };
  // Navigation: calendar shares the single PLANEJAMENTO group.
  const calNav = nav.querySelector('[data-page="calendario"]');
  if (calNav) calNav.addEventListener('click', () => {
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'calendario'));
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === calNav));
    $('pageTitle').textContent = 'Calendário financeiro';
    renderCalendar();
  });
  // Privacy mode uses the familiar bank eye icon and persists only as a UI preference.
  const privacyKey = 'grana_privacy_mode';
  let hidden = userStorage.getItem(privacyKey) === '1';
  function protectTooltips() {
    document.querySelectorAll('.cal-event').forEach(el => {
      if (hidden && el.hasAttribute('title')) { el.dataset.privateTitle = el.title; el.removeAttribute('title'); }
      else if (!hidden && el.dataset.privateTitle) { el.title = el.dataset.privateTitle; delete el.dataset.privateTitle; }
    });
  }
  function setPrivacy() {
    protectTooltips();
    document.body.classList.toggle('privacy-mode', hidden);
    $('privacyIcon').innerHTML = hidden ? '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5 0 8.5 4.2 9.5 7-.4 1.1-1.2 2.2-2.2 3.2M6.2 6.2C3.9 7.6 2.8 9.6 2.5 12c.8 2.4 4.3 7 9.5 7 1.2 0 2.3-.2 3.3-.7"/></svg>' : '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
    $('privacyToggle').title = hidden ? 'Mostrar valores' : 'Ocultar valores';
    $('privacyToggle').setAttribute('aria-label', $('privacyToggle').title);
    userStorage.setItem(privacyKey, hidden ? '1' : '0');
  }
  $('privacyToggle').onclick = () => {
    hidden = !hidden;
    setPrivacy();
  };
  setPrivacy();
  // Excel-compatible workbook with two worksheets: all transactions and selected-month summary.
  function excelCell(v) {
    return `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  }
  function excelNumber(v) {
    return `<Cell><Data ss:Type="Number">${Number(v) || 0}</Data></Cell>`;
  }
  function downloadExcel() {
    const d = getData(),
      tx = d.transactions || [],
      selected = $('monthFilter')?.value || ymNow(),
      rows = tx.map(t => `<Row>${excelCell(t.date || '')}${excelCell(t.type === 'receita' ? 'Receita' : 'Despesa')}${excelCell(t.desc || t.description || '')}${excelCell(t.cat || '')}${excelNumber(t.amount)}</Row>`).join('');
    const monthRows = tx.filter(t => t.date?.slice(0, 7) === selected),
      income = monthRows.filter(t => t.type === 'receita').reduce((a, t) => a + Number(t.amount || 0), 0),
      expense = monthRows.filter(t => t.type === 'despesa').reduce((a, t) => a + Number(t.amount || 0), 0);
    const summary = `<Row>${excelCell('Mês')}${excelCell(selected)}</Row><Row>${excelCell('Receitas')}${excelNumber(income)}</Row><Row>${excelCell('Despesas')}${excelNumber(expense)}</Row><Row>${excelCell('Saldo')}${excelNumber(income - expense)}</Row><Row>${excelCell('Quantidade de lançamentos')}${excelNumber(monthRows.length)}</Row>`;
    const workbook = `<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Lancamentos"><Table><Row>${['Data', 'Tipo', 'Descrição', 'Categoria', 'Valor (R$)'].map(excelCell).join('')}</Row>${rows}</Table></Worksheet><Worksheet ss:Name="Relatorio mensal"><Table><Row>${excelCell('Indicador')}${excelCell('Valor')}</Row>${summary}</Table></Worksheet></Workbook>`;
    const blob = new Blob(['\ufeff', workbook], {
        type: 'application/vnd.ms-excel;charset=utf-8'
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = `GRANA_relatorio_${selected}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }
  $('expExcel').addEventListener('click', () => {
    closeModal('exportModal');
    downloadExcel();
  });
  // Budget edit/delete confirmation cards.
  const budgetList = $('gpBudgetsList');
  function budgetModal(title, body, buttons) {
    const el = document.createElement('div');
    el.className = 'gp-modal-backdrop';
    el.innerHTML = `<div class="gp-modal-card" role="dialog" aria-modal="true"><h3 class="sectiontitle">${title}</h3>${body}<div class="formactions" style="margin-top:18px">${buttons}</div></div>`;
    document.body.appendChild(el);
    return el;
  }
  budgetList.addEventListener('click', e => {
    const btn = e.target.closest('[data-gp-action="delete-budget"], [data-gp-action="edit-budget"]');
    if (!btn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const id = Number(btn.dataset.id),
      b = (window.__granaPriorities?.budgets || []).find(x => Number(x.id) === id);
    // The module state is enclosed in its original closure; resolve it through the exposed storage record.
    let state = {};
    try {
      state = JSON.parse(userStorage.getItem('grana_prioridades_v1') || '{}');
    } catch (_) {}
    const budget = (state.budgets || []).find(x => Number(x.id) === id);
    if (!budget) return;
    if (btn.dataset.gpAction === 'delete-budget') {
      const modal = budgetModal('Excluir orçamento?', `<p class="sectiondesc">Deseja realmente excluir o orçamento de <b>${esc(budget.category)}</b>? Essa ação não pode ser desfeita.</p>`, `<button class="btn" type="button" data-cancel>Cancelar</button><button class="btn primary" type="button" data-confirm>Confirmar exclusão</button>`);
      modal.querySelector('[data-cancel]').onclick = () => modal.remove();
      modal.querySelector('[data-confirm]').onclick = () => {
        state.budgets = state.budgets.filter(x => Number(x.id) !== id);
        userStorage.setItem('grana_prioridades_v1', JSON.stringify(state));
        modal.remove();
        location.reload();
      };
    } else {
      const modal = budgetModal('Editar orçamento', `<label class="field" style="display:block;margin-top:12px">Categoria<input id="budgetEditCat" value="${esc(budget.category)}" disabled></label><label class="field" style="display:block;margin-top:12px">Limite mensal (R$)<input id="budgetEditLimit" type="number" min="0.01" step="0.01" value="${Number(budget.limit)}"></label>`, `<button class="btn" type="button" data-cancel>Cancelar</button><button class="btn primary" type="button" data-confirm>Salvar alterações</button>`);
      modal.querySelector('[data-cancel]').onclick = () => modal.remove();
      modal.querySelector('[data-confirm]').onclick = () => {
        const value = Number(modal.querySelector('#budgetEditLimit').value);
        if (!(value > 0)) {
          void askConfirm({ title: 'Limite inválido', message: 'Informe um limite maior que zero.', single: true });
          return;
        }
        budget.limit = value;
        state.budgets = state.budgets.map(x => Number(x.id) === id ? budget : x);
        userStorage.setItem('grana_prioridades_v1', JSON.stringify(state));
        modal.remove();
        location.reload();
      };
    }
  }, true);
  // Rebuild budget action buttons with Editar + Excluir.
  const observer = new MutationObserver(() => {
    document.querySelectorAll('.gp-budget-card').forEach(card => {
      const del = card.querySelector('[data-gp-action="delete-budget"]');
      if (!del || card.querySelector('[data-gp-action="edit-budget"]')) return;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn';
      edit.textContent = 'Editar orçamento';
      edit.dataset.gpAction = 'edit-budget';
      edit.dataset.id = del.dataset.id;
      del.textContent = 'Excluir orçamento';
      del.insertAdjacentElement('beforebegin', edit);
      card.classList.add('gp-budget-card-ready');
    });
  });
  observer.observe(budgetList, {
    childList: true,
    subtree: true
  });
  // Refresh calendar when the selected month changes; it remains independently navigable.
  $('monthFilter')?.addEventListener('change', renderCalendar);
  registerRenderHook(() => { renderCalendar(); protectTooltips(); });
  renderCalendar();
}



// Fonte: js/features/receitas-categorias.js

/* GRANA — receitas fixas e categorias personalizadas (módulo complementar) */
function initReceitasCategorias() {
  const $ = id => document.getElementById(id);
  const moneyLocal = v => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(v) || 0);
  const monthKey = () => typeof selectedMonth === 'function' ? selectedMonth() : new Date().toISOString().slice(0, 7);
  const dueDay = (m, d) => {
    const [y, mo] = m.split('-').map(Number);
    const day = Math.min(Number(d) || 1, new Date(y, mo, 0).getDate());
    return `${m}-${String(day).padStart(2, '0')}`;
  };
  let incomeFixed = [];
  try {
    incomeFixed = JSON.parse(userStorage.getItem('grana_receitas_fixas_v1') || '[]');
    if (!Array.isArray(incomeFixed)) incomeFixed = [];
  } catch (_) {
    incomeFixed = [];
  }
  let custom = {
    despesa: [],
    receita: []
  };
  try {
    custom = Object.assign(custom, JSON.parse(userStorage.getItem('grana_categorias_personalizadas_v1') || '{}'));
  } catch (_) {}
  let removedDefaults = {
    despesa: [],
    receita: []
  };
  try {
    removedDefaults = Object.assign(removedDefaults, JSON.parse(userStorage.getItem('grana_categorias_padroes_excluidas_v1') || '{}'));
  } catch (_) {}
  ['despesa', 'receita'].forEach(type => {
    const removed = Array.isArray(removedDefaults[type]) ? removedDefaults[type] : [];
    categories[type] = categories[type].filter(name => !removed.includes(name));
    if (Array.isArray(custom[type])) custom[type].forEach(name => {
      if (!categories[type].includes(name)) categories[type].push(name);
    });
  });
  function saveIncome() {
    userStorage.setItem('grana_receitas_fixas_v1', JSON.stringify(incomeFixed));
  }
  function refreshCategorySelects() {
    if (typeof fillCats === 'function') fillCats();
    if (typeof fillFilterCats === 'function') fillFilterCats();
    const select = $('incomeFixedCat');
    if (select) select.innerHTML = orderedCategories(categories.receita).map(c => `<option>${escapeHtml(c)}</option>`).join('');
    document.dispatchEvent(new Event('grana-categories-changed'));
  }
  function escapeHtml(v) {
    return String(v).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]);
  }
  function renderIncomeFixed() {
    const host = $('incomeFixedList');
    if (!host) return;
    const m = monthKey();
    host.innerHTML = incomeFixed.map(item => {
      const received = !!(item.received && item.received[m]);
      return `<div class="fixeditem ${received ? 'paid' : ''}"><input class="check" type="checkbox" ${received ? 'checked' : ''} onchange="window.granaToggleIncomeFixed('${item.id}',this.checked)" aria-label="Marcar ${escapeHtml(item.name)} como recebida"><div class="meta"><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.cat)} · previsto dia ${Math.min(item.due, new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate())} · ${moneyLocal(item.amount)}</small></div><span class="pill ${received ? 'ok' : 'bad'}">${received ? 'RECEBIDO' : 'PENDENTE'}</span><button class="btn" type="button" onclick="window.granaRemoveIncomeFixed('${item.id}')" title="Excluir receita fixa">×</button></div>`;
    }).join('') || '<div class="empty">Nenhuma receita fixa cadastrada. Adicione uma entrada recorrente acima.</div>';
  }
  window.granaUnreceive = (id, month) => {
    const item = incomeFixed.find(x => x.id === id);
    if (item && item.received) { delete item.received[month]; saveIncome(); }
  };
  window.granaToggleIncomeFixed = function (id, checked) {
    const item = incomeFixed.find(x => x.id === id);
    if (!item) return;
    const m = monthKey();
    item.received = item.received || {};
    if (!Array.isArray(appState.data.transactions)) appState.data.transactions = [];
    appState.data.transactions = appState.data.transactions.filter(t => !(t.incomeFixedId === id && String(t.date).slice(0, 7) === m));
    if (checked) {
      item.received[m] = true;
      appState.data.transactions.push({
        id: Date.now() + Math.floor(Math.random() * 10000),
        type: 'receita',
        amount: Number(item.amount),
        desc: item.name,
        cat: item.cat,
        date: dueDay(m, item.due),
        kind: 'fixo',
        incomeFixedId: id
      });
    } else delete item.received[m];
    saveIncome();
    save();
    renderIncomeFixed();
  };
  window.granaRemoveIncomeFixed = async function (id) {
    const item = incomeFixed.find(x => x.id === id);
    if (!item) return;
    const proceed = await askConfirm({
      title: 'Excluir receita fixa',
      message: 'Os recebimentos já registrados serão mantidos nos lançamentos.',
      detail: `${item.name} · ${moneyLocal(item.amount)}`,
      confirmText: 'Excluir',
      danger: true
    });
    if (!proceed) return;
    appState.data.transactions.forEach(t => {
      if (t.incomeFixedId === id) delete t.incomeFixedId;
    });
    incomeFixed = incomeFixed.filter(x => x.id !== id);
    saveIncome();
    save();
    renderIncomeFixed();
  };
  $('incomeFixedForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = $('incomeFixedName').value.trim(),
      amount = Number($('incomeFixedAmount').value),
      due = Math.min(31, Math.max(1, Number($('incomeFixedDue').value) || 1));
    if (!name || !(amount > 0)) return;
    incomeFixed.push({
      id: 'rf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name,
      amount,
      cat: $('incomeFixedCat').value,
      due,
      start: monthKey(),
      received: {}
    });
    saveIncome();
    e.target.reset();
    $('incomeFixedDue').value = 5;
    renderIncomeFixed();
  });
  // Categorias em pequenos badges, lado a lado, com o X posicionado acima à direita.

  function renderCustomCategoryList() {
    const host = $('customCategoryList');
    if (!host) return;
    const groups = ['despesa', 'receita'].map(type => {
      const rows = orderedCategories(categories[type]).map(name => ({
        name,
        isCustom: (custom[type] || []).includes(name)
      }));
      if (!rows.length) return '';
      return `<div class="grana-category-group"><span class="grana-category-type">${type === 'despesa' ? 'Despesas' : 'Receitas'}</span><div style="display:flex;flex-wrap:wrap;gap:10px 12px">${rows.map(item => `<span class="grana-category-badge ${item.isCustom ? 'custom' : ''}" title="${item.isCustom ? 'Personalizada' : 'Padrão'}">${escapeHtml(item.name)}<button type="button" aria-label="Excluir categoria ${escapeHtml(item.name)}" title="Excluir categoria" data-remove-category="${escapeHtml(item.name)}" data-category-type="${type}">×</button></span>`).join('')}</div></div>`;
    }).join('');
    host.innerHTML = groups || '<div class="empty">Nenhuma categoria cadastrada.</div>';
  }
  $('customCategoryForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const name = $('customCategoryName').value.trim(),
      type = $('customCategoryType').value;
    if (!name) return;
    if (categories[type].some(c => c.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
      void askConfirm({ title: 'Categoria já existente', message: 'Escolha outro nome para cadastrar uma nova categoria.', single: true });
      return;
    }
    categories[type].push(name);
    custom[type] = custom[type] || [];
    custom[type].push(name);
    userStorage.setItem('grana_categorias_personalizadas_v1', JSON.stringify(custom));
    refreshCategorySelects();
    renderCustomCategoryList();
    e.target.reset();
  });
  $('customCategoryList')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-remove-category]');
    if (!btn) return;
    const name = btn.dataset.removeCategory,
      type = btn.dataset.categoryType;
    const confirmed = await askConfirm({
      title: 'Excluir categoria?',
      message: 'Deseja realmente remover esta categoria das opções futuras?',
      detail: `${name} · Lançamentos já registrados não serão alterados.`,
      confirmText: 'Confirmar exclusão',
      danger: true
    });
    if (!confirmed) return;
    const isCustom = (custom[type] || []).includes(name);
    if (isCustom) {
      custom[type] = custom[type].filter(c => c !== name);
      userStorage.setItem('grana_categorias_personalizadas_v1', JSON.stringify(custom));
    } else {
      removedDefaults[type] = removedDefaults[type] || [];
      if (!removedDefaults[type].includes(name)) removedDefaults[type].push(name);
      userStorage.setItem('grana_categorias_padroes_excluidas_v1', JSON.stringify(removedDefaults));
    }
    categories[type] = categories[type].filter(c => c !== name);
    refreshCategorySelects();
    renderCustomCategoryList();
  });
  registerRenderHook(renderIncomeFixed);
  $('monthFilter')?.addEventListener('change', renderIncomeFixed);
  refreshCategorySelects();
  renderIncomeFixed();
  renderCustomCategoryList();
}



// Fonte: js/compatibilidade.js

function installCompatibility() {
  Object.assign(window, { p2, cents, ymd, dim, dueDate, uid, sumC, fixedActive, isPaid, addMonths, goalPlan, goalMonthly, monthlyRate, compound, requiredContribution, budget, $, R, money, today, monthNow, esc, fmtDate, categories, orderedCategories, save, selectedMonth, monthTx, backupKeys, writeRecords, createBackup, validateBackup, restoreBackup, titles, showPage, fillCats, fillFilterCats, openModal, closeModal, fillEditCats, openEditTx, removeTx, markFixed, removeFixed, openEditFixed, openGoalContribution, addGoalMonthly, previewGoal, previewEditGoal, openEditGoal, removeGoal, exportJSON, confirmFinish, askConfirm, MONTHS, MONTHS_SHORT, WEEKDAYS, monthLabel, dp, dpOpen, dpRender, dpCommit, enhancePicker, exportData, PDF_W_REG, PDF_W_BOLD, pdfEnc, pdfStr, pdfW, pdfBuild, exportPDF, palette, FONT, setupCanvas, pie, short, bars, sixMonths, renderCore, renderStats, renderRecent, renderDaily, renderTransactions, renderFixed, renderAlerts, renderGoals, registerRenderHook, render, calcInterest, calcSaving });
  for (const key of ['data', 'current', 'editingTxId', 'editingGoalId']) {
    Object.defineProperty(window, key, { configurable: true, get: () => appState[key] });
  }
}

// Fonte: js/main.js

initAuth(() => {
installCompatibility();
initCalculos();
initEstado();
initBackup();
initAcoes();
initDialogos();
initPdf();
initGraficos();
initRenderizacao();
initCalculadoras();
initInicializacao();

initCartoesOrcamentos();
initCalendarioPrivacidadeExcel();
initReceitasCategorias();

});

})();
