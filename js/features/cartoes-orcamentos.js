import { appState } from '../core/estado.js';
import { uid } from '../core/calculos.js';
import { writeRecords } from '../core/backup.js';
import { askConfirm } from '../core/dialogos.js';
import { showPage, titles } from '../core/acoes.js';

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
    const old = JSON.parse(localStorage.getItem(KEY) || 'null');
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

export { initCartoesOrcamentos };
