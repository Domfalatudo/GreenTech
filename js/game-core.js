(function (global) {
  'use strict';

  var D = global.RaizJogo;
  if (!D) { console.warn('Raiz: game-data.js nao carregou.'); return; }

  function criarBloco(x, z) {
    return {
      x: x, z: z,
      umidade: 0.3,
      fertilidade: 0.4,
      cultivo: null,
      estrutura: null,
      nativo: false,
      bloqueado: true,
      arado: false
    };
  }

  function chaveLote(lx, lz) { return lx + ':' + lz; }

  function estadoInicial() {
    var blocos = [];
    for (var z = 0; z < D.GRADE; z++) {
      for (var x = 0; x < D.GRADE; x++) blocos.push(criarBloco(x, z));
    }
    var centro = Math.floor(D.LADO_LOTE / 2);
    var estado = {
      blocos: blocos,
      lotes: { [chaveLote(centro, centro)]: true },
      dinheiro: 450,
      xp: 0,
      nivel: 1,
      energia: 12,
      energiaMax: 12,
      agua: 25,
      aguaMax: 40,
      graos: Object.assign({}, D.SEMENTES_INICIAIS),
      itens: { maos: 1, enxada: 1, regador: 1, arvore: 3, machado: 1 },
      ferramenta: 'maos',
      semente: 'milho',
      relogio: DIA_INICIO,
      clima: 'sol',
      dias: 1,
      estacao: 'manha',
      historico: [],
      construcoes: [],
      estatisticas: { colhidas: 0, plantadas: 0, lotes: 1 }
    };
    aplicarEstadoLote(estado, centro, centro, 'mato');
    // A previsão já nasce pronta: `previsao` guarda só os dias futuros, e o
    // dia 1 do tooltip é o próprio `estado.clima`.
    estado.previsao = [];
    garantirPrevisao(estado);
    return estado;
  }

  var DIA_INICIO = 0.3;

  function blocoEm(estado, x, z) {
    if (x < 0 || z < 0 || x >= D.GRADE || z >= D.GRADE) return null;
    return estado.blocos[z * D.GRADE + x];
  }

  function liberarBlocosDoLote(estado, lx, lz) {
    for (var dx = 0; dx < D.LOTE; dx++) {
      for (var dz = 0; dz < D.LOTE; dz++) {
        var b = blocoEm(estado, lx * D.LOTE + dx, lz * D.LOTE + dz);
        if (b) b.bloqueado = false;
      }
    }
  }

  function estadoLote(id) {
    var achados = Object.keys(D.ESTADOS_LOTE).map(function (k) { return D.ESTADOS_LOTE[k]; });
    for (var i = 0; i < achados.length; i++) {
      if (achados[i].id === id) return achados[i];
    }
    return D.ESTADOS_LOTE.ARIDO;
  }

  function aplicarEstadoLote(estado, lx, lz, estadoId) {
    var modelo = estadoLote(estadoId);
    for (var dx = 0; dx < D.LOTE; dx++) {
      for (var dz = 0; dz < D.LOTE; dz++) {
        var b = blocoEm(estado, lx * D.LOTE + dx, lz * D.LOTE + dz);
        if (!b) continue;
        b.umidade = modelo.umidade;
        b.fertilidade = modelo.fertilidade;
        b.nativo = estadoId === 'mato';
        b.bloqueado = false;
        b.cultivo = null;
        b.estrutura = null;
        b.arado = estadoId === 'fertil';
      }
    }
  }

  function lotesVizinhos(estado, lx, lz) {
    var vizinhos = [];
    var candidatos = [[lx - 1, lz], [lx + 1, lz], [lx, lz - 1], [lx, lz + 1]];
    candidatos.forEach(function (par) {
      var a = par[0];
      var b = par[1];
      if (a < 0 || b < 0 || a >= D.LADO_LOTE || b >= D.LADO_LOTE) return;
      if (estado.lotes[chaveLote(a, b)]) vizinhos.push({ lx: a, lz: b });
    });
    return vizinhos;
  }

  function lotesTodos(estado) {
    var lista = [];
    for (var lx = 0; lx < D.LADO_LOTE; lx++) {
      for (var lz = 0; lz < D.LADO_LOTE; lz++) {
        lista.push({ lx: lx, lz: lz, comprado: !!estado.lotes[chaveLote(lx, lz)] });
      }
    }
    return lista;
  }

  function ganharXp(estado, pontos) {
    estado.xp += pontos;
    var subiu = 0;
    while (estado.xp >= D.XP_POR_NIVEL(estado.nivel)) {
      estado.xp -= D.XP_POR_NIVEL(estado.nivel);
      estado.nivel++;
      subiu++;
    }
    return subiu;
  }

  function vizinhos(estado, bloco) {
    return [
      blocoEm(estado, bloco.x - 1, bloco.z),
      blocoEm(estado, bloco.x + 1, bloco.z),
      blocoEm(estado, bloco.x, bloco.z - 1),
      blocoEm(estado, bloco.x, bloco.z + 1)
    ].filter(function (b) { return b && !b.bloqueado; });
  }

  function raioDe(estado, bloco, alcance) {
    var lista = [];
    for (var dx = -alcance; dx <= alcance; dx++) {
      for (var dz = -alcance; dz <= alcance; dz++) {
        var b = blocoEm(estado, bloco.x + dx, bloco.z + dz);
        if (b && !b.bloqueado) lista.push(b);
      }
    }
    return lista;
  }

  function temItem(estado, id) { return (estado.itens[id] || 0) > 0; }


  function chaveConstrucao(c) { return c.blocoX + ':' + c.blocoZ; }

  function construcoesNoBloco(estado, blocoX, blocoZ) {
    if (!estado.construcoes) return [];
    return estado.construcoes.filter(function (c) {
      return c.blocoX === blocoX && c.blocoZ === blocoZ;
    });
  }

  function construcaoNoBloco(estado, bloco) {
    if (!bloco) return null;
    var achadas = construcoesNoBloco(estado, bloco.x, bloco.z);
    return achadas.length ? achadas[0] : null;
  }

  function construcoesNoLote(estado, blocoX, blocoZ) {
    if (!estado.construcoes) return [];
    var lx = Math.floor(blocoX / D.LOTE);
    var lz = Math.floor(blocoZ / D.LOTE);
    return estado.construcoes.filter(function (c) {
      return Math.floor(c.blocoX / D.LOTE) === lx && Math.floor(c.blocoZ / D.LOTE) === lz;
    });
  }

  function contarConstrucoes(estado, itemId) {
    if (!estado.construcoes) return 0;
    return estado.construcoes.filter(function (c) { return c.itemId === itemId; }).length;
  }

  function construcoesDoItem(estado, itemId) {
    return Math.max(0, (estado.itens[itemId] || 0) - contarConstrucoes(estado, itemId));
  }

  function conferirConstrucao(estado, bloco) {
    if (!bloco) return { ok: false, msg: 'Fora do terreno.' };
    if (bloco.bloqueado) return { ok: false, msg: 'Esse terreno ainda nao e seu.' };
    if (construcaoNoBloco(estado, bloco)) {
      return { ok: false, msg: 'Ja tem uma construcao nesse bloco.' };
    }
    if (bloco.cultivo) return { ok: false, msg: 'Ha cultivo nesse bloco. Colha antes de construir.' };
    if (bloco.estrutura) return { ok: false, msg: 'Ja existe uma estrutura nesse bloco.' };
    var limite = D.CONSTRUCOES && D.CONSTRUCOES.limitePorLote;
    if (limite && construcoesNoLote(estado, bloco.x, bloco.z).length >= limite) {
      return { ok: false, msg: 'Esse lote ja tem ' + limite + ' construcoes. Use outro lote.' };
    }
    return { ok: true, msg: '' };
  }

  function normalizarConstrucoes(estado) {
    var lista = Array.isArray(estado.construcoes) ? estado.construcoes : [];
    var vistos = {};
    var limpas = [];
    lista.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      if (!D.CONSTRUCOES || !D.CONSTRUCOES.itens[c.itemId]) return;
      var bx = Math.floor(c.blocoX);
      var bz = Math.floor(c.blocoZ);
      if (!isFinite(bx) || !isFinite(bz)) return;
      if (bx < 0 || bz < 0 || bx >= D.GRADE || bz >= D.GRADE) return;
      var bloco = estado.blocos[bz * D.GRADE + bx];
      if (!bloco || bloco.bloqueado) return;
      if (bloco.cultivo || bloco.estrutura) return;
      var chave = bx + ':' + bz;
      if (vistos[chave]) return;
      vistos[chave] = true;
      var giro = Math.floor(c.rotacao) || 0;
      limpas.push({ itemId: c.itemId, blocoX: bx, blocoZ: bz, rotacao: ((giro % 4) + 4) % 4 });
    });
    estado.construcoes = limpas;
    return limpas;
  }

  function aplicarEfeitoDeEstrutura(estado, estrutura, bloco) {
    var modelo = D.EQUIPAMENTOS[estrutura];
    if (!modelo) return;
    if (modelo.refloresta) {
      bloco.nativo = true;
    }
  }


  function itemDirigivel(itemId) {
    var item = D.CONSTRUCOES && D.CONSTRUCOES.itens[itemId];
    return !!(item && item.dirigivel);
  }

  function conferirDirecao(estado, construcao) {
    if (!construcao) return { ok: false, msg: 'Nada para dirigir aqui.' };
    if (!itemDirigivel(construcao.itemId)) {
      return { ok: false, msg: nomeDeItem(construcao.itemId) + ' nao se dirige.' };
    }
    var bloco = blocoEm(estado, construcao.blocoX, construcao.blocoZ);
    if (!bloco || bloco.bloqueado) {
      return { ok: false, msg: 'O terreno desse veiculo sumiu. Recoloque-o.' };
    }
    return { ok: true, msg: '' };
  }

  function dirigirParaBloco(estado, construcao, blocoX, blocoZ) {
    if (!construcao) return { ok: false, msg: 'Veiculo desconhecido.' };
    if (construcao.blocoX === blocoX && construcao.blocoZ === blocoZ) {
      return { ok: true, msg: '', construcao: construcao };
    }
    var alvo = blocoEm(estado, blocoX, blocoZ);
    if (!alvo) return { ok: false, msg: 'Fora do terreno.' };
    if (alvo.bloqueado) return { ok: false, msg: 'Esse terreno ainda nao e seu.' };
    if (alvo.cultivo) return { ok: false, msg: 'Ha cultivo nesse bloco.' };
    if (alvo.estrutura) return { ok: false, msg: 'Ja existe uma estrutura nesse bloco.' };
    var ocupadas = construcoesNoBloco(estado, blocoX, blocoZ);
    for (var i = 0; i < ocupadas.length; i++) {
      if (ocupadas[i] !== construcao) {
        return { ok: false, msg: 'Ja tem uma construcao nesse bloco.' };
      }
    }
    construcao.blocoX = blocoX;
    construcao.blocoZ = blocoZ;
    return { ok: true, msg: '', construcao: construcao };
  }

  function prepararAoPassar(estado, itemId, bloco) {
    var modelo = D.EQUIPAMENTOS[itemId];
    if (!modelo || !modelo.prepara) return { ok: false, msg: '' };
    if (!bloco || bloco.bloqueado) return { ok: false, msg: '' };
    var custo = modelo.energia ? Math.max(1, Math.round(modelo.energia * 0.34)) : 0;
    if (custo && estado.energia < custo) {
      return { ok: false, msg: 'Energia insuficiente para o ' + modelo.nome + ' (' + custo + ' necessarios).' };
    }
    if (custo) estado.energia -= custo;
    bloco.arado = true;
    if (bloco.nativo) bloco.nativo = false;
    bloco.fertilidade = Math.min(1, bloco.fertilidade + 0.1);
    bloco.umidade = Math.min(1, bloco.umidade + 0.08);
    return { ok: true, msg: '' };
  }

  function nomeDeItem(itemId) {
    var construcao = D.CONSTRUCOES && D.CONSTRUCOES.itens[itemId];
    if (construcao) return construcao.nome;
    var equip = D.EQUIPAMENTOS[itemId] || D.ENERGIA[itemId];
    return equip ? equip.nome : itemId;
  }

  var AÇÕES = {
    plantar: function (estado, bloco) {
      if (bloco.bloqueado) return { ok: false, msg: 'Esse lote ainda nao e seu.' };
      if (construcaoNoBloco(estado, bloco)) {
        return { ok: false, msg: 'Ha uma construcao aqui. Remova antes de plantar.' };
      }
      if (!bloco.arado) return { ok: false, msg: 'Prepare o solo com a enxada antes de plantar.' };
      if (bloco.cultivo) return { ok: false, msg: 'Ja tem algo plantado aqui.' };
      if (bloco.fertilidade < 0.15) return { ok: false, msg: 'Solo pobre demais. Adube antes.' };
      var cultura = D.CULTURAS[estado.semente];
      if (!cultura) return { ok: false, msg: 'Escolha uma semente.' };
      
      
      if ((estado.graos[estado.semente] || 0) <= 0) {
        return { ok: false, msg: 'Sem sementes de ' + cultura.nome + '.' };
      }
      estado.graos[estado.semente]--;
      bloco.cultivo = { id: cultura.id, progresso: 0, pronto: false };
      estado.estatisticas.plantadas++;
      ganharXp(estado, 3);
      return { ok: true, msg: cultura.nome + ' plantado.', tipo: 'plantio' };
    },

    regar: function (estado, bloco) {
      if (bloco.bloqueado) return { ok: false, msg: 'Esse lote ainda nao e seu.' };
      if (bloco.umidade > 0.92) return { ok: false, msg: 'O solo ja esta encharcado.' };
      if (estado.agua <= 0) return { ok: false, msg: 'Sem agua guardada. A chuva ajuda.' };
      estado.agua -= 1;
      bloco.umidade = Math.min(1, bloco.umidade + 0.12);
      return { ok: true, msg: 'Bloco regado.', tipo: 'agua' };
    },

    adubar: function (estado, bloco) {
      if (bloco.bloqueado) return { ok: false, msg: 'Esse lote ainda nao e seu.' };
      if (estado.dinheiro < 8) return { ok: false, msg: 'Adubo custa $8.' };
      estado.dinheiro -= 8;
      bloco.fertilidade = Math.min(1, bloco.fertilidade + 0.22);
      ganharXp(estado, 4);
      return { ok: true, msg: 'Adubo organico aplicado.', tipo: 'adubo' };
    },

    colher: function (estado, bloco) {
      if (!bloco.cultivo || !bloco.cultivo.pronto) {
        return { ok: false, msg: 'Nada maduro para colher.' };
      }
      var cultura = D.CULTURAS[bloco.cultivo.id];
      var valor = Math.round(cultura.vende * (0.6 + bloco.fertilidade * 0.6));
      estado.dinheiro += valor;
      estado.estatisticas.colhidas++;
      bloco.cultivo = null;
      bloco.umidade = Math.max(0, bloco.umidade - 0.12);
      var subiu = ganharXp(estado, cultura.xp);
      return {
        ok: true,
        msg: 'Colheita de ' + cultura.nome + ': $' + valor + (subiu ? ' - nivel ' + estado.nivel + '!' : ''),
        tipo: 'colheita',
        valor: valor
      };
    }
  };

  function usarEquipamento(estado, id, bloco) {
    if (id === 'maos') {
      return { ok: true, msg: 'Você está apenas observando.', tipo: 'nada' };
    }
    
    if (!temItem(estado, id)) return { ok: false, msg: 'Voce nao tem esse equipamento.' };
    var modelo = D.EQUIPAMENTOS[id];
    if (!modelo) return { ok: false, msg: 'Equipamento desconhecido.' };
    
    
    if (bloco.bloqueado) return { ok: false, msg: 'Esse lote ainda nao e seu.' };

    if (modelo._passivo) {
      if (estado.itens[id] > 1) return { ok: false, msg: 'Esse equipamento ja esta instalado.' };
      return { ok: false, msg: modelo.nome + ' e instalado na loja, uma unidade so.' };
    }

    if (modelo.energia && estado.energia < modelo.energia) {
      return { ok: false, msg: 'Energia insuficiente (' + modelo.energia + ' necessarios).' };
    }
    if (modelo.energia) estado.energia -= modelo.energia;

    var afetados = modelo.raio ? raioDe(estado, bloco, modelo.raio) : [bloco];
    var resumo = [];

    if (modelo.planta) {
      afetados.forEach(function (b) {
        var r = AÇÕES.plantar(estado, b);
        if (r.ok) resumo.push(1);
      });
      if (!resumo.length) return { ok: false, msg: 'Nenhum bloco livre por perto para semear.' };
      return { ok: true, msg: 'Drone semeou ' + resumo.length + ' bloco(s).', tipo: 'drone' };
    }

    if (modelo.colhe) {
      afetados.forEach(function (b) {
        var r = AÇÕES.colher(estado, b);
        if (r.ok) resumo.push(r);
      });
      if (!resumo.length) return { ok: false, msg: 'Nada maduro por perto.' };
      var total = resumo.reduce(function (s, r) { return s + r.valor; }, 0);
      return { ok: true, msg: 'Colheita automatica: ' + resumo.length + ' bloco(s), $' + total + '.', tipo: 'colheita' };
    }

    if (modelo.prepara) {
      afetados.forEach(function (b) {
        b.fertilidade = Math.min(1, b.fertilidade + 0.18);
        b.umidade = Math.min(1, b.umidade + 0.15);
        aplicarEfeitoDeEstrutura(estado, id, b);
      });
      return {
        ok: true,
        msg: modelo.nome + ' preparou ' + afetados.length + ' bloco(s).',
        tipo: 'tractor'
      };
    }

    if (modelo.refloresta) {
      if (bloco.estrutura) return { ok: false, msg: 'Ja existe algo aqui.' };
      if (construcaoNoBloco(estado, bloco)) {
        return { ok: false, msg: 'Ha uma construcao nesse bloco. Remova antes de plantar.' };
      }
      bloco.estrutura = 'arvore';
      bloco.nativo = true;
      ganharXp(estado, 5);
      return { ok: true, msg: 'Arvore nativa plantada.', tipo: 'arvore' };
    }

    if (id === 'regador') return AÇÕES.regar(estado, bloco);
    if (id === 'enxada') {
      if (bloco.cultivo) {
        if (bloco.cultivo.pronto) {
          var cultura = D.CULTURAS[bloco.cultivo.id];
          var valor = Math.round(cultura.vende * (0.6 + bloco.fertilidade * 0.6));
          estado.dinheiro += valor;
          estado.estatisticas.colhidas++;
          bloco.cultivo = null;
          bloco.umidade = Math.max(0, bloco.umidade - 0.12);
          var subiu = ganharXp(estado, cultura.xp);
          return {
            ok: true,
            msg: 'Colheita de ' + cultura.nome + ': $' + valor + '.' + (subiu ? ' Nivel ' + estado.nivel + '!' : ''),
            tipo: 'colheita',
            valor: valor
          };
        } else {
          return { ok: false, msg: 'A plantacao ainda nao esta madura.' };
        }
      }
      
      if (bloco.arado) {
        bloco.arado = false;
        bloco.nativo = true;
        return { ok: true, msg: 'Solo nivelado. Vegetacao retorna.', tipo: 'enxada' };
      }
      
      bloco.arado = true;
      bloco.fertilidade = Math.min(1, bloco.fertilidade + 0.12);
      if (bloco.nativo) bloco.nativo = false;
      return { ok: true, msg: 'Solo preparado para plantio.', tipo: 'enxada' };
    }
    if (id === 'machado') {
      if (bloco.estrutura === 'arvore' || bloco.nativo) {
        bloco.estrutura = null;
        bloco.nativo = false;
        estado.dinheiro += 20;
        ganharXp(estado, 15);
        return { ok: true, msg: 'Arvore cortada! +$20 e +15 XP.', tipo: 'machado' };
      }
      return { ok: false, msg: 'Nao ha arvore para cortar neste bloco.' };
    }
    return { ok: false, msg: 'Sem efeito definido.' };
  }

  function comprarSemente(estado, id, qtd) {
    var cultura = D.CULTURAS[id];
    if (!cultura) return { ok: false, msg: 'Cultura desconhecida.' };
    var custo = cultura.semente * (qtd || 1);
    if (estado.dinheiro < custo) return { ok: false, msg: 'Faltam $' + (custo - estado.dinheiro) + '.' };
    estado.dinheiro -= custo;
    estado.graos[id] = (estado.graos[id] || 0) + (qtd || 1);
    return { ok: true, msg: qtd + ' semente(s) de ' + cultura.nome + '.', tipo: 'compra' };
  }

  function comprarItem(estado, id) {
    var modelo = D.EQUIPAMENTOS[id] || D.ENERGIA[id];
    if (!modelo) return { ok: false, msg: 'Item desconhecido.' };
    
    
    var ehItemEnergia = !!D.ENERGIA[id];
    if (ehItemEnergia && !D.EQUIPAMENTOS[id] && modelo.capacidade === undefined) {
      var extra = (estado.itens[id] || 0) + 1;
      var preco = Math.round(modelo.custo * (1 + extra * 0.35));
      if (estado.dinheiro < preco) return { ok: false, msg: 'Faltam $' + (preco - estado.dinheiro) + '.' };
      estado.dinheiro -= preco;
      estado.itens[id] = extra;
      return { ok: true, msg: modelo.nome + ' comprado por $' + preco + '.', tipo: 'compra' };
    }
    
    if (estado.dinheiro < modelo.custo) {
      return { ok: false, msg: 'Faltam $' + (modelo.custo - estado.dinheiro) + '.' };
    }
    estado.dinheiro -= modelo.custo;
    estado.itens[id] = (estado.itens[id] || 0) + 1;
    if (id === 'bateria') estado.energiaMax += modelo.capacidade;
    if (id === 'caixa') estado.aguaMax += modelo.capacidadeAgua;
    return { ok: true, msg: modelo.nome + ' comprado por $' + modelo.custo + '.', tipo: 'compra' };
  }

  function expandir(estado, lx, lz, estadoId) {
    var chave = chaveLote(lx, lz);
    if (estado.lotes[chave]) return { ok: false, msg: 'Esse lote ja e seu.' };
    var vizinhos = lotesVizinhos(estado, lx, lz);
    if (!vizinhos.length) {
      return { ok: false, msg: 'Voce precisa de um lote vizinho para expandir.' };
    }
    var modelo = estadoLote(estadoId);
    if (estado.dinheiro < modelo.custo) {
      return { ok: false, msg: 'Faltam $' + (modelo.custo - estado.dinheiro) + '.' };
    }
    estado.dinheiro -= modelo.custo;
    estado.lotes[chave] = true;
    aplicarEstadoLote(estado, lx, lz, estadoId);
    estado.estatisticas.lotes = Object.keys(estado.lotes).length;
    ganharXp(estado, 12 + modelo.bonus);
    return {
      ok: true,
      msg: 'Lote liberado: ' + modelo.nome + '.',
      tipo: 'expansao'
    };
  }

  // ===== CICLO DO CLIMA =====
  // A previsão semanal não é enfeite: o clima dos próximos dias é sorteado
  // ANTES de acontecer e guardado em `estado.previsao`. Quando o dia vira,
  // o clima real passa a ser o primeiro item dessa fila e um dia novo é
  // sorteado no fim. Assim o que o jogador vê no tooltip é exatamente o que
  // vai acontecer, e não um sorteio independente que nunca casaria.
  // O peso do clima anterior continua pela metade, evitando dois dias
  // iguais seguidos com frequência.
  //
  // `estado.clima` é SEMPRE o dia de hoje. `estado.previsao` guarda apenas os
  // dias que ainda vão acontecer (amanhã em diante). Separar os dois é o que
  // impede a fila de dessincronizar: não existe um índice que precisa "casar"
  // com o clima atual, porque são coisas diferentes por desenho.

  var DIAS_PREVISAO = 7;
  var DIAS_FUTUROS = DIAS_PREVISAO - 1;

  function sortearProximoClima(anterior) {
    var chaves = Object.keys(D.PESOS_CLIMA);
    var pesos = chaves.map(function (k) {
      return k === anterior ? D.PESOS_CLIMA[k] * 0.5 : D.PESOS_CLIMA[k];
    });
    var total = pesos.reduce(function (s, p) { return s + p; }, 0);
    var alvo = Math.random() * total;
    for (var i = 0; i < chaves.length; i++) {
      alvo -= pesos[i];
      if (alvo <= 0) return chaves[i];
    }
    return 'sol';
  }

  // Completa a fila de dias futuros. Um save antigo chega sem `previsao` (ou
  // com a fila curta) e é preenchido a partir do clima já salvo, sem que a
  // fazenda seja perdida e sem inventar um dia diferente do que está valendo.
  function garantirPrevisao(estado) {
    if (!Array.isArray(estado.previsao)) estado.previsao = [];
    // descarta lixo: só ids de clima que existem no jogo
    estado.previsao = estado.previsao.filter(function (c) {
      return !!D.CLIMAS[c];
    });
    while (estado.previsao.length < DIAS_FUTUROS) {
      var anterior = estado.previsao.length
        ? estado.previsao[estado.previsao.length - 1]
        : estado.clima;
      estado.previsao.push(sortearProximoClima(anterior));
    }
    if (estado.previsao.length > DIAS_FUTUROS) {
      estado.previsao = estado.previsao.slice(0, DIAS_FUTUROS);
    }
    return estado.previsao;
  }

  // Vira o dia: o clima de hoje passa a ser o primeiro dia futuro, e um dia
  // novo é sorteado no fim da fila. Usado só quando o relógio vira o dia.
  function avancarPrevisao(estado) {
    garantirPrevisao(estado);
    estado.clima = estado.previsao.shift();
    estado.previsao.push(sortearProximoClima(estado.clima));
    return estado.clima;
  }

  // Os 7 dias que o tooltip mostra: hoje e os próximos.
  function previsaoClima(estado) {
    return [estado.clima].concat(garantirPrevisao(estado).slice(0, DIAS_FUTUROS));
  }

  function ehNoite(estado) {
    var h = estado.relogio;
    return h < 0.22 || h > 0.82;
  }

  function ehDia(estado) { return !ehNoite(estado); }

  function estacaoDe(estado) {
    var h = estado.relogio;
    if (h < 0.22) return 'madrugada';
    if (h < 0.35) return 'amanhecer';
    if (h < 0.68) return 'dia';
    if (h < 0.82) return 'entardecer';
    return 'noite';
  }

  function producaoEnergia(estado) {
    var clima = D.CLIMAS[estado.clima];
    var noite = ehNoite(estado);
    var geracao = 0;
    var consumo = 0;
    var capacidade = 0;
    Object.keys(estado.itens).forEach(function (id) {
      var qtd = estado.itens[id];
      var painel = D.ENERGIA[id];
      if (painel) {
        if (painel.gera) {
          var base = noite ? painel.gera.noite : painel.gera.dia;
          geracao += base * qtd * (noite ? clima.vento + 0.35 : clima.solar);
        }
        if (painel.capacidade) capacidade += painel.capacidade * qtd;
        if (painel.custoEnergia) consumo += painel.custoEnergia * qtd * (noite ? 1 : 0.4);
      }
      var equip = D.EQUIPAMENTOS[id];
      if (equip && equip._passivo && equip.energia) consumo += equip.energia * qtd * 0.5;
    });
    return { geracao: geracao, consumo: consumo, capacidade: capacidade };
  }

  function passoSimulacao(estado, dt) {
    // O `dt` chega do requestAnimationFrame e pode ser enorme: aba em segundo
    // plano, máquina dormindo, travada. Sem este teto, um único quadro de 5
    // segundos fazia o relógio saltar e o dia virar uma vez só, jogando fora
    // todo o tempo no meio. Com o teto o mundo anda devagar em vez de
    // teleportar, que é o comportamento previsível para o jogador.
    if (!(dt > 0)) dt = 0;
    var dtSeguro = Math.min(dt, D.DT_MAXIMO);

    estado.relogio += dtSeguro / D.DIA_SEGUNDOS;
    var virouDia = false;
    // `while` e nao `if`: um dt grande pode atravessar mais de um dia inteiro
    // e cada um precisa virar o dia (e puxar o clima da previsão) na ordem.
    while (estado.relogio >= 1) {
      estado.relogio -= 1;
      estado.dias++;
      virouDia = true;
      avancarPrevisao(estado);
    }
    estado.estacao = estacaoDe(estado);

    var clima = D.CLIMAS[estado.clima];
    var noite = ehNoite(estado);
    var producao = producaoEnergia(estado);
    estado.energiaMax = Math.max(8, producao.capacidade);
    estado.energia = Math.max(0, Math.min(estado.energiaMax,
      estado.energia + (producao.geracao - producao.consumo) * dt * 0.5));

    if (clima.chuva) {
      var ganho = clima.chuva * dt * 0.9;
      estado.agua = Math.min(estado.aguaMax, estado.agua + ganho * 0.6);
    }

    var passo = dt * 0.5;
    estado.blocos.forEach(function (b) {
      if (b.bloqueado) return;

      var irrigado = vizinhos(estado, b).some(function (v) { return v.estrutura === 'gotejamento'; });
      var composto = vizinhos(estado, b).some(function (v) { return v.estrutura === 'composteira'; });

      if (clima.chuva) b.umidade = Math.min(1, b.umidade + clima.umidade * passo);
      else if (irrigado) b.umidade = Math.min(1, b.umidade + 0.09 * passo);
      else b.umidade = Math.max(0, b.umidade + clima.umidade * passo);

      if (composto) {
        b.fertilidade = Math.min(1, b.fertilidade + 0.05 * passo);
      }
      if (b.nativo) {
        b.fertilidade = Math.min(1, b.fertilidade + 0.015 * passo);
      }
      if (b.umidade < 0.2) {
        b.fertilidade = Math.max(0, b.fertilidade - 0.012 * passo);
      }

      if (b.cultivo && !b.cultivo.pronto) {
        var cultura = D.CULTURAS[b.cultivo.id];
        var aguaOk = b.umidade >= cultura.agua * 0.45;
        if (noite) b.cultivo.progresso += 0.35 * passo;
        else b.cultivo.progresso += (aguaOk ? 1 : 0.35) * passo;
        if (b.cultivo.progresso >= cultura.dias) {
          b.cultivo.progresso = cultura.dias;
          b.cultivo.pronto = true;
        }
      }
    });

    return { virouDia: virouDia, noite: noite };
  }

  function salvar(estado) {
    try {
      global.localStorage.setItem(D.CHAVE_SAVE, JSON.stringify(estado));
      return true;
    } catch (erro) {
      return false;
    }
  }

  var CAMPOS_OBRIGATORIOS = [
    'blocos', 'lotes', 'dinheiro', 'xp', 'nivel', 'energia', 'energiaMax',
    'agua', 'aguaMax', 'graos', 'itens', 'ferramenta', 'semente', 'relogio',
    'clima', 'dias', 'estatisticas'
  ];
  function migrarSave(dados) {
    if (!dados || !dados.blocos) return null;
    if (dados.blocos.length === D.GRADE * D.GRADE) return dados;
    if (dados.blocos.length === 144 && D.GRADE === 18) {
      try {
        var novo = estadoInicial();
        novo.dinheiro = Math.max(novo.dinheiro, dados.dinheiro || 0);
        novo.xp = dados.xp || 0;
        novo.nivel = dados.nivel || 1;
        novo.energia = dados.energia || novo.energia;
        novo.energiaMax = Math.max(novo.energiaMax, dados.energiaMax || 12);
        novo.agua = dados.agua || novo.agua;
        novo.aguaMax = Math.max(novo.aguaMax, dados.aguaMax || 40);
        novo.graos = Object.assign({}, novo.graos, dados.graos || {});
        novo.itens = Object.assign({}, novo.itens, dados.itens || {});
        novo.estatisticas = Object.assign({}, novo.estatisticas, dados.estatisticas || {});

        var offsetBloco = 3;
        var offsetLote = 1;

        novo.lotes = {};
        Object.keys(dados.lotes || {}).forEach(function (chave) {
          var partes = chave.split(':').map(Number);
          novo.lotes[chaveLote(partes[0] + offsetLote, partes[1] + offsetLote)] = true;
        });
        var centro = Math.floor(D.LADO_LOTE / 2);
        novo.lotes[chaveLote(centro, centro)] = true;

        for (var i = 0; i < dados.blocos.length; i++) {
          var velho = dados.blocos[i];
          var destino = blocoEm(novo, velho.x + offsetBloco, velho.z + offsetBloco);
          if (destino) {
            destino.umidade = velho.umidade;
            destino.fertilidade = velho.fertilidade;
            destino.cultivo = velho.cultivo;
            destino.estrutura = velho.estrutura;
            destino.nativo = velho.nativo;
            destino.bloqueado = velho.bloqueado;
            destino.arado = velho.arado || false;
          }
        }

        if (Array.isArray(dados.construcoes)) {
          novo.construcoes = dados.construcoes.map(function (c) {
            return Object.assign({}, c, {
              blocoX: c.blocoX + offsetBloco,
              blocoZ: c.blocoZ + offsetBloco
            });
          });
        }
        return novo;
      } catch (err) {
        console.warn('Raiz: falha na migração do save.', err);
        return null;
      }
    }
    return null;
  }

  function carregar() {
    try {
      var bruto = global.localStorage.getItem(D.CHAVE_SAVE);
      if (!bruto) return null;
      var dados = JSON.parse(bruto);
      if (dados && dados.blocos && dados.blocos.length !== D.GRADE * D.GRADE) {
        var migrado = migrarSave(dados);
        if (migrado) {
          salvar(migrado);
          return migrado;
        }
        return null;
      }
      if (!dados || !dados.blocos || dados.blocos.length !== D.GRADE * D.GRADE) return null;
      for (var i = 0; i < CAMPOS_OBRIGATORIOS.length; i++) {
        if (dados[CAMPOS_OBRIGATORIOS[i]] === undefined || dados[CAMPOS_OBRIGATORIOS[i]] === null) {
          console.warn('Raiz: save incompleto, comecando uma fazenda nova.');
          return null;
        }
      }
      for (var b = 0; b < dados.blocos.length; b++) {
        var bloco = dados.blocos[b];
        if (!bloco || bloco.x === undefined || bloco.z === undefined ||
            bloco.umidade === undefined || bloco.fertilidade === undefined ||
            bloco.bloqueado === undefined) {
          console.warn('Raiz: bloco corrompido no save, comecando uma fazenda nova.');
          return null;
        }
      }
      normalizarConstrucoes(dados);
      // Saves antigos não têm a fila de previsão: monta agora a partir do
      // clima que já estava salvo, sem perder a fazenda.
      garantirPrevisao(dados);
      return dados;
    } catch (erro) {
      console.warn('Raiz: nao consegui ler o save.', erro);
      return null;
    }
  }

  function apagar() {
    try { global.localStorage.removeItem(D.CHAVE_SAVE); } catch (erro) { }
  }

  function iniciar() {
    return carregar() || estadoInicial();
  }

  global.RaizJogoCore = {
    D: D,
    iniciar: iniciar,
    salvar: salvar,
    carregar: carregar,
    apagar: apagar,
    blocoEm: blocoEm,
    acoes: AÇÕES,
    usarEquipamento: usarEquipamento,
    comprarSemente: comprarSemente,
    comprarItem: comprarItem,
    expandir: expandir,
    passoSimulacao: passoSimulacao,
    previsaoClima: previsaoClima,
    avancarPrevisao: avancarPrevisao,
    producaoEnergia: producaoEnergia,
    ganharXp: ganharXp,
    ehNoite: ehNoite,
    estacaoDe: estacaoDe,
    lotesTodos: lotesTodos,
    lotesVizinhos: lotesVizinhos,
    chaveLote: chaveLote,
    temItem: temItem,
    conferirConstrucao: conferirConstrucao,
    construcaoNoBloco: construcaoNoBloco,
    construcoesNoBloco: construcoesNoBloco,
    construcoesNoLote: construcoesNoLote,
    contarConstrucoes: contarConstrucoes,
    construcoesDoItem: construcoesDoItem,
    chaveConstrucao: chaveConstrucao,
    normalizarConstrucoes: normalizarConstrucoes,
    itemDirigivel: itemDirigivel,
    conferirDirecao: conferirDirecao,
    dirigirParaBloco: dirigirParaBloco,
    prepararAoPassar: prepararAoPassar,
    nomeDeItem: nomeDeItem
  };
})(window);
