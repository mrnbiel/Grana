import { appState } from './estado.js';
import { ymd } from './calculos.js';

const backupKeys = ['grana_prioridades_v1', 'grana_receitas_fixas_v1',
  'grana_categorias_personalizadas_v1', 'grana_categorias_padroes_excluidas_v1', 'grana_privacy_mode'];

function writeRecords(records) {
  const before = Object.fromEntries(Object.keys(records).map(k => [k, localStorage.getItem(k)]));
  try {
    for (const [key, value] of Object.entries(records)) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  } catch (error) {
    for (const [key, value] of Object.entries(before)) {
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    }
    throw error;
  }
}

function createBackup() {
  return { ...appState.data, format: 'grana', version: 2,
    extensions: Object.fromEntries(backupKeys.map(k => [k, localStorage.getItem(k)])) };
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

export { backupKeys, writeRecords, createBackup, validateBackup, restoreBackup, initBackup };
