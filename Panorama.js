// Panorama.gs
// Responsabilidade: agregacao de dados para a aba "Panorama". Cruza a lista
// completa de estagiarios com as diligencias, iniciais e atendimentos de cada
// um. Le a aba "atendimentos" diretamente — nenhum outro arquivo deve
// ler/escrever essa aba. Diligencias e iniciais sao reaproveitadas de
// getTodasDiligencias() (Data.js) e getTodasIniciais() (Iniciais.js), que ja
// fazem os cruzamentos oficiais (ESTAGIARIO por nome e E-MAIL,
// respectivamente) — nenhuma regra nova de cruzamento e criada aqui para
// essas duas abas.
//
// Semestre: diligencias, iniciais, estagiarios e atendimentos tem cada um sua
// propria coluna SEMESTRE (texto simples, ex. "2026.01"), preenchida
// manualmente por Thales. Nenhum semestre e mais calculado a partir de datas
// (DF/DATA/TRIMESTRE) — o cruzamento entre abas e feito comparando esses
// campos diretamente.
//
// Toda a filtragem por semestre/aluno (para os cards e as 4 tabelas) e feita
// no frontend a partir do payload completo retornado por getDadosPanorama(),
// do mesmo jeito que as abas Diligencias/Iniciais ja fazem — assim a troca
// de aluno dentro do mesmo semestre e instantanea, sem nova chamada ao
// servidor. Acompanhamentos e lido via getTodosAcompanhamentos()
// (Acompanhamentos.js), que ja faz o cruzamento oficial por NOME/E-MAIL.

// --- Estagiarios (lista completa) ---

function getTodosEstagiariosCompletos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, 6).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var nome = String(row[CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    if (!nome) continue;
    lista.push({
      id: row[CONFIG.ESTAGIARIOS_COL.ID],
      nome: nome,
      email: String(row[CONFIG.ESTAGIARIOS_COL.EMAIL] || '').trim(),
      semestre: normalizarSemestreLido(row[CONFIG.ESTAGIARIOS_COL.SEMESTRE]),
      finalizado: !!String(row[CONFIG.ESTAGIARIOS_COL.FINALIZADO] || '').trim()
    });
  }
  return lista;
}

// --- Atendimentos ---

function getTodosAtendimentos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ATENDIMENTOS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_ATENDIMENTOS).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var nomeAtendido = String(row[CONFIG.ATENDIMENTOS_COL.NOME] || '').trim();
    var nomeAluno = String(row[CONFIG.ATENDIMENTOS_COL.ESTAGIARIO] || '').trim();
    if (!nomeAtendido && !nomeAluno) continue;

    lista.push({
      _linha: i + 2,
      data: formatarDataHora(row[CONFIG.ATENDIMENTOS_COL.DATA]),
      nome: nomeAtendido,
      cpf: row[CONFIG.ATENDIMENTOS_COL.CPF],
      telefone1: row[CONFIG.ATENDIMENTOS_COL.TELEFONE1],
      telefone2: row[CONFIG.ATENDIMENTOS_COL.TELEFONE2],
      emprego: row[CONFIG.ATENDIMENTOS_COL.EMPREGO],
      ramo: row[CONFIG.ATENDIMENTOS_COL.RAMO],
      estagiario: nomeAluno,
      semestre: normalizarSemestreLido(row[CONFIG.ATENDIMENTOS_COL.SEMESTRE])
    });
  }
  return lista;
}

// --- Contagem de producao por estagiario (Mensagem 4 — Mensagens.js) ---

// Conta a producao de UM estagiario, filtrada pelo SEMESTRE informado (nao e
// producao acumulada do estagio inteiro — ver nota tecnica do template da
// Mensagem 4). Diligencias sao separadas por SUBESPECIE (Simples/Complexa,
// ja calculada em rowParaObjeto — Data.js). Iniciais nao tem SUBESPECIE
// propria (a aba iniciais so tem ESPECIE) e sao somadas inteiras a
// COMPLEXAS — decisao de Thales, pedido inicial e sempre tratado como peca
// complexa na contagem de producao. Pecas com STATUS "Cancelada" nunca
// entram em nenhuma contagem (diligencias, iniciais e acompanhamentos);
// atendimentos nao tem coluna STATUS, entao nao ha o que filtrar ali.
//
// A logica de contagem propriamente dita mora em _contarProducaoComDados,
// que recebe as 4 listas ja lidas — isso permite que getProducaoPorEstagiarios
// (mais abaixo) conte a producao de VARIOS estagiarios lendo cada aba UMA
// unica vez, em vez de uma vez por estagiario (custo que antes deixava a aba
// Gráficos lenta: 4 leituras completas de planilha x N estagiarios).
function getContagemProducaoEstagiario(nomeEstagiario, semestre) {
  return _contarProducaoComDados(
    nomeEstagiario,
    semestre,
    getTodasDiligencias(),
    getTodasIniciais(),
    getTodosAtendimentos(),
    getTodosAcompanhamentos(),
    getTodosAtendimentosOnline() // AtendimentoOnline.js
  );
}

