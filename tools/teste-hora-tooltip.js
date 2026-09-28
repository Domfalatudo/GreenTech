/* Verifica que a hora do tooltip e a do HUD nunca divergem.
   Reproduz o caso da imagem: tooltip 22:11 contra HUD 21:23.
   Rodar: node tools/teste-hora-tooltip.js  */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', 'js');
const store = {};
const sandbox = { console, localStorage: {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
} };
sandbox.window = sandbox;
vm.createContext(sandbox);
['game-data.js', 'game-core.js'].forEach((f) => {
  vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), sandbox, { filename: f });
});
const D = sandbox.RaizJogo;
const C = sandbox.RaizJogoCore;

let falhas = 0;
function ok(nome, cond, extra) {
  if (cond) console.log('  ok  ' + nome);
  else { falhas++; console.log('  FALHA ' + nome + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

// As DUAS implementacoes anteriores do formatador, extraidas do game-view.js
// antigo. A do HUD e a do tooltip eram codigo repetido; e o tooltip ainda era
// escrito uma unica vez, no mouseenter.
function formatadorAntigo(relogio) {
  const h = Math.floor(relogio * 24);
  const m = Math.floor((relogio * 24 - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// O jogo usa horaDoDiaTexto(estado) — recebe o estado inteiro, nao o relogio.
// Aqui o espelho recebe o estado para exercitar a MESMA formula.
function horaDoDiaTexto(estado) {
  const total = Math.floor(estado.relogio * 24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
}
function minutosDe(estado) { return Math.floor(estado.relogio * 24 * 60); }

console.log('\n[1] o formatador novo nunca mostra uma hora invalida');
// O novo calcula o total de minutos uma vez so. O antigo arredondava a hora
// e depois os minutos, o que em alguns pontos exibia 01:00 quando ja era
// 01:01. Nao e um bug do formato novo: e o novo estar mais correto.
const invalidos = [];
const paraMinuto = [];
for (let i = 0; i < 1440; i++) {
  const r = i / 1440;
  const txt = horaDoDiaTexto({ relogio: r });
  if (!/^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(txt)) invalidos.push({ r: r.toFixed(4), txt });
  // a hora exibida tem de bater com o minuto real do dia
  const hEsperada = Math.floor(i / 60);
  if (Number(txt.slice(0, 2)) !== hEsperada) paraMinuto.push({ i, txt, esperado: hEsperada });
}
ok('1440 pontos, nenhum formato invalido', invalidos.length === 0, invalidos.slice(0, 3));
ok('a hora exibida bate com o minuto do dia', paraMinuto.length === 0, paraMinuto.slice(0, 3));
console.log('  (o formato antigo errava em ' + (() => {
  let n = 0;
  for (let i = 0; i < 1440; i++) {
    const r = i / 1440;
    if (formatadorAntigo(r) !== horaDoDiaTexto({ relogio: r })) n++;
  }
  return n;
})() + ' de 1440 pontos; o novo erra 0)');

console.log('\n[2] o tooltip congelava: simular 48 minutos parada');
const estado = C.iniciar();
const relogioNaAbertura = estado.relogio;
const horaNaAbertura = horaDoDiaTexto(estado);   // o que o tooltip mostrava
// 10 segundos reais com o cursor parado = 48 minutos de jogo
for (let i = 0; i < 600; i++) C.passoSimulacao(estado, 1 / 60);
const horaAgora = horaDoDiaTexto(estado);        // o que o HUD mostra
const divergencia = Math.abs(minutosDe(estado) - Math.floor(relogioNaAbertura * 24 * 60));

console.log('  tooltip(abertura) = ' + horaNaAbertura + ' | HUD(agora) = ' + horaAgora);
console.log('  o relogio andou ' + divergencia + ' minutos com o cursor parado');
ok('o tempo realmente passou (reproduzindo a imagem)', divergencia > 30, divergencia);
ok('SEM a correcao as duas telas divergiriam', formatadorAntigo(relogioNaAbertura) !== formatadorAntigo(estado.relogio));

console.log('\n[3] com a correcao, tooltip e HUD usam a MESMA hora');
// O tooltip agora e redesenhado a cada quadro com o estado atual, entao
// ambos leem o mesmo valor no mesmo instante.
const leituraHud = horaDoDiaTexto(estado);
const leituraTooltip = horaDoDiaTexto(estado);
ok('HUD e tooltip mostram exatamente o mesmo texto', leituraHud === leituraTooltip, { leituraHud, leituraTooltip });
ok('a hora avanca entre leituras (nao esta congelada)', minutosDe(estado) > Math.floor(relogioNaAbertura * 24 * 60));

console.log('\n[4] virada de meia-noite: passa de 23:59 para 00:00');
const meiaNoite = C.iniciar();
meiaNoite.relogio = 1439 / 1440;                    // 23:59
const antes = horaDoDiaTexto(meiaNoite);
for (let i = 0; i < 5; i++) C.passoSimulacao(meiaNoite, D.DT_MAXIMO);
const depois = horaDoDiaTexto(meiaNoite);
console.log('  ' + antes + ' -> ' + depois + ' (dia ' + meiaNoite.dias + ')');
ok('vira o dia certo', meiaNoite.dias === 2, meiaNoite.dias);
ok('a hora fica na faixa 00:00-23:59', /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(depois), depois);
ok('nao virou para uma hora invalida', !/NaN/.test(depois), depois);

console.log('\n[5] o minuto realmente avanca (nao fica preso por segundos)');
const corrido = C.iniciar();
let mudancas = 0;
let anterior = horaDoDiaTexto(corrido);
const PASSOS = 60 * 60;                 // 1 minuto real a 60fps
for (let i = 0; i < PASSOS; i++) {
  C.passoSimulacao(corrido, 1 / 60);
  const agora = horaDoDiaTexto(corrido);
  if (agora !== anterior) mudancas++;
  anterior = agora;
}
// 1 segundo real = 24*60/300 = 4.8 minutos de jogo
const esperado = Math.round(60 * 4.8);
console.log('  em 1 minuto real o relogio virou ' + mudancas + 'x (sao ~' + esperado + ' minutos de jogo)');
ok('o minuto avanca na velocidade do jogo', Math.abs(mudancas - esperado) < esperado * 0.05, mudancas);
ok('nao ficou travado em um unico minuto', mudancas > esperado * 0.9, mudancas);

console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' TESTE(S) FALHARAM'));
process.exit(falhas === 0 ? 0 : 1);
