/* Smoke test do game-view.js com stubs de DOM e three.js.
   Exercita o ciclo: comprar -> modo construção -> posicionar -> girar ->
   salvar -> recarregar (novo sandbox) -> reconstruir -> marreta -> reset.
   Rodar: node tools/smoke-construcao.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const RAIZ = path.join(__dirname, '..', 'js');

function noop() {}
function vec() {
  return { x: 0, y: 0, z: 0, clone() { return vec(); }, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
    copy() { return this; }, addScaledVector() { return this; }, distanceTo() { return 99; } };
}
function mat() {
  return { color: { setHex() {} }, emissive: { setHex() {} }, emissiveIntensity: 0, opacity: 1,
    transparent: false, depthWrite: true, roughness: 0.9, metalness: 0,
    clone() { return mat(); }, dispose() {} };
}
function geo() {
  return { type: 'BoxGeometry', dispose() {}, computeVertexNormals() {}, setFromPoints() { return this; }, setAttribute() {},
    attributes: {
      position: { count: 24, getX: () => 0, getY: () => 0, getZ: () => 0, setXYZ() {}, needsUpdate: false, array: new Float32Array(72) },
      uv: { count: 24, getX: () => 0, getY: () => 0, setXY() {}, needsUpdate: false, array: new Float32Array(48) } } };
}
function cor() { return { setHex() {}, getHex() { return 0; }, set() {} }; }
function obj(nome) {
  const eixos = () => ({ x: 0, y: 0, z: 0, set() { return this; } });
  const base = { _stub: nome, children: [], parent: null, userData: {}, visible: true,
    position: vec(), rotation: eixos(), scale: { x: 1, y: 1, z: 1, set() { return this; } },
    material: mat(), isMesh: true, renderOrder: 0, castShadow: false, receiveShadow: false,
    geometry: geo(), type: nome,
    // luzes, fog e materiais mexem em cores durante o laço principal
    color: cor(), groundColor: cor(), emissive: cor(),
    classList: { _s: new Set(),
      add() { [...arguments].forEach((c) => this._s.add(c)); },
      remove() { [...arguments].forEach((c) => this._s.delete(c)); },
      toggle(c, f) { if (f === undefined) f = !this._s.has(c); f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); } } };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      return (t[k] = function () { return undefined; });
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function grupo() {
  const g = obj('group');
  g.add = function (f) { g.children.push(f); f.parent = g; return g; };
  g.remove = function (f) { const i = g.children.indexOf(f); if (i >= 0) g.children.splice(i, 1); f.parent = null; return g; };
  g.clear = function () { g.children.length = 0; };
  g.traverse = function (fn) { g.children.slice().forEach(fn); };
  g.userData = {};
  return g;
}
const ctor = (nome, extra) => function () { return Object.assign(obj(nome), extra || {}); };

// ponto do chão devolvido pelo raycast (o teste escolhe o bloco alvo)
const PONTO = { x: 0, z: 0 };
function mirarBloco(bx, bz) { PONTO.x = bx - 5.5; PONTO.z = bz - 5.5; }

const THREE = {
  Scene: ctor('scene'), Group: grupo, Object3D: ctor('o3d'), PerspectiveCamera: ctor('camera'),
  WebGLRenderer: ctor('renderer', { domElement: null, capabilities: { getMaxAnisotropy: () => 16 }, shadowMap: {} }),
  Mesh: ctor('mesh'), Line: ctor('line'), Points: ctor('points'),
  Raycaster: ctor('ray', { ray: { intersectPlane: (p, alvo) => { alvo.x = PONTO.x; alvo.z = PONTO.z; return alvo; } }, intersectObjects: () => [] }),
  Vector2: ctor('v2'), Vector3: ctor('v3'), Plane: ctor('plane'), Color: ctor('color'),
  Fog: ctor('fog', { color: cor(), near: 0, far: 0 }), HemisphereLight: ctor('hemi'), DirectionalLight: ctor('dir'),
  BoxGeometry: geo, PlaneGeometry: geo, CylinderGeometry: geo, ConeGeometry: geo,
  SphereGeometry: geo, TorusGeometry: geo, DodecahedronGeometry: geo, BufferGeometry: geo,
  MeshBasicMaterial: mat, MeshStandardMaterial: mat, LineBasicMaterial: mat, PointsMaterial: mat,
  BufferAttribute: function (array, item) { return { array, itemSize: item, count: array.length / item, needsUpdate: false }; },
  sRGBEncoding: 'srgb', Float32Array: Float32Array
};


function elemento(nome) {
  const e = obj(nome);
  e.tagName = 'DIV';
  e.style = { cssText: '', display: '' };
  e.dataset = {};
  e.hidden = false;
  e.disabled = false;
  e.id = nome;
  e._on = {};
  Object.defineProperty(e, 'innerHTML', { get() { return this._h || ''; }, set(v) { this._h = v; } });
  Object.defineProperty(e, 'textContent', { get() { return this._t || ''; }, set(v) { this._t = v; } });
  e.addEventListener = function (tipo, fn) { this._on[tipo] = fn; };
  e.removeEventListener = noop;
  e.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 600 });
  // simula estar dentro do painel de construções (usado por ponteiroSobreInventario)
  e._pai = null;
  e.closest = function (s) { return (s === '.inventario-construcao' && this._pai) ? this._pai : null; };
  return e;
}

function criarJanela(quadros) {
  let restantes = quadros || 0;
  const store = {};
  const sel = new Map();
  const doc = { _itens: [], _ferramentas: [], _abas: [] };
  doc.querySelector = (s) => {
    if (!sel.has(s)) sel.set(s, elemento(s));
    return sel.get(s);
  };
  doc.querySelectorAll = (s) => {
    if (s === '[data-ferramenta]') return doc._ferramentas.slice();
    if (s === '[data-aba]') return doc._abas.slice();
    if (s.indexOf('.item-construcao') === 0) return doc._itens.slice();
    return [];
  };
  doc.createElement = (tag) => {
    const e = elemento(tag);
    e.dataset = {};
    if (String(tag).toUpperCase() === 'BUTTON') doc._ferramentas.push(e);
    else { e._pai = { nome: '.inventario-construcao' }; doc._itens.push(e); }
    return e;
  };
  doc.createTextNode = (t) => ({ text: t, nodeValue: t });
  doc.createElementNS = (ns, tag) => {
    const e = elemento(tag);
    e.setAttribute = noop;
    e.appendChild = noop;
    doc._itens.push(e);
    return e;
  };
  doc.body = elemento('body');
  doc.readyState = 'complete';
  doc.pointerLockElement = null;
  doc.addEventListener = (t, f) => { (doc._on = doc._on || {})[t] = f; };
  doc.removeEventListener = noop;
  doc.exitPointerLock = noop;

  const win = {
    THREE, console, document: doc, devicePixelRatio: 1, RaizTextures: null,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; }
    },
    performance: { now: () => 0 },
    requestAnimationFrame: (cb) => {
      // com `quadros`, roda o laço principal algumas vezes de verdade
      if (restantes > 0) { restantes--; cb(16); }
      return 0;
    },
    cancelAnimationFrame: noop,
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    matchMedia: () => ({ matches: false }),
    addEventListener: (t, f) => { (win._on = win._on || {})[t] = f; },
    removeEventListener: noop,
    confirm: () => true,
    location: { reload: () => { win._recarregou = true; } },
    _store: store, _doc: doc
  };
  win.window = win;
  doc.defaultView = win;
  return win;
}

function carregarJogo(win) {
  win.RaizJogo = undefined; win.RaizJogoCore = undefined; win.RaizJogoView = undefined;
  const ctx = vm.createContext(win);
  ['game-data.js', 'game-core.js', 'game-view.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f });
  });
  return win.RaizJogoView;
}



/* ---------- o teste ---------- */
let falhas = 0;
function ok(nome, cond, extra) {
  if (cond) console.log('  ok  ' + nome);
  else { falhas++; console.log('  FALHA ' + nome + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
}
const CHAVE = 'raiz-jogo-v1';

const win = criarJanela();
const view = carregarJogo(win);
ok('jogo inicializou sem erro', !!view);
const estado = view.estado();
estado.dinheiro = 9999;
estado.itens.trator = 1;

const doc = win.document;
const botao = doc._ferramentas.filter((b) => b.dataset.ferramenta === 'construcao')[0];

console.log('\n[1] abrir o modo construção');
ok('botão Modo Construção existe', !!botao);
botao._on.click();
ok('ferramenta virou construcao', estado.ferramenta === 'construcao');
ok('botão ficou .ativo (bug 7)', botao.classList.contains('ativo'));
ok('painel de construções aberto', doc.querySelector('[data-ui="inventario-construcao"]').classList.contains('ativo'));
ok('controles de toque liberados', doc.querySelector('[data-ui="controles-construcao"]').hidden === false);
ok('barra de ferramentas continua visível (para o estado ativo aparecer)',
  doc.querySelector('.barra-ferramentas') !== null);
ok('inventário do jogador no HUD existe',
  doc.querySelector('[data-ui="inventario-jogador"]') !== null);

console.log('\n[2] selecionar e posicionar');
const itemTrator = doc._itens.filter((i) => i.dataset && i.dataset.itemId === 'trator')[0];
ok('trator aparece no inventário', !!itemTrator);
itemTrator._on.pointerdown({ preventDefault: noop, pointerId: 1, clientX: 880, clientY: 400 });
ok('item ficou selecionado', itemTrator.classList.contains('selecionado'));
ok('classe arrastando-item aplicada no body', doc.body.classList.contains('arrastando-item'));

const canvas = doc.querySelector('#stage');
win._on.pointermove({ pointerId: 1, clientX: 450, clientY: 300, target: canvas });
const status = doc.querySelector('[data-ui="status-construcao"]').textContent;
ok('preview validado sobre bloco livre', /Soltar aqui/.test(status), status);

const girador = doc.querySelector('[data-ui="girar-construcao"]');
girador._on.click();
girador._on.click();
ok('girou duas vezes (180°)', doc.querySelector('[data-ui="angulo-construcao"]').textContent === '180°',
  doc.querySelector('[data-ui="angulo-construcao"]').textContent);

console.log('\n[3] soltar (pointerup no mapa) e conferir persistência');
win._on.pointerup({ button: 0, pointerType: 'mouse', pointerId: 1, clientX: 450, clientY: 300, target: canvas });
ok('construção registrada no estado', estado.construcoes.length === 1, estado.construcoes);
ok('posição e rotação salvas',
  estado.construcoes[0].itemId === 'trator' &&
  estado.construcoes[0].blocoX === 6 && estado.construcoes[0].blocoZ === 6 &&
  estado.construcoes[0].rotacao === 2, estado.construcoes[0]);
ok('estado.itens NÃO foi debitado', estado.itens.trator === 1, estado.itens.trator);
ok('classe arrastando-item removida', !doc.body.classList.contains('arrastando-item'));
ok('salvou no localStorage', !!win._store[CHAVE]);
const salvo = JSON.parse(win._store[CHAVE]);
ok('JSON contém a construção', Array.isArray(salvo.construcoes) && salvo.construcoes.length === 1);

console.log('\n[4] recarregar a página: a construção tem que voltar');
const win2 = criarJanela();
win2.localStorage.setItem(CHAVE, win._store[CHAVE]);
const view2 = carregarJogo(win2);
ok('jogo recarregou', !!view2);
const estado2 = view2.estado();
ok('construção voltou do save', estado2.construcoes.length === 1, estado2.construcoes);
ok('rotação preservada', estado2.construcoes[0].rotacao === 2);
ok('nenhum item duplicado', estado2.itens.trator === 1, estado2.itens.trator);
const disponivel = win2.RaizJogoCore.construcoesDoItem(estado2, 'trator');
ok('disponível = 0 com a unidade já no mapa', disponivel === 0, disponivel);

console.log('\n[5] não empilha no mesmo bloco');
const doc2 = win2.document;
const botao2 = doc2._ferramentas.filter((b) => b.dataset.ferramenta === 'construcao')[0];
botao2._on.click();
ok('modo construção aberto na nova sessão', estado2.ferramenta === 'construcao');
const item2 = doc2._itens.filter((i) => i.dataset && i.dataset.itemId === 'trator')[0];
ok('item aparece como indisponível', !item2 || item2.classList.contains('sem-item'));

console.log('\n[6] marreta: prévia e remoção');
const marreta = doc2._itens.filter((i) => i.dataset && i.dataset.itemId === 'marreta')[0];
ok('marreta presente no inventário', !!marreta);
marreta._on.click();
ok('modo marreta armado', doc2.body.classList.contains('modo-deletar'));
const statusMarreta = doc2.querySelector('[data-ui="status-construcao"]').textContent;

ok('status explica a marreta', /Marreta armada/.test(statusMarreta), statusMarreta);

console.log('\n[7] sair do modo construção devolve o estado anterior');
botao2._on.click();
ok('voltou da ferramenta construcao', estado2.ferramenta === 'plantar', estado2.ferramenta);
ok('botão perdeu o estado ativo', !botao2.classList.contains('ativo'));
ok('painel de construções fechado', !doc2.querySelector('[data-ui="inventario-construcao"]').classList.contains('ativo'));
ok('controles escondidos', doc2.querySelector('[data-ui="controles-construcao"]').hidden === true);
ok('corpo sem modo-construcao', !doc2.body.classList.contains('modo-construcao'));
ok('barra central voltou a ser Ferramentas',
  doc2.querySelector('[data-ui="titulo-centro"]').textContent === 'Ferramentas',
  doc2.querySelector('[data-ui="titulo-centro"]').textContent);
ok('ferramentas voltaram a aparecer',
  doc2.querySelector('[data-ui="barra-ferramentas"]').hidden === false);
ok('botão de fechar sumiu de novo',
  doc2.querySelector('[data-ui="fechar-construcao"]').hidden === true);

console.log('\n[8] segundo trator em bloco livre, girado com a tecla R');
const doc3 = win2.document;
const stage3 = doc3.querySelector('#stage');
const g = win2.RaizJogoCore;
estado2.itens.trator = 2;                    // compra a segunda unidade
botao2._on.click();                          // reabre o modo construção
ok('modo construção reaberto', estado2.ferramenta === 'construcao');
const item3 = doc3._itens.filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === 'trator').pop();
ok('painel lista o trator disponível', !!item3);

item3._on.pointerdown({ preventDefault: noop, pointerId: 2, clientX: 880, clientY: 400 });
win2._on.keydown({ key: 'r', target: { tagName: 'DIV' }, preventDefault: noop });
ok('tecla R girou o preview para 90°',
  doc3.querySelector('[data-ui="angulo-construcao"]').textContent === '90°',
  doc3.querySelector('[data-ui="angulo-construcao"]').textContent);

// toque/clique no painel apenas seleciona: não posiciona
mirarBloco(7, 6);
win2._on.pointermove({ pointerId: 2, clientX: 400, clientY: 300, target: stage3 });
win2._on.pointerup({ button: 0, pointerType: 'mouse', pointerId: 2, clientX: 880, clientY: 400, target: item3 });
ok('clique no painel só seleciona, não posiciona', estado2.construcoes.length === 1, estado2.construcoes);

// agora solta sobre o mapa, no bloco 7,6 (vizinho livre)
mirarBloco(7, 6);
win2._on.pointermove({ pointerId: 2, clientX: 400, clientY: 300, target: stage3 });
win2._on.pointerup({ button: 0, pointerType: 'mouse', pointerId: 2, clientX: 400, clientY: 300, target: stage3 });
ok('segunda construção colocada no bloco livre', estado2.construcoes.length === 2, estado2.construcoes);
ok('giro de 90° salvo no estado', estado2.construcoes[1].rotacao === 1, estado2.construcoes[1]);
ok('disponível volta a 0 com as duas unidades no mapa',
  g.construcoesDoItem(estado2, 'trator') === 0);

console.log('\n[8b] não empilha: bloco já ocupado é recusado');
estado2.itens.trator = 3;
if (estado2.ferramenta === 'construcao') botao2._on.click();   // redesenha o inventário
botao2._on.click();
ok('modo construção ligado para o teste de sobreposição', estado2.ferramenta === 'construcao');
const item3b = doc3._itens.filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === 'trator').pop();
item3b._on.pointerdown({ preventDefault: noop, pointerId: 4, clientX: 880, clientY: 400 });
mirarBloco(6, 6);                              // bloco já ocupado
win2._on.pointermove({ pointerId: 4, clientX: 400, clientY: 300, target: stage3 });
const statusOcupado = doc3.querySelector('[data-ui="status-construcao"]').textContent;
ok('preview avisa que o bloco está ocupado', /construcao nesse bloco/.test(statusOcupado), statusOcupado);
win2._on.pointerup({ button: 0, pointerType: 'mouse', pointerId: 4, clientX: 400, clientY: 300, target: stage3 });
ok('não colocou sobre bloco ocupado', estado2.construcoes.length === 2, estado2.construcoes);
ok('unidade preservada após recusa', g.construcoesDoItem(estado2, 'trator') === 1);

