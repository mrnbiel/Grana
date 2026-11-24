import { userStorage } from '../core/armazenamento.js';
import { appState } from '../core/estado.js';
import { dim, fixedActive } from '../core/calculos.js';
import { closeModal } from '../core/acoes.js';
import { askConfirm } from '../core/dialogos.js';
import { registerRenderHook } from '../core/renderizacao.js';

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

export { initCalendarioPrivacidadeExcel };
