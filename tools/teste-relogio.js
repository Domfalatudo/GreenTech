/* Verifica o relogio do jogo: formato, avanco e robustez contra dt grande.
   Rodar: node tools/teste-relogio.js  */
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

// mesmo formatador usado na UI (game-view.js)
function formatar(relogio) {
  const h = Math.floor(relogio * 24);
  const m = Math.floor((relogio * 24 - h) * 60);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

console.log('\n[1] escala do tempo');
console.log('  1 dia = ' + D.DIA_SEGUNDOS + 's reais, 1 hora = ' + (D.DIA_SEGUNDOS / 24).toFixed(1) + 's');
ok('o relogio comeca em 0.3 (07:11)', formatar(C.iniciar().relogio) === '07:11', formatar(C.iniciar().relogio));
ok('a hora avanca ~4.8 min por segundo real', Math.abs((1 / D.DIA_SEGUNDOS) * 24 * 60 - 4.8) < 0.05,
  ((1 / D.DIA_SEGUNDOS) * 24 * 60).toFixed(2));

console.log('\n[2] o minuto do relogio realmente muda');
const e = C.iniciar();
let mudancas = 0;
let anterior = formatar(e.relogio);
for (let i = 0; i < 60; i++) {          // 1 segundo real a 60fps
  C.passoSimulacao(e, 1 / 60);
  const agora = formatar(e.relogio);
  if (agora !== anterior) mudancas++;
  anterior = agora;
}
ok('o minuto virou varias vezes em 1s (nao fica congelado)', mudancas >= 3, mudancas);
console.log('  ' + mudancas + ' cambios de minuto em 1 segundo real');

console.log('\n[3] dt gigante nao teleporta o relogio');
const grande = C.iniciar();
const antes = grande.relogio;
C.passoSimulacao(grande, 60);            // 1 minuto de quadro perdido
ok('nao saltou o dia inteiro num quadro', Math.abs(grande.relogio - antes) < 0.01,
  { antes: antes.toFixed(4), depois: grande.relogio.toFixed(4) });
ok('o dia nao virou', grande.dias === 1, grande.dias);
console.log('  dt=60s andou so ' + ((grande.relogio - antes) * 100).toFixed(3) + '% do dia (teto de ' + D.DT_MAXIMO + 's)');

console.log('\n[4] dia vira na ordem e puxa o clima da previsao');
const virada = C.iniciar();
virada.relogio = 0.999;
const previsaoAntes = C.previsaoClima(virada).join(',');
// faltam 0.001 do dia = 0.3s reais; o teto e 0.12s, entao vai de 0.12 em 0.12
let r = { virouDia: false };
let quadros = 0;
while (!r.virouDia && quadros < 20) {
  r = C.passoSimulacao(virada, D.DT_MAXIMO);
  quadros++;
}
ok('virou o dia em ' + quadros + ' quadros', r.virouDia === true, r);
ok('virou uma unica vez', virada.dias === 2, virada.dias);
ok('o relogio voltou para 0-1', virada.relogio >= 0 && virada.relogio < 1, virada.relogio);
ok('o clima real e o que a previsao dizia', virada.clima === previsaoAntes.split(',')[1], {
  real: virada.clima, previsto: previsaoAntes.split(',')[1] });
ok('a previsao continua com 7 dias', C.previsaoClima(virada).length === 7);

console.log('\n[4b] um dt grande nao vira varios dias de uma vez');
const pulo = C.iniciar();
const diaInicial = pulo.dias;
C.passoSimulacao(pulo, 400);              // 400s > 1 dia inteiro de jogo
console.log('  dt=400s: dia ' + diaInicial + ' -> ' + pulo.dias);
ok('nao virou mais de um dia num quadro so (teto de ' + D.DT_MAXIMO + 's)',
  pulo.dias === diaInicial, pulo.dias);
ok('e o relogio continua na faixa valida', pulo.relogio >= 0 && pulo.relogio < 1, pulo.relogio);

console.log('\n[5] o relogio nunca sai da faixa 0-1');
const longo = C.iniciar();
let foraDaFaixa = 0;
for (let i = 0; i < 200000; i++) {      // ~1 hora de simulacao
  C.passoSimulacao(longo, 0.05);
  if (longo.relogio < 0 || longo.relogio >= 1) foraDaFaixa++;
}
ok('nunca saiu de 0-1 em 200 mil passos', foraDaFaixa === 0, foraDaFaixa);
ok('os dias avancaram de forma coerente', longo.dias > 1, longo.dias);
console.log('  apos ~1h de simulacao: dia ' + longo.dias + ', relogio ' + formatar(longo.relogio));

console.log('\n[6] dt invalido nao quebra nada');
const ruins = C.iniciar();
const relogioPrevio = ruins.relogio;
C.passoSimulacao(ruins, NaN);
ok('dt NaN nao moveu o relogio', ruins.relogio === relogioPrevio, ruins.relogio);
C.passoSimulacao(ruins, -5);
ok('dt negativo nao moveu o relogio para tras', ruins.relogio === relogioPrevio, ruins.relogio);
C.passoSimulacao(ruins, 0);
ok('dt zero nao quebrou nada', ruins.relogio === relogioPrevio);

console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' TESTE(S) FALHARAM'));
process.exit(falhas === 0 ? 0 : 1);
