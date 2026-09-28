"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const RAIZ = path.join(__dirname, "..", "js");

function noop() {}
function vec() {
  return {
    x: 0,
    y: 0,
    z: 0,
    clone() {
      return vec();
    },
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    },
    copy() {
      return this;
    },
    addScaledVector() {
      return this;
    },
    distanceTo() {
      return 99;
    },
  };
}
function mat() {
  return {
    color: { setHex() {} },
    emissive: { setHex() {} },
    emissiveIntensity: 0,
    opacity: 1,
    transparent: false,
    depthWrite: true,
    roughness: 0.9,
    metalness: 0,
    clone() {
      return mat();
    },
    dispose() {},
  };
}
function geo() {
  return {
    type: "BoxGeometry",
    dispose() {},
    computeVertexNormals() {},
    setFromPoints() {
      return this;
    },
    setAttribute() {},
    attributes: {
      position: {
        count: 24,
        getX: () => 0,
        getY: () => 0,
        getZ: () => 0,
        setXYZ() {},
        needsUpdate: false,
        array: new Float32Array(72),
      },
      uv: {
        count: 24,
        getX: () => 0,
        getY: () => 0,
        setXY() {},
        needsUpdate: false,
        array: new Float32Array(48),
      },
    },
  };
}
function cor() {
  return {
    r: 0,
    g: 0,
    b: 0,
    setHex() {
      return this;
    },
    getHex() {
      return 0;
    },
    set() {
      return this;
    },
    setRGB(r, g, b) {
      this.r = r;
      this.g = g;
      this.b = b;
      return this;
    },
    copy(o) {
      this.r = o.r;
      this.g = o.g;
      this.b = o.b;
      return this;
    },
  };
}
function obj(nome) {
  const eixos = () => ({
    x: 0,
    y: 0,
    z: 0,
    set() {
      return this;
    },
  });
  const base = {
    _stub: nome,
    children: [],
    parent: null,
    userData: {},
    visible: true,
    position: vec(),
    rotation: eixos(),
    scale: {
      x: 1,
      y: 1,
      z: 1,
      set() {
        return this;
      },
      setScalar(v) {
        this.x = this.y = this.z = v;
        return this;
      },
      multiplyScalar(v) {
        this.x *= v;
        this.y *= v;
        this.z *= v;
        return this;
      },
    },
    material: mat(),
    isMesh: true,
    renderOrder: 0,
    castShadow: false,
    receiveShadow: false,
    geometry: geo(),
    type: nome,
    color: cor(),
    groundColor: cor(),
    emissive: cor(),
    classList: {
      _s: new Set(),
      add() {
        [...arguments].forEach((c) => this._s.add(c));
      },
      remove() {
        [...arguments].forEach((c) => this._s.delete(c));
      },
      toggle(c, f) {
        if (f === undefined) f = !this._s.has(c);
        f ? this._s.add(c) : this._s.delete(c);
      },
      contains(c) {
        return this._s.has(c);
      },
    },
    clone() {
      return obj(nome);
    },
  };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "symbol") return undefined;
      return (t[k] = function () {
        return undefined;
      });
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}
function grupo() {
  const g = obj("group");
  g.add = function (f) {
    g.children.push(f);
    f.parent = g;
    return g;
  };
  g.remove = function (f) {
    const i = g.children.indexOf(f);
    if (i >= 0) g.children.splice(i, 1);
    f.parent = null;
    return g;
  };
  g.clear = function () {
    g.children.length = 0;
  };
  g.traverse = function (fn) {
    g.children.slice().forEach(fn);
  };
  g.userData = {};
  return g;
}
const ctor = (nome, extra) =>
  function () {
    return Object.assign(obj(nome), extra || {});
  };

function vector3(x, y, z) {
  const v = obj("v3");
  v.x = x || 0;
  v.y = y || 0;
  v.z = z || 0;
  v.set = (a, b, c) => {
    v.x = a;
    v.y = b;
    v.z = c;
    return v;
  };
  v.copy = (o) => {
    v.x = o.x;
    v.y = o.y;
    v.z = o.z;
    return v;
  };
  v.clone = () => vector3(v.x, v.y, v.z);
  v.addScaledVector = (o, s) => {
    v.x += o.x * s;
    v.y += o.y * s;
    v.z += o.z * s;
    return v;
  };
  v.distanceTo = (o) =>
    Math.sqrt((v.x - o.x) ** 2 + (v.y - o.y) ** 2 + (v.z - o.z) ** 2);
  return v;
}

let MEIO = 8.5;
const PONTO = { x: 0, z: 0 };
function mirarBloco(bx, bz) {
  PONTO.x = bx - MEIO;
  PONTO.z = bz - MEIO;
}

const RAIO = { lista: null, acertos: [] };