console.log('\n[9] TOQUE: arrastar do inventário até o mapa e soltar com o dedo');
if (estado2.ferramenta === 'construcao') botao2._on.click();
estado2.itens.composteira = 1;
botao2._on.click();
const itemToque = doc3._itens.filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === 'composteira').pop();
ok('composteira disponível para o toque', !!itemToque);

// dedo "pega" o item no inventário
itemToque._on.pointerdown({ preventDefault: noop, pointerId: 30, clientX: 860, clientY: 420, pointerType: 'touch' });
ok('toque selecionou o item', itemToque.classList.contains('selecionado'));
ok('arraste com o dedo em curso', doc3.body.classList.contains('arrastando-item'));

// dedo arrasta até o bloco 6,7
mirarBloco(6, 7);
win2._on.pointermove({ pointerId: 30, clientX: 430, clientY: 310, target: stage3, pointerType: 'touch' });
ok('preview verde sobre bloco livre com o dedo',
  /Soltar aqui/.test(doc3.querySelector('[data-ui="status-construcao"]').textContent),
  doc3.querySelector('[data-ui="status-construcao"]').textContent);

// dedo solta
const antesToque = estado2.construcoes.length;
win2._on.pointerup({ button: -1, pointerType: 'touch', pointerId: 30, clientX: 430, clientY: 310, target: stage3 });
ok('toque colocou a construção', estado2.construcoes.length === antesToque + 1, estado2.construcoes);
ok('construção do toque está no bloco 6,7',
  estado2.construcoes.some((c) => c.blocoX === 6 && c.blocoZ === 7), estado2.construcoes);
