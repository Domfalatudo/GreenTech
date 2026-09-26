(function (global) {
  'use strict';

  var THREE = global.THREE;
  var D = global.RaizJogo;
  var C = global.RaizJogoCore;
  if (!THREE || !D || !C) {
    console.warn('Raiz: o jogo precisa de three.js, game-data.js e game-core.js.');
    return;
  }

  var TEX = global.RaizTextures || null;
  var PAL = {
    soloSeco: 0xa8895f,
    soloUmido: 0x6f5334,
    soloFertil: 0x5d7a3f,
    soloPoluido: 0x4a4740,
    mata: 0x4f7a3a,
    terrenoVazio: 0x7d7568,
    base: 0x6b7a52
  };

  var FERRAMENTAS = [
    { id: 'plantar', nome: 'Plantar', tipo: 'acao', cor: '#6f9a4a' },
    { id: 'regar', nome: 'Regar', tipo: 'acao', cor: '#4a90a8' },
    { id: 'adubar', nome: 'Adubar', tipo: 'acao', cor: '#8a6b3f' },
    { id: 'colher', nome: 'Colher', tipo: 'acao', cor: '#d8b64a' },
    { id: 'despoluir', nome: 'Despoluir', tipo: 'acao', cor: '#a4402f' },
    { id: 'enxada', nome: 'Enxada', tipo: 'item', cor: '#9c8b6e' },
    { id: 'regador', nome: 'Regador', tipo: 'item', cor: '#3f7a8f' },
    { id: 'arvore', nome: 'Reflorestar', tipo: 'item', cor: '#2f6b3a' }
  ];

  var estado = null;
  var selecionado = null;
  var abaAtual = 'equipamentos';
  var loteEmEscolha = null;

  var cena, camera, renderer, tabuleiro, grupoBlocos, grupoEstruturas;
  var malhasBloco = [];
  var malhaSelecao = null;
  var malhaFazendeiro = null;
  var luzes = {};
  var chuva = null;
  var relogioAnterior = 0;
  var ultimoAviso = 0;
  var houveEstruturaNoturna = false;
  var reduzirMovimento = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TILE = 1;
  var GAP = 0.12;
  var STEP = TILE + GAP;
  var meio = ((D.GRADE - 1) * STEP) / 2;

  function el(sel) { return document.querySelector(sel); }
  function ui(nome) { return document.querySelector('[data-ui="' + nome + '"]'); }

  function aviso(texto, erro) {
    var caixa = ui('toast');
    if (!caixa) return;
    caixa.textContent = texto;
    caixa.classList.toggle('erro', !!erro);
    caixa.classList.add('visivel');
    global.clearTimeout(ultimoAviso);
    ultimoAviso = global.setTimeout(function () {
      caixa.classList.remove('visivel');
    }, 2600);
  }

  function corDoSolo(b) {
    if (b.bloqueado) return PAL.terrenoVazio;
    if (b.poluicao > 0.45) return PAL.soloPoluido;
    if (b.nativo) return PAL.mata;
    var fert = b.fertilidade;
    if (fert > 0.6) return PAL.soloFertil;
    if (b.umidade > 0.55) return PAL.soloUmido;
    return PAL.soloSeco;
  }

  function posicaoDe(b) {
    return [b.x * STEP - meio, 0, b.z * STEP - meio];
  }

  function materialBase(cor, textura, ajustes) {
    var mat = new THREE.MeshStandardMaterial(Object.assign({
      color: cor, roughness: 0.88, metalness: 0.03
    }, ajustes || {}));
    if (TEX && textura) TEX.apply(mat, textura, { normalScale: 1.4, envMapIntensity: 0.7 });
    return mat;
  }


  function geometriaBloco() {
    var g = new THREE.BoxGeometry(TILE, 0.3, TILE);
    var uv = g.attributes.uv;
    var faces = [
      [TILE, 0.3], [TILE, 0.3],
      [TILE, TILE], [TILE, TILE],
      [TILE, 0.3], [TILE, 0.3]
    ];
    for (var f = 0; f < 6; f++) {
      for (var c = 0; c < 4; c++) {
        var i = f * 4 + c;
        uv.setXY(i, uv.getX(i) * faces[f][0] * 2, uv.getY(i) * faces[f][1] * 2);
      }
    }
    uv.needsUpdate = true;
    return g;
  }

  function montarCena() {
    var palco = el('#stage');
    cena = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    if (TEX) {
      TEX.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
      var env = TEX.environment(renderer);
      if (env) cena.environment = env;
    }
    palco.appendChild(renderer.domElement);

    tabuleiro = new THREE.Group();
    cena.add(tabuleiro);
    cena.background = new THREE.Color(CORES_CEU.dia);
    cena.fog = new THREE.Fog(CORES_CEU.dia, 8, 34);
    grupoBlocos = new THREE.Group();
    grupoEstruturas = new THREE.Group();
    tabuleiro.add(grupoBlocos, grupoEstruturas);

    var geo = geometriaBloco();
    estado.blocos.forEach(function (b) {
      var p = posicaoDe(b);
      var malha = new THREE.Mesh(geo, materialBase(corDoSolo(b), 'soil'));
      malha.position.set(p[0], b.bloqueado ? -0.08 : 0, p[2]);
      malha.userData.bloco = b;
      malha.receiveShadow = true;
      grupoBlocos.add(malha);
      malhasBloco.push(malha);
    });

    // terreno base: da a sensacao de propriedade continua
    var base = new THREE.Mesh(
      new THREE.BoxGeometry(D.GRADE * STEP + 1.2, 0.5, D.GRADE * STEP + 1.2),
      materialBase(PAL.base, 'soil', { roughness: 0.95 })
    );
    base.position.y = -0.45;
    base.receiveShadow = true;
    tabuleiro.add(base);

    malhaSelecao = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE * 1.04, TILE * 1.04),
      new THREE.MeshBasicMaterial({ color: 0xbfe6c6, transparent: true, opacity: 0.3, depthWrite: false })
    );
    malhaSelecao.rotation.x = -Math.PI / 2;
    malhaSelecao.position.y = 0.17;
    malhaSelecao.visible = false;
    tabuleiro.add(malhaSelecao);

    var grupo = new THREE.Group();
    var corpo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.46, 0.3), materialBase(0x2f6b5a, null, { roughness: 0.7 }));
    corpo.position.y = 0.36;
    var cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), materialBase(0xd9b38c, null, { roughness: 0.6 }));
    cabeca.position.y = 0.66;
    var chapeu = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 14), materialBase(0xd8b64a, 'brushed', { roughness: 0.5 }));
    chapeu.position.y = 0.76;
    grupo.add(corpo, cabeca, chapeu);
    tabuleiro.add(grupo);
    malhaFazendeiro = grupo;

    luzes.hemi = new THREE.HemisphereLight(0xeaf6ec, 0x4a5a4e, 0.7);
    cena.add(luzes.hemi);
    luzes.sol = new THREE.DirectionalLight(0xffffff, 1.1);
    luzes.sol.position.set(8, 14, 6);
    cena.add(luzes.sol);
    luzes.luar = new THREE.DirectionalLight(0x9fb8d8, 0.25);
    luzes.luar.position.set(-6, 8, -7);
    cena.add(luzes.luar);

    montarChuva();
    ajustarCamera(0.6, 0.72, 26);
  }

  function montarChuva() {
    var n = 700;
    var pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * D.GRADE * STEP;
      pos[i * 3 + 1] = Math.random() * 9;
      pos[i * 3 + 2] = (Math.random() - 0.5) * D.GRADE * STEP;
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    chuva = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xa8c8d8, size: 0.07, transparent: true, opacity: 0.8
    }));
    chuva.visible = false;
    tabuleiro.add(chuva);
  }

  function ajustarCamera(az, pol, dist) {
    camera.position.set(
      dist * Math.sin(pol) * Math.sin(az),
      dist * Math.cos(pol),
      dist * Math.sin(pol) * Math.cos(az)
    );
    camera.lookAt(0, 0, 0);
  }

  var FORMA_CULTURA = {
    milho: { altura: 0.62, folhas: 5, cor: 0xd8b64a, espiga: true },
    soja: { altura: 0.34, folhas: 6, cor: 0x9bb85c },
    trigo: { altura: 0.44, folhas: 3, cor: 0xdcc98a, espiga: true },
    hortalica: { altura: 0.22, folhas: 8, cor: 0x6fbf7a },
    feija: { altura: 0.26, folhas: 7, cor: 0x8a6f4e },
    girassol: { altura: 0.58, folhas: 4, cor: 0xe8b73c, flor: true }
  };

  function malhaDoCultivo(cultivo) {
    var cultura = D.CULTURAS[cultivo.id];
    var forma = FORMA_CULTURA[cultivo.id] || { altura: 0.35, folhas: 4, cor: cultura.cor };
    var pronto = cultivo.pronto;
    var avanco = Math.min(1, cultivo.progresso / cultura.dias);
    var altura = pronto ? forma.altura : forma.altura * (0.35 + avanco * 0.65);

    var g = new THREE.Group();
    var caule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.04, altura, 6),
      materialBase(pronto ? 0x8a9a4a : 0x7f9a52, null, { roughness: 0.85 })
    );
    caule.position.y = altura / 2 + 0.15;
    g.add(caule);

    var folhas = Math.max(1, Math.round(forma.folhas * (pronto ? 1 : avanco)));
    for (var i = 0; i < folhas; i++) {
      var ang = (i / folhas) * Math.PI * 2;
      var folha = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.015, 0.07),
        materialBase(forma.cor, null, { roughness: 0.8 })
      );
      folha.position.set(Math.cos(ang) * 0.1, 0.15 + altura * (0.35 + 0.5 * (i / folhas)), Math.sin(ang) * 0.1);
      folha.rotation.set(0.4, -ang, 0.2);
      g.add(folha);
    }

    if (pronto && forma.flor) {
      var flor = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), materialBase(0xe8b73c, null, { roughness: 0.5 }));
      flor.position.y = altura + 0.2;
      flor.scale.set(1, 0.4, 1);
      g.add(flor);
    } else if (pronto && forma.espiga) {
      var espiga = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), materialBase(forma.cor, null, { roughness: 0.55 }));
      espiga.position.set(0.06, altura * 0.72, 0.04);
      espiga.scale.set(0.8, 2.4, 0.8);
      g.add(espiga);
    }
    return g;
  }

  function roda(raio, largura) {
    var g = new THREE.Mesh(
      new THREE.CylinderGeometry(raio, raio, largura, 12),
      materialBase(0x2b2b2b, null, { roughness: 0.85 })
    );
    g.rotation.z = Math.PI / 2;
    return g;
  }

  function caixaDe(cor, w, h, d, textura, y) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materialBase(cor, textura));
    m.position.y = y;
    return m;
  }

  function construirVeiculo(cor, eletrico) {
    var g = new THREE.Group();
    g.add(caixaDe(cor, 0.34, 0.16, 0.44, 'brushed', 0.16));
    var cabine = caixaDe(eletrico ? 0x3f6f9a : 0x8a4a2a, 0.24, 0.18, 0.2, 'brushed', 0.33);
    cabine.position.z = 0.06;
    g.add(cabine);
    var frente = roda(0.09, 0.05);
    frente.position.set(0.18, 0.1, 0.13);
    var tras = roda(0.12, 0.08);
    tras.position.set(0.18, 0.13, -0.13);
    g.add(frente, tras);
    var motor = caixaDe(eletrico ? 0x2f4a5a : 0x4a3a30, 0.12, 0.1, 0.14, null, 0.3);
    motor.position.z = -0.16;
    g.add(motor);
    if (!eletrico) {
      var escapamento = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.02, 0.22, 6),
        materialBase(0x6b6b6b, 'brushed', { metalness: 0.6, roughness: 0.5 })
      );
      escapamento.position.set(-0.1, 0.38, -0.16);
      g.add(escapamento);
    }
    return g;
  }

  function construirDrone() {
    var g = new THREE.Group();
    g.add(caixaDe(0x3f5a68, 0.2, 0.08, 0.2, 'brushed', 0.34));
    var hastes = [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]];
    hastes.forEach(function (p) {
      var braco = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.02), materialBase(0x2f4450, 'brushed'));
      braco.position.set(p[0] / 2, 0.34, p[1] / 2);
      braco.lookAt(0, 0.34, 0);
      var helice = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.008, 10), materialBase(0x9fc4d4, null, { transparent: true, opacity: 0.6 }));
      helice.position.set(p[0], 0.36, p[1]);
      g.add(braco, helice);
    });
    return g;
  }

  function construirColheitadeira() {
    var g = new THREE.Group();
    g.add(caixaDe(0xc07a2a, 0.4, 0.24, 0.5, 'brushed', 0.2));
    var cabine = caixaDe(0x2f4450, 0.22, 0.16, 0.22, 'brushed', 0.4);
    cabine.position.z = 0.1;
    var ponta = caixaDe(0x8a5a2a, 0.5, 0.06, 0.06, 'brushed', 0.08);
    ponta.position.z = 0.36;
    var r1 = roda(0.11, 0.07); r1.position.set(0.2, 0.12, 0.16);
    var r2 = roda(0.13, 0.1); r2.position.set(0.2, 0.14, -0.16);
    g.add(cabine, ponta, r1, r2);
    return g;
  }

  function construirEnxada() {
    var g = new THREE.Group();
    var cabo = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.018, 0.6, 6), materialBase(0x8a6b3f, 'bark'));
    cabo.position.y = 0.3;
    cabo.rotation.z = 0.35;
    var lamina = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.1), materialBase(0x9aa4a8, 'brushed', { metalness: 0.6, roughness: 0.4 }));
    lamina.position.set(-0.11, 0.02, 0);
    lamina.rotation.z = 0.35;
    g.add(cabo, lamina);
    return g;
  }

  function construirRegador() {
    var g = new THREE.Group();
    var corpo = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.22, 12), materialBase(0x3f7a8f, 'brushed', { metalness: 0.4, roughness: 0.4 }));
    corpo.position.y = 0.11;
    var bico = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.2, 8), materialBase(0x3f7a8f, 'brushed', { metalness: 0.4 }));
    bico.position.set(0.14, 0.2, 0);
    bico.rotation.z = -0.9;
    var alca = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), materialBase(0x2f5f6f, 'brushed'));
    alca.position.y = 0.22;
    alca.rotation.x = Math.PI / 2;
    g.add(corpo, bico, alca);
    return g;
  }

  function construirGotejamento() {
    var g = new THREE.Group();
    var cano = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.05), materialBase(0x4a6a5a, 'brushed', { metalness: 0.4, roughness: 0.4 }));
    cano.position.y = 0.16;
    var cano2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.8), materialBase(0x4a6a5a, 'brushed', { metalness: 0.4, roughness: 0.4 }));
    cano2.position.y = 0.16;
    g.add(cano, cano2);
    for (var i = -1; i <= 1; i += 2) {
      for (var j = -1; j <= 1; j += 2) {
        var bocal = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 6), materialBase(0x2f4a3a, null));
        bocal.position.set(i * 0.3, 0.11, j * 0.3);
        bocal.rotation.x = Math.PI;
        g.add(bocal);
      }
    }
    return g;
  }

  function malhaDeEstrutura(id) {
    var eq = D.EQUIPAMENTOS[id];
    var en = D.ENERGIA[id];
    var g = new THREE.Group();

    if (id === 'arvore') {
      var tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.4, 7), materialBase(0x5a4530, 'bark'));
      tronco.position.y = 0.2;
      var copa = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), materialBase(0x4f7a3a, 'leaf'));
      copa.position.y = 0.62;
      copa.scale.set(1, 0.85, 1);
      g.add(tronco, copa);
    } else if (id === 'gotejamento') {
      g.add(construirGotejamento());
    } else if (id === 'composteira') {
      var caixote = caixaDe(0x6f5a3f, 0.36, 0.26, 0.36, 'bark', 0.13);
      var tampa = caixaDe(0x8a6b3f, 0.4, 0.05, 0.4, 'bark', 0.28);
      var adubo = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), materialBase(0x4a3a26, 'soil'));
      adubo.position.y = 0.3;
      g.add(caixote, tampa, adubo);
    } else if (id === 'trator') {
      g.add(construirVeiculo(0x8a4a2a, false));
    } else if (id === 'tratorEletrico') {
      g.add(construirVeiculo(0x3f8f7a, true));
    } else if (id === 'drone') {
      g.add(construirDrone());
    } else if (id === 'colheitadeira') {
      g.add(construirColheitadeira());
    } else if (id === 'enxada') {
      g.add(construirEnxada());
    } else if (id === 'regador') {
      g.add(construirRegador());
    } else if (eq) {
      g.add(construirVeiculo(0x6a7a6a, true));
    } else if (en && en.id === 'painel') {
      var p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.34), materialBase(0x3f6f9a, 'solar', { metalness: 0.4, roughness: 0.2 }));
      p.position.y = 0.28;
      p.rotation.z = -0.3;
      var perna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), materialBase(0x7d8a84, 'brushed', { metalness: 0.6 }));
      perna.position.y = 0.14;
      g.add(p, perna);
    } else if (en && en.id === 'turbina') {
      var mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 8), materialBase(0xd8dcd8, 'brushed', { metalness: 0.6, roughness: 0.3 }));
      mastro.position.y = 0.45;
      var helice = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 16), materialBase(0xe8ece8, 'brushed', { metalness: 0.5, roughness: 0.3 }));
      helice.position.set(0, 0.9, 0.06);
      helice.rotation.x = Math.PI / 2;
      g.add(mastro, helice);
      g.userData.gira = helice;
    } else if (en && en.id === 'bateria') {
      var bat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.2), materialBase(0x3f5a48, 'brushed', { metalness: 0.4, roughness: 0.35 }));
      bat.position.y = 0.15;
      g.add(bat);
    } else if (en && en.id === 'poste') {
      var poste = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.1, 7), materialBase(0x6b6b62, 'brushed', { metalness: 0.5, roughness: 0.4 }));
      poste.position.y = 0.55;
      var lampada = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 10, 8),
        materialBase(0xfff0c0, null, { emissive: 0xffdd88, emissiveIntensity: 0 })
      );
      lampada.position.y = 1.14;
      g.add(poste, lampada);
      g.userData.lampada = lampada;
    } else if (en && en.id === 'caixa') {
      var caixa = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.34, 12), materialBase(0x5a8a9a, 'brushed', { metalness: 0.35, roughness: 0.4 }));
      caixa.position.y = 0.17;
      g.add(caixa);
    }
    return g;
  }

  function atualizarCena() {
    // solo: todos os 144 blocos aparecem, os travados ficam neutro
    estado.blocos.forEach(function (b, i) {
      var malha = malhasBloco[i];
      malha.material.color.setHex(corDoSolo(b));
      malha.position.y = b.bloqueado ? -0.08 : 0;
      malha.material.roughness = b.bloqueado ? 0.98 : 0.88;
    });

    // estruturas e culturas
    grupoEstruturas.clear();
    var noturnas = [];
    estado.blocos.forEach(function (b) {
      if (b.bloqueado) return;
      var p = posicaoDe(b);
      if (b.cultivo) {
        var m = malhaDoCultivo(b.cultivo);
        m.position.set(p[0], 0, p[2]);
        grupoEstruturas.add(m);
      }
      if (b.estrutura) {
        var s = malhaDeEstrutura(b.estrutura);
        s.position.set(p[0] + 0.22, 0, p[2] - 0.22);
        if (s.userData.gira) noturnas.push(s.userData.gira);
        if (s.userData.lampada) noturnas.push(s.userData.lampada);
        grupoEstruturas.add(s);
      }
    });
    noturnas.forEach(function (n) { n.userData.turno = true; });
    houveEstruturaNoturna = noturnas.length > 0;
    return noturnas;
  }


  function montarFerramentas() {
    var caixa = ui('ferramentas');
    caixa.textContent = '';
    FERRAMENTAS.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.ferramenta = f.id;
      var marca = document.createElement('span');
      marca.className = 'marca';
      marca.style.background = f.cor;
      b.appendChild(marca);
      b.appendChild(document.createTextNode(f.nome));
      b.addEventListener('click', function () {
        estado.ferramenta = f.id;
        marcarFerramenta();
      });
      caixa.appendChild(b);
    });
    marcarFerramenta();
  }

  function marcarFerramenta() {
    document.querySelectorAll('[data-ferramenta]').forEach(function (b) {
      b.classList.toggle('ativo', b.dataset.ferramenta === estado.ferramenta);
    });
  }

  function montarSementes() {
    var sel = ui('semente');
    if (!sel) return;
    sel.textContent = '';
    Object.keys(D.CULTURAS).forEach(function (id) {
      var c = D.CULTURAS[id];
      var o = document.createElement('option');
      o.value = id;
      o.textContent = c.nome + ' (' + (estado.graos[id] || 0) + ')';
      if (c.nivel > estado.nivel) o.disabled = true;
      if (id === estado.semente) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { estado.semente = sel.value; });
  }

  function usarFerramenta(b) {
    var nome = estado.ferramenta;
    var r;
    if (nome === 'plantar') r = C.acoes.plantar(estado, b);
    else if (nome === 'regar') r = C.acoes.regar(estado, b);
    else if (nome === 'adubar') r = C.acoes.adubar(estado, b);
    else if (nome === 'colher') r = C.acoes.colher(estado, b);
    else if (nome === 'despoluir') r = C.acoes.despoluir(estado, b);
    else r = C.usarEquipamento(estado, nome, b);
    aviso(r.msg, !r.ok);
    if (r.ok) { C.salvar(estado); atualizarCena(); }
    atualizarUI();
    return r;
  }

  function pintarUI() {
    var pegada = C.indiceDePegada(estado);
    var clima = D.CLIMAS[estado.clima];
    var valores = {
      dinheiro: '$' + Math.round(estado.dinheiro),
      energia: Math.floor(estado.energia) + '/' + Math.round(estado.energiaMax),
      agua: Math.floor(estado.agua) + '/' + Math.round(estado.aguaMax),
      nivel: String(estado.nivel),
      xp: estado.xp + '/' + D.XP_POR_NIVEL(estado.nivel),
      pegada: pegada + '/100',
      tempo: 'Dia ' + estado.dias + ' - ' + C.estacaoDe(estado),
      clima: clima.nome
    };
    Object.keys(valores).forEach(function (k) {
      var alvo = ui(k);
      if (alvo) alvo.textContent = valores[k];
    });
    var p = ui('pegada');
    if (p) {
      p.classList.remove('bom', 'meio', 'ruim');
      p.classList.add(pegada >= 66 ? 'bom' : (pegada >= 33 ? 'meio' : 'ruim'));
    }
  }

  function pintarInspetor() {
    var caixa = ui('inspetor');
    if (!caixa) return;
    if (!selecionado) { caixa.hidden = true; return; }
    caixa.hidden = false;
    var b = selecionado;
    ui('insp-titulo').textContent = b.bloqueado ? 'Terreno travado' : (b.nativo ? 'Mata nativa' : 'Bloco de terra');
    ui('insp-coords').textContent = 'coluna ' + (b.x + 1) + ', linha ' + (b.z + 1);
    ui('insp-selo').textContent = b.bloqueado
      ? 'Compre este lote na aba Terreno'
      : (b.cultivo ? (b.cultivo.pronto ? 'Pronto para colher' : 'Crescendo') : 'Livre');
    var dados = [
      ['umidade', b.umidade],
      ['fert', b.fertilidade],
      ['pol', b.poluicao]
    ];
    dados.forEach(function (par) {
      var pct = Math.round(par[1] * 100);
      var txt = ui('insp-' + par[0]);
      var bar = ui('bar-' + par[0]);
      if (txt) txt.textContent = pct + '%';
      if (bar) bar.style.width = pct + '%';
    });
    if (b.cultivo) {
      var c = D.CULTURAS[b.cultivo.id];
      ui('insp-cultivo').textContent = c.nome + ' - ' + Math.round((b.cultivo.progresso / c.dias) * 100) + '%';
    } else {
      ui('insp-cultivo').textContent = b.bloqueado ? 'Sem acesso' : 'Nenhum cultivo';
    }
  }


  function cartao(nome, descricao, preco, nivel, podeComprar, rotulo, aoClicar) {
    var d = document.createElement('div');
    d.className = 'cartao';
    var txt = document.createElement('div');
    txt.className = 'txt';
    var h = document.createElement('h4');
    h.textContent = nome;
    var p = document.createElement('p');
    p.textContent = descricao;
    var s = document.createElement('span');
    s.className = 'preco';
    s.textContent = preco;
    var n = document.createElement('span');
    n.className = 'nivel';
    n.textContent = nivel;
    txt.append(h, p, s, n);
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = rotulo;
    b.disabled = !podeComprar;
    b.addEventListener('click', aoClicar);
    d.append(txt, b);
    return d;
  }

  function pintarLoja() {
    var caixa = ui('loja-conteudo');
    if (!caixa) return;
    caixa.textContent = '';
    document.querySelectorAll('[data-aba]').forEach(function (b) {
      b.classList.toggle('ativo', b.dataset.aba === abaAtual);
    });

    var lista = document.createElement('div');
    lista.className = 'lista';

    if (abaAtual === 'equipamentos' || abaAtual === 'energia') {
      var fonte = abaAtual === 'equipamentos' ? D.EQUIPAMENTOS : D.ENERGIA;
      Object.keys(fonte).forEach(function (id) {
        var m = fonte[id];
        var possui = estado.itens[id] || 0;
        var podeNivel = m.nivel <= estado.nivel;
        lista.appendChild(cartao(
          m.nome + (possui ? '  x' + possui : ''),
          m.desc,
          '$' + m.custo,
          'nivel ' + m.nivel,
          podeNivel && estado.dinheiro >= m.custo,
          'Comprar',
          function () {
            var r = C.comprarItem(estado, id);
            aviso(r.msg, !r.ok);
            if (r.ok) { C.salvar(estado); atualizarCena(); }
            pintarLoja();
            atualizarUI();
          }
        ));
      });
    } else if (abaAtual === 'sementes') {
      Object.keys(D.CULTURAS).forEach(function (id) {
        var c = D.CULTURAS[id];
        var podeNivel = c.nivel <= estado.nivel;
        lista.appendChild(cartao(
          c.nome,
          c.dias + ' dias - vende por $' + c.vende + ' - ' + c.xp + ' XP',
          '$' + c.semente + ' por semente',
          'nivel ' + c.nivel,
          podeNivel && estado.dinheiro >= c.semente,
          'Comprar 1',
          function () {
            var r = C.comprarSemente(estado, id, 1);
            aviso(r.msg, !r.ok);
            if (r.ok) C.salvar(estado);
            montarSementes();
            pintarLoja();
            atualizarUI();
          }
        ));
      });
    } else {
      // se ha um lote em escolha, redesenha a escolha em vez de voltar ao mapa
      if (loteEmEscolha) {
        desenharEscolhaLote(caixa, loteEmEscolha.lx, loteEmEscolha.lz);
        return;
      }
      var mapa = document.createElement('div');
      mapa.className = 'mapa-lotes';
      var meus = {};
      Object.keys(estado.lotes).forEach(function (k) {
        var partes = k.split(':');
        meus[partes[0] + '-' + partes[1]] = true;
      });
      C.lotesTodos(estado).forEach(function (l) {
        var chave = l.lx + '-' + l.lz;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'lote-btn';
        if (meus[chave]) b.classList.add('seu');
        var vizinho = C.lotesVizinhos(estado, l.lx, l.lz).length > 0;
        if (vizinho && !meus[chave]) b.classList.add('perto');
        var marca = document.createElement('span');
        marca.className = 'c';
        marca.textContent = meus[chave] ? (l.lx === 2 && l.lz === 2 ? '🌱' : '▣') : (vizinho ? '＋' : '·');
        var txt = document.createElement('span');
        txt.textContent = meus[chave] ? ' seu lote' : (vizinho ? ' expandir' : ' distante');
        b.append(marca, txt);
        b.addEventListener('click', function () {
          if (meus[chave]) { aviso('Esse lote ja e seu.'); return; }
          if (!vizinho) { aviso('So expande para um lote vizinho.', true); return; }
          abrirEscolhaLote(l.lx, l.lz);
        });
        mapa.appendChild(b);
      });
      var nota = document.createElement('p');
      nota.className = 'coords';
      nota.style.marginTop = '14px';
      nota.textContent = 'Lotes marcados com + sao vizinhos de um terreno seu. O tipo do terreno define quanto custa e o estado em que ele vem.';
      caixa.textContent = '';
      caixa.appendChild(mapa);
      caixa.appendChild(nota);
      return;
    }
    caixa.textContent = '';
    caixa.appendChild(lista);
  }

  function abrirEscolhaLote(lx, lz) {
    loteEmEscolha = { lx: lx, lz: lz };
    desenharEscolhaLote(ui('loja-conteudo'), lx, lz);
  }

  function desenharEscolhaLote(caixa, lx, lz) {
    caixa.textContent = '';
    var voltar = document.createElement('button');
    voltar.className = 'acao-rec';
    voltar.style.width = 'auto';
    voltar.type = 'button';
    voltar.textContent = 'voltar ao mapa';
    voltar.addEventListener('click', function () {
      loteEmEscolha = null;
      pintarLoja();
    });
    caixa.appendChild(voltar);
    var lista = document.createElement('div');
    lista.className = 'lista';
    lista.style.marginTop = '14px';
    Object.keys(D.ESTADOS_LOTE).forEach(function (chave) {
      var m = D.ESTADOS_LOTE[chave];
      lista.appendChild(cartao(
        m.nome,
        m.desc,
        '$' + m.custo,
        m.bonus ? '+' + m.bonus + ' pontos ecologicos' : '',
        estado.dinheiro >= m.custo,
        'Comprar',
        function () {
          var r = C.expandir(estado, lx, lz, m.id);
          aviso(r.msg, !r.ok);
          if (r.ok) { C.salvar(estado); atualizarCena(); loteEmEscolha = null; }
          pintarLoja();
          atualizarUI();
        }
      ));
    });
    caixa.appendChild(lista);
  }

  function atualizarUI() {
    pintarUI();
    montarSementes();
    pintarInspetor();
    if (!ui('loja').hidden) pintarLoja();
  }


  var CORES_CEU = {
    madrugada: 0x2a3a52,
    amanhecer: 0xd9a878,
    dia: 0xdfe9e4,
    entardecer: 0xd98f5e,
    noite: 0x16203a
  };

  function aplicarLuz() {
    var h = estado.relogio;
    var noite = C.ehNoite(estado);
    var estacao = C.estacaoDe(estado);
    var amanhecer = h > 0.2 && h < 0.36;
    var entardecer = h > 0.66 && h < 0.84;
    var clima = D.CLIMAS[estado.clima];

    // ceu: muda de cor e simula o ceu mais proximo
    var corCeu = CORES_CEU[estacao] || CORES_CEU.dia;
    if (cena.background && cena.background.setHex) cena.background.setHex(corCeu);
    if (cena.fog) {
      cena.fog.color.setHex(corCeu);
      cena.fog.near = 8;
      cena.fog.far = 34;
    }

    var corSol = 0xffffff;
    if (amanhecer || entardecer) corSol = 0xff9f5c;
    if (noite) corSol = 0x8fa6c8;

    luzes.sol.color.setHex(corSol);
    // a noite tem que ESCURECER de verdade, nao so clarear
    luzes.sol.intensity = noite ? 0.06 : (amanhecer || entardecer ? 0.75 : 1.2);
    luzes.sol.position.set(
      Math.cos(h * Math.PI * 2) * 14,
      noite ? 6 : Math.max(1.5, Math.sin(h * Math.PI * 2) * 15),
      6
    );

    luzes.hemi.intensity = noite ? 0.1 : 0.75;
    luzes.hemi.color.setHex(noite ? 0x24304a : 0xeaf6ec);
    luzes.hemi.groundColor.setHex(noite ? 0x0d1220 : 0x4a5a4e);
    luzes.luar.intensity = noite ? 0.22 : 0.1;
    luzes.sol.intensity *= clima.solar * 0.55 + 0.45;

    if (chuva) {
      chuva.visible = clima.chuva > 0;
      if (chuva.visible) {
        var pos = chuva.geometry.attributes.position;
        for (var i = 0; i < pos.count; i++) {
          var y = pos.getY(i) - 0.16;
          pos.setY(i, y < 0.15 ? 9 : y);
        }
        pos.needsUpdate = true;
      }
    }
    return noite;
  }

  function redimensionar() {
    var palco = el('#stage');
    if (!palco) return;
    var w = Math.max(1, palco.clientWidth);
    var h = Math.max(1, palco.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function laco(agora) {
    global.requestAnimationFrame(laco);
    var dt = Math.min(0.12, (agora - relogioAnterior) / 1000 || 0);
    relogioAnterior = agora;

    C.passoSimulacao(estado, dt);
    passoCameraLivre(dt);
    var noite = aplicarLuz();

    if (noite || houveEstruturaNoturna) {
      grupoEstruturas.traverse(function (n) {
        if (!n.userData || !n.userData.turno) return;
        if (n.material && n.material.emissive) {
          n.material.emissiveIntensity = noite ? 1.4 : 0;
        }
        if (n.geometry && n.geometry.type === 'TorusGeometry') {
          n.rotation.z += dt * 3.2;
        }
      });
    }

    if (malhaFazendeiro && selecionado) {
      var alvo = posicaoDe(selecionado);
      malhaFazendeiro.position.x += (alvo[0] - malhaFazendeiro.position.x) * 0.12;
      malhaFazendeiro.position.z += (alvo[2] - malhaFazendeiro.position.z) * 0.12;
      malhaFazendeiro.rotation.y = Math.atan2(alvo[0] - malhaFazendeiro.position.x, alvo[2] - malhaFazendeiro.position.z);
    }

    var mudouDia = Math.floor(estado.relogio * 100) !== Math.floor((estado.relogio - dt / D.DIA_SEGUNDOS) * 100);
    if (mudouDia) {
      atualizarCena();
      atualizarUI();
      C.salvar(estado);
    }

    renderer.render(cena, camera);
  }


  /* ---------- camera livre (modo noclip) ---------- */
  var passoCameraLivre = function () {};

  function ligarInteracoes() {
    var palco = el('#stage');
    var mira = ui('mira');
    var ray = new THREE.Raycaster();
    var mouse = new THREE.Vector2();
    var arrastando = false;
    var moveu = false;
    var ultimoX = 0;
    var ultimoY = 0;
    var az = 0.6;
    var pol = 0.72;
    var dist = 26;

    var livre = {
      ligado: false,
      pos: new THREE.Vector3(),
      yaw: 0,
      pitch: 0,
      vel: new THREE.Vector3(),
      teclas: {},
      olhando: false,
      velo: 9
    };

    function paintMira() {
      var marcado = document.body.classList.contains('mirando');
      if (mira) mira.hidden = !marcado;
    }

    function destravarMouse() {
      if (document.exitPointerLock && document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock();
      }
    }

    function aplicarLivre() {
      var cp = Math.cos(livre.pitch);
      camera.position.copy(livre.pos);
      camera.lookAt(
        livre.pos.x - Math.sin(livre.yaw) * cp,
        livre.pos.y + Math.sin(livre.pitch),
        livre.pos.z - Math.cos(livre.yaw) * cp
      );
    }

    // entra na camera livre a partir de onde a camera de orbita esta
    function ligarLivre() {
      livre.pos.copy(camera.position);
      var dx = 0 - livre.pos.x;
      var dy = 0 - livre.pos.y;
      var dz = 0 - livre.pos.z;
      var tam = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= tam; dy /= tam; dz /= tam;
      livre.yaw = Math.atan2(-dx, -dz);
      livre.pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
      livre.vel.set(0, 0, 0);
      livre.ligado = true;
      document.body.classList.add('mirando');
      paintMira();
      if (renderer.domElement.requestPointerLock) {
        try {
          var p = renderer.domElement.requestPointerLock();
          if (p && p.catch) p.catch(function () {});
        } catch (erro) { /* sem trava: o arraste com o botao funciona igual */ }
      }
    }

    function desligarLivre() {
      livre.ligado = false;
      livre.vel.set(0, 0, 0);
      livre.teclas = {};
      livre.olhando = false;
      document.body.classList.remove('mirando');
      paintMira();
      destravarMouse();
      // volta para a camera de orbita exatamente de onde saiu
      ajustarCamera(az, pol, dist);
    }

    function alternarLivre() {
      if (livre.ligado) desligarLivre();
      else ligarLivre();
    }

    passoCameraLivre = function (dt) {
      if (!livre.ligado) return;
      var cp = Math.cos(livre.pitch);
      // frente (no plano do olhar) e direita
      var fx = -Math.sin(livre.yaw) * cp;
      var fy = Math.sin(livre.pitch);
      var fz = -Math.cos(livre.yaw) * cp;
      var rx = Math.cos(livre.yaw);
      var rz = -Math.sin(livre.yaw);

      var mx = 0;
      var mz = 0;
      var my = 0;
      var t = livre.teclas;
      if (t.w) mz += 1;
      if (t.s) mz -= 1;
      if (t.d) mx += 1;
      if (t.a) mx -= 1;
      if (t[' ']) my += 1;
      if (t.shift || t.q) my -= 1;

      // normaliza o plano para a diagonal nao correr mais que o eixo
      var plano = Math.sqrt(mx * mx + mz * mz);
      if (plano > 0) { mx /= plano; mz /= plano; }

      livre.vel.set(
        (fx * mz + rx * mx) * livre.velo,
        fy * mz + my * livre.velo,
        (fz * mz + rz * mx) * livre.velo
      );
      livre.pos.addScaledVector(livre.vel, dt);
      aplicarLivre();
    };

    function pegar(mouseX, mouseY) {
      var r = palco.getBoundingClientRect();
      mouse.x = ((mouseX - r.left) / r.width) * 2 - 1;
      mouse.y = -((mouseY - r.top) / r.height) * 2 + 1;
      ray.setFromCamera(mouse, camera);
      var hits = ray.intersectObjects(malhasBloco, false);
      return hits.length ? hits[0].object.userData.bloco : null;
    }

    palco.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      arrastando = true;
      livre.olhando = livre.ligado;
      moveu = false;
      ultimoX = ev.clientX;
      ultimoY = ev.clientY;
    });

    global.addEventListener('pointermove', function (ev) {
      if (livre.ligado) {
        if (!livre.olhando) return;
        // com o cursor travado o movimento e relativo e nao tem borda
        var mx = ev.movementX !== undefined && ev.movementX !== 0
          ? ev.movementX
          : ev.clientX - ultimoX;
        var my = ev.movementY !== undefined && ev.movementY !== 0
          ? ev.movementY
          : ev.clientY - ultimoY;
        livre.yaw -= mx * 0.0028;
        livre.pitch = Math.min(1.5, Math.max(-1.5, livre.pitch - my * 0.0028));
        ultimoX = ev.clientX;
        ultimoY = ev.clientY;
        aplicarLivre();
        return;
      }
      if (!arrastando) return;
      var dx = ev.clientX - ultimoX;
      var dy = ev.clientY - ultimoY;
      if (Math.abs(dx) + Math.abs(dy) > 3) moveu = true;
      az -= dx * 0.006;
      pol = Math.min(1.45, Math.max(0.25, pol + dy * 0.005));
      ultimoX = ev.clientX;
      ultimoY = ev.clientY;
      ajustarCamera(az, pol, dist);
    });

    global.addEventListener('pointerup', function (ev) {
      if (livre.ligado) {
        // na camera livre o botao e so para olhar, nao para usar ferramenta
        livre.olhando = false;
        arrastando = false;
        return;
      }
      if (arrastando && !moveu && ev.button === 0) {
        var b = pegar(ev.clientX, ev.clientY);
        if (b) {
          selecionado = b;
          var p = posicaoDe(b);
          malhaSelecao.position.set(p[0], 0.17, p[2]);
          malhaSelecao.visible = !b.bloqueado;
          if (!b.bloqueado) usarFerramenta(b);
          pintarInspetor();
        } else {
          selecionado = null;
          malhaSelecao.visible = false;
          pintarInspetor();
        }
      }
      arrastando = false;
    });

    function teclasDeMovimento(k) {
      return k === 'w' || k === 'a' || k === 's' || k === 'd' || k === 'q'
        || k === ' ' || k === 'shift' || k === 'r';
    }

    function nomearTecla(k) {
      if (k === 'r') return ' ';
      if (k === ' ') return ' ';
      return k;
    }

    global.addEventListener('keydown', function (ev) {
      var emCampo = ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName || '');
      if (ev.key === 'h' || ev.key === 'H') {
        if (emCampo) return;
        ev.preventDefault();
        alternarLivre();
        return;
      }
      if (ev.key === 'Escape' && livre.ligado) { desligarLivre(); return; }
      if (!livre.ligado || emCampo) return;
      var k = ev.key.toLowerCase();
      if (teclasDeMovimento(k)) {
        livre.teclas[nomearTecla(k)] = true;
        ev.preventDefault();
      }
    });

    global.addEventListener('keyup', function (ev) {
      var k = ev.key.toLowerCase();
      if (teclasDeMovimento(k)) livre.teclas[nomearTecla(k)] = false;
    });

    // se o navegador soltar o cursor (Esc do navegador), sai do modo
    document.addEventListener('pointerlockchange', function () {
      if (document.pointerLockElement !== renderer.domElement && livre.ligado) desligarLivre();
    });

    global.RaizJogoLivre = function () { return livre.ligado; };

    palco.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      if (livre.ligado) {
        // na camera livre a roda avanca e recua no sentido do olhar
        var cp = Math.cos(livre.pitch);
        var passo = -ev.deltaY * 0.012 * livre.velo;
        livre.pos.x -= Math.sin(livre.yaw) * cp * passo;
        livre.pos.y += Math.sin(livre.pitch) * passo;
        livre.pos.z -= Math.cos(livre.yaw) * cp * passo;
        aplicarLivre();
        return;
      }
      dist = Math.min(46, Math.max(7, dist + ev.deltaY * 0.02));
      ajustarCamera(az, pol, dist);
    }, { passive: false });

    document.querySelectorAll('[data-aba]').forEach(function (b) {
      b.addEventListener('click', function () {
        // clicar na aba que ja esta ativa e so um redesenho: nao pode
        // descartar a escolha de terreno em andamento
        if (b.dataset.aba !== abaAtual) {
          abaAtual = b.dataset.aba;
          loteEmEscolha = null;
        }
        pintarLoja();
      });
    });

    var abrir = ui('abrir-loja');
    if (abrir) {
      abrir.addEventListener('click', function () {
        loteEmEscolha = null;
        abaAtual = abaAtual || 'equipamentos';
        ui('loja').hidden = false;
        pintarLoja();
      });
    }
    var modal = ui('loja');
    if (modal) {
      modal.addEventListener('click', function (ev) {
        if (ev.target === modal) modal.hidden = true;
      });
    }
    global.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && modal && !modal.hidden) modal.hidden = true;
    });

    var reiniciar = ui('reiniciar');
    if (reiniciar) {
      reiniciar.addEventListener('click', function () {
        if (!global.confirm('Recomecar apaga o progresso salvo. Continuar?')) return;
        C.apagar();
        global.location.reload();
      });
    }

    global.addEventListener('resize', redimensionar);
    if (global.ResizeObserver) new global.ResizeObserver(redimensionar).observe(palco);
  }

  function erroFatal(erro) {
    console.error('Raiz jogo: falha ao iniciar.', erro);
    var painel = document.querySelector('.painel');
    if (painel) {
      painel.innerHTML = '';
      var h = document.createElement('h2');
      h.textContent = 'Nao deu para abrir a fazenda';
      var p = document.createElement('p');
      p.style.cssText = 'font-size:.78rem;color:var(--muted);word-break:break-word';
      p.textContent = (erro && (erro.message || erro)) ? String(erro.message || erro) : 'erro desconhecido';
      var dica = document.createElement('p');
      dica.style.cssText = 'font-size:.72rem;color:var(--muted);margin-top:10px';
      dica.textContent = 'Abra o console (F12) para ver o erro completo.';
      painel.appendChild(h);
      painel.appendChild(p);
      painel.appendChild(dica);
    }
    var caixa = ui('toast');
    if (caixa) {
      caixa.textContent = 'Erro ao iniciar: ' + ((erro && erro.message) || erro);
      caixa.classList.add('visivel', 'erro');
    }
  }

  function iniciar() {
    try {
      estado = C.iniciar();
      montarCena();
      atualizarCena();
      montarFerramentas();
      montarSementes();
      ligarInteracoes();
      redimensionar();
      atualizarUI();
      relogioAnterior = global.performance ? global.performance.now() : Date.now();
      global.requestAnimationFrame(laco);
    } catch (erro) {
      erroFatal(erro);
      return;
    }

    global.RaizJogoView = {
      estado: function () { return estado; }
    };
  }

  global.addEventListener('error', function (ev) {
    if (!estado) erroFatal(ev.error || ev.message);
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})(window);
