const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const files = ['js/core/armazenamento.js', 'js/core/calculos.js','js/core/estado.js','js/core/backup.js','js/core/acoes.js','js/core/dialogos.js','js/core/pdf.js','js/core/graficos.js','js/core/renderizacao.js','js/core/calculadoras.js','js/core/inicializacao.js','js/core/auth.js','js/features/cartoes-orcamentos.js','js/features/calendario-privacidade-excel.js','js/features/receitas-categorias.js','js/compatibilidade.js','js/main.js'];
const parts = files.map(file => {
  const source = fs.readFileSync(path.join(root,file),'utf8');
  if (/^import(?! .* from ['"]).*$/m.test(source)) throw Error('Import não suportado em '+file);
  return '// Fonte: '+file+'\n'+source.replace(/^import .*;\r?\n/gm,'').replace(/^export \{[^}]*\};?\r?$/gm,'').replace(/^export function /gm,'function ');
});
const bundle = '// Gerado por tools/build.cjs. Edite os módulos.\n(() => {\n'+parts.join('\n')+'\n})();\n';
new (require('node:vm').Script)(bundle);
fs.writeFileSync(path.join(root,'js/app.js'),bundle);
console.log('Bundle gerado e sintaxe validada.');
