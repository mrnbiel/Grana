import { p2, cents, ymd, dim, dueDate, uid, sumC, fixedActive, isPaid, addMonths, goalPlan, goalMonthly, monthlyRate, compound, requiredContribution, budget } from './core/calculos.js';
import { $, R, money, today, monthNow, esc, fmtDate, categories, orderedCategories, save, selectedMonth, monthTx } from './core/estado.js';
import { backupKeys, writeRecords, createBackup, validateBackup, restoreBackup } from './core/backup.js';
import { titles, showPage, fillCats, fillFilterCats, openModal, closeModal, fillEditCats, openEditTx, removeTx, markFixed, removeFixed, openEditFixed, openGoalContribution, addGoalMonthly, previewGoal, previewEditGoal, openEditGoal, removeGoal, exportJSON } from './core/acoes.js';
import { confirmFinish, askConfirm, MONTHS, MONTHS_SHORT, WEEKDAYS, monthLabel, dp, dpOpen, dpRender, dpCommit, enhancePicker, exportData } from './core/dialogos.js';
import { PDF_W_REG, PDF_W_BOLD, pdfEnc, pdfStr, pdfW, pdfBuild, exportPDF } from './core/pdf.js';
import { palette, FONT, setupCanvas, pie, short, bars, sixMonths } from './core/graficos.js';
import { renderCore, renderStats, renderRecent, renderDaily, renderTransactions, renderFixed, renderAlerts, renderGoals, registerRenderHook, render } from './core/renderizacao.js';
import { calcInterest, calcSaving } from './core/calculadoras.js';
import { appState } from './core/estado.js';

export function installCompatibility() {
  Object.assign(window, { p2, cents, ymd, dim, dueDate, uid, sumC, fixedActive, isPaid, addMonths, goalPlan, goalMonthly, monthlyRate, compound, requiredContribution, budget, $, R, money, today, monthNow, esc, fmtDate, categories, orderedCategories, save, selectedMonth, monthTx, backupKeys, writeRecords, createBackup, validateBackup, restoreBackup, titles, showPage, fillCats, fillFilterCats, openModal, closeModal, fillEditCats, openEditTx, removeTx, markFixed, removeFixed, openEditFixed, openGoalContribution, addGoalMonthly, previewGoal, previewEditGoal, openEditGoal, removeGoal, exportJSON, confirmFinish, askConfirm, MONTHS, MONTHS_SHORT, WEEKDAYS, monthLabel, dp, dpOpen, dpRender, dpCommit, enhancePicker, exportData, PDF_W_REG, PDF_W_BOLD, pdfEnc, pdfStr, pdfW, pdfBuild, exportPDF, palette, FONT, setupCanvas, pie, short, bars, sixMonths, renderCore, renderStats, renderRecent, renderDaily, renderTransactions, renderFixed, renderAlerts, renderGoals, registerRenderHook, render, calcInterest, calcSaving });
  for (const key of ['data', 'current', 'editingTxId', 'editingGoalId']) {
    Object.defineProperty(window, key, { configurable: true, get: () => appState[key] });
  }
}
