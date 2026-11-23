import { $, R, appState, esc, fmtDate, money, monthNow, monthTx, selectedMonth, today } from './estado.js';
import { budget, cents, dim, dueDate, fixedActive, goalMonthly, isPaid, sumC } from './calculos.js';
import { bars, pie, sixMonths } from './graficos.js';
import { calcInterest, calcSaving } from './calculadoras.js';

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

export { renderCore, renderStats, renderRecent, renderDaily, renderTransactions, renderFixed, renderAlerts, renderGoals, renderHooks, registerRenderHook, render, initRenderizacao };