// atendimentosOnline: so os com STATUS = 'Aprovado' entram na contagem — ver
// regra de negocio em AtendimentoOnline.js. Somam-se aos atendimentos
// presenciais no MESMO total (qtdAtendimentos), decisao de Thales.
function _contarProducaoComDados(nomeEstagiario, semestre, diligencias, iniciais, atendimentos, acompanhamentos, atendimentosOnline) {
  var chaveNome = normalizarChave(nomeEstagiario);

  function naoCancelada(reg) { return normalizarChave(reg.status) !== 'cancelada'; }

  var diligenciasDoAluno = diligencias.filter(function(d) {
    return normalizarChave(d.estagiario) === chaveNome && d.semestre === semestre && naoCancelada(d);
  });
  var qtdSimples = diligenciasDoAluno.filter(function(d) { return normalizarChave(d.subespecie) === normalizarChave(CONFIG.SUBESPECIE_VALORES.SIMPLES); }).length;
  var qtdComplexasDiligencias = diligenciasDoAluno.filter(function(d) { return normalizarChave(d.subespecie) === normalizarChave(CONFIG.SUBESPECIE_VALORES.COMPLEXA); }).length;

  var qtdIniciais = iniciais.filter(function(ini) {
    return normalizarChave(ini.estagiario) === chaveNome && ini.semestre === semestre && naoCancelada(ini);
  }).length;

  var qtdComplexas = qtdComplexasDiligencias + qtdIniciais;

  var qtdAtendimentosPresenciais = atendimentos.filter(function(a) {
    return normalizarChave(a.estagiario) === chaveNome && a.semestre === semestre;
  }).length;

  var qtdAtendimentosOnlineAprovados = (atendimentosOnline || []).filter(function(ao) {
    return normalizarChave(ao.estagiario) === chaveNome && ao.semestre === semestre &&
      normalizarChave(ao.status) === normalizarChave(CONFIG.STATUS_ATENDIMENTO_ONLINE.APROVADO);
  }).length;

  var qtdAtendimentos = qtdAtendimentosPresenciais + qtdAtendimentosOnlineAprovados;

  var qtdAcompanhamentos = acompanhamentos.filter(function(c) {
    return normalizarChave(c.estagiario) === chaveNome && c.semestre === semestre && naoCancelada(c);
  }).length;

  return {
    qtdSimples: qtdSimples,
    qtdComplexas: qtdComplexas,
    qtdAtendimentos: qtdAtendimentos,
    qtdAcompanhamentos: qtdAcompanhamentos,
    qtdIniciais: qtdIniciais
  };
}

// Mesma contagem de getContagemProducaoEstagiario, mas para VARIOS estagiarios
// de uma vez — le diligencias/iniciais/atendimentos/acompanhamentos/
// atendimentos_online UMA unica vez e reaproveita para todos, em vez de uma
// leitura completa das abas por estagiario. Usada pelos agregadores que
// precisam da producao de todos os estagiarios ativos ao mesmo tempo
// (getDadosGraficos, Graficos.js — e, por tabela, a aba Distribuição, que
// reaproveita esse mesmo agregador).
function getProducaoPorEstagiarios(estagiarios) {
  var diligencias = getTodasDiligencias();
  var iniciais = getTodasIniciais();
  var atendimentos = getTodosAtendimentos();
  var acompanhamentos = getTodosAcompanhamentos();
  var atendimentosOnline = getTodosAtendimentosOnline(); // AtendimentoOnline.js

  return estagiarios.map(function(e) {
    var contagens = _contarProducaoComDados(e.nome, e.semestre, diligencias, iniciais, atendimentos, acompanhamentos, atendimentosOnline);
    contagens.nome = e.nome;
    return contagens;
  });
}

// --- Agregador usado pelo frontend ao abrir a aba "Panorama" ---

// statusPicklist e incluido aqui porque o modal de Inicial e reaproveitado
// tal como esta (ver preencherModalInicial em Scripts.html) e depende dessa
// lista — que so seria carregada se a aba Iniciais tivesse sido aberta antes.
function getDadosPanorama() {
  return {
    estagiarios: getTodosEstagiariosCompletos(),
    diligencias: getTodasDiligencias(),
    iniciais: getTodasIniciais(),
    atendimentos: getTodosAtendimentos(),
    acompanhamentos: getTodosAcompanhamentos(), // Acompanhamentos.js
    statusPicklist: lerColunaBd(CONFIG.BD_COL.STATUS)
  };
}