(function (global) {
  "use strict";

  var THREE = global.THREE;
  var D = global.RaizJogo;
  var C = global.RaizJogoCore;
  if (!THREE || !D || !C) {
    console.warn(
      "Raiz: o jogo precisa de three.js, game-data.js e game-core.js.",
    );
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
    base: 0x6b7a52,
  };

  var FERRAMENTAS = [
    { id: "plantar", nome: "Plantar", tipo: "acao", cor: "#6f9a4a" },
    { id: "adubar", nome: "Adubar", tipo: "acao", cor: "#8a6b3f" },
    { id: "colher", nome: "Colher", tipo: "acao", cor: "#d8b64a" },
    { id: "despoluir", nome: "Despoluir", tipo: "acao", cor: "#a4402f" },
    { id: "enxada", nome: "Enxada", tipo: "item", cor: "#9c8b6e" },
    { id: "regador", nome: "Regador", tipo: "item", cor: "#3f7a8f" },
    { id: "machado", nome: "Machado", tipo: "item", cor: "#8b4513" },
    { id: "construcao", nome: "Modo Construção", tipo: "modo", cor: "#ff6b35" },
  ];

  var estado = null;
  var selecionado = null;
  var abaAtual = "equipamentos";
  var loteEmEscolha = null;

  var cena,
    camera,
    renderer,
    tabuleiro,
    grupoBlocos,
    grupoEstruturas,
    grupoDecoracoes;
  var malhasBloco = [];
  var malhaSelecao = null;
  var malhaFazendeiro = null;
  var fazPartes = {};
  var luzes = {};
  var chuva = null;
  var relogioAnterior = 0;
  var ultimoAviso = 0;
  var houveEstruturaNoturna = false;
  var tempoAndar = 0;
  var andando = false;
  var correndo = false;
  var tempoAterrisagem = 0;
  var preparandoPulo = false;
  var movimentoAutomatico = {
    ativo: false,
    alvoX: 0,
    alvoZ: 0,
    bloco: null,
    distanciaMinima: 0.6,
    acaoAposChegar: null,
  };

  var ALTURA_CHAO = 0.15;
  var fisica = {
    velocidade: new THREE.Vector3(),
    aceleracao: 26,
    friccao: 14.0,
    velocidadeNormal: 4.0,
    velocidadeSprint: 6.0,
    velocidadeMaxima: 4.0,
    gravidade: -22.0,
    velocidadeY: 0,
    noChao: true,
    forcaPulo: 7.5,
    altura: 0.85,
    raio: 0.28,
    passoMaximo: 0.14,
    anguloAtual: 0,
    anguloAlvo: 0,
    inclinacaoCorpo: 0,
    inclinacaoCurva: 0,
    squashX: 1,
    squashY: 1,
    squashZ: 1,
    tempoNoAr: 0,
    coyoteTime: 0,
    jumpBuffer: 0,
    ultimoPassoTempo: 0,
    velocidadeQueda: 0,
  };

  var teclasPressionadas = {};
  var obstaculos = [];
  var particulasPoeira = [];
  var animacaoAcao = { ativa: false, tempo: 0, duracao: 0.35, tipo: "" };

  var plaquinhas = [];
  var popupPlaquinha = { ativo: false, loteX: -1, loteZ: -1, plaquinha: null };

  var modoConstrucao = {
    ativo: false,
    itemSelecionado: null,
    preview: null,
    previewValido: false,
    previewMotivo: "",
    grade: null,
    construcoes: [],
    particulas: [],
    arrastando: false,
    ponteiroId: null,
    origem: null,
    rotacao: 0,
    modoDeletar: false,
    emDestaque: null,
    ferramentaAnterior: null,
    livreAntes: false,
  };

  var ANGULO_GIRO = Math.PI / 2;
  var COR_PREVIEW_OK = 0x2fbf5f;
  var COR_PREVIEW_NOK = 0xe0483a;

  var veiculo = {
    ativo: false,
    item: null,
    registro: null,
    velocidade: 0,
    giroRoda: 0,
    anguloVolante: 0,
    blocoX: -1,
    blocoZ: -1,
    avisoEnergia: "",
  };

  function discardarObjeto(objeto) {
    if (!objeto) return;
    if (objeto.parent) objeto.parent.remove(objeto);
    objeto.traverse(function (no) {
      if (no.geometry) no.geometry.dispose();
      if (!no.material) return;
      var lista = Array.isArray(no.material) ? no.material : [no.material];
      lista.forEach(function (m) {
        m.dispose();
      });
    });
  }

  function atualizarCabecalhoCentro() {
    var titulo = ui("titulo-centro");
    var barra = ui("barra-ferramentas");
    var fechar = ui("fechar-construcao");
    if (titulo) {
      titulo.textContent = modoConstrucao.ativo ? "Construções" : "Ferramentas";
    }
    if (barra) barra.hidden = modoConstrucao.ativo;
    if (fechar) fechar.hidden = !modoConstrucao.ativo;
  }

  function ativarModoConstrucao() {
    if (modoConstrucao.ativo || !estado) return;
    if (veiculo.ativo) descerDoVeiculo(true);

    modoConstrucao.ferramentaAnterior = estado.ferramenta || "plantar";
    modoConstrucao.livreAntes = livre.ligado;

    modoConstrucao.ativo = true;
    modoConstrucao.rotacao = 0;
    estado.ferramenta = "construcao";
    marcarFerramenta();
    atualizarFerramentaMao();

    document.body.classList.add("modo-construcao");
    if (malhaFazendeiro) malhaFazendeiro.visible = false;
    if (malhaSelecao) malhaSelecao.visible = false;
    selecionado = null;

    reconstruirGradeConstrucao(true);
    if (modoConstrucao.grade) modoConstrucao.grade.visible = true;

    var inv = ui("inventario-construcao");
    if (inv) inv.classList.add("ativo");
    atualizarCabecalhoCentro();
    atualizarInventarioConstrucao();
    atualizarControlesConstrucao();
    pintarInspetor();

    aviso(
      "Modo Construção ligado. Arraste um item até o terreno; R gira 90° e Esc cancela.",
      false,
    );
  }

  function desativarModoConstrucao() {
    if (!modoConstrucao.ativo) return;

    cancelarArrasteItem(true);
    if (modoConstrucao.modoDeletar) desativarModoDeletar(true);

    modoConstrucao.ativo = false;
    modoConstrucao.itemSelecionado = null;
    modoConstrucao.rotacao = 0;
    document.body.classList.remove("modo-construcao");
    if (malhaFazendeiro) malhaFazendeiro.visible = true;
    if (modoConstrucao.grade) modoConstrucao.grade.visible = false;

    var inv = ui("inventario-construcao");
    if (inv) inv.classList.remove("ativo");
    atualizarCabecalhoCentro();
    atualizarControlesConstrucao();

    if (estado) {
      estado.ferramenta = modoConstrucao.ferramentaAnterior || "plantar";
      marcarFerramenta();
      atualizarFerramentaMao();
      C.salvar(estado);
    }
    modoConstrucao.ferramentaAnterior = null;

    if (!modoConstrucao.livreAntes && livre.ligado) desligarLivre();
    modoConstrucao.livreAntes = false;

    pintarInspetor();
    aviso("Modo Construção desligado.", false);
  }

  function reconstruirGradeConstrucao(forcar) {
    if (!estado || !tabuleiro) return;
    if (
      !forcar &&
      modoConstrucao.grade &&
      modoConstrucao.grade.userData.lotes === Object.keys(estado.lotes).length
    ) {
      return;
    }
    if (modoConstrucao.grade) discardarObjeto(modoConstrucao.grade);
    modoConstrucao.grade = null;
    criarGradeConstrucao();
  }

  function criarPlaquinha(lx, lz, posX, posZ, direcao) {
    var grupo = new THREE.Group();

    var poste = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.9 }),
    );
    poste.position.y = 0.2;
    poste.castShadow = true;
    grupo.add(poste);

    var placa = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.18, 0.03),
      new THREE.MeshStandardMaterial({
        color: 0xf4e4c1,
        roughness: 0.7,
        metalness: 0.1,
      }),
    );
    placa.position.y = 0.45;
    placa.castShadow = true;
    grupo.add(placa);

    var canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f4e4c1";
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = "#2d5016";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("VENDE", 128, 100);
    ctx.fillText("-SE", 128, 156);

    var textura = new THREE.CanvasTexture(canvas);
    var textoPlano = new THREE.Mesh(
      new THREE.PlaneGeometry(0.22, 0.16),
      new THREE.MeshBasicMaterial({ map: textura, transparent: true }),
    );
    textoPlano.position.y = 0.45;
    textoPlano.position.z = 0.016;
    grupo.add(textoPlano);

    grupo.position.set(posX, ALTURA_CHAO, posZ);
    grupo.rotation.y = direcao;

    grupo.userData.plaquinha = true;
    grupo.userData.loteX = lx;
    grupo.userData.loteZ = lz;

    return grupo;
  }

  function atualizarPlaquinhas() {
    if (!estado || !tabuleiro) return;

    plaquinhas.forEach(function (p) {
      discardarObjeto(p);
    });
    plaquinhas = [];

    var limiteMin = -meio - TILE / 2;
    var limiteMax = meio + TILE / 2;

    for (var lx = 0; lx < D.LADO_LOTE; lx++) {
      for (var lz = 0; lz < D.LADO_LOTE; lz++) {
        var chave = lx + ":" + lz;
        if (estado.lotes[chave]) continue;

        var vizinhos = C.lotesVizinhos(estado, lx, lz);
        if (vizinhos.length === 0) continue;

        vizinhos.forEach(function (viz) {
          var deltaX = lx - viz.lx;
          var deltaZ = lz - viz.lz;

          if (Math.abs(deltaX) + Math.abs(deltaZ) !== 1) return;

          var posX, posZ, direcao;

          if (deltaX === 1 && deltaZ === 0) {
            posX = limiteMin + lx * D.LOTE * STEP;
            posZ = limiteMin + (lz * D.LOTE + D.LOTE / 2) * STEP;
            direcao = Math.PI / 2;
          } else if (deltaX === -1 && deltaZ === 0) {
            posX = limiteMin + (lx + 1) * D.LOTE * STEP;
            posZ = limiteMin + (lz * D.LOTE + D.LOTE / 2) * STEP;
            direcao = -Math.PI / 2;
          } else if (deltaZ === 1 && deltaX === 0) {
            posX = limiteMin + (lx * D.LOTE + D.LOTE / 2) * STEP;
            posZ = limiteMin + lz * D.LOTE * STEP;
            direcao = Math.PI;
          } else if (deltaZ === -1 && deltaX === 0) {
            posX = limiteMin + (lx * D.LOTE + D.LOTE / 2) * STEP;
            posZ = limiteMin + (lz + 1) * D.LOTE * STEP;
            direcao = 0;
          } else {
            return;
          }

          var plaquinha = criarPlaquinha(lx, lz, posX, posZ, direcao);
          tabuleiro.add(plaquinha);
          plaquinhas.push(plaquinha);
        });
      }
    }
  }

  function mostrarPopupPlaquinha(lx, lz, plaquinha) {
    popupPlaquinha.ativo = true;
    popupPlaquinha.loteX = lx;
    popupPlaquinha.loteZ = lz;
    popupPlaquinha.plaquinha = plaquinha;

    var popup = ui("popup-plaquinha");
    if (!popup) {
      popup = document.createElement("div");
      popup.setAttribute("data-ui", "popup-plaquinha");
      popup.className = "popup-plaquinha";
      document.body.appendChild(popup);
    }

    var custoMinimo = 999999;
    var tipoMaisBarato = null;
    Object.keys(D.ESTADOS_LOTE).forEach(function (chave) {
      var tipo = D.ESTADOS_LOTE[chave];
      if (tipo.custo < custoMinimo) {
        custoMinimo = tipo.custo;
        tipoMaisBarato = tipo;
      }
    });

    var temDinheiro = estado.dinheiro >= custoMinimo;
    var faltaDinheiro = custoMinimo - estado.dinheiro;

    popup.innerHTML =
      '<div class="popup-conteudo">' +
      "<h3>Terreno disponível</h3>" +
      '<button class="fechar-popup" onclick="fecharPopupPlaquinha()">×</button>' +
      '<div class="popup-info-grid">' +
      '<div class="info-item">' +
      '<span class="info-label">Posição</span>' +
      '<span class="info-valor">Lote ' +
      lx +
      ", " +
      lz +
      "</span>" +
      "</div>" +
      '<div class="info-item">' +
      '<span class="info-label">Seu dinheiro</span>' +
      '<span class="info-valor">$' +
      estado.dinheiro +
      "</span>" +
      "</div>" +
      '<div class="info-item">' +
      '<span class="info-label">Preço a partir de</span>' +
      '<span class="info-valor">$' +
      custoMinimo +
      "</span>" +
      "</div>" +
      "</div>" +
      '<div class="popup-status ' +
      (temDinheiro ? "suficiente" : "insuficiente") +
      '">' +
      (temDinheiro
        ? "Você tem dinheiro suficiente"
        : "Faltam $" + faltaDinheiro) +
      "</div>" +
      '<p class="popup-hint">Escolha o tipo de terreno:</p>' +
      '<div class="popup-lista-tipos">' +
      Object.keys(D.ESTADOS_LOTE)
        .map(function (chave) {
          var tipo = D.ESTADOS_LOTE[chave];
          var podeComprar = estado.dinheiro >= tipo.custo;
          return (
            '<div class="tipo-card ' +
            (podeComprar ? "disponivel" : "bloqueado") +
            '" ' +
            'onclick="' +
            (podeComprar
              ? "comprarTerrenoDaPlaquinha('" +
                lx +
                "', '" +
                lz +
                "', '" +
                tipo.id +
                "')"
              : "") +
            '">' +
            '<div class="tipo-header">' +
            '<span class="tipo-titulo">' +
            tipo.nome +
            "</span>" +
            '<span class="tipo-preco-badge">$' +
            tipo.custo +
            "</span>" +
            "</div>" +
            '<p class="tipo-descricao">' +
            tipo.desc +
            "</p>" +
            (tipo.bonus
              ? '<span class="tipo-bonus">+' +
                tipo.bonus +
                " pontos ecológicos</span>"
              : "") +
            (!podeComprar
              ? '<span class="tipo-bloqueio">Sem dinheiro</span>'
              : "") +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      "</div>";

    popup.classList.add("visivel");
  }

  global.fecharPopupPlaquinha = function () {
    popupPlaquinha.ativo = false;
    popupPlaquinha.loteX = -1;
    popupPlaquinha.loteZ = -1;
    popupPlaquinha.plaquinha = null;

    var popup = ui("popup-plaquinha");
    if (popup) popup.classList.remove("visivel");
  };

  global.comprarTerrenoDaPlaquinha = function (lx, lz, tipoId) {
    lx = parseInt(lx);
    lz = parseInt(lz);

    var r = C.expandir(estado, lx, lz, tipoId);
    aviso(r.msg, !r.ok);

    if (r.ok) {
      C.salvar(estado);
      atualizarCena();
      atualizarPlaquinhas();
      atualizarUI();
      fecharPopupPlaquinha();
    }
  };

  function verificarCliquePlaquinha(clientX, clientY) {
    if (!plaquinhas.length || modoConstrucao.ativo || veiculo.ativo)
      return false;

    var alvo = objetoEm(clientX, clientY, plaquinhas);
    while (alvo && alvo.parent && !alvo.userData.plaquinha) alvo = alvo.parent;

    if (!alvo || !alvo.userData.plaquinha) return false;

    var lx = alvo.userData.loteX;
    var lz = alvo.userData.loteZ;

    mostrarPopupPlaquinha(lx, lz, alvo);

    return true;
  }

  function criarGradeConstrucao() {
    var gradeGroup = new THREE.Group();
    gradeGroup.userData.lotes = Object.keys(estado.lotes).length;

    var materialLinha = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    var materialLote = new THREE.LineBasicMaterial({
      color: 0x4af0ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });

    var alturaGrade = 0.2;

    var limiteMin = -meio - TILE / 2;
    var limiteMax = meio + TILE / 2;

    for (var x = 0; x <= D.GRADE; x++) {
      var xReal = limiteMin + x * STEP;
      var ehLinhaDeLote = x % D.LOTE === 0;
      var material = ehLinhaDeLote ? materialLote : materialLinha;

      var pontos = [];
      pontos.push(new THREE.Vector3(xReal, alturaGrade, limiteMin));
      pontos.push(new THREE.Vector3(xReal, alturaGrade, limiteMax));

      var geometria = new THREE.BufferGeometry().setFromPoints(pontos);
      var linha = new THREE.Line(geometria, material);
      gradeGroup.add(linha);
    }

    for (var z = 0; z <= D.GRADE; z++) {
      var zReal = limiteMin + z * STEP;
      var ehLinhaDeLote = z % D.LOTE === 0;
      var material = ehLinhaDeLote ? materialLote : materialLinha;

      var pontos = [];
      pontos.push(new THREE.Vector3(limiteMin, alturaGrade, zReal));
      pontos.push(new THREE.Vector3(limiteMax, alturaGrade, zReal));

      var geometria = new THREE.BufferGeometry().setFromPoints(pontos);
      var linha = new THREE.Line(geometria, material);
      gradeGroup.add(linha);
    }

    estado.blocos.forEach(function (b) {
      var p = posicaoDe(b);

      var loteX = Math.floor(b.x / D.LOTE);
      var loteZ = Math.floor(b.z / D.LOTE);
      var chaveLote = loteX + ":" + loteZ;

      if (estado.lotes[chaveLote] && !b.bloqueado) {
        var plano = new THREE.Mesh(
          new THREE.PlaneGeometry(TILE, TILE),
          new THREE.MeshBasicMaterial({
            color: 0x6fbf7a,
            transparent: true,
            opacity: 0.16,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        plano.rotation.x = -Math.PI / 2;
        plano.position.set(p[0], alturaGrade + 0.01, p[2]);
        gradeGroup.add(plano);
      }
    });

    tabuleiro.add(gradeGroup);
    modoConstrucao.grade = gradeGroup;
    gradeGroup.visible = !!modoConstrucao.ativo;
  }

  function snapToGrid(x, z) {
    var blocoX = Math.round((x + meio) / STEP);
    var blocoZ = Math.round((z + meio) / STEP);

    blocoX = Math.max(0, Math.min(D.GRADE - 1, blocoX));
    blocoZ = Math.max(0, Math.min(D.GRADE - 1, blocoZ));

    var gridX = blocoX * STEP - meio;
    var gridZ = blocoZ * STEP - meio;

    return { x: gridX, z: gridZ, blocoX: blocoX, blocoZ: blocoZ };
  }

  function dentroDoTabuleiro(x, z) {
    var limite = meio + TILE / 2;
    return x >= -limite && x <= limite && z >= -limite && z <= limite;
  }

  function blocoSobXZ(x, z) {
    if (!estado) return null;
    var bx = Math.round((x + meio) / STEP);
    var bz = Math.round((z + meio) / STEP);
    if (bx < 0 || bz < 0 || bx >= D.GRADE || bz >= D.GRADE) return null;
    return C.blocoEm(estado, bx, bz);
  }

  var cenaIcone, cameraIcone, rendererIcone;

  function inicializarRenderizadorIcone() {
    if (rendererIcone) return;

    cenaIcone = new THREE.Scene();
    cenaIcone.background = null;

    cameraIcone = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
    cameraIcone.position.set(1.2, 1.2, 1.2);
    cameraIcone.lookAt(0, 0.2, 0);

    var luz1 = new THREE.DirectionalLight(0xffffff, 0.8);
    luz1.position.set(1, 2, 1);
    cenaIcone.add(luz1);

    var luz2 = new THREE.AmbientLight(0xffffff, 0.6);
    cenaIcone.add(luz2);

    rendererIcone = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    rendererIcone.setSize(128, 128);
  }

  function renderizarIconeItem(itemId) {
    inicializarRenderizadorIcone();

    while (cenaIcone.children.length > 2) {
      cenaIcone.remove(cenaIcone.children[2]);
    }

    var modelo = criarModeloItem(itemId);

    modelo.position.y = 0;
    modelo.scale.set(0.8, 0.8, 0.8);

    cenaIcone.add(modelo);

    rendererIcone.render(cenaIcone, cameraIcone);

    var dataURL = rendererIcone.domElement.toDataURL("image/png");

    discardarObjeto(modelo);

    return dataURL;
  }

  function comprarItemConstrucao(itemId) {
    if (!estado) return;

    var r = C.comprarItem(estado, itemId);
    aviso(r.msg, !r.ok);

    if (r.ok) {
      C.salvar(estado);
      atualizarInventarioConstrucao();
      atualizarUI();
    }
  }

  function atualizarInventarioConstrucao() {
    var container = ui("itens-inventario");
    if (!container || !estado) return;

    container.textContent = "";

    var marretadas = (estado.construcoes || []).length;
    var divMarreta = document.createElement("div");
    divMarreta.className = "item-construcao item-marreta";
    divMarreta.dataset.itemId = "marreta";
    divMarreta.setAttribute("role", "button");
    if (modoConstrucao.modoDeletar) divMarreta.classList.add("selecionado");

    divMarreta.innerHTML =
      '<div class="icon">🔨</div>' +
      '<div class="info">' +
      '<div class="nome">Marreta</div>' +
      '<div class="quantidade">' +
      (marretadas
        ? "Remover construções (" + marretadas + ")"
        : "Nada construído ainda") +
      "</div>" +
      "</div>";

    divMarreta.addEventListener("click", function () {
      if (modoConstrucao.modoDeletar) desativarModoDeletar();
      else ativarModoDeletar();
    });

    container.appendChild(divMarreta);

    var separador = document.createElement("div");
    separador.className = "separador-construcao";
    container.appendChild(separador);

    var todosItens = {};
    Object.keys(D.EQUIPAMENTOS).forEach(function (id) {
      if (D.CONSTRUCOES.itens[id]) {
        todosItens[id] = D.EQUIPAMENTOS[id];
      }
    });
    Object.keys(D.ENERGIA).forEach(function (id) {
      if (D.CONSTRUCOES.itens[id]) {
        todosItens[id] = D.ENERGIA[id];
      }
    });

    Object.keys(todosItens).forEach(function (itemId) {
      var modelo = D.CONSTRUCOES.itens[itemId];
      var dadosItem = todosItens[itemId];
      var possui = estado.itens[itemId] || 0;
      var disponivel = C.construcoesDoItem(estado, itemId);
      var noMapa = C.contarConstrucoes(estado, itemId);
      var temDinheiro = estado.dinheiro >= dadosItem.custo;

      var div = document.createElement("div");
      div.className = "item-construcao";
      div.dataset.itemId = itemId;
      div.setAttribute("role", "button");

      if (possui === 0) {
        div.classList.add("para-comprar");
        if (!temDinheiro) div.classList.add("sem-dinheiro");
      } else if (disponivel === 0) {
        div.classList.add("sem-item");
      }

      var iconeContainer = document.createElement("div");
      iconeContainer.className = "icon icon-3d";

      try {
        var iconeImg = document.createElement("img");
        iconeImg.src = renderizarIconeItem(itemId);
        iconeImg.alt = modelo.nome;
        iconeContainer.appendChild(iconeImg);
      } catch (erro) {
        iconeContainer.textContent = modelo.emoji;
        console.warn("Falha ao renderizar ícone 3D para " + itemId, erro);
      }

      var infoDiv = document.createElement("div");
      infoDiv.className = "info";

      var statusTexto;
      if (possui === 0) {
        statusTexto = temDinheiro
          ? "Clique para comprar por $" + dadosItem.custo
          : "Sem dinheiro (falta $" + (dadosItem.custo - estado.dinheiro) + ")";
      } else {
        statusTexto =
          disponivel > 0
            ? "Disponível: " +
              disponivel +
              (noMapa ? " · no mapa: " + noMapa : "")
            : "Todas as unidades já estão no mapa";
      }

      infoDiv.innerHTML =
        '<div class="nome">' +
        modelo.nome +
        "</div>" +
        '<div class="quantidade">' +
        statusTexto +
        "</div>";

      div.appendChild(iconeContainer);
      div.appendChild(infoDiv);

      if (possui > 0) {
        var badge = document.createElement("div");
        badge.className = "badge";
        badge.textContent = possui;
        div.appendChild(badge);
      }

      if (possui === 0) {
        if (temDinheiro) {
          div.addEventListener("click", function (ev) {
            ev.preventDefault();
            comprarItemConstrucao(itemId);
          });
        }
      } else if (disponivel > 0) {
        div.addEventListener("pointerdown", function (ev) {
          ev.preventDefault();
          iniciarArrastarItem(itemId, ev);
        });
      }

      container.appendChild(div);
    });
  }

  function ativarModoDeletar() {
    cancelarArrasteItem(true);
    modoConstrucao.modoDeletar = true;
    modoConstrucao.itemSelecionado = "marreta";
    document.body.classList.add("modo-deletar");
    atualizarInventarioConstrucao();
    atualizarControlesConstrucao();
    aviso(
      "Marreta armada. Toque numa construção para retirar do terreno.",
      false,
    );
  }

  function desativarModoDeletar(silencioso) {
    modoConstrucao.modoDeletar = false;
    if (modoConstrucao.itemSelecionado === "marreta")
      modoConstrucao.itemSelecionado = null;
    soltarDestaqueRemocao();
    document.body.classList.remove("modo-deletar");
    atualizarInventarioConstrucao();
    if (!silencioso) aviso("Marreta guardada.", false);
  }

  function realcarParaRemocao(item) {
    if (item.userData.realcado) return;
    item.traverse(function (no) {
      if (!no.isMesh || !no.material) return;
      if (!no.userData.materialOriginal)
        no.userData.materialOriginal = no.material;
      var mat = no.userData.materialOriginal.clone();
      mat.transparent = true;
      mat.opacity = 0.9;
      if (mat.emissive) mat.emissive.setHex(0xff2d1a);
      if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0.9;
      no.material = mat;
    });
    item.userData.realcado = true;
  }

  function soltarDestaqueRemocao() {
    var item = modoConstrucao.emDestaque;
    modoConstrucao.emDestaque = null;
    if (!item) return;
    item.traverse(function (no) {
      if (!no.isMesh || !no.userData.materialOriginal) return;
      if (no.material && no.material !== no.userData.materialOriginal) {
        if (no.material.dispose) no.material.dispose();
      }
      no.material = no.userData.materialOriginal;
    });
    item.userData.realcado = false;
  }

  function destacarSobOMarreta(clientX, clientY) {
    if (!modoConstrucao.construcoes.length) return;
    var alvo = objetoEm(clientX, clientY, modoConstrucao.construcoes);
    while (alvo && alvo.parent && !alvo.userData.permanente) alvo = alvo.parent;
    if (alvo && !alvo.userData.permanente) alvo = null;
    if (alvo === modoConstrucao.emDestaque) return;
    soltarDestaqueRemocao();
    if (!alvo) return;
    modoConstrucao.emDestaque = alvo;
    realcarParaRemocao(alvo);
  }
  function registrarColisao(item, itemId) {
    var medida = D.CONSTRUCOES.itens[itemId] || { raio: 0.35, altura: 0.6 };
    var colisao = {
      pos: item.position.clone(),
      raio: medida.raio,
      altura: medida.altura,
      construcao: item,
    };
    item.userData.colisao = colisao;
    obstaculos.push(colisao);
  }

  function removerColisao(item) {
    if (!item.userData.colisao) return;
    var i = obstaculos.indexOf(item.userData.colisao);
    if (i >= 0) obstaculos.splice(i, 1);
    item.userData.colisao = null;
  }

  function criarModeloItem(itemId) {
    if (!D.CONSTRUCOES || !D.CONSTRUCOES.itens[itemId])
      return new THREE.Group();
    var g = malhaDeEstrutura(itemId);
    g.userData.itemId = itemId;
    return g;
  }

  function criarPreviewItem(itemId) {
    var g = criarModeloItem(itemId);
    g.traverse(function (no) {
      if (!no.isMesh) return;
      no.castShadow = false;
      no.receiveShadow = false;
      if (no.material) {
        no.material = no.material.clone();
        no.material.transparent = true;
        no.material.opacity = 0.65;
        no.material.depthWrite = false;
      }
    });
    g.userData.preview = true;
    return g;
  }

  var tempoAnimConstrucao = 0;

  function animarItem(item, dt) {
    if (!item || !item.userData) return;
    tempoAnimConstrucao += dt || 0.016;
    var id = item.userData.itemId;

    if (item.userData.gira) item.userData.gira.rotation.z += dt * 3.0;
    if (item.userData.molinete) item.userData.molinete.rotation.x += dt * 2.2;
    if (item.userData.helices) {
      item.userData.helices.forEach(function (h, i) {
        h.rotation.y += dt * (18 + i * 3);
      });
    }
    item.traverse(function (no) {
      if (!no || !no.userData) return;
      if (no !== item && no.userData.gira)
        no.userData.gira.rotation.z += dt * 3.0;
      if (no !== item && no.userData.molinete)
        no.userData.molinete.rotation.x += dt * 2.2;
      if (no !== item && no.userData.helices) {
        no.userData.helices.forEach(function (h, i) {
          h.rotation.y += dt * (18 + i * 3);
        });
      }
      if (
        no === item.userData.luzAlerta &&
        no.material &&
        no.material.emissiveIntensity !== undefined
      ) {
        no.material.emissiveIntensity =
          0.6 + 0.4 * Math.sin(tempoAnimConstrucao * 4);
      }
    });

    if (id === "drone") {
      if (item.userData.fase === undefined)
        item.userData.fase = Math.random() * Math.PI * 2;
      item.position.y =
        ALTURA_CHAO +
        0.35 +
        Math.sin(tempoAnimConstrucao * 2 + item.userData.fase) * 0.06;
    }

    if (item.userData.eLuzPoste && estado) {
      var ehNoite = C.ehNoite(estado);
      if (item.userData.luzPonto)
        item.userData.luzPonto.intensity = ehNoite ? 1.6 : 0;
      if (
        item.userData.lampada &&
        item.userData.lampada.material &&
        item.userData.lampada.material.emissiveIntensity !== undefined
      ) {
        item.userData.lampada.material.emissiveIntensity = ehNoite ? 1.2 : 0.15;
      }
    }

    if (item.userData.eFarois && estado) {
      var noiteVeic = C.ehNoite(estado);
      if (item.userData.luzFarol)
        item.userData.luzFarol.intensity = noiteVeic ? 1.5 : 0;
      if (item.userData.farois) {
        item.userData.farois.forEach(function (f) {
          if (f.material && f.material.emissiveIntensity !== undefined) {
            f.material.emissiveIntensity = noiteVeic ? 1.7 : 0.4;
          }
        });
      }
      if (item.userData.painel) {
        var motorLigado = veiculo.ativo && veiculo.item === item;
        item.userData.painel.forEach(function (m) {
          if (m.material && m.material.emissiveIntensity !== undefined) {
            m.material.emissiveIntensity = motorLigado ? 1.3 : 0.15;
          }
        });
      }
      if (
        item.userData.giroflex &&
        item.userData.giroflex.material &&
        item.userData.giroflex.material.emissiveIntensity !== undefined
      ) {
        item.userData.giroflex.material.emissiveIntensity =
          veiculo.ativo && veiculo.item === item
            ? 0.4 + 1.4 * Math.abs(Math.sin(tempoAnimConstrucao * 6))
            : 0.25;
      }
    }
  }

  function criarConstrucao(itemId, bloco, rotacao) {
    var item = criarModeloItem(itemId);
    var p = posicaoDe(bloco);
    item.position.set(p[0], ALTURA_CHAO, p[2]);
    item.rotation.y = (rotacao || 0) * ANGULO_GIRO;
    item.userData.permanente = true;
    item.userData.itemId = itemId;
    item.userData.blocoX = bloco.x;
    item.userData.blocoZ = bloco.z;
    item.userData.rotacao = rotacao || 0;
    grupoEstruturas.add(item);
    modoConstrucao.construcoes.push(item);
    registrarColisao(item, itemId);
    return item;
  }

  function reconstruirConstrucoes() {
    modoConstrucao.construcoes.slice().forEach(function (item) {
      if (item === modoConstrucao.emDestaque) soltarDestaqueRemocao();
      soltarVeiculoSeFor(item);
      removerColisao(item);
      discardarObjeto(item);
    });
    modoConstrucao.construcoes.length = 0;

    if (!Array.isArray(estado.construcoes)) estado.construcoes = [];
    estado.construcoes.forEach(function (c) {
      var bloco = C.blocoEm(estado, c.blocoX, c.blocoZ);
      if (!bloco) return;
      criarConstrucao(c.itemId, bloco, c.rotacao);
    });
  }

  function medidaDoVeiculo(itemId) {
    return (
      (D.CONSTRUCOES && D.CONSTRUCOES.itens[itemId]) || {
        raio: 0.4,
        altura: 0.6,
      }
    );
  }

  function registroDoItem(item) {
    if (
      !estado ||
      !Array.isArray(estado.construcoes) ||
      !item ||
      !item.userData
    )
      return null;
    for (var i = 0; i < estado.construcoes.length; i++) {
      var c = estado.construcoes[i];
      if (
        c.itemId === item.userData.itemId &&
        c.blocoX === item.userData.blocoX &&
        c.blocoZ === item.userData.blocoZ
      ) {
        return c;
      }
    }
    return null;
  }

  function sentarNoBanco(item) {
    if (!malhaFazendeiro) return;
    if (malhaFazendeiro.parent) malhaFazendeiro.parent.remove(malhaFazendeiro);
    item.add(malhaFazendeiro);
    var banco = item.userData.banco || { y: 0.3, z: -0.12, escala: 0.8 };
    malhaFazendeiro.position.set(0, banco.y, banco.z);
    malhaFazendeiro.rotation.set(0, 0, 0);
    malhaFazendeiro.scale.set(banco.escala, banco.escala, banco.escala);
    if (fazPartes.pernaEsq) fazPartes.pernaEsq.rotation.x = -1.5;
    if (fazPartes.pernaDir) fazPartes.pernaDir.rotation.x = -1.5;
    if (fazPartes.bracoEsq) fazPartes.bracoEsq.rotation.x = -0.9;
    if (fazPartes.bracoDir) fazPartes.bracoDir.rotation.x = -0.9;
    if (fazPartes.corpo) fazPartes.corpo.rotation.x = 0.12;
    if (fazPartes.sombra) fazPartes.sombra.visible = false;
  }

  function descerParaOTerreno(item) {
    if (!malhaFazendeiro) return;
    if (malhaFazendeiro.parent) malhaFazendeiro.parent.remove(malhaFazendeiro);
    tabuleiro.add(malhaFazendeiro);
    malhaFazendeiro.scale.set(1, 1, 1);
    malhaFazendeiro.rotation.set(0, 0, 0);
    if (fazPartes.pernaEsq) fazPartes.pernaEsq.rotation.x = 0;
    if (fazPartes.pernaDir) fazPartes.pernaDir.rotation.x = 0;
    if (fazPartes.bracoEsq) fazPartes.bracoEsq.rotation.x = 0;
    if (fazPartes.bracoDir) fazPartes.bracoDir.rotation.x = 0;
    if (fazPartes.corpo) fazPartes.corpo.rotation.x = 0;
    if (fazPartes.sombra) fazPartes.sombra.visible = true;

    var baseX = item ? item.position.x : 0;
    var baseZ = item ? item.position.z : 0;
    var ang = item ? item.rotation.y : 0;
    var deslocamentos = [-0.75, 0.75, 0];
    for (var i = 0; i < deslocamentos.length; i++) {
      var dx = Math.cos(ang) * deslocamentos[i];
      var dz = -Math.sin(ang) * deslocamentos[i];
      var alvo = blocoSobXZ(baseX + dx, baseZ + dz);
      if (alvo && !alvo.bloqueado) {
        baseX += dx;
        baseZ += dz;
        break;
      }
    }

    malhaFazendeiro.position.set(baseX, ALTURA_CHAO, baseZ);
    malhaFazendeiro.rotation.y = ang;
    fisica.velocidade.set(0, 0, 0);
    fisica.velocidadeY = 0;
    fisica.noChao = true;
    fisica.coyoteTime = 0;
    fisica.jumpBuffer = 0;
  }

  function ancorarVeiculo() {
    if (!veiculo.ativo || !veiculo.item || !veiculo.registro) return false;
    var item = veiculo.item;
    var encaixe = snapToGrid(item.position.x, item.position.z);
    var troca = C.dirigirParaBloco(
      estado,
      veiculo.registro,
      encaixe.blocoX,
      encaixe.blocoZ,
    );
    if (!troca.ok) return false;

    item.position.x = encaixe.x;
    item.position.z = encaixe.z;
    item.position.y = ALTURA_CHAO;
    item.userData.blocoX = encaixe.blocoX;
    item.userData.blocoZ = encaixe.blocoZ;
    if (item.userData.colisao) {
      item.userData.colisao.pos.set(encaixe.x, ALTURA_CHAO, encaixe.z);
    }

    var passos = Math.round(item.rotation.y / ANGULO_GIRO);
    passos = ((passos % 4) + 4) % 4;
    veiculo.registro.rotacao = passos;
    item.rotation.y = passos * ANGULO_GIRO;
    item.rotation.z = 0;
    veiculo.blocoX = encaixe.blocoX;
    veiculo.blocoZ = encaixe.blocoZ;
    return true;
  }

  function subirNoVeiculo(item) {
    if (!item || veiculo.ativo || !estado) return false;
    if (modoConstrucao.ativo) {
      aviso("Desligue o Modo Construção para dirigir.", true);
      return false;
    }
    if (livre.ligado) {
      aviso("Desligue a câmera livre (H) para dirigir.", true);
      return false;
    }
    var registro = registroDoItem(item);
    var conferencia = C.conferirDirecao(estado, registro);
    if (!conferencia.ok) {
      aviso(conferencia.msg, true);
      return false;
    }

    veiculo.ativo = true;
    veiculo.item = item;
    veiculo.registro = registro;
    veiculo.velocidade = 0;
    veiculo.giroRoda = 0;
    veiculo.anguloVolante = 0;
    veiculo.tempoEfeitos = 0;
    veiculo.blocoX = registro.blocoX;
    veiculo.blocoZ = registro.blocoZ;
    veiculo.avisoEnergia = "";
    item.userData.dirigindo = true;
    movimentoAutomatico.ativo = false;
    movimentoAutomatico.acaoAposChegar = null;
    sentarNoBanco(item);
    selecionado = null;
    if (malhaSelecao) malhaSelecao.visible = false;
    atualizarPainelVeiculo();
    aviso(
      "No " +
        nomeDoItem(registro.itemId) +
        ": W/S acelera e da re, A/D vira, E desce.",
      false,
    );
    return true;
  }

  function descerDoVeiculo(silencioso) {
    if (!veiculo.ativo) return false;
    var item = veiculo.item;
    if (item) {
      if (veiculo.registro) ancorarVeiculo();
      item.userData.dirigindo = false;
      item.rotation.z = 0;
      descerParaOTerreno(item);
    }
    veiculo.ativo = false;
    veiculo.item = null;
    veiculo.registro = null;
    veiculo.velocidade = 0;
    veiculo.anguloVolante = 0;
    veiculo.tempoEfeitos = 0;
    veiculo.blocoX = -1;
    veiculo.blocoZ = -1;
    veiculo.avisoEnergia = "";
    atualizarPainelVeiculo();
    if (estado) C.salvar(estado);
    if (!silencioso) aviso("Voce desceu do veiculo.", false);
    return true;
  }

  function veiculoDirigivelEm(clientX, clientY) {
    if (
      veiculo.ativo ||
      modoConstrucao.ativo ||
      !modoConstrucao.construcoes.length
    )
      return false;
    var alvo = objetoEm(clientX, clientY, modoConstrucao.construcoes);
    while (alvo && alvo.parent && !alvo.userData.permanente) alvo = alvo.parent;
    if (!alvo || !alvo.userData.permanente) return false;
    if (!C.itemDirigivel(alvo.userData.itemId)) return false;
    return subirNoVeiculo(alvo);
  }

  function soltarVeiculoSeFor(item) {
    if (veiculo.ativo && veiculo.item === item) descerDoVeiculo(true);
  }

  function resolverColisaoVeiculo(x, z, medida) {
    var bateu = false;
    for (var i = 0; i < obstaculos.length; i++) {
      var obs = obstaculos[i];
      if (obs.construcao === veiculo.item) continue;
      var dx = x - obs.pos.x;
      var dz = z - obs.pos.z;
      var somaRaios = medida.raio + obs.raio;
      var dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= somaRaios) continue;
      var ux = dx / (dist || 1);
      var uz = dz / (dist || 1);
      x = obs.pos.x + ux * somaRaios;
      z = obs.pos.z + uz * somaRaios;
      bateu = true;
    }

    var destino = blocoSobXZ(x, z);
    if (destino && destino.bloqueado) {
      var soX = blocoSobXZ(x, veiculo.item.position.z);
      var soZ = blocoSobXZ(veiculo.item.position.x, z);
      if (soX && !soX.bloqueado) z = veiculo.item.position.z;
      else if (soZ && !soZ.bloqueado) x = veiculo.item.position.x;
      else {
        x = veiculo.item.position.x;
        z = veiculo.item.position.z;
      }
      bateu = true;
    }
    return { x: x, z: z, bateu: bateu };
  }

  function passoVeiculo(dt) {
    var item = veiculo.item;
    if (!item || !estado || !veiculo.registro) return;
    var medida = medidaDoVeiculo(veiculo.registro.itemId);
    var t = livre.teclas;

    var acelerando = (t.w ? 1 : 0) - (t.s ? 1 : 0);
    var virando = (t.a ? 1 : 0) - (t.d ? 1 : 0);
    var velMax = medida.velMax || 3;
    var velAcc = medida.velAcc || 8;
    var velVir = medida.velVir || 2.2;
    var velPivo = medida.velPivo || 1.5;

    if (acelerando !== 0) {
      var teto = acelerando > 0 ? velMax : -velMax * 0.5;
      veiculo.velocidade += acelerando * velAcc * dt;
      if (acelerando > 0 && veiculo.velocidade > teto)
        veiculo.velocidade = teto;
      if (acelerando < 0 && veiculo.velocidade < teto)
        veiculo.velocidade = teto;
    } else {
      veiculo.velocidade *= Math.max(0, 1 - 2.4 * dt);
    }
    if (Math.abs(veiculo.velocidade) < 0.02) veiculo.velocidade = 0;

    if (virando !== 0) {
      var quanto = Math.abs(veiculo.velocidade) / (velMax * 0.4);
      var taxa =
        quanto >= 1
          ? velVir
          : velPivo + (velVir - velPivo) * Math.min(1, quanto);
      item.rotation.y +=
        virando * taxa * dt * (veiculo.velocidade < 0 ? -1 : 1);
    }

    var passoX = Math.sin(item.rotation.y) * veiculo.velocidade * dt;
    var passoZ = Math.cos(item.rotation.y) * veiculo.velocidade * dt;
    var resolvido = resolverColisaoVeiculo(
      item.position.x + passoX,
      item.position.z + passoZ,
      medida,
    );
    if (resolvido.bateu) veiculo.velocidade *= 0.3;
    item.position.x = resolvido.x;
    item.position.z = resolvido.z;
    item.position.y = ALTURA_CHAO;
    if (item.userData.colisao) {
      item.userData.colisao.pos.set(resolvido.x, ALTURA_CHAO, resolvido.z);
    }

    veiculo.giroRoda += veiculo.velocidade * dt;
    item.traverse(function (no) {
      if (!no.userData || !no.userData.raioRoda) return;
      no.rotation.x = veiculo.giroRoda / no.userData.raioRoda;
    });

    if (item.userData.esterco) {
      var alvoVolante = -virando * 0.45;
      veiculo.anguloVolante +=
        (alvoVolante - veiculo.anguloVolante) * Math.min(1, 12 * dt);
      for (var r = 0; r < item.userData.esterco.length; r++) {
        item.userData.esterco[r].rotation.y = veiculo.anguloVolante;
      }
    }
    item.rotation.z =
      -virando * 0.05 * Math.min(1, Math.abs(veiculo.velocidade) / velMax);

    emitirEfeitosVeiculo(item, dt, acelerando);

    var encaixe = snapToGrid(item.position.x, item.position.z);
    if (
      encaixe.blocoX !== veiculo.blocoX ||
      encaixe.blocoZ !== veiculo.blocoZ
    ) {
      ancorarVeiculo();
      var bloco = C.blocoEm(estado, veiculo.blocoX, veiculo.blocoZ);
      var lavra = C.prepararAoPassar(estado, veiculo.registro.itemId, bloco);
      if (!lavra.ok && lavra.msg && lavra.msg !== veiculo.avisoEnergia) {
        veiculo.avisoEnergia = lavra.msg;
        aviso(lavra.msg, true);
      }
      if (lavra.ok) veiculo.avisoEnergia = "";
    }
  }

  function atualizarPainelVeiculo() {
    var painel = ui("painel-veiculo");
    if (painel) painel.hidden = !veiculo.ativo;
    var nome = ui("veiculo-nome");
    if (nome) {
      nome.textContent =
        veiculo.ativo && veiculo.registro
          ? nomeDoItem(veiculo.registro.itemId)
          : "";
    }
  }

  function nomeDoItem(itemId) {
    var construcao = D.CONSTRUCOES.itens[itemId];
    if (construcao) return construcao.nome;
    var equip = D.EQUIPAMENTOS[itemId] || D.ENERGIA[itemId];
    return equip ? equip.nome : itemId;
  }

  function confirmarColocacao() {
    var itemId = modoConstrucao.itemSelecionado;
    if (!itemId) return;

    if (C.construcoesDoItem(estado, itemId) <= 0) {
      aviso(
        "Você já colocou todas as unidades de " + nomeDoItem(itemId) + ".",
        true,
      );
      cancelarArrasteItem(true);
      return;
    }

    if (!modoConstrucao.preview || !modoConstrucao.preview.visible) {
      aviso("Leve o item até um bloco verde do seu terreno.", true);
      cancelarArrasteItem(true);
      return;
    }

    var encaixe = snapToGrid(
      modoConstrucao.preview.position.x,
      modoConstrucao.preview.position.z,
    );
    var bloco = C.blocoEm(estado, encaixe.blocoX, encaixe.blocoZ);
    if (!bloco) {
      aviso("Posição inválida.", true);
      cancelarArrasteItem(true);
      return;
    }

    var conferencia = C.conferirConstrucao(estado, bloco);
    if (!conferencia.ok) {
      aviso(conferencia.msg, true);
      cancelarArrasteItem(true);
      return;
    }

    if (!Array.isArray(estado.construcoes)) estado.construcoes = [];
    estado.construcoes.push({
      itemId: itemId,
      blocoX: bloco.x,
      blocoZ: bloco.z,
      rotacao: modoConstrucao.rotacao,
    });
    criarConstrucao(itemId, bloco, modoConstrucao.rotacao);
    C.salvar(estado);

    aviso(
      nomeDoItem(itemId) +
        " pronto no terreno, girado " +
        modoConstrucao.rotacao * 90 +
        "°." +
        (C.itemDirigivel(itemId) ? " Clique nele para subir e dirigir." : ""),
      false,
    );

    soltarPreview();
    fimDoArraste();
    modoConstrucao.previewValido = false;
    atualizarInventarioConstrucao();
    atualizarUI();
  }

  function deletarItemConstrucao(item) {
    if (!item || !item.userData || !item.userData.permanente) return false;

    soltarVeiculoSeFor(item);

    var itemId = item.userData.itemId;
    var blocoX = item.userData.blocoX;
    var blocoZ = item.userData.blocoZ;

    if (modoConstrucao.emDestaque === item) soltarDestaqueRemocao();
    removerColisao(item);
    discardarObjeto(item);

    var i = modoConstrucao.construcoes.indexOf(item);
    if (i >= 0) modoConstrucao.construcoes.splice(i, 1);

    if (Array.isArray(estado.construcoes)) {
      estado.construcoes = estado.construcoes.filter(function (c) {
        return !(
          c.blocoX === blocoX &&
          c.blocoZ === blocoZ &&
          c.itemId === itemId
        );
      });
    }

    C.salvar(estado);
    atualizarInventarioConstrucao();
    atualizarUI();
    aviso(
      nomeDoItem(itemId) +
        " retirado do terreno. Continua sendo seu na fazenda.",
      false,
    );
    return true;
  }

  function selecionarItemParaConstruir(itemId) {
    if (!modoConstrucao.ativo) return false;
    if (modoConstrucao.modoDeletar) desativarModoDeletar(true);
    if (C.construcoesDoItem(estado, itemId) <= 0) {
      aviso(
        "Você não tem " + nomeDoItem(itemId) + " disponível para construir.",
        true,
      );
      return false;
    }

    modoConstrucao.itemSelecionado = itemId;
    modoConstrucao.rotacao = 0;

    soltarPreview();
    try {
      modoConstrucao.preview = criarPreviewItem(itemId);
      if (!modoConstrucao.preview) throw new Error("preview vazio");
      modoConstrucao.preview.visible = false;
      grupoEstruturas.add(modoConstrucao.preview);
    } catch (erro) {
      soltarPreview();
      modoConstrucao.itemSelecionado = null;
      console.warn(
        "Raiz: falha ao montar o preview de " + nomeDoItem(itemId) + ".",
        erro,
      );
      aviso(
        "Não consegui preparar " +
          nomeDoItem(itemId) +
          " para construir. Tente de novo.",
        true,
      );
      return false;
    }

    destacarItemSelecionado(itemId);
    atualizarControlesConstrucao();
    return true;
  }

  function iniciarArrastarItem(itemId, ev) {
    if (!modoConstrucao.ativo) return;
    if (!selecionarItemParaConstruir(itemId)) return;

    modoConstrucao.arrastando = true;
    modoConstrucao.ponteiroId = ev.pointerId;
    modoConstrucao.origem = { x: ev.clientX, y: ev.clientY };
    document.body.classList.add("arrastando-item");

    var itemEl = document.querySelector(
      '.item-construcao[data-item-id="' + itemId + '"]',
    );
    if (itemEl) itemEl.classList.add("arrastando");
    atualizarControlesConstrucao();
  }

  function moverPreview(clientX, clientY) {
    var preview = modoConstrucao.preview;
    if (!preview) return;

    var ponto = pontoNoChao(clientX, clientY);
    if (!ponto || !dentroDoTabuleiro(ponto.x, ponto.z)) {
      preview.visible = false;
      modoConstrucao.previewValido = false;
      modoConstrucao.previewMotivo = "Leve o item até um bloco do seu terreno.";
      atualizarControlesConstrucao();
      return;
    }

    var encaixe = snapToGrid(ponto.x, ponto.z);
    var bloco = C.blocoEm(estado, encaixe.blocoX, encaixe.blocoZ);
    var conferencia = C.conferirConstrucao(estado, bloco);

    preview.visible = true;
    preview.position.set(encaixe.x, 0, encaixe.z);
    preview.rotation.y = modoConstrucao.rotacao * ANGULO_GIRO;
    modoConstrucao.previewValido = conferencia.ok;
    modoConstrucao.previewMotivo = conferencia.msg;
    pintarPreview(conferencia.ok);
    atualizarControlesConstrucao();
  }

  function pintarPreview(valido) {
    var preview = modoConstrucao.preview;
    if (!preview) return;
    preview.traverse(function (no) {
      if (!no.isMesh || !no.material) return;
      if (no.material.emissive)
        no.material.emissive.setHex(valido ? COR_PREVIEW_OK : COR_PREVIEW_NOK);
      if (no.material.emissiveIntensity !== undefined) {
        no.material.emissiveIntensity = valido ? 0.35 : 0.7;
      }
      no.material.opacity = valido ? 0.65 : 0.5;
    });
  }

  function girarPreview() {
    if (!modoConstrucao.preview) return;
    modoConstrucao.rotacao = (modoConstrucao.rotacao + 1) % 4;
    modoConstrucao.preview.rotation.y = modoConstrucao.rotacao * ANGULO_GIRO;
    atualizarControlesConstrucao();
  }

  function soltarPreview() {
    if (!modoConstrucao.preview) return;
    discardarObjeto(modoConstrucao.preview);
    modoConstrucao.preview = null;
  }

  function ponteiroSobreInventario(ev) {
    var alvo = ev.target;
    return !!(alvo && alvo.closest && alvo.closest(".inventario-construcao"));
  }

  function fimDoArraste() {
    modoConstrucao.arrastando = false;
    modoConstrucao.ponteiroId = null;
    modoConstrucao.origem = null;
    document.body.classList.remove("arrastando-item");
    document
      .querySelectorAll(".item-construcao.arrastando")
      .forEach(function (el) {
        el.classList.remove("arrastando");
      });
  }

  function cancelarArrasteItem(silencioso) {
    soltarPreview();
    fimDoArraste();
    modoConstrucao.previewValido = false;
    modoConstrucao.previewMotivo = "";
    modoConstrucao.itemSelecionado = null;
    modoConstrucao.rotacao = 0;
    document
      .querySelectorAll(".item-construcao.selecionado")
      .forEach(function (el) {
        el.classList.remove("selecionado");
      });
    atualizarControlesConstrucao();
    if (!silencioso) aviso("Construção cancelada.", false);
  }

  function textoDeStatus() {
    if (modoConstrucao.modoDeletar) {
      return "Marreta armada: toque na construção destacada para retirar.";
    }
    if (!modoConstrucao.preview) {
      return "";
    }
    if (!modoConstrucao.preview.visible && !modoConstrucao.previewMotivo) {
      return "";
    }
    if (modoConstrucao.previewValido) {
      return (
        "Soltar aqui: " +
        nomeDoItem(modoConstrucao.itemSelecionado) +
        " · " +
        modoConstrucao.rotacao * 90 +
        "°"
      );
    }
    return modoConstrucao.previewMotivo || "Soltar aqui.";
  }

  function atualizarControlesConstrucao() {
    var painel = ui("controles-construcao");
    var status = ui("status-construcao");
    var angulo = ui("angulo-construcao");
    var cancelar = ui("cancelar-construcao");
    var girar = ui("girar-construcao");

    if (painel) painel.hidden = !modoConstrucao.ativo;
    if (girar) girar.disabled = !modoConstrucao.preview;
    if (cancelar)
      cancelar.disabled =
        !modoConstrucao.preview && !modoConstrucao.modoDeletar;
    if (painel) {
      painel.classList.toggle(
        "ocioso",
        !modoConstrucao.preview && !modoConstrucao.modoDeletar,
      );
      painel.classList.toggle("sem-girar", !modoConstrucao.preview);
    }
    if (angulo) {
      var grafico =
        modoConstrucao.itemSelecionado &&
        modoConstrucao.itemSelecionado !== "marreta"
          ? modoConstrucao.rotacao * 90 + "°"
          : "--";
      if (angulo.textContent !== grafico) angulo.textContent = grafico;
    }
    if (!status) return;
    var msg = textoDeStatus();
    if (status.textContent !== msg) status.textContent = msg;
  }

  function destacarItemSelecionado(itemId) {
    document.querySelectorAll(".item-construcao").forEach(function (el) {
      el.classList.toggle(
        "selecionado",
        !!itemId && el.dataset.itemId === itemId,
      );
    });
  }

  var reduzirMovimento = global.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
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
    velo: 9,
  };
  var desligarLivre = function () {};

  var TILE = 1;
  var GAP = 0;
  var STEP = TILE + GAP;
  var meio = ((D.GRADE - 1) * STEP) / 2;

  var raio = new THREE.Raycaster();
  var ponteiroNdc = new THREE.Vector2();
  var planoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var pontoChao = new THREE.Vector3();

  function mirarPonteiro(clientX, clientY) {
    var palco = el("#stage");
    if (!palco || !camera) return false;
    var r = palco.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    ponteiroNdc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ponteiroNdc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raio.setFromCamera(ponteiroNdc, camera);
    return true;
  }

  function pontoNoChao(clientX, clientY) {
    if (!mirarPonteiro(clientX, clientY)) return null;
    return raio.ray.intersectPlane(planoChao, pontoChao) ? pontoChao : null;
  }

  function objetoEm(clientX, clientY, lista) {
    if (!lista || !lista.length) return null;
    if (!mirarPonteiro(clientX, clientY)) return null;
    var acertos = raio.intersectObjects(lista, true);
    return acertos.length ? acertos[0].object : null;
  }

  function el(sel) {
    return document.querySelector(sel);
  }
  function ui(nome) {
    return document.querySelector('[data-ui="' + nome + '"]');
  }

  function aviso(texto, erro) {
    var caixa = ui("toast");
    if (!caixa) return;
    caixa.textContent = texto;
    caixa.classList.toggle("erro", !!erro);
    caixa.classList.add("visivel");
    global.clearTimeout(ultimoAviso);
    ultimoAviso = global.setTimeout(function () {
      caixa.classList.remove("visivel");
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
    var mat = new THREE.MeshStandardMaterial(
      Object.assign(
        {
          color: cor,
          roughness: 0.88,
          metalness: 0.03,
        },
        ajustes || {},
      ),
    );
    if (TEX && textura)
      TEX.apply(mat, textura, { normalScale: 1.4, envMapIntensity: 0.7 });
    return mat;
  }

  function geometriaBloco() {
    var g = new THREE.BoxGeometry(TILE, 0.3, TILE);
    var uv = g.attributes.uv;
    var faces = [
      [TILE, 0.3],
      [TILE, 0.3],
      [TILE, TILE],
      [TILE, TILE],
      [TILE, 0.3],
      [TILE, 0.3],
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

  function criarMalhaBlocoTerreno(b, geo) {
    var grupo = new THREE.Group();
    var matAjustes = {};
    if (b.umidade > 0.55 && !b.bloqueado) {
      matAjustes = { roughness: 0.42, metalness: 0.12 };
    } else if (b.poluicao > 0.45 && !b.bloqueado) {
      matAjustes = { roughness: 0.95, metalness: 0.08 };
    }
    var baseMesh = new THREE.Mesh(
      geo,
      materialBase(corDoSolo(b), "soil", matAjustes),
    );
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = !b.bloqueado;
    grupo.add(baseMesh);

    // SOLO ARADO: mostra sulcos de terra preparada para plantio
    if (!b.bloqueado && b.arado && !b.nativo && !b.cultivo) {
      for (var s = -1; s <= 1; s++) {
        var sulco = new THREE.Mesh(
          new THREE.BoxGeometry(TILE * 0.92, 0.04, 0.16),
          materialBase(0x5d4a35, "soil", { roughness: 0.95 }),
        );
        sulco.position.set(0, 0.165, s * 0.3);
        sulco.receiveShadow = true;
        sulco.castShadow = true;
        grupo.add(sulco);
      }
    } 
    // Mancha de poluição
    else if (!b.bloqueado && b.poluicao > 0.45) {
      var mancha = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.28, 0.02, 7),
        materialBase(0x32283a, null, { roughness: 0.6, metalness: 0.2 }),
      );
      mancha.position.y = 0.155;
      grupo.add(mancha);
    }

    grupo.userData.bloco = b;
    grupo.userData.baseMesh = baseMesh;
    return grupo;
  }

  function criarPersonagemExtremo() {
    var grupo = new THREE.Group();

    var sombraGeo = new THREE.CircleGeometry(0.32, 20);
    var sombraMat = new THREE.MeshBasicMaterial({
      color: 0x07150e,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    });
    var decalSombra = new THREE.Mesh(sombraGeo, sombraMat);
    decalSombra.rotation.x = -Math.PI / 2;
    decalSombra.position.y = 0.005;
    grupo.add(decalSombra);

    var ALTURA_CORPO = 0.46;
    var corpoPivot = new THREE.Group();
    corpoPivot.position.y = ALTURA_CORPO;
    grupo.add(corpoPivot);

    var peleMat = materialBase(0xf6d1b8, null, { roughness: 0.65 });
    var jeansMat = materialBase(0x1d4673, "fabric", { roughness: 0.82 });
    var camisaMat = materialBase(0xc43b3b, "fabric", { roughness: 0.76 });
    var camisaEscura = materialBase(0x942727, "fabric", { roughness: 0.8 });
    var couroMat = materialBase(0x422614, "bark", { roughness: 0.86 });
    var botaMat = materialBase(0x2a170d, "bark", { roughness: 0.9 });
    var solaMat = materialBase(0x130a06, null, { roughness: 0.95 });
    var ouroMat = materialBase(0xcca034, "brushed", {
      metalness: 0.75,
      roughness: 0.28,
    });
    var palhaMat = materialBase(0xddb654, "brushed", { roughness: 0.82 });
    var bandanaMat = materialBase(0xd83838, null, { roughness: 0.7 });
    var cabeloMat = materialBase(0x382214, null, { roughness: 0.88 });
    var olhoPretoMat = materialBase(0x111111, null, { roughness: 0.2 });
    var olhoBrilhoMat = materialBase(0xffffff, null, { roughness: 0.1 });
    var bochechaMat = materialBase(0xf49288, null, {
      roughness: 0.6,
      transparent: true,
      opacity: 0.65,
    });
    var fitaMat = materialBase(0x6e1b20, null, { roughness: 0.75 });
    var folhaChapeuMat = materialBase(0x56b038, "leaf", { roughness: 0.6 });

    var corpo = new THREE.Group();
    corpo.position.y = 0;

    var torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.33, 0.32, 0.22),
      camisaMat,
    );
    torso.position.y = 0.02;
    corpo.add(torso);

    var gola = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.05, 0.24),
      camisaEscura,
    );
    gola.position.set(0, 0.17, 0.01);
    corpo.add(gola);

    var bandana = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.13, 0.05, 8),
      bandanaMat,
    );
    bandana.position.set(0, 0.19, 0);
    var bandanaNo = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 6),
      bandanaMat,
    );
    bandanaNo.position.set(0, 0.18, 0.12);
    var bandanaPonta = new THREE.Mesh(
      new THREE.ConeGeometry(0.045, 0.09, 5),
      bandanaMat,
    );
    bandanaPonta.position.set(0.02, 0.13, 0.12);
    bandanaPonta.rotation.z = 0.4;
    corpo.add(bandana, bandanaNo, bandanaPonta);

    var macacaoBase = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.16, 0.23),
      jeansMat,
    );
    macacaoBase.position.y = -0.07;
    var macacaoBib = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.18, 0.04),
      jeansMat,
    );
    macacaoBib.position.set(0, 0.04, 0.105);
    var bolso = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.09, 0.02),
      materialBase(0x163458, null),
    );
    bolso.position.set(0, 0.02, 0.13);
    var alcaEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.24, 0.24),
      jeansMat,
    );
    alcaEsq.position.set(-0.1, 0.07, 0);
    var alcaDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, 0.24, 0.24),
      jeansMat,
    );
    alcaDir.position.set(0.1, 0.07, 0);
    var fivelaEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.04, 0.03),
      ouroMat,
    );
    fivelaEsq.position.set(-0.1, 0.11, 0.115);
    var fivelaDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.04, 0.03),
      ouroMat,
    );
    fivelaDir.position.set(0.1, 0.11, 0.115);

    var cinto = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.04, 0.24),
      couroMat,
    );
    cinto.position.y = -0.14;
    var fivelaCinto = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.05, 0.03),
      ouroMat,
    );
    fivelaCinto.position.set(0, -0.14, 0.125);

    corpo.add(
      macacaoBase,
      macacaoBib,
      bolso,
      alcaEsq,
      alcaDir,
      fivelaEsq,
      fivelaDir,
      cinto,
      fivelaCinto,
    );
    corpoPivot.add(corpo);

    var bolsaCostas = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.24, 0.12),
      couroMat,
    );
    bolsaCostas.position.set(0, 0.04, -0.14);
    var bolsaAba = new THREE.Mesh(
      new THREE.BoxGeometry(0.23, 0.08, 0.04),
      materialBase(0x5a341a, null),
    );
    bolsaAba.position.set(0, 0.12, -0.19);
    var mantaRolo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.25, 8),
      materialBase(0x5e7552, null),
    );
    mantaRolo.rotation.z = Math.PI / 2;
    mantaRolo.position.set(0, 0.18, -0.15);
    corpo.add(bolsaCostas, bolsaAba, mantaRolo);

    var pivotCabeca = new THREE.Group();
    pivotCabeca.position.set(0, 0.32, 0);
    corpoPivot.add(pivotCabeca);

    var cabeca = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.24, 0.24),
      peleMat,
    );
    var orelhaEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.07, 0.05),
      peleMat,
    );
    orelhaEsq.position.set(-0.14, 0, 0);
    var orelhaDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.07, 0.05),
      peleMat,
    );
    orelhaDir.position.set(0.14, 0, 0);

    var nariz = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.04, 5), peleMat);
    nariz.rotation.x = Math.PI / 2;
    nariz.position.set(0, -0.01, 0.135);

    var boca = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.015, 0.02),
      materialBase(0x8a3a30, null),
    );
    boca.position.set(0, -0.06, 0.125);

    var bochechaEsq = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 6),
      bochechaMat,
    );
    bochechaEsq.position.set(-0.08, -0.03, 0.12);
    bochechaEsq.scale.set(1, 0.6, 0.3);
    var bochechaDir = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 6, 6),
      bochechaMat,
    );
    bochechaDir.position.set(0.08, -0.03, 0.12);
    bochechaDir.scale.set(1, 0.6, 0.3);

    var criarOlho = function (x) {
      var gOlho = new THREE.Group();
      var socket = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.05, 0.015),
        olhoPretoMat,
      );
      var iris = new THREE.Mesh(
        new THREE.BoxGeometry(0.035, 0.04, 0.018),
        materialBase(0x2f6b48, null),
      );
      iris.position.z = 0.002;
      var brilho = new THREE.Mesh(
        new THREE.BoxGeometry(0.016, 0.016, 0.02),
        olhoBrilhoMat,
      );
      brilho.position.set(0.01, 0.01, 0.004);
      var sobrancelha = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.015, 0.02),
        cabeloMat,
      );
      sobrancelha.position.set(0, 0.036, 0.004);
      sobrancelha.rotation.z = x < 0 ? -0.15 : 0.15;
      gOlho.add(socket, iris, brilho, sobrancelha);
      gOlho.position.set(x, 0.025, 0.125);
      return gOlho;
    };
    var olhoEsq = criarOlho(-0.06);
    var olhoDir = criarOlho(0.06);

    var cabeloTopo = new THREE.Mesh(
      new THREE.BoxGeometry(0.27, 0.09, 0.27),
      cabeloMat,
    );
    cabeloTopo.position.y = 0.11;
    var franjaEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.07, 0.04),
      cabeloMat,
    );
    franjaEsq.position.set(-0.06, 0.09, 0.13);
    franjaEsq.rotation.z = -0.2;
    var franjaDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.06, 0.04),
      cabeloMat,
    );
    franjaDir.position.set(0.05, 0.08, 0.13);
    franjaDir.rotation.z = 0.15;
    var costeletaEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.12, 0.06),
      cabeloMat,
    );
    costeletaEsq.position.set(-0.135, 0.01, 0.06);
    var costeletaDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.12, 0.06),
      cabeloMat,
    );
    costeletaDir.position.set(0.135, 0.01, 0.06);
    var cabeloNuca = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.14, 0.06),
      cabeloMat,
    );
    cabeloNuca.position.set(0, 0.01, -0.12);

    var gChapeu = new THREE.Group();
    gChapeu.position.y = 0.14;
    gChapeu.rotation.x = -0.06;
    var abaChapeu = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.38, 0.025, 18),
      palhaMat,
    );
    var bordaAba = new THREE.Mesh(
      new THREE.TorusGeometry(0.37, 0.015, 6, 18),
      palhaMat,
    );
    bordaAba.rotation.x = Math.PI / 2;
    var copaChapeu = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.21, 0.14, 14),
      palhaMat,
    );
    copaChapeu.position.y = 0.07;
    var fitaChapeu = new THREE.Mesh(
      new THREE.CylinderGeometry(0.212, 0.215, 0.04, 14),
      fitaMat,
    );
    fitaChapeu.position.y = 0.03;
    var folhaChapeu = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.1, 5),
      folhaChapeuMat,
    );
    folhaChapeu.position.set(0.19, 0.08, 0.08);
    folhaChapeu.rotation.set(-0.3, 0.2, -0.5);

    gChapeu.add(abaChapeu, bordaAba, copaChapeu, fitaChapeu, folhaChapeu);

    pivotCabeca.add(
      cabeca,
      orelhaEsq,
      orelhaDir,
      nariz,
      boca,
      bochechaEsq,
      bochechaDir,
      olhoEsq,
      olhoDir,
      cabeloTopo,
      franjaEsq,
      franjaDir,
      costeletaEsq,
      costeletaDir,
      cabeloNuca,
      gChapeu,
    );

    var pivotBracoEsq = new THREE.Group();
    pivotBracoEsq.position.set(-0.21, 0.12, 0);
    var mangaEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.14, 0.12),
      camisaMat,
    );
    mangaEsq.position.y = -0.04;
    var dobraMangaEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.03, 0.13),
      camisaEscura,
    );
    dobraMangaEsq.position.y = -0.11;
    var antebracoEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.16, 0.09),
      peleMat,
    );
    antebracoEsq.position.y = -0.18;
    var maoEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.08, 0.08),
      couroMat,
    );
    maoEsq.position.y = -0.27;
    var polegarEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.04, 0.03),
      couroMat,
    );
    polegarEsq.position.set(0.05, -0.26, 0.02);
    pivotBracoEsq.add(
      mangaEsq,
      dobraMangaEsq,
      antebracoEsq,
      maoEsq,
      polegarEsq,
    );
    corpoPivot.add(pivotBracoEsq);

    var pivotBracoDir = new THREE.Group();
    pivotBracoDir.position.set(0.21, 0.12, 0);
    var mangaDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.14, 0.12),
      camisaMat,
    );
    mangaDir.position.y = -0.04;
    var dobraMangaDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.03, 0.13),
      camisaEscura,
    );
    dobraMangaDir.position.y = -0.11;
    var antebracoDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.16, 0.09),
      peleMat,
    );
    antebracoDir.position.y = -0.18;
    var maoDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.08, 0.08),
      couroMat,
    );
    maoDir.position.y = -0.27;
    var polegarDir = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.04, 0.03),
      couroMat,
    );
    polegarDir.position.set(-0.05, -0.26, 0.02);
    var ferramentaMao = new THREE.Group();
    ferramentaMao.position.set(0, -0.27, 0.07);
    pivotBracoDir.add(
      mangaDir,
      dobraMangaDir,
      antebracoDir,
      maoDir,
      polegarDir,
      ferramentaMao,
    );
    corpoPivot.add(pivotBracoDir);

    var criarPerna = function (x) {
      var pivotPerna = new THREE.Group();
      pivotPerna.position.set(x, -0.14, 0);
      var perna = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.22, 0.13),
        jeansMat,
      );
      perna.position.y = -0.1;
      var barraCalca = new THREE.Mesh(
        new THREE.BoxGeometry(0.145, 0.04, 0.145),
        materialBase(0x285f94, null),
      );
      barraCalca.position.y = -0.2;
      var botaCano = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.08, 0.15),
        botaMat,
      );
      botaCano.position.set(0, -0.24, 0.01);
      var botaBico = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.06, 0.19),
        botaMat,
      );
      botaBico.position.set(0, -0.27, 0.03);
      var sola = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.03, 0.21),
        solaMat,
      );
      sola.position.set(0, -0.3, 0.03);
      pivotPerna.add(perna, barraCalca, botaCano, botaBico, sola);
      return pivotPerna;
    };

    var pivotPernaEsq = criarPerna(-0.09);
    var pivotPernaDir = criarPerna(0.09);
    corpoPivot.add(pivotPernaEsq, pivotPernaDir);

    var lanternaLuz = new THREE.PointLight(0xffdf90, 0, 8.5, 2.2);
    lanternaLuz.position.set(0, 0.5, 0);
    grupo.add(lanternaLuz);

    grupo.traverse(function (c) {
      if (c.isMesh && c !== decalSombra) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });

    fazPartes = {
      root: grupo,
      corpoPivot: corpoPivot,
      corpo: corpo,
      cabeca: pivotCabeca,
      pernaEsq: pivotPernaEsq,
      pernaDir: pivotPernaDir,
      bracoEsq: pivotBracoEsq,
      bracoDir: pivotBracoDir,
      ferramentaMao: ferramentaMao,
      sombra: decalSombra,
      chapeuFolha: folhaChapeu,
      lanterna: lanternaLuz,
    };

    return grupo;
  }

  function montarCena() {
    var palco = el("#stage");
    cena = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;

    if (TEX) {
      TEX.setAnisotropy(renderer.capabilities.getMaxAnisotropy());
      var env = TEX.environment(renderer);
      if (env) cena.environment = env;
    }
    palco.appendChild(renderer.domElement);

    tabuleiro = new THREE.Group();
    cena.add(tabuleiro);
    cena.background = new THREE.Color(CORES_CEU.dia);
    cena.fog = new THREE.Fog(CORES_CEU.dia, 24, 85);
    grupoBlocos = new THREE.Group();
    grupoEstruturas = new THREE.Group();
    grupoDecoracoes = new THREE.Group();
    tabuleiro.add(grupoBlocos, grupoEstruturas, grupoDecoracoes);

    var geo = geometriaBloco();
    estado.blocos.forEach(function (b) {
      var p = posicaoDe(b);
      var malha = criarMalhaBlocoTerreno(b, geo);
      malha.position.set(p[0], b.bloqueado ? -0.08 : 0, p[2]);
      grupoBlocos.add(malha);
      malhasBloco.push(malha);
    });

    var tamanhoBase = D.GRADE * STEP + 14;
    var basePlanalto = new THREE.Mesh(
      new THREE.BoxGeometry(tamanhoBase, 0.5, tamanhoBase),
      materialBase(0x56783d, "soil", { roughness: 0.92 }),
    );
    basePlanalto.position.y = -0.26;
    basePlanalto.receiveShadow = true;
    tabuleiro.add(basePlanalto);

    var baseSubsolo = new THREE.Mesh(
      new THREE.BoxGeometry(tamanhoBase + 3.5, 0.9, tamanhoBase + 3.5),
      materialBase(0x6b5a45, "bark", { roughness: 0.96 }),
    );
    baseSubsolo.position.y = -0.85;
    baseSubsolo.receiveShadow = true;
    tabuleiro.add(baseSubsolo);

    var baseRocha = new THREE.Mesh(
      new THREE.BoxGeometry(tamanhoBase + 7, 1.4, tamanhoBase + 7),
      materialBase(0x52524e, "brushed", { roughness: 0.98 }),
    );
    baseRocha.position.y = -1.8;
    baseRocha.receiveShadow = true;
    tabuleiro.add(baseRocha);

    montarDecoracoes();

    malhaSelecao = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE * 1.04, TILE * 1.04),
      new THREE.MeshBasicMaterial({
        color: 0xbfe6c6,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    malhaSelecao.rotation.x = -Math.PI / 2;
    malhaSelecao.position.y = 0.17;
    malhaSelecao.visible = false;
    tabuleiro.add(malhaSelecao);

    var grupo = criarPersonagemExtremo();
    grupo.position.set(0, ALTURA_CHAO, 0);
    fisica.velocidade.set(0, 0, 0);
    fisica.velocidadeY = 0;
    fisica.noChao = true;
    tabuleiro.add(grupo);
    malhaFazendeiro = grupo;
    atualizarFerramentaMao();

    luzes.hemi = new THREE.HemisphereLight(0xedf5fc, 0x485844, 0.65);
    cena.add(luzes.hemi);

    luzes.sol = new THREE.DirectionalLight(0xfffaed, 1.25);
    luzes.sol.position.set(16, 26, 14);
    luzes.sol.castShadow = true;
    luzes.sol.shadow.mapSize.width = 2048;
    luzes.sol.shadow.mapSize.height = 2048;
    luzes.sol.shadow.camera.near = 0.5;
    luzes.sol.shadow.camera.far = 110;
    var raioSombra = (D.GRADE / 2 + 8) * STEP;
    luzes.sol.shadow.camera.left = -raioSombra;
    luzes.sol.shadow.camera.right = raioSombra;
    luzes.sol.shadow.camera.top = raioSombra;
    luzes.sol.shadow.camera.bottom = -raioSombra;
    luzes.sol.shadow.bias = -0.00035;
    luzes.sol.shadow.normalBias = 0.02;
    cena.add(luzes.sol);

    luzes.luar = new THREE.DirectionalLight(0x8cb0dc, 0.3);
    luzes.luar.position.set(-16, 20, -14);
    cena.add(luzes.luar);

    luzes.lanterna = fazPartes.lanterna;

    montarChuva();
    ajustarCamera(0.6, 0.72, 28);
  }

  function criarArvore(x, z, escala) {
    var g = new THREE.Group();
    var alturaVariacao = 0.8 + Math.random() * 0.6;

    var tronco = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.15 * escala,
        0.2 * escala,
        1.2 * alturaVariacao * escala,
        8,
      ),
      materialBase(0x5a4530, "bark", { roughness: 0.95 }),
    );
    tronco.position.y = 0.6 * alturaVariacao * escala;
    tronco.castShadow = true;
    tronco.receiveShadow = true;
    g.add(tronco);

    var cores = [0x2f5a2a, 0x3f6a3a, 0x4f7a3a];
    for (var i = 0; i < 3; i++) {
      var copa = new THREE.Mesh(
        new THREE.ConeGeometry(0.8 * escala * (1 - i * 0.2), 0.9 * escala, 8),
        materialBase(cores[i], "leaf", { roughness: 0.85 }),
      );
      copa.position.y = (1.0 + i * 0.5) * alturaVariacao * escala;
      copa.castShadow = true;
      copa.receiveShadow = true;
      g.add(copa);
    }

    g.position.set(x, 0, z);

    g.userData.podeCortar = true;
    g.userData.tipo = "arvore";

    obstaculos.push({
      pos: new THREE.Vector3(x, 0, z),
      raio: 0.4 * escala,
      altura: 2.5 * escala,
      arvore: g,
    });

    return g;
  }

  function criarFlor(x, z) {
    var g = new THREE.Group();

    var caule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.015, 0.15, 4),
      materialBase(0x4a6a3a, null, { roughness: 0.8 }),
    );
    caule.position.y = 0.075;
    g.add(caule);

    var coresFlores = [
      0xff6b9d, 0xffaa33, 0xff3366, 0xaa66ff, 0x66aaff, 0xffff66,
    ];
    var cor = coresFlores[Math.floor(Math.random() * coresFlores.length)];

    for (var i = 0; i < 5; i++) {
      var petala = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 6),
        materialBase(cor, null, { roughness: 0.4 }),
      );
      var angulo = (i / 5) * Math.PI * 2;
      petala.position.set(
        Math.cos(angulo) * 0.03,
        0.16,
        Math.sin(angulo) * 0.03,
      );
      petala.scale.set(1, 0.3, 0.6);
      g.add(petala);
    }

    var centro = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 6),
      materialBase(0xffdd44, null, { roughness: 0.3 }),
    );
    centro.position.y = 0.16;
    g.add(centro);

    g.position.set(x, 0, z);
    return g;
  }

  function criarRocha(x, z, escala) {
    var g = new THREE.Group();

    var geo = new THREE.DodecahedronGeometry(0.3 * escala, 0);
    var positions = geo.attributes.position;
    for (var i = 0; i < positions.count; i++) {
      var x2 = positions.getX(i);
      var y2 = positions.getY(i);
      var z2 = positions.getZ(i);
      positions.setXYZ(
        i,
        x2 * (0.8 + Math.random() * 0.4),
        y2 * (0.6 + Math.random() * 0.3),
        z2 * (0.8 + Math.random() * 0.4),
      );
    }
    geo.computeVertexNormals();

    var rocha = new THREE.Mesh(
      geo,
      materialBase(0x6a6a5a, "brushed", { roughness: 0.95, metalness: 0.05 }),
    );
    rocha.position.y = 0.15 * escala;
    rocha.rotation.set(
      Math.random() * 0.5,
      Math.random() * Math.PI * 2,
      Math.random() * 0.5,
    );
    rocha.castShadow = true;
    rocha.receiveShadow = true;
    g.add(rocha);

    g.position.set(x, 0, z);

    obstaculos.push({
      pos: new THREE.Vector3(x, 0, z),
      raio: 0.35 * escala,
      altura: 0.5 * escala,
    });

    return g;
  }

  function criarMontanha(x, z, largura, altura) {
    var g = new THREE.Group();

    var base = new THREE.Mesh(
      new THREE.ConeGeometry(largura, altura, 8),
      materialBase(0x7a8a6a, "brushed", { roughness: 0.92 }),
    );
    base.position.y = altura / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);

    var pedra = new THREE.Mesh(
      new THREE.ConeGeometry(largura * 0.7, altura * 0.4, 8),
      materialBase(0x8a8a7a, "brushed", { roughness: 0.95 }),
    );
    pedra.position.y = altura * 0.7;
    pedra.castShadow = true;
    g.add(pedra);

    if (altura > 8) {
      var neve = new THREE.Mesh(
        new THREE.ConeGeometry(largura * 0.3, altura * 0.25, 8),
        materialBase(0xf0f0f0, null, { roughness: 0.6 }),
      );
      neve.position.y = altura * 0.9;
      neve.castShadow = true;
      g.add(neve);
    }

    g.position.set(x, 0, z);
    return g;
  }

  function criarArbusto(x, z) {
    var g = new THREE.Group();

    var numMoitas = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < numMoitas; i++) {
      var moita = new THREE.Mesh(
        new THREE.SphereGeometry(0.15 + Math.random() * 0.1, 6, 6),
        materialBase(0x5a8a4a, "leaf", { roughness: 0.88 }),
      );
      moita.position.set(
        (Math.random() - 0.5) * 0.3,
        0.12,
        (Math.random() - 0.5) * 0.3,
      );
      moita.scale.y = 0.7;
      moita.castShadow = true;
      moita.receiveShadow = true;
      g.add(moita);
    }

    g.position.set(x, 0, z);
    return g;
  }

  var nuvens = [];

  function criarCercaPerimetro() {
    var g = new THREE.Group();
    var matPoste = materialBase(0x6e4a2c, "bark", { roughness: 0.95 });
    var matTrilho = materialBase(0x825c38, "bark", { roughness: 0.92 });
    var limite = (D.GRADE * STEP) / 2 + 0.55;
    var passo = 1.25;
    var altPoste = 0.52;
    var rPoste = 0.05;

    function addPoste(px, pz) {
      var p = new THREE.Mesh(
        new THREE.CylinderGeometry(rPoste * 0.9, rPoste, altPoste, 6),
        matPoste,
      );
      p.position.set(px, altPoste / 2, pz);
      p.castShadow = true;
      p.receiveShadow = true;
      g.add(p);
    }

    function addTrilho(x1, z1, x2, z2, y) {
      var dx = x2 - x1;
      var dz = z2 - z1;
      var len = Math.sqrt(dx * dx + dz * dz);
      var ang = Math.atan2(dx, dz);
      var trilho = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.055, len),
        matTrilho,
      );
      trilho.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      trilho.rotation.y = ang;
      trilho.castShadow = true;
      trilho.receiveShadow = true;
      g.add(trilho);
    }

    var coords = [];
    for (var c = -limite; c <= limite + 0.01; c += passo) coords.push(c);

    for (var i = 0; i < coords.length; i++) {
      var cx = coords[i];
      if (Math.abs(cx) < 1.3) continue;
      addPoste(cx, -limite);
      addPoste(cx, limite);
      if (
        i < coords.length - 1 &&
        Math.abs(coords[i + 1]) >= 1.3 &&
        !(cx < -1.3 && coords[i + 1] > -1.3)
      ) {
        addTrilho(cx, -limite, coords[i + 1], -limite, 0.22);
        addTrilho(cx, -limite, coords[i + 1], -limite, 0.42);
        addTrilho(cx, limite, coords[i + 1], limite, 0.22);
        addTrilho(cx, limite, coords[i + 1], limite, 0.42);
      }
    }

    for (var j = 0; j < coords.length; j++) {
      var cz = coords[j];
      if (Math.abs(cz) < 1.3) continue;
      addPoste(-limite, cz);
      addPoste(limite, cz);
      if (
        j < coords.length - 1 &&
        Math.abs(coords[j + 1]) >= 1.3 &&
        !(cz < -1.3 && coords[j + 1] > -1.3)
      ) {
        addTrilho(-limite, cz, -limite, coords[j + 1], 0.22);
        addTrilho(-limite, cz, -limite, coords[j + 1], 0.42);
        addTrilho(limite, cz, limite, coords[j + 1], 0.22);
        addTrilho(limite, cz, limite, coords[j + 1], 0.42);
      }
    }

    return g;
  }

  function criarNuvensCeu() {
    var g = new THREE.Group();
    nuvens = [];
    var matNuvem = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
    });

    for (var n = 0; n < 8; n++) {
      var nuvem = new THREE.Group();
      var bolhas = 3 + Math.floor(Math.random() * 3);
      for (var b = 0; b < bolhas; b++) {
        var r = 1.4 + Math.random() * 1.6;
        var p = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 1), matNuvem);
        p.position.set(
          (b - bolhas / 2) * 1.8,
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.8,
        );
        p.scale.y = 0.52;
        nuvem.add(p);
      }
      var nx = (Math.random() - 0.5) * 65;
      var ny = 17 + Math.random() * 8;
      var nz = (Math.random() - 0.5) * 65;
      nuvem.position.set(nx, ny, nz);
      nuvem.userData.velocidade = 0.35 + Math.random() * 0.45;
      g.add(nuvem);
      nuvens.push(nuvem);
    }
    return g;
  }

  function criarEfeitoCorte(x, y, z) {
    var geo = new THREE.BoxGeometry(0.045, 0.045, 0.045);
    var mat = materialBase(0x8a5a32, null);
    for (var i = 0; i < 12; i++) {
      var p = new THREE.Mesh(geo, mat);
      p.position.set(
        x + (Math.random() - 0.5) * 0.3,
        y + Math.random() * 0.3,
        z + (Math.random() - 0.5) * 0.3,
      );
      p.userData = {
        vida: 0.8 + Math.random() * 0.4,
        velocidade: 0.8 + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 1.6,
        vz: (Math.random() - 0.5) * 1.6,
      };
      tabuleiro.add(p);
      modoConstrucao.particulas.push(p);
    }
  }

  function cortarArvore(arvore) {
    if (!arvore) return;
    animarGolpeFerramenta("machado");
    var pos = arvore.position;
    criarEfeitoCorte(pos.x, pos.y + 0.6, pos.z);

    obstaculos = obstaculos.filter(function (obs) {
      return obs.arvore !== arvore;
    });

    discardarObjeto(arvore);

    estado.dinheiro += 20;
    C.ganharXp(estado, 15);
    aviso("Arvore cortada com sucesso! +$20 e +15 XP.", false);
    atualizarUI();
    C.salvar(estado);
  }

  function animarGolpeFerramenta(tipo) {
    animacaoAcao.ativa = true;
    animacaoAcao.tempo = 0;
    if (tipo === "colher") {
      animacaoAcao.duracao = 0.8;
    } else if (tipo === "plantar") {
      animacaoAcao.duracao = 0.5;
    } else if (tipo === "regar") {
      animacaoAcao.duracao = 0.4;
    } else {
      animacaoAcao.duracao = 0.3;
    }
    animacaoAcao.tipo = tipo || (estado ? estado.ferramenta : "machado");
  }

  function criarPoeiraPasso(x, z) {
    if (particulasPoeira.length > 25) return;
    var matPoeira = new THREE.MeshBasicMaterial({
      color: 0xc8b898,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    var p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 4), matPoeira);
    p.position.set(
      x + (Math.random() - 0.5) * 0.12,
      0.03,
      z + (Math.random() - 0.5) * 0.12,
    );
    p.userData = { vida: 0.35, maxVida: 0.35, vy: 0.2 + Math.random() * 0.15 };
    tabuleiro.add(p);
    particulasPoeira.push(p);
  }

  function criarFumacaVeiculo(x, y, z) {
    if (particulasPoeira.length > 60) return;
    var p = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 5, 4),
      new THREE.MeshBasicMaterial({
        color: 0x5a5a58,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      }),
    );
    p.position.set(
      x + (Math.random() - 0.5) * 0.03,
      y,
      z + (Math.random() - 0.5) * 0.03,
    );
    p.userData = {
      vida: 0.9,
      maxVida: 0.9,
      vy: 0.35 + Math.random() * 0.2,
      gravidade: 0,
      cresce: 1.6,
      fumaca: true,
    };
    tabuleiro.add(p);
    particulasPoeira.push(p);
  }

  function criarPoeiraVeiculo(x, z) {
    if (particulasPoeira.length > 60) return;
    var p = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 5, 4),
      new THREE.MeshBasicMaterial({
        color: 0xcbbb9a,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    );
    p.position.set(x, ALTURA_CHAO + 0.04, z);
    p.userData = {
      vida: 0.6,
      maxVida: 0.6,
      vy: 0.18 + Math.random() * 0.15,
      gravidade: 0.6,
      cresce: 1.1,
      fumaca: true,
    };
    tabuleiro.add(p);
    particulasPoeira.push(p);
  }

  function emitirEfeitosVeiculo(item, dt, acelerando) {
    var correndo = Math.abs(veiculo.velocidade);
    var relogioPoeira = (veiculo.tempoEfeitos || 0) + dt;
    var relogioFumaca = (veiculo.tempoFumaca || 0) + dt;

    if (correndo > 0.6 && relogioPoeira > 0.09) {
      relogioPoeira = 0;
      var tras = -Math.cos(item.rotation.y);
      var lado = -Math.sin(item.rotation.y);
      var bx = item.position.x + tras * 0.34;
      var bz = item.position.z + tras * 0.34;
      criarPoeiraVeiculo(bx + lado * 0.2, bz);
      criarPoeiraVeiculo(bx - lado * 0.2, bz);
    }

    if (
      item.userData.diesel &&
      item.userData.fumaca &&
      acelerando !== 0 &&
      relogioFumaca > 0.1
    ) {
      relogioFumaca = 0;
      var f = item.userData.fumaca;
      var cos = Math.cos(item.rotation.y);
      var sen = Math.sin(item.rotation.y);
      var fx = item.position.x + f.x * cos + f.z * sen;
      var fz = item.position.z - f.x * sen + f.z * cos;
      criarFumacaVeiculo(fx, ALTURA_CHAO + f.y, fz);
    }

    veiculo.tempoEfeitos = relogioPoeira;
    veiculo.tempoFumaca = relogioFumaca;
  }

  function criarEfeitoColheita(x, y, z, cor) {
    if (particulasPoeira.length > 40) return;

    for (var i = 0; i < 8; i++) {
      var matColheita = new THREE.MeshBasicMaterial({
        color: cor || 0xd8b64a,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });

      var tamanho = 0.03 + Math.random() * 0.04;
      var p = new THREE.Mesh(
        new THREE.BoxGeometry(tamanho, tamanho, tamanho),
        matColheita,
      );

      var angulo = (i / 8) * Math.PI * 2;
      var raio = 0.1 + Math.random() * 0.15;

      p.position.set(
        x + Math.cos(angulo) * raio,
        y + 0.2 + Math.random() * 0.1,
        z + Math.sin(angulo) * raio,
      );

      p.userData = {
        vida: 0.6 + Math.random() * 0.4,
        maxVida: 1.0,
        vy: 0.5 + Math.random() * 0.4,
        vx: Math.cos(angulo) * (0.2 + Math.random() * 0.3),
        vz: Math.sin(angulo) * (0.2 + Math.random() * 0.3),
        rotacao: (Math.random() - 0.5) * 0.2,
      };

      tabuleiro.add(p);
      particulasPoeira.push(p);
    }

    for (var j = 0; j < 4; j++) {
      var matFolha = new THREE.MeshBasicMaterial({
        color: 0x4a8a32,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });

      var pFolha = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.06, 0.02),
        matFolha,
      );
      pFolha.position.set(
        x + (Math.random() - 0.5) * 0.2,
        y + 0.15,
        z + (Math.random() - 0.5) * 0.2,
      );

      pFolha.userData = {
        vida: 0.5 + Math.random() * 0.3,
        maxVida: 0.8,
        vy: 0.3 + Math.random() * 0.2,
        vx: (Math.random() - 0.5) * 0.3,
        vz: (Math.random() - 0.5) * 0.3,
        rotacao: (Math.random() - 0.5) * 0.3,
      };

      tabuleiro.add(pFolha);
      particulasPoeira.push(pFolha);
    }
  }

  function montarDecoracoes() {
    obstaculos = obstaculos.filter(function (obs) {
      return !obs.construcao;
    });

    grupoDecoracoes.add(criarCercaPerimetro());

    cena.add(criarNuvensCeu());

    var bordaFazenda = (D.GRADE * STEP) / 2 + 1.2;
    var raioMapa = bordaFazenda + 7;
    var distanciaMontanha = raioMapa + 10;

    var angulosMontanha = [0, 45, 90, 135, 180, 225, 270, 315];
    angulosMontanha.forEach(function (angulo) {
      var rad = (angulo * Math.PI) / 180;
      var x = Math.cos(rad) * distanciaMontanha;
      var z = Math.sin(rad) * distanciaMontanha;
      var altura = 12 + Math.random() * 9;
      var largura = 7 + Math.random() * 5;
      grupoDecoracoes.add(criarMontanha(x, z, largura, altura));
    });

    for (var i = 0; i < 16; i++) {
      var angulo = (i / 16) * Math.PI * 2 + Math.random() * 0.25;
      var distancia = raioMapa + 4 + Math.random() * 8;
      var x = Math.cos(angulo) * distancia;
      var z = Math.sin(angulo) * distancia;
      var altura = 5 + Math.random() * 6;
      var largura = 4 + Math.random() * 3;
      grupoDecoracoes.add(criarMontanha(x, z, largura, altura));
    }

    var numArvores = 50 + Math.floor(Math.random() * 12);
    for (var a = 0; a < numArvores; a++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = bordaFazenda + 1.2 + Math.random() * 6.5;
      var ax = Math.cos(ang) * dist;
      var az = Math.sin(ang) * dist;
      var escala = 0.65 + Math.random() * 0.75;
      grupoDecoracoes.add(criarArvore(ax, az, escala));
    }

    for (var r = 0; r < 25; r++) {
      var rang = Math.random() * Math.PI * 2;
      var rdist = bordaFazenda + 1.0 + Math.random() * 5.5;
      var rx = Math.cos(rang) * rdist;
      var rz = Math.sin(rang) * rdist;
      var rescala = 0.7 + Math.random() * 1.1;
      grupoDecoracoes.add(criarRocha(rx, rz, rescala));
    }

    for (var b = 0; b < 35; b++) {
      var bang = Math.random() * Math.PI * 2;
      var bdist = bordaFazenda + 0.6 + Math.random() * 5.0;
      var bx = Math.cos(bang) * bdist;
      var bz = Math.sin(bang) * bdist;
      grupoDecoracoes.add(criarArbusto(bx, bz));
    }

    for (var f = 0; f < 90; f++) {
      var fang = Math.random() * Math.PI * 2;
      var fdist = bordaFazenda + 0.5 + Math.random() * 5.2;
      var fx = Math.cos(fang) * fdist;
      var fz = Math.sin(fang) * fdist;
      grupoDecoracoes.add(criarFlor(fx, fz));
    }
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
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    chuva = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xa8c8d8,
        size: 0.07,
        transparent: true,
        opacity: 0.8,
      }),
    );
    chuva.visible = false;
    tabuleiro.add(chuva);
  }

  var _camAlvoX = 0,
    _camAlvoZ = 0,
    _camAlvoY = 0;

  function alvoDaCamera() {
    if (veiculo.ativo && veiculo.item) return veiculo.item;
    return malhaFazendeiro;
  }

  function ajustarCamera(az, pol, dist, dt) {
    var alvoX = 0,
      alvoY = 0,
      alvoZ = 0;
    var alvo = alvoDaCamera();
    if (alvo && (!livre || !livre.ligado)) {
      alvoX = alvo.position.x;
      alvoY = alvo.position.y;
      alvoZ = alvo.position.z;
    }
    var vel = dt ? Math.min(1, 8 * dt) : 1;
    _camAlvoX += (alvoX - _camAlvoX) * vel;
    _camAlvoY += (alvoY - _camAlvoY) * vel * 0.6;
    _camAlvoZ += (alvoZ - _camAlvoZ) * vel;
    camera.position.set(
      _camAlvoX + dist * Math.sin(pol) * Math.sin(az),
      dist * Math.cos(pol) + _camAlvoY * 0.4,
      _camAlvoZ + dist * Math.sin(pol) * Math.cos(az),
    );
    camera.lookAt(_camAlvoX, _camAlvoY * 0.4, _camAlvoZ);
  }

  function atualizarFerramentaMao() {
    if (!fazPartes.ferramentaMao || !estado) return;
    fazPartes.ferramentaMao.clear();

    var ferramenta = estado.ferramenta;
    var tool = null;

    if (ferramenta === "enxada") {
      tool = construirEnxada();
      tool.scale.set(0.5, 0.5, 0.5);
    } else if (ferramenta === "regador") {
      tool = construirRegador();
      tool.scale.set(0.4, 0.4, 0.4);
    } else if (ferramenta === "machado") {
      tool = construirMachado();
      tool.scale.set(0.45, 0.45, 0.45);
    }

    if (tool) {
      fazPartes.ferramentaMao.add(tool);
    }
  }

  var FORMA_CULTURA = {
    milho: { altura: 0.68, folhas: 6, cor: 0xd8b64a, espiga: true },
    soja: { altura: 0.38, folhas: 8, cor: 0x9bb85c },
    trigo: { altura: 0.48, folhas: 4, cor: 0xdcc98a, espiga: true },
    hortalica: { altura: 0.25, folhas: 9, cor: 0x6fbf7a },
    feija: { altura: 0.32, folhas: 8, cor: 0x8a6f4e },
    girassol: { altura: 0.65, folhas: 5, cor: 0xe8b73c, flor: true },
  };

  function malhaDoCultivo(cultivo) {
    var cultura = D.CULTURAS[cultivo.id];
    var forma = FORMA_CULTURA[cultivo.id] || {
      altura: 0.38,
      folhas: 5,
      cor: cultura.cor,
    };
    var pronto = cultivo.pronto;
    var avanco = Math.min(1, cultivo.progresso / cultura.dias);
    var altura = pronto ? forma.altura : forma.altura * (0.35 + avanco * 0.65);

    var g = new THREE.Group();
    [];
    g.userData.cultivoId = cultivo.id;

    if (cultivo.id === "girassol") {
      var cauleG = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.045, altura, 7),
        materialBase(0x4a7a3a, "bark", { roughness: 0.85 }),
      );
      cauleG.position.y = altura / 2 + 0.15;
      cauleG.castShadow = true;
      g.add(cauleG);

      for (var f = 0; f < 4; f++) {
        var angF = (f * Math.PI) / 2 + 0.3;
        var folhaG = new THREE.Mesh(
          new THREE.BoxGeometry(0.18 * avanco, 0.02, 0.12 * avanco),
          materialBase(0x3e7534, "leaf", { roughness: 0.75 }),
        );
        folhaG.position.set(
          Math.cos(angF) * 0.08,
          0.15 + altura * (0.2 + f * 0.2),
          Math.sin(angF) * 0.08,
        );
        folhaG.rotation.set(0.3, -angF, 0.2);
        folhaG.castShadow = true;
        g.add(folhaG);
      }

      if (pronto || avanco > 0.5) {
        var gFlor = new THREE.Group();
        gFlor.position.set(0, altura + 0.16, 0.04);
        gFlor.rotation.x = 0.25;

        var miolo = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12),
          materialBase(0x4a2e12, null, { roughness: 0.9 }),
        );
        miolo.rotation.x = Math.PI / 2;
        gFlor.add(miolo);

        var numPetalas = 12;
        for (var p = 0; p < numPetalas; p++) {
          var angP = (p / numPetalas) * Math.PI * 2;
          var petala = new THREE.Mesh(
            new THREE.ConeGeometry(0.03, 0.1, 4),
            materialBase(0xf2ba24, null, { roughness: 0.4 }),
          );
          petala.position.set(
            Math.cos(angP) * 0.1,
            Math.sin(angP) * 0.1,
            -0.01,
          );
          petala.rotation.z = angP - Math.PI / 2;
          gFlor.add(petala);
        }
        gFlor.castShadow = true;
        g.add(gFlor);
      }
    } else if (cultivo.id === "milho") {
      for (var colmo = -1; colmo <= 1; colmo += 2) {
        var xOffset = colmo * 0.08;
        var cauleM = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.035, altura, 6),
          materialBase(pronto ? 0x8a9e42 : 0x5a8f36, null, { roughness: 0.85 }),
        );
        cauleM.position.set(xOffset, altura / 2 + 0.15, 0);
        cauleM.castShadow = true;
        g.add(cauleM);

        for (var i = 0; i < 4; i++) {
          var ang = (i * Math.PI) / 2 + colmo * 0.4;
          var folhaM = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.014, 0.08),
            materialBase(0x4c8732, "leaf", { roughness: 0.75 }),
          );
          folhaM.position.set(
            xOffset + Math.cos(ang) * 0.12,
            0.15 + altura * (0.3 + i * 0.18),
            Math.sin(ang) * 0.12,
          );
          folhaM.rotation.set(0.5, -ang, 0.3);
          folhaM.castShadow = true;
          g.add(folhaM);
        }

        if (pronto) {
          var espiga = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.04, 0.14, 8),
            materialBase(0xe0b234, null, { roughness: 0.45 }),
          );
          espiga.position.set(xOffset + 0.06, altura * 0.65 + 0.15, 0.04);
          espiga.rotation.z = -0.35;
          espiga.castShadow = true;
          g.add(espiga);
        }
      }
    } else if (cultivo.id === "trigo") {
      for (var t = 0; t < 5; t++) {
        var angT = (t / 5) * Math.PI * 2;
        var rT = 0.08;
        var cauleT = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.018, altura, 5),
          materialBase(pronto ? 0xdcc072 : 0x7da84a, null, { roughness: 0.85 }),
        );
        cauleT.position.set(
          Math.cos(angT) * rT,
          altura / 2 + 0.15,
          Math.sin(angT) * rT,
        );
        cauleT.rotation.z = Math.sin(angT) * 0.08;
        cauleT.castShadow = true;
        g.add(cauleT);

        if (pronto) {
          var espigaT = new THREE.Mesh(
            new THREE.ConeGeometry(0.03, 0.12, 6),
            materialBase(0xcca044, null, { roughness: 0.6 }),
          );
          espigaT.position.set(
            Math.cos(angT) * rT,
            altura + 0.16,
            Math.sin(angT) * rT,
          );
          espigaT.rotation.z = Math.sin(angT) * 0.15;
          g.add(espigaT);
        }
      }
    } else {
      var caule = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.035, altura, 6),
        materialBase(pronto ? 0x7fa248 : 0x5a8a42, null, { roughness: 0.85 }),
      );
      caule.position.y = altura / 2 + 0.15;
      caule.castShadow = true;
      g.add(caule);

      var folhas = Math.max(
        2,
        Math.round(forma.folhas * (pronto ? 1 : avanco)),
      );
      for (var k = 0; k < folhas; k++) {
        var angK = (k / folhas) * Math.PI * 2;
        var folha = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.015, 0.09),
          materialBase(forma.cor, "leaf", { roughness: 0.75 }),
        );
        folha.position.set(
          Math.cos(angK) * 0.09,
          0.15 + altura * (0.3 + 0.5 * (k / folhas)),
          Math.sin(angK) * 0.09,
        );
        folha.rotation.set(0.4, -angK, 0.2);
        folha.castShadow = true;
        g.add(folha);
      }
    }

    return g;
  }

  function roda(raio, largura, corPneu, corAro) {
    var g = new THREE.Group();
    var pneu = new THREE.Mesh(
      new THREE.CylinderGeometry(raio, raio, largura, 16),
      materialBase(corPneu || 0x1d1d1d, null, {
        roughness: 0.92,
        metalness: 0.05,
      }),
    );
    pneu.rotation.z = Math.PI / 2;
    pneu.castShadow = true;
    pneu.receiveShadow = true;
    var aro = new THREE.Mesh(
      new THREE.CylinderGeometry(raio * 0.6, raio * 0.6, largura * 1.05, 12),
      materialBase(corAro || 0xd4a742, "brushed", {
        metalness: 0.65,
        roughness: 0.35,
      }),
    );
    aro.rotation.z = Math.PI / 2;
    var cubo = new THREE.Mesh(
      new THREE.CylinderGeometry(raio * 0.22, raio * 0.22, largura * 1.15, 8),
      materialBase(0x333333, "brushed", { metalness: 0.8, roughness: 0.2 }),
    );
    cubo.rotation.z = Math.PI / 2;
    g.add(pneu, aro, cubo);
    g.userData.raioRoda = raio;
    return g;
  }

  function rodaEstercavel(raio, largura, corPneu, corAro) {
    var pivo = new THREE.Group();
    pivo.add(roda(raio, largura, corPneu, corAro));
    return pivo;
  }

  function caixaDe(cor, w, h, d, textura, y) {
    var m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      materialBase(cor, textura),
    );
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function construirVeiculo(cor, eletrico) {
    var g = new THREE.Group();
    g.userData.diesel = !eletrico;
    g.userData.banco = eletrico
      ? { y: 0.3, z: -0.07, escala: 0.62 }
      : { y: 0.28, z: -0.15, escala: 0.72 };

    if (!eletrico) {
      var chassi = caixaDe(0x282c2e, 0.36, 0.12, 0.62, "brushed", 0.14);
      g.add(chassi);

      var capo = caixaDe(cor || 0x8a3a2a, 0.32, 0.2, 0.36, "brushed", 0.28);
      capo.position.z = 0.12;
      var friso = caixaDe(0xe0cfa4, 0.33, 0.035, 0.14, null, 0.36);
      friso.position.z = 0.1;
      var tanque = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10),
        materialBase(0x6f7a7e, "brushed", { metalness: 0.75, roughness: 0.35 }),
      );
      tanque.position.set(0.1, 0.39, 0.2);
      g.add(capo, friso, tanque);

      var grade = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.18, 0.03),
        materialBase(0x8a9296, "brushed", { metalness: 0.7, roughness: 0.35 }),
      );
      grade.position.set(0, 0.28, 0.31);
      g.add(grade);
      for (var a = 0; a < 4; a++) {
        var aleta = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.012, 0.02),
          materialBase(0x4d575b, "brushed", { metalness: 0.6 }),
        );
        aleta.position.set(0, 0.21 + a * 0.05, 0.325);
        g.add(aleta);
      }

      var lente = materialBase(0xfff6c0, null, {
        emissive: 0xffe488,
        emissiveIntensity: 0.35,
      });
      var farolEsq = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 8),
        lente,
      );
      farolEsq.position.set(-0.13, 0.32, 0.31);
      var farolDir = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 8),
        lente,
      );
      farolDir.position.set(0.13, 0.32, 0.31);
      var aroFarol = new THREE.Mesh(
        new THREE.TorusGeometry(0.046, 0.008, 6, 12),
        materialBase(0x8a9296, "brushed", { metalness: 0.8, roughness: 0.3 }),
      );
      aroFarol.position.set(-0.13, 0.32, 0.31);
      var aroFarol2 = aroFarol.clone();
      aroFarol2.position.x = 0.13;
      var luzFarol = new THREE.PointLight(0xffe9b0, 0, 5.5, 2.0);
      luzFarol.position.set(0, 0.3, 0.45);
      g.add(farolEsq, farolDir, aroFarol, aroFarol2, luzFarol);
      g.userData.farois = [farolEsq, farolDir];
      g.userData.luzFarol = luzFarol;
      g.userData.eFarois = true;

      var escapamento = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.024, 0.38, 8),
        materialBase(0x3d4044, "brushed", { metalness: 0.75, roughness: 0.4 }),
      );
      escapamento.position.set(-0.12, 0.48, 0.18);
      var tampaEscape = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.015, 8),
        materialBase(0x222222, null, { metalness: 0.8 }),
      );
      tampaEscape.position.set(-0.12, 0.68, 0.18);
      tampaEscape.rotation.z = 0.35;
      var aletaCalor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8),
        materialBase(0x8a9296, "brushed", { metalness: 0.6, roughness: 0.55 }),
      );
      aletaCalor.position.set(-0.12, 0.45, 0.18);
      g.add(escapamento, tampaEscape, aletaCalor);
      g.userData.fumaca = { x: -0.12, y: 0.72, z: 0.18 };

      var assento = caixaDe(0x1a1a1a, 0.22, 0.08, 0.18, null, 0.32);
      assento.position.z = -0.16;
      var encosto = caixaDe(0x1a1a1a, 0.22, 0.16, 0.04, null, 0.42);
      encosto.position.z = -0.24;
      var painel = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.1, 0.05),
        materialBase(0x24343a, "brushed", { metalness: 0.4, roughness: 0.5 }),
      );
      painel.position.set(0, 0.4, 0.02);
      painel.rotation.x = -0.3;
      var mostrador = materialBase(0xffe9b0, null, {
        emissive: 0xffc85a,
        emissiveIntensity: 0.9,
      });
      var vidroPainel = new THREE.Mesh(
        new THREE.CircleGeometry(0.022, 10),
        mostrador,
      );
      vidroPainel.position.set(-0.05, 0.425, 0.005);
      vidroPainel.rotation.x = -0.3;
      var vidroPainel2 = new THREE.Mesh(
        new THREE.CircleGeometry(0.022, 10),
        mostrador,
      );
      vidroPainel2.position.set(0.05, 0.425, 0.005);
      vidroPainel2.rotation.x = -0.3;
      var colunaVolante = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6),
        materialBase(0x444444, "brushed"),
      );
      colunaVolante.position.set(0, 0.36, -0.04);
      colunaVolante.rotation.x = -0.4;
      var volante = new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.012, 6, 14),
        materialBase(0x111111, null, { roughness: 0.5 }),
      );
      volante.position.set(0, 0.44, -0.07);
      volante.rotation.x = Math.PI / 2 - 0.4;
      g.add(
        assento,
        encosto,
        painel,
        vidroPainel,
        vidroPainel2,
        colunaVolante,
        volante,
      );
      g.userData.painel = [vidroPainel, vidroPainel2];
      var barraEsq = new THREE.Mesh(
        new THREE.BoxGeometry(0.025, 0.34, 0.025),
        materialBase(0x6f7a7e, "brushed", { metalness: 0.7, roughness: 0.4 }),
      );
      barraEsq.position.set(-0.14, 0.44, -0.26);
      var barraDir = barraEsq.clone();
      barraDir.position.x = 0.14;
      var barraTopo = new THREE.Mesh(
        new THREE.BoxGeometry(0.31, 0.025, 0.025),
        materialBase(0x6f7a7e, "brushed", { metalness: 0.7, roughness: 0.4 }),
      );
      barraTopo.position.set(0, 0.6, -0.26);
      var degrau = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.02, 0.07),
        materialBase(0x5c666a, "brushed", { metalness: 0.6, roughness: 0.55 }),
      );
      degrau.position.set(0, 0.22, -0.2);
      g.add(barraEsq, barraDir, barraTopo, degrau);

      for (var f = 0; f < 2; f++) {
        var aroLama = new THREE.Mesh(
          new THREE.TorusGeometry(0.2, 0.032, 6, 10, Math.PI),
          materialBase(cor || 0x8a3a2a, "brushed", {
            metalness: 0.35,
            roughness: 0.6,
          }),
        );
        aroLama.position.set(f === 0 ? -0.22 : 0.22, 0.18, -0.16);
        aroLama.rotation.y = Math.PI / 2;
        var saia = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.12, 0.02),
          materialBase(0x22262a, null, { roughness: 0.9 }),
        );
        saia.position.set(f === 0 ? -0.22 : 0.22, 0.1, -0.31);
        g.add(aroLama, saia);
      }

      var rodaTraseiraEsq = roda(0.18, 0.09, 0x1d1d1d, 0xcca034);
      rodaTraseiraEsq.position.set(-0.22, 0.18, -0.16);
      var rodaTraseiraDir = roda(0.18, 0.09, 0x1d1d1d, 0xcca034);
      rodaTraseiraDir.position.set(0.22, 0.18, -0.16);
      var dianteiraEsq = rodaEstercavel(0.1, 0.06, 0x1d1d1d, 0xcca034);
      dianteiraEsq.position.set(-0.19, 0.1, 0.18);
      var dianteiraDir = rodaEstercavel(0.1, 0.06, 0x1d1d1d, 0xcca034);
      dianteiraDir.position.set(0.19, 0.1, 0.18);
      g.add(rodaTraseiraEsq, rodaTraseiraDir, dianteiraEsq, dianteiraDir);
      g.userData.esterco = [dianteiraEsq, dianteiraDir];

      var espelhoEsq = new THREE.Mesh(
        new THREE.BoxGeometry(0.02, 0.045, 0.03),
        materialBase(0x2a2f33, "brushed", { metalness: 0.5, roughness: 0.4 }),
      );
      espelhoEsq.position.set(-0.2, 0.55, -0.24);
      espelhoEsq.rotation.y = 0.4;
      var espelhoDir = espelhoEsq.clone();
      espelhoDir.position.x = 0.2;
      espelhoDir.rotation.y = -0.4;
      g.add(espelhoEsq, espelhoDir);

      var engate = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.04, 0.14),
        materialBase(0x444444, "brushed", { metalness: 0.8 }),
      );
      engate.position.set(0, 0.12, -0.34);
      var aradoLaminaEsq = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.16, 4),
        materialBase(0x8a9296, "brushed", { metalness: 0.85, roughness: 0.25 }),
      );
      aradoLaminaEsq.rotation.set(-0.5, 0, 0.4);
      aradoLaminaEsq.position.set(-0.09, 0.06, -0.4);
      var aradoLaminaDir = aradoLaminaEsq.clone();
      aradoLaminaDir.position.x = 0.09;
      aradoLaminaDir.rotation.z = -0.4;
      g.add(engate, aradoLaminaEsq, aradoLaminaDir);
    } else {
      var chassiE = caixaDe(0x1e3630, 0.38, 0.14, 0.64, "brushed", 0.14);
      var saiaE = caixaDe(0x1c5347, 0.42, 0.1, 0.5, "brushed", 0.11);
      var carroceria = caixaDe(0x2da882, 0.34, 0.18, 0.42, "brushed", 0.26);
      carroceria.position.z = 0.08;
      var frisoE = caixaDe(0x9ff2cf, 0.35, 0.03, 0.3, null, 0.33);
      frisoE.position.z = 0.08;
      g.add(chassiE, saiaE, carroceria, frisoE);

      var cabineVidro = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.2, 0.26),
        materialBase(0x88dcf4, null, {
          transparent: true,
          opacity: 0.5,
          metalness: 0.2,
          roughness: 0.15,
        }),
      );
      cabineVidro.position.set(0, 0.42, -0.06);
      var arcoCabine = new THREE.Mesh(
        new THREE.TorusGeometry(0.15, 0.014, 6, 12, Math.PI),
        materialBase(0x2f7f6a, "brushed", { metalness: 0.5, roughness: 0.4 }),
      );
      arcoCabine.position.set(0, 0.52, -0.06);
      arcoCabine.rotation.y = Math.PI / 2;
      var bancoE = caixaDe(0x18332c, 0.16, 0.07, 0.14, null, 0.36);
      bancoE.position.z = -0.11;
      var volanteE = new THREE.Mesh(
        new THREE.TorusGeometry(0.045, 0.01, 6, 12),
        materialBase(0x0f2a24, null, { roughness: 0.5 }),
      );
      volanteE.position.set(0, 0.42, 0.01);
      volanteE.rotation.x = Math.PI / 2 - 0.3;
      g.add(cabineVidro, arcoCabine, bancoE, volanteE);

      var tetoSolar = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.02, 0.24),
        materialBase(0x184872, "solar", { metalness: 0.6, roughness: 0.2 }),
      );
      tetoSolar.position.set(0, 0.53, -0.06);
      var molduraSolar = new THREE.Mesh(
        new THREE.BoxGeometry(0.29, 0.012, 0.27),
        materialBase(0x2f7f6a, "brushed", { metalness: 0.5, roughness: 0.4 }),
      );
      molduraSolar.position.set(0, 0.525, -0.06);
      g.add(tetoSolar, molduraSolar);

      var lenteE = materialBase(0xd8fff0, null, {
        emissive: 0x66ffcc,
        emissiveIntensity: 0.5,
      });
      var farolEEsq = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 8),
        lenteE,
      );
      farolEEsq.position.set(-0.11, 0.3, 0.29);
      var farolEDir = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 8, 8),
        lenteE,
      );
      farolEDir.position.set(0.11, 0.3, 0.29);
      var lightbar = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.035, 0.02),
        materialBase(0x66ffcc, null, {
          emissive: 0x44ffaa,
          emissiveIntensity: 1.0,
        }),
      );
      lightbar.position.set(0, 0.26, 0.3);
      var luzFarolE = new THREE.PointLight(0x9dffe0, 0, 5.5, 2.0);
      luzFarolE.position.set(0, 0.3, 0.45);
      g.add(farolEEsq, farolEDir, lightbar, luzFarolE);
      g.userData.farois = [farolEEsq, farolEDir, lightbar];
      g.userData.luzFarol = luzFarolE;
      g.userData.eFarois = true;

      var giroflex = new THREE.Mesh(
        new THREE.SphereGeometry(0.028, 8, 6),
        materialBase(0xffb03a, null, {
          emissive: 0xff8c1a,
          emissiveIntensity: 1.2,
        }),
      );
      giroflex.position.set(0, 0.58, -0.06);
      var lanterna = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.03, 0.02),
        materialBase(0xff5a5a, null, {
          emissive: 0xff2d2d,
          emissiveIntensity: 0.8,
        }),
      );
      lanterna.position.set(0, 0.3, -0.31);
      var tomada = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8),
        materialBase(0x2f7f6a, "brushed", { metalness: 0.5, roughness: 0.4 }),
      );
      tomada.rotation.z = Math.PI / 2;
      tomada.position.set(0.19, 0.3, -0.2);
      var ledCarga = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 6, 6),
        materialBase(0x66ffcc, null, {
          emissive: 0x44ffaa,
          emissiveIntensity: 1.0,
        }),
      );
      ledCarga.position.set(0.21, 0.3, -0.2);
      g.add(giroflex, lanterna, tomada, ledCarga);
      g.userData.giroflex = giroflex;

      var nucleoEsq = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8),
        materialBase(0x00e5ff, null, {
          emissive: 0x00c8e0,
          emissiveIntensity: 0.9,
        }),
      );
      nucleoEsq.rotation.x = Math.PI / 2;
      nucleoEsq.position.set(-0.18, 0.22, 0);
      var nucleoDir = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8),
        materialBase(0x00e5ff, null, {
          emissive: 0x00c8e0,
          emissiveIntensity: 0.9,
        }),
      );
      nucleoDir.rotation.x = Math.PI / 2;
      nucleoDir.position.set(0.18, 0.22, 0);
      g.add(nucleoEsq, nucleoDir);

      var rodaEEsq = roda(0.17, 0.08, 0x1a2420, 0x33e0aa);
      rodaEEsq.position.set(-0.21, 0.17, -0.16);
      var rodaEDir = roda(0.17, 0.08, 0x1a2420, 0x33e0aa);
      rodaEDir.position.set(0.21, 0.17, -0.16);
      var rodaDFrenteEsq = rodaEstercavel(0.11, 0.06, 0x1a2420, 0x33e0aa);
      rodaDFrenteEsq.position.set(-0.19, 0.11, 0.18);
      var rodaDFrenteDir = rodaEstercavel(0.11, 0.06, 0x1a2420, 0x33e0aa);
      rodaDFrenteDir.position.set(0.19, 0.11, 0.18);
      g.add(rodaEEsq, rodaEDir, rodaDFrenteEsq, rodaDFrenteDir);
      g.userData.esterco = [rodaDFrenteEsq, rodaDFrenteDir];
    }

    g.traverse(function (c) {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return g;
  }

  function construirDrone() {
    var g = new THREE.Group();

    var corpo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.08, 8),
      materialBase(0x232830, "brushed", { metalness: 0.6, roughness: 0.35 }),
    );
    corpo.position.y = 0.35;
    var domo = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      materialBase(0x3a4855, null, { roughness: 0.4 }),
    );
    domo.position.y = 0.39;
    domo.scale.set(1, 0.5, 1);
    g.add(corpo, domo);

    var helices = [];
    var hastes = [
      [-0.18, -0.18],
      [0.18, -0.18],
      [-0.18, 0.18],
      [0.18, 0.18],
    ];
    hastes.forEach(function (p, idx) {
      var braco = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.02, 0.025),
        materialBase(0x181c22, "brushed", { metalness: 0.7 }),
      );
      braco.position.set(p[0] / 2, 0.35, p[1] / 2);
      braco.lookAt(0, 0.35, 0);

      var motor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.045, 8),
        materialBase(0x445566, "brushed", { metalness: 0.8 }),
      );
      motor.position.set(p[0], 0.36, p[1]);

      var helice = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.006, 0.028),
        materialBase(0xd8eaf4, null, { roughness: 0.3 }),
      );
      helice.position.set(p[0], 0.39, p[1]);
      helices.push(helice);

      var discoBorrao = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.003, 12),
        materialBase(0x9fc8dc, null, {
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      );
      discoBorrao.position.set(p[0], 0.39, p[1]);

      var corLed = idx % 2 === 0 ? 0x22ff44 : 0xff2222;
      var led = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 6, 6),
        materialBase(corLed, null, {
          emissive: corLed,
          emissiveIntensity: 1.0,
        }),
      );
      led.position.set(p[0], 0.34, p[1]);

      g.add(braco, motor, helice, discoBorrao, led);
    });

    var gimbal = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      materialBase(0x111111, null, { roughness: 0.1, metalness: 0.9 }),
    );
    gimbal.position.set(0, 0.29, 0.05);

    var tanqueSementes = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.055, 0.1, 8),
      materialBase(0x486475, "brushed", { metalness: 0.4 }),
    );
    tanqueSementes.position.set(0, 0.28, -0.03);

    var esquiEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.015, 0.3),
      materialBase(0x222222, null),
    );
    esquiEsq.position.set(-0.1, 0.22, 0);
    var esquiDir = esquiEsq.clone();
    esquiDir.position.x = 0.1;
    var pernaEsqui1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4),
      materialBase(0x222222),
    );
    pernaEsqui1.position.set(-0.1, 0.27, 0.08);
    var pernaEsqui2 = pernaEsqui1.clone();
    pernaEsqui2.position.z = -0.08;
    var pernaEsqui3 = pernaEsqui1.clone();
    pernaEsqui3.position.x = 0.1;
    var pernaEsqui4 = pernaEsqui2.clone();
    pernaEsqui4.position.x = 0.1;

    g.add(
      gimbal,
      tanqueSementes,
      esquiEsq,
      esquiDir,
      pernaEsqui1,
      pernaEsqui2,
      pernaEsqui3,
      pernaEsqui4,
    );
    g.userData.helices = helices;

    g.traverse(function (c) {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return g;
  }

  function construirColheitadeira() {
    var g = new THREE.Group();

    var corpo = caixaDe(0xd97e28, 0.46, 0.28, 0.62, "brushed", 0.26);
    g.add(corpo);

    var cabine = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.22, 0.26),
      materialBase(0x2a3e4c, null, { roughness: 0.3 }),
    );
    cabine.position.set(0, 0.46, 0.12);
    var vidro = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.16, 0.08),
      materialBase(0x8cd8f0, null, { transparent: true, opacity: 0.55 }),
    );
    vidro.position.set(0, 0.46, 0.24);
    var barraFarol = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.03, 0.04),
      materialBase(0xfff6c0, null, {
        emissive: 0xffe488,
        emissiveIntensity: 0.9,
      }),
    );
    barraFarol.position.set(0, 0.58, 0.24);
    g.add(cabine, vidro, barraFarol);

    var plataforma = caixaDe(0x8a5220, 0.64, 0.08, 0.16, "brushed", 0.12);
    plataforma.position.z = 0.42;
    var dentes = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.02, 0.06),
      materialBase(0x9aa4a8, "brushed", { metalness: 0.8, roughness: 0.3 }),
    );
    dentes.position.set(0, 0.1, 0.51);

    var molineteEixo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8),
      materialBase(0x333333, "brushed"),
    );
    molineteEixo.rotation.z = Math.PI / 2;
    molineteEixo.position.set(0, 0.22, 0.46);
    var molinetePas = new THREE.Group();
    for (var m = 0; m < 4; m++) {
      var pa = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.015, 0.06),
        materialBase(0xb86820, "brushed"),
      );
      pa.rotation.x = (m * Math.PI) / 2;
      molinetePas.add(pa);
    }
    molinetePas.position.copy(molineteEixo.position);
    g.add(plataforma, dentes, molineteEixo, molinetePas);
    g.userData.molinete = molinetePas;

    var graos = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.06, 0.28),
      materialBase(0xd8b64a, "soil", { roughness: 0.7 }),
    );
    graos.position.set(0, 0.42, -0.14);
    g.add(graos);

    var tuboDescarga = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.035, 0.48, 8),
      materialBase(0xd97e28, "brushed"),
    );
    tuboDescarga.position.set(-0.28, 0.44, -0.16);
    tuboDescarga.rotation.set(0.3, 0, 0.8);
    g.add(tuboDescarga);

    var rodaFEsq = roda(0.18, 0.11, 0x1d1d1d, 0xd4a742);
    rodaFEsq.position.set(-0.27, 0.18, 0.16);
    var rodaFDir = roda(0.18, 0.11, 0x1d1d1d, 0xd4a742);
    rodaFDir.position.set(0.27, 0.18, 0.16);
    var rodaTEsq = roda(0.13, 0.09, 0x1d1d1d, 0xd4a742);
    rodaTEsq.position.set(-0.25, 0.13, -0.22);
    var rodaTDir = roda(0.13, 0.09, 0x1d1d1d, 0xd4a742);
    rodaTDir.position.set(0.25, 0.13, -0.22);
    g.add(rodaFEsq, rodaFDir, rodaTEsq, rodaTDir);

    g.traverse(function (c) {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return g;
  }

  function construirEnxada() {
    var g = new THREE.Group();
    var cabo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.02, 0.65, 8),
      materialBase(0x9a7248, "bark", { roughness: 0.8 }),
    );
    cabo.position.y = 0.32;
    cabo.rotation.z = 0.32;

    var virola = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.04, 8),
      materialBase(0xcca034, "brushed", { metalness: 0.8, roughness: 0.3 }),
    );
    virola.position.set(-0.1, 0.03, 0);
    virola.rotation.z = 0.32;

    var lamina = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.025, 0.12),
      materialBase(0xa0a8ac, "brushed", { metalness: 0.85, roughness: 0.3 }),
    );
    lamina.position.set(-0.12, 0.015, 0);
    lamina.rotation.z = 0.32;

    g.add(cabo, virola, lamina);
    g.traverse(function (c) {
      if (c.isMesh) {
        c.castShadow = true;
      }
    });
    return g;
  }

  function construirRegador() {
    var g = new THREE.Group();
    var corpo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.24, 14),
      materialBase(0x3d7888, "brushed", { metalness: 0.5, roughness: 0.4 }),
    );
    corpo.position.y = 0.12;

    var bico = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.035, 0.24, 8),
      materialBase(0x3d7888, "brushed", { metalness: 0.5 }),
    );
    bico.position.set(0.15, 0.21, 0);
    bico.rotation.z = -0.92;

    var rosa = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.03, 0.04, 10),
      materialBase(0xd4a742, "brushed", { metalness: 0.8, roughness: 0.3 }),
    );
    rosa.position.set(0.25, 0.3, 0);
    rosa.rotation.z = -0.92;

    var alcaTopo = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.014, 6, 14, Math.PI),
      materialBase(0x285562, "brushed"),
    );
    alcaTopo.position.y = 0.24;
    alcaTopo.rotation.x = Math.PI / 2;

    var alcaTras = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI),
      materialBase(0x285562, "brushed"),
    );
    alcaTras.position.set(-0.13, 0.14, 0);
    alcaTras.rotation.z = Math.PI / 2;

    g.add(corpo, bico, rosa, alcaTopo, alcaTras);
    g.traverse(function (c) {
      if (c.isMesh) {
        c.castShadow = true;
      }
    });
    return g;
  }

  function construirMachado() {
    var g = new THREE.Group();
    var cabo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.026, 0.68, 8),
      materialBase(0x8a5528, "bark", { roughness: 0.85 }),
    );
    cabo.position.y = 0.34;
    cabo.rotation.z = 0.25;

    var lamina = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.16, 0.035),
      materialBase(0xadb6bc, "brushed", { metalness: 0.85, roughness: 0.28 }),
    );
    lamina.position.set(-0.09, 0.64, 0);
    lamina.rotation.z = 0.25;

    var fio = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.025, 0.045),
      materialBase(0xe4eaee, "brushed", { metalness: 0.95, roughness: 0.15 }),
    );
    fio.position.set(-0.09, 0.72, 0);
    fio.rotation.z = 0.25;

    g.add(cabo, lamina, fio);
    g.traverse(function (c) {
      if (c.isMesh) {
        c.castShadow = true;
      }
    });
    return g;
  }

  function construirGotejamento() {
    var g = new THREE.Group();

    var cano1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.88, 8),
      materialBase(0x283832, "brushed", { metalness: 0.4, roughness: 0.5 }),
    );
    cano1.rotation.z = Math.PI / 2;
    cano1.position.y = 0.14;

    var cano2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.88, 8),
      materialBase(0x283832, "brushed", { metalness: 0.4, roughness: 0.5 }),
    );
    cano2.rotation.x = Math.PI / 2;
    cano2.position.y = 0.14;

    var valvula = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      materialBase(0xd4a742, "brushed", { metalness: 0.75, roughness: 0.3 }),
    );
    valvula.position.y = 0.14;
    var manometro = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10),
      materialBase(0xffffff, null, { roughness: 0.3 }),
    );
    manometro.position.set(0, 0.19, 0);
    g.add(cano1, cano2, valvula, manometro);

    for (var i = -1; i <= 1; i += 2) {
      for (var j = -1; j <= 1; j += 2) {
        var bocal = new THREE.Mesh(
          new THREE.ConeGeometry(0.025, 0.06, 6),
          materialBase(0x184838, null),
        );
        bocal.position.set(i * 0.32, 0.11, j * 0.32);
        bocal.rotation.x = Math.PI;

        var manchaAgua = new THREE.Mesh(
          new THREE.CircleGeometry(0.09, 8),
          materialBase(0x426858, null, {
            roughness: 0.3,
            transparent: true,
            opacity: 0.75,
            depthWrite: false,
          }),
        );
        manchaAgua.rotation.x = -Math.PI / 2;
        manchaAgua.position.set(i * 0.32, 0.01, j * 0.32);

        g.add(bocal, manchaAgua);
      }
    }
    return g;
  }

  function malhaDeEstrutura(id) {
    var eq = D.EQUIPAMENTOS[id];
    var en = D.ENERGIA[id];
    var g = new THREE.Group();

    if (id === "arvore") {
      var tronco = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.12, 0.45, 8),
        materialBase(0x563e2a, "bark", { roughness: 0.95 }),
      );
      tronco.position.y = 0.22;
      tronco.castShadow = true;

      for (var r = 0; r < 4; r++) {
        var angR = (r / 4) * Math.PI * 2;
        var raiz = new THREE.Mesh(
          new THREE.ConeGeometry(0.04, 0.18, 5),
          materialBase(0x563e2a, "bark", { roughness: 0.95 }),
        );
        raiz.position.set(Math.cos(angR) * 0.11, 0.05, Math.sin(angR) * 0.11);
        raiz.rotation.set(0.6 * Math.sin(angR), 0, -0.6 * Math.cos(angR));
        g.add(raiz);
      }

      var copaC = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 12, 10),
        materialBase(0x427c34, "leaf", { roughness: 0.85 }),
      );
      copaC.position.y = 0.65;
      var copaEsq = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 10, 8),
        materialBase(0x528e42, "leaf", { roughness: 0.85 }),
      );
      copaEsq.position.set(-0.14, 0.6, 0.08);
      var copaDir = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 8),
        materialBase(0x386c2e, "leaf", { roughness: 0.85 }),
      );
      copaDir.position.set(0.14, 0.62, -0.06);

      for (var m = 0; m < 5; m++) {
        var fruto = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 5, 5),
          materialBase(0xe03838, null, { roughness: 0.4 }),
        );
        var angM = (m / 5) * Math.PI * 2;
        fruto.position.set(
          Math.cos(angM) * 0.22,
          0.6 + (m % 2) * 0.08,
          Math.sin(angM) * 0.22,
        );
        g.add(fruto);
      }

      g.add(tronco, copaC, copaEsq, copaDir);
    } else if (id === "composteira") {
      var baseCaixa = caixaDe(0x5e4832, 0.42, 0.32, 0.42, "bark", 0.16);
      for (var s = 0; s < 3; s++) {
        var ripaF = new THREE.Mesh(
          new THREE.BoxGeometry(0.44, 0.05, 0.02),
          materialBase(0x7a5e42, "bark", { roughness: 0.9 }),
        );
        ripaF.position.set(0, 0.06 + s * 0.1, 0.215);
        g.add(ripaF);
      }

      var adubo = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.12, 0.38),
        materialBase(0x3a2c1e, "soil", { roughness: 0.95 }),
      );
      adubo.position.y = 0.24;

      var tampa = caixaDe(0x8a6b4a, 0.45, 0.035, 0.45, "bark", 0.34);
      tampa.rotation.x = -0.35;
      tampa.position.set(0, 0.37, -0.06);

      var termometro = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.015, 10),
        materialBase(0xffffff, null, { roughness: 0.3 }),
      );
      termometro.rotation.x = Math.PI / 2;
      termometro.position.set(0.12, 0.22, 0.225);

      g.add(baseCaixa, adubo, tampa, termometro);
    } else if (id === "painel") {
      var suporte = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.03, 0.32, 8),
        materialBase(0x6e7880, "brushed", { metalness: 0.8, roughness: 0.3 }),
      );
      suporte.position.y = 0.16;

      var moldura = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.04, 0.38),
        materialBase(0x8a9296, "brushed", { metalness: 0.85, roughness: 0.25 }),
      );
      moldura.position.set(0, 0.32, 0);
      moldura.rotation.x = 0.45;

      var celulas = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.02, 0.34),
        materialBase(0x184278, "solar", { metalness: 0.6, roughness: 0.15 }),
      );
      celulas.position.set(0, 0.335, 0);
      celulas.rotation.x = 0.45;

      var inversor = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.12, 0.06),
        materialBase(0x3e4850, "brushed", { metalness: 0.7 }),
      );
      inversor.position.set(0, 0.14, 0.04);
      var ledOp = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 6, 6),
        materialBase(0x22ff55, null, {
          emissive: 0x22ff55,
          emissiveIntensity: 1.0,
        }),
      );
      ledOp.position.set(0.025, 0.17, 0.075);

      g.add(suporte, moldura, celulas, inversor, ledOp);
    } else if (id === "turbina") {
      var torre = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.07, 1.25, 12),
        materialBase(0xe4e8ec, "brushed", { metalness: 0.6, roughness: 0.3 }),
      );
      torre.position.y = 0.625;

      var porta = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.09, 0.02),
        materialBase(0x606870, "brushed"),
      );
      porta.position.set(0, 0.1, 0.07);

      var nacele = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.05, 0.22, 10),
        materialBase(0xe4e8ec, "brushed", { metalness: 0.6, roughness: 0.3 }),
      );
      nacele.rotation.x = Math.PI / 2;
      nacele.position.set(0, 1.25, 0);

      var spinner = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.09, 10),
        materialBase(0xd0d8e0, "brushed", { metalness: 0.7 }),
      );
      spinner.rotation.x = Math.PI / 2;
      spinner.position.set(0, 1.25, 0.12);

      var rotorGroup = new THREE.Group();
      rotorGroup.position.set(0, 1.25, 0.13);
      for (var pIdx = 0; pIdx < 3; pIdx++) {
        var angPa = (pIdx / 3) * Math.PI * 2;
        var paEolica = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.42, 0.015),
          materialBase(0xf4f8fa, "brushed", { metalness: 0.5, roughness: 0.3 }),
        );
        paEolica.position.set(
          Math.sin(angPa) * 0.22,
          Math.cos(angPa) * 0.22,
          0,
        );
        paEolica.rotation.z = -angPa;
        rotorGroup.add(paEolica);
      }

      var luzTopo = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 6, 6),
        materialBase(0xff2222, null, {
          emissive: 0xff1111,
          emissiveIntensity: 0.9,
        }),
      );
      luzTopo.position.set(0, 1.32, -0.04);

      g.add(torre, porta, nacele, spinner, rotorGroup, luzTopo);
      g.userData.gira = rotorGroup;
      g.userData.luzAlerta = luzTopo;
    } else if (id === "bateria") {
      var gabinete = caixaDe(0x2c3e38, 0.36, 0.38, 0.26, "brushed", 0.19);
      for (var v = 0; v < 4; v++) {
        var aleta = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.02, 0.18),
          materialBase(0x1a2622, null),
        );
        aleta.position.set(0.185, 0.12 + v * 0.05, 0);
        g.add(aleta);
      }

      var painelMedidor = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.14, 0.02),
        materialBase(0x18201d, null),
      );
      painelMedidor.position.set(0, 0.26, 0.135);
      g.add(painelMedidor);

      for (var ledB = 0; ledB < 4; ledB++) {
        var barraLed = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.018, 0.01),
          materialBase(0x00f0aa, null, {
            emissive: 0x00d490,
            emissiveIntensity: 1.0,
          }),
        );
        barraLed.position.set(0, 0.22 + ledB * 0.028, 0.146);
        g.add(barraLed);
      }

      var conector1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8),
        materialBase(0x8a9296, "brushed", { metalness: 0.8 }),
      );
      conector1.position.set(-0.09, 0.4, 0);
      var conector2 = conector1.clone();
      conector2.position.x = 0.09;

      g.add(gabinete, conector1, conector2);
    } else if (id === "poste") {
      var basePoste = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.09, 0.16, 8),
        materialBase(0x383a3d, "brushed", { metalness: 0.65, roughness: 0.4 }),
      );
      basePoste.position.y = 0.08;

      var mastroP = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.045, 1.15, 8),
        materialBase(0x383a3d, "brushed", { metalness: 0.65, roughness: 0.4 }),
      );
      mastroP.position.y = 0.65;

      var bracoLuz = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.018, 6, 12, Math.PI / 1.5),
        materialBase(0x383a3d, "brushed", { metalness: 0.7 }),
      );
      bracoLuz.position.set(0.08, 1.22, 0);
      bracoLuz.rotation.z = -Math.PI / 3;

      var lanternaVidro = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.06, 0.15, 6),
        materialBase(0xfff4d0, null, {
          transparent: true,
          opacity: 0.6,
          roughness: 0.2,
        }),
      );
      lanternaVidro.position.set(0.16, 1.18, 0);

      var cupula = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.06, 6),
        materialBase(0x282a2d, "brushed", { metalness: 0.7 }),
      );
      cupula.position.set(0.16, 1.27, 0);

      var lampada = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 8),
        materialBase(0xfff6c0, null, {
          emissive: 0xffdd77,
          emissiveIntensity: 0.2,
        }),
      );
      lampada.position.set(0.16, 1.17, 0);

      var luzPonto = new THREE.PointLight(0xffdf80, 0, 9.5, 2.0);
      luzPonto.position.set(0.16, 1.17, 0);

      g.add(
        basePoste,
        mastroP,
        bracoLuz,
        lanternaVidro,
        cupula,
        lampada,
        luzPonto,
      );
      g.userData.lampada = lampada;
      g.userData.luzPonto = luzPonto;
      g.userData.eLuzPoste = true;
    } else if (id === "caixa") {
      var basePalete = caixaDe(0x7a5a3a, 0.44, 0.08, 0.44, "bark", 0.04);

      var cisterna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.23, 0.42, 14),
        materialBase(0x4a8296, "brushed", { metalness: 0.4, roughness: 0.35 }),
      );
      cisterna.position.y = 0.28;

      var cinta1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.245, 0.012, 6, 16),
        materialBase(0x333333, "brushed", { metalness: 0.8 }),
      );
      cinta1.rotation.x = Math.PI / 2;
      cinta1.position.y = 0.22;
      var cinta2 = cinta1.clone();
      cinta2.position.y = 0.34;

      var tampaC = new THREE.Mesh(
        new THREE.ConeGeometry(0.27, 0.1, 14),
        materialBase(0x38687a, "brushed", { metalness: 0.5 }),
      );
      tampaC.position.y = 0.52;

      var tuboNivel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6),
        materialBase(0x8ce0ff, null, { transparent: true, opacity: 0.65 }),
      );
      tuboNivel.position.set(0.25, 0.28, 0);

      var torneira = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.08),
        materialBase(0xd4a742, "brushed", { metalness: 0.8 }),
      );
      torneira.position.set(0, 0.14, 0.26);

      g.add(basePalete, cisterna, cinta1, cinta2, tampaC, tuboNivel, torneira);
    } else if (id === "gotejamento") {
      g.add(construirGotejamento());
    } else if (id === "trator") {
      g.add(construirVeiculo(0x8a3a2a, false));
    } else if (id === "tratorEletrico") {
      g.add(construirVeiculo(0x2da882, true));
    } else if (id === "drone") {
      g.add(construirDrone());
    } else if (id === "colheitadeira") {
      g.add(construirColheitadeira());
    } else if (id === "enxada") {
      g.add(construirEnxada());
    } else if (id === "regador") {
      g.add(construirRegador());
    } else if (id === "machado") {
      g.add(construirMachado());
    } else if (eq) {
      g.add(construirVeiculo(0x6a7a6a, true));
    }

    g.children.slice().forEach(function (filho) {
      if (!filho || !filho.userData) return;
      for (var chave in filho.userData) {
        if (filho.userData[chave] !== undefined)
          g.userData[chave] = filho.userData[chave];
      }
    });

    g.traverse(function (c) {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });
    return g;
  }

  function atualizarCena() {
    estado.blocos.forEach(function (b, i) {
      var malha = malhasBloco[i];
      var baseMesh = malha.userData.baseMesh || malha;
      baseMesh.material.color.setHex(corDoSolo(b));
      malha.position.y = b.bloqueado ? -0.08 : 0;
      baseMesh.material.roughness = b.bloqueado ? 0.98 : 0.88;
      
      // ATUALIZA SULCOS DE SOLO ARADO
      // Remove sulcos antigos (exceto o baseMesh e manchas de poluição)
      var filhosParaRemover = [];
      malha.children.forEach(function(c) {
        if (c !== baseMesh && c.geometry) {
          // Remove se for BoxGeometry (sulco) ou não for CylinderGeometry (mancha)
          if (c.geometry.type === 'BoxGeometry' || 
              (c.geometry.type !== 'CylinderGeometry' && c.geometry.type !== 'PlaneGeometry')) {
            filhosParaRemover.push(c);
          }
        }
      });
      
      filhosParaRemover.forEach(function(c) {
        malha.remove(c);
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
      
      // Adiciona novos sulcos se o solo foi arado
      if (!b.bloqueado && b.arado && !b.cultivo) {
        for (var s = -1; s <= 1; s++) {
          var sulco = new THREE.Mesh(
            new THREE.BoxGeometry(TILE * 0.92, 0.04, 0.16),
            materialBase(0x5d4a35, "soil", { roughness: 0.95 }),
          );
          sulco.position.set(0, 0.165, s * 0.3);
          sulco.receiveShadow = true;
          sulco.castShadow = true;
          malha.add(sulco);
        }
      }
    });

    grupoEstruturas.clear();
    modoConstrucao.construcoes.forEach(function (item) {
      grupoEstruturas.add(item);
    });
    if (modoConstrucao.preview) grupoEstruturas.add(modoConstrucao.preview);

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
    noturnas.forEach(function (n) {
      n.userData.turno = true;
    });
    houveEstruturaNoturna = noturnas.length > 0;

    reconstruirGradeConstrucao();

    atualizarPlaquinhas();

    return noturnas;
  }

  function criarIconeSVG(id) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "22");
    svg.setAttribute("height", "22");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.style.flexShrink = "0";

    var path = "";

    if (id === "plantar") {
      path =
        '<path d="M12 22v-8m0 0c-2-1-4-3-4-6 0-2.5 1.8-4 4-4s4 1.5 4 4c0 3-2 5-4 6z"/>' +
        '<circle cx="12" cy="3" r="1" fill="currentColor"/>' +
        '<path d="M8 14c-1 1-2 2-2 4h12c0-2-1-3-2-4"/>';
    } else if (id === "regar") {
      path =
        '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>' +
        '<path d="M12 18v-4m-2 2h4"/>';
    } else if (id === "adubar") {
      path =
        '<path d="M8 2v4m8-4v4M6 6h12l1.5 14a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1L6 6z"/>' +
        '<circle cx="10" cy="13" r="1" fill="currentColor"/>' +
        '<circle cx="14" cy="15" r="1" fill="currentColor"/>' +
        '<circle cx="12" cy="17" r="1" fill="currentColor"/>';
    } else if (id === "colher") {
      path =
        '<path d="M4 19c0-4 4-7 7-7 4 0 9 2 9 7"/>' +
        '<path d="M11 12V4m0 0L8 7m3-3l3 3"/>' +
        '<circle cx="8" cy="19" r="1" fill="currentColor"/>' +
        '<circle cx="12" cy="19" r="1" fill="currentColor"/>' +
        '<circle cx="16" cy="19" r="1" fill="currentColor"/>';
    } else if (id === "despoluir") {
      path =
        '<path d="M12 3v15m0 0l-3 3h6l-3-3z"/>' +
        '<path d="M9 18v-5h6v5M7 3l1 1m8-1l-1 1M3 7l1-1m16 1l-1-1"/>';
    } else if (id === "enxada") {
      path =
        '<path d="M14 4h3a2 2 0 0 1 2 2v3l-6 6m0 0l-8 8m8-8l-3-3"/>' +
        '<rect x="16" y="2" width="5" height="5" rx="1" transform="rotate(45 18.5 4.5)" stroke-width="1.5"/>';
    } else if (id === "regador") {
      path =
        '<ellipse cx="11" cy="11" rx="4" ry="2.5"/>' +
        '<path d="M11 8.5V3m0 0L9 5m2-2l2 2M7 13.5l-2 8h12l-2-8"/>' +
        '<path d="M9 19l.5 2m2.5-2l.5 2m2.5-2l.5 2" stroke-width="1"/>';
    } else if (id === "machado") {
      path =
        '<path d="M7 22V2m0 0h6a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H7m0-10v10"/>' +
        '<path d="M13 6h4m-4 2h3" stroke-width="1.5"/>';
    } else if (id === "construcao") {
      path =
        '<path d="M14.5 2l-4 4m0 0L6 10.5 13.5 18 18 13.5 13.5 9l-3-3z"/>' +
        '<path d="M10 14l-6 6m12-12l6-6"/>' +
        '<rect x="2" y="18" width="4" height="4" rx="1"/>' +
        '<circle cx="19" cy="5" r="2" fill="currentColor"/>';
    } else if (id === "arvore") {
      path =
        '<path d="M12 3v18M8 5c0 4 4 6 4 6s4-2 4-6c0-3-1.8-5-4-5s-4 2-4 5z"/>' +
        '<circle cx="8" cy="7" r="1.5" fill="currentColor"/>' +
        '<circle cx="16" cy="7" r="1.5" fill="currentColor"/>' +
        '<circle cx="12" cy="4" r="1.5" fill="currentColor"/>';
    } else if (id === "dinheiro") {
      path =
        '<circle cx="12" cy="12" r="9"/>' +
        '<path d="M14.5 9a2.5 2.5 0 0 0-5 0v.5m0 5v.5a2.5 2.5 0 0 0 5 0M12 7v10"/>';
    } else if (id === "energia") {
      path =
        '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" stroke="none"/>';
    } else if (id === "agua") {
      path = '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>';
    } else if (id === "nivel") {
      path =
        '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" stroke="none"/>';
    } else if (id === "xp") {
      path =
        '<circle cx="12" cy="12" r="10"/>' +
        '<circle cx="12" cy="12" r="6"/>' +
        '<circle cx="12" cy="12" r="2" fill="currentColor"/>' +
        '<path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>';
    } else if (id === "pegada") {
      path =
        '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>' +
        '<path d="M9.5 9.5c1 .5 1.5 2 1.5 2s1-.5 2-1.5"/>' +
        '<path d="M10 14c.5 1 1.5 2 2 2s1.5-1 2-2"/>';
    } else if (id === "sol") {
      path =
        '<circle cx="12" cy="12" r="4" fill="currentColor"/>' +
        '<path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
    } else if (id === "lua") {
      path =
        '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/>';
    } else if (id === "nuvem") {
      path = '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>';
    } else if (id === "chuva") {
      path =
        '<path d="M16 13v8m-4-6v6m-4-3v5M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>';
    } else if (id === "neve") {
      path =
        '<path d="M12 2v20M2 12h20M5.64 5.64l12.72 12.72M18.36 5.64L5.64 18.36"/>' +
        '<circle cx="12" cy="2" r="1" fill="currentColor"/>' +
        '<circle cx="12" cy="22" r="1" fill="currentColor"/>' +
        '<circle cx="2" cy="12" r="1" fill="currentColor"/>' +
        '<circle cx="22" cy="12" r="1" fill="currentColor"/>';
    } else if (id === "vento") {
      path =
        '<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>';
    } else if (id === "amanhecer") {
      path =
        '<path d="M17 18a5 5 0 0 0-10 0"/>' +
        '<path d="M12 9V2m0 0L9 5m3-3l3 3"/>' +
        '<path d="M4.22 10.22l1.42 1.42m12.72 0l1.42-1.42M2 18h2m16 0h2"/>';
    } else if (id === "entardecer") {
      path =
        '<path d="M17 18a5 5 0 0 0-10 0"/>' +
        '<path d="M12 9v9m-5.66-4.34l1.42 1.42m8.48 0l1.42-1.42M3.34 18h1.42m14.48 0h1.42"/>' +
        '<circle cx="12" cy="9" r="2" fill="currentColor"/>';
    }

    svg.innerHTML = path;
    return svg;
  }

  function inicializarIconesInfo() {}

  function selecionarFerramenta(id) {
    if (!estado || !id) return false;

    if (id === "construcao") {
      if (!modoConstrucao.ativo) ativarModoConstrucao();
      else desativarModoConstrucao();
      return true;
    }

    if (modoConstrucao.ativo) desativarModoConstrucao();

    estado.ferramenta = id;
    marcarFerramenta();
    atualizarFerramentaMao();
    return true;
  }

  function montarFerramentas() {
    var caixa = ui("ferramentas");
    caixa.textContent = "";

    FERRAMENTAS.forEach(function (f, indice) {
      var b = document.createElement("button");
      b.type = "button";
      b.dataset.ferramenta = f.id;
      b.setAttribute("title", f.nome + " (" + (indice + 1) + ")");

      var icone = criarIconeSVG(f.id);
      icone.style.color = f.cor;
      b.appendChild(icone);

      b.addEventListener("click", function () {
        selecionarFerramenta(f.id);
      });
      caixa.appendChild(b);
    });
    marcarFerramenta();
  }

  function marcarFerramenta() {
    var ativa = modoConstrucao.ativo ? "construcao" : estado.ferramenta;
    document.querySelectorAll("[data-ferramenta]").forEach(function (b) {
      b.classList.toggle("ativo", b.dataset.ferramenta === ativa);
    });
  }

  function montarSementes() {
    var sel = ui("semente");
    if (!sel) return;
    sel.textContent = "";
    Object.keys(D.CULTURAS).forEach(function (id) {
      var c = D.CULTURAS[id];
      var o = document.createElement("option");
      o.value = id;
      o.textContent = c.nome + " (" + (estado.graos[id] || 0) + ")";
      if (id === estado.semente) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      estado.semente = sel.value;
    });
  }

  function usarFerramenta(b) {
    var nome = estado.ferramenta;
    var r;
    if (nome === "plantar") {
      r = C.acoes.plantar(estado, b);
      if (r.ok) animarGolpeFerramenta("plantar");
    } else if (nome === "regar") {
      r = C.acoes.regar(estado, b);
      if (r.ok) animarGolpeFerramenta("regar");
    } else if (nome === "adubar") {
      r = C.acoes.adubar(estado, b);
      if (r.ok) animarGolpeFerramenta("adubar");
    } else if (nome === "colher") {
      r = C.acoes.colher(estado, b);
      if (r.ok) animarGolpeFerramenta("colher");
    } else if (nome === "despoluir") {
      r = C.acoes.despoluir(estado, b);
      if (r.ok) animarGolpeFerramenta("despoluir");
    } else {
      r = C.usarEquipamento(estado, nome, b);
      if (r.ok && nome === "machado") animarGolpeFerramenta("machado");
      else if (r.ok) animarGolpeFerramenta(nome);
    }
    aviso(r.msg, !r.ok);
    if (r.ok) {
      C.salvar(estado);
      atualizarCena();
    }
    atualizarUI();
    return r;
  }

  function pintarUI() {
    var pegada = C.indiceDePegada(estado);
    var clima = D.CLIMAS[estado.clima];

    var idIconeClima = "sol";
    if (clima.nome.toLowerCase().includes("chuv")) idIconeClima = "chuva";
    else if (
      clima.nome.toLowerCase().includes("neve") ||
      clima.nome.toLowerCase().includes("frio")
    )
      idIconeClima = "neve";
    else if (clima.nome.toLowerCase().includes("nublado"))
      idIconeClima = "nuvem";
    else if (clima.nome.toLowerCase().includes("vento")) idIconeClima = "vento";

    var hora = estado.tempo % 24;
    var idIconeTempo = "sol";

    if (hora >= 0 && hora < 3) {
      idIconeTempo = "lua";
    } else if (hora >= 3 && hora < 6) {
      idIconeTempo = "lua";
    } else if (hora >= 6 && hora < 8) {
      idIconeTempo = "amanhecer";
    } else if (hora >= 8 && hora < 12) {
      idIconeTempo = "sol";
    } else if (hora >= 12 && hora < 17) {
      idIconeTempo = "sol";
    } else if (hora >= 17 && hora < 19) {
      idIconeTempo = "entardecer";
    } else if (hora >= 19 && hora < 21) {
      idIconeTempo = "lua";
    } else {
      idIconeTempo = "lua";
    }

    var iconeClimaEl = ui("icone-clima");
    if (iconeClimaEl) {
      // Atualiza o ícone do clima dinamicamente
      iconeClimaEl.textContent = "";
      var svgClima = criarIconeSVG(idIconeClima);
      iconeClimaEl.appendChild(svgClima);
    }

    var iconeTempoEl = ui("icone-tempo");
    if (iconeTempoEl) {
      // Atualiza o ícone do tempo dinamicamente
      iconeTempoEl.textContent = "";
      var svgTempo = criarIconeSVG(idIconeTempo);
      iconeTempoEl.appendChild(svgTempo);
    }

    if (!pintarUI.valoresAnteriores) {
      pintarUI.valoresAnteriores = {};
    }

    var valores = {
      dinheiro: "$" + Math.round(estado.dinheiro),
      energia: Math.floor(estado.energia) + "/" + Math.round(estado.energiaMax),
      agua: Math.floor(estado.agua) + "/" + Math.round(estado.aguaMax),
      nivel: String(estado.nivel),
      xp: estado.xp + "/" + D.XP_POR_NIVEL(estado.nivel),
      pegada: pegada + "/100",
      tempo: "Dia " + estado.dias,
      clima: "",
    };

    Object.keys(valores).forEach(function (k) {
      var alvo = ui(k);
      if (alvo) {
        var novoValor = valores[k];
        var valorAnterior = pintarUI.valoresAnteriores[k];

        alvo.textContent = novoValor;

        if (valorAnterior !== undefined && valorAnterior !== novoValor) {
          var item = alvo.closest("li");
          if (item) {
            item.classList.add("destaque");
            setTimeout(function () {
              item.classList.remove("destaque");
            }, 1500);
          }
        }

        pintarUI.valoresAnteriores[k] = novoValor;
      }
    });

    var p = ui("pegada");
    if (p) {
      p.classList.remove("bom", "meio", "ruim");
      p.classList.add(pegada >= 66 ? "bom" : pegada >= 33 ? "meio" : "ruim");
    }
  }

  function pintarInspetor() {
    var caixa = ui("inspetor");
    if (!caixa) return;
    if (!selecionado) {
      caixa.classList.add("sem-selecao");
      ui("insp-titulo").textContent = "Terreno";
      ui("insp-coords").textContent = "clique num bloco para ver";
      ui("insp-selo").textContent = "-";
      ui("insp-cultivo").textContent = "-";
      return;
    }
    caixa.classList.remove("sem-selecao");
    var b = selecionado;
    ui("insp-titulo").textContent = b.bloqueado
      ? "Terreno travado"
      : b.nativo
        ? "Mata nativa"
        : "Bloco de terra";
    ui("insp-coords").textContent =
      "coluna " + (b.x + 1) + ", linha " + (b.z + 1);
    ui("insp-selo").textContent = b.bloqueado
      ? "Compre este lote na aba Terreno"
      : b.cultivo
        ? b.cultivo.pronto
          ? "Pronto para colher"
          : "Crescendo"
        : "Livre";
    var dados = [
      ["umidade", b.umidade],
      ["fert", b.fertilidade],
      ["pol", b.poluicao],
    ];
    dados.forEach(function (par) {
      var pct = Math.round(par[1] * 100);
      var txt = ui("insp-" + par[0]);
      var bar = ui("bar-" + par[0]);
      if (txt) txt.textContent = pct + "%";
      if (bar) bar.style.width = pct + "%";
    });
    if (b.cultivo) {
      var c = D.CULTURAS[b.cultivo.id];
      ui("insp-cultivo").textContent =
        c.nome + " - " + Math.round((b.cultivo.progresso / c.dias) * 100) + "%";
    } else {
      ui("insp-cultivo").textContent = b.bloqueado
        ? "Sem acesso"
        : "Nenhum cultivo";
    }
  }

  function cartao(
    nome,
    descricao,
    preco,
    nivel,
    podeComprar,
    rotulo,
    aoClicar,
  ) {
    var d = document.createElement("div");
    d.className = "cartao";
    var txt = document.createElement("div");
    txt.className = "txt";
    var h = document.createElement("h4");
    h.textContent = nome;
    var p = document.createElement("p");
    p.textContent = descricao;
    var s = document.createElement("span");
    s.className = "preco";
    s.textContent = preco;
    var n = document.createElement("span");
    n.className = "nivel";
    n.textContent = nivel;
    txt.append(h, p, s, n);
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = rotulo;
    b.disabled = !podeComprar;
    b.addEventListener("click", aoClicar);
    d.append(txt, b);
    return d;
  }

  function pintarLoja() {
    var caixa = ui("loja-conteudo");
    if (!caixa) return;
    caixa.textContent = "";

    document.querySelectorAll("[data-aba]").forEach(function (b) {
      b.style.display = "none";
    });

    var lista = document.createElement("div");
    lista.className = "lista";

    Object.keys(D.CULTURAS).forEach(function (id) {
      var c = D.CULTURAS[id];
      var temDinheiro = estado.dinheiro >= c.semente;

      var textoBotao = temDinheiro ? "Comprar 1" : "Sem dinheiro";

      lista.appendChild(
        cartao(
          c.nome,
          c.dias + " dias - vende por $" + c.vende + " - " + c.xp + " XP",
          "$" + c.semente + " por semente",
          "",
          temDinheiro,
          textoBotao,
          function () {
            var r = C.comprarSemente(estado, id, 1);
            aviso(r.msg, !r.ok);
            if (r.ok) C.salvar(estado);
            montarSementes();
            pintarLoja();
            atualizarUI();
          },
        ),
      );
    });

    caixa.textContent = "";
    caixa.appendChild(lista);

    // Separador visual antes do botão de renovar
    var separador = document.createElement("div");
    separador.style.cssText =
      "margin: 24px 0 16px; " +
      "height: 1px; " +
      "background: var(--pale); " +
      "opacity: 0.5;";
    caixa.appendChild(separador);

    // Cartão de aviso antes do botão
    var avisoRenovar = document.createElement("div");
    avisoRenovar.style.cssText =
      "padding: 14px 16px; " +
      "background: linear-gradient(135deg, rgba(164, 64, 47, 0.08), rgba(164, 64, 47, 0.04)); " +
      "border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent); " +
      "border-radius: 12px; " +
      "margin-bottom: 12px; " +
      "font-size: 0.82rem; " +
      "color: var(--muted); " +
      "line-height: 1.5;";
    avisoRenovar.innerHTML =
      '<strong style="color: var(--danger); display: block; margin-bottom: 4px; font-size: 0.88rem;">⚠️ Zona de Perigo</strong>' +
      "Renovar a fazenda RESETA TUDO: dinheiro, XP, terreno, construções e plantações. Você volta ao estado inicial!";
    caixa.appendChild(avisoRenovar);

    // Botão de renovar estilizado
    var botaoRenovar = document.createElement("button");
    botaoRenovar.className = "botao-renovar-fazenda";
    botaoRenovar.type = "button";
    botaoRenovar.innerHTML = '<span style="margin-right: 8px;"></span>Renovar Fazenda';
    botaoRenovar.style.cssText =
      "width: 100%; " +
      "padding: 14px 20px; " +
      "background: linear-gradient(135deg, var(--danger), color-mix(in srgb, var(--danger) 85%, black)); " +
      "border: 1px solid var(--danger); " +
      "border-radius: 999px; " +
      "color: var(--pale); " +
      "font-family: inherit; " +
      "font-size: 0.92rem; " +
      "font-weight: 600; " +
      "cursor: pointer; " +
      "transition: transform 160ms ease, box-shadow 200ms ease, opacity 160ms ease; " +
      "box-shadow: 0 4px 12px rgba(164, 64, 47, 0.25);";

    botaoRenovar.onmouseover = function () {
      this.style.transform = "translateY(-2px)";
      this.style.boxShadow = "0 8px 20px rgba(164, 64, 47, 0.35)";
    };

    botaoRenovar.onmouseout = function () {
      this.style.transform = "translateY(0)";
      this.style.boxShadow = "0 4px 12px rgba(164, 64, 47, 0.25)";
    };

    botaoRenovar.onmousedown = function () {
      this.style.transform = "translateY(0) scale(0.98)";
    };

    botaoRenovar.onmouseup = function () {
      this.style.transform = "translateY(-2px) scale(1)";
    };

    botaoRenovar.onclick = function () {
      var confirmacao = confirm(
        "🚨 ATENÇÃO! AÇÃO IRREVERSÍVEL! 🚨\n\n" +
          "Renovar a fazenda irá RESETAR COMPLETAMENTE:\n\n" +
          "❌ Todo o seu dinheiro\n" +
          "❌ Todo o seu XP e nível\n" +
          "❌ Todas as plantações\n" +
          "❌ Todas as construções\n" +
          "❌ Todo o terreno\n" +
          "❌ Todos os itens comprados\n\n" +
          "⚠️ Você voltará ao INÍCIO DO JOGO como se nunca tivesse jogado!\n\n" +
          "TEM CERTEZA ABSOLUTA que deseja APAGAR TUDO?"
      );

      if (confirmacao) {
        var segundaConfirmacao = confirm(
          "⚠️ ÚLTIMA CHANCE!\n\n" +
            "Você está prestes a perder TODO o seu progresso.\n" +
            "Esta ação NÃO PODE SER DESFEITA.\n\n" +
            "Confirma que deseja RESETAR TUDO mesmo?"
        );
        
        if (segundaConfirmacao) {
          // Apaga TUDO e recarrega IMEDIATAMENTE
          C.apagar();
          aviso("Resetando tudo...", false);
          location.reload();
        }
      }
    };

    caixa.appendChild(botaoRenovar);
  }

  var ICONES_INVENTARIO = {
    enxada: "🪓",
    regador: "💧",
    trator: "🚜",
    tratorEletrico: "⚡",
    drone: "🚁",
    colheitadeira: "🌾",
    gotejamento: "💧",
    composteira: "♻️",
    arvore: "🌳",
    painel: "☀️",
    turbina: "💨",
    bateria: "🔋",
    poste: "💡",
    caixa: "🚰",
  };

  function pintarInventarioJogador() {
    var caixa = ui("inventario-jogador");
    if (!caixa || !estado) return;
    caixa.textContent = "";

    var grupos = [
      { fonte: D.EQUIPAMENTOS, ignorar: [] },
      { fonte: D.ENERGIA, ignorar: [] },
    ];
    var linhas = 0;

    grupos.forEach(function (grupo) {
      Object.keys(grupo.fonte).forEach(function (id) {
        var total = estado.itens[id] || 0;
        if (!total) return;
        var noMapa = C.contarConstrucoes(estado, id);
        var linha = document.createElement("div");
        linha.className = "linha-inventario";
        if (noMapa) linha.classList.add("construido");

        var icone = document.createElement("span");
        icone.className = "icone";
        icone.textContent = ICONES_INVENTARIO[id] || "•";

        var nome = document.createElement("span");
        nome.className = "nome";
        var sufixo = noMapa
          ? C.itemDirigivel(id)
            ? " (no terreno · dirija)"
            : " (no terreno)"
          : "";
        nome.textContent = grupo.fonte[id].nome + sufixo;
        nome.title = grupo.fonte[id].desc || grupo.fonte[id].nome;

        var qtd = document.createElement("span");
        qtd.className = "qtd";
        qtd.textContent = "x" + total;

        linha.appendChild(icone);
        linha.appendChild(nome);
        linha.appendChild(qtd);
        caixa.appendChild(linha);
        linhas++;
      });
    });

    if (!linhas) {
      var vazio = document.createElement("p");
      vazio.className = "vazio-inventario";
      vazio.textContent = "Nada comprado ainda. Passe na loja.";
      caixa.appendChild(vazio);
    }
  }

  function atualizarUI() {
    pintarUI();
    montarSementes();
    pintarInventarioJogador();
    pintarInspetor();
    if (modoConstrucao.ativo) atualizarInventarioConstrucao();
    if (!ui("loja").hidden) pintarLoja();
  }

  var CORES_CEU = {
    madrugada: 0x2a3a52,
    amanhecer: 0xd9a878,
    dia: 0xdfe9e4,
    entardecer: 0xd98f5e,
    noite: 0x16203a,
  };

  function _lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }
  function _smoothstep(a, b, t) {
    t = Math.max(0, Math.min(1, t));
    t = t * t * (3 - 2 * t);
    return a + (b - a) * t;
  }

  var _corTemp = new THREE.Color();

  function aplicarLuz() {
    var h = estado.relogio;
    var noite = C.ehNoite(estado);
    var clima = D.CLIMAS[estado.clima];

    var tAmanhec = _smoothstep(0, 1, (h - 0.18) / 0.12);
    var tManha = _smoothstep(0, 1, (h - 0.3) / 0.1);
    var tEntard = _smoothstep(0, 1, (h - 0.68) / 0.1);
    var tNoite = _smoothstep(0, 1, (h - 0.82) / 0.08);

    var ceuR, ceuG, ceuB;
    if (h < 0.18) {
      ceuR = 0x2a / 255;
      ceuG = 0x3a / 255;
      ceuB = 0x52 / 255;
    } else if (h < 0.3) {
      ceuR = _lerp(0x2a, 0xf5, tAmanhec) / 255;
      ceuG = _lerp(0x3a, 0xb0, tAmanhec) / 255;
      ceuB = _lerp(0x52, 0x70, tAmanhec) / 255;
    } else if (h < 0.68) {
      ceuR = _lerp(0xf5, 0xdf, tManha) / 255;
      ceuG = _lerp(0xb0, 0xee, tManha) / 255;
      ceuB = _lerp(0x70, 0xff, tManha) / 255;
    } else if (h < 0.82) {
      ceuR = _lerp(0xdf, 0xe8, tEntard) / 255;
      ceuG = _lerp(0xee, 0x62, tEntard) / 255;
      ceuB = _lerp(0xff, 0x38, tEntard) / 255;
    } else {
      ceuR = _lerp(0xe8, 0x16, tNoite) / 255;
      ceuG = _lerp(0x62, 0x20, tNoite) / 255;
      ceuB = _lerp(0x38, 0x3a, tNoite) / 255;
    }

    var nublado = clima.solar < 0.7 ? (1 - clima.solar) * 0.6 : 0;
    ceuR = _lerp(ceuR, 0.55, nublado);
    ceuG = _lerp(ceuG, 0.55, nublado);
    ceuB = _lerp(ceuB, 0.58, nublado);

    _corTemp.setRGB(ceuR, ceuG, ceuB);
    if (cena.background && cena.background.setRGB)
      cena.background.setRGB(ceuR, ceuG, ceuB);
    if (cena.fog) {
      cena.fog.color.copy(_corTemp);
      var neblina = noite ? 0.6 : 1.0;
      if (clima.chuva > 0) neblina *= 0.5 + clima.chuva * 0.5;
      cena.fog.near = 14 * neblina;
      cena.fog.far = 55 * neblina;
    }

    var angSol = h * Math.PI * 2;
    var alturaSol = Math.sin(angSol - Math.PI * 0.5);
    luzes.sol.position.set(
      Math.cos(angSol) * 18,
      Math.max(2, alturaSol * 20),
      8,
    );

    var solR, solG, solB, solInt;
    if (noite) {
      solR = 0x6a / 255;
      solG = 0x8a / 255;
      solB = 0xb8 / 255;
      solInt = 0.04;
    } else if (h < 0.3) {
      solR = _lerp(0x88, 0xff, tAmanhec) / 255;
      solG = _lerp(0x70, 0xb0, tAmanhec) / 255;
      solB = _lerp(0xaa, 0x70, tAmanhec) / 255;
      solInt = _lerp(0.05, 0.85, tAmanhec);
    } else if (h < 0.68) {
      solR = 1.0;
      solG = 0.98;
      solB = 0.9;
      solInt = _lerp(0.85, 1.25, tManha);
    } else {
      solR = _lerp(1.0, 0x6a / 255, tEntard);
      solG = _lerp(0.65, 0x8a / 255, tEntard);
      solB = _lerp(0.35, 0xb8 / 255, tEntard);
      solInt = _lerp(1.25, 0.05, tEntard);
    }

    solInt *= Math.max(0.3, clima.solar * 0.55 + 0.45);

    luzes.sol.color.setRGB(solR, solG, solB);
    luzes.sol.intensity = solInt;

    if (noite) {
      luzes.hemi.color.setHex(0x1e2d4a);
      luzes.hemi.groundColor.setHex(0x0a0f1c);
      luzes.hemi.intensity = 0.12;
    } else if (h < 0.3) {
      luzes.hemi.color.setHex(0xe8a060);
      luzes.hemi.groundColor.setHex(0x3a3028);
      luzes.hemi.intensity = _lerp(0.1, 0.6, tAmanhec);
    } else {
      luzes.hemi.color.setHex(0xe8f8ff);
      luzes.hemi.groundColor.setHex(0x4a5e48);
      luzes.hemi.intensity =
        _lerp(0.6, 0.45, tEntard) * Math.max(0.5, clima.solar);
    }

    luzes.luar.intensity = noite
      ? _lerp(0.06, 0.3, tNoite) * (1 - nublado * 0.8)
      : 0.0;

    if (chuva) {
      chuva.visible = clima.chuva > 0;
      if (chuva.visible) {
        var pos = chuva.geometry.attributes.position;
        var vel = 0.18 + clima.chuva * 0.12;
        for (var i = 0; i < pos.count; i++) {
          var y = pos.getY(i) - vel;
          pos.setY(i, y < 0.05 ? 9 : y);
        }
        pos.needsUpdate = true;
        chuva.material.opacity = Math.min(1, 0.5 + clima.chuva * 0.5);
      }
    }

    return noite;
  }

  function redimensionar() {
    var palco = el("#stage");
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
        if (n.geometry && n.geometry.type === "TorusGeometry") {
          n.rotation.z += dt * 3.2;
        }
      });
    }

    if (veiculo.ativo) {
      passoVeiculo(dt);
      if (!livre.ligado) ajustarCamera(az, pol, dist, dt);
    } else if (malhaFazendeiro && !modoConstrucao.ativo) {
      var mx = 0,
        mz = 0;
      var pulou = false;

      if (!livre.ligado) {
        var t = livre.teclas;

        if (movimentoAutomatico.ativo) {
          var inputManual = t.w || t.s || t.a || t.d;
          if (inputManual) {
            movimentoAutomatico.ativo = false;
            movimentoAutomatico.acaoAposChegar = null;
          } else {
            var dx = movimentoAutomatico.alvoX - malhaFazendeiro.position.x;
            var dz = movimentoAutomatico.alvoZ - malhaFazendeiro.position.z;
            var distancia = Math.sqrt(dx * dx + dz * dz);

            if (distancia <= movimentoAutomatico.distanciaMinima) {
              movimentoAutomatico.ativo = false;

              if (movimentoAutomatico.acaoAposChegar) {
                movimentoAutomatico.acaoAposChegar();
                movimentoAutomatico.acaoAposChegar = null;
              }
            } else {
              mx = dx / distancia;
              mz = dz / distancia;
            }
          }
        } else if (t.w || t.s || t.a || t.d) {
          if (t.w) mz -= 1;
          if (t.s) mz += 1;
          if (t.a) mx -= 1;
          if (t.d) mx += 1;
        }

        if (fisica.noChao) {
          fisica.coyoteTime = 0.12;
        } else {
          fisica.coyoteTime = Math.max(0, fisica.coyoteTime - dt);
        }

        if (t[" "]) {
          if (movimentoAutomatico.ativo) {
            movimentoAutomatico.ativo = false;
            movimentoAutomatico.acaoAposChegar = null;
          }
          fisica.jumpBuffer = 0.15;
        } else {
          fisica.jumpBuffer = Math.max(0, fisica.jumpBuffer - dt);
        }

        if (fisica.jumpBuffer > 0 && fisica.coyoteTime > 0) {
          pulou = true;
          fisica.velocidadeY = fisica.forcaPulo;
          fisica.noChao = false;
          fisica.coyoteTime = 0;
          fisica.jumpBuffer = 0;
        }
      }

      if (mx !== 0 || mz !== 0) {
        selecionado = null;
        malhaSelecao.visible = false;
      }

      if (mx !== 0 || mz !== 0) {
        var norma = Math.sqrt(mx * mx + mz * mz);
        mx /= norma;
        mz /= norma;

        var dirX, dirZ;

        if (movimentoAutomatico.ativo) {
          dirX = mx;
          dirZ = mz;
        } else {
          var s = Math.sin(az);
          var c = Math.cos(az);
          dirX = mx * c + mz * s;
          dirZ = -mx * s + mz * c;
        }

        fisica.velocidade.x += dirX * fisica.aceleracao * dt;
        fisica.velocidade.z += dirZ * fisica.aceleracao * dt;

        var velHorizontal = Math.sqrt(
          fisica.velocidade.x * fisica.velocidade.x +
            fisica.velocidade.z * fisica.velocidade.z,
        );
        if (velHorizontal > fisica.velocidadeMaxima) {
          fisica.velocidade.x *= fisica.velocidadeMaxima / velHorizontal;
          fisica.velocidade.z *= fisica.velocidadeMaxima / velHorizontal;
        }

        andando = true;

        var velAnimacao = correndo ? 10 : 8;
        tempoAndar += dt * velAnimacao;

        malhaFazendeiro.rotation.y = Math.atan2(
          fisica.velocidade.x,
          fisica.velocidade.z,
        );
      } else {
        andando = false;
        var fatorFriccao = Math.max(0, 1 - fisica.friccao * dt);
        fisica.velocidade.x *= fatorFriccao;
        fisica.velocidade.z *= fatorFriccao;
      }

      fisica.velocidadeY += fisica.gravidade * dt;

      if (!fisica.noChao && fisica.velocidadeY < 0) {
        fisica.velocidadeQueda = Math.abs(fisica.velocidadeY);
      }

      var novaPosX = malhaFazendeiro.position.x + fisica.velocidade.x * dt;
      var novaPosY = malhaFazendeiro.position.y + fisica.velocidadeY * dt;
      var novaPosZ = malhaFazendeiro.position.z + fisica.velocidade.z * dt;

      var colidiu = false;
      for (var i = 0; i < obstaculos.length; i++) {
        var obs = obstaculos[i];
        var dx = novaPosX - obs.pos.x;
        var dz = novaPosZ - obs.pos.z;
        var distancia = Math.sqrt(dx * dx + dz * dz);
        var somaRaios = fisica.raio + obs.raio;

        if (distancia < somaRaios && novaPosY < obs.altura) {
          var angulo = Math.atan2(dz, dx);
          novaPosX = obs.pos.x + Math.cos(angulo) * somaRaios;
          novaPosZ = obs.pos.z + Math.sin(angulo) * somaRaios;
          fisica.velocidade.x *= 0.5;
          fisica.velocidade.z *= 0.5;
          colidiu = true;
        }
      }

      var blocoAlvo = blocoSobXZ(novaPosX, novaPosZ);
      if (blocoAlvo && blocoAlvo.bloqueado) {
        var posAtualX = malhaFazendeiro.position.x;
        var posAtualZ = malhaFazendeiro.position.z;
        var blocoEixoX = blocoSobXZ(novaPosX, posAtualZ);
        if (!blocoEixoX || !blocoEixoX.bloqueado) {
          novaPosZ = posAtualZ;
        } else {
          var blocoEixoZ = blocoSobXZ(posAtualX, novaPosZ);
          if (!blocoEixoZ || !blocoEixoZ.bloqueado) {
            novaPosX = posAtualX;
          } else {
            novaPosX = posAtualX;
            novaPosZ = posAtualZ;
          }
        }
        fisica.velocidade.x *= 0.4;
        fisica.velocidade.z *= 0.4;
      }

      var limite = meio - TILE * 0.4;
      novaPosX = Math.max(-limite, Math.min(limite, novaPosX));
      novaPosZ = Math.max(-limite, Math.min(limite, novaPosZ));

      var aterrissou = false;
      if (novaPosY <= ALTURA_CHAO) {
        if (!fisica.noChao && fisica.velocidadeQueda > 3) {
          aterrissou = true;
          tempoAterrisagem = 0.25;
        }
        novaPosY = ALTURA_CHAO;
        fisica.velocidadeY = 0;
        fisica.velocidadeQueda = 0;
        fisica.noChao = true;
      } else {
        fisica.noChao = false;
      }

      malhaFazendeiro.position.x = novaPosX;
      malhaFazendeiro.position.y = novaPosY;
      malhaFazendeiro.position.z = novaPosZ;

      if (
        fazPartes.pernaEsq &&
        fazPartes.pernaDir &&
        fazPartes.bracoEsq &&
        fazPartes.bracoDir
      ) {
        if (tempoAterrisagem > 0) {
          tempoAterrisagem = Math.max(0, tempoAterrisagem - dt);
        }

        if (animacaoAcao.ativa) {
          animacaoAcao.tempo += dt;
          var progresso = Math.min(
            1,
            animacaoAcao.tempo / animacaoAcao.duracao,
          );
          var easeOut = 1 - Math.pow(1 - progresso, 3);

          if (animacaoAcao.tipo === "colher") {
            if (progresso < 0.3) {
              var fase1 = progresso / 0.3;
              var curva1 = Math.sin((fase1 * Math.PI) / 2);

              fazPartes.corpo.rotation.x = curva1 * 0.6;
              fazPartes.pernaEsq.rotation.x = curva1 * 0.5;
              fazPartes.pernaDir.rotation.x = curva1 * 0.5;

              fazPartes.bracoDir.rotation.x = -curva1 * 0.4;
              fazPartes.bracoEsq.rotation.x = curva1 * 0.2;

              malhaFazendeiro.scale.y = 1 - curva1 * 0.12;
              malhaFazendeiro.scale.x = 1 + curva1 * 0.06;
              malhaFazendeiro.scale.z = 1 + curva1 * 0.06;
            } else if (progresso < 0.7) {
              var fase2 = (progresso - 0.3) / 0.4;
              var curva2 = Math.sin(fase2 * Math.PI);

              fazPartes.corpo.rotation.x = 0.6;
              fazPartes.pernaEsq.rotation.x = 0.5;
              fazPartes.pernaDir.rotation.x = 0.5;

              fazPartes.bracoDir.rotation.x = -0.4 - curva2 * 0.9;
              fazPartes.bracoDir.rotation.z = curva2 * 0.3;
              fazPartes.bracoEsq.rotation.x = 0.2 + curva2 * 0.3;

              fazPartes.corpo.rotation.y = curva2 * 0.15;

              malhaFazendeiro.scale.y = 0.88;
            } else {
              var fase3 = (progresso - 0.7) / 0.3;
              var curva3 = 1 - Math.pow(1 - fase3, 2);

              fazPartes.corpo.rotation.x = 0.6 * (1 - curva3);
              fazPartes.pernaEsq.rotation.x = 0.5 * (1 - curva3);
              fazPartes.pernaDir.rotation.x = 0.5 * (1 - curva3);

              var levantaBraco = Math.sin((fase3 * Math.PI) / 2);
              fazPartes.bracoDir.rotation.x = -1.3 + levantaBraco * 0.8;
              fazPartes.bracoEsq.rotation.x = 0.5 - levantaBraco * 0.5;
              fazPartes.bracoDir.rotation.z = 0.3 * (1 - curva3);
              fazPartes.corpo.rotation.y = 0.15 * (1 - curva3);

              malhaFazendeiro.scale.y = 0.88 + curva3 * 0.12;
              malhaFazendeiro.scale.x = 1.06 - curva3 * 0.06;
              malhaFazendeiro.scale.z = 1.06 - curva3 * 0.06;
            }
          } else if (animacaoAcao.tipo === "plantar") {
            var ciclo = Math.sin(progresso * Math.PI);
            fazPartes.corpo.rotation.x = ciclo * 0.5;
            fazPartes.bracoDir.rotation.x = -ciclo * 0.8;
            fazPartes.bracoEsq.rotation.x = ciclo * 0.4;
            fazPartes.pernaEsq.rotation.x = ciclo * 0.3;
            fazPartes.pernaDir.rotation.x = ciclo * 0.3;
            malhaFazendeiro.scale.y = 1 - ciclo * 0.1;
          } else if (animacaoAcao.tipo === "regar") {
            var ciclo = Math.sin(progresso * Math.PI);
            fazPartes.corpo.rotation.x = ciclo * 0.3;
            fazPartes.bracoDir.rotation.x = -0.6 - ciclo * 0.5;
            fazPartes.bracoDir.rotation.z = ciclo * 0.4;
            fazPartes.bracoEsq.rotation.x = ciclo * 0.2;
          } else if (animacaoAcao.tipo === "machado") {
            var golpe = easeOut;
            fazPartes.corpo.rotation.x = Math.sin(golpe * Math.PI) * 0.3;
            fazPartes.bracoDir.rotation.x = -1.4 + golpe * 1.8;
            fazPartes.bracoDir.rotation.z = Math.sin(golpe * Math.PI) * 0.4;
            fazPartes.bracoEsq.rotation.x =
              -0.8 + Math.sin(golpe * Math.PI) * 0.5;
          } else {
            var cicloGenerico = Math.sin(progresso * Math.PI);
            fazPartes.bracoDir.rotation.x = -cicloGenerico * 0.9;
            fazPartes.corpo.rotation.x = cicloGenerico * 0.2;
          }

          if (progresso >= 1) {
            animacaoAcao.ativa = false;
            fazPartes.corpo.rotation.x = 0;
            fazPartes.corpo.rotation.y = 0;
            fazPartes.bracoDir.rotation.z = 0;
            malhaFazendeiro.scale.set(1, 1, 1);
          }
        } else if (!fisica.noChao) {
          fisica.tempoNoAr += dt;

          if (fisica.velocidadeY > 4) {
            var intensidadePulo = Math.min(
              1,
              fisica.velocidadeY / fisica.forcaPulo,
            );

            fazPartes.pernaEsq.rotation.x = -0.4 * intensidadePulo;
            fazPartes.pernaDir.rotation.x = -0.4 * intensidadePulo;

            fazPartes.bracoEsq.rotation.x = -1.2 * intensidadePulo;
            fazPartes.bracoDir.rotation.x = -1.2 * intensidadePulo;
            fazPartes.bracoEsq.rotation.z = -0.3 * intensidadePulo;
            fazPartes.bracoDir.rotation.z = 0.3 * intensidadePulo;

            fazPartes.corpo.rotation.x = -0.15 * intensidadePulo;

            malhaFazendeiro.scale.y = 1 + 0.12 * intensidadePulo;
            malhaFazendeiro.scale.x = 1 - 0.05 * intensidadePulo;
            malhaFazendeiro.scale.z = 1 - 0.05 * intensidadePulo;
          } else if (fisica.velocidadeY < -1) {
            var intensidadeQueda = Math.min(
              1,
              Math.abs(fisica.velocidadeY) / 10,
            );

            fazPartes.pernaEsq.rotation.x = -0.6 - intensidadeQueda * 0.3;
            fazPartes.pernaDir.rotation.x = -0.6 - intensidadeQueda * 0.3;

            var balanco = Math.sin(fisica.tempoNoAr * 8) * 0.2;
            fazPartes.bracoEsq.rotation.x = -0.9 + balanco;
            fazPartes.bracoDir.rotation.x = -0.9 - balanco;
            fazPartes.bracoEsq.rotation.z = -0.4;
            fazPartes.bracoDir.rotation.z = 0.4;

            fazPartes.corpo.rotation.x = 0.1 * intensidadeQueda;
          }
        } else if (tempoAterrisagem > 0) {
          var progressoAterr = 1 - tempoAterrisagem / 0.25;
          var cicloAterr = Math.sin(progressoAterr * Math.PI);

          var agachamento = cicloAterr * 0.4;
          fazPartes.pernaEsq.rotation.x = agachamento;
          fazPartes.pernaDir.rotation.x = agachamento;
          fazPartes.corpo.rotation.x = agachamento * 0.5;

          fazPartes.bracoEsq.rotation.x = cicloAterr * 0.4;
          fazPartes.bracoDir.rotation.x = cicloAterr * 0.4;
          fazPartes.bracoEsq.rotation.z = -cicloAterr * 0.2;
          fazPartes.bracoDir.rotation.z = cicloAterr * 0.2;

          malhaFazendeiro.scale.y = 1 - cicloAterr * 0.15;
          malhaFazendeiro.scale.x = 1 + cicloAterr * 0.08;
          malhaFazendeiro.scale.z = 1 + cicloAterr * 0.08;
        } else if (andando) {
          fisica.tempoNoAr = 0;

          malhaFazendeiro.scale.set(1, 1, 1);

          var multiplicador = correndo ? 1.3 : 1.0;

          var anguloPernaEsq = Math.sin(tempoAndar) * 0.65 * multiplicador;
          var anguloPernaDir =
            Math.sin(tempoAndar + Math.PI) * 0.65 * multiplicador;

          fazPartes.pernaEsq.rotation.x = anguloPernaEsq;
          fazPartes.pernaDir.rotation.x = anguloPernaDir;

          fazPartes.bracoEsq.rotation.x =
            Math.sin(tempoAndar + Math.PI) * 0.5 * multiplicador;
          fazPartes.bracoDir.rotation.x =
            Math.sin(tempoAndar) * 0.5 * multiplicador;

          fazPartes.bracoEsq.rotation.z = Math.sin(tempoAndar) * 0.08;
          fazPartes.bracoDir.rotation.z = -Math.sin(tempoAndar) * 0.08;

          fazPartes.corpo.rotation.y = Math.sin(tempoAndar * 2) * 0.04;
          fazPartes.corpo.rotation.z = Math.sin(tempoAndar) * 0.03;

          var bob = Math.abs(Math.sin(tempoAndar * 2)) * 0.03;
          malhaFazendeiro.position.y += bob;

          if (
            Math.abs(anguloPernaEsq) > 0.4 &&
            Math.abs(fisica.velocidade.x + fisica.velocidade.z) > 0.1
          ) {
            var passoDado = Math.floor(tempoAndar / (Math.PI / 2));
            if (passoDado !== fisica.ultimoPassoTempo) {
              fisica.ultimoPassoTempo = passoDado;
              criarPoeiraPasso(
                malhaFazendeiro.position.x,
                malhaFazendeiro.position.z,
              );
            }
          }
        } else {
          fisica.tempoNoAr = 0;

          var escalaAtual = malhaFazendeiro.scale.y;
          if (Math.abs(escalaAtual - 1) > 0.01) {
            malhaFazendeiro.scale.y += (1 - escalaAtual) * 0.15;
            malhaFazendeiro.scale.x += (1 - malhaFazendeiro.scale.x) * 0.15;
            malhaFazendeiro.scale.z += (1 - malhaFazendeiro.scale.z) * 0.15;
          } else {
            malhaFazendeiro.scale.set(1, 1, 1);
          }

          fazPartes.pernaEsq.rotation.x *= 0.82;
          fazPartes.pernaDir.rotation.x *= 0.82;
          fazPartes.bracoEsq.rotation.x *= 0.82;
          fazPartes.bracoDir.rotation.x *= 0.82;
          fazPartes.bracoEsq.rotation.z *= 0.82;
          fazPartes.bracoDir.rotation.z *= 0.82;
          fazPartes.corpo.rotation.x *= 0.82;
          fazPartes.corpo.rotation.y *= 0.82;
          fazPartes.corpo.rotation.z *= 0.82;

          var respira = Math.sin(Date.now() * 0.001) * 0.015;
          fazPartes.corpo.position.y = respira;
        }
      }

      if (!livre.ligado) ajustarCamera(az, pol, dist, dt);
    }

    if (modoConstrucao.construcoes.length) {
      modoConstrucao.construcoes.forEach(function (item) {
        animarItem(item, dt);
      });
    }

    for (var i = modoConstrucao.particulas.length - 1; i >= 0; i--) {
      var particula = modoConstrucao.particulas[i];
      particula.userData.vida -= dt * 0.5;

      if (particula.userData.vida <= 0) {
        discardarObjeto(particula);
        modoConstrucao.particulas.splice(i, 1);
      } else {
        particula.position.y += particula.userData.velocidade;
        if (particula.material.opacity) {
          particula.material.opacity = particula.userData.vida * 0.7;
        }
        particula.scale.multiplyScalar(1 + dt * 0.5);
      }
    }

    for (var j = particulasPoeira.length - 1; j >= 0; j--) {
      var part = particulasPoeira[j];
      if (!part.userData) continue;

      part.userData.vida -= dt;

      if (part.userData.vida <= 0) {
        tabuleiro.remove(part);
        if (part.geometry) part.geometry.dispose();
        if (part.material) part.material.dispose();
        particulasPoeira.splice(j, 1);
      } else {
        if (part.userData.vy !== undefined) {
          part.position.y += part.userData.vy * dt;
          var grav =
            part.userData.gravidade === undefined
              ? 9.8
              : part.userData.gravidade;
          part.userData.vy -= grav * dt;
        }
        if (part.userData.cresce)
          part.scale.multiplyScalar(1 + part.userData.cresce * dt);
        if (part.userData.vx !== undefined) {
          part.position.x += part.userData.vx * dt;
          part.userData.vx *= 0.96;
        }
        if (part.userData.vz !== undefined) {
          part.position.z += part.userData.vz * dt;
          part.userData.vz *= 0.96;
        }

        if (part.userData.rotacao !== undefined) {
          part.rotation.x += part.userData.rotacao;
          part.rotation.y += part.userData.rotacao * 0.7;
        }

        if (part.material && part.material.opacity !== undefined) {
          var progVida = part.userData.vida / (part.userData.maxVida || 1);
          part.material.opacity = Math.min(0.85, progVida * 0.85);
        }

        if (part.userData.vida < 0.2) {
          var fator = part.userData.vida / 0.2;
          part.scale.setScalar(fator);
        }
      }
    }

    var mudouDia =
      Math.floor(estado.relogio * 100) !==
      Math.floor((estado.relogio - dt / D.DIA_SEGUNDOS) * 100);
    if (mudouDia) {
      atualizarCena();
      atualizarUI();
      C.salvar(estado);
    }

    renderer.render(cena, camera);
  }

  var passoCameraLivre = function () {};

  function ligarInteracoes() {
    var palco = el("#stage");
    var mira = ui("mira");
    var arrastando = false;
    var moveu = false;
    var ultimoX = 0;
    var ultimoY = 0;

    function paintMira() {
      var marcado = document.body.classList.contains("mirando");
      if (mira) mira.hidden = !marcado;
    }

    function destravarMouse() {
      if (
        document.exitPointerLock &&
        document.pointerLockElement === renderer.domElement
      ) {
        document.exitPointerLock();
      }
    }

    function aplicarLivre() {
      var cp = Math.cos(livre.pitch);
      camera.position.copy(livre.pos);
      camera.lookAt(
        livre.pos.x - Math.sin(livre.yaw) * cp,
        livre.pos.y + Math.sin(livre.pitch),
        livre.pos.z - Math.cos(livre.yaw) * cp,
      );
    }

    function ligarLivre() {
      livre.pos.copy(camera.position);
      var dx = 0 - livre.pos.x;
      var dy = 0 - livre.pos.y;
      var dz = 0 - livre.pos.z;
      var tam = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= tam;
      dy /= tam;
      dz /= tam;
      livre.yaw = Math.atan2(-dx, -dz);
      livre.pitch = Math.asin(Math.max(-1, Math.min(1, dy)));
      livre.vel.set(0, 0, 0);
      livre.ligado = true;
      document.body.classList.add("mirando");
      paintMira();
      if (renderer.domElement.requestPointerLock) {
        try {
          var p = renderer.domElement.requestPointerLock();
          if (p && p.catch) p.catch(function () {});
        } catch (erro) {}
      }
    }

    desligarLivre = function () {
      livre.ligado = false;
      livre.vel.set(0, 0, 0);
      livre.teclas = {};
      livre.olhando = false;
      document.body.classList.remove("mirando");
      paintMira();
      destravarMouse();
      ajustarCamera(az, pol, dist);
    };

    function alternarLivre() {
      if (!livre.ligado && veiculo.ativo) descerDoVeiculo(true);
      if (livre.ligado) desligarLivre();
      else ligarLivre();
    }

    passoCameraLivre = function (dt) {
      if (!livre.ligado) return;
      var cp = Math.cos(livre.pitch);
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
      if (t[" "]) my += 1;
      if (t.shift || t.q) my -= 1;

      var plano = Math.sqrt(mx * mx + mz * mz);
      if (plano > 0) {
        mx /= plano;
        mz /= plano;
      }

      livre.vel.set(
        (fx * mz + rx * mx) * livre.velo,
        fy * mz + my * livre.velo,
        (fz * mz + rz * mx) * livre.velo,
      );
      livre.pos.addScaledVector(livre.vel, dt);
      aplicarLivre();
    };

    function pegar(mouseX, mouseY) {
      if (!mirarPonteiro(mouseX, mouseY)) return null;
      var hits = raio.intersectObjects(malhasBloco, true);
      if (!hits.length) return null;
      var obj = hits[0].object;
      while (obj && !obj.userData.bloco) obj = obj.parent;
      return obj ? obj.userData.bloco : null;
    }

    function ponteiroDoArraste(ev) {
      return (
        modoConstrucao.ponteiroId === null ||
        ev.pointerId === modoConstrucao.ponteiroId
      );
    }

    palco.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0 && ev.pointerType === "mouse") return;
      arrastando = true;
      livre.olhando = livre.ligado;
      moveu = false;
      ultimoX = ev.clientX;
      ultimoY = ev.clientY;
    });

    global.addEventListener("pointermove", function (ev) {
      if (
        modoConstrucao.ativo &&
        modoConstrucao.preview &&
        ponteiroDoArraste(ev)
      ) {
        moverPreview(ev.clientX, ev.clientY);
        return;
      }

      if (modoConstrucao.ativo && modoConstrucao.modoDeletar) {
        destacarSobOMarreta(ev.clientX, ev.clientY);
        return;
      }

      if (livre.ligado) {
        if (!livre.olhando) return;
        var mx =
          ev.movementX !== undefined && ev.movementX !== 0
            ? ev.movementX
            : ev.clientX - ultimoX;
        var my =
          ev.movementY !== undefined && ev.movementY !== 0
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

    global.addEventListener("pointerup", function (ev) {
      var cliqueEsquerdo = ev.button === 0 || ev.pointerType !== "mouse";

      if (
        modoConstrucao.ativo &&
        modoConstrucao.preview &&
        ponteiroDoArraste(ev)
      ) {
        soltarDestaqueRemocao();
        fimDoArraste();
        arrastando = false;
        moveu = false;
        if (cliqueEsquerdo && !ponteiroSobreInventario(ev)) {
          moverPreview(ev.clientX, ev.clientY);
          confirmarColocacao();
        } else {
          atualizarControlesConstrucao();
        }
        return;
      }

      if (livre.ligado) {
        livre.olhando = false;
        arrastando = false;
        return;
      }

      if (modoConstrucao.ativo && modoConstrucao.modoDeletar) {
        arrastando = false;
        if (cliqueEsquerdo && !moveu) {
          var alvo = objetoEm(
            ev.clientX,
            ev.clientY,
            modoConstrucao.construcoes,
          );
          while (alvo && alvo.parent && !alvo.userData.permanente)
            alvo = alvo.parent;
          if (alvo && alvo.userData.permanente) deletarItemConstrucao(alvo);
          else soltarDestaqueRemocao();
        } else {
          soltarDestaqueRemocao();
        }
        atualizarControlesConstrucao();
        return;
      }

      if (modoConstrucao.ativo) {
        soltarDestaqueRemocao();
        arrastando = false;
        return;
      }

      if (veiculo.ativo) {
        arrastando = false;
        moveu = false;
        return;
      }

      if (arrastando && !moveu && cliqueEsquerdo) {
        if (veiculoDirigivelEm(ev.clientX, ev.clientY)) {
          arrastando = false;
          return;
        }
      }

      if (arrastando && !moveu && ev.button === 0) {
        if (verificarCliquePlaquinha(ev.clientX, ev.clientY)) {
          arrastando = false;
          return;
        }
      }

      if (arrastando && !moveu && ev.button === 0) {
        if (estado.ferramenta === "machado") {
          var arvoresDecorativas = [];
          grupoDecoracoes.children.forEach(function (obj) {
            if (obj.userData && obj.userData.podeCortar) {
              arvoresDecorativas.push(obj);
            }
          });

          var arvore = objetoEm(ev.clientX, ev.clientY, arvoresDecorativas);
          if (arvore) {
            while (arvore.parent && !arvore.userData.podeCortar) {
              arvore = arvore.parent;
            }
            if (arvore.userData && arvore.userData.podeCortar) {
              cortarArvore(arvore);
              arrastando = false;
              return;
            }
          }
        }

        var b = pegar(ev.clientX, ev.clientY);
        if (b) {
          selecionado = b;
          var p = posicaoDe(b);
          malhaSelecao.position.set(p[0], 0.17, p[2]);
          malhaSelecao.visible = !b.bloqueado;

          if (!b.bloqueado) {
            var dx = p[0] - malhaFazendeiro.position.x;
            var dz = p[2] - malhaFazendeiro.position.z;
            var distancia = Math.sqrt(dx * dx + dz * dz);

            if (distancia > 0.8) {
              movimentoAutomatico.ativo = true;
              movimentoAutomatico.alvoX = p[0];
              movimentoAutomatico.alvoZ = p[2];
              movimentoAutomatico.bloco = b;
              movimentoAutomatico.distanciaMinima = 0.6;
              movimentoAutomatico.acaoAposChegar = function () {
                usarFerramenta(b);
              };
              aviso("Caminhando ate o bloco...", false);
            } else {
              usarFerramenta(b);
            }
          }
          pintarInspetor();
        } else {
          selecionado = null;
          malhaSelecao.visible = false;
          pintarInspetor();
        }
      }
      arrastando = false;
    });

    function indiceDaTeclaFerramenta(k) {
      if (!/^[1-9]$/.test(k)) return -1;
      var indice = Number(k) - 1;
      return indice < FERRAMENTAS.length ? indice : -1;
    }

    function teclasDeMovimento(k) {
      return (
        k === "w" ||
        k === "a" ||
        k === "s" ||
        k === "d" ||
        k === "q" ||
        k === " " ||
        k === "shift"
      );
    }

    function nomearTecla(k) {
      if (k === " ") return " ";
      return k;
    }

    global.addEventListener("keydown", function (ev) {
      var emCampo =
        ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName || "");
      var k = ev.key.toLowerCase();

      if (!emCampo && veiculo.ativo) {
        if (k === "e") {
          ev.preventDefault();
          descerDoVeiculo();
          return;
        }
        if (indiceDaTeclaFerramenta(k) >= 0) descerDoVeiculo(true);
      }

      if (!emCampo && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        var atalho = indiceDaTeclaFerramenta(k);
        if (atalho >= 0) {
          var loja = ui("loja");
          if (!loja || loja.hidden) {
            var ferramentaAtalho = FERRAMENTAS[atalho];
            ev.preventDefault();
            selecionarFerramenta(ferramentaAtalho.id);
            if (ferramentaAtalho.id !== "construcao") {
              aviso(
                ferramentaAtalho.nome +
                  " selecionado (tecla " +
                  (atalho + 1) +
                  ").",
                false,
              );
            }
            return;
          }
        }
      }

      if (
        !emCampo &&
        k === "r" &&
        modoConstrucao.ativo &&
        modoConstrucao.preview
      ) {
        ev.preventDefault();
        girarPreview();
        return;
      }

      if (ev.key === "Escape") {
        if (popupPlaquinha.ativo) {
          fecharPopupPlaquinha();
          return;
        }

        if (veiculo.ativo) {
          descerDoVeiculo();
          return;
        }

        if (modoConstrucao.preview) {
          cancelarArrasteItem();
          return;
        }

        var modal = ui("loja");
        if (modal && !modal.hidden) {
          modal.hidden = true;
          return;
        }
        if (modoConstrucao.ativo) {
          desativarModoConstrucao();
          return;
        }
        if (livre.ligado) {
          desligarLivre();
          return;
        }
      }

      if (ev.key === "h" || ev.key === "H") {
        if (emCampo) return;
        ev.preventDefault();
        alternarLivre();
        return;
      }

      if (emCampo) return;
      if (teclasDeMovimento(k)) {
        livre.teclas[nomearTecla(k)] = true;
        ev.preventDefault();
      }
    });

    document.addEventListener("contextmenu", function (ev) {
      if (modoConstrucao.ativo && modoConstrucao.preview) {
        ev.preventDefault();
        cancelarArrasteItem();
      }
    });

    global.addEventListener("pointercancel", function () {
      if (modoConstrucao.ativo && modoConstrucao.preview)
        cancelarArrasteItem(true);
    });

    global.addEventListener("keyup", function (ev) {
      var k = ev.key.toLowerCase();
      if (teclasDeMovimento(k)) livre.teclas[nomearTecla(k)] = false;
    });

    document.addEventListener("pointerlockchange", function () {
      if (document.pointerLockElement !== renderer.domElement && livre.ligado)
        desligarLivre();
    });

    global.RaizJogoLivre = function () {
      return livre.ligado;
    };

    palco.addEventListener(
      "wheel",
      function (ev) {
        ev.preventDefault();
        if (livre.ligado) {
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
      },
      { passive: false },
    );

    document.querySelectorAll("[data-aba]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (b.dataset.aba !== abaAtual) {
          abaAtual = b.dataset.aba;
          loteEmEscolha = null;
        }
        pintarLoja();
      });
    });

    var abrir = ui("abrir-loja");
    if (abrir) {
      abrir.addEventListener("click", function () {
        loteEmEscolha = null;
        abaAtual = abaAtual || "equipamentos";
        ui("loja").hidden = false;
        pintarLoja();
      });
    }
    var modal = ui("loja");
    if (modal) {
      modal.addEventListener("click", function (ev) {
        if (ev.target === modal) modal.hidden = true;
      });
    }

    var fecharConstrucao = ui("fechar-construcao");
    if (fecharConstrucao) {
      fecharConstrucao.addEventListener("click", function () {
        desativarModoConstrucao();
      });
    }

    var descerBtn = ui("descer-veiculo");
    if (descerBtn) {
      descerBtn.addEventListener("click", function () {
        descerDoVeiculo();
      });
    }

    var girar = ui("girar-construcao");
    if (girar) {
      girar.addEventListener("click", function () {
        girarPreview();
      });
    }
    var cancelar = ui("cancelar-construcao");
    if (cancelar) {
      cancelar.addEventListener("click", function () {
        if (modoConstrucao.modoDeletar) desativarModoDeletar();
        else cancelarArrasteItem();
      });
    }

    var reiniciar = ui("reiniciar");
    if (reiniciar) {
      reiniciar.addEventListener("click", function () {
        if (
          !global.confirm(
            "Recomecar apaga o progresso salvo, incluindo as construções. Continuar?",
          )
        )
          return;
        C.apagar();
        global.location.reload();
      });
    }

    global.addEventListener("resize", redimensionar);
    if (global.ResizeObserver)
      new global.ResizeObserver(redimensionar).observe(palco);
  }

  function erroFatal(erro) {
    console.error("Raiz jogo: falha ao iniciar.", erro);
    var painel = document.querySelector(".hud-centro");
    if (painel) {
      painel.innerHTML = "";
      var h = document.createElement("h2");
      h.textContent = "Nao deu para abrir a fazenda";
      var p = document.createElement("p");
      p.style.cssText =
        "font-size:.78rem;color:var(--muted);word-break:break-word";
      p.textContent =
        erro && (erro.message || erro)
          ? String(erro.message || erro)
          : "erro desconhecido";
      var dica = document.createElement("p");
      dica.style.cssText =
        "font-size:.72rem;color:var(--muted);margin-top:10px";
      dica.textContent = "Abra o console (F12) para ver o erro completo.";
      painel.appendChild(h);
      painel.appendChild(p);
      painel.appendChild(dica);
    }
    var caixa = ui("toast");
    if (caixa) {
      caixa.textContent =
        "Erro ao iniciar: " + ((erro && erro.message) || erro);
      caixa.classList.add("visivel", "erro");
    }
  }

  function iniciar() {
    try {
      estado = C.iniciar();
      C.normalizarConstrucoes(estado);
      if (estado.ferramenta === "construcao") estado.ferramenta = "plantar";

      montarCena();
      atualizarCena();
      reconstruirConstrucoes();
      montarFerramentas();
      montarSementes();
      ligarInteracoes();
      redimensionar();
      atualizarUI();
      relogioAnterior = global.performance
        ? global.performance.now()
        : Date.now();
      global.requestAnimationFrame(laco);
    } catch (erro) {
      erroFatal(erro);
      return;
    }

    global.RaizJogoView = {
      estado: function () {
        return estado;
      },
      construcoes: function () {
        return estado.construcoes;
      },
      veiculo: function () {
        return veiculo;
      },
      malhasConstrucao: function () {
        return modoConstrucao.construcoes;
      },
      particulas: function () {
        return particulasPoeira.length;
      },
      teclas: function () {
        return livre.teclas;
      },
    };
  }

  global.addEventListener("error", function (ev) {
    if (!estado) erroFatal(ev.error || ev.message);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})(window);