const THREE = {
  Scene: ctor("scene"),
  Group: grupo,
  Object3D: ctor("o3d"),
  PerspectiveCamera: ctor("camera"),
  WebGLRenderer: ctor("renderer", {
    domElement: {
      width: 64,
      height: 64,
      getContext: () => ctx2d(),
      toDataURL: () => "data:image/png;base64,iVBORw0KGgo=",
      style: {},
    },
    capabilities: { getMaxAnisotropy: () => 16 },
    shadowMap: {},
    getContext: () => null,
    render() {},
  }),
  Mesh: ctor("mesh"),
  Line: ctor("line"),
  Points: ctor("points"),
  Raycaster: ctor("ray", {
    ray: {
      intersectPlane: (p, alvo) => {
        alvo.x = PONTO.x;
        alvo.z = PONTO.z;
        return alvo;
      },
    },
    intersectObjects: (lista) =>
      lista && lista === RAIO.lista ? RAIO.acertos : [],
  }),
  Vector2: ctor("v2"),
  Vector3: vector3,
  Plane: ctor("plane"),
  Color: ctor("color"),
  Fog: ctor("fog", { color: cor(), near: 0, far: 0 }),
  HemisphereLight: ctor("hemi"),
  DirectionalLight: ctor("dir", {
    shadow: {
      mapSize: { width: 0, height: 0 },
      camera: {},
      bias: 0,
      normalBias: 0,
    },
  }),
  PointLight: ctor("ponto"),
  AmbientLight: ctor("ambiente"),
  SpotLight: ctor("spot"),
  Shape: ctor("shape"),
  Path: ctor("path"),
  ExtrudeGeometry: geo,
  ShapeGeometry: geo,
  BoxGeometry: geo,
  PlaneGeometry: geo,
  CylinderGeometry: geo,
  ConeGeometry: geo,
  SphereGeometry: geo,
  TorusGeometry: geo,
  DodecahedronGeometry: geo,
  BufferGeometry: geo,
  CircleGeometry: geo,
  MeshBasicMaterial: mat,
  MeshStandardMaterial: mat,
  MeshLambertMaterial: mat,
  LineBasicMaterial: mat,
  PointsMaterial: mat,
  CanvasTexture: ctor("canvasTexture"),
  BufferAttribute: function (array, item) {
    return {
      array,
      itemSize: item,
      count: array.length / item,
      needsUpdate: false,
    };
  },
  sRGBEncoding: "srgb",
  Float32Array: Float32Array,
};

function ctx2d() {
  return {
    fillStyle: "",
    strokeStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect() {},
    clearRect() {},
    fillText() {},
    strokeText() {},
    drawImage() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    stroke() {},
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 0 }),
  };
}

function elemento(nome) {
  const e = obj(nome);
  e.tagName = "DIV";
  e.style = { cssText: "", display: "" };
  e.dataset = {};
  e.hidden = false;
  e.disabled = false;
  e.id = nome;
  e._on = {};
  Object.defineProperty(e, "innerHTML", {
    get() {
      return this._h || "";
    },
    set(v) {
      this._h = v;
    },
  });
  Object.defineProperty(e, "textContent", {
    get() {
      return this._t || "";
    },
    set(v) {
      this._t = v;
    },
  });
  e.addEventListener = function (tipo, fn) {
    this._on[tipo] = fn;
  };
  e.removeEventListener = noop;
  e.getContext = () => ctx2d();
  e.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 900,
    height: 600,
  });
  e._pai = null;
  e.closest = function (s) {
    return s === ".inventario-construcao" && this._pai ? this._pai : null;
  };
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
    if (s === "[data-ferramenta]") return doc._ferramentas.slice();
    if (s === "[data-aba]") return doc._abas.slice();
    if (s.indexOf(".item-construcao") === 0) return doc._itens.slice();
    return [];
  };
  doc.createElement = (tag) => {
    const e = elemento(tag);
    e.dataset = {};
    if (String(tag).toUpperCase() === "BUTTON") doc._ferramentas.push(e);
    else {
      e._pai = { nome: ".inventario-construcao" };
      doc._itens.push(e);
    }
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
  doc.body = elemento("body");
  doc.readyState = "complete";
  doc.pointerLockElement = null;
  doc.addEventListener = (t, f) => {
    (doc._on = doc._on || {})[t] = f;
  };
  doc.removeEventListener = noop;
  doc.exitPointerLock = noop;

  const win = {
    THREE,
    console,
    document: doc,
    devicePixelRatio: 1,
    RaizTextures: null,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => {
        store[k] = String(v);
      },
      removeItem: (k) => {
        delete store[k];
      },
    },
    performance: { now: () => 0 },
    requestAnimationFrame: (cb) => {
      win._cb = cb;
      if (restantes > 0) {
        restantes--;
        cb(16);
      }
      return 0;
    },
    cancelAnimationFrame: noop,
    setTimeout: () => 0,
    clearTimeout: noop,
    setInterval: () => 0,
    clearInterval: noop,
    matchMedia: () => ({ matches: false }),
    addEventListener: (t, f) => {
      (win._on = win._on || {})[t] = f;
    },
    removeEventListener: noop,
    confirm: () => true,
    location: {
      reload: () => {
        win._recarregou = true;
      },
    },
    _store: store,
    _doc: doc,
  };
  win.window = win;
  doc.defaultView = win;
  return win;
}

function carregarJogo(win) {
  win.RaizJogo = undefined;
  win.RaizJogoCore = undefined;
  win.RaizJogoView = undefined;
  const ctx = vm.createContext(win);
  ["game-data.js", "game-core.js", "game-view.js"].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(RAIZ, f), "utf8"), ctx, {
      filename: f,
    });
  });
  return win.RaizJogoView;
}

let falhas = 0;
function ok(nome, cond, extra) {
  if (cond) console.log("  ok  " + nome);
  else {
    falhas++;
    console.log(
      "  FALHA " +
        nome +
        (extra !== undefined ? " -> " + JSON.stringify(extra) : ""),
    );
  }
}
const CHAVE = "raiz-jogo-v1";

