import { $, appState, monthNow, today } from './estado.js';
import { render } from './renderizacao.js';
import { fillCats, fillFilterCats, previewGoal } from './acoes.js';



function initInicializacao() {
window.addEventListener('resize', () => {
  if (['graficos', 'juros'].includes(appState.current)) render();
});
$('monthFilter').value = monthNow();
$('txDate').value = today();
fillCats();
fillFilterCats();
previewGoal();
render();
}

export { initInicializacao };
