import { userStorage } from '../core/armazenamento.js';
import { appState, categories, orderedCategories, save, selectedMonth } from '../core/estado.js';
import { fillCats, fillFilterCats } from '../core/acoes.js';
import { askConfirm } from '../core/dialogos.js';
import { registerRenderHook } from '../core/renderizacao.js';

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

export { initReceitasCategorias };