const win = criarJanela();
const view = carregarJogo(win);
ok("jogo inicializou sem erro", !!view);
MEIO = (win.RaizJogo.GRADE - 1) / 2;
const L0 = Math.floor(win.RaizJogo.LADO_LOTE / 2) * win.RaizJogo.LOTE;
const LO = L0 - win.RaizJogo.LOTE;
const estado = view.estado();
estado.dinheiro = 9999;
estado.itens.trator = 1;

const doc = win.document;
const botao = doc._ferramentas.filter(
  (b) => b.dataset.ferramenta === "construcao",
)[0];

console.log("\n[1] abrir o modo construção");
ok("botão Modo Construção existe", !!botao);
botao._on.click();
ok("ferramenta virou construcao", estado.ferramenta === "construcao");
ok("botão ficou .ativo (bug 7)", botao.classList.contains("ativo"));
ok(
  "painel de construções aberto",
  doc
    .querySelector('[data-ui="inventario-construcao"]')
    .classList.contains("ativo"),
);
ok(
  "controles de toque liberados",
  doc.querySelector('[data-ui="controles-construcao"]').hidden === false,
);
ok(
  "barra de ferramentas continua visível (para o estado ativo aparecer)",
  doc.querySelector(".barra-ferramentas") !== null,
);
ok(
  "inventário do jogador no HUD existe",
  doc.querySelector('[data-ui="inventario-jogador"]') !== null,
);

console.log("\n[2] selecionar e posicionar");
const itemTrator = doc._itens.filter(
  (i) => i.dataset && i.dataset.itemId === "trator",
)[0];
ok("trator aparece no inventário", !!itemTrator);
itemTrator._on.pointerdown({
  preventDefault: noop,
  pointerId: 1,
  clientX: 880,
  clientY: 400,
});
ok("item ficou selecionado", itemTrator.classList.contains("selecionado"));
ok(
  "classe arrastando-item aplicada no body",
  doc.body.classList.contains("arrastando-item"),
);

const canvas = doc.querySelector("#stage");
mirarBloco(L0, L0);
win._on.pointermove({
  pointerId: 1,
  clientX: 450,
  clientY: 300,
  target: canvas,
});
const status = doc.querySelector('[data-ui="status-construcao"]').textContent;
ok("preview validado sobre bloco livre", /Soltar aqui/.test(status), status);

const girador = doc.querySelector('[data-ui="girar-construcao"]');
girador._on.click();
girador._on.click();
ok(
  "girou duas vezes (180°)",
  doc.querySelector('[data-ui="angulo-construcao"]').textContent === "180°",
  doc.querySelector('[data-ui="angulo-construcao"]').textContent,
);

console.log("\n[3] soltar (pointerup no mapa) e conferir persistência");
win._on.pointerup({
  button: 0,
  pointerType: "mouse",
  pointerId: 1,
  clientX: 450,
  clientY: 300,
  target: canvas,
});
ok(
  "construção registrada no estado",
  estado.construcoes.length === 1,
  estado.construcoes,
);
ok(
  "posição e rotação salvas",
  estado.construcoes[0].itemId === "trator" &&
    estado.construcoes[0].blocoX === L0 &&
    estado.construcoes[0].blocoZ === L0 &&
    estado.construcoes[0].rotacao === 2,
  estado.construcoes[0],
);
ok(
  "estado.itens NÃO foi debitado",
  estado.itens.trator === 1,
  estado.itens.trator,
);
ok(
  "classe arrastando-item removida",
  !doc.body.classList.contains("arrastando-item"),
);
ok("salvou no localStorage", !!win._store[CHAVE]);
const salvo = JSON.parse(win._store[CHAVE]);
ok(
  "JSON contém a construção",
  Array.isArray(salvo.construcoes) && salvo.construcoes.length === 1,
);

console.log("\n[4] recarregar a página: a construção tem que voltar");
const win2 = criarJanela();
win2.localStorage.setItem(CHAVE, win._store[CHAVE]);
const view2 = carregarJogo(win2);
ok("jogo recarregou", !!view2);
const estado2 = view2.estado();
ok(
  "construção voltou do save",
  estado2.construcoes.length === 1,
  estado2.construcoes,
);
ok("rotação preservada", estado2.construcoes[0].rotacao === 2);
ok("nenhum item duplicado", estado2.itens.trator === 1, estado2.itens.trator);
const disponivel = win2.RaizJogoCore.construcoesDoItem(estado2, "trator");
ok("disponível = 0 com a unidade já no mapa", disponivel === 0, disponivel);

console.log("\n[5] não empilha no mesmo bloco");
const doc2 = win2.document;
const botao2 = doc2._ferramentas.filter(
  (b) => b.dataset.ferramenta === "construcao",
)[0];
botao2._on.click();
ok(
  "modo construção aberto na nova sessão",
  estado2.ferramenta === "construcao",
);
const item2 = doc2._itens.filter(
  (i) => i.dataset && i.dataset.itemId === "trator",
)[0];
ok(
  "item aparece como indisponível",
  !item2 || item2.classList.contains("sem-item"),
);

console.log("\n[6] marreta: prévia e remoção");
const marreta = doc2._itens.filter(
  (i) => i.dataset && i.dataset.itemId === "marreta",
)[0];
ok("marreta presente no inventário", !!marreta);
marreta._on.click();
ok("modo marreta armado", doc2.body.classList.contains("modo-deletar"));
const statusMarreta = doc2.querySelector(
  '[data-ui="status-construcao"]',
).textContent;