ok('classe de arraste limpa', !doc3.body.classList.contains('arrastando-item'));

console.log('\n[9b] TOQUE: cancelar com o botão da UI');
estado2.itens.painel = 1;
if (estado2.ferramenta === 'construcao') botao2._on.click();
botao2._on.click();
const itemToque2 = doc3._itens.filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === 'painel').pop();
ok('painel disponível para o toque', !!itemToque2);
itemToque2._on.pointerdown({ preventDefault: noop, pointerId: 31, clientX: 860, clientY: 420, pointerType: 'touch' });
ok('segundo arraste com o dedo em curso', doc3.body.classList.contains('arrastando-item'));
doc3.querySelector('[data-ui="cancelar-construcao"]')._on.click();
ok('botão Cancelar limpou o arraste', !doc3.body.classList.contains('arrastando-item'));
ok('Cancelar não colocou nada', !estado2.construcoes.some((c) => c.itemId === 'painel'));
ok('Cancelar mantém o modo construção ligado', estado2.ferramenta === 'construcao');

console.log('\n[9c] TOQUE: girar com o botão da UI antes de soltar');
estado2.itens.poste = 1;
if (estado2.ferramenta === 'construcao') botao2._on.click();
botao2._on.click();
const itemToque3 = doc3._itens.filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === 'poste').pop();
ok('poste disponível para o toque', !!itemToque3);
itemToque3._on.pointerdown({ preventDefault: noop, pointerId: 40, clientX: 860, clientY: 420, pointerType: 'touch' });
mirarBloco(8, 6);
win2._on.pointermove({ pointerId: 40, clientX: 430, clientY: 310, target: stage3, pointerType: 'touch' });
doc3.querySelector('[data-ui="girar-construcao"]')._on.click();
ok('botão Girar funciona no toque (90°)',
  doc3.querySelector('[data-ui="angulo-construcao"]').textContent === '90°',
  doc3.querySelector('[data-ui="angulo-construcao"]').textContent);
