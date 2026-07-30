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
// TURMA: em 27/07/2026 a aba Panorama passou a usar a dimensao TURMA
// (ex. "2026.02-A", "2026.02-R") em vez de SEMESTRE para agrupar as metricas.
// A turma e derivada de DATA_INICIO em estagiarios!M (Turma.js) e resolvida
// para cada registro transacional em tempo de leitura via
// resolverTurmaDoRegistro (registro -> aluno -> turma). As abas operacionais
// (Diligencias, Distribuicao) continuam em SEMESTRE.
//
// Toda a filtragem por turma/aluno (para os cards e as 4 tabelas) e feita
// no frontend a partir do payload completo retornado por getDadosPanorama(),
// do mesmo jeito que as abas Diligencias/Iniciais ja fazem — assim a troca
// de aluno dentro da mesma turma e instantanea, sem nova chamada ao
// servidor. Acompanhamentos e lido via getTodosAcompanhamentos()
// (Acompanhamentos.js), que ja faz o cruzamento oficial por NOME/E-MAIL.

// --- Estagiarios (lista completa) ---
// Alargado de A:F para A:M em 27/07/2026 para trazer DATA_INICIO, DATA_FIM e
// TURMA. Delega a leitura para Turma.js, onde a dimensao TURMA e derivada.
function getTodosEstagiariosCompletos() {
  return getTodosEstagiariosComTurma();
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

// Conta a producao de UM estagiario, filtrada pela TURMA informada (nao e
// producao acumulada do estagio inteiro — ver nota tecnica do template da
// Mensagem 4). Diligencias sao separadas por SUBESPECIE (Simples/Complexa,
// ja calculada em rowParaObjeto — Data.js). Iniciais nao tem SUBESPECIE
// propria (a aba iniciais so tem ESPECIE) e sao somadas inteiras a
// COMPLEXAS — decisao de Thales, pedido inicial e sempre tratado como peca
// complexa na contagem de producao. Pecas com STATUS "Cancelada" nunca
// entram em nenhuma contagem (diligencias, iniciais e acompanhamentos);
// atendimentos nao tem coluna STATUS, entao nao ha o que filtrar ali.
//
// A turma de cada registro e resolvida em tempo de leitura pelo
// resolvedorTurma (registro -> aluno -> turma), evitando materializar a
// coluna TURMA nas abas transacionais (decisao de arquitetura, 27/07/2026).
//
// A logica de contagem propriamente dita mora em _contarProducaoComDados,
// que recebe as 4 listas ja lidas — isso permite que getProducaoPorEstagiarios
// (mais abaixo) conte a producao de VARIOS estagiarios lendo cada aba UMA
// unica vez, em vez de uma vez por estagiario (custo que antes deixava a aba
// Gráficos lenta: 4 leituras completas de planilha x N estagiarios).
function getContagemProducaoEstagiario(nomeEstagiario, turma) {
  return _contarProducaoComDados(
    nomeEstagiario,
    turma,
    getTodasDiligencias(),
    getTodasIniciais(),
    getTodosAtendimentos(),
    getTodosAcompanhamentos(),
    getTodosAtendimentosOnline(), // AtendimentoOnline.js
    getTodasAudienciasEstagiario(), // AudienciasEstagiario.js
    lerParametrosAudiencias() // bd!X:Z — AudienciasEstagiario.js
  );
}

// atendimentosOnline: so os com STATUS = 'Aprovado' entram na contagem — ver
// regra de negocio em AtendimentoOnline.js. Somam-se aos atendimentos
// presenciais no MESMO total (qtdAtendimentos), decisao de Thales.
// audienciasEstagiario/parametrosAudiencias: contagem por tipo (RN-05, ver
// AudienciasEstagiario.js) — baldes independentes, nunca somados ao total de
// atendimentos nem entre si.
function _contarProducaoComDados(nomeEstagiario, turma, diligencias, iniciais, atendimentos, acompanhamentos, atendimentosOnline, audienciasEstagiario, parametrosAudiencias) {
  var chaveNome = normalizarChave(nomeEstagiario);
  var resolvedorTurma = criarResolvedorTurma();

  function naoCancelada(reg) { return normalizarChave(reg.status) !== 'cancelada'; }

  // Resolve a turma de um registro a partir do nome/e-mail do aluno e da data
  // de referencia apropriada para cada aba (decidido em 27/07/2026).
  function turmaDoRegistro(chaveAluno, dataRef) {
    return resolvedorTurma(chaveAluno, parseDataBR(dataRef));
  }

  function casaTurma(turmaRegistro) {
    return turmaCasaComFiltro(turmaRegistro, turma);
  }

  var diligenciasDoAluno = diligencias.filter(function(d) {
    return normalizarChave(d.estagiario) === chaveNome && casaTurma(turmaDoRegistro(d.estagiario, d.df)) && naoCancelada(d);
  });
  var qtdSimples = diligenciasDoAluno.filter(function(d) { return normalizarChave(d.subespecie) === normalizarChave(CONFIG.SUBESPECIE_VALORES.SIMPLES); }).length;
  var qtdComplexasDiligencias = diligenciasDoAluno.filter(function(d) { return normalizarChave(d.subespecie) === normalizarChave(CONFIG.SUBESPECIE_VALORES.COMPLEXA); }).length;

  var qtdIniciais = iniciais.filter(function(ini) {
    return normalizarChave(ini.estagiario) === chaveNome && casaTurma(turmaDoRegistro(ini.email || ini.estagiario, ini.di)) && naoCancelada(ini);
  }).length;

  var qtdComplexas = qtdComplexasDiligencias + qtdIniciais;

  var qtdAtendimentosPresenciais = atendimentos.filter(function(a) {
    return normalizarChave(a.estagiario) === chaveNome && casaTurma(turmaDoRegistro(a.estagiario, a.data));
  }).length;

  var qtdAtendimentosOnlineAprovados = (atendimentosOnline || []).filter(function(ao) {
    return normalizarChave(ao.estagiario) === chaveNome && casaTurma(turmaDoRegistro(ao.email || ao.estagiario, ao.data)) &&
      normalizarChave(ao.status) === normalizarChave(CONFIG.STATUS_ATENDIMENTO_ONLINE.APROVADO);
  }).length;

  var qtdAtendimentos = qtdAtendimentosPresenciais + qtdAtendimentosOnlineAprovados;

  var qtdAcompanhamentos = acompanhamentos.filter(function(c) {
    return normalizarChave(c.estagiario) === chaveNome && casaTurma(turmaDoRegistro(c.email || c.estagiario, c.di)) && naoCancelada(c);
  }).length;

  // audiencias: [{ tipo, meta, horas, realizado, faltante, percentual, excedente }],
  // ver contarAudienciasPorTipo (AudienciasEstagiario.js) — baldes
  // independentes por tipo, nunca somados a qtdAtendimentos.
  var audiencias = contarAudienciasPorTipo(nomeEstagiario, turma, audienciasEstagiario || [], parametrosAudiencias || []);

  return {
    qtdSimples: qtdSimples,
    qtdComplexas: qtdComplexas,
    qtdAtendimentos: qtdAtendimentos,
    qtdAcompanhamentos: qtdAcompanhamentos,
    qtdIniciais: qtdIniciais,
    audiencias: audiencias
  };
}

// Mesma contagem de getContagemProducaoEstagiario, mas para VARIOS estagiarios
// de uma vez — le diligencias/iniciais/atendimentos/acompanhamentos/
// atendimentos_online UMA unica vez e reaproveita para todos, em vez de uma
// leitura completa das abas por estagiario. Usada pelos agregadores que
// precisam da producao de todos os estagiarios ativos ao mesmo tempo
// (getDadosGraficos, Graficos.js — e, por tabela, a aba Distribuição, que
// reaproveita esse mesmo agregador).
//
// Cada estagiario do vetor DEVE conter a propria turma (campo .turma); o
// resultado traz tambem a turma para o frontend nao precisar recalcular.
function getProducaoPorEstagiarios(estagiarios) {
  var diligencias = getTodasDiligencias();
  var iniciais = getTodasIniciais();
  var atendimentos = getTodosAtendimentos();
  var acompanhamentos = getTodosAcompanhamentos();
  var atendimentosOnline = getTodosAtendimentosOnline(); // AtendimentoOnline.js
  var audienciasEstagiario = getTodasAudienciasEstagiario(); // AudienciasEstagiario.js
  var parametrosAudiencias = lerParametrosAudiencias(); // bd!X:Z — AudienciasEstagiario.js

  return estagiarios.map(function(e) {
    var contagens = _contarProducaoComDados(e.nome, e.turma, diligencias, iniciais, atendimentos, acompanhamentos, atendimentosOnline, audienciasEstagiario, parametrosAudiencias);
    contagens.nome = e.nome;
    contagens.turma = e.turma;
    return contagens;
  });
}

// Pesos do calculo de "Parcial de Horas", exibido no final da aba Panorama
// quando um unico aluno esta selecionado (ver renderizarPontuacaoPanorama,
// Scripts.html). Cada peso e uma celula unica em bd (CONFIG.BD_CELL),
// preenchida manualmente por Thales.
function getPesosPontuacaoPanorama() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) return { simples: 0, complexa: 0, acompanhamento: 0, atendimento: 0 };

  function lerPeso(celula) {
    var valor = Number(aba.getRange(celula).getValue());
    return isNaN(valor) ? 0 : valor;
  }

  return {
    simples: lerPeso(CONFIG.BD_CELL.PESO_SIMPLES),
    complexa: lerPeso(CONFIG.BD_CELL.PESO_COMPLEXA),
    acompanhamento: lerPeso(CONFIG.BD_CELL.PESO_ACOMPANHAMENTO),
    atendimento: lerPeso(CONFIG.BD_CELL.PESO_ATENDIMENTO)
  };
}