ok(
  "status explica a marreta",
  /Marreta armada/.test(statusMarreta),
  statusMarreta,
);

console.log("\n[7] sair do modo construção devolve o estado anterior");
botao2._on.click();
ok(
  "voltou da ferramenta construcao",
  estado2.ferramenta === "plantar",
  estado2.ferramenta,
);
ok("botão perdeu o estado ativo", !botao2.classList.contains("ativo"));
ok(
  "painel de construções fechado",
  !doc2
    .querySelector('[data-ui="inventario-construcao"]')
    .classList.contains("ativo"),
);
ok(
  "controles escondidos",
  doc2.querySelector('[data-ui="controles-construcao"]').hidden === true,
);
ok(
  "corpo sem modo-construcao",
  !doc2.body.classList.contains("modo-construcao"),
);
ok(
  "barra central voltou a ser Ferramentas",
  doc2.querySelector('[data-ui="titulo-centro"]').textContent === "Ferramentas",
  doc2.querySelector('[data-ui="titulo-centro"]').textContent,
);
ok(
  "ferramentas voltaram a aparecer",
  doc2.querySelector('[data-ui="barra-ferramentas"]').hidden === false,
);
ok(
  "botão de fechar sumiu de novo",
  doc2.querySelector('[data-ui="fechar-construcao"]').hidden === true,
);

console.log("\n[8] segundo trator em bloco livre, girado com a tecla R");
const doc3 = win2.document;
const stage3 = doc3.querySelector("#stage");
const g = win2.RaizJogoCore;
estado2.itens.trator = 2;
botao2._on.click();
ok("modo construção reaberto", estado2.ferramenta === "construcao");
const item3 = doc3._itens
  .filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === "trator")
  .pop();
ok("painel lista o trator disponível", !!item3);

item3._on.pointerdown({
  preventDefault: noop,
  pointerId: 2,
  clientX: 880,
  clientY: 400,
});
win2._on.keydown({
  key: "r",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
ok(
  "tecla R girou o preview para 90°",
  doc3.querySelector('[data-ui="angulo-construcao"]').textContent === "90°",
  doc3.querySelector('[data-ui="angulo-construcao"]').textContent,
);

mirarBloco(L0 + 1, L0);
win2._on.pointermove({
  pointerId: 2,
  clientX: 400,
  clientY: 300,
  target: stage3,
});
win2._on.pointerup({
  button: 0,
  pointerType: "mouse",
  pointerId: 2,
  clientX: 880,
  clientY: 400,
  target: item3,
});
ok(
  "clique no painel só seleciona, não posiciona",
  estado2.construcoes.length === 1,
  estado2.construcoes,
);

mirarBloco(L0 + 1, L0);
win2._on.pointermove({
  pointerId: 2,
  clientX: 400,
  clientY: 300,
  target: stage3,
});
win2._on.pointerup({
  button: 0,
  pointerType: "mouse",
  pointerId: 2,
  clientX: 400,
  clientY: 300,
  target: stage3,
});
ok(
  "segunda construção colocada no bloco livre",
  estado2.construcoes.length === 2,
  estado2.construcoes,
);
ok(
  "segunda construção no bloco vizinho",
  estado2.construcoes[1].blocoX === L0 + 1 &&
    estado2.construcoes[1].blocoZ === L0,
  estado2.construcoes[1],
);
ok(
  "giro de 90° salvo no estado",
  estado2.construcoes[1].rotacao === 1,
  estado2.construcoes[1],
);
ok(
  "disponível volta a 0 com as duas unidades no mapa",
  g.construcoesDoItem(estado2, "trator") === 0,
);

console.log("\n[8b] não empilha: bloco já ocupado é recusado");
estado2.itens.trator = 3;
if (estado2.ferramenta === "construcao") botao2._on.click();
botao2._on.click();
ok(
  "modo construção ligado para o teste de sobreposição",
  estado2.ferramenta === "construcao",
);
const item3b = doc3._itens
  .filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === "trator")
  .pop();
item3b._on.pointerdown({
  preventDefault: noop,
  pointerId: 4,
  clientX: 880,
  clientY: 400,
});
mirarBloco(L0, L0);
win2._on.pointermove({
  pointerId: 4,
  clientX: 400,
  clientY: 300,
  target: stage3,
});
const statusOcupado = doc3.querySelector(
  '[data-ui="status-construcao"]',
).textContent;
ok(
  "preview avisa que o bloco está ocupado",
  /construcao nesse bloco/.test(statusOcupado),
  statusOcupado,
);
win2._on.pointerup({
  button: 0,
  pointerType: "mouse",
  pointerId: 4,
  clientX: 400,
  clientY: 300,
  target: stage3,
});
ok(
  "não colocou sobre bloco ocupado",
  estado2.construcoes.length === 2,
  estado2.construcoes,
);
ok(
  "unidade preservada após recusa",
  g.construcoesDoItem(estado2, "trator") === 1,
);

console.log(
  "\n[9] TOQUE: arrastar do inventário até o mapa e soltar com o dedo",
);
if (estado2.ferramenta === "construcao") botao2._on.click();
estado2.itens.composteira = 1;
botao2._on.click();
const itemToque = doc3._itens
  .filter(
    (i) => i._on && i._on.pointerdown && i.dataset.itemId === "composteira",
  )
  .pop();
ok("composteira disponível para o toque", !!itemToque);

itemToque._on.pointerdown({
  preventDefault: noop,
  pointerId: 30,
  clientX: 860,
  clientY: 420,
  pointerType: "touch",
});
ok("toque selecionou o item", itemToque.classList.contains("selecionado"));
ok(
  "arraste com o dedo em curso",
  doc3.body.classList.contains("arrastando-item"),
);

mirarBloco(L0, L0 + 1);
win2._on.pointermove({
  pointerId: 30,
  clientX: 430,
  clientY: 310,
  target: stage3,
  pointerType: "touch",
});
ok(
  "preview verde sobre bloco livre com o dedo",
  /Soltar aqui/.test(
    doc3.querySelector('[data-ui="status-construcao"]').textContent,
  ),
  doc3.querySelector('[data-ui="status-construcao"]').textContent,
);

const antesToque = estado2.construcoes.length;
win2._on.pointerup({
  button: -1,
  pointerType: "touch",
  pointerId: 30,
  clientX: 430,
  clientY: 310,
  target: stage3,
});
ok(
  "toque colocou a construção",
  estado2.construcoes.length === antesToque + 1,
  estado2.construcoes,
);
ok(
  "construção do toque está no bloco abaixo",
  estado2.construcoes.some((c) => c.blocoX === L0 && c.blocoZ === L0 + 1),
  estado2.construcoes,
);
ok("classe de arraste limpa", !doc3.body.classList.contains("arrastando-item"));

console.log("\n[9b] TOQUE: cancelar com o botão da UI");
estado2.itens.painel = 1;
if (estado2.ferramenta === "construcao") botao2._on.click();
botao2._on.click();
const itemToque2 = doc3._itens
  .filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === "painel")
  .pop();
