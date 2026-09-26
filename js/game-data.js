window.RaizJogo = (function () {
  'use strict';

  var GRADE = 12;
  var LOTE = 3;
  var LADO_LOTE = GRADE / LOTE;
  var DIA_SEGUNDOS = 90;

  var ESTADOS_LOTE = {
    MATO: { id: 'mato', nome: 'Mata nativa', custo: 4, fertilidade: 0.8, umidade: 0.5, poluicao: 0, bonus: 18, desc: 'Vegetacao a preservar: vale muito em pontos ecologicos.' },
    ARIDO: { id: 'arido', nome: 'Solo árido', custo: 6, fertilidade: 0.25, umidade: 0.15, poluicao: 0.05, bonus: 0, desc: 'Seco e duro. Precisa de irrigação e adubo.' },
    POLUIDO: { id: 'poluido', nome: 'Resíduos antigos', custo: 10, fertilidade: 0.2, umidade: 0.3, poluicao: 0.8, bonus: 0, desc: 'Passou por descarte incorreto. Exige des poluição.' },
    FERtil: { id: 'fertil', nome: 'Terra boa', custo: 8, fertilidade: 0.75, umidade: 0.5, poluicao: 0, bonus: 8, desc: 'Pronta para plantar.' }
  };

  var CULTURAS = {
    milho: { id: 'milho', nome: 'Milho', dias: 3, agua: 1.2, vende: 46, xp: 14, nivel: 1, cor: 0xd8b64a, semente: 3 },
    soja: { id: 'soja', nome: 'Soja', dias: 2.5, agua: 0.9, vende: 34, xp: 11, nivel: 1, cor: 0x9bb85c, semente: 2 },
    trigo: { id: 'trigo', nome: 'Trigo', dias: 2, agua: 0.7, vende: 26, xp: 9, nivel: 1, cor: 0xdcc98a, semente: 2 },
    hortalica: { id: 'hortalica', nome: 'Hortaliça', dias: 1.5, agua: 1.5, vende: 38, xp: 16, nivel: 2, cor: 0x6fbf7a, semente: 4 },
    girassol: { id: 'girassol', nome: 'Girassol', dias: 3.5, agua: 0.8, vende: 58, xp: 20, nivel: 3, cor: 0xe8b73c, semente: 5 },
    feija: { id: 'feija', nome: 'Feijão', dias: 2, agua: 1, vende: 30, xp: 12, nivel: 2, cor: 0x8a6f4e, semente: 3 }
  };

  var EQUIPAMENTOS = {
    enxada: { id: 'enxada', nome: 'Enxada', aba: 'equipamentos', custo: 0, nivel: 1, icone: 'enxada', desc: 'Ferramenta manual. Prepara o solo.', energia: 0, polui: 0 },
    regador: { id: 'regador', nome: 'Regador', aba: 'equipamentos', custo: 0, nivel: 1, icone: 'regador', desc: 'Molha um bloco à mão.', energia: 0, polui: 0 },
    trator: { id: 'trator', nome: 'Trator antigo', aba: 'equipamentos', custo: 180, nivel: 2, icone: 'trator', desc: 'Prepara 4 blocos de uma vez. Queima diesel e polui o solo.', energia: 0, polui: 0.22, raio: 2, prepara: true },
    tratorEletrico: { id: 'tratorEletrico', nome: 'Trator elétrico', aba: 'equipamentos', custo: 460, nivel: 4, icone: 'trator', desc: 'Prepara 4 blocos sem emitir nada. Consome energia.', energia: 3, polui: 0, raio: 2, prepara: true },
    drone: { id: 'drone', nome: 'Drone de semeadura', aba: 'equipamentos', custo: 620, nivel: 5, icone: 'drone', desc: 'Planta 3 blocos ao mesmo tempo. Gasta energia.', energia: 5, polui: 0, planta: true, raio: 1 },
    colheitadeira: { id: 'colheitadeira', nome: 'Colheitadeira solar', aba: 'equipamentos', custo: 780, nivel: 6, icone: 'colheitadeira', desc: 'Colhe 4 blocos maduros de uma vez. Movida a energia solar.', energia: 4, polui: 0, colhe: true, raio: 2 },
    gotejamento: { id: 'gotejamento', nome: 'Irrigação gotejamento', aba: 'equipamentos', custo: 240, nivel: 3, icone: 'gota', desc: 'Mantém a umidade alta nos 4 blocos vizinhos, o dia todo.', energia: 1, polui: 0, raio: 2,_passivo: true },
    composteira: { id: 'composteira', nome: 'Composteira', aba: 'equipamentos', custo: 160, nivel: 2, icone: 'composteira', desc: 'Adubo orgânico: +fertilidade e -poluição todo dia.', energia: 0, polui: -0.18, raio: 1, _passivo: true },
    arvore: { id: 'arvore', nome: 'Reflorestamento', aba: 'equipamentos', custo: 40, nivel: 1, icone: 'arvore', desc: 'Planta nativa. Soma pontos ecológicos e segura o solo.', energia: 0, polui: -0.12, refloresta: true }
  };

  var ENERGIA = {
    painel: { id: 'painel', nome: 'Painel solar', aba: 'energia', custo: 120, nivel: 1, icone: 'painel', desc: 'Gera energia de dia. Rende mais com sol limpo.', gera: { dia: 6, noite: 0 } },
    turbina: { id: 'turbina', nome: 'Turbina eólica', aba: 'energia', custo: 210, nivel: 3, icone: 'turbina', desc: 'Gera com o vento, de dia ou de noite.', gera: { dia: 4, noite: 5 } },
    bateria: { id: 'bateria', nome: 'Bateria', aba: 'energia', custo: 150, nivel: 2, icone: 'bateria', desc: 'Guarda energia para a madrugada.', capacidade: 40 },
    poste: { id: 'poste', nome: 'Poste de luz', aba: 'energia', custo: 70, nivel: 1, icone: 'poste', desc: 'Acende à noite e ajuda as máquinas a trabajar.', gera: { dia: 0, noite: 0 }, luz: true, custoEnergia: 1 },
    caixa: { id: 'caixa', nome: 'Caixa d’água', aba: 'energia', custo: 90, nivel: 2, icone: 'agua', desc: 'Guarda água da chuva para o gotejamento.', capacidadeAgua: 30 }
  };

  var CLIMAS = {
    sol: { id: 'sol', nome: 'Sol forte', chuva: 0, vento: 0.25, solar: 1.35, umidade: -0.03 },
    nublado: { id: 'nublado', nome: 'Nublado', chuva: 0, vento: 0.45, solar: 0.6, umidade: -0.005 },
    chuva: { id: 'chuva', nome: 'Chuva', chuva: 1, vento: 0.6, solar: 0.3, umidade: 0.16 },
    tempestade: { id: 'tempestade', nome: 'Tempestade', chuva: 1.6, vento: 1.1, solar: 0.15, umidade: 0.26 }
  };

  var PESOS_CLIMA = { sol: 0.4, nublado: 0.3, chuva: 0.22, tempestade: 0.08 };

  var XP_POR_NIVEL = function (nivel) { return Math.round(90 * Math.pow(nivel, 1.45)); };

  var SEMENTES_INICIAIS = { milho: 6, soja: 6, trigo: 6 };

  return {
    GRADE: GRADE,
    LOTE: LOTE,
    LADO_LOTE: LADO_LOTE,
    DIA_SEGUNDOS: DIA_SEGUNDOS,
    ESTADOS_LOTE: ESTADOS_LOTE,
    CULTURAS: CULTURAS,
    EQUIPAMENTOS: EQUIPAMENTOS,
    ENERGIA: ENERGIA,
    CLIMAS: CLIMAS,
    PESOS_CLIMA: PESOS_CLIMA,
    XP_POR_NIVEL: XP_POR_NIVEL,
    SEMENTES_INICIAIS: SEMENTES_INICIAIS,
    CHAVE_SAVE: 'raiz-jogo-v1'
  };
})();
