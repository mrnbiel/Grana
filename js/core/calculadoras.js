import { $, money } from './estado.js';
import { cents, compound, monthlyRate, requiredContribution } from './calculos.js';
import { pie } from './graficos.js';

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

export { calcInterest, calcSaving, initCalculadoras };