// --- Agregador usado pelo frontend ao abrir a aba "Panorama" ---

// statusPicklist e incluido aqui porque o modal de Inicial e reaproveitado
// tal como esta (ver preencherModalInicial em Scripts.html) e depende dessa
// lista — que so seria carregada se a aba Iniciais tivesse sido aberta antes.
//
// Cada lista transacional recebe aqui a turma JA RESOLVIDA (registro ->
// aluno -> turma, ver anotarTurmaEmRegistros/criarResolvedorTurma em
// Turma.js) antes de seguir para o cliente — decisao de arquitetura,
// 27/07/2026: o seletor hierarquico do Panorama (Scripts.html) filtra direto
// em reg.turma, por REGISTRO, nunca por um conjunto de nomes/e-mails de
// estagiarios (evita a dupla contagem quando um aluno tem duas linhas no
// mesmo semestre — antecipado e regular).
function getDadosPanorama() {
  var diligencias = getTodasDiligencias();
  var iniciais = getTodasIniciais();
  var atendimentos = getTodosAtendimentos();
  var acompanhamentos = getTodosAcompanhamentos(); // Acompanhamentos.js
  var atendimentosOnline = getTodosAtendimentosOnline(); // AtendimentoOnline.js
  var audienciasEstagiario = getTodasAudienciasEstagiario(); // AudienciasEstagiario.js

  var resolvedorTurma = criarResolvedorTurma(); // Turma.js
  anotarTurmaEmRegistros(diligencias, resolvedorTurma, function(r) { return r.estagiario; }, function(r) { return r.df; });
  anotarTurmaEmRegistros(iniciais, resolvedorTurma, function(r) { return r.email || r.estagiario; }, function(r) { return r.di; });
  anotarTurmaEmRegistros(atendimentos, resolvedorTurma, function(r) { return r.estagiario; }, function(r) { return r.data; });
  anotarTurmaEmRegistros(acompanhamentos, resolvedorTurma, function(r) { return r.email || r.estagiario; }, function(r) { return r.di; });
  anotarTurmaEmRegistros(atendimentosOnline, resolvedorTurma, function(r) { return r.email || r.estagiario; }, function(r) { return r.data; });
  anotarTurmaEmRegistros(audienciasEstagiario, resolvedorTurma, function(r) { return r.estagiario || r.email; }, function(r) { return r.data; });

  return {
    // getTodosEstagiariosParaCliente() (Turma.js), NUNCA getTodosEstagiariosCompletos()
    // aqui — este ultimo inclui dataInicio/dataFim como objetos Date crus, que
    // quebram a serializacao de google.script.run (payload inteiro vira null
    // no cliente) assim que alguma linha tiver essas celulas preenchidas.
    estagiarios: getTodosEstagiariosParaCliente(),
    diligencias: diligencias,
    iniciais: iniciais,
    atendimentos: atendimentos,
    acompanhamentos: acompanhamentos,
    atendimentosOnline: atendimentosOnline,
    audienciasEstagiario: audienciasEstagiario,
    parametrosAudiencias: lerParametrosAudiencias(), // bd!X:Z — tipo/meta/horas (AudienciasEstagiario.js)
    statusPicklist: lerColunaBd(CONFIG.BD_COL.STATUS),
    pesosPontuacao: getPesosPontuacaoPanorama(),
    turmaCorrente: obterTurmaCorrente() // TURMA ativa hoje (Turma.js)
  };
}