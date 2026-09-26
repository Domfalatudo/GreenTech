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

  // === FISICA DO PERSONAGEM ===
  var fisica = {
    velocidade: new THREE.Vector3(),
    aceleracao: 0.15,
    friccao: 0.85,
    velocidadeMaxima: 0.12,
    gravidade: -0.02,
    velocidadeY: 0,
    noChao: true,
    forcaPulo: 0.18,
    altura: 0.8,
    raio: 0.3
  };
  
  var teclasPressionadas = {};
  var obstaculos = []; // Lista de objetos com colisão

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
        ? 'Inventário do modo construção'
        : 'Ferramentas';
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

    aviso('Modo Construção ligado. Arraste um item até o terreno e solte.', false);
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

    // Altura da grade (acima dos blocos)
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
            opacity: 0.25,
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
      '<div class="icon" style="font-size: 1.8rem;">🔨</div>' +
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

    // Separador visual
    var separador = document.createElement('div');
    separador.style.cssText = 'height: 1px; background: var(--pale); margin: 8px 0;';
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
  function criarConstrucao(itemId, bloco, rotacao) {
    var item = criarModeloItem(itemId);
    var p = posicaoDe(bloco);
    item.position.set(p[0], 0, p[2]);
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

  // Controles visíveis da UI de construção: botões de girar/cancelar
  // (essenciais no toque) e a linha de status com o motivo do bloqueio.
  // Só escreve no DOM quando o texto muda: é chamada a cada pointermove.
  function textoDeStatus() {
    if (modoConstrucao.modoDeletar) {
      return 'Marreta armada: toque na construção destacada para retirar.';
    }
    if (!modoConstrucao.preview) {
      return 'Arraste um item até o terreno, ou toque nele e depois no bloco.';
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
    cena.fog = new THREE.Fog(CORES_CEU.dia, 12, 48);
    grupoBlocos = new THREE.Group();
    grupoEstruturas = new THREE.Group();
    grupoDecoracoes = new THREE.Group();
    tabuleiro.add(grupoBlocos, grupoEstruturas, grupoDecoracoes);

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

    // terreno base grande
    var tamanhoBase = D.GRADE * STEP + 12;
    var base = new THREE.Mesh(
      new THREE.BoxGeometry(tamanhoBase, 0.5, tamanhoBase),
      materialBase(0x5a7a42, 'soil', { roughness: 0.95 })
    );
    base.position.y = -0.45;
    base.receiveShadow = true;
    tabuleiro.add(base);

    // ===== DECORACAO DO MAPA =====
    montarDecoracoes();

    malhaSelecao = new THREE.Mesh(
      new THREE.PlaneGeometry(TILE * 1.04, TILE * 1.04),
      new THREE.MeshBasicMaterial({ color: 0xbfe6c6, transparent: true, opacity: 0.3, depthWrite: false })
    );
    malhaSelecao.rotation.x = -Math.PI / 2;
    malhaSelecao.position.y = 0.17;
    malhaSelecao.visible = false;
    tabuleiro.add(malhaSelecao);

    // ===== FAZENDEIRO COM ANIMACAO =====
    var grupo = new THREE.Group();

    // Pivot das pernas (para animacao)
    var pivotPernaEsq = new THREE.Group();
    pivotPernaEsq.position.set(-0.08, 0.2, 0);
    var pernaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), materialBase(0x1a457b, null, { roughness: 0.8 }));
    pernaEsq.position.y = -0.1;
    pivotPernaEsq.add(pernaEsq);
    // Bota
    var botaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.16), materialBase(0x3a2a1a, null, { roughness: 0.9 }));
    botaEsq.position.set(0, -0.2, 0.02);
    pivotPernaEsq.add(botaEsq);

    var pivotPernaDir = new THREE.Group();
    pivotPernaDir.position.set(0.08, 0.2, 0);
    var pernaDir = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), materialBase(0x1a457b, null, { roughness: 0.8 }));
    pernaDir.position.y = -0.1;
    pivotPernaDir.add(pernaDir);
    var botaDir = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.06, 0.16), materialBase(0x3a2a1a, null, { roughness: 0.9 }));
    botaDir.position.set(0, -0.2, 0.02);
    pivotPernaDir.add(botaDir);

    var corpo = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.2), materialBase(0xcc4444, null, { roughness: 0.7 }));
    corpo.position.y = 0.35;
    var macacao = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.15, 0.21), materialBase(0x1a457b, null, { roughness: 0.8 }));
    macacao.position.y = 0.25;
    var alcaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.22), materialBase(0x1a457b, null, { roughness: 0.8 }));
    alcaEsq.position.set(-0.1, 0.38, 0);
    var alcaDir = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.2, 0.22), materialBase(0x1a457b, null, { roughness: 0.8 }));
    alcaDir.position.set(0.1, 0.38, 0);

    // Pivot dos bracos (para animacao)
    var pivotBracoEsq = new THREE.Group();
    pivotBracoEsq.position.set(-0.21, 0.45, 0);
    var bracoEsq = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), materialBase(0xd9b38c, null, { roughness: 0.6 }));
    bracoEsq.position.y = -0.1;
    var mangaEsq = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.11), materialBase(0xcc4444, null, { roughness: 0.7 }));
    mangaEsq.position.y = -0.03;
    pivotBracoEsq.add(bracoEsq, mangaEsq);

    var pivotBracoDir = new THREE.Group();
    pivotBracoDir.position.set(0.21, 0.45, 0);
    var bracoDir = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), materialBase(0xd9b38c, null, { roughness: 0.6 }));
    bracoDir.position.y = -0.1;
    var mangaDir = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.12, 0.11), materialBase(0xcc4444, null, { roughness: 0.7 }));
    mangaDir.position.y = -0.03;
    // Ferramenta na mao direita
    var ferramentaMao = new THREE.Group();
    ferramentaMao.position.set(0, -0.22, 0.08);
    pivotBracoDir.add(bracoDir, mangaDir, ferramentaMao);

    var cabeca = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), materialBase(0xd9b38c, null, { roughness: 0.6 }));
    cabeca.position.y = 0.62;
    var cabelo = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.24), materialBase(0x4a3a2a, null, { roughness: 0.9 }));
    cabelo.position.y = 0.72;
    var olhoEsq = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), materialBase(0x111111, null, { roughness: 0.3 }));
    olhoEsq.position.set(-0.05, 0.64, 0.115);
    var olhoDir = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), materialBase(0x111111, null, { roughness: 0.3 }));
    olhoDir.position.set(0.05, 0.64, 0.115);
    var nariz = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), materialBase(0xc9a37c, null, { roughness: 0.6 }));
    nariz.position.set(0, 0.61, 0.115);
    var chapeuAba = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16), materialBase(0xd8b64a, 'brushed', { roughness: 0.8 }));
    chapeuAba.position.y = 0.76;
    var chapeuCopo = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.16, 0.12, 12), materialBase(0xd8b64a, 'brushed', { roughness: 0.8 }));
    chapeuCopo.position.y = 0.82;

    grupo.add(
      pivotPernaEsq, pivotPernaDir, corpo, macacao, alcaEsq, alcaDir,
      pivotBracoEsq, pivotBracoDir,
      cabeca, cabelo, olhoEsq, olhoDir, nariz,
      chapeuAba, chapeuCopo
    );

    grupo.traverse(function(c) {
      if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
    });

    fazPartes = {
      pernaEsq: pivotPernaEsq,
      pernaDir: pivotPernaDir,
      bracoEsq: pivotBracoEsq,
      bracoDir: pivotBracoDir,
      ferramentaMao: ferramentaMao
    };

    tabuleiro.add(grupo);
    malhaFazendeiro = grupo;
    atualizarFerramentaMao();

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

  // ===== FUNCAO PRINCIPAL PARA MONTAR DECORACOES =====
  function montarDecoracoes() {
    // preserva as colisões das construções do modo construção
    obstaculos = obstaculos.filter(function (obs) { return !obs.construcao; });
    
    var raioMapa = D.GRADE * STEP / 2 + 6;
    var distanciaMontanha = raioMapa + 8;
    
    // === MONTANHAS AO REDOR (8 montanhas grandes) ===
    var angulosMontanha = [0, 45, 90, 135, 180, 225, 270, 315];
    angulosMontanha.forEach(function(angulo) {
      var rad = angulo * Math.PI / 180;
      var x = Math.cos(rad) * distanciaMontanha;
      var z = Math.sin(rad) * distanciaMontanha;
      var altura = 10 + Math.random() * 8;
      var largura = 6 + Math.random() * 4;
      grupoDecoracoes.add(criarMontanha(x, z, largura, altura));
    });
    
    // === MONTANHAS MENORES (16 colinas) ===
    for (var i = 0; i < 16; i++) {
      var angulo = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      var distancia = raioMapa + 4 + Math.random() * 6;
      var x = Math.cos(angulo) * distancia;
      var z = Math.sin(angulo) * distancia;
      var altura = 4 + Math.random() * 5;
      var largura = 3 + Math.random() * 2;
      grupoDecoracoes.add(criarMontanha(x, z, largura, altura));
    }
    
    // === ARVORES AO REDOR DO MAPA (40-50 árvores) ===
    var numArvores = 40 + Math.floor(Math.random() * 10);
    for (var i = 0; i < numArvores; i++) {
      var angulo = Math.random() * Math.PI * 2;
      var distancia = raioMapa + Math.random() * 4;
      var x = Math.cos(angulo) * distancia;
      var z = Math.sin(angulo) * distancia;
      var escala = 0.6 + Math.random() * 0.8;
      grupoDecoracoes.add(criarArvore(x, z, escala));
    }
    
    // === ARVORES DENTRO DA AREA JOGAVEL (espaçadas) ===
    for (var i = 0; i < 15; i++) {
      var x = (Math.random() - 0.5) * raioMapa * 0.9;
      var z = (Math.random() - 0.5) * raioMapa * 0.9;
      
      // Verificar se não está muito perto do centro
      if (Math.sqrt(x * x + z * z) > 3) {
        var escala = 0.5 + Math.random() * 0.6;
        grupoDecoracoes.add(criarArvore(x, z, escala));
      }
    }
    
    // === FLORES ESPALHADAS (80-100 flores) ===
    var numFlores = 80 + Math.floor(Math.random() * 20);
    for (var i = 0; i < numFlores; i++) {
      var x = (Math.random() - 0.5) * raioMapa * 0.95;
      var z = (Math.random() - 0.5) * raioMapa * 0.95;
      grupoDecoracoes.add(criarFlor(x, z));
    }
    
    // === ARBUSTOS (30-40 arbustos) ===
    var numArbustos = 30 + Math.floor(Math.random() * 10);
    for (var i = 0; i < numArbustos; i++) {
      var x = (Math.random() - 0.5) * raioMapa * 0.9;
      var z = (Math.random() - 0.5) * raioMapa * 0.9;
      grupoDecoracoes.add(criarArbusto(x, z));
    }
    
    // === ROCHAS (20-30 rochas) ===
    var numRochas = 20 + Math.floor(Math.random() * 10);
    for (var i = 0; i < numRochas; i++) {
      var angulo = Math.random() * Math.PI * 2;
      var distancia = raioMapa * 0.5 + Math.random() * raioMapa * 0.4;
      var x = Math.cos(angulo) * distancia;
      var z = Math.sin(angulo) * distancia;
      var escala = 0.8 + Math.random() * 1.2;
      grupoDecoracoes.add(criarRocha(x, z, escala));
    }
    
    // === GRAMA ALTA (partículas decorativas) ===
    var gramaPositions = new Float32Array(300 * 3);
    for (var i = 0; i < 300; i++) {
      gramaPositions[i * 3] = (Math.random() - 0.5) * raioMapa;
      gramaPositions[i * 3 + 1] = 0.1 + Math.random() * 0.2;
      gramaPositions[i * 3 + 2] = (Math.random() - 0.5) * raioMapa;
    }
    var gramaGeo = new THREE.BufferGeometry();
    gramaGeo.setAttribute('position', new THREE.BufferAttribute(gramaPositions, 3));
    var grama = new THREE.Points(gramaGeo, new THREE.PointsMaterial({
      color: 0x6a9a5a,
      size: 0.15,
      transparent: true,
      opacity: 0.6
    }));
    grupoDecoracoes.add(grama);
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
    var alvoX = 0, alvoZ = 0;
    if (malhaFazendeiro && (!livre || !livre.ligado)) {
      alvoX = malhaFazendeiro.position.x;
      alvoZ = malhaFazendeiro.position.z;
    }
    camera.position.set(
      alvoX + dist * Math.sin(pol) * Math.sin(az),
      dist * Math.cos(pol),
      alvoZ + dist * Math.sin(pol) * Math.cos(az)
    );
    camera.lookAt(alvoX, 0, alvoZ);
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

  function construirMachado() {
    var g = new THREE.Group();
    // Cabo de madeira
    var cabo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.025, 0.65, 8), 
      materialBase(0x8b4513, 'bark', { roughness: 0.85 })
    );
    cabo.position.y = 0.32;
    cabo.rotation.z = 0.25;
    
    // Lâmina de metal
    var lamina = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.15, 0.03), 
      materialBase(0xc0c0c0, 'brushed', { metalness: 0.8, roughness: 0.3 })
    );
    lamina.position.set(-0.08, 0.62, 0);
    lamina.rotation.z = 0.25;
    
    // Detalhe da lâmina (fio)
    var fio = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.02, 0.04), 
      materialBase(0xe0e0e0, 'brushed', { metalness: 0.9, roughness: 0.2 })
    );
    fio.position.set(-0.08, 0.69, 0);
    fio.rotation.z = 0.25;
    
    g.add(cabo, lamina, fio);
    return g;
  }

  // === MODELOS 3D DOS ITENS DA LOJA ===
  
  function criarModeloItem(itemId) {
    var g = new THREE.Group();
    g.userData.itemId = itemId;
    g.userData.animado = true;
    
    if (itemId === 'trator' || itemId === 'tratorEletrico') {
      var eletrico = itemId === 'tratorEletrico';
      g.add(construirVeiculo(eletrico ? 0x3f8f7a : 0x8a4a2a, eletrico));
      g.userData.tipo = 'veiculo';
    } else if (itemId === 'drone') {
      g.add(construirDrone());
      g.userData.tipo = 'drone';
      g.userData.flutuando = true;
    } else if (itemId === 'colheitadeira') {
      g.add(construirColheitadeira());
      g.userData.tipo = 'veiculo';
    } else if (itemId === 'gotejamento') {
      g.add(construirGotejamento());
      g.userData.tipo = 'estatico';
      g.userData.animaAgua = true;
    } else if (itemId === 'composteira') {
      var caixote = caixaDe(0x6f5a3f, 0.4, 0.3, 0.4, 'bark', 0.15);
      var tampa = caixaDe(0x8a6b3f, 0.44, 0.06, 0.44, 'bark', 0.32);
      var adubo = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), materialBase(0x4a3a26, 'soil'));
      adubo.position.y = 0.35;
      g.add(caixote, tampa, adubo);
      g.userData.tipo = 'estatico';
      g.userData.particulas = true;
    } else if (itemId === 'arvore') {
      // Árvore de reflorestamento
      var tronco = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, 0.4, 7), 
        materialBase(0x5a4530, 'bark', { roughness: 0.95 })
      );
      tronco.position.y = 0.2;
      var copa = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 12, 10), 
        materialBase(0x4f7a3a, 'leaf', { roughness: 0.85 })
      );
      copa.position.y = 0.62;
      copa.scale.set(1, 0.85, 1);
      g.add(tronco, copa);
      g.userData.tipo = 'estatico';
    } else if (itemId === 'enxada') {
      g.add(construirEnxada());
      g.userData.tipo = 'ferramenta';
    } else if (itemId === 'regador') {
      g.add(construirRegador());
      g.userData.tipo = 'ferramenta';
    } else if (D.ENERGIA[itemId]) {
      // itens de energia (painel, turbina, poste, bateria, caixa) reaproveitam
      // o mesmo modelo que já aparece quando viram estrutura de bloco
      var energia = malhaDeEstrutura(itemId);
      g.add(energia);
      if (energia.userData.gira) g.userData.gira = energia.userData.gira;
      if (energia.userData.lampada) g.userData.lampada = energia.userData.lampada;
      g.userData.tipo = 'energia';
    } else {
      // Item genérico caso não seja reconhecido
      var placeholder = caixaDe(0x888888, 0.3, 0.3, 0.3, null, 0.15);
      g.add(placeholder);
      g.userData.tipo = 'estatico';
    }
    
    // Adicionar sombras
    g.traverse(function(obj) {
      if (obj.isMesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    
    return g;
  }
  
  // Função para criar preview transparente do item
  function criarPreviewItem(itemId) {
    var preview = criarModeloItem(itemId);
    if (!preview) return null;

    // Aplicar material transparente em todos os meshes
    preview.traverse(function (obj) {
      if (obj.isMesh && obj.material) {
        // Clonar material para não afetar outros objetos
        var mat = obj.material.clone();
        mat.transparent = true;
        mat.opacity = 0.65;
        if (mat.emissive) mat.emissive.setHex(COR_PREVIEW_OK);
        if (mat.emissiveIntensity !== undefined) mat.emissiveIntensity = 0.35;
        mat.depthWrite = false;
        obj.renderOrder = 999;
        obj.material = mat;
      }
    });

    return preview;
  }
  
  // Função para animar itens colocados
  function animarItem(item, dt) {
    if (!item.userData.animado) return;
    
    var tipo = item.userData.tipo;
    
    if (item.userData.flutuando) {
      // Drone flutuando
      item.position.y = 0.8 + Math.sin(Date.now() * 0.002) * 0.1;
      item.rotation.y += dt * 0.5;
      
      // Girar hélices
      item.traverse(function(obj) {
        if (obj.geometry && obj.geometry.type === 'CylinderGeometry' && obj.position.y > 0.3) {
          obj.rotation.y += dt * 20;
        }
      });
    }
    
    if (item.userData.animaAgua) {
      // Gotejamento - animar gotas
      var tempo = Date.now() * 0.003;
      if (Math.random() < 0.05) {
        criarGotaAgua(item.position.x, item.position.z);
      }
    }
    
    if (item.userData.particulas) {
      // Composteira - partículas de vapor
      if (Math.random() < 0.02) {
        criarParticulaVapor(item.position.x, item.position.y + 0.4, item.position.z);
      }
    }
  }
  
  // Partículas de água
  function criarGotaAgua(x, z) {
    var gota = new THREE.Mesh(
      new THREE.SphereGeometry(0.02, 4, 4),
      materialBase(0x4a90a8, null, { transparent: true, opacity: 0.7 })
    );
    gota.position.set(x + (Math.random() - 0.5) * 0.3, 0.16, z + (Math.random() - 0.5) * 0.3);
    gota.userData.velocidade = -0.01;
    gota.userData.vida = 1.0;
    grupoDecoracoes.add(gota);
    modoConstrucao.particulas.push(gota);
  }
  
  // Partículas de vapor
  function criarParticulaVapor(x, y, z) {
    var vapor = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 4, 4),
      materialBase(0xcccccc, null, { transparent: true, opacity: 0.4 })
    );
    vapor.position.set(
      x + (Math.random() - 0.5) * 0.2, 
      y, 
      z + (Math.random() - 0.5) * 0.2
    );
    vapor.userData.velocidade = 0.005;
    vapor.userData.vida = 1.0;
    grupoDecoracoes.add(vapor);
    modoConstrucao.particulas.push(vapor);
  }
  
  // Função para cortar árvore decorativa
  function cortarArvore(arvore) {
    if (!arvore || !arvore.userData.podeCortar) return false;
    
    // Animação de corte
    var angulo = 0;
    var velocidade = 0.02;
    var intervalo = setInterval(function() {
      angulo += velocidade;
      velocidade += 0.001;
      arvore.rotation.z = angulo;
      arvore.position.y -= velocidade * 0.5;
      
      if (angulo > Math.PI / 2) {
        clearInterval(intervalo);
        // Remover árvore
        grupoDecoracoes.remove(arvore);
        
        // Remover obstáculo (só o da árvore: construções têm marca própria)
        var idx = obstaculos.findIndex(function(obs) {
          return !obs.construcao && obs.pos.distanceTo(arvore.position) < 0.1;
        });
        if (idx >= 0) obstaculos.splice(idx, 1);
        
        // Árvore nativa cortada. A pegada ecológica é calculada a partir
        // dos blocos (C.indiceDePegada), então não existe um "modificarPegada"
        // para chamar aqui: cortar a decoração não altera o placar.
        aviso('Árvore cortada! O terreno perdeu a sombra dela.', false);
        atualizarUI();
        
        // Criar toras no chão
        criarTorasNoChao(arvore.position.x, arvore.position.z);
      }
    }, 16);
    
    return true;
  }
  
  // Criar toras de madeira no chão
  function criarTorasNoChao(x, z) {
    for (var i = 0; i < 3; i++) {
      var tora = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8),
        materialBase(0x8b6f47, 'bark', { roughness: 0.9 })
      );
      tora.position.set(
        x + (Math.random() - 0.5) * 0.5,
        0.04,
        z + (Math.random() - 0.5) * 0.5
      );
      tora.rotation.z = Math.PI / 2;
      tora.rotation.y = Math.random() * Math.PI;
      tora.castShadow = true;
      tora.receiveShadow = true;
      grupoDecoracoes.add(tora);
    }
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

  function montarFerramentas() {
    var caixa = ui('ferramentas');
    caixa.textContent = '';
    
    FERRAMENTAS.forEach(function (f) {
      var b = document.createElement('button');
      b.type = 'button';
      b.dataset.ferramenta = f.id;
      b.setAttribute('title', f.nome); // Adiciona tooltip ao hover
      
      // Adicionar ícone SVG
      var icone = criarIconeSVG(f.id);
      icone.style.color = f.cor;
      b.appendChild(icone);
      
      // NÃO adicionar nome - apenas SVG
      
      b.addEventListener('click', function () {
        // Se clicar em "Modo Construção", liga ou desliga
        if (f.id === 'construcao') {
          if (!modoConstrucao.ativo) ativarModoConstrucao();
          else desativarModoConstrucao();
          return;
        }

        // Se modo construção está ativo e clicou em outra ferramenta, desativa
        if (modoConstrucao.ativo) desativarModoConstrucao();

        estado.ferramenta = f.id;
        marcarFerramenta();
        atualizarFerramentaMao();
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

    if (malhaFazendeiro && !modoConstrucao.ativo) {
      var mx = 0, mz = 0;
      var pulou = false;
      
      if (!livre.ligado) {
        var t = livre.teclas;
        if (t.w) mz -= 1;
        if (t.s) mz += 1;
        if (t.a) mx -= 1;
        if (t.d) mx += 1;
        if (t[' '] && fisica.noChao) {
          pulou = true;
          fisica.velocidadeY = fisica.forcaPulo;
          fisica.noChao = false;
        }
      }
      
      // === FISICA DE MOVIMENTO ===
      if (mx !== 0 || mz !== 0) {
        selecionado = null;
        malhaSelecao.visible = false;
        var norma = Math.sqrt(mx * mx + mz * mz);
        mx /= norma; mz /= norma;
        
        // Transformar movimento relativo à câmera
        var s = Math.sin(az);
        var c = Math.cos(az);
        var dirX = mx * c + mz * s;
        var dirZ = -mx * s + mz * c;
        
        // Aplicar aceleração
        fisica.velocidade.x += dirX * fisica.aceleracao;
        fisica.velocidade.z += dirZ * fisica.aceleracao;
        
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
        // Aplicar fricção
        fisica.velocidade.x *= fisica.friccao;
        fisica.velocidade.z *= fisica.friccao;
        
        if (selecionado) {
          var alvo = posicaoDe(selecionado);
          var dx = alvo[0] - malhaFazendeiro.position.x;
          var dz = alvo[2] - malhaFazendeiro.position.z;
          var distancia = Math.sqrt(dx * dx + dz * dz);
          
          if (distancia > 0.1) {
            malhaFazendeiro.position.x += dx * 0.12;
            malhaFazendeiro.position.z += dz * 0.12;
            malhaFazendeiro.rotation.y = Math.atan2(dx, dz);
          }
        }
      }
      
      // === APLICAR GRAVIDADE ===
      fisica.velocidadeY += fisica.gravidade;
      
      // Calcular nova posição
      var novaPosX = malhaFazendeiro.position.x + fisica.velocidade.x;
      var novaPosY = malhaFazendeiro.position.y + fisica.velocidadeY;
      var novaPosZ = malhaFazendeiro.position.z + fisica.velocidade.z;
      
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
      
      // === LIMITES DO MAPA ===
      var limite = (D.GRADE / 2 + 1) * STEP;
      novaPosX = Math.max(-limite, Math.min(limite, novaPosX));
      novaPosZ = Math.max(-limite, Math.min(limite, novaPosZ));
      
      // === CHÃO ===
      if (novaPosY <= 0) {
        novaPosY = 0;
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
      
      if (!livre.ligado) ajustarCamera(az, pol, dist);
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
      var hits = raio.intersectObjects(malhasBloco, false);
      return hits.length ? hits[0].object.userData.bloco : null;
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