win2._on.pointerup({ button: -1, pointerType: 'touch', pointerId: 40, clientX: 430, clientY: 310, target: stage3 });
ok('toque com rotação colocou o poste no bloco 8,6',
  estado2.construcoes.some((c) => c.itemId === 'poste' && c.blocoX === 8 && c.blocoZ === 6 && c.rotacao === 1),
  estado2.construcoes);

console.log('\n[10] cancelar com Esc durante o arraste');
if (estado2.ferramenta === 'construcao') botao2._on.click();
estado2.itens.turbina = 1;
botao2._on.click();
const item4b = doc3._itens.filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === 'turbina').pop();
ok('turbina disponível', !!item4b);
item4b._on.pointerdown({ preventDefault: noop, pointerId: 3, clientX: 880, clientY: 400 });
ok('arraste começou', doc3.body.classList.contains('arrastando-item'));
const antesEsc = estado2.construcoes.length;
win2._on.keydown({ key: 'Escape', target: { tagName: 'DIV' }, preventDefault: noop });
ok('Esc cancelou o arraste', !doc3.body.classList.contains('arrastando-item'));
ok('Esc não colocou nada', estado2.construcoes.length === antesEsc, estado2.construcoes.length);
ok('Esc não fechou o modo (item ainda em uso)', estado2.ferramenta === 'construcao');

