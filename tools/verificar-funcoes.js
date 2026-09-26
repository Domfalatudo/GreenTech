/* Verificação estática: funções chamadas mas nunca declaradas no arquivo.
   Rodar: node tools/verificar-funcoes.js */
'use strict';
const fs = require('fs');
const path = require('path');

const alvo = path.join(__dirname, '..', 'js', 'game-view.js');
let src = fs.readFileSync(alvo, 'utf8');

// remove comentários e strings para não contar o que está só em texto
src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
src = src.replace(/(^|[^:])\/\/.*$/gm, '$1 ');
src = src.replace(/'(?:\\.|[^'\\])*'/g, "''");
src = src.replace(/"(?:\\.|[^"\\])*"/g, '""');

const declaradas = new Set();
// function foo() {}  e  window.foo = function () {}
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) declaradas.add(m[1]);
// var foo = ... / let foo = ... / const foo = ...
for (const m of src.matchAll(/\b(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g)) declaradas.add(m[1]);
// parâmetros de função e nomes de propriedades em objetos
for (const m of src.matchAll(/function[^(]*\(([^)]*)\)/g)) {
  m[1].split(',').forEach((p) => {
    const nome = p.trim().split(/[\s:=]/)[0];
    if (nome && /^[A-Za-z_$][\w$]*$/.test(nome)) declaradas.add(nome);
  });
}
for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*:\s*function/g)) declaradas.add(m[1]);

const uteis = new Set();
for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
  const nome = m[1];
  if (declaradas.has(nome)) continue;
  uteis.add(nome);
}

// o que o arquivo realmente espera encontrar no ambiente
const doAmbiente = [
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'Array',
  'Object', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'isFinite', 'isNaN',
  'parseInt', 'parseFloat', 'setTimeout', 'clearTimeout', 'requestAnimationFrame',
  'querySelector', 'querySelectorAll', 'addEventListener', 'removeEventListener',
  'createElement', 'appendChild', 'append', 'remove', 'forEach', 'map', 'filter',
  'reduce', 'some', 'every', 'find', 'findIndex', 'indexOf', 'includes', 'push',
  'splice', 'join', 'slice', 'toFixed', 'toggle', 'add', 'has', 'get', 'set',
  'closest', 'matches', 'then', 'catch', 'keys', 'values', 'assign', 'from', 'getBoundingClientRect',
  'confirm', 'reload', 'floor', 'round', 'max', 'min', 'sqrt', 'sin', 'cos', 'atan2', 'pow', 'random',
  'log', 'warn', 'error', 'exitPointerLock', 'requestPointerLock', 'now', 'repeat'
];

const suspeitas = [...uteis].filter((n) => !doAmbiente.includes(n)).sort();
console.log('Funcoes chamadas sem declaracao local:', suspeitas.length ? '' : 'nenhuma');
suspeitas.forEach((n) => console.log('  - ' + n));
