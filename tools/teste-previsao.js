/* Verifica se a previsao semanal realmente corresponde ao clima do jogo.
   Rodar: node tools/teste-previsao.js  */
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

// 1 dia de jogo = DIA_SEGUNDOS segundos reais de simulacao
const DIA = D.DIA_SEGUNDOS;
function rodarUmDia(estado) {
  for (let i = 0; i < DIA / 0.016; i++) C.passoSimulacao(estado, 0.016);
}

console.log('\n[1] a previsao do dia 1 casa com o clima atual');
let estado = C.iniciar();
let fila = C.previsaoClima(estado);
ok('fila tem 7 dias', fila.length === 7, fila.length);
ok('fila[0] === estado.clima (hoje)', fila[0] === estado.clima, { fila: fila[0], clima: estado.clima });
ok('a fila guardada tem so os 6 dias futuros', estado.previsao.length === 6, estado.previsao.length);

console.log('\n[2] a previsao realmente vira o clima real');
let acertos = 0;
const guardado = [];
for (let dia = 0; dia < 6; dia++) {
  // o dia de AMANHA na previsao e o que a simulacao vai aplicar
  const esperado = C.previsaoClima(estado)[1];
  rodarUmDia(estado);
  guardado.push(esperado === estado.clima);
  if (esperado === estado.clima) acertos++;
}
console.log('  dias conferidos: ' + guardado.map((v, i) => (v ? 'ok' : 'ERRO(dia' + (i + 2) + ')')).join(', '));
ok('os 6 dias previstos viraram o clima real', acertos === 6, acertos + '/6');

console.log('\n[3] a previsao NAO muda quando o jogador so olha');
const antes = C.previsaoClima(estado).join(',');
for (let i = 0; i < 50; i++) C.previsaoClima(estado);
ok('ler 50x nao sorteia nada novo', C.previsaoClima(estado).join(',') === antes);

console.log('\n[4] a previsao avanca junto com o dia');
const filaAntes = C.previsaoClima(estado).join(',');
rodarUmDia(estado);
const filaDepois = C.previsaoClima(estado).join(',');
ok('a fila deslizou (o dia de hoje virou o de ontem)', filaAntes !== filaDepois, { filaAntes, filaDepois });
ok('ainda tem 7 dias', C.previsaoClima(estado).length === 7);

console.log('\n[5] save antigo (sem previsao) nao quebra');
const estadoVelho = JSON.parse(JSON.stringify(estado));
delete estadoVelho.previsao;
C.salvar(estadoVelho);
const climaSalvo = estadoVelho.clima;
const recarregado = C.iniciar();
ok('recarregou a fazenda', !!recarregado && !!recarregado.blocos);
ok('a previsao foi reconstruida', C.previsaoClima(recarregado).length === 7);
ok('o clima atual nao foi alterado', recarregado.clima === climaSalvo);
ok('o dia 1 da previsao e o clima atual', C.previsaoClima(recarregado)[0] === climaSalvo);

console.log('\n[5b] previsao corrompida nao quebra o jogo');
const sujo = JSON.parse(JSON.stringify(estado));
sujo.previsao = ['lixo', 'clima-inexistente', 123];
C.salvar(sujo);
const consertado = C.iniciar();
ok('descartou as entradas invalidas', consertado.previsao.every((c) => !!D.CLIMAS[c]), consertado.previsao);
ok('completou com 6 dias validos', consertado.previsao.length === 6, consertado.previsao.length);

console.log('\n[6] a previsao sobrevive ao save');
const comPrev = C.iniciar();
const filaSalva = C.previsaoClima(comPrev).join(',');
C.salvar(comPrev);
const outra = C.iniciar();
ok('a fila continua igual apos recarregar', C.previsaoClima(outra).join(',') === filaSalva);

console.log('\n[7] o sorteio respeita os pesos E evita repetir o dia anterior');
// A regra anti-repeticao (peso x0.5 para o clima anterior) torna o sorteio
// dependente do dia corrente, entao a distribuicao de uma unica jogada nao
// bate com o peso bruto. O que importa e:
//   a) numa cadeia longa a frequencia converge para os pesos do jogo
//   b) o dia seguinte raramente e igual ao anterior
// avancarPrevisao() consome a fila em vez de sortear, entao a repeticao e
// medida pela diferenca entre o dia n e o dia n+1 ja sorteados.
const AMOSTRAS = 2000;
let repetiu = 0, totalRep = 0;
const freq = { sol: 0, nublado: 0, chuva: 0, tempestade: 0 };

for (let n = 0; n < AMOSTRAS; n++) {
  const e = C.iniciar();
  e.previsao = [];
  e.clima = Object.keys(D.PESOS_CLIMA)[n % 4];
  // primeiro dia sorteia, os seguintes sao lidos da fila ja montada
  let anterior = null;
  for (let d = 0; d < 40; d++) {
    C.avancarPrevisao(e);              // consome hoje e sorteia o proximo
    const hoje = e.clima;
    freq[hoje]++;
    if (anterior !== null) {
      if (hoje === anterior) repetiu++;
      totalRep++;
    }
    anterior = hoje;
  }
}
const nTot = Object.values(freq).reduce((a, b) => a + b, 0);
console.log('  frequencia em cadeia longa (' + AMOSTRAS + ' fazendas x 40 dias):');
Object.keys(D.PESOS_CLIMA).forEach((k) => {
  const real = freq[k] / nTot;
  console.log('    ' + k + ': ' + (real * 100).toFixed(1) + '% (peso ' + (D.PESOS_CLIMA[k] * 100) + '%)');
  ok(k + ' proximo do peso ' + (D.PESOS_CLIMA[k] * 100) + '%',
    Math.abs(real - D.PESOS_CLIMA[k]) < 0.06, (real * 100).toFixed(1) + '%');
});
const taxaRepeticao = repetiu / totalRep;
console.log('  repetiu o clima anterior em ' + (taxaRepeticao * 100).toFixed(1) + '% dos dias');
ok('a repeticao e rara (regra anti-repeticao vale)', taxaRepeticao < 0.35, (taxaRepeticao * 100).toFixed(1) + '%');

C.apagar();
console.log('\n' + (falhas === 0 ? 'TODOS OS TESTES PASSARAM' : falhas + ' TESTE(S) FALHARAM'));
process.exit(falhas === 0 ? 0 : 1);
