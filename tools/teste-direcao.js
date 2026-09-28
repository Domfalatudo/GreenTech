/* Teste da camada de estado do Modo Direcao (subir e dirigir o trator).
   Cobre game-data.js + game-core.js: quem pode ser dirigido, a regra de
   ocupacao de bloco enquanto a maquina anda, o efeito no solo por onde
   ela passa e a persistencia da ancora.
   Rodar: node tools/teste-direcao.js  */
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
  else { falhas++; console.log('  FALHA ' + nome + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}

const estado = C.iniciar();
const centro = Math.floor(D.LADO_LOTE / 2);
const X = centro * D.LOTE;   // primeiro bloco do lote inicial do jogador
const Z = centro * D.LOTE;

console.log('\n[1] os dois tratores sao dirigiveis, o resto nao');
ok('trator antigo e dirigivel', C.itemDirigivel('trator') === true);
ok('trator eletrico e dirigivel', C.itemDirigivel('tratorEletrico') === true);
ok('drone nao e dirigivel', C.itemDirigivel('drone') === false);
ok('arvore nao e dirigivel', C.itemDirigivel('arvore') === false);
ok('item desconhecido nao e dirigivel', C.itemDirigivel('nao_existe') === false);
ok('dados de conducao presentes no modelo',
  D.CONSTRUCOES.itens.trator.velMax > 0 && D.CONSTRUCOES.itens.tratorEletrico.velMax > 0);
ok('eletrico e mais rapido que o antigo',
  D.CONSTRUCOES.itens.tratorEletrico.velMax > D.CONSTRUCOES.itens.trator.velMax);

console.log('\n[2] conferirDirecao: quem pode receber o fazendeiro');
estado.dinheiro = 9999;
C.comprarItem(estado, 'trator');
C.comprarItem(estado, 'tratorEletrico');
ok('sem construcao no bloco: nao sobe', C.conferirDirecao(estado, null).ok === false);
ok('item fixo: nao sobe', C.conferirDirecao(estado, { itemId: 'drone', blocoX: X, blocoZ: Z }).ok === false);
ok('terreno perdido: nao sobe', C.conferirDirecao(estado, { itemId: 'trator', blocoX: 0, blocoZ: 0 }).ok === false);
const noTerreno = { itemId: 'trator', blocoX: X, blocoZ: Z, rotacao: 0 };
ok('trator no terreno: sobe', C.conferirDirecao(estado, noTerreno).ok === true,
  C.conferirDirecao(estado, noTerreno));

console.log('\n[3] dirigirParaBloco: a maquina anda respeitando a ocupacao');
estado.construcoes.push(noTerreno);
ok('ficar no mesmo bloco e no-op', C.dirigirParaBloco(estado, noTerreno, X, Z).ok === true);
ok('anda para bloco livre do lote', C.dirigirParaBloco(estado, noTerreno, X + 1, Z).ok === true);
ok('ancora acompanhou o bloco novo', noTerreno.blocoX === X + 1 && noTerreno.blocoZ === Z, noTerreno);
ok('nao sai do terreno comprado', C.dirigirParaBloco(estado, noTerreno, 0, 0).ok === false);
ok('ficou onde estava depois da recusa', noTerreno.blocoX === X + 1);
ok('fora da grade e recusado', C.dirigirParaBloco(estado, noTerreno, 99, 99).ok === false);

const vizinho = { itemId: 'tratorEletrico', blocoX: X + 2, blocoZ: Z, rotacao: 0 };
estado.construcoes.push(vizinho);
ok('nao empilha em bloco ocupado', C.dirigirParaBloco(estado, noTerreno, X + 2, Z).ok === false);

const ocupado = C.blocoEm(estado, X, Z);
ocupado.cultivo = { id: 'milho', progresso: 0, pronto: false };
ok('nao entra em bloco com cultivo', C.dirigirParaBloco(estado, noTerreno, X, Z).ok === false);
ocupado.cultivo = null;
ocupado.estrutura = 'arvore';
ok('nao entra em bloco com estrutura', C.dirigirParaBloco(estado, noTerreno, X, Z).ok === false);
ocupado.estrutura = null;
ok('a propria construcao nao bloqueia ela mesma',
  C.dirigirParaBloco(estado, noTerreno, noTerreno.blocoX, noTerreno.blocoZ).ok === true);
ok('a construcao vizinha continua no lugar', vizinho.blocoX === X + 2 && vizinho.blocoZ === Z);

console.log('\n[4] prepararAoPassar: o solo trabalhado por onde a maquina passa');
const diesel = C.blocoEm(estado, X, Z);
diesel.fertilidade = 0.4; diesel.umidade = 0.4; diesel.poluicao = 0;
const energiaAntes = estado.energia;
ok('trator antigo lavra o bloco', C.prepararAoPassar(estado, 'trator', diesel).ok === true);
ok('fertilidade subiu', diesel.fertilidade > 0.4, diesel.fertilidade);
ok('umidade subiu', diesel.umidade > 0.4, diesel.umidade);
ok('diesel nao gasta energia', estado.energia === energiaAntes);
ok('diesel polui o solo (trade-off do jogo)', diesel.poluicao > 0, diesel.poluicao);

const limpo = C.blocoEm(estado, X, Z + 1);
limpo.fertilidade = 0.4; limpo.umidade = 0.4; limpo.poluicao = 0.2;
estado.energia = 12;
ok('eletrico lavra o bloco', C.prepararAoPassar(estado, 'tratorEletrico', limpo).ok === true);
ok('eletrico consome energia ao lavrar', estado.energia < 12, estado.energia);
ok('eletrico nao polui', limpo.poluicao === 0.2, limpo.poluicao);
estado.energia = 0;
const semEnergia = C.prepararAoPassar(estado, 'tratorEletrico', C.blocoEm(estado, X, Z + 1));
ok('eletrico sem energia e recusado', semEnergia.ok === false);
ok('a recusa explica o motivo', /energia/i.test(semEnergia.msg), semEnergia.msg);
ok('item sem efeito prepara nao lavra', C.prepararAoPassar(estado, 'drone', limpo).ok === false);

console.log('\n[5] nomes dos veiculos');
ok('nome do trator antigo', C.nomeDeItem('trator') === 'Trator Antigo', C.nomeDeItem('trator'));
ok('nome do eletrico', C.nomeDeItem('tratorEletrico') === 'Trator Elétrico', C.nomeDeItem('tratorEletrico'));
ok('nome desconhecido devolve o id', C.nomeDeItem('xyz') === 'xyz');

console.log('\n[6] persistencia: dirigir grava onde o trator parou');
ok('salvou', C.salvar(estado));
const recarregado = C.iniciar();
const ancorado = recarregado.construcoes.find((c) => c.itemId === 'trator');
ok('o trator voltou do save', !!ancorado, recarregado.construcoes);
ok('na posicao em que ficou (e nao no bloco inicial)',
  ancorado && ancorado.blocoX === X + 1 && ancorado.blocoZ === Z, ancorado);
ok('dirigir nao consome a unidade', recarregado.itens.trator === 1, recarregado.itens.trator);
ok('a unidade do eletrico tambem segue sua', recarregado.itens.tratorEletrico === 1);
ok('com a construcao no mapa nao ha unidade disponivel',
  C.construcoesDoItem(recarregado, 'tratorEletrico') === 0);
C.normalizarConstrucoes(recarregado);
ok('a higiene do save aceita a ancora nova',
  recarregado.construcoes.some((c) => c.itemId === 'trator' && c.blocoX === X + 1),
  recarregado.construcoes);

console.log('\n' + (falhas ? 'FALHAS: ' + falhas : 'TODOS OS TESTES PASSARAM'));
process.exit(falhas ? 1 : 0);