ok("painel disponível para o toque", !!itemToque2);
itemToque2._on.pointerdown({
  preventDefault: noop,
  pointerId: 31,
  clientX: 860,
  clientY: 420,
  pointerType: "touch",
});
ok(
  "segundo arraste com o dedo em curso",
  doc3.body.classList.contains("arrastando-item"),
);
doc3.querySelector('[data-ui="cancelar-construcao"]')._on.click();
ok(
  "botão Cancelar limpou o arraste",
  !doc3.body.classList.contains("arrastando-item"),
);
ok(
  "Cancelar não colocou nada",
  !estado2.construcoes.some((c) => c.itemId === "painel"),
);
ok(
  "Cancelar mantém o modo construção ligado",
  estado2.ferramenta === "construcao",
);

console.log("\n[9c] TOQUE: girar com o botão da UI antes de soltar");
estado2.itens.poste = 1;
if (estado2.ferramenta === "construcao") botao2._on.click();
botao2._on.click();
const itemToque3 = doc3._itens
  .filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === "poste")
  .pop();
ok("poste disponível para o toque", !!itemToque3);
itemToque3._on.pointerdown({
  preventDefault: noop,
  pointerId: 40,
  clientX: 860,
  clientY: 420,
  pointerType: "touch",
});
mirarBloco(L0 + 2, L0);
win2._on.pointermove({
  pointerId: 40,
  clientX: 430,
  clientY: 310,
  target: stage3,
  pointerType: "touch",
});
doc3.querySelector('[data-ui="girar-construcao"]')._on.click();
ok(
  "botão Girar funciona no toque (90°)",
  doc3.querySelector('[data-ui="angulo-construcao"]').textContent === "90°",
  doc3.querySelector('[data-ui="angulo-construcao"]').textContent,
);
win2._on.pointerup({
  button: -1,
  pointerType: "touch",
  pointerId: 40,
  clientX: 430,
  clientY: 310,
  target: stage3,
});
ok(
  "toque com rotação colocou o poste virado 90°",
  estado2.construcoes.some(
    (c) =>
      c.itemId === "poste" &&
      c.blocoX === L0 + 2 &&
      c.blocoZ === L0 &&
      c.rotacao === 1,
  ),
  estado2.construcoes,
);

console.log("\n[10] cancelar com Esc durante o arraste");
if (estado2.ferramenta === "construcao") botao2._on.click();
estado2.itens.turbina = 1;
botao2._on.click();
const item4b = doc3._itens
  .filter((i) => i._on && i._on.pointerdown && i.dataset.itemId === "turbina")
  .pop();
