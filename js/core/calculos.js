

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

export { p2, cents, ymd, dim, dueDate, uid, sumC, fixedActive, isPaid, addMonths, goalPlan, goalMonthly, monthlyRate, compound, requiredContribution, budget, initCalculos };
