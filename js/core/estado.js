import { cents, ymd } from './calculos.js';
import { askConfirm } from './dialogos.js';
import { render } from './renderizacao.js';

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
    localStorage.setItem('vertice_data', JSON.stringify(appState.data));
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
  const saved = JSON.parse(localStorage.getItem('vertice_data') || 'null');
  if (saved && Array.isArray(saved.transactions)) {
    appState.data = {
      transactions: saved.transactions,
      fixed: saved.fixed || [],
      goals: saved.goals || []
    };
  }
} catch (e) {/* dados corrompidos: começa vazio */}
}

export { $, R, money, today, monthNow, esc, fmtDate, categories, orderedCategories, appState, save, selectedMonth, monthTx, initEstado };