ok("turbina disponível", !!item4b);
item4b._on.pointerdown({
  preventDefault: noop,
  pointerId: 3,
  clientX: 880,
  clientY: 400,
});
ok("arraste começou", doc3.body.classList.contains("arrastando-item"));
const antesEsc = estado2.construcoes.length;
win2._on.keydown({
  key: "Escape",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
ok("Esc cancelou o arraste", !doc3.body.classList.contains("arrastando-item"));
ok(
  "Esc não colocou nada",
  estado2.construcoes.length === antesEsc,
  estado2.construcoes.length,
);
ok(
  "Esc não fechou o modo (item ainda em uso)",
  estado2.ferramenta === "construcao",
);

console.log("\n[10b] expandir terreno atualiza a grade sem sair do modo");
const antes = estado2.construcoes.length;
estado2.dinheiro = 9999;
const r = g.expandir(
  estado2,
  LO / win.RaizJogo.LOTE,
  L0 / win.RaizJogo.LOTE,
  "fertil",
);
ok("comprou lote vizinho", r.ok, r.msg);
ok(
  "construções intactas após comprar lote",
  estado2.construcoes.length === antes,
  estado2.construcoes.length,
);
ok(
  "lote novo tem blocos liberados",
  [0, 1, 2].every((x) => !g.blocoEm(estado2, LO + x, L0 + 1).bloqueado),
);
ok(
  "dá para construir no lote novo",
  g.conferirConstrucao(estado2, g.blocoEm(estado2, LO + 1, L0 + 1)).ok,
);
ok(
  "continua bloqueado o bloco já ocupado",
  !g.conferirConstrucao(estado2, g.blocoEm(estado2, L0, L0)).ok,
);

console.log("\n[11] reset da fazenda");
const reiniciar = doc3.querySelector('[data-ui="reiniciar"]');
reiniciar._on.click();
ok("apagou o save", win2._store[CHAVE] === undefined);
ok("chamou reload", win2._recarregou === true);

const win3 = criarJanela();
const view3 = carregarJogo(win3);
ok("nova fazenda sem construções", view3.estado().construcoes.length === 0);
ok(
  "nova fazenda sem itens constructos",
  view3.estado().itens.trator === undefined,
);
ok(
  "nova fazenda com o lote inicial",
  Object.keys(view3.estado().lotes).length === 1,
);

console.log(
  "\n[11] laço principal com construções no mapa (física, colisão, animação)",
);
const winLaco = criarJanela(3);
winLaco.localStorage.setItem(CHAVE, win._store[CHAVE]);
let erroLaco = null;
try {
  const viewLaco = carregarJogo(winLaco);
  ok("jogo com laço rodou sem erro", !!viewLaco);
  ok("construção presente durante o laço", viewLaco.construcoes().length === 1);
} catch (e) {
  erroLaco = e;
}
ok(
  "nenhuma exceção no laço principal",
  erroLaco === null,
  erroLaco && erroLaco.message,
);

function rodarFrames(win, n) {
  win._relogio = win._relogio || 0;
  for (let i = 0; i < n; i++) {
    win._relogio += 16;
    win._cb(win._relogio);
  }
}

console.log("\n[12] MODO DIREÇÃO: subir no trator e dirigir");
const saveTrator = JSON.parse(win._store[CHAVE]);
saveTrator.construcoes = [
  { itemId: "trator", blocoX: L0, blocoZ: L0, rotacao: 0 },
];
const winV = criarJanela();
winV.localStorage.setItem(CHAVE, JSON.stringify(saveTrator));
const viewV = carregarJogo(winV);
winV.DEBUG_EFEITOS = true;
const docV = winV.document;
const stageV = docV.querySelector("#stage");
const estadoV = viewV.estado();
const trator = viewV.malhasConstrucao()[0];
ok("trator do save virou uma malha no mapa", !!trator);
ok(
  "a malha sabe onde está",
  trator.userData.blocoX === L0 && trator.userData.blocoZ === L0,
);
ok(
  "o modelo do trator carrega a posição do banco",
  !!trator.userData.banco,
  trator.userData.banco,
);
ok("não se dirige sem clicar nele", viewV.veiculo().ativo === false);

RAIO.lista = viewV.malhasConstrucao();
RAIO.acertos = [{ object: trator }];
stageV._on.pointerdown({ button: 0, pointerType: "mouse" });
winV._on.pointerup({
  button: 0,
  pointerType: "mouse",
  clientX: 450,
  clientY: 300,
  target: stageV,
});
ok("clique no trator sobe no banco", viewV.veiculo().ativo === true);
ok("a malha ficou marcada como dirigida", trator.userData.dirigindo === true);
ok(
  "painel de pilotagem apareceu",
  docV.querySelector('[data-ui="painel-veiculo"]').hidden === false,
);
ok(
  "painel mostra o nome do veículo",
  docV.querySelector('[data-ui="veiculo-nome"]').textContent ===
    "Trator Antigo",
  docV.querySelector('[data-ui="veiculo-nome"]').textContent,
);
ok("o fazendeiro virou filho do veículo", trator.children.length > 0);
ok(
  "nada foi construído a mais ao subir",
  estadoV.construcoes.length === 1,
  estadoV.construcoes,
);

const coreV = winV.RaizJogoCore;
const fertAntes = {};
[0, 1, 2].forEach((dx) =>
  [0, 1, 2].forEach((dz) => {
    fertAntes[dx + "," + dz] = coreV.blocoEm(
      estadoV,
      L0 + dx,
      L0 + dz,
    ).fertilidade;
  }),
);
const zAntes = trator.position.z;
winV._on.keydown({
  key: "w",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
rodarFrames(winV, 40);
ok(
  "o trator andou para a frente",
  trator.position.z > zAntes,
  trator.position.z,
);
ok(
  "ganhou velocidade",
  viewV.veiculo().velocidade > 0,
  viewV.veiculo().velocidade,
);
ok(
  "a âncora do trator avançou de bloco, dentro do terreno do jogador",
  estadoV.construcoes[0].blocoX === L0 &&
    estadoV.construcoes[0].blocoZ > L0 &&
    estadoV.construcoes[0].blocoZ <= L0 + 2,
  estadoV.construcoes[0],
);
ok(
  "o solo por onde passou foi trabalhado",
  [0, 1, 2].some((dx) =>
    [0, 1, 2].some(
      (dz) =>
        coreV.blocoEm(estadoV, L0 + dx, L0 + dz).fertilidade >
        fertAntes[dx + "," + dz],
    ),
  ),
);
ok(
  "continua sendo uma construção do jogador (não virou outro item)",
  estadoV.construcoes.length === 1,
);
winV._on.keyup({ key: "w", target: { tagName: "DIV" } });

stageV._on.pointerdown({ button: 0, pointerType: "mouse" });
winV._on.pointerup({
  button: 0,
  pointerType: "mouse",
  clientX: 450,
  clientY: 300,
  target: stageV,
});
ok("dirigindo, o mapa não solta ferramenta", viewV.veiculo().ativo === true);

winV._on.keydown({
  key: "e",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
ok("tecla E desceu do veículo", viewV.veiculo().ativo === false);
ok(
  "painel de pilotagem sumiu",
  docV.querySelector('[data-ui="painel-veiculo"]').hidden === true,
);
ok("a malha deixou de estar dirigida", trator.userData.dirigindo === false);
ok("o trator ficou no terreno, não deletado", estadoV.construcoes.length === 1);
const salvoV = JSON.parse(winV._store[CHAVE]).construcoes[0];
ok(
  "a posição em que parou foi salva no storage",
  salvoV.blocoX === estadoV.construcoes[0].blocoX &&
    salvoV.blocoZ === estadoV.construcoes[0].blocoZ,
  salvoV,
);

RAIO.acertos = [{ object: trator }];
stageV._on.pointerdown({ button: 0, pointerType: "mouse" });
winV._on.pointerup({
  button: 0,
  pointerType: "mouse",
  clientX: 450,
  clientY: 300,
  target: stageV,
});
ok("subiu de novo", viewV.veiculo().ativo === true);
winV._on.keydown({
  key: "1",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
ok("trocar de ferramenta desce do trator", viewV.veiculo().ativo === false);
ok(
  "e a ferramenta escolhida entrou no lugar",
  estadoV.ferramenta === "plantar",
  estadoV.ferramenta,
);
ok("o trator continua no terreno", estadoV.construcoes.length === 1);

RAIO.acertos = [{ object: trator }];
stageV._on.pointerdown({ button: -1, pointerType: "touch" });
winV._on.pointerup({
  button: -1,
  pointerType: "touch",
  clientX: 450,
  clientY: 300,
  target: stageV,
});
ok("toque também sobe no trator", viewV.veiculo().ativo === true);
docV.querySelector('[data-ui="descer-veiculo"]')._on.click();
ok(
  "botão Descer devolve o fazendeiro ao chão",
  viewV.veiculo().ativo === false,
);
RAIO.acertos = [];
RAIO.lista = null;

console.log("\n[14] MODO DIREÇÃO: dirigibilidade e acabamento do modelo");
RAIO.lista = viewV.malhasConstrucao();
RAIO.acertos = [{ object: trator }];
stageV._on.pointerdown({ button: 0, pointerType: "mouse" });
winV._on.pointerup({
  button: 0,
  pointerType: "mouse",
  clientX: 450,
  clientY: 300,
  target: stageV,
});
ok("subiu para testar o pivô", viewV.veiculo().ativo === true);
ok(
  "a malha do teste é a mesma que o jogo dirige",
  viewV.veiculo().item === trator,
);
rodarFrames(winV, 2);
const xAntesPivo = trator.position.x;
const zAntesPivo = trator.position.z;
const giroParado = trator.rotation.y;
winV._on.keydown({
  key: "a",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
ok("a tecla A chegou no jogo", viewV.teclas().a === true, viewV.teclas());
rodarFrames(winV, 20);
winV._on.keyup({ key: "a", target: { tagName: "DIV" } });
ok("gira no lugar, com o trator parado", trator.rotation.y > giroParado, {
  de: giroParado,
  para: trator.rotation.y,
});
ok(
  "não andou nada girando no lugar",
  Math.abs(trator.position.x - xAntesPivo) < 0.01 &&
    Math.abs(trator.position.z - zAntesPivo) < 0.01,
  {
    x: trator.position.x,
    de: xAntesPivo,
    z: trator.position.z,
    deZ: zAntesPivo,
  },
);
docV.querySelector('[data-ui="descer-veiculo"]')._on.click();

ok(
  "o modelo tem as rodas dianteiras registradas",
  Array.isArray(trator.userData.esterco) &&
    trator.userData.esterco.length === 2,
  trator.userData.esterco,
);
RAIO.acertos = [{ object: trator }];
stageV._on.pointerdown({ button: 0, pointerType: "mouse" });
winV._on.pointerup({
  button: 0,
  pointerType: "mouse",
  clientX: 450,
  clientY: 300,
  target: stageV,
});
winV._on.keydown({
  key: "w",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
winV._on.keydown({
  key: "d",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
rodarFrames(winV, 25);
ok(
  "as rodas dianteiras esterçaram para o outro lado",
  trator.userData.esterco[0].rotation.y > 0,
  trator.userData.esterco[0].rotation.y,
);
ok(
  "a carroceria inclinou na curva para o lado do volante",
  trator.rotation.z > 0,
  trator.rotation.z,
);
winV._on.keyup({ key: "a", target: { tagName: "DIV" } });
winV._on.keyup({ key: "d", target: { tagName: "DIV" } });
winV._on.keyup({ key: "w", target: { tagName: "DIV" } });
docV.querySelector('[data-ui="descer-veiculo"]')._on.click();
ok(
  "descendo, a inclinação volta ao normal",
  trator.rotation.z === 0,
  trator.rotation.z,
);

ok("o trator antigo é marcado como diesel", trator.userData.diesel === true);
ok(
  "tem boca de escapamento marcada",
  !!trator.userData.fumaca,
  trator.userData.fumaca,
);
ok(
  "tem faróis que acendem à noite",
  !!trator.userData.luzFarol && !!trator.userData.farois,
);
ok("os mostradores do painel existem", !!trator.userData.painel);

RAIO.acertos = [{ object: trator }];
stageV._on.pointerdown({ button: 0, pointerType: "mouse" });
winV._on.pointerup({
  button: 0,
  pointerType: "mouse",
  clientX: 450,
  clientY: 300,
  target: stageV,
});
ok("subiu para o teste da fumaça", viewV.veiculo().ativo === true);
rodarFrames(winV, 70);
viewV.veiculo().tempoFumaca = 1;
const fumacaAntes = viewV.particulas();
winV._on.keydown({
  key: "w",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
rodarFrames(winV, 1);
winV._on.keyup({ key: "w", target: { tagName: "DIV" } });
ok(
  "acelerar já solta a fumaça do escapamento",
  viewV.particulas() > fumacaAntes,
  { antes: fumacaAntes, depois: viewV.particulas() },
);
docV.querySelector('[data-ui="descer-veiculo"]')._on.click();
RAIO.acertos = [];
RAIO.lista = null;

console.log("\n[13] MODO DIREÇÃO: volante e trator elétrico");
RAIO.lista = viewV.malhasConstrucao();
RAIO.acertos = [{ object: trator }];
stageV._on.pointerdown({ button: 0, pointerType: "mouse" });
winV._on.pointerup({
  button: 0,
  pointerType: "mouse",
  clientX: 450,
  clientY: 300,
  target: stageV,
});
ok("subiu para testar o volante", viewV.veiculo().ativo === true);
const giroAntes = trator.rotation.y;
const xAntes = trator.position.x;
const zAntesRumo = trator.position.z;
const ux = Math.sin(giroAntes);
const uz = Math.cos(giroAntes);
winV._on.keydown({
  key: "w",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
winV._on.keydown({
  key: "a",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
rodarFrames(winV, 30);
winV._on.keyup({ key: "a", target: { tagName: "DIV" } });
winV._on.keyup({ key: "w", target: { tagName: "DIV" } });
ok(
  "o volante girou o trator",
  trator.rotation.y !== giroAntes,
  trator.rotation.y,
);
const dx = trator.position.x - xAntes;
const dz = trator.position.z - zAntesRumo;
const paraEsquerda = dx * uz - dz * ux;
ok("virou para a esquerda do próprio rumo", paraEsquerda > 0.05, {
  dx: dx,
  dz: dz,
  esquerda: paraEsquerda,
});
docV.querySelector('[data-ui="descer-veiculo"]')._on.click();

const saveEletrico = JSON.parse(win._store[CHAVE]);
saveEletrico.construcoes = [
  { itemId: "tratorEletrico", blocoX: L0, blocoZ: L0, rotacao: 0 },
];
saveEletrico.itens.tratorEletrico = 1;
saveEletrico.energia = 12;
const winE = criarJanela();
winE.localStorage.setItem(CHAVE, JSON.stringify(saveEletrico));
const viewE = carregarJogo(winE);
const docE = winE.document;
const stageE = docE.querySelector("#stage");
const eletrico = viewE.malhasConstrucao()[0];
ok(
  "trator elétrico está no mapa",
  !!eletrico && eletrico.userData.itemId === "tratorEletrico",
);
RAIO.lista = viewE.malhasConstrucao();
RAIO.acertos = [{ object: eletrico }];
stageE._on.pointerdown({ button: 0, pointerType: "mouse" });
winE._on.pointerup({
  button: 0,
  pointerType: "mouse",
  clientX: 450,
  clientY: 300,
  target: stageE,
});
ok(
  "trator elétrico também aceita o fazendeiro",
  viewE.veiculo().ativo === true,
);
ok(
  "painel mostra o nome do elétrico",
  docE.querySelector('[data-ui="veiculo-nome"]').textContent ===
    "Trator Elétrico",
  docE.querySelector('[data-ui="veiculo-nome"]').textContent,
);
const energiaAntes = viewE.estado().energia;
winE._on.keydown({
  key: "w",
  target: { tagName: "DIV" },
  preventDefault: noop,
});
rodarFrames(winE, 40);
winE._on.keyup({ key: "w", target: { tagName: "DIV" } });
ok(
  "o elétrico andou",
  viewE.construcoes()[0].blocoZ > L0,
  viewE.construcoes()[0],
);
ok(
  "lavrar andando consome energia do elétrico",
  viewE.estado().energia < energiaAntes,
  { antes: energiaAntes, depois: viewE.estado().energia },
);
docE.querySelector('[data-ui="descer-veiculo"]')._on.click();
ok("desceu do elétrico", viewE.veiculo().ativo === false);
RAIO.acertos = [];
RAIO.lista = null;

console.log("\n" + (falhas ? "FALHAS: " + falhas : "SMOKE TEST PASSOU"));
process.exit(falhas ? 1 : 0);