console.log('\n[10b] expandir terreno atualiza a grade sem sair do modo');
const antes = estado2.construcoes.length;
estado2.dinheiro = 9999;
const r = g.expandir(estado2, 2, 1, 'fertil');
ok('comprou lote vizinho', r.ok, r.msg);
ok('construções intactas após comprar lote', estado2.construcoes.length === antes, estado2.construcoes.length);
ok('lote novo tem blocos liberados', [0, 1, 2].every((x) => !g.blocoEm(estado2, 6 + x, 4).bloqueado));
ok('dá para construir no lote novo', g.conferirConstrucao(estado2, g.blocoEm(estado2, 7, 4)).ok);
ok('continua bloqueado o bloco já ocupado',
  !g.conferirConstrucao(estado2, g.blocoEm(estado2, 6, 6)).ok);

console.log('\n[11] reset da fazenda');
const reiniciar = doc3.querySelector('[data-ui="reiniciar"]');
reiniciar._on.click();
ok('apagou o save', win2._store[CHAVE] === undefined);
ok('chamou reload', win2._recarregou === true);

const win3 = criarJanela();
const view3 = carregarJogo(win3);
ok('nova fazenda sem construções', view3.estado().construcoes.length === 0);
ok('nova fazenda sem itens constructos', view3.estado().itens.trator === undefined);
ok('nova fazenda com o lote inicial', Object.keys(view3.estado().lotes).length === 1);

console.log('\n[11] laço principal com construções no mapa (física, colisão, animação)');
const winLaco = criarJanela(3);
winLaco.localStorage.setItem(CHAVE, win._store[CHAVE]);   // mesmo save com 1 construção
let erroLaco = null;
try {
  const viewLaco = carregarJogo(winLaco);
  ok('jogo com laço rodou sem erro', !!viewLaco);
  ok('construção presente durante o laço', viewLaco.construcoes().length === 1);
} catch (e) {
  erroLaco = e;
}
ok('nenhuma exceção no laço principal', erroLaco === null, erroLaco && erroLaco.message);

console.log('\n' + (falhas ? 'FALHAS: ' + falhas : 'SMOKE TEST PASSOU'));
process.exit(falhas ? 1 : 0);

