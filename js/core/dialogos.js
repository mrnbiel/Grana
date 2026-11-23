import { $, fmtDate, monthNow, selectedMonth, today } from './estado.js';
import { closeModal, exportJSON, openModal } from './acoes.js';
import { dim, p2 } from './calculos.js';
import { exportPDF } from './pdf.js';

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

export { confirmFinish, askConfirm, MONTHS, MONTHS_SHORT, WEEKDAYS, monthLabel, dp, dpOpen, dpRender, dpCommit, enhancePicker, exportData, initDialogos };
