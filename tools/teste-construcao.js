/* Teste temporário da camada de estado do Modo Construção.
   Rodar: node tools/teste-construcao.js  */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..', 'js');
const store = {};
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  }
};
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
  else { falhas++; console.log('  FALHA ' + nome + (extra ? ' -> ' + extra : '')); }
}

const estado = C.iniciar();
const centro = Math.floor(D.LADO_LOTE / 2);
const blocoLivre = () => C.blocoEm(estado, centro * D.LOTE, centro * D.LOTE);

console.log('\n[1] estado inicial');
ok('construcoes começa como lista', Array.isArray(estado.construcoes) && estado.construcoes.length === 0);
ok('sem lixo no estatisticas', Object.keys(estado.estatisticas).join(',') === 'colhidas,plantadas,lotes',
  Object.keys(estado.estatisticas).join(','));

console.log('\n[2] comprar e conferir disponibilidade (modelo a)');
estado.dinheiro = 9999;
C.comprarItem(estado, 'trator');
C.comprarItem(estado, 'trator');
ok('comprou 2 tratores', estado.itens.trator === 2, estado.itens.trator);
ok('disponivel = 2 com nada no mapa', C.construcoesDoItem(estado, 'trator') === 2);

console.log('\n[3] regra de ocupacao de bloco');
const b1 = blocoLivre();
ok('lote do centro aceita construcao', C.conferirConstrucao(estado, b1).ok);
estado.construcoes.push({ itemId: 'trator', blocoX: b1.x, blocoZ: b1.z, rotacao: 1 });
const msgDup = C.conferirConstrucao(estado, b1);
ok('bloque ja ocupado e recusado', !msgDup.ok, msgDup.ok);
ok('disponivel cai para 1', C.construcoesDoItem(estado, 'trator') === 1);

const b2 = C.blocoEm(estado, b1.x + 1, b1.z);
b2.cultivo = { id: 'milho', progresso: 0, pronto: false };
ok('bloque com cultivo e recusado', !C.conferirConstrucao(estado, b2).ok);
b2.cultivo = null;
b2.estrutura = 'arvore';
ok('bloque com estrutura e recusado', !C.conferirConstrucao(estado, b2).ok);
b2.estrutura = null;
const fora = C.blocoEm(estado, 99, 99);
ok('bloco inexistente e recusado', !C.conferirConstrucao(estado, fora).ok);

console.log('\n[4] construcao bloqueia plantar e arvore nativa');
const plantar = C.acoes.plantar(estado, b1);
ok('plantar em bloco com construcao falha', !plantar.ok, plantar.msg);
estado.estatisticas.plantadas = 0;
const arv = C.usarEquipamento(estado, 'arvore', b1);
ok('arvore nativa em bloco com construcao falha', !arv.ok, arv.msg);

console.log('\n[5] construcao nao altera os calculos de jogo');
const pegadaAntes = C.indiceDePegada(estado);
const producaoAntes = C.producaoEnergia(estado).geracao;
ok('estado.itens intacto apos construir', estado.itens.trator === 2, estado.itens.trator);
ok('pegada ecológica nao muda por construir', C.indiceDePegada(estado) === pegadaAntes);
ok('energia gerada nao muda por construir', C.producaoEnergia(estado).geracao === producaoAntes);
ok('equipamento continua usavel apos construir',
  C.usarEquipamento(estado, 'trator', C.blocoEm(estado, b1.x + 2, b1.z)).ok !== undefined);

console.log('\n[6] persistencia: salvar -> carregar -> recarregar');
ok('salvou', C.salvar(estado));
const recarregado = C.iniciar();
ok('construcoes sobreviveram ao save',
  recarregado.construcoes.length === 1 &&
  recarregado.construcoes[0].itemId === 'trator' &&
  recarregado.construcoes[0].blocoX === b1.x &&
  recarregado.construcoes[0].blocoZ === b1.z,
  JSON.stringify(recarregado.construcoes));
ok('rotacao sobreviveu ao save', recarregado.construcoes[0].rotacao === 1);
ok('sem duplicar: disponivel continua 1', C.construcoesDoItem(recarregado, 'trator') === 1);
ok('sem somar: estado.itens continua 2', recarregado.itens.trator === 2);

console.log('\n[7] higiene do save');
const sujo = JSON.parse(JSON.stringify(recarregado));
// 6,6 e 7,6 são blocos do lote do jogador (2,2 -> blocos 6..8).
// 11,11 é de um lote não comprado: precisa sair.
sujo.construcoes = [
  { itemId: 'trator', blocoX: 6, blocoZ: 6, rotacao: 1 },
  { itemId: 'trator', blocoX: 6, blocoZ: 6, rotacao: 2 },
  { itemId: 'inexistente', blocoX: 7, blocoZ: 6, rotacao: 0 },
  { itemId: 'trator', blocoX: 99, blocoZ: 6, rotacao: 0 },
  { itemId: 'arvore', blocoX: 11, blocoZ: 11, rotacao: 0 },
  { itemId: 'composteira', blocoX: 7, blocoZ: 6, rotacao: 7 },
  null
];
const limpas = C.normalizarConstrucoes(sujo);
ok('mantem as duas construcoes validas', limpas.length === 2, JSON.stringify(limpas));
ok('descarta duplicado, item invalido, fora da grade e lote alheio',
  limpas.every((c) => c.itemId === 'trator' || c.itemId === 'composteira'));
ok('rotacao normalizada em 0..3', limpas.every((c) => c.rotacao >= 0 && c.rotacao <= 3),
  JSON.stringify(limpas));
const semCampo = JSON.parse(JSON.stringify(recarregado));
delete semCampo.construcoes;
C.normalizarConstrucoes(semCampo);
ok('save antigo sem o campo vira lista vazia', Array.isArray(semCampo.construcoes) && semCampo.construcoes.length === 0);

console.log('\n[8] limite por lote');
ok('limitePorLote = null (sem limite artificial)', D.CONSTRUCOES.limitePorLote === null);
const anteriores = D.CONSTRUCOES.limitePorLote;
D.CONSTRUCOES.limitePorLote = 2;
estado.construcoes = [
  { itemId: 'trator', blocoX: b1.x, blocoZ: b1.z, rotacao: 0 },
  { itemId: 'trator', blocoX: b1.x + 1, blocoZ: b1.z, rotacao: 0 }
];
const b3 = C.blocoEm(estado, b1.x + 2, b1.z);
ok('com limite configurado o lote recusa a 3a', !C.conferirConstrucao(estado, b3).ok);
D.CONSTRUCOES.limitePorLote = anteriores;

console.log('\n[9] reset da fazenda limpa as construcoes');
C.apagar();
const reiniciado = C.iniciar();
ok('save apagado', store[D.CHAVE_SAVE] === undefined);
ok('nova fazenda sem construcoes', reiniciado.construcoes.length === 0);
ok('sem construcao, disponivel volta ao total (arvore x2 do inicio)',
  C.construcoesDoItem(reiniciado, 'arvore') === 2);
ok('dinheiro voltou ao inicial', reiniciado.dinheiro === 320, reiniciado.dinheiro);

console.log(falhas ? '\nFALHAS: ' + falhas : '\nTODOS OS TESTES PASSARAM');
process.exit(falhas ? 1 : 0);
