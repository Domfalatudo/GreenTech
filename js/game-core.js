(function (global) {
  'use strict';

  var D = global.RaizJogo;
  if (!D) { console.warn('Raiz: game-data.js nao carregou.'); return; }

  function criarBloco(x, z) {
    return {
      x: x, z: z,
      umidade: 0.3,
      fertilidade: 0.4,
      poluicao: 0.1,
      cultivo: null,
      estrutura: null,
      nativo: false,
      bloqueado: true
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
      dinheiro: 320,
      xp: 0,
      nivel: 1,
      energia: 8,
      energiaMax: 8,
      agua: 12,
      aguaMax: 30,
      graos: Object.assign({}, D.SEMENTES_INICIAIS),
      itens: { enxada: 1, regador: 1, arvore: 2 },
      ferramenta: 'enxada',
      semente: 'milho',
      relogio: DIA_INICIO,
      clima: 'sol',
      dias: 1,
      estacao: 'manha',
      historico: [],
      estatisticas: { colhidas: 0, plantadas: 0, lotes: 1,BEST: 0 }
    };
    aplicarEstadoLote(estado, centro, centro, 'mato');
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
        b.poluicao = modelo.poluicao;
        b.nativo = estadoId === 'mato';
        b.bloqueado = false;
        b.cultivo = null;
        b.estrutura = null;
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

  function indiceDePegada(estado) {
    var total = 0;
    var conta = 0;
    var nativos = 0;
    estado.blocos.forEach(function (b) {
      if (b.bloqueado) return;
      conta++;
      total += (b.fertilidade * 0.5 + b.umidade * 0.2 + (1 - b.poluicao) * 0.3);
      if (b.nativo) nativos++;
    });
    if (!conta) return 0;
    var base = (total / conta) * 100;
    var bonus = conta ? Math.min(6, (nativos / conta) * 8) : 0;
    var renovavel = Object.keys(estado.itens).reduce(function (s, id) {
      var item = D.ENERGIA[id];
      return s + (item && item.gera ? (item.gera.dia + item.gera.noite) : 0);
    }, 0);
    var fossseis = Object.keys(estado.itens).reduce(function (s, id) {
      var item = D.EQUIPAMENTOS[id];
      return s + (item && item.polui > 0 ? 1 : 0);
    }, 0);
    var energia = renovavel ? Math.min(18, renovavel * 1.6) - Math.min(14, fossseis * 3.5) : 0;
    return Math.max(0, Math.min(100, Math.round(base + bonus + energia)));
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

  function aplicarEfeitoDeEstrutura(estado, estrutura, bloco) {
    var modelo = D.EQUIPAMENTOS[estrutura];
    if (!modelo) return;
    if (modelo.polui) bloco.poluicao = Math.min(1, bloco.poluicao + modelo.polui * 0.35);
    if (modelo.refloresta) {
      bloco.nativo = true;
      bloco.poluicao = Math.max(0, bloco.poluicao - 0.1);
    }
  }

  var AÇÕES = {
    plantar: function (estado, bloco) {
      if (bloco.bloqueado) return { ok: false, msg: 'Esse lote ainda nao e seu.' };
      if (bloco.cultivo) return { ok: false, msg: 'Ja tem algo plantado aqui.' };
      if (bloco.fertilidade < 0.15) return { ok: false, msg: 'Solo pobre demais. Adube antes.' };
      var cultura = D.CULTURAS[estado.semente];
      if (!cultura) return { ok: false, msg: 'Escolha uma semente.' };
      if (cultura.nivel > estado.nivel) {
        return { ok: false, msg: cultura.nome + ' desbloqueia no nivel ' + cultura.nivel + '.' };
      }
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
      bloco.umidade = Math.min(1, bloco.umidade + 0.3);
      return { ok: true, msg: 'Bloco regado.', tipo: 'agua' };
    },

    adubar: function (estado, bloco) {
      if (bloco.bloqueado) return { ok: false, msg: 'Esse lote ainda nao e seu.' };
      if (estado.dinheiro < 8) return { ok: false, msg: 'Adubo custa $8.' };
      estado.dinheiro -= 8;
      bloco.fertilidade = Math.min(1, bloco.fertilidade + 0.22);
      bloco.poluicao = Math.max(0, bloco.poluicao - 0.2);
      ganharXp(estado, 4);
      return { ok: true, msg: 'Adubo organico aplicado.', tipo: 'adubo' };
    },

    despoluir: function (estado, bloco) {
      if (bloco.poluicao < 0.05) return { ok: false, msg: 'Esse bloco nao tem residuo.' };
      if (estado.dinheiro < 25) return { ok: false, msg: 'A limpeza custa $25.' };
      if (estado.energia < 2) return { ok: false, msg: 'Precisa de 2 de energia.' };
      estado.dinheiro -= 25;
      estado.energia -= 2;
      bloco.poluicao = Math.max(0, bloco.poluicao - 0.35);
      ganharXp(estado, 6);
      return { ok: true, msg: 'Residuos removidos.', tipo: 'limpeza' };
    },

    colher: function (estado, bloco) {
      if (!bloco.cultivo || !bloco.cultivo.pronto) {
        return { ok: false, msg: 'Nada maduro para colher.' };
      }
      var cultura = D.CULTURAS[bloco.cultivo.id];
      var bonus = 1 + (indiceDePegada(estado) / 100) * 0.6;
      var valor = Math.round(cultura.vende * bonus * (0.6 + bloco.fertilidade * 0.6));
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
    if (!temItem(estado, id)) return { ok: false, msg: 'Voce nao tem esse equipamento.' };
    var modelo = D.EQUIPAMENTOS[id];
    if (!modelo) return { ok: false, msg: 'Equipamento desconhecido.' };
    if (modelo.nivel > estado.nivel) {
      return { ok: false, msg: modelo.nome + ' desbloqueia no nivel ' + modelo.nivel + '.' };
    }
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
        msg: modelo.nome + ' preparou ' + afetados.length + ' bloco(s).' +
          (modelo.polui ? ' O solo ficou mais poluido.' : ''),
        tipo: 'tractor'
      };
    }

    if (modelo.refloresta) {
      if (bloco.estrutura) return { ok: false, msg: 'Ja existe algo aqui.' };
      bloco.estrutura = 'arvore';
      bloco.nativo = true;
      bloco.poluicao = Math.max(0, bloco.poluicao - 0.15);
      ganharXp(estado, 5);
      return { ok: true, msg: 'Arvore nativa plantada.', tipo: 'arvore' };
    }

    if (id === 'regador') return AÇÕES.regar(estado, bloco);
    if (id === 'enxada') {
      bloco.fertilidade = Math.min(1, bloco.fertilidade + 0.12);
      return { ok: true, msg: 'Solo remexido.', tipo: 'enxada' };
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
    if (modelo.nivel > estado.nivel) {
      return { ok: false, msg: modelo.nome + ' desbloqueia no nivel ' + modelo.nivel + '.' };
    }
    var repetivel = D.ENERGIA[id];
    if (repetivel && !D.EQUIPAMENTOS[id] && estado.itens[id] && modelo.capacidade === undefined) {
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
      msg: 'Lote liberado: ' + modelo.nome + (modelo.bonus ? ' (+' + modelo.bonus + ' pts ecologicos)' : '') + '.',
      tipo: 'expansao'
    };
  }

  function sorteioClima(anterior) {
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
    var anterior = estado.relogio;
    estado.relogio += dt / D.DIA_SEGUNDOS;
    var virouDia = false;
    if (estado.relogio >= 1) {
      estado.relogio -= 1;
      estado.dias++;
      virouDia = true;
      estado.clima = sorteioClima(estado.clima);
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
        b.poluicao = Math.max(0, b.poluicao - 0.05 * passo);
      }
      if (b.nativo) {
        b.fertilidade = Math.min(1, b.fertilidade + 0.015 * passo);
        b.poluicao = Math.max(0, b.poluicao - 0.02 * passo);
      }
      if (b.umidade < 0.2) {
        b.fertilidade = Math.max(0, b.fertilidade - 0.012 * passo);
      }
      b.poluicao = Math.min(1, b.poluicao + 0.006 * passo);

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

  function carregar() {
    try {
      var bruto = global.localStorage.getItem(D.CHAVE_SAVE);
      if (!bruto) return null;
      var dados = JSON.parse(bruto);
      if (!dados || !dados.blocos || dados.blocos.length !== D.GRADE * D.GRADE) return null;
      // save antigo ou incompleto nao pode quebrar a partida: descarta
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
            bloco.poluicao === undefined || bloco.bloqueado === undefined) {
          console.warn('Raiz: bloco corrompido no save, comecando uma fazenda nova.');
          return null;
        }
      }
      return dados;
    } catch (erro) {
      console.warn('Raiz: nao consegui ler o save.', erro);
      return null;
    }
  }

  function apagar() {
    try { global.localStorage.removeItem(D.CHAVE_SAVE); } catch (erro) { /* sem storage */ }
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
    producaoEnergia: producaoEnergia,
    indiceDePegada: indiceDePegada,
    ganharXp: ganharXp,
    ehNoite: ehNoite,
    estacaoDe: estacaoDe,
    lotesTodos: lotesTodos,
    lotesVizinhos: lotesVizinhos,
    chaveLote: chaveLote,
    temItem: temItem
  };
})(window);
