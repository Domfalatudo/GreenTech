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
    { id: 'adubar', nome: 'Adubar', tipo: 'acao', cor: '#8a6b3f' },
    { id: 'colher', nome: 'Colher', tipo: 'acao', cor: '#d8b64a' },
    { id: 'despoluir', nome: 'Despoluir', tipo: 'acao', cor: '#a4402f' },
    { id: 'enxada', nome: 'Enxada', tipo: 'item', cor: '#9c8b6e' },
    { id: 'regador', nome: 'Regador', tipo: 'item', cor: '#3f7a8f' },
    { id: 'machado', nome: 'Machado', tipo: 'item', cor: '#8b4513' },
    { id: 'construcao', nome: 'Modo Construção', tipo: 'modo', cor: '#ff6b35' }
  ];

  var estado = null;
  var selecionado = null;
  var abaAtual = 'equipamentos';
  var loteEmEscolha = null;

  var cena, camera, renderer, tabuleiro, grupoBlocos, grupoEstruturas, grupoDecoracoes;
  var malhasBloco = [];
  var malhaSelecao = null;
  var malhaFazendeiro = null;
  var fazPartes = {}; // pernas, bracos, ferramenta
  var luzes = {};
  var chuva = null;
  var relogioAnterior = 0;
  var ultimoAviso = 0;
  var houveEstruturaNoturna = false;
  var tempoAndar = 0;
  var andando = false;
  var correndo = false;

  // === FISICA DO PERSONAGEM (unidades por SEGUNDO, integrado com dt) ===
  var ALTURA_CHAO = 0.15; // topo dos blocos (Box 0.3 centrada em y=0)
  var fisica = {
    velocidade: new THREE.Vector3(),
    aceleracao: 20,       // aceleracao horizontal (unidades/s²)
    friccao: 12.0,          // desaceleração horizontal (por segundo)
    velocidadeNormal: 4.0,
    velocidadeSprint: 6.0,
    velocidadeMaxima: 4.0,  // unidades/s (antes era 0.13 por frame!)
    gravidade: -22.0,       // gravidade vertical (unidades/s²)
    velocidadeY: 0,
    noChao: true,
    forcaPulo: 7.5,         // impulso vertical (unidades/s) — altura ~1.2 bloco
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
    coyoteTime: 0,          // segundos desde que saiu do chão (permite pular um pouco depois)
    jumpBuffer: 0,          // segundos desde que pressionou espaço (permite pular um pouco antes)
    ultimoPassoTempo: 0
  };
  
  var teclasPressionadas = {};
  var obstaculos = []; // Lista de objetos com colisão
  var particulasPoeira = [];
  var animacaoAcao = { ativa: false, tempo: 0, duracao: 0.35, tipo: '' };

  // =====================================================================
  // ESTADO DO MODO CONSTRUÇÃO
  // ---------------------------------------------------------------------
  // Este objeto é declarado UMA ÚNICA VEZ e é a única fonte de verdade do
  // modo. Antes existia uma segunda declaração `var modoConstrucao = {...}`
  // mais abaixo no arquivo: por ser `var`, ela rodava no carregamento e
  // SOBRESCREVIA esta, apagando `itemsPosicionados` (e fazia o `.push` na
  // hora de colocar um item estourar) junto com inventario, arrastando,
  // modoDeletar e grade. Não declare `modoConstrucao` em mais nenhum lugar.
  //
  //  ativo            modo ligado?
  //  itemSelecionado   id do item preparado para posicionar
  //  preview           Group translúcido que segue o ponteiro
  //  previewValido     o bloco sob o preview aceita a construção
  //  previewMotivo     por que não aceita (vira o aviso da UI)
  //  grade             grupo com as linhas e os planos verdes dos lotes
  //  construcoes       meshes 3D permanentes no mapa
  //  particulas        gotas/vapor com vida curta
  //  arrastando        arraste em curso
  //  ponteiroId        pointerId dono do arraste (mouse OU toque)
  //  origem            ponto do pointerdown, para separar clique de arrasto
  //  rotacao           giro do preview em passos de 90 graus (0..3)
  //  modoDeletar       marreta armada
  //  emDestaque        construção sob o dedo/cursor na marreta
  //  ferramentaAnterior  ferramenta antes de entrar (restaurada ao sair)
  //  livreAntes        a câmera livre já estava ligada antes de entrar
  // =====================================================================
  var modoConstrucao = {
    ativo: false,
    itemSelecionado: null,
    preview: null,
    previewValido: false,
    previewMotivo: '',
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
    livreAntes: false
  };

  var ANGULO_GIRO = Math.PI / 2;
  var COR_PREVIEW_OK = 0x2fbf5f;
  var COR_PREVIEW_NOK = 0xe0483a;

  function discardarObjeto(objeto) {
    if (!objeto) return;
    if (objeto.parent) objeto.parent.remove(objeto);
    objeto.traverse(function (no) {
      if (no.geometry) no.geometry.dispose();
      if (!no.material) return;
      var lista = Array.isArray(no.material) ? no.material : [no.material];
      lista.forEach(function (m) { m.dispose(); });
    });
  }

  // A barra central do HUD tem DOIS estados: as ferramentas e o inventário
  // do modo construção. Entra um, sai o outro, e o título acompanha.
  function atualizarCabecalhoCentro() {
    var titulo = ui('titulo-centro');
    var barra = ui('barra-ferramentas');
    var fechar = ui('fechar-construcao');
    if (titulo) {
      titulo.textContent = modoConstrucao.ativo
         'Ferramentas';
    }
    if (barra) barra.hidden = modoConstrucao.ativo;
    if (fechar) fechar.hidden = !modoConstrucao.ativo;
  }

  // Ativar o modo construção
  function ativarModoConstrucao() {
    if (modoConstrucao.ativo || !estado) return;

    // guarda o que precisa voltar exatamente como estava
    modoConstrucao.ferramentaAnterior = estado.ferramenta || 'plantar';
    modoConstrucao.livreAntes = livre.ligado;

    modoConstrucao.ativo = true;
    modoConstrucao.rotacao = 0;
    // a ferramenta vira "construcao" de verdade: é o que faz o botão receber
    // a classe .ativo e o que impede usar ferramenta no mapa com o modo ligado
    estado.ferramenta = 'construcao';
    marcarFerramenta();
    atualizarFerramentaMao();

    document.body.classList.add('modo-construcao');
    if (malhaFazendeiro) malhaFazendeiro.visible = false;
    if (malhaSelecao) malhaSelecao.visible = false;
    selecionado = null;

    // a grade é refeita na ativação: se o jogador comprou lote depois da
    // última vez, ela precisa refletir o terreno novo
    reconstruirGradeConstrucao(true);
    if (modoConstrucao.grade) modoConstrucao.grade.visible = true;

    var inv = ui('inventario-construcao');
    if (inv) inv.classList.add('ativo');
    atualizarCabecalhoCentro();
    atualizarInventarioConstrucao();
    atualizarControlesConstrucao();
    pintarInspetor();

    // O aviso do modo perdeu a caixa de texto fixa do painel: as teclas
    // de atalho são lembradas aqui, uma vez, no lugar dela.
    aviso('Modo Construção ligado. Arraste um item até o terreno; R gira 90° e Esc cancela.', false);
  }

  // Desativar o modo construção devolvendo o jogo ao estado anterior
  function desativarModoConstrucao() {
    if (!modoConstrucao.ativo) return;

    cancelarArrasteItem(true);
    if (modoConstrucao.modoDeletar) desativarModoDeletar(true);

    modoConstrucao.ativo = false;
    modoConstrucao.itemSelecionado = null;
    modoConstrucao.rotacao = 0;
    document.body.classList.remove('modo-construcao');
    if (malhaFazendeiro) malhaFazendeiro.visible = true;
    if (modoConstrucao.grade) modoConstrucao.grade.visible = false;

    var inv = ui('inventario-construcao');
    if (inv) inv.classList.remove('ativo');
    atualizarCabecalhoCentro();
    atualizarControlesConstrucao();

    // devolve a ferramenta que estava na mão antes de entrar
    if (estado) {
      estado.ferramenta = modoConstrucao.ferramentaAnterior || 'plantar';
      marcarFerramenta();
      atualizarFerramentaMao();
      C.salvar(estado);
    }
    modoConstrucao.ferramentaAnterior = null;

    // a câmera livre só é desligada se foi o modo construção que ligou ela
    if (!modoConstrucao.livreAntes && livre.ligado) desligarLivre();
    modoConstrucao.livreAntes = false;

    pintarInspetor();
    aviso('Modo Construção desligado.', false);
  }
  
  // Recria a grade de construcao. Ela e montada a partir de `estado.lotes`,
  // entao precisa ser refeita sempre que um lote novo for comprado e toda vez
  // que o modo construcao for ativado.
  function reconstruirGradeConstrucao(forcar) {
    if (!estado || !tabuleiro) return;
    if (!forcar && modoConstrucao.grade && modoConstrucao.grade.userData.lotes === Object.keys(estado.lotes).length) {
      return;
    }
    if (modoConstrucao.grade) discardarObjeto(modoConstrucao.grade);
    modoConstrucao.grade = null;
    criarGradeConstrucao();
  }

  // Criar grade de construção
  function criarGradeConstrucao() {
    var gradeGroup = new THREE.Group();
    gradeGroup.userData.lotes = Object.keys(estado.lotes).length;

    // Material das linhas da grade (branco)
    var materialLinha = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      depthWrite: false
    });

    // Material das linhas dos lotes (azul mais forte)
    var materialLote = new THREE.LineBasicMaterial({
      color: 0x4af0ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });

    // Altura da grade (acima dos blocos) — planos somem junto com ela
    var alturaGrade = 0.2;

    // Calcular limites da grade baseado no sistema de coordenadas
    // A grade deve ter linhas nas BORDAS dos blocos, não nos centros
    var limiteMin = -meio - TILE/2;
    var limiteMax = meio + TILE/2;

    // Criar linhas verticais (bordas dos blocos no eixo X)
    for (var x = 0; x <= D.GRADE; x++) {
      // Posição da linha: início da grade + x blocos
      var xReal = limiteMin + x * STEP;
      var ehLinhaDeLote = (x % D.LOTE === 0);
      var material = ehLinhaDeLote ? materialLote : materialLinha;

      var pontos = [];
      pontos.push(new THREE.Vector3(xReal, alturaGrade, limiteMin));
      pontos.push(new THREE.Vector3(xReal, alturaGrade, limiteMax));

      var geometria = new THREE.BufferGeometry().setFromPoints(pontos);
      var linha = new THREE.Line(geometria, material);
      gradeGroup.add(linha);
    }

    // Criar linhas horizontais (bordas dos blocos no eixo Z)
    for (var z = 0; z <= D.GRADE; z++) {
      var zReal = limiteMin + z * STEP;
      var ehLinhaDeLote = (z % D.LOTE === 0);
      var material = ehLinhaDeLote ? materialLote : materialLinha;

      var pontos = [];
      pontos.push(new THREE.Vector3(limiteMin, alturaGrade, zReal));
      pontos.push(new THREE.Vector3(limiteMax, alturaGrade, zReal));

      var geometria = new THREE.BufferGeometry().setFromPoints(pontos);
      var linha = new THREE.Line(geometria, material);
      gradeGroup.add(linha);
    }

    // Adicionar plano verde APENAS em blocos liberados
    // Os planos ficam DENTRO de gradeGroup, então somem automaticamente
    // quando a grade é escondida (gradeGroup.visible = false fora do modo).
    estado.blocos.forEach(function(b) {
      var p = posicaoDe(b);

      // Verificar se o bloco está em lote comprado
      var loteX = Math.floor(b.x / D.LOTE);
      var loteZ = Math.floor(b.z / D.LOTE);
      var chaveLote = loteX + ':' + loteZ;

      if (estado.lotes[chaveLote] && !b.bloqueado) {
        // Plano verde semi-transparente
        var plano = new THREE.Mesh(
          new THREE.PlaneGeometry(TILE, TILE),
          new THREE.MeshBasicMaterial({
            color: 0x6fbf7a,
            transparent: true,
            opacity: 0.16,
            side: THREE.DoubleSide,
            depthWrite: false
          })
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

  // Função para snap to grid (encaixar na grade)
  function snapToGrid(x, z) {
    // O sistema de coordenadas do jogo:
    // - Centro é 0,0
    // - Blocos vão de -meio a +meio
    // - Cada bloco tem tamanho STEP

    // Converter coordenada mundial para índice de bloco
    var blocoX = Math.round((x + meio) / STEP);
    var blocoZ = Math.round((z + meio) / STEP);

    // Limitar aos limites da grade
    blocoX = Math.max(0, Math.min(D.GRADE - 1, blocoX));
    blocoZ = Math.max(0, Math.min(D.GRADE - 1, blocoZ));

    // Converter de volta para coordenada mundial (centro do bloco)
    var gridX = blocoX * STEP - meio;
    var gridZ = blocoZ * STEP - meio;

    return { x: gridX, z: gridZ, blocoX: blocoX, blocoZ: blocoZ };
  }

  // o ponteiro está dentro do tabuleiro?
  function dentroDoTabuleiro(x, z) {
    var limite = meio + TILE / 2;
    return x >= -limite && x <= limite && z >= -limite && z <= limite;
  }

  // Bloco sob uma posição do mundo (para colisão com lotes travados).
  // Devolve null fora da grade.
  function blocoSobXZ(x, z) {
    if (!estado) return null;
    var bx = Math.round((x + meio) / STEP);
    var bz = Math.round((z + meio) / STEP);
    if (bx < 0 || bz < 0 || bx >= D.GRADE || bz >= D.GRADE) return null;
    return C.blocoEm(estado, bx, bz);
  }
  
  // ==========================================================
  // INVENTÁRIO DO MODO CONSTRUÇÃO
  // ==========================================================
  // Quantidade exibida = unidade que AINDA não foi exposta no mapa.
  // O item continua sendo seu depois de colocado (modelo (a)): ele
  // permanece em `estado.itens` e continua valendo energia, pegada
  // ecológica e uso de ferramenta. O que muda é que cada unidade só
  // pode ter UMA cópia construída, o que mantém o inventário honesto
  // (nada duplica, nada some ao recarregar a página).
  function atualizarInventarioConstrucao() {
    var container = ui('itens-inventario');
    if (!container || !estado) return;

    container.textContent = '';

    // MARRETA (sempre no topo)
    var marretadas = (estado.construcoes || []).length;
    var divMarreta = document.createElement('div');
    divMarreta.className = 'item-construcao item-marreta';
    divMarreta.dataset.itemId = 'marreta';
    divMarreta.setAttribute('role', 'button');
    if (modoConstrucao.modoDeletar) divMarreta.classList.add('selecionado');

    divMarreta.innerHTML =
      '<div class="icon">🔨</div>' +
      '<div class="info">' +
        '<div class="nome">Marreta</div>' +
        '<div class="quantidade">' +
          (marretadas ? 'Remover construções (' + marretadas + ')' : 'Nada construído ainda') +
        '</div>' +
      '</div>';

    divMarreta.addEventListener('click', function () {
      if (modoConstrucao.modoDeletar) desativarModoDeletar();
      else ativarModoDeletar();
    });

    container.appendChild(divMarreta);

    // Separador visual entre a marreta e a lista de equipamentos.
    // A lista é um grid: a classe faz a linha ocupar a largura inteira.
    var separador = document.createElement('div');
    separador.className = 'separador-construcao';
    container.appendChild(separador);

    Object.keys(D.CONSTRUCOES.itens).forEach(function (itemId) {
      var modelo = D.CONSTRUCOES.itens[itemId];
      var disponivel = C.construcoesDoItem(estado, itemId);
      var noMapa = C.contarConstrucoes(estado, itemId);

      var div = document.createElement('div');
      div.className = 'item-construcao';
      div.dataset.itemId = itemId;
      div.setAttribute('role', 'button');
      if (disponivel === 0) div.classList.add('sem-item');

      div.innerHTML =
        '<div class="icon">' + modelo.emoji + '</div>' +
        '<div class="info">' +
          '<div class="nome">' + modelo.nome + '</div>' +
          '<div class="quantidade">' +
            (disponivel > 0
              ? 'Disponível: ' + disponivel + (noMapa ? ' · no mapa: ' + noMapa : '')
              : 'Todas as unidades já estão no mapa') +
          '</div>' +
        '</div>' +
        (disponivel > 0 ? '<div class="badge">' + disponivel + '</div>' : '');

      if (disponivel > 0) {
        // Pointer Events: o mesmo caminho serve para mouse e para toque.
        // Um toque/clique simples só SELECIONA o item; o ponteiro seguinte
        // sobre o mapa é quem posiciona. Arrastar também funciona.
        div.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          iniciarArrastarItem(itemId, ev);
        });
      }

      container.appendChild(div);
    });
  }
  
  // ==========================================================
  // MODO DELETAR (marreta)
  // ==========================================================
  function ativarModoDeletar() {
    cancelarArrasteItem(true);
    modoConstrucao.modoDeletar = true;
    modoConstrucao.itemSelecionado = 'marreta';
    document.body.classList.add('modo-deletar');
    atualizarInventarioConstrucao();
    atualizarControlesConstrucao();
    aviso('Marreta armada. Toque numa construção para retirar do terreno.', false);
  }

  function desativarModoDeletar(silencioso) {
    modoConstrucao.modoDeletar = false;
    if (modoConstrucao.itemSelecionado === 'marreta') modoConstrucao.itemSelecionado = null;
    soltarDestaqueRemocao();
    document.body.classList.remove('modo-deletar');
    atualizarInventarioConstrucao();
    if (!silencioso) aviso('Marreta guardada.', false);
  }

  // Realça a construção que está sob o cursor/dedo, para o jogador ver
  // exatamente o que vai sair do terreno antes de confirmar.
  function realcarParaRemocao(item) {
    if (item.userData.realcado) return;
    item.traverse(function (no) {
      if (!no.isMesh || !no.material) return;
      if (!no.userData.materialOriginal) no.userData.materialOriginal = no.material;
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
      // o material vermelho é temporário: devolve o original e descarta o clone
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
  // ==========================================================
  // COLISÃO DAS CONSTRUÇÕES
  // ==========================================================
  // Mesmo padrão das árvores e rochas decorativas: quem empurra o
  // personagem é o teste de colisão do laço principal, que lê `obstaculos`.
  // Sem esta etapa o fazendeiro atravessava tratores, drones e árvores.
  function registrarColisao(item, itemId) {
    var medida = D.CONSTRUCOES.itens[itemId] || { raio: 0.35, altura: 0.6 };
    var colisao = {
      pos: item.position.clone(),
      raio: medida.raio,
      altura: medida.altura,
      construcao: item
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

  // ==========================================================
  // CRIAR / RECONSTRUIR CONSTRUÇÕES
  // ==========================================================
  // Modelo 3D permanente de um item do modo construção.
  // Reaproveita malhaDeEstrutura() para não duplicar os modelos:
  // todo id de D.CONSTRUCOES.itens tem um case correspondente lá.
  function criarModeloItem(itemId) {
    if (!D.CONSTRUCOES || !D.CONSTRUCOES.itens[itemId]) return new THREE.Group();
    var g = malhaDeEstrutura(itemId);
    g.userData.itemId = itemId;
    return g;
  }

  // Preview translúcido que segue o ponteiro: mesmo modelo, mas sem
  // sombra e com material clonado (para o pintarPreview poder tingir
  // de verde/vermelho sem vazar para o modelo permanente).
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

  // Relógio global das animações das construções (hélices, rotor, etc.)
  var tempoAnimConstrucao = 0;

  // Anima um item já colocado no terreno (chamado todo frame no laco).
  // Procura as peças móveis tanto no próprio grupo quanto nos filhos
  // (drone guarda as hélices um nível abaixo, dentro do sub-grupo).
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
      if (no !== item && no.userData.gira) no.userData.gira.rotation.z += dt * 3.0;
      if (no !== item && no.userData.molinete) no.userData.molinete.rotation.x += dt * 2.2;
      if (no !== item && no.userData.helices) {
        no.userData.helices.forEach(function (h, i) {
          h.rotation.y += dt * (18 + i * 3);
        });
      }
      // Pisca-pisca de alerta da turbina
      if (no === item.userData.luzAlerta && no.material && no.material.emissiveIntensity !== undefined) {
        no.material.emissiveIntensity = 0.6 + 0.4 * Math.sin(tempoAnimConstrucao * 4);
      }
    });

    // Drone flutua suavemente sobre o bloco
    if (id === 'drone') {
      if (item.userData.fase === undefined) item.userData.fase = Math.random() * Math.PI * 2;
      item.position.y = ALTURA_CHAO + 0.35 + Math.sin(tempoAnimConstrucao * 2 + item.userData.fase) * 0.06;
    }

    // Poste acende a lâmpada e a luz real só à noite
    if (item.userData.eLuzPoste && estado) {
      var ehNoite = C.ehNoite(estado);
      if (item.userData.luzPonto) item.userData.luzPonto.intensity = ehNoite ? 1.6 : 0;
      if (item.userData.lampada && item.userData.lampada.material && item.userData.lampada.material.emissiveIntensity !== undefined) {
        item.userData.lampada.material.emissiveIntensity = ehNoite ? 1.2 : 0.15;
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

  // (Re)cria os itens 3D a partir do estado salvo. Roda no início do jogo,
  // antes de qualquer interação: é o que faz a construção voltar exatamente
  // onde estava (posição e rotação) depois de recarregar a página.
  function reconstruirConstrucoes() {
    modoConstrucao.construcoes.slice().forEach(function (item) {
      if (item === modoConstrucao.emDestaque) soltarDestaqueRemocao();
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


  
  // ==========================================================
  // COLOCAR E REMOVER
  // ==========================================================
  function nomeDoItem(itemId) {
    var construcao = D.CONSTRUCOES.itens[itemId];
    if (construcao) return construcao.nome;
    var equip = D.EQUIPAMENTOS[itemId] || D.ENERGIA[itemId];
    return equip ? equip.nome : itemId;
  }

  // Registra a construção no estado salvo e cria o objeto 3D.
  // NÃO decrementa `estado.itens`: esse contador é o de propriedade e
  // alimenta producaoEnergia(), indiceDePegada() e usarEquipamento() em
  // game-core.js. Consumir a unidade ao posicionar desligaria o efeito de
  // jogo do equipamento só porque ele virou decoração no mapa.
  function confirmarColocacao() {
    var itemId = modoConstrucao.itemSelecionado;
    if (!itemId) return;

    if (C.construcoesDoItem(estado, itemId) <= 0) {
      aviso('Você já colocou todas as unidades de ' + nomeDoItem(itemId) + '.', true);
      cancelarArrasteItem(true);
      return;
    }

    if (!modoConstrucao.preview || !modoConstrucao.preview.visible) {
      aviso('Leve o item até um bloco verde do seu terreno.', true);
      cancelarArrasteItem(true);
      return;
    }

    var encaixe = snapToGrid(modoConstrucao.preview.position.x, modoConstrucao.preview.position.z);
    var bloco = C.blocoEm(estado, encaixe.blocoX, encaixe.blocoZ);
    if (!bloco) {
      aviso('Posição inválida.', true);
      cancelarArrasteItem(true);
      return;
    }

    // Regra única: um bloco livre, uma construção, e nunca sobre
    // cultivo ou estrutura já existente.
    var conferencia = C.conferirConstrucao(estado, bloco);
    if (!conferencia.ok) {
      aviso(conferencia.msg, true);
      cancelarArrasteItem(true);
      return;
    }

    // ---- PERSISTÊNCIA: este registro é o que sobrevive ao F5 ----
    if (!Array.isArray(estado.construcoes)) estado.construcoes = [];
    estado.construcoes.push({
      itemId: itemId,
      blocoX: bloco.x,
      blocoZ: bloco.z,
      rotacao: modoConstrucao.rotacao
    });
    criarConstrucao(itemId, bloco, modoConstrucao.rotacao);
    C.salvar(estado);

    aviso(nomeDoItem(itemId) + ' pronto no terreno, girado ' + (modoConstrucao.rotacao * 90) + '°.', false);

    // mantém o item selecionado para construir vários em sequência
    soltarPreview();
    fimDoArraste();
    modoConstrucao.previewValido = false;
    atualizarInventarioConstrucao();
    atualizarUI();
  }

  // Deletar item clicado
  function deletarItemConstrucao(item) {
    if (!item || !item.userData || !item.userData.permanente) return false;

    var itemId = item.userData.itemId;
    var blocoX = item.userData.blocoX;
    var blocoZ = item.userData.blocoZ;

    if (modoConstrucao.emDestaque === item) soltarDestaqueRemocao();
    removerColisao(item);
    discardarObjeto(item);

    var i = modoConstrucao.construcoes.indexOf(item);
    if (i >= 0) modoConstrucao.construcoes.splice(i, 1);

    // Some do estado salvo junto com a cena: recarregar não ressuscita
    if (Array.isArray(estado.construcoes)) {
      estado.construcoes = estado.construcoes.filter(function (c) {
        return !(c.blocoX === blocoX && c.blocoZ === blocoZ && c.itemId === itemId);
      });
    }

    C.salvar(estado);
    atualizarInventarioConstrucao();
    atualizarUI();
    aviso(nomeDoItem(itemId) + ' retirado do terreno. Continua sendo seu na fazenda.', false);
    return true;
  }
  
  // ==========================================================
  // ARRASTAR E SOLTAR (Pointer Events: mouse e toque)
  // ==========================================================
  // O item é "pego" num pointerdown e accompanies o ponteiro até o
  // pointerup. Funciona igual com mouse, caneta e dedo.
  function selecionarItemParaConstruir(itemId) {
    if (!modoConstrucao.ativo) return false;
    if (modoConstrucao.modoDeletar) desativarModoDeletar(true);
    if (C.construcoesDoItem(estado, itemId) <= 0) {
      aviso('Você não tem ' + nomeDoItem(itemId) + ' disponível para construir.', true);
      return false;
    }

    modoConstrucao.itemSelecionado = itemId;
    modoConstrucao.rotacao = 0;

    // cria o preview translúcido
    soltarPreview();
    try {
      modoConstrucao.preview = criarPreviewItem(itemId);
      if (!modoConstrucao.preview) throw new Error('preview vazio');
      modoConstrucao.preview.visible = false;
      grupoEstruturas.add(modoConstrucao.preview);
    } catch (erro) {
      soltarPreview();
      modoConstrucao.itemSelecionado = null;
      aviso('Não consegui preparar ' + nomeDoItem(itemId) + ' para construir. Tente de novo.', true);
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
    document.body.classList.add('arrastando-item');

    var itemEl = document.querySelector('.item-construcao[data-item-id="' + itemId + '"]');
    if (itemEl) itemEl.classList.add('arrastando');
    atualizarControlesConstrucao();
  }

  // Move o preview para o bloco sob o ponteiro e pinta de verde ou vermelho.
  function moverPreview(clientX, clientY) {
    var preview = modoConstrucao.preview;
    if (!preview) return;

    var ponto = pontoNoChao(clientX, clientY);
    if (!ponto || !dentroDoTabuleiro(ponto.x, ponto.z)) {
      preview.visible = false;
      modoConstrucao.previewValido = false;
      modoConstrucao.previewMotivo = 'Leve o item até um bloco do seu terreno.';
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
      if (no.material.emissive) no.material.emissive.setHex(valido ? COR_PREVIEW_OK : COR_PREVIEW_NOK);
      if (no.material.emissiveIntensity !== undefined) {
        no.material.emissiveIntensity = valido ? 0.35 : 0.7;
      }
      no.material.opacity = valido ? 0.65 : 0.5;
    });
  }

  // Gira o preview em 90 graus (botão na UI ou tecla R)
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

  // O ponteiro está sobre o painel de construções? Nesse caso um toque
  // simples só seleciona o item: quem posiciona é o toque no mapa.
  function ponteiroSobreInventario(ev) {
    var alvo = ev.target;
    return !!(alvo && alvo.closest && alvo.closest('.inventario-construcao'));
  }

  // Encerra o gesto de arraste: solta as classes de cursor e destaque.
  // Usado tanto ao soltar (colocar) quanto ao só selecionar o item.
  function fimDoArraste() {
    modoConstrucao.arrastando = false;
    modoConstrucao.ponteiroId = null;
    modoConstrucao.origem = null;
    document.body.classList.remove('arrastando-item');
    document.querySelectorAll('.item-construcao.arrastando').forEach(function (el) {
      el.classList.remove('arrastando');
    });
  }

  // Cancelar arraste (Esc, botão direito ou botão Cancelar da UI)
  function cancelarArrasteItem(silencioso) {
    soltarPreview();
    fimDoArraste();
    modoConstrucao.previewValido = false;
    modoConstrucao.previewMotivo = '';
    modoConstrucao.itemSelecionado = null;
    modoConstrucao.rotacao = 0;
    document.querySelectorAll('.item-construcao.selecionado').forEach(function (el) {
      el.classList.remove('selecionado');
    });
    atualizarControlesConstrucao();
    if (!silencioso) aviso('Construção cancelada.', false);
  }

  // Texto da linha de status da construção. Fica VAZIA quando não há nada a
  // avisar — o CSS esconde a linha nesse caso (`.status-construcao:empty`),
  // então só aparecem as mensagens contextuais (bloco ocupado, marreta
  // armada, prévia válida). Só escreve no DOM quando o texto muda: é
  // chamada a cada pointermove.
  function textoDeStatus() {
    if (modoConstrucao.modoDeletar) {
      return 'Marreta armada: toque na construção destacada para retirar.';
    }
    if (!modoConstrucao.preview) {
      return '';
    }
    // prévia ainda não levada ao mapa (item recém-selecionado): silêncio
    if (!modoConstrucao.preview.visible && !modoConstrucao.previewMotivo) {
      return '';
    }
    if (modoConstrucao.previewValido) {
      return 'Soltar aqui: ' + nomeDoItem(modoConstrucao.itemSelecionado) + ' · ' +
        (modoConstrucao.rotacao * 90) + '°';
    }
    return modoConstrucao.previewMotivo || 'Soltar aqui.';
  }

  function atualizarControlesConstrucao() {
    var painel = ui('controles-construcao');
    var status = ui('status-construcao');
    var angulo = ui('angulo-construcao');
    var cancelar = ui('cancelar-construcao');
    var girar = ui('girar-construcao');

    if (painel) painel.hidden = !modoConstrucao.ativo;
    if (girar) girar.disabled = !modoConstrucao.preview;
    if (cancelar) cancelar.disabled = !modoConstrucao.preview && !modoConstrucao.modoDeletar;
    // Sem item na mão (e sem marreta) os botões não têm função: o painel
    // fica apenas com a lista de equipamentos.
    if (painel) {
      painel.classList.toggle('ocioso', !modoConstrucao.preview && !modoConstrucao.modoDeletar);
      painel.classList.toggle('sem-girar', !modoConstrucao.preview);
    }
    if (angulo) {
      var grafico = modoConstrucao.itemSelecionado && modoConstrucao.itemSelecionado !== 'marreta'
        ? (modoConstrucao.rotacao * 90) + '°'
        : '--';
      if (angulo.textContent !== grafico) angulo.textContent = grafico;
    }
    if (!status) return;
    var msg = textoDeStatus();
    if (status.textContent !== msg) status.textContent = msg;
  }

  // Destacar item selecionado no inventário
  function destacarItemSelecionado(itemId) {
    document.querySelectorAll('.item-construcao').forEach(function (el) {
      el.classList.toggle('selecionado', !!itemId && el.dataset.itemId === itemId);
    });
  }
  
  // modo construcao
  var reduzirMovimento = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
  // Preenchido em ligarInteracoes(); fica no escopo do módulo para que
  // outros fluxos (o modo construção) possam sair da câmera livre.
  var desligarLivre = function () {};

  var TILE = 1;
  var GAP = 0;
  var STEP = TILE + GAP;
  var meio = ((D.GRADE - 1) * STEP) / 2;

  // ---- raycast compartilhado (mouse e toque usam o mesmo caminho) ----
  var raio = new THREE.Raycaster();
  var ponteiroNdc = new THREE.Vector2();
  var planoChao = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var pontoChao = new THREE.Vector3();

  // Aponta o raycaster para a posição de tela informada.
  function mirarPonteiro(clientX, clientY) {
    var palco = el('#stage');
    if (!palco || !camera) return false;
    var r = palco.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    ponteiroNdc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ponteiroNdc.y = -((clientY - r.top) / r.height) * 2 + 1;
    raio.setFromCamera(ponteiroNdc, camera);
    return true;
  }

  // Ponto do chão (y = 0) sob o ponteiro. Devolve um vetor reutilizado:
  // use o resultado imediatamente, não guarde referência.
  function pontoNoChao(clientX, clientY) {
    if (!mirarPonteiro(clientX, clientY)) return null;
    return raio.ray.intersectPlane(planoChao, pontoChao) ? pontoChao : null;
  }

  // Primeiro objeto intersectado de uma lista, ou null
  function objetoEm(clientX, clientY, lista) {
    if (!lista || !lista.length) return null;
    if (!mirarPonteiro(clientX, clientY)) return null;
    var acertos = raio.intersectObjects(lista, true);
    return acertos.length ? acertos[0].object : null;
  }

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

  // Cria a malha do bloco enriquecida com detalhes 3D de terreno
  function criarMalhaBlocoTerreno(b, geo) {
    var grupo = new THREE.Group();
    var matAjustes = {};
    if (b.umidade > 0.55 && !b.bloqueado) {
      // Solo úmido com brilho e reflexo aquoso
      matAjustes = { roughness: 0.42, metalness: 0.12 };
    } else if (b.poluicao > 0.45 && !b.bloqueado) {
      matAjustes = { roughness: 0.95, metalness: 0.08 };
    }
    var baseMesh = new THREE.Mesh(geo, materialBase(corDoSolo(b), 'soil', matAjustes));
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = !b.bloqueado;
    grupo.add(baseMesh);

    // Detalhes 3D específicos por tipo de terreno
    // (bloco de mata nativa usa só a cor verde PAL.mata — sem capa nem flores)
    if (!b.bloqueado && b.fertilidade > 0.6 && b.poluicao < 0.3 && !b.nativo) {
      // Sulcos de terra arada para plantio (furrows agrícolas)
      for (var s = -1; s <= 1; s++) {
        var sulco = new THREE.Mesh(
          new THREE.BoxGeometry(TILE * 0.9, 0.035, 0.14),
          materialBase(0x4a3420, 'soil', { roughness: 0.92 })
        );
        sulco.position.set(0, 0.16, s * 0.28);
        sulco.receiveShadow = true;
        sulco.castShadow = true;
        grupo.add(sulco);
      }
    } else if (!b.bloqueado && b.poluicao > 0.45) {
      // Mancha de resíduos tóxicos e sucata
      var mancha = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.28, 0.02, 7),
        materialBase(0x32283a, null, { roughness: 0.6, metalness: 0.2 })
      );
      mancha.position.y = 0.155;
      grupo.add(mancha);
    }

    grupo.userData.bloco = b;
    grupo.userData.baseMesh = baseMesh;
    return grupo;
  }

  // ===== PERSONAGEM AO EXTREMO (Fazendeiro Estilizado de Alta Fidelidade) =====
  function criarPersonagemExtremo() {
    var grupo = new THREE.Group();

    // Sombra de contato suave no solo
    var sombraGeo = new THREE.CircleGeometry(0.32, 20);
    var sombraMat = new THREE.MeshBasicMaterial({
      color: 0x07150e,
      transparent: true,
      opacity: 0.38,
      depthWrite: false
    });
    var decalSombra = new THREE.Mesh(sombraGeo, sombraMat);
    decalSombra.rotation.x = -Math.PI / 2;
    // Sombra rente aos pés — o grupo fica a y=0.15 (topo do bloco),
    // então o decal vai para y=0.005 local (0.155 no mundo, sem z-fight).
    decalSombra.position.y = 0.005;
    grupo.add(decalSombra);

    // Pivot do tronco (para agachamento, respiração e balanço dinâmico)
    // ALTURA DO RIG: sola fica a -0.455 do corpoPivot
    // (perna -0.14 + sola -0.30 + meia-altura 0.015). Com o grupo no topo do
    // bloco (y=0.15), o corpoPivot precisa estar a 0.46 para a sola encostar
    // no chão sem afundar (0.15 + 0.46 - 0.455 = 0.155, ~topo do bloco).
    var ALTURA_CORPO = 0.46;
    var corpoPivot = new THREE.Group();
    corpoPivot.position.y = ALTURA_CORPO;
    grupo.add(corpoPivot);

    // Materiais dedicados e texturizados
    var peleMat = materialBase(0xf6d1b8, null, { roughness: 0.65 });
    var jeansMat = materialBase(0x1d4673, 'fabric', { roughness: 0.82 });
    var camisaMat = materialBase(0xc43b3b, 'fabric', { roughness: 0.76 });
    var camisaEscura = materialBase(0x942727, 'fabric', { roughness: 0.8 });
    var couroMat = materialBase(0x422614, 'bark', { roughness: 0.86 });
    var botaMat = materialBase(0x2a170d, 'bark', { roughness: 0.9 });
    var solaMat = materialBase(0x130a06, null, { roughness: 0.95 });
    var ouroMat = materialBase(0xcca034, 'brushed', { metalness: 0.75, roughness: 0.28 });
    var palhaMat = materialBase(0xddb654, 'brushed', { roughness: 0.82 });
    var bandanaMat = materialBase(0xd83838, null, { roughness: 0.7 });
    var cabeloMat = materialBase(0x382214, null, { roughness: 0.88 });
    var olhoPretoMat = materialBase(0x111111, null, { roughness: 0.2 });
    var olhoBrilhoMat = materialBase(0xffffff, null, { roughness: 0.1 });
    var bochechaMat = materialBase(0xf49288, null, { roughness: 0.6, transparent: true, opacity: 0.65 });
    var fitaMat = materialBase(0x6e1b20, null, { roughness: 0.75 });
    var folhaChapeuMat = materialBase(0x56b038, 'leaf', { roughness: 0.6 });

    // === TORSO & VESTIMENTA ===
    var torso = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.32, 0.22), camisaMat);
    torso.position.y = 0.02;
    corpoPivot.add(torso);

    // Gola da camisa
    var gola = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.24), camisaEscura);
    gola.position.set(0, 0.17, 0.01);
    corpoPivot.add(gola);

    // Lenço / Bandana vermelha no pescoço
    var bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 8), bandanaMat);
    bandana.position.set(0, 0.19, 0);
    var bandanaNo = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 6), bandanaMat);
    bandanaNo.position.set(0, 0.18, 0.12);
    var bandanaPonta = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 5), bandanaMat);
    bandanaPonta.position.set(0.02, 0.13, 0.12);
    bandanaPonta.rotation.z = 0.4;
    corpoPivot.add(bandana, bandanaNo, bandanaPonta);

    // Macacão Jeans (Overalls)
    var macacaoBase = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.23), jeansMat);
    macacaoBase.position.y = -0.07;
    var macacaoBib = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.18, 0.04), jeansMat);
    macacaoBib.position.set(0, 0.04, 0.105);
    var bolso = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, 0.02), materialBase(0x163458, null));
    bolso.position.set(0, 0.02, 0.13);
    var alcaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.24), jeansMat);
    alcaEsq.position.set(-0.1, 0.07, 0);
    var alcaDir = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.24, 0.24), jeansMat);
    alcaDir.position.set(0.1, 0.07, 0);
    var fivelaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.03), ouroMat);
    fivelaEsq.position.set(-0.1, 0.11, 0.115);
    var fivelaDir = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.03), ouroMat);
    fivelaDir.position.set(0.1, 0.11, 0.115);

    // Cinto de couro com fivela
    var cinto = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.04, 0.24), couroMat);
    cinto.position.y = -0.14;
    var fivelaCinto = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.03), ouroMat);
    fivelaCinto.position.set(0, -0.14, 0.125);

    corpoPivot.add(macacaoBase, macacaoBib, bolso, alcaEsq, alcaDir, fivelaEsq, fivelaDir, cinto, fivelaCinto);

    // Mochila / bolsa de sementes nas costas
    var bolsaCostas = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.12), couroMat);
    bolsaCostas.position.set(0, 0.04, -0.14);
    var bolsaAba = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.08, 0.04), materialBase(0x5a341a, null));
    bolsaAba.position.set(0, 0.12, -0.19);
    var mantaRolo = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.25, 8), materialBase(0x5e7552, null));
    mantaRolo.rotation.z = Math.PI / 2;
    mantaRolo.position.set(0, 0.18, -0.15);
    corpoPivot.add(bolsaCostas, bolsaAba, mantaRolo);

    // === CABEÇA & ROSTO ESTILIZADO ===
    var pivotCabeca = new THREE.Group();
    pivotCabeca.position.set(0, 0.32, 0);
    corpoPivot.add(pivotCabeca);

    var cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.24, 0.24), peleMat);
    var orelhaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.05), peleMat);
    orelhaEsq.position.set(-0.14, 0, 0);
    var orelhaDir = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, 0.05), peleMat);
    orelhaDir.position.set(0.14, 0, 0);

    var nariz = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.04, 5), peleMat);
    nariz.rotation.x = Math.PI / 2;
    nariz.position.set(0, -0.01, 0.135);

    var boca = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.02), materialBase(0x8a3a30, null));
    boca.position.set(0, -0.06, 0.125);

    var bochechaEsq = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), bochechaMat);
    bochechaEsq.position.set(-0.08, -0.03, 0.12);
    bochechaEsq.scale.set(1, 0.6, 0.3);
    var bochechaDir = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), bochechaMat);
    bochechaDir.position.set(0.08, -0.03, 0.12);
    bochechaDir.scale.set(1, 0.6, 0.3);

    // Olhos expressivos com brilho de anime
    var criarOlho = function (x) {
      var gOlho = new THREE.Group();
      var socket = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.015), olhoPretoMat);
      var iris = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.04, 0.018), materialBase(0x2f6b48, null));
      iris.position.z = 0.002;
      var brilho = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.016, 0.02), olhoBrilhoMat);
      brilho.position.set(0.01, 0.01, 0.004);
      var sobrancelha = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.02), cabeloMat);
      sobrancelha.position.set(0, 0.036, 0.004);
      sobrancelha.rotation.z = x < 0 ? -0.15 : 0.15;
      gOlho.add(socket, iris, brilho, sobrancelha);
      gOlho.position.set(x, 0.025, 0.125);
      return gOlho;
    };
    var olhoEsq = criarOlho(-0.06);
    var olhoDir = criarOlho(0.06);

    // Cabelo trabalhado (franja estilosa, laterais e nuca)
    var cabeloTopo = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.09, 0.27), cabeloMat);
    cabeloTopo.position.y = 0.11;
    var franjaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.04), cabeloMat);
    franjaEsq.position.set(-0.06, 0.09, 0.13);
    franjaEsq.rotation.z = -0.2;
    var franjaDir = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.04), cabeloMat);
    franjaDir.position.set(0.05, 0.08, 0.13);
    franjaDir.rotation.z = 0.15;
    var costeletaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.06), cabeloMat);
    costeletaEsq.position.set(-0.135, 0.01, 0.06);
    var costeletaDir = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.06), cabeloMat);
    costeletaDir.position.set(0.135, 0.01, 0.06);
    var cabeloNuca = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.06), cabeloMat);
    cabeloNuca.position.set(0, 0.01, -0.12);

    // === CHAPÉU DE PALHA DELUXE ===
    var gChapeu = new THREE.Group();
    gChapeu.position.y = 0.14;
    gChapeu.rotation.x = -0.06;
    var abaChapeu = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.025, 18), palhaMat);
    var bordaAba = new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.015, 6, 18), palhaMat);
    bordaAba.rotation.x = Math.PI / 2;
    var copaChapeu = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.21, 0.14, 14), palhaMat);
    copaChapeu.position.y = 0.07;
    var fitaChapeu = new THREE.Mesh(new THREE.CylinderGeometry(0.212, 0.215, 0.04, 14), fitaMat);
    fitaChapeu.position.y = 0.03;
    var folhaChapeu = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 5), folhaChapeuMat);
    folhaChapeu.position.set(0.19, 0.08, 0.08);
    folhaChapeu.rotation.set(-0.3, 0.2, -0.5);

    gChapeu.add(abaChapeu, bordaAba, copaChapeu, fitaChapeu, folhaChapeu);

    pivotCabeca.add(cabeca, orelhaEsq, orelhaDir, nariz, boca, bochechaEsq, bochechaDir,
                    olhoEsq, olhoDir, cabeloTopo, franjaEsq, franjaDir, costeletaEsq, costeletaDir, cabeloNuca, gChapeu);

    // === BRAÇOS E MÃOS (PIVOTS DE ANIMAÇÃO) ===
    var pivotBracoEsq = new THREE.Group();
    pivotBracoEsq.position.set(-0.21, 0.12, 0);
    var mangaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), camisaMat);
    mangaEsq.position.y = -0.04;
    var dobraMangaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.13), camisaEscura);
    dobraMangaEsq.position.y = -0.11;
    var antebracoEsq = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.09), peleMat);
    antebracoEsq.position.y = -0.18;
    var maoEsq = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), couroMat);
    maoEsq.position.y = -0.27;
    var polegarEsq = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), couroMat);
    polegarEsq.position.set(0.05, -0.26, 0.02);
    pivotBracoEsq.add(mangaEsq, dobraMangaEsq, antebracoEsq, maoEsq, polegarEsq);
    corpoPivot.add(pivotBracoEsq);

    var pivotBracoDir = new THREE.Group();
    pivotBracoDir.position.set(0.21, 0.12, 0);
    var mangaDir = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.12), camisaMat);
    mangaDir.position.y = -0.04;
    var dobraMangaDir = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.13), camisaEscura);
    dobraMangaDir.position.y = -0.11;
    var antebracoDir = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.09), peleMat);
    antebracoDir.position.y = -0.18;
    var maoDir = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), couroMat);
    maoDir.position.y = -0.27;
    var polegarDir = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.03), couroMat);
    polegarDir.position.set(-0.05, -0.26, 0.02);
    var ferramentaMao = new THREE.Group();
    ferramentaMao.position.set(0, -0.27, 0.07);
    pivotBracoDir.add(mangaDir, dobraMangaDir, antebracoDir, maoDir, polegarDir, ferramentaMao);
    corpoPivot.add(pivotBracoDir);

    // === PERNAS E BOTAS (PIVOTS DE ANIMAÇÃO) ===
    var criarPerna = function (x) {
      var pivotPerna = new THREE.Group();
      pivotPerna.position.set(x, -0.14, 0);
      var perna = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.22, 0.13), jeansMat);
      perna.position.y = -0.1;
      var barraCalca = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.04, 0.145), materialBase(0x285f94, null));
      barraCalca.position.y = -0.2;
      var botaCano = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.15), botaMat);
      botaCano.position.set(0, -0.24, 0.01);
      var botaBico = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.19), botaMat);
      botaBico.position.set(0, -0.27, 0.03);
      var sola = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.21), solaMat);
      sola.position.set(0, -0.3, 0.03);
      pivotPerna.add(perna, barraCalca, botaCano, botaBico, sola);
      return pivotPerna;
    };

    var pivotPernaEsq = criarPerna(-0.09);
    var pivotPernaDir = criarPerna(0.09);
    corpoPivot.add(pivotPernaEsq, pivotPernaDir);

    // Lanterna de cinto para navegação noturna aconchegante
    var lanternaLuz = new THREE.PointLight(0xffdf90, 0, 8.5, 2.2);
    lanternaLuz.position.set(0, 0.5, 0);
    grupo.add(lanternaLuz);

    // Sombras em todos os meshes
    grupo.traverse(function (c) {
      if (c.isMesh && c !== decalSombra) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });

    fazPartes = {
      root: grupo,
      corpoPivot: corpoPivot,
      cabeca: pivotCabeca,
      pernaEsq: pivotPernaEsq,
      pernaDir: pivotPernaDir,
      bracoEsq: pivotBracoEsq,
      bracoDir: pivotBracoDir,
      ferramentaMao: ferramentaMao,
      sombra: decalSombra,
      chapeuFolha: folhaChapeu,
      lanterna: lanternaLuz
    };

    return grupo;
  }

  function montarCena() {
    var palco = el('#stage');
    cena = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 140);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;

    // ATIVAR SOMBRAS SUAVES E MAPEAMENTO DE TOM
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

    // PLANALTO AGRÍCOLA MULTICAMADA (Ilha elevada com falésias de terra e pedra)
    var tamanhoBase = D.GRADE * STEP + 14;
    var basePlanalto = new THREE.Mesh(
      new THREE.BoxGeometry(tamanhoBase, 0.5, tamanhoBase),
      materialBase(0x56783d, 'soil', { roughness: 0.92 })
    );
    basePlanalto.position.y = -0.26;
    basePlanalto.receiveShadow = true;
    tabuleiro.add(basePlanalto);

    var baseSubsolo = new THREE.Mesh(
      new THREE.BoxGeometry(tamanhoBase + 3.5, 0.9, tamanhoBase + 3.5),
      materialBase(0x6b5a45, 'bark', { roughness: 0.96 })
    );
    baseSubsolo.position.y = -0.85;
    baseSubsolo.receiveShadow = true;
    tabuleiro.add(baseSubsolo);

    var baseRocha = new THREE.Mesh(
      new THREE.BoxGeometry(tamanhoBase + 7, 1.4, tamanhoBase + 7),
      materialBase(0x52524e, 'brushed', { roughness: 0.98 })
    );
    baseRocha.position.y = -1.8;
    baseRocha.receiveShadow = true;
    tabuleiro.add(baseRocha);

    // ===== DECORAÇÃO DO MAPA =====
    montarDecoracoes();

    malhaSelecao = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE * 1.04, TILE * 1.04),
      new THREE.MeshBasicMaterial({ color: 0xbfe6c6, transparent: true, opacity: 0.32, depthWrite: false })
    );
    malhaSelecao.rotation.x = -Math.PI / 2;
    malhaSelecao.position.y = 0.17;
    malhaSelecao.visible = false;
    tabuleiro.add(malhaSelecao);

    // ===== CRIAR PERSONAGEM DE ALTA FIDELIDADE =====
    var grupo = criarPersonagemExtremo();
    // Nasce em pé no topo do bloco central (evita spawn "enterrado"/flutuando)
    grupo.position.set(0, ALTURA_CHAO, 0);
    fisica.velocidade.set(0, 0, 0);
    fisica.velocidadeY = 0;
    fisica.noChao = true;
    tabuleiro.add(grupo);
    malhaFazendeiro = grupo;
    atualizarFerramentaMao();

    // ILUMINAÇÃO AVANÇADA (Sol direcional com sombras suaves, cúpula celeste e luar)
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

  // ===== FUNCAO PARA CRIAR ARVORES DECORATIVAS =====
  function criarArvore(x, z, escala) {
    var g = new THREE.Group();
    var alturaVariacao = 0.8 + Math.random() * 0.6;
    
    // Tronco
    var tronco = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15 * escala, 0.2 * escala, 1.2 * alturaVariacao * escala, 8),
      materialBase(0x5a4530, 'bark', { roughness: 0.95 })
    );
    tronco.position.y = 0.6 * alturaVariacao * escala;
    tronco.castShadow = true;
    tronco.receiveShadow = true;
    g.add(tronco);
    
    // Copa - 3 níveis
    var cores = [0x2f5a2a, 0x3f6a3a, 0x4f7a3a];
    for (var i = 0; i < 3; i++) {
      var copa = new THREE.Mesh(
        new THREE.ConeGeometry(0.8 * escala * (1 - i * 0.2), 0.9 * escala, 8),
        materialBase(cores[i], 'leaf', { roughness: 0.85 })
      );
      copa.position.y = (1.0 + i * 0.5) * alturaVariacao * escala;
      copa.castShadow = true;
      copa.receiveShadow = true;
      g.add(copa);
    }
    
    g.position.set(x, 0, z);
    
    // Marcar como cortável
    g.userData.podeCortar = true;
    g.userData.tipo = 'arvore';
    
    // Adicionar colisão
    obstaculos.push({
      pos: new THREE.Vector3(x, 0, z),
      raio: 0.4 * escala,
      altura: 2.5 * escala,
      arvore: g // referência para poder remover
    });
    
    return g;
  }

  // ===== FUNCAO PARA CRIAR FLORES =====
  function criarFlor(x, z) {
    var g = new THREE.Group();
    
    // Caule
    var caule = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.015, 0.15, 4),
      materialBase(0x4a6a3a, null, { roughness: 0.8 })
    );
    caule.position.y = 0.075;
    g.add(caule);
    
    // Flor
    var coresFlores = [0xff6b9d, 0xffaa33, 0xff3366, 0xaa66ff, 0x66aaff, 0xffff66];
    var cor = coresFlores[Math.floor(Math.random() * coresFlores.length)];
    
    for (var i = 0; i < 5; i++) {
      var petala = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 6, 6),
        materialBase(cor, null, { roughness: 0.4 })
      );
      var angulo = (i / 5) * Math.PI * 2;
      petala.position.set(
        Math.cos(angulo) * 0.03,
        0.16,
        Math.sin(angulo) * 0.03
      );
      petala.scale.set(1, 0.3, 0.6);
      g.add(petala);
    }
    
    // Centro
    var centro = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 6, 6),
      materialBase(0xffdd44, null, { roughness: 0.3 })
    );
    centro.position.y = 0.16;
    g.add(centro);
    
    g.position.set(x, 0, z);
    return g;
  }

  // ===== FUNCAO PARA CRIAR ROCHAS =====
  function criarRocha(x, z, escala) {
    var g = new THREE.Group();
    
    // Criar rocha irregular
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
        z2 * (0.8 + Math.random() * 0.4)
      );
    }
    geo.computeVertexNormals();
    
    var rocha = new THREE.Mesh(
      geo,
      materialBase(0x6a6a5a, 'brushed', { roughness: 0.95, metalness: 0.05 })
    );
    rocha.position.y = 0.15 * escala;
    rocha.rotation.set(
      Math.random() * 0.5,
      Math.random() * Math.PI * 2,
      Math.random() * 0.5
    );
    rocha.castShadow = true;
    rocha.receiveShadow = true;
    g.add(rocha);
    
    g.position.set(x, 0, z);
    
    // Adicionar colisão
    obstaculos.push({
      pos: new THREE.Vector3(x, 0, z),
      raio: 0.35 * escala,
      altura: 0.5 * escala
    });
    
    return g;
  }

  // ===== FUNCAO PARA CRIAR MONTANHAS =====
  function criarMontanha(x, z, largura, altura) {
    var g = new THREE.Group();
    
    // Base da montanha
    var base = new THREE.Mesh(
      new THREE.ConeGeometry(largura, altura, 8),
      materialBase(0x7a8a6a, 'brushed', { roughness: 0.92 })
    );
    base.position.y = altura / 2;
    base.castShadow = true;
    base.receiveShadow = true;
    g.add(base);
    
    // Camada de pedra
    var pedra = new THREE.Mesh(
      new THREE.ConeGeometry(largura * 0.7, altura * 0.4, 8),
      materialBase(0x8a8a7a, 'brushed', { roughness: 0.95 })
    );
    pedra.position.y = altura * 0.7;
    pedra.castShadow = true;
    g.add(pedra);
    
    // Pico nevado (opcional)
    if (altura > 8) {
      var neve = new THREE.Mesh(
        new THREE.ConeGeometry(largura * 0.3, altura * 0.25, 8),
        materialBase(0xf0f0f0, null, { roughness: 0.6 })
      );
      neve.position.y = altura * 0.9;
      neve.castShadow = true;
      g.add(neve);
    }
    
    g.position.set(x, 0, z);
    return g;
  }

  // ===== FUNCAO PARA CRIAR ARBUSTOS =====
  function criarArbusto(x, z) {
    var g = new THREE.Group();
    
    // 3-5 moitas
    var numMoitas = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < numMoitas; i++) {
      var moita = new THREE.Mesh(
        new THREE.SphereGeometry(0.15 + Math.random() * 0.1, 6, 6),
        materialBase(0x5a8a4a, 'leaf', { roughness: 0.88 })
      );
      moita.position.set(
        (Math.random() - 0.5) * 0.3,
        0.12,
        (Math.random() - 0.5) * 0.3
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
    var matPoste = materialBase(0x6e4a2c, 'bark', { roughness: 0.95 });
    var matTrilho = materialBase(0x825c38, 'bark', { roughness: 0.92 });
    var limite = (D.GRADE * STEP) / 2 + 0.55;
    var passo = 1.25;
    var altPoste = 0.52;
    var rPoste = 0.05;

    function addPoste(px, pz) {
      var p = new THREE.Mesh(
        new THREE.CylinderGeometry(rPoste * 0.9, rPoste, altPoste, 6),
        matPoste
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
        matTrilho
      );
      trilho.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      trilho.rotation.y = ang;
      trilho.castShadow = true;
      trilho.receiveShadow = true;
      g.add(trilho);
    }

    var coords = [];
    for (var c = -limite; c <= limite + 0.01; c += passo) coords.push(c);

    // Norte e Sul
    for (var i = 0; i < coords.length; i++) {
      var cx = coords[i];
      if (Math.abs(cx) < 1.3) continue; // abertura do portão
      addPoste(cx, -limite);
      addPoste(cx, limite);
      if (i < coords.length - 1 && Math.abs(coords[i + 1]) >= 1.3 && !(cx < -1.3 && coords[i + 1] > -1.3)) {
        addTrilho(cx, -limite, coords[i + 1], -limite, 0.22);
        addTrilho(cx, -limite, coords[i + 1], -limite, 0.42);
        addTrilho(cx, limite, coords[i + 1], limite, 0.22);
        addTrilho(cx, limite, coords[i + 1], limite, 0.42);
      }
    }

    // Leste e Oeste
    for (var j = 0; j < coords.length; j++) {
      var cz = coords[j];
      if (Math.abs(cz) < 1.3) continue; // abertura do portão
      addPoste(-limite, cz);
      addPoste(limite, cz);
      if (j < coords.length - 1 && Math.abs(coords[j + 1]) >= 1.3 && !(cz < -1.3 && coords[j + 1] > -1.3)) {
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
      opacity: 0.82
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
          (Math.random() - 0.5) * 0.8
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
        z + (Math.random() - 0.5) * 0.3
      );
      p.userData = {
        vida: 0.8 + Math.random() * 0.4,
        velocidade: 0.8 + Math.random() * 0.6,
        vx: (Math.random() - 0.5) * 1.6,
        vz: (Math.random() - 0.5) * 1.6
      };
      tabuleiro.add(p);
      modoConstrucao.particulas.push(p);
    }
  }

  function cortarArvore(arvore) {
    if (!arvore) return;
    animarGolpeFerramenta('machado');
    var pos = arvore.position;
    criarEfeitoCorte(pos.x, pos.y + 0.6, pos.z);

    obstaculos = obstaculos.filter(function (obs) {
      return obs.arvore !== arvore;
    });

    discardarObjeto(arvore);

    estado.dinheiro += 20;
    C.ganharXp(estado, 15);
    aviso('Arvore cortada com sucesso! +$20 e +15 XP.', false);
    atualizarUI();
    C.salvar(estado);
  }

  function animarGolpeFerramenta(tipo) {
    animacaoAcao.ativa = true;
    animacaoAcao.tempo = 0;
    animacaoAcao.duracao = 0.3;
    animacaoAcao.tipo = tipo || (estado ? estado.ferramenta : 'machado');
  }

  function criarPoeiraPasso(x, z) {
    if (particulasPoeira.length > 25) return;
    var matPoeira = new THREE.MeshBasicMaterial({
      color: 0xc8b898,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    var p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 4), matPoeira);
    p.position.set(x + (Math.random() - 0.5) * 0.12, 0.03, z + (Math.random() - 0.5) * 0.12);
    p.userData = { vida: 0.35, maxVida: 0.35, vy: 0.2 + Math.random() * 0.15 };
    tabuleiro.add(p);
    particulasPoeira.push(p);
  }

  // ===== FUNCAO PRINCIPAL PARA MONTAR DECORACOES =====
  function montarDecoracoes() {
    obstaculos = obstaculos.filter(function (obs) { return !obs.construcao; });

    // Cerca de madeira circundando o perímetro da fazenda
    grupoDecoracoes.add(criarCercaPerimetro());

    // Nuvens estilizadas flutuando suavemente no céu
    cena.add(criarNuvensCeu());

    var bordaFazenda = (D.GRADE * STEP) / 2 + 1.2; // 10.2
    var raioMapa = bordaFazenda + 7; // 17.2
    var distanciaMontanha = raioMapa + 10; // 27.2

    // === MONTANHAS AO REDOR (8 montanhas imponentes) ===
    var angulosMontanha = [0, 45, 90, 135, 180, 225, 270, 315];
    angulosMontanha.forEach(function (angulo) {
      var rad = angulo * Math.PI / 180;
      var x = Math.cos(rad) * distanciaMontanha;
      var z = Math.sin(rad) * distanciaMontanha;
      var altura = 12 + Math.random() * 9;
      var largura = 7 + Math.random() * 5;
      grupoDecoracoes.add(criarMontanha(x, z, largura, altura));
    });

    // === COLINAS SECUNDÁRIAS (16 colinas) ===
    for (var i = 0; i < 16; i++) {
      var angulo = (i / 16) * Math.PI * 2 + Math.random() * 0.25;
      var distancia = raioMapa + 4 + Math.random() * 8;
      var x = Math.cos(angulo) * distancia;
      var z = Math.sin(angulo) * distancia;
      var altura = 5 + Math.random() * 6;
      var largura = 4 + Math.random() * 3;
      grupoDecoracoes.add(criarMontanha(x, z, largura, altura));
    }

    // === BOSQUE EXTERNO DE ÁRVORES (50 árvores na orla externa) ===
    var numArvores = 50 + Math.floor(Math.random() * 12);
    for (var a = 0; a < numArvores; a++) {
      var ang = Math.random() * Math.PI * 2;
      var dist = bordaFazenda + 1.2 + Math.random() * 6.5;
      var ax = Math.cos(ang) * dist;
      var az = Math.sin(ang) * dist;
      var escala = 0.65 + Math.random() * 0.75;
      grupoDecoracoes.add(criarArvore(ax, az, escala));
    }

    // === ROCHAS NO PERÍMETRO EXTERNO (25 rochas) ===
    for (var r = 0; r < 25; r++) {
      var rang = Math.random() * Math.PI * 2;
      var rdist = bordaFazenda + 1.0 + Math.random() * 5.5;
      var rx = Math.cos(rang) * rdist;
      var rz = Math.sin(rang) * rdist;
      var rescala = 0.7 + Math.random() * 1.1;
      grupoDecoracoes.add(criarRocha(rx, rz, rescala));
    }

    // === ARBUSTOS NO PERÍMETRO (35 arbustos) ===
    for (var b = 0; b < 35; b++) {
      var bang = Math.random() * Math.PI * 2;
      var bdist = bordaFazenda + 0.6 + Math.random() * 5.0;
      var bx = Math.cos(bang) * bdist;
      var bz = Math.sin(bang) * bdist;
      grupoDecoracoes.add(criarArbusto(bx, bz));
    }

    // === FLORES SILVESTRES NO PERÍMETRO (90 flores coloridas) ===
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
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    chuva = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xa8c8d8, size: 0.07, transparent: true, opacity: 0.8
    }));
    chuva.visible = false;
    tabuleiro.add(chuva);
  }

  var _camAlvoX = 0, _camAlvoZ = 0, _camAlvoY = 0;

  function ajustarCamera(az, pol, dist, dt) {
    var alvoX = 0, alvoY = 0, alvoZ = 0;
    if (malhaFazendeiro && (!livre || !livre.ligado)) {
      alvoX = malhaFazendeiro.position.x;
      alvoY = malhaFazendeiro.position.y;
      alvoZ = malhaFazendeiro.position.z;
    }
    // Câmera com lag suave — segue o fazendeiro com interpolação
    var vel = dt ? Math.min(1, 8 * dt) : 1;
    _camAlvoX += (alvoX - _camAlvoX) * vel;
    _camAlvoY += (alvoY - _camAlvoY) * vel * 0.6; // Y mais lento para sentir o pulo
    _camAlvoZ += (alvoZ - _camAlvoZ) * vel;
    camera.position.set(
      _camAlvoX + dist * Math.sin(pol) * Math.sin(az),
      dist * Math.cos(pol) + _camAlvoY * 0.4,
      _camAlvoZ + dist * Math.sin(pol) * Math.cos(az)
    );
    camera.lookAt(_camAlvoX, _camAlvoY * 0.4, _camAlvoZ);
  }

  function atualizarFerramentaMao() {
    if (!fazPartes.ferramentaMao || !estado) return;
    // Limpa a ferramenta atual
    fazPartes.ferramentaMao.clear();
    
    // Adiciona a ferramenta selecionada
    var ferramenta = estado.ferramenta;
    var tool = null;
    
    if (ferramenta === 'enxada') {
      tool = construirEnxada();
      tool.scale.set(0.5, 0.5, 0.5);
    } else if (ferramenta === 'regador') {
      tool = construirRegador();
      tool.scale.set(0.4, 0.4, 0.4);
    } else if (ferramenta === 'machado') {
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
    girassol: { altura: 0.65, folhas: 5, cor: 0xe8b73c, flor: true }
  };

  function malhaDoCultivo(cultivo) {
    var cultura = D.CULTURAS[cultivo.id];
    var forma = FORMA_CULTURA[cultivo.id] || { altura: 0.38, folhas: 5, cor: cultura.cor };
    var pronto = cultivo.pronto;
    var avanco = Math.min(1, cultivo.progresso / cultura.dias);
    var altura = pronto ? forma.altura : forma.altura * (0.35 + avanco * 0.65);

    var g = new THREE.Group();
    g.userData.cultivoId = cultivo.id;

    if (cultivo.id === 'girassol') {
      // Girassol realista com caule forte, folhas largas e flor com pétalas e miolo escuro
      var cauleG = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.045, altura, 7),
        materialBase(0x4a7a3a, 'bark', { roughness: 0.85 })
      );
      cauleG.position.y = altura / 2 + 0.15;
      cauleG.castShadow = true;
      g.add(cauleG);

      // Folhas largas em pares
      for (var f = 0; f < 4; f++) {
        var angF = (f * Math.PI) / 2 + 0.3;
        var folhaG = new THREE.Mesh(
          new THREE.BoxGeometry(0.18 * avanco, 0.02, 0.12 * avanco),
          materialBase(0x3e7534, 'leaf', { roughness: 0.75 })
        );
        folhaG.position.set(Math.cos(angF) * 0.08, 0.15 + altura * (0.2 + f * 0.2), Math.sin(angF) * 0.08);
        folhaG.rotation.set(0.3, -angF, 0.2);
        folhaG.castShadow = true;
        g.add(folhaG);
      }

      if (pronto || avanco > 0.5) {
        // Flor grande virada ligeiramente para o sol
        var gFlor = new THREE.Group();
        gFlor.position.set(0, altura + 0.16, 0.04);
        gFlor.rotation.x = 0.25;

        // Miolo escuro de sementes
        var miolo = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.08, 0.03, 12),
          materialBase(0x4a2e12, null, { roughness: 0.9 })
        );
        miolo.rotation.x = Math.PI / 2;
        gFlor.add(miolo);

        // Coroa de pétalas amarelas radiantes
        var numPetalas = 12;
        for (var p = 0; p < numPetalas; p++) {
          var angP = (p / numPetalas) * Math.PI * 2;
          var petala = new THREE.Mesh(
            new THREE.ConeGeometry(0.03, 0.1, 4),
            materialBase(0xf2ba24, null, { roughness: 0.4 })
          );
          petala.position.set(Math.cos(angP) * 0.1, Math.sin(angP) * 0.1, -0.01);
          petala.rotation.z = angP - Math.PI / 2;
          gFlor.add(petala);
        }
        gFlor.castShadow = true;
        g.add(gFlor);
      }
    } else if (cultivo.id === 'milho') {
      // Milharal com múltiplos colmos e espigas douradas
      for (var colmo = -1; colmo <= 1; colmo += 2) {
        var xOffset = colmo * 0.08;
        var cauleM = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.035, altura, 6),
          materialBase(pronto ? 0x8a9e42 : 0x5a8f36, null, { roughness: 0.85 })
        );
        cauleM.position.set(xOffset, altura / 2 + 0.15, 0);
        cauleM.castShadow = true;
        g.add(cauleM);

        // Folhas arqueadas compridas
        for (var i = 0; i < 4; i++) {
          var ang = (i * Math.PI) / 2 + colmo * 0.4;
          var folhaM = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.014, 0.08),
            materialBase(0x4c8732, 'leaf', { roughness: 0.75 })
          );
          folhaM.position.set(xOffset + Math.cos(ang) * 0.12, 0.15 + altura * (0.3 + i * 0.18), Math.sin(ang) * 0.12);
          folhaM.rotation.set(0.5, -ang, 0.3);
          folhaM.castShadow = true;
          g.add(folhaM);
        }

        if (pronto) {
          // Espiga de milho dourada com palha protetora
          var espiga = new THREE.Mesh(
            new THREE.CylinderGeometry(0.035, 0.04, 0.14, 8),
            materialBase(0xe0b234, null, { roughness: 0.45 })
          );
          espiga.position.set(xOffset + 0.06, altura * 0.65 + 0.15, 0.04);
          espiga.rotation.z = -0.35;
          espiga.castShadow = true;
          g.add(espiga);
        }
      }
    } else if (cultivo.id === 'trigo') {
      // Tufo denso de trigo dourado
      for (var t = 0; t < 5; t++) {
        var angT = (t / 5) * Math.PI * 2;
        var rT = 0.08;
        var cauleT = new THREE.Mesh(
          new THREE.CylinderGeometry(0.012, 0.018, altura, 5),
          materialBase(pronto ? 0xdcc072 : 0x7da84a, null, { roughness: 0.85 })
        );
        cauleT.position.set(Math.cos(angT) * rT, altura / 2 + 0.15, Math.sin(angT) * rT);
        cauleT.rotation.z = Math.sin(angT) * 0.08;
        cauleT.castShadow = true;
        g.add(cauleT);

        if (pronto) {
          // Espiga farta de grãos
          var espigaT = new THREE.Mesh(
            new THREE.ConeGeometry(0.03, 0.12, 6),
            materialBase(0xcca044, null, { roughness: 0.6 })
          );
          espigaT.position.set(Math.cos(angT) * rT, altura + 0.16, Math.sin(angT) * rT);
          espigaT.rotation.z = Math.sin(angT) * 0.15;
          g.add(espigaT);
        }
      }
    } else {
      // Modelo genérico aprimorado (soja, hortaliça, feijão)
      var caule = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.035, altura, 6),
        materialBase(pronto ? 0x7fa248 : 0x5a8a42, null, { roughness: 0.85 })
      );
      caule.position.y = altura / 2 + 0.15;
      caule.castShadow = true;
      g.add(caule);

      var folhas = Math.max(2, Math.round(forma.folhas * (pronto ? 1 : avanco)));
      for (var k = 0; k < folhas; k++) {
        var angK = (k / folhas) * Math.PI * 2;
        var folha = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.015, 0.09),
          materialBase(forma.cor, 'leaf', { roughness: 0.75 })
        );
        folha.position.set(Math.cos(angK) * 0.09, 0.15 + altura * (0.3 + 0.5 * (k / folhas)), Math.sin(angK) * 0.09);
        folha.rotation.set(0.4, -angK, 0.2);
        folha.castShadow = true;
        g.add(folha);
      }
    }

    return g;
  }

  function roda(raio, largura, corPneu, corAro) {
    var g = new THREE.Group();
    // Pneu de borracha texturizada
    var pneu = new THREE.Mesh(
      new THREE.CylinderGeometry(raio, raio, largura, 16),
      materialBase(corPneu || 0x1d1d1d, null, { roughness: 0.92, metalness: 0.05 })
    );
    pneu.rotation.z = Math.PI / 2;
    pneu.castShadow = true;
    pneu.receiveShadow = true;
    // Calota / aro central
    var aro = new THREE.Mesh(
      new THREE.CylinderGeometry(raio * 0.6, raio * 0.6, largura * 1.05, 12),
      materialBase(corAro || 0xd4a742, 'brushed', { metalness: 0.65, roughness: 0.35 })
    );
    aro.rotation.z = Math.PI / 2;
    // Cubo central do eixo
    var cubo = new THREE.Mesh(
      new THREE.CylinderGeometry(raio * 0.22, raio * 0.22, largura * 1.15, 8),
      materialBase(0x333333, 'brushed', { metalness: 0.8, roughness: 0.2 })
    );
    cubo.rotation.z = Math.PI / 2;
    g.add(pneu, aro, cubo);
    return g;
  }

  function caixaDe(cor, w, h, d, textura, y) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materialBase(cor, textura));
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // ===== VEÍCULOS DE ALTA FIDELIDADE (Trator Antigo & Trator Elétrico) =====
  function construirVeiculo(cor, eletrico) {
    var g = new THREE.Group();

    if (!eletrico) {
      // === TRATOR ANTIGO CLÁSSICO ===
      // Chassi robusto
      var chassi = caixaDe(0x282c2e, 0.36, 0.12, 0.62, 'brushed', 0.14);
      g.add(chassi);

      // Capô cônico do motor em metal rústico
      var capo = caixaDe(cor || 0x8a3a2a, 0.32, 0.2, 0.36, 'brushed', 0.28);
      capo.position.z = 0.12;
      // Grade frontal do radiador com acabamento cromado
      var grade = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.18, 0.03),
        materialBase(0x8a9296, 'brushed', { metalness: 0.7, roughness: 0.35 })
      );
      grade.position.set(0, 0.28, 0.31);
      // Faróis redondos com lentes emissivas brilhantes
      var farolEsq = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        materialBase(0xfff6c0, null, { emissive: 0xffe488, emissiveIntensity: 0.85 })
      );
      farolEsq.position.set(-0.13, 0.32, 0.31);
      var farolDir = farolEsq.clone();
      farolDir.position.x = 0.13;
      g.add(capo, grade, farolEsq, farolDir);

      // Chaminé de escapamento vertical alta com tampa corta-fagulha
      var escapamento = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.024, 0.38, 8),
        materialBase(0x3d4044, 'brushed', { metalness: 0.75, roughness: 0.4 })
      );
      escapamento.position.set(-0.12, 0.48, 0.18);
      var tampaEscape = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.015, 8),
        materialBase(0x222222, null, { metalness: 0.8 })
      );
      tampaEscape.position.set(-0.12, 0.68, 0.18);
      tampaEscape.rotation.z = 0.35;
      g.add(escapamento, tampaEscape);

      // Posto do motorista: assento acolchoado e volante
      var assento = caixaDe(0x1a1a1a, 0.22, 0.08, 0.18, null, 0.32);
      assento.position.z = -0.16;
      var encosto = caixaDe(0x1a1a1a, 0.22, 0.16, 0.04, null, 0.42);
      encosto.position.z = -0.24;
      var colunaVolante = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.18, 6),
        materialBase(0x444444, 'brushed')
      );
      colunaVolante.position.set(0, 0.36, -0.04);
      colunaVolante.rotation.x = -0.4;
      var volante = new THREE.Mesh(
        new THREE.TorusGeometry(0.07, 0.012, 6, 12),
        materialBase(0x111111, null, { roughness: 0.5 })
      );
      volante.position.set(0, 0.44, -0.07);
      volante.rotation.x = Math.PI / 2 - 0.4;
      g.add(assento, encosto, colunaVolante, volante);

      // Para-lamas curvos sobre as rodas traseiras
      var paralamasEsq = caixaDe(cor || 0x8a3a2a, 0.1, 0.04, 0.34, 'brushed', 0.4);
      paralamasEsq.position.set(-0.21, 0.4, -0.16);
      var paralamasDir = paralamasEsq.clone();
      paralamasDir.position.x = 0.21;
      g.add(paralamasEsq, paralamasDir);

      // 4 RODAS COMPLETAS (Traseiras gigantes tratoradas + Dianteiras direcionais)
      var rodaTraseiraEsq = roda(0.18, 0.09, 0x1d1d1d, 0xcca034);
      rodaTraseiraEsq.position.set(-0.22, 0.18, -0.16);
      var rodaTraseiraDir = roda(0.18, 0.09, 0x1d1d1d, 0xcca034);
      rodaTraseiraDir.position.set(0.22, 0.18, -0.16);
      var rodaDianteiraEsq = roda(0.1, 0.06, 0x1d1d1d, 0xcca034);
      rodaDianteiraEsq.position.set(-0.19, 0.1, 0.18);
      var rodaDianteiraDir = roda(0.1, 0.06, 0x1d1d1d, 0xcca034);
      rodaDianteiraDir.position.set(0.19, 0.1, 0.18);
      g.add(rodaTraseiraEsq, rodaTraseiraDir, rodaDianteiraEsq, rodaDianteiraDir);

      // Engate traseiro com relha de arado duplo em aço
      var engate = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.04, 0.14),
        materialBase(0x444444, 'brushed', { metalness: 0.8 })
      );
      engate.position.set(0, 0.12, -0.34);
      var aradoLaminaEsq = new THREE.Mesh(
        new THREE.ConeGeometry(0.07, 0.16, 4),
        materialBase(0x8a9296, 'brushed', { metalness: 0.85, roughness: 0.25 })
      );
      aradoLaminaEsq.rotation.set(-0.5, 0, 0.4);
      aradoLaminaEsq.position.set(-0.09, 0.06, -0.4);
      var aradoLaminaDir = aradoLaminaEsq.clone();
      aradoLaminaDir.position.x = 0.09;
      aradoLaminaDir.rotation.z = -0.4;
      g.add(engate, aradoLaminaEsq, aradoLaminaDir);

    } else {
      // === TRATOR ELÉTRICO ECO-MODERNO ===
      // Carroceria aerodinâmica verde-esmeralda pérola
      var chassiE = caixaDe(0x1e3630, 0.38, 0.14, 0.64, 'brushed', 0.14);
      var carroceria = caixaDe(0x2da882, 0.34, 0.18, 0.42, 'brushed', 0.26);
      carroceria.position.z = 0.08;

      // Cockpit panorâmico em bolha de vidro translúcido
      var cabineVidro = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.2, 0.26),
        materialBase(0x88dcf4, null, { transparent: true, opacity: 0.5, metalness: 0.2, roughness: 0.15 })
      );
      cabineVidro.position.set(0, 0.42, -0.06);

      // Painel solar integrado no teto da cabine
      var tetoSolar = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.02, 0.24),
        materialBase(0x184872, 'solar', { metalness: 0.6, roughness: 0.2 })
      );
      tetoSolar.position.set(0, 0.53, -0.06);

      // Barra frontal de LED contínua futurista
      var lightbar = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.035, 0.02),
        materialBase(0x66ffcc, null, { emissive: 0x44ffaa, emissiveIntensity: 1.0 })
      );
      lightbar.position.set(0, 0.26, 0.3);

      // Núcleo de energia verde visível nas laterais
      var nucleoEsq = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 0.18, 8),
        materialBase(0x00e5ff, null, { emissive: 0x00c8e0, emissiveIntensity: 0.9 })
      );
      nucleoEsq.rotation.x = Math.PI / 2;
      nucleoEsq.position.set(-0.18, 0.22, 0);
      var nucleoDir = nucleoEsq.clone();
      nucleoDir.position.x = 0.18;

      // 4 Rodas futuristas com anéis de neon ciano
      var rodaEEsq = roda(0.17, 0.08, 0x1a2420, 0x33e0aa);
      rodaEEsq.position.set(-0.21, 0.17, -0.16);
      var rodaEDir = roda(0.17, 0.08, 0x1a2420, 0x33e0aa);
      rodaEDir.position.set(0.21, 0.17, -0.16);
      var rodaDFrenteEsq = roda(0.11, 0.06, 0x1a2420, 0x33e0aa);
      rodaDFrenteEsq.position.set(-0.19, 0.11, 0.18);
      var rodaDFrenteDir = roda(0.11, 0.06, 0x1a2420, 0x33e0aa);
      rodaDFrenteDir.position.set(0.19, 0.11, 0.18);

      g.add(chassiE, carroceria, cabineVidro, tetoSolar, lightbar, nucleoEsq, nucleoDir,
            rodaEEsq, rodaEDir, rodaDFrenteEsq, rodaDFrenteDir);
    }

    g.traverse(function (c) {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });
    return g;
  }

  // ===== DRONE QUADCOPTER PROFISSIONAL =====
  function construirDrone() {
    var g = new THREE.Group();

    // Fuselagem central aerodinâmica em fibra de carbono
    var corpo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.13, 0.08, 8),
      materialBase(0x232830, 'brushed', { metalness: 0.6, roughness: 0.35 })
    );
    corpo.position.y = 0.35;
    var domo = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      materialBase(0x3a4855, null, { roughness: 0.4 })
    );
    domo.position.y = 0.39;
    domo.scale.set(1, 0.5, 1);
    g.add(corpo, domo);

    // 4 braços de carbono em X
    var helices = [];
    var hastes = [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]];
    hastes.forEach(function (p, idx) {
      var braco = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.02, 0.025),
        materialBase(0x181c22, 'brushed', { metalness: 0.7 })
      );
      braco.position.set(p[0] / 2, 0.35, p[1] / 2);
      braco.lookAt(0, 0.35, 0);

      // Motor pod na ponta
      var motor = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.045, 8),
        materialBase(0x445566, 'brushed', { metalness: 0.8 })
      );
      motor.position.set(p[0], 0.36, p[1]);

      // Hélice dupla rotativa
      var helice = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.006, 0.028),
        materialBase(0xd8eaf4, null, { roughness: 0.3 })
      );
      helice.position.set(p[0], 0.39, p[1]);
      helices.push(helice);

      // Disco semitransparente de borrão da rotação
      var discoBorrao = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.003, 12),
        materialBase(0x9fc8dc, null, { transparent: true, opacity: 0.45, depthWrite: false })
      );
      discoBorrao.position.set(p[0], 0.39, p[1]);

      // LED indicador de navegação
      var corLed = idx % 2 === 0 ? 0x22ff44 : 0xff2222;
      var led = new THREE.Mesh(
        new THREE.SphereGeometry(0.015, 6, 6),
        materialBase(corLed, null, { emissive: corLed, emissiveIntensity: 1.0 })
      );
      led.position.set(p[0], 0.34, p[1]);

      g.add(braco, motor, helice, discoBorrao, led);
    });

    // Câmera gimbal esférica embaixo da fuselagem
    var gimbal = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 8, 8),
      materialBase(0x111111, null, { roughness: 0.1, metalness: 0.9 })
    );
    gimbal.position.set(0, 0.29, 0.05);

    // Reservatório de sementes / pulverizador ecológico
    var tanqueSementes = new THREE.Mesh(
      new THREE.CylinderGeometry(0.065, 0.055, 0.1, 8),
      materialBase(0x486475, 'brushed', { metalness: 0.4 })
    );
    tanqueSementes.position.set(0, 0.28, -0.03);

    // Trem de pouso duplo tipo esqui
    var esquiEsq = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 0.015, 0.3),
      materialBase(0x222222, null)
    );
    esquiEsq.position.set(-0.1, 0.22, 0);
    var esquiDir = esquiEsq.clone();
    esquiDir.position.x = 0.1;
    var pernaEsqui1 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4), materialBase(0x222222));
    pernaEsqui1.position.set(-0.1, 0.27, 0.08);
    var pernaEsqui2 = pernaEsqui1.clone();
    pernaEsqui2.position.z = -0.08;
    var pernaEsqui3 = pernaEsqui1.clone();
    pernaEsqui3.position.x = 0.1;
    var pernaEsqui4 = pernaEsqui2.clone();
    pernaEsqui4.position.x = 0.1;

    g.add(gimbal, tanqueSementes, esquiEsq, esquiDir, pernaEsqui1, pernaEsqui2, pernaEsqui3, pernaEsqui4);
    g.userData.helices = helices;

    g.traverse(function (c) {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });
    return g;
  }

  // ===== COLHEITADEIRA SOLAR GIGANTE =====
  function construirColheitadeira() {
    var g = new THREE.Group();

    // Chassi principal em tom ouro colheita
    var corpo = caixaDe(0xd97e28, 0.46, 0.28, 0.62, 'brushed', 0.26);
    g.add(corpo);

    // Cabine do operador panorâmica elevada
    var cabine = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.22, 0.26),
      materialBase(0x2a3e4c, null, { roughness: 0.3 })
    );
    cabine.position.set(0, 0.46, 0.12);
    // Vidro da cabine
    var vidro = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.16, 0.08),
      materialBase(0x8cd8f0, null, { transparent: true, opacity: 0.55 })
    );
    vidro.position.set(0, 0.46, 0.24);
    // Faróis de milha no teto
    var barraFarol = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.03, 0.04),
      materialBase(0xfff6c0, null, { emissive: 0xffe488, emissiveIntensity: 0.9 })
    );
    barraFarol.position.set(0, 0.58, 0.24);
    g.add(cabine, vidro, barraFarol);

    // Plataforma de corte frontal com dentes de colheita
    var plataforma = caixaDe(0x8a5220, 0.64, 0.08, 0.16, 'brushed', 0.12);
    plataforma.position.z = 0.42;
    var dentes = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.02, 0.06),
      materialBase(0x9aa4a8, 'brushed', { metalness: 0.8, roughness: 0.3 })
    );
    dentes.position.set(0, 0.1, 0.51);

    // Molinete giratório frontal (carretel que puxa as plantas)
    var molineteEixo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8),
      materialBase(0x333333, 'brushed')
    );
    molineteEixo.rotation.z = Math.PI / 2;
    molineteEixo.position.set(0, 0.22, 0.46);
    // Pás do molinete
    var molinetePas = new THREE.Group();
    for (var m = 0; m < 4; m++) {
      var pa = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.015, 0.06),
        materialBase(0xb86820, 'brushed')
      );
      pa.rotation.x = (m * Math.PI) / 2;
      molinetePas.add(pa);
    }
    molinetePas.position.copy(molineteEixo.position);
    g.add(plataforma, dentes, molineteEixo, molinetePas);
    g.userData.molinete = molinetePas;

    // Tanque graneleiro no topo com grãos dourados
    var graos = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.06, 0.28),
      materialBase(0xd8b64a, 'soil', { roughness: 0.7 })
    );
    graos.position.set(0, 0.42, -0.14);
    g.add(graos);

    // Tubo de descarga basculante lateral comprido
    var tuboDescarga = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.035, 0.48, 8),
      materialBase(0xd97e28, 'brushed')
    );
    tuboDescarga.position.set(-0.28, 0.44, -0.16);
    tuboDescarga.rotation.set(0.3, 0, 0.8);
    g.add(tuboDescarga);

    // 4 Rodas agrícolas pesadas (dianteiras enormes tracionadas e traseiras menores)
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
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });
    return g;
  }

  // ===== FERRAMENTAS MANUAIS DETALHADAS =====
  function construirEnxada() {
    var g = new THREE.Group();
    // Cabo esculpido em nogueira com verniz
    var cabo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.02, 0.65, 8),
      materialBase(0x9a7248, 'bark', { roughness: 0.8 })
    );
    cabo.position.y = 0.32;
    cabo.rotation.z = 0.32;

    // Colar / virola de latão
    var virola = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.04, 8),
      materialBase(0xcca034, 'brushed', { metalness: 0.8, roughness: 0.3 })
    );
    virola.position.set(-0.1, 0.03, 0);
    virola.rotation.z = 0.32;

    // Lâmina curva forjada em aço carbono
    var lamina = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.025, 0.12),
      materialBase(0xa0a8ac, 'brushed', { metalness: 0.85, roughness: 0.3 })
    );
    lamina.position.set(-0.12, 0.015, 0);
    lamina.rotation.z = 0.32;

    g.add(cabo, virola, lamina);
    g.traverse(function (c) { if (c.isMesh) { c.castShadow = true; } });
    return g;
  }

  function construirRegador() {
    var g = new THREE.Group();
    // Corpo metálico vintage verde-azulado
    var corpo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.14, 0.24, 14),
      materialBase(0x3d7888, 'brushed', { metalness: 0.5, roughness: 0.4 })
    );
    corpo.position.y = 0.12;

    // Bico longo afilado com rosa de aspersão em latão
    var bico = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.035, 0.24, 8),
      materialBase(0x3d7888, 'brushed', { metalness: 0.5 })
    );
    bico.position.set(0.15, 0.21, 0);
    bico.rotation.z = -0.92;

    // Rosa do bico perfurada (cabeça perfurada com buraquinhos)
    var rosa = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.03, 0.04, 10),
      materialBase(0xd4a742, 'brushed', { metalness: 0.8, roughness: 0.3 })
    );
    rosa.position.set(0.25, 0.3, 0);
    rosa.rotation.z = -0.92;

    // Alça tubular superior ergonômica
    var alcaTopo = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.014, 6, 14, Math.PI),
      materialBase(0x285562, 'brushed')
    );
    alcaTopo.position.y = 0.24;
    alcaTopo.rotation.x = Math.PI / 2;

    // Alça traseira de despejo
    var alcaTras = new THREE.Mesh(
      new THREE.TorusGeometry(0.07, 0.014, 6, 12, Math.PI),
      materialBase(0x285562, 'brushed')
    );
    alcaTras.position.set(-0.13, 0.14, 0);
    alcaTras.rotation.z = Math.PI / 2;

    g.add(corpo, bico, rosa, alcaTopo, alcaTras);
    g.traverse(function (c) { if (c.isMesh) { c.castShadow = true; } });
    return g;
  }

  function construirMachado() {
    var g = new THREE.Group();
    // Cabo esculpido em nogueira anatômica
    var cabo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.026, 0.68, 8),
      materialBase(0x8a5528, 'bark', { roughness: 0.85 })
    );
    cabo.position.y = 0.34;
    cabo.rotation.z = 0.25;

    // Cabeça do machado em aço forjado polido
    var lamina = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.16, 0.035),
      materialBase(0xadb6bc, 'brushed', { metalness: 0.85, roughness: 0.28 })
    );
    lamina.position.set(-0.09, 0.64, 0);
    lamina.rotation.z = 0.25;

    // Fio afiado cromado
    var fio = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.025, 0.045),
      materialBase(0xe4eaee, 'brushed', { metalness: 0.95, roughness: 0.15 })
    );
    fio.position.set(-0.09, 0.72, 0);
    fio.rotation.z = 0.25;

    g.add(cabo, lamina, fio);
    g.traverse(function (c) { if (c.isMesh) { c.castShadow = true; } });
    return g;
  }

  // ===== SISTEMA DE IRRIGAÇÃO POR GOTEJAMENTO =====
  function construirGotejamento() {
    var g = new THREE.Group();

    // Tubulação principal de polietileno com válvula e manômetro
    var cano1 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.88, 8),
      materialBase(0x283832, 'brushed', { metalness: 0.4, roughness: 0.5 })
    );
    cano1.rotation.z = Math.PI / 2;
    cano1.position.y = 0.14;

    var cano2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.024, 0.88, 8),
      materialBase(0x283832, 'brushed', { metalness: 0.4, roughness: 0.5 })
    );
    cano2.rotation.x = Math.PI / 2;
    cano2.position.y = 0.14;

    // Válvula central reguladora em latão com manômetro
    var valvula = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 8, 8),
      materialBase(0xd4a742, 'brushed', { metalness: 0.75, roughness: 0.3 })
    );
    valvula.position.y = 0.14;
    var manometro = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10),
      materialBase(0xffffff, null, { roughness: 0.3 })
    );
    manometro.position.set(0, 0.19, 0);
    g.add(cano1, cano2, valvula, manometro);

    // 4 micro-gotejadores de precisão com círculos úmidos na base
    for (var i = -1; i <= 1; i += 2) {
      for (var j = -1; j <= 1; j += 2) {
        var bocal = new THREE.Mesh(
          new THREE.ConeGeometry(0.025, 0.06, 6),
          materialBase(0x184838, null)
        );
        bocal.position.set(i * 0.32, 0.11, j * 0.32);
        bocal.rotation.x = Math.PI;

        // Círculo úmido no solo sob o gotejador
        var manchaAgua = new THREE.Mesh(
          new THREE.CircleGeometry(0.09, 8),
          materialBase(0x426858, null, { roughness: 0.3, transparent: true, opacity: 0.75, depthWrite: false })
        );
        manchaAgua.rotation.x = -Math.PI / 2;
        manchaAgua.position.set(i * 0.32, 0.01, j * 0.32);

        g.add(bocal, manchaAgua);
      }
    }
    return g;
  }

  // ===== ESTRUTURAS E ENERGIA LIMPA DE ALTA FIDELIDADE =====
  function malhaDeEstrutura(id) {
    var eq = D.EQUIPAMENTOS[id];
    var en = D.ENERGIA[id];
    var g = new THREE.Group();

    if (id === 'arvore') {
      // Árvore de reflorestamento com raízes expostas e copa multicamada
      var tronco = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.12, 0.45, 8),
        materialBase(0x563e2a, 'bark', { roughness: 0.95 })
      );
      tronco.position.y = 0.22;
      tronco.castShadow = true;

      // Raízes que se fixam na terra
      for (var r = 0; r < 4; r++) {
        var angR = (r / 4) * Math.PI * 2;
        var raiz = new THREE.Mesh(
          new THREE.ConeGeometry(0.04, 0.18, 5),
          materialBase(0x563e2a, 'bark', { roughness: 0.95 })
        );
        raiz.position.set(Math.cos(angR) * 0.11, 0.05, Math.sin(angR) * 0.11);
        raiz.rotation.set(0.6 * Math.sin(angR), 0, -0.6 * Math.cos(angR));
        g.add(raiz);
      }

      // Copa orgânica exuberante com 4 esferas de folhagem interpenetradas
      var copaC = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 12, 10),
        materialBase(0x427c34, 'leaf', { roughness: 0.85 })
      );
      copaC.position.y = 0.65;
      var copaEsq = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 10, 8),
        materialBase(0x528e42, 'leaf', { roughness: 0.85 })
      );
      copaEsq.position.set(-0.14, 0.6, 0.08);
      var copaDir = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 10, 8),
        materialBase(0x386c2e, 'leaf', { roughness: 0.85 })
      );
      copaDir.position.set(0.14, 0.62, -0.06);

      // Frutos silvestres vermelhos na copa
      for (var m = 0; m < 5; m++) {
        var fruto = new THREE.Mesh(
          new THREE.SphereGeometry(0.025, 5, 5),
          materialBase(0xe03838, null, { roughness: 0.4 })
        );
        var angM = (m / 5) * Math.PI * 2;
        fruto.position.set(Math.cos(angM) * 0.22, 0.6 + (m % 2) * 0.08, Math.sin(angM) * 0.22);
        g.add(fruto);
      }

      g.add(tronco, copaC, copaEsq, copaDir);

    } else if (id === 'composteira') {
      // Caixa de compostagem de madeira ripada com ripas visíveis
      var baseCaixa = caixaDe(0x5e4832, 0.42, 0.32, 0.42, 'bark', 0.16);
      // Ripas de madeira nas laterais
      for (var s = 0; s < 3; s++) {
        var ripaF = new THREE.Mesh(
          new THREE.BoxGeometry(0.44, 0.05, 0.02),
          materialBase(0x7a5e42, 'bark', { roughness: 0.9 })
        );
        ripaF.position.set(0, 0.06 + s * 0.1, 0.215);
        g.add(ripaF);
      }

      // Adubo orgânico fértil e restos verdes dentro da caixa
      var adubo = new THREE.Mesh(
        new THREE.BoxGeometry(0.38, 0.12, 0.38),
        materialBase(0x3a2c1e, 'soil', { roughness: 0.95 })
      );
      adubo.position.y = 0.24;

      // Tampa articulada entreaberta com suporte
      var tampa = caixaDe(0x8a6b4a, 0.45, 0.035, 0.45, 'bark', 0.34);
      tampa.rotation.x = -0.35;
      tampa.position.set(0, 0.37, -0.06);

      // Termômetro analógico com mostrador no painel frontal
      var termometro = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.015, 10),
        materialBase(0xffffff, null, { roughness: 0.3 })
      );
      termometro.rotation.x = Math.PI / 2;
      termometro.position.set(0.12, 0.22, 0.225);

      g.add(baseCaixa, adubo, tampa, termometro);

    } else if (id === 'painel') {
      // Painel solar duplo fotovoltaico de alta eficiência
      var suporte = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.03, 0.32, 8),
        materialBase(0x6e7880, 'brushed', { metalness: 0.8, roughness: 0.3 })
      );
      suporte.position.y = 0.16;

      // Estrutura metálica de fixação inclinada
      var moldura = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.04, 0.38),
        materialBase(0x8a9296, 'brushed', { metalness: 0.85, roughness: 0.25 })
      );
      moldura.position.set(0, 0.32, 0);
      moldura.rotation.x = 0.45; // inclinação ideal para o sol

      // Células solares fotovoltaicas com brilho azul anti-reflexo
      var celulas = new THREE.Mesh(
        new THREE.BoxGeometry(0.52, 0.02, 0.34),
        materialBase(0x184278, 'solar', { metalness: 0.6, roughness: 0.15 })
      );
      celulas.position.set(0, 0.335, 0);
      celulas.rotation.x = 0.45;

      // Caixa inversora com LED de operação no poste
      var inversor = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.12, 0.06),
        materialBase(0x3e4850, 'brushed', { metalness: 0.7 })
      );
      inversor.position.set(0, 0.14, 0.04);
      var ledOp = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 6, 6),
        materialBase(0x22ff55, null, { emissive: 0x22ff55, emissiveIntensity: 1.0 })
      );
      ledOp.position.set(0.025, 0.17, 0.075);

      g.add(suporte, moldura, celulas, inversor, ledOp);

    } else if (id === 'turbina') {
      // Turbina eólica aerodinâmica elegante com nacele e rotor de 3 pás
      var torre = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.07, 1.25, 12),
        materialBase(0xe4e8ec, 'brushed', { metalness: 0.6, roughness: 0.3 })
      );
      torre.position.y = 0.625;

      // Porta de manutenção na base
      var porta = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.09, 0.02),
        materialBase(0x606870, 'brushed')
      );
      porta.position.set(0, 0.1, 0.07);

      // Nacele do gerador
      var nacele = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.05, 0.22, 10),
        materialBase(0xe4e8ec, 'brushed', { metalness: 0.6, roughness: 0.3 })
      );
      nacele.rotation.x = Math.PI / 2;
      nacele.position.set(0, 1.25, 0);

      // Nariz cônico do rotor (spinner)
      var spinner = new THREE.Mesh(
        new THREE.ConeGeometry(0.05, 0.09, 10),
        materialBase(0xd0d8e0, 'brushed', { metalness: 0.7 })
      );
      spinner.rotation.x = Math.PI / 2;
      spinner.position.set(0, 1.25, 0.12);

      // Conjunto giratório de 3 pás aerodinâmicas
      var rotorGroup = new THREE.Group();
      rotorGroup.position.set(0, 1.25, 0.13);
      for (var pIdx = 0; pIdx < 3; pIdx++) {
        var angPa = (pIdx / 3) * Math.PI * 2;
        var paEolica = new THREE.Mesh(
          new THREE.BoxGeometry(0.035, 0.42, 0.015),
          materialBase(0xf4f8fa, 'brushed', { metalness: 0.5, roughness: 0.3 })
        );
        paEolica.position.set(Math.sin(angPa) * 0.22, Math.cos(angPa) * 0.22, 0);
        paEolica.rotation.z = -angPa;
        rotorGroup.add(paEolica);
      }

      // Luz estroboscópica de segurança aérea no topo
      var luzTopo = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 6, 6),
        materialBase(0xff2222, null, { emissive: 0xff1111, emissiveIntensity: 0.9 })
      );
      luzTopo.position.set(0, 1.32, -0.04);

      g.add(torre, porta, nacele, spinner, rotorGroup, luzTopo);
      g.userData.gira = rotorGroup;
      g.userData.luzAlerta = luzTopo;

    } else if (id === 'bateria') {
      // Estação de armazenamento de energia limpa com mostrador de carga LED
      var gabinete = caixaDe(0x2c3e38, 0.36, 0.38, 0.26, 'brushed', 0.19);
      // Aletas de ventilação lateral
      for (var v = 0; v < 4; v++) {
        var aleta = new THREE.Mesh(
          new THREE.BoxGeometry(0.01, 0.02, 0.18),
          materialBase(0x1a2622, null)
        );
        aleta.position.set(0.185, 0.12 + v * 0.05, 0);
        g.add(aleta);
      }

      // Painel com 4 barras indicadoras de nível de carga (LEDs verde-ciano)
      var painelMedidor = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.14, 0.02),
        materialBase(0x18201d, null)
      );
      painelMedidor.position.set(0, 0.26, 0.135);
      g.add(painelMedidor);

      for (var ledB = 0; ledB < 4; ledB++) {
        var barraLed = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.018, 0.01),
          materialBase(0x00f0aa, null, { emissive: 0x00d490, emissiveIntensity: 1.0 })
        );
        barraLed.position.set(0, 0.22 + ledB * 0.028, 0.146);
        g.add(barraLed);
      }

      // Conectores blindados de alta tensão no topo
      var conector1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 0.05, 8),
        materialBase(0x8a9296, 'brushed', { metalness: 0.8 })
      );
      conector1.position.set(-0.09, 0.4, 0);
      var conector2 = conector1.clone();
      conector2.position.x = 0.09;

      g.add(gabinete, conector1, conector2);

    } else if (id === 'poste') {
      // Poste colonial clássico de ferro forjado com luminária e luz real noturna
      var basePoste = new THREE.Mesh(
        new THREE.CylinderGeometry(0.065, 0.09, 0.16, 8),
        materialBase(0x383a3d, 'brushed', { metalness: 0.65, roughness: 0.4 })
      );
      basePoste.position.y = 0.08;

      var mastroP = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.045, 1.15, 8),
        materialBase(0x383a3d, 'brushed', { metalness: 0.65, roughness: 0.4 })
      );
      mastroP.position.y = 0.65;

      // Braço curvo ornamental superior
      var bracoLuz = new THREE.Mesh(
        new THREE.TorusGeometry(0.12, 0.018, 6, 12, Math.PI / 1.5),
        materialBase(0x383a3d, 'brushed', { metalness: 0.7 })
      );
      bracoLuz.position.set(0.08, 1.22, 0);
      bracoLuz.rotation.z = -Math.PI / 3;

      // Gaiola de vidro da lanterna
      var lanternaVidro = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.06, 0.15, 6),
        materialBase(0xfff4d0, null, { transparent: true, opacity: 0.6, roughness: 0.2 })
      );
      lanternaVidro.position.set(0.16, 1.18, 0);

      // Cúpula superior da luminária
      var cupula = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.06, 6),
        materialBase(0x282a2d, 'brushed', { metalness: 0.7 })
      );
      cupula.position.set(0.16, 1.27, 0);

      // Lâmpada de filamento brilhante
      var lampada = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 8),
        materialBase(0xfff6c0, null, { emissive: 0xffdd77, emissiveIntensity: 0.2 })
      );
      lampada.position.set(0.16, 1.17, 0);

      // Ponto de luz real para iluminar o mapa à noite!
      var luzPonto = new THREE.PointLight(0xffdf80, 0, 9.5, 2.0);
      luzPonto.position.set(0.16, 1.17, 0);

      g.add(basePoste, mastroP, bracoLuz, lanternaVidro, cupula, lampada, luzPonto);
      g.userData.lampada = lampada;
      g.userData.luzPonto = luzPonto;
      g.userData.eLuzPoste = true;

    } else if (id === 'caixa') {
      // Caixa d'água / cisterna de captação de chuva com base de paletes
      var basePalete = caixaDe(0x7a5a3a, 0.44, 0.08, 0.44, 'bark', 0.04);

      // Tanque cilíndrico com aros de aço
      var cisterna = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.23, 0.42, 14),
        materialBase(0x4a8296, 'brushed', { metalness: 0.4, roughness: 0.35 })
      );
      cisterna.position.y = 0.28;

      // Cinta metálica de reforço
      var cinta1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.245, 0.012, 6, 16),
        materialBase(0x333333, 'brushed', { metalness: 0.8 })
      );
      cinta1.rotation.x = Math.PI / 2;
      cinta1.position.y = 0.22;
      var cinta2 = cinta1.clone();
      cinta2.position.y = 0.34;

      // Tampa cônica com filtro de chuva
      var tampaC = new THREE.Mesh(
        new THREE.ConeGeometry(0.27, 0.1, 14),
        materialBase(0x38687a, 'brushed', { metalness: 0.5 })
      );
      tampaC.position.y = 0.52;

      // Tubo indicador de nível translúcido na lateral
      var tuboNivel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.015, 0.015, 0.32, 6),
        materialBase(0x8ce0ff, null, { transparent: true, opacity: 0.65 })
      );
      tuboNivel.position.set(0.25, 0.28, 0);

      // Torneira de latão na base
      var torneira = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, 0.04, 0.08),
        materialBase(0xd4a742, 'brushed', { metalness: 0.8 })
      );
      torneira.position.set(0, 0.14, 0.26);

      g.add(basePalete, cisterna, cinta1, cinta2, tampaC, tuboNivel, torneira);

    } else if (id === 'gotejamento') {
      g.add(construirGotejamento());
    } else if (id === 'trator') {
      g.add(construirVeiculo(0x8a3a2a, false));
    } else if (id === 'tratorEletrico') {
      g.add(construirVeiculo(0x2da882, true));
    } else if (id === 'drone') {
      g.add(construirDrone());
    } else if (id === 'colheitadeira') {
      g.add(construirColheitadeira());
    } else if (id === 'enxada') {
      g.add(construirEnxada());
    } else if (id === 'regador') {
      g.add(construirRegador());
    } else if (id === 'machado') {
      g.add(construirMachado());
    } else if (eq) {
      g.add(construirVeiculo(0x6a7a6a, true));
    }

    g.traverse(function (c) {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });
    return g;
  }

  function atualizarCena() {
    // solo: todos os 144 blocos aparecem, os travados ficam neutro
    estado.blocos.forEach(function (b, i) {
      var malha = malhasBloco[i];
      // malhasBloco stores THREE.Group; the actual base mesh sits in userData.baseMesh
      var baseMesh = malha.userData.baseMesh || malha;
      baseMesh.material.color.setHex(corDoSolo(b));
      malha.position.y = b.bloqueado ? -0.08 : 0;
      baseMesh.material.roughness = b.bloqueado ? 0.98 : 0.88;
    });

    // Estruturas e culturas do modo construção sobrevivem ao redesenho
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
    noturnas.forEach(function (n) { n.userData.turno = true; });
    houveEstruturaNoturna = noturnas.length > 0;

    // se um lote foi comprado desde a última montagem, a grade de
    // construção está desatualizada: refaz agora
    reconstruirGradeConstrucao();

    return noturnas;
  }

  // Função para criar ícones SVG personalizados (usada em vários lugares)
  function criarIconeSVG(id) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.style.flexShrink = '0';
    
    var path = '';
    
    if (id === 'plantar') {
      // Semente com broto
      path = '<path d="M12 22v-8m0 0c-2-1-4-3-4-6 0-2.5 1.8-4 4-4s4 1.5 4 4c0 3-2 5-4 6z"/>' +
             '<circle cx="12" cy="3" r="1" fill="currentColor"/>' +
             '<path d="M8 14c-1 1-2 2-2 4h12c0-2-1-3-2-4"/>';
    } else if (id === 'regar') {
      // Gotas de água
      path = '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>' +
             '<path d="M12 18v-4m-2 2h4"/>';
    } else if (id === 'adubar') {
      // Saco com nutrientes
      path = '<path d="M8 2v4m8-4v4M6 6h12l1.5 14a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1L6 6z"/>' +
             '<circle cx="10" cy="13" r="1" fill="currentColor"/>' +
             '<circle cx="14" cy="15" r="1" fill="currentColor"/>' +
             '<circle cx="12" cy="17" r="1" fill="currentColor"/>';
    } else if (id === 'colher') {
      // Foice de colheita
      path = '<path d="M4 19c0-4 4-7 7-7 4 0 9 2 9 7"/>' +
             '<path d="M11 12V4m0 0L8 7m3-3l3 3"/>' +
             '<circle cx="8" cy="19" r="1" fill="currentColor"/>' +
             '<circle cx="12" cy="19" r="1" fill="currentColor"/>' +
             '<circle cx="16" cy="19" r="1" fill="currentColor"/>';
    } else if (id === 'despoluir') {
      // Vassoura com brilho
      path = '<path d="M12 3v15m0 0l-3 3h6l-3-3z"/>' +
             '<path d="M9 18v-5h6v5M7 3l1 1m8-1l-1 1M3 7l1-1m16 1l-1-1"/>';
    } else if (id === 'enxada') {
      // Enxada
      path = '<path d="M14 4h3a2 2 0 0 1 2 2v3l-6 6m0 0l-8 8m8-8l-3-3"/>' +
             '<rect x="16" y="2" width="5" height="5" rx="1" transform="rotate(45 18.5 4.5)" stroke-width="1.5"/>';
    } else if (id === 'regador') {
      // Regador com água saindo
      path = '<ellipse cx="11" cy="11" rx="4" ry="2.5"/>' +
             '<path d="M11 8.5V3m0 0L9 5m2-2l2 2M7 13.5l-2 8h12l-2-8"/>' +
             '<path d="M9 19l.5 2m2.5-2l.5 2m2.5-2l.5 2" stroke-width="1"/>';
    } else if (id === 'machado') {
      // Machado
      path = '<path d="M7 22V2m0 0h6a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H7m0-10v10"/>' +
             '<path d="M13 6h4m-4 2h3" stroke-width="1.5"/>';
    } else if (id === 'construcao') {
      // Modo construção (martelo + ferramenta)
      path = '<path d="M14.5 2l-4 4m0 0L6 10.5 13.5 18 18 13.5 13.5 9l-3-3z"/>' +
             '<path d="M10 14l-6 6m12-12l6-6"/>' +
             '<rect x="2" y="18" width="4" height="4" rx="1"/>' +
             '<circle cx="19" cy="5" r="2" fill="currentColor"/>';
    } else if (id === 'arvore') {
      // Árvore com folhas
      path = '<path d="M12 3v18M8 5c0 4 4 6 4 6s4-2 4-6c0-3-1.8-5-4-5s-4 2-4 5z"/>' +
             '<circle cx="8" cy="7" r="1.5" fill="currentColor"/>' +
             '<circle cx="16" cy="7" r="1.5" fill="currentColor"/>' +
             '<circle cx="12" cy="4" r="1.5" fill="currentColor"/>';
    } else if (id === 'dinheiro') {
      // Moedas
      path = '<circle cx="12" cy="12" r="9"/>' +
             '<path d="M14.5 9a2.5 2.5 0 0 0-5 0v.5m0 5v.5a2.5 2.5 0 0 0 5 0M12 7v10"/>';
    } else if (id === 'energia') {
      // Raio de energia
      path = '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" stroke="none"/>';
    } else if (id === 'agua') {
      // Gota d'água
      path = '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>';
    } else if (id === 'nivel') {
      // Estrela
      path = '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" stroke="none"/>';
    } else if (id === 'xp') {
      // Alvo com seta
      path = '<circle cx="12" cy="12" r="10"/>' +
             '<circle cx="12" cy="12" r="6"/>' +
             '<circle cx="12" cy="12" r="2" fill="currentColor"/>' +
             '<path d="M12 2v4m0 12v4M2 12h4m12 0h4"/>';
    } else if (id === 'pegada') {
      // Folha ecológica
      path = '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/>' +
             '<path d="M9.5 9.5c1 .5 1.5 2 1.5 2s1-.5 2-1.5"/>' +
             '<path d="M10 14c.5 1 1.5 2 2 2s1.5-1 2-2"/>';
    } else if (id === 'sol') {
      // Sol
      path = '<circle cx="12" cy="12" r="4" fill="currentColor"/>' +
             '<path d="M12 2v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
    } else if (id === 'lua') {
      // Lua crescente
      path = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" fill="currentColor"/>';
    } else if (id === 'nuvem') {
      // Nuvem
      path = '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>';
    } else if (id === 'chuva') {
      // Nuvem com chuva
      path = '<path d="M16 13v8m-4-6v6m-4-3v5M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>';
    } else if (id === 'neve') {
      // Floco de neve
      path = '<path d="M12 2v20M2 12h20M5.64 5.64l12.72 12.72M18.36 5.64L5.64 18.36"/>' +
             '<circle cx="12" cy="2" r="1" fill="currentColor"/>' +
             '<circle cx="12" cy="22" r="1" fill="currentColor"/>' +
             '<circle cx="2" cy="12" r="1" fill="currentColor"/>' +
             '<circle cx="22" cy="12" r="1" fill="currentColor"/>';
    } else if (id === 'vento') {
      // Linhas de vento
      path = '<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>';
    } else if (id === 'amanhecer') {
      // Nascer do sol
      path = '<path d="M17 18a5 5 0 0 0-10 0"/>' +
             '<path d="M12 9V2m0 0L9 5m3-3l3 3"/>' +
             '<path d="M4.22 10.22l1.42 1.42m12.72 0l1.42-1.42M2 18h2m16 0h2"/>';
    } else if (id === 'entardecer') {
      // Pôr do sol
      path = '<path d="M17 18a5 5 0 0 0-10 0"/>' +
             '<path d="M12 9v9m-5.66-4.34l1.42 1.42m8.48 0l1.42-1.42M3.34 18h1.42m14.48 0h1.42"/>' +
             '<circle cx="12" cy="9" r="2" fill="currentColor"/>';
    }
    
    svg.innerHTML = path;
    return svg;
  }

  // Inicializar ícones fixos da barra de informações
  function inicializarIconesInfo() {
    // Precisa estar dentro ou depois de criarIconeSVG ser definida
    // Será chamada após montarFerramentas definir criarIconeSVG
  }

  // Escolhe uma ferramenta pelo id. O clique nos botões e os atalhos de
  // teclado (números 1..8) passam por aqui, então os dois caminhos nunca
  // divergem — inclusive para ligar/desligar o modo construção.
  function selecionarFerramenta(id) {
    if (!estado || !id) return false;

    // "Modo Construção" liga/desliga o modo: não é uma ferramenta comum
    if (id === 'construcao') {
      if (!modoConstrucao.ativo) ativarModoConstrucao();
      else desativarModoConstrucao();
      return true;
    }

    // qualquer outra ferramenta tira o jogo do modo construção
    if (modoConstrucao.ativo) desativarModoConstrucao();

    estado.ferramenta = id;
    marcarFerramenta();
    atualizarFerramentaMao();
    return true;
  }

  function montarFerramentas() {
    var caixa = ui('ferramentas');
    caixa.textContent = '';
    
    FERRAMENTAS.forEach(function (f, indice) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.ferramenta = f.id;
      // o tooltip mostra o atalho: 1..8 escolhem a ferramenta no teclado
      b.setAttribute('title', f.nome + ' (' + (indice + 1) + ')');
      
      // Adicionar ícone SVG
      var icone = criarIconeSVG(f.id);
      icone.style.color = f.cor;
      b.appendChild(icone);
      
      // NÃO adicionar nome - apenas SVG
      
      // clique e teclado usam o MESMO caminho de seleção
      b.addEventListener('click', function () {
        selecionarFerramenta(f.id);
      });
      caixa.appendChild(b);
    });
    marcarFerramenta();
    
    // Inicializar ícones fixos da barra de informações
    var iconesFixos = {
      'dinheiro': 'dinheiro',
      'energia': 'energia',
      'agua': 'agua',
      'nivel': 'nivel',
      'xp': 'xp',
      'pegada': 'pegada'
    };
    
    Object.keys(iconesFixos).forEach(function(key) {
      var elemento = document.querySelector('[data-icone="' + key + '"]');
      if (elemento) {
        elemento.textContent = '';
        var svg = criarIconeSVG(iconesFixos[key]);
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        elemento.appendChild(svg);
      }
    });
  }

  // O botão "Modo Construção" fica ativo quando o modo está ligado, mesmo
  // que `estado.ferramenta` seja outra coisa (o modo salva a ferramenta
  // anterior para devolver o jogo ao estado em que estava).
  function marcarFerramenta() {
    var ativa = modoConstrucao.ativo ? 'construcao' : estado.ferramenta;
    document.querySelectorAll('[data-ferramenta]').forEach(function (b) {
      b.classList.toggle('ativo', b.dataset.ferramenta === ativa);
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
      // VERIFICAÇÃO DE NÍVEL REMOVIDA - todas as sementes sempre disponíveis
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
    
    // Determinar ícone do clima
    var idIconeClima = 'sol';
    if (clima.nome.toLowerCase().includes('chuv')) idIconeClima = 'chuva';
    else if (clima.nome.toLowerCase().includes('neve') || clima.nome.toLowerCase().includes('frio')) idIconeClima = 'neve';
    else if (clima.nome.toLowerCase().includes('nublado')) idIconeClima = 'nuvem';
    else if (clima.nome.toLowerCase().includes('vento')) idIconeClima = 'vento';
    
    // Determinar ícone do período do dia com mais granularidade
    var hora = estado.tempo % 24;
    var idIconeTempo = 'sol';
    
    if (hora >= 0 && hora < 3) {
      idIconeTempo = 'lua'; // Meia-noite - lua cheia
    } else if (hora >= 3 && hora < 6) {
      idIconeTempo = 'lua'; // Madrugada - lua crescente
    } else if (hora >= 6 && hora < 8) {
      idIconeTempo = 'amanhecer'; // Amanhecer
    } else if (hora >= 8 && hora < 12) {
      idIconeTempo = 'sol'; // Manhã
    } else if (hora >= 12 && hora < 17) {
      idIconeTempo = 'sol'; // Tarde
    } else if (hora >= 17 && hora < 19) {
      idIconeTempo = 'entardecer'; // Entardecer
    } else if (hora >= 19 && hora < 21) {
      idIconeTempo = 'lua'; // Início da noite
    } else {
      idIconeTempo = 'lua'; // Noite
    }
    
    // Atualizar ícones SVG
    var iconeClimaEl = ui('icone-clima');
    if (iconeClimaEl) {
      iconeClimaEl.textContent = '';
      var svgClima = criarIconeSVG(idIconeClima);
      svgClima.setAttribute('width', '18');
      svgClima.setAttribute('height', '18');
      iconeClimaEl.appendChild(svgClima);
    }
    
    var iconeTempoEl = ui('icone-tempo');
    if (iconeTempoEl) {
      iconeTempoEl.textContent = '';
      var svgTempo = criarIconeSVG(idIconeTempo);
      svgTempo.setAttribute('width', '18');
      svgTempo.setAttribute('height', '18');
      iconeTempoEl.appendChild(svgTempo);
    }
    
    var valores = {
      dinheiro: '$' + Math.round(estado.dinheiro),
      energia: Math.floor(estado.energia) + '/' + Math.round(estado.energiaMax),
      agua: Math.floor(estado.agua) + '/' + Math.round(estado.aguaMax),
      nivel: String(estado.nivel),
      xp: estado.xp + '/' + D.XP_POR_NIVEL(estado.nivel),
      pegada: pegada + '/100',
      tempo: 'Dia ' + estado.dias,
      clima: ''
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

  // O cartão da esquerda mostra o bloco escolhido o tempo todo. Sem seleção
  // ele vira um convite ("clique num bloco para ver") em vez de sumir.
  function pintarInspetor() {
    var caixa = ui('inspetor');
    if (!caixa) return;
    if (!selecionado) {
      caixa.classList.add('sem-selecao');
      ui('insp-titulo').textContent = 'Terreno';
      ui('insp-coords').textContent = 'clique num bloco para ver';
      ui('insp-selo').textContent = '-';
      ui('insp-cultivo').textContent = '-';
      return;
    }
    caixa.classList.remove('sem-selecao');
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
        var temDinheiro = estado.dinheiro >= m.custo;
        
        // Determinar o texto do botão
        var textoBotao = temDinheiro ? 'Comprar' : 'Sem dinheiro (falta $' + (m.custo - estado.dinheiro) + ')';
        
        lista.appendChild(cartao(
          m.nome + (possui ? ' x' + possui : ''),
          m.desc,
          '$' + m.custo,
          '', // Sem indicador de nível
          temDinheiro, // Só precisa de dinheiro
          textoBotao,
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
        var temDinheiro = estado.dinheiro >= c.semente;
        
        var textoBotao = temDinheiro ? 'Comprar 1' : 'Sem dinheiro';
        
        lista.appendChild(cartao(
          c.nome,
          c.dias + ' dias - vende por $' + c.vende + ' - ' + c.xp + ' XP',
          '$' + c.semente + ' por semente',
          '', // Sem indicador de nível
          temDinheiro,
          textoBotao,
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

  // Inventário do jogador (coluna direita do HUD): o que ele carrega,
  // incluindo o que já está exposto no terreno pelo modo construção.
  var ICONES_INVENTARIO = {
    enxada: '🪓', regador: '💧', trator: '🚜', tratorEletrico: '⚡', drone: '🚁',
    colheitadeira: '🌾', gotejamento: '💧', composteira: '♻️', arvore: '🌳',
    painel: '☀️', turbina: '💨', bateria: '🔋', poste: '💡', caixa: '🚰'
  };

  function pintarInventarioJogador() {
    var caixa = ui('inventario-jogador');
    if (!caixa || !estado) return;
    caixa.textContent = '';

    var grupos = [
      { fonte: D.EQUIPAMENTOS, ignorar: [] },
      { fonte: D.ENERGIA, ignorar: [] }
    ];
    var linhas = 0;

    grupos.forEach(function (grupo) {
      Object.keys(grupo.fonte).forEach(function (id) {
        var total = estado.itens[id] || 0;
        if (!total) return;
        var noMapa = C.contarConstrucoes(estado, id);
        var linha = document.createElement('div');
        linha.className = 'linha-inventario';
        if (noMapa) linha.classList.add('construido');

        var icone = document.createElement('span');
        icone.className = 'icone';
        icone.textContent = ICONES_INVENTARIO[id] || '•';

        var nome = document.createElement('span');
        nome.className = 'nome';
        nome.textContent = grupo.fonte[id].nome + (noMapa ? ' (no terreno)' : '');
        nome.title = grupo.fonte[id].desc || grupo.fonte[id].nome;

        var qtd = document.createElement('span');
        qtd.className = 'qtd';
        qtd.textContent = 'x' + total;

        linha.appendChild(icone);
        linha.appendChild(nome);
        linha.appendChild(qtd);
        caixa.appendChild(linha);
        linhas++;
      });
    });

    if (!linhas) {
      var vazio = document.createElement('p');
      vazio.className = 'vazio-inventario';
      vazio.textContent = 'Nada comprado ainda. Passe na loja.';
      caixa.appendChild(vazio);
    }
  }

  function atualizarUI() {
    pintarUI();
    montarSementes();
    pintarInventarioJogador();
    pintarInspetor();
    if (modoConstrucao.ativo) atualizarInventarioConstrucao();
    if (!ui('loja').hidden) pintarLoja();
  }


  var CORES_CEU = {
    madrugada: 0x2a3a52,
    amanhecer: 0xd9a878,
    dia: 0xdfe9e4,
    entardecer: 0xd98f5e,
    noite: 0x16203a
  };

  // Interpola linearmente entre dois valores
  function _lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  // Interpola suavemente (ease in/out) entre dois valores
  function _smoothstep(a, b, t) { t = Math.max(0, Math.min(1, t)); t = t * t * (3 - 2 * t); return a + (b - a) * t; }

  // Objeto persistente para não criar new THREE.Color() todo frame
  var _corTemp = new THREE.Color();

  function aplicarLuz() {
    var h = estado.relogio;            // 0..1 (ciclo de 24h)
    var noite = C.ehNoite(estado);
    var clima = D.CLIMAS[estado.clima];

    // === FASES DO DIA (0..1) ===
    // madrugada 0–0.18, amanhecer 0.18–0.30, manhã 0.30–0.55,
    // tarde 0.55–0.68, entardecer 0.68–0.82, noite 0.82–1.0
    var tAmanhec  = _smoothstep(0, 1, (h - 0.18) / 0.12);   // 0→1 no amanhecer
    var tManha    = _smoothstep(0, 1, (h - 0.30) / 0.10);   // 0→1 na manhã
    var tEntard   = _smoothstep(0, 1, (h - 0.68) / 0.10);   // 0→1 no entardecer
    var tNoite    = _smoothstep(0, 1, (h - 0.82) / 0.08);   // 0→1 na noite

    // === COR DO CÉU — transição gradual ===
    // Sequência: madrugada → amanhecer → dia → entardecer → noite
    var ceuR, ceuG, ceuB;
    if (h < 0.18) {
      // Madrugada
      ceuR = 0x2a / 255; ceuG = 0x3a / 255; ceuB = 0x52 / 255;
    } else if (h < 0.30) {
      // Amanhecer
      ceuR = _lerp(0x2a, 0xf5, tAmanhec) / 255;
      ceuG = _lerp(0x3a, 0xb0, tAmanhec) / 255;
      ceuB = _lerp(0x52, 0x70, tAmanhec) / 255;
    } else if (h < 0.68) {
      // Dia
      ceuR = _lerp(0xf5, 0xdf, tManha) / 255;
      ceuG = _lerp(0xb0, 0xee, tManha) / 255;
      ceuB = _lerp(0x70, 0xff, tManha) / 255;
    } else if (h < 0.82) {
      // Entardecer
      ceuR = _lerp(0xdf, 0xe8, tEntard) / 255;
      ceuG = _lerp(0xee, 0x62, tEntard) / 255;
      ceuB = _lerp(0xff, 0x38, tEntard) / 255;
    } else {
      // Noite
      ceuR = _lerp(0xe8, 0x16, tNoite) / 255;
      ceuG = _lerp(0x62, 0x20, tNoite) / 255;
      ceuB = _lerp(0x38, 0x3a, tNoite) / 255;
    }

    // Clima nublado suaviza e acinzenta o céu
    var nublado = clima.solar < 0.7 ? (1 - clima.solar) * 0.6 : 0;
    ceuR = _lerp(ceuR, 0.55, nublado);
    ceuG = _lerp(ceuG, 0.55, nublado);
    ceuB = _lerp(ceuB, 0.58, nublado);

    _corTemp.setRGB(ceuR, ceuG, ceuB);
    if (cena.background && cena.background.setRGB) cena.background.setRGB(ceuR, ceuG, ceuB);
    if (cena.fog) {
      cena.fog.color.copy(_corTemp);
      // Névoa mais densa à noite e na chuva
      var neblina = noite ? 0.6 : 1.0;
      if (clima.chuva > 0) neblina *= 0.5 + clima.chuva * 0.5;
      cena.fog.near = 14 * neblina;
      cena.fog.far  = 55 * neblina;
    }

    // === LUZ SOLAR — posição e cor ===
    var angSol = h * Math.PI * 2;
    var alturaSol = Math.sin(angSol - Math.PI * 0.5);   // -1..1
    luzes.sol.position.set(
      Math.cos(angSol) * 18,
      Math.max(2, alturaSol * 20),
      8
    );

    var solR, solG, solB, solInt;
    if (noite) {
      solR = 0x6a / 255; solG = 0x8a / 255; solB = 0xb8 / 255;
      solInt = 0.04;
    } else if (h < 0.30) {
      // Amanhecer — laranja quente
      solR = _lerp(0x88, 0xff, tAmanhec) / 255;
      solG = _lerp(0x70, 0xb0, tAmanhec) / 255;
      solB = _lerp(0xaa, 0x70, tAmanhec) / 255;
      solInt = _lerp(0.05, 0.85, tAmanhec);
    } else if (h < 0.68) {
      // Dia — branco amarelado
      solR = 1.0; solG = 0.98; solB = 0.90;
      solInt = _lerp(0.85, 1.25, tManha);
    } else {
      // Entardecer → noite
      solR = _lerp(1.0, 0x6a / 255, tEntard);
      solG = _lerp(0.65, 0x8a / 255, tEntard);
      solB = _lerp(0.35, 0xb8 / 255, tEntard);
      solInt = _lerp(1.25, 0.05, tEntard);
    }

    // Fator de sombra do clima
    solInt *= Math.max(0.3, clima.solar * 0.55 + 0.45);

    luzes.sol.color.setRGB(solR, solG, solB);
    luzes.sol.intensity = solInt;

    // === LUZ AMBIENTE (hemisfério) ===
    if (noite) {
      luzes.hemi.color.setHex(0x1e2d4a);
      luzes.hemi.groundColor.setHex(0x0a0f1c);
      luzes.hemi.intensity = 0.12;
    } else if (h < 0.30) {
      luzes.hemi.color.setHex(0xe8a060);
      luzes.hemi.groundColor.setHex(0x3a3028);
      luzes.hemi.intensity = _lerp(0.1, 0.6, tAmanhec);
    } else {
      luzes.hemi.color.setHex(0xe8f8ff);
      luzes.hemi.groundColor.setHex(0x4a5e48);
      luzes.hemi.intensity = _lerp(0.6, 0.45, tEntard) * Math.max(0.5, clima.solar);
    }

    // === LUZ LUNAR ===
    luzes.luar.intensity = noite ? _lerp(0.06, 0.3, tNoite) * (1 - nublado * 0.8) : 0.0;

    // === CHUVA ===
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

    if (malhaFazendeiro && !modoConstrucao.ativo) {
      var mx = 0, mz = 0;
      var pulou = false;
      
      if (!livre.ligado) {
        var t = livre.teclas;
        if (t.w) mz -= 1;
        if (t.s) mz += 1;
        if (t.a) mx -= 1;
        if (t.d) mx += 1;

        // Coyote time: conta tempo fora do chão
        if (fisica.noChao) {
          fisica.coyoteTime = 0.12;
        } else {
          fisica.coyoteTime = Math.max(0, fisica.coyoteTime - dt);
        }

        // Jump buffer: registra o espaço mesmo um pouco antes de tocar o chão
        if (t[' ']) {
          fisica.jumpBuffer = 0.15;
        } else {
          fisica.jumpBuffer = Math.max(0, fisica.jumpBuffer - dt);
        }

        // Pula se tem buffer E está no chão (ou dentro do coyote time)
        if (fisica.jumpBuffer > 0 && fisica.coyoteTime > 0) {
          pulou = true;
          fisica.velocidadeY = fisica.forcaPulo;
          fisica.noChao = false;
          fisica.coyoteTime = 0;
          fisica.jumpBuffer = 0;
        }
      }

      // Qualquer tecla de movimento cancela o auto-caminhar do clique
      if (mx !== 0 || mz !== 0) {
        selecionado = null;
        malhaSelecao.visible = false;
      }
      
      // === FISICA DE MOVIMENTO ===
      if (mx !== 0 || mz !== 0) {
        var norma = Math.sqrt(mx * mx + mz * mz);
        mx /= norma; mz /= norma;
        
        // Transformar movimento relativo à câmera
        var s = Math.sin(az);
        var c = Math.cos(az);
        var dirX = mx * c + mz * s;
        var dirZ = -mx * s + mz * c;
        
        // Aplicar aceleração escalada por dt
        fisica.velocidade.x += dirX * fisica.aceleracao * dt;
        fisica.velocidade.z += dirZ * fisica.aceleracao * dt;
        
        // Limitar velocidade máxima
        var velHorizontal = Math.sqrt(
          fisica.velocidade.x * fisica.velocidade.x + 
          fisica.velocidade.z * fisica.velocidade.z
        );
        if (velHorizontal > fisica.velocidadeMaxima) {
          fisica.velocidade.x *= fisica.velocidadeMaxima / velHorizontal;
          fisica.velocidade.z *= fisica.velocidadeMaxima / velHorizontal;
        }
        
        andando = true;
        tempoAndar += dt * 8;
        malhaFazendeiro.rotation.y = Math.atan2(fisica.velocidade.x, fisica.velocidade.z);
      } else {
        andando = false;
        // Fricção correta: desacelera gradualmente (não multiplica por 14!)
        var fatorFriccao = Math.max(0, 1 - fisica.friccao * dt);
        fisica.velocidade.x *= fatorFriccao;
        fisica.velocidade.z *= fatorFriccao;
      }
      
      // === APLICAR GRAVIDADE (escalada por dt) ===
      fisica.velocidadeY += fisica.gravidade * dt;
      
      // Calcular nova posição (integração por dt: velocidade é por segundo)
      var novaPosX = malhaFazendeiro.position.x + fisica.velocidade.x * dt;
      var novaPosY = malhaFazendeiro.position.y + fisica.velocidadeY * dt;
      var novaPosZ = malhaFazendeiro.position.z + fisica.velocidade.z * dt;
      
      // === DETECÇÃO DE COLISÃO COM OBSTÁCULOS ===
      var colidiu = false;
      for (var i = 0; i < obstaculos.length; i++) {
        var obs = obstaculos[i];
        var dx = novaPosX - obs.pos.x;
        var dz = novaPosZ - obs.pos.z;
        var distancia = Math.sqrt(dx * dx + dz * dz);
        var somaRaios = fisica.raio + obs.raio;
        
        if (distancia < somaRaios && novaPosY < obs.altura) {
          // Colidiu - empurrar para fora
          var angulo = Math.atan2(dz, dx);
          novaPosX = obs.pos.x + Math.cos(angulo) * somaRaios;
          novaPosZ = obs.pos.z + Math.sin(angulo) * somaRaios;
          fisica.velocidade.x *= 0.5;
          fisica.velocidade.z *= 0.5;
          colidiu = true;
        }
      }
      
      // === COLISÃO COM LOTES TRAVADOS (fora do terreno comprado) ===
      // Blocos bloqueados têm y = -0.08 (parede rebaixada); o fazendeiro não
      // pode pisar neles: tenta deslizar pelos eixos antes de travar.
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

      // === LIMITES DO MAPA (cerca do perímetro) ===
      var limite = meio - TILE * 0.4;
      novaPosX = Math.max(-limite, Math.min(limite, novaPosX));
      novaPosZ = Math.max(-limite, Math.min(limite, novaPosZ));
      
      // === CHÃO (topo dos blocos) ===
      if (novaPosY <= ALTURA_CHAO) {
        novaPosY = ALTURA_CHAO;
        fisica.velocidadeY = 0;
        fisica.noChao = true;
      } else {
        fisica.noChao = false;
      }
      
      // Aplicar posição
      malhaFazendeiro.position.x = novaPosX;
      malhaFazendeiro.position.y = novaPosY;
      malhaFazendeiro.position.z = novaPosZ;
      
      // === ANIMAÇÃO DE CAMINHADA ===
      if (fazPartes.pernaEsq && fazPartes.pernaDir && fazPartes.bracoEsq && fazPartes.bracoDir) {
        if (andando) {
          // Balanço das pernas (opostas)
          fazPartes.pernaEsq.rotation.x = Math.sin(tempoAndar) * 0.5;
          fazPartes.pernaDir.rotation.x = Math.sin(tempoAndar + Math.PI) * 0.5;
          
          // Balanço dos braços (opostos às pernas)
          fazPartes.bracoEsq.rotation.x = Math.sin(tempoAndar + Math.PI) * 0.35;
          fazPartes.bracoDir.rotation.x = Math.sin(tempoAndar) * 0.35;
          
          // Pequeno balanço vertical do corpo
          malhaFazendeiro.position.y += Math.abs(Math.sin(tempoAndar * 2)) * 0.02;
        } else {
          // Retornar suavemente à posição neutra
          fazPartes.pernaEsq.rotation.x *= 0.85;
          fazPartes.pernaDir.rotation.x *= 0.85;
          fazPartes.bracoEsq.rotation.x *= 0.85;
          fazPartes.bracoDir.rotation.x *= 0.85;
        }
        
        // Animação de pulo
        if (!fisica.noChao) {
          fazPartes.pernaEsq.rotation.x = -0.3;
          fazPartes.pernaDir.rotation.x = -0.3;
          fazPartes.bracoEsq.rotation.x = -0.8;
          fazPartes.bracoDir.rotation.x = -0.8;
        }
      }
      
      if (!livre.ligado) ajustarCamera(az, pol, dist, dt);
    }
    
    // === ANIMAR ITENS COLOCADOS NO MODO CONSTRUCAO ===
    if (modoConstrucao.construcoes.length) {
      modoConstrucao.construcoes.forEach(function (item) {
        animarItem(item, dt);
      });
    }

    // === ATUALIZAR PARTICULAS ===
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
    var arrastando = false;   // arraste de câmera no mapa
    var moveu = false;
    var ultimoX = 0;
    var ultimoY = 0;


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

    desligarLivre = function () {
      livre.ligado = false;
      livre.vel.set(0, 0, 0);
      livre.teclas = {};
      livre.olhando = false;
      document.body.classList.remove('mirando');
      paintMira();
      destravarMouse();
      // volta para a camera de orbita exatamente de onde saiu
      ajustarCamera(az, pol, dist);
    };

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
      if (!mirarPonteiro(mouseX, mouseY)) return null;
      // malhasBloco são Groups — precisa de recursive=true para atingir os filhos
      var hits = raio.intersectObjects(malhasBloco, true);
      if (!hits.length) return null;
      // Sobe pela hierarquia até encontrar o objeto com userData.bloco
      var obj = hits[0].object;
      while (obj && !obj.userData.bloco) obj = obj.parent;
      return obj ? obj.userData.bloco : null;
    }

    // o ponteiro que comanda o arraste de construção é o mesmo que pegou o
    // item: um segundo dedo não deve roubar o preview
    function ponteiroDoArraste(ev) {
      return modoConstrucao.ponteiroId === null || ev.pointerId === modoConstrucao.ponteiroId;
    }

    palco.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      arrastando = true;
      livre.olhando = livre.ligado;
      moveu = false;
      ultimoX = ev.clientX;
      ultimoY = ev.clientY;
    });

    global.addEventListener('pointermove', function (ev) {
      // === MODO CONSTRUÇÃO: preview segue o ponteiro ===
      if (modoConstrucao.ativo && modoConstrucao.preview && ponteiroDoArraste(ev)) {
        moverPreview(ev.clientX, ev.clientY);
        return;
      }

      // === MODO CONSTRUÇÃO: destaque do que a marreta vai tirar ===
      if (modoConstrucao.ativo && modoConstrucao.modoDeletar) {
        destacarSobOMarreta(ev.clientX, ev.clientY);
        return;
      }

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
      var cliqueEsquerdo = ev.button === 0 || ev.pointerType !== 'mouse';

      // === MODO CONSTRUÇÃO: soltar o item arrastado do inventário ===
      if (modoConstrucao.ativo && modoConstrucao.preview && ponteiroDoArraste(ev)) {
        soltarDestaqueRemocao();
        fimDoArraste();
        arrastando = false;
        moveu = false;
        // toque/clique no painel só seleciona: posicionar é o próximo
        // toque no mapa (ou o fim de um arraste de verdade)
        if (cliqueEsquerdo && !ponteiroSobreInventario(ev)) {
          moverPreview(ev.clientX, ev.clientY);
          confirmarColocacao();
        } else {
          atualizarControlesConstrucao();
        }
        return;
      }

      if (livre.ligado) {
        // na camera livre o botao e so para olhar, nao para usar ferramenta
        livre.olhando = false;
        arrastando = false;
        return;
      }
      
      // === MODO CONSTRUÇÃO: marreta ===
      if (modoConstrucao.ativo && modoConstrucao.modoDeletar) {
        arrastando = false;
        if (cliqueEsquerdo && !moveu) {
          var alvo = objetoEm(ev.clientX, ev.clientY, modoConstrucao.construcoes);
          while (alvo && alvo.parent && !alvo.userData.permanente) alvo = alvo.parent;
          if (alvo && alvo.userData.permanente) deletarItemConstrucao(alvo);
          else soltarDestaqueRemocao();
        } else {
          soltarDestaqueRemocao();
        }
        atualizarControlesConstrucao();
        return;
      }

      // === com o modo construção ligado o mapa não usa ferramenta ===
      if (modoConstrucao.ativo) {
        soltarDestaqueRemocao();
        arrastando = false;
        return;
      }
      
      if (arrastando && !moveu && ev.button === 0) {
        // === MACHADO - CORTAR ARVORE ===
        if (estado.ferramenta === 'machado') {
          // Verificar se clicou em uma árvore
          var arvoresDecorativas = [];
          grupoDecoracoes.children.forEach(function (obj) {
            if (obj.userData && obj.userData.podeCortar) {
              arvoresDecorativas.push(obj);
            }
          });

          var arvore = objetoEm(ev.clientX, ev.clientY, arvoresDecorativas);
          if (arvore) {
            // Encontrar o grupo pai da árvore
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
        
        // === FERRAMENTAS NORMAIS ===
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

    // Números 1..8 escolhem a ferramenta da barra: devolve o índice na
    // lista FERRAMENTAS, ou -1 quando a tecla não é um atalho válido.
    function indiceDaTeclaFerramenta(k) {
      if (!/^[1-9]$/.test(k)) return -1;
      var indice = Number(k) - 1;
      return indice < FERRAMENTAS.length ? indice : -1;
    }

    // R não é tecla de movimento: ela gira a construção em 90 graus.
    function teclasDeMovimento(k) {
      return k === 'w' || k === 'a' || k === 's' || k === 'd' || k === 'q'
        || k === ' ' || k === 'shift';
    }

    function nomearTecla(k) {
      if (k === ' ') return ' ';
      return k;
    }

    global.addEventListener('keydown', function (ev) {
      var emCampo = ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName || '');
      var k = ev.key.toLowerCase();

      // Números 1..8 trocam a ferramenta (mesmo caminho do clique). Fica
      // fora quando o jogo está num campo de texto, com a loja aberta ou com
      // Ctrl/Alt/⌘ (para não atropelar os atalhos do navegador).
      if (!emCampo && !ev.ctrlKey && !ev.altKey && !ev.metaKey) {
        var atalho = indiceDaTeclaFerramenta(k);
        if (atalho >= 0) {
          var loja = ui('loja');
          if (!loja || loja.hidden) {
            var ferramentaAtalho = FERRAMENTAS[atalho];
            ev.preventDefault();
            selecionarFerramenta(ferramentaAtalho.id);
            // o modo construção já avisa sozinho ao ligar/desligar
            if (ferramentaAtalho.id !== 'construcao') {
              aviso(ferramentaAtalho.nome + ' selecionado (tecla ' + (atalho + 1) + ').', false);
            }
            return;
          }
        }
      }

      // R gira o item antes de soltar
      if (!emCampo && k === 'r' && modoConstrucao.ativo && modoConstrucao.preview) {
        ev.preventDefault();
        girarPreview();
        return;
      }

      // ESC cancela arraste se estiver arrastando
      if (ev.key === 'Escape') {
        if (modoConstrucao.preview) {
          cancelarArrasteItem();
          return;
        }

        var modal = ui('loja');
        if (modal && !modal.hidden) {
          modal.hidden = true;
          return;
        }
        // ESC também fecha modo construção
        if (modoConstrucao.ativo) {
          desativarModoConstrucao();
          return;
        }
        // ESC sai da camera livre
        if (livre.ligado) {
          desligarLivre();
          return;
        }
      }

      if (ev.key === 'h' || ev.key === 'H') {
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

    // Botão direito cancela o arraste (funciona em qualquer lugar da tela,
    // inclusive sobre o painel de construções)
    document.addEventListener('contextmenu', function (ev) {
      if (modoConstrucao.ativo && modoConstrucao.preview) {
        ev.preventDefault();
        cancelarArrasteItem();
      }
    });

    // No toque, o navegador pode cancelar o ponteiro no meio do arraste
    // (chamada, notificação, gesto do sistema): trata como cancelamento
    global.addEventListener('pointercancel', function () {
      if (modoConstrucao.ativo && modoConstrucao.preview) cancelarArrasteItem(true);
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
    
    // Fechar o modo construção
    var fecharConstrucao = ui('fechar-construcao');
    if (fecharConstrucao) {
      fecharConstrucao.addEventListener('click', function () {
        desativarModoConstrucao();
      });
    }

    // Controles do modo construção (essenciais no toque, onde não existe
    // botão direito nem tecla R)
    var girar = ui('girar-construcao');
    if (girar) {
      girar.addEventListener('click', function () {
        girarPreview();
      });
    }
    var cancelar = ui('cancelar-construcao');
    if (cancelar) {
      cancelar.addEventListener('click', function () {
        if (modoConstrucao.modoDeletar) desativarModoDeletar();
        else cancelarArrasteItem();
      });
    }

    var reiniciar = ui('reiniciar');
    if (reiniciar) {
      reiniciar.addEventListener('click', function () {
        if (!global.confirm('Recomecar apaga o progresso salvo, incluindo as construções. Continuar?')) return;
        C.apagar();
        global.location.reload();
      });
    }

    global.addEventListener('resize', redimensionar);
    if (global.ResizeObserver) new global.ResizeObserver(redimensionar).observe(palco);
  }

  function erroFatal(erro) {
    console.error('Raiz jogo: falha ao iniciar.', erro);
    var painel = document.querySelector('.hud-centro');
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
      // save antigo (sem o campo) ganha a lista vazia em vez de ser descartado
      C.normalizarConstrucoes(estado);
      if (estado.ferramenta === 'construcao') estado.ferramenta = 'plantar';

      montarCena();
      atualizarCena();
      // reconstrói as construções salvas ANTES de ligar as interações:
      // é aqui que o item colocado volta a existir depois do F5
      reconstruirConstrucoes();
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
      estado: function () { return estado; },
      construcoes: function () { return estado.construcoes; }
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
