// Utilitarios.gs
// Responsabilidade: funcoes utilitarias acionadas manualmente pelo usuario
// no painel (aba "Utilitarios").

// --- Semestre ---

// Retorna "YYYY.01" (jan-jun) ou "YYYY.02" (jul-dez) a partir de um Date.
// Retorna null se a data for invalida.
function _calcularSemestreDeData(data) {
  if (!data) return null;
  var d = (data instanceof Date) ? data : new Date(data);
  if (isNaN(d.getTime())) return null;
  var mes = d.getMonth() + 1; // 1–12
  var semStr = mes <= 6 ? '01' : '02';
  return d.getFullYear() + '.' + semStr;
}

// Preenche a coluna SEMESTRE de uma aba a partir de sua coluna de data.
// colData e colSemestre sao 1-indexados (numero da coluna na planilha).
// Retorna o numero de linhas cujo semestre foi calculado e gravado.
function _preencherSemestreAba(ss, nomeAba, colData, colSemestre) {
  var aba = ss.getSheetByName(nomeAba);
  if (!aba) return 0;

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return 0;

  var numLinhas = ultimaLinha - 1;
  var colMax = Math.max(colData, colSemestre);
  var dados = aba.getRange(2, 1, numLinhas, colMax).getValues();

  var novosSemestres = [];
  var totalAtualizado = 0;

  for (var i = 0; i < dados.length; i++) {
    var dataVal = dados[i][colData - 1];
    var semAtual = dados[i][colSemestre - 1];

    // Se ja tem semestre preenchido como texto, nao altera. Um Date na
    // coluna SEMESTRE (resquicio de quando a celula era usada como data) nao
    // conta como "ja preenchido" — cai adiante para ser recalculado como
    // texto "YYYY.SS" a partir da coluna de data.
    if (semAtual && !(semAtual instanceof Date) && String(semAtual).trim() !== '') {
      novosSemestres.push([semAtual]);
      continue;
    }

    if (!dataVal || dataVal === '') {
      novosSemestres.push([semAtual]); // sem data e sem semestre — deixa vazio
      continue;
    }

    var novoSem = _calcularSemestreDeData(dataVal);
    if (!novoSem) {
      novosSemestres.push([semAtual]);
      continue;
    }

    novosSemestres.push([novoSem]);
    totalAtualizado++;
  }

  var rangeSemestre = aba.getRange(2, colSemestre, numLinhas, 1);
  // Forca formato Texto simples antes de gravar — sem isso, se a coluna
  // estiver formatada como Data (mesmo com um formato numerico customizado
  // que exiba algo como "2026.02"), o Sheets reinterpreta a string gravada
  // como uma data de verdade (ver normalizarSemestreLido em Data.js), o que
  // corrompe o valor na proxima leitura.
  rangeSemestre.setNumberFormat('@');
  rangeSemestre.setValues(novosSemestres);
  return totalAtualizado;
}

// Funcao principal: percorre as quatro abas e preenche a coluna SEMESTRE
// com base na respectiva coluna de data.
//
//   diligencias : data = G (col 7),  semestre = R (col 18)
//   iniciais    : data = B (col 2),  semestre = L (col 12)
//   atendimentos: data = A (col 1),  semestre = J (col 10)
//   estagiarios : data = D (col 4),  semestre = F (col  6)
//
function preencherSemestrePlanilha() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var resultados = [
    { nome: CONFIG.SHEET_DILIGENCIAS,  colData: 7,  colSemestre: 18 },
    { nome: CONFIG.SHEET_INICIAIS,     colData: 2,  colSemestre: 12 },
    { nome: CONFIG.SHEET_ATENDIMENTOS, colData: 1,  colSemestre: 10 },
    { nome: CONFIG.SHEET_ESTAGIARIOS,  colData: 4,  colSemestre: 6  }
  ];

  var totalAtualizado = 0;
  var abasFaltando = [];

  for (var i = 0; i < resultados.length; i++) {
    var cfg = resultados[i];
    var aba = ss.getSheetByName(cfg.nome);
    if (!aba) {
      abasFaltando.push(cfg.nome);
      continue;
    }
    totalAtualizado += _preencherSemestreAba(ss, cfg.nome, cfg.colData, cfg.colSemestre);
  }

  var mensagem = totalAtualizado + ' registro(s) atualizado(s).';
  if (abasFaltando.length > 0) {
    mensagem += ' Aba(s) não encontrada(s): ' + abasFaltando.join(', ') + '.';
  }

  return { sucesso: true, mensagem: mensagem };
}

// --- Gatilho automatico (executado a cada 30 minutos) ---

// Handler chamado pelo trigger instalavel criado em
// configurarGatilhoPreencherSemestre(). Chama preencherSemestrePlanilha()
// diretamente (sem validarAcesso — nao ha usuario logado dentro de um
// trigger horario), mesmo padrao usado em verificarEntregasAutomatico
// (Classroom.js) e sincronizarPendentesParaGeral (Geralsync.js).
function preencherSemestreAutomatico() {
  preencherSemestrePlanilha();
}

// Rodar esta funcao MANUALMENTE uma unica vez pelo editor do Apps Script
// (Executar > configurarGatilhoPreencherSemestre) para instalar o gatilho de
// 30 em 30 minutos. E seguro executa-la novamente: ela remove qualquer
// gatilho antigo do mesmo handler antes de criar um novo, evitando
// duplicatas.
function configurarGatilhoPreencherSemestre() {
  var gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(function(g) {
    if (g.getHandlerFunction() === 'preencherSemestreAutomatico') {
      ScriptApp.deleteTrigger(g);
    }
  });

  ScriptApp.newTrigger('preencherSemestreAutomatico')
    .timeBased()
    .everyMinutes(30)
    .create();
}

// --- DF Final ---

// Avanca numDias uteis a partir de dataInicio, pulando fins de semana e
// os feriados recebidos como array de Date.
function _adicionarDiasUteis(dataInicio, numDias, feriados) {
  var data = new Date(dataInicio.getTime());
  var diasAdicionados = 0;
  var tz = Session.getScriptTimeZone();

  var feriadosStr = feriados.map(function(f) {
    return Utilities.formatDate(f, tz, 'yyyy-MM-dd');
  });

  while (diasAdicionados < numDias) {
    data.setDate(data.getDate() + 1);
    var diaSemana = data.getDay(); // 0 = domingo, 6 = sabado
    if (diaSemana === 0 || diaSemana === 6) continue;

    var dataStr = Utilities.formatDate(data, tz, 'yyyy-MM-dd');
    if (feriadosStr.indexOf(dataStr) !== -1) continue;

    diasAdicionados++;
  }

  return data;
}

// Calcula qual e o dia util resultante ao somar numDias uteis a partir de
// dataIso (formato 'yyyy-MM-dd'), excluindo fins de semana e os feriados
// registrados em bd!C2:C. Retornado para o modal "Calcular Dia Util".
function calcularDiaUtilPlanilha(dataIso, numDias) {
  var partes = String(dataIso || '').split('-');
  if (partes.length !== 3) return { sucesso: false, erro: 'Data inválida.' };

  var dataInicio = new Date(
    parseInt(partes[0], 10),
    parseInt(partes[1], 10) - 1,
    parseInt(partes[2], 10)
  );
  if (isNaN(dataInicio.getTime())) return { sucesso: false, erro: 'Data inválida.' };

  numDias = parseInt(numDias, 10);
  if (!numDias || numDias < 1) return { sucesso: false, erro: 'Prazo inválido.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var feriados = [];
  var abaBd = ss.getSheetByName(CONFIG.SHEET_BD);
  if (abaBd && abaBd.getLastRow() >= 2) {
    var feriadosData = abaBd.getRange(2, 3, abaBd.getLastRow() - 1, 1).getValues();
    feriados = feriadosData
      .map(function(r) { return r[0]; })
      .filter(function(v) { return v instanceof Date && !isNaN(v.getTime()); });
  }

  var dataFinal = _adicionarDiasUteis(dataInicio, numDias, feriados);

  var tz = Session.getScriptTimeZone();
  var dataFormatada = Utilities.formatDate(dataFinal, tz, 'dd/MM/yyyy');
  var diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  var diaSemana = diasSemana[dataFinal.getDay()];

  return { sucesso: true, dataFinal: dataFormatada, diaSemana: diaSemana };
}

// Percorre a aba diligencias e preenche a coluna O (DF_REAL) para registros
// onde O esta vazia e G (DF) esta preenchida.
// O valor gravado em O = DF (coluna G) + PRAZO (coluna F, em dias uteis),
// considerando fins de semana e feriados de bd!C2:C.
function preencherDfFinalPlanilha() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var abaD  = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!abaD) return { sucesso: false, erro: 'Aba diligências não encontrada.' };

  // Le feriados de bd!C2:C
  var feriados = [];
  var abaBd = ss.getSheetByName(CONFIG.SHEET_BD);
  if (abaBd && abaBd.getLastRow() >= 2) {
    var feriadosData = abaBd.getRange(2, 3, abaBd.getLastRow() - 1, 1).getValues();
    feriados = feriadosData
      .map(function(r) { return r[0]; })
      .filter(function(v) { return v instanceof Date && !isNaN(v.getTime()); });
  }

  var ultimaLinha = abaD.getLastRow();
  if (ultimaLinha < 2) return { sucesso: true, mensagem: '0 registro(s) atualizado(s).' };

  var numLinhas = ultimaLinha - 1;
  // Coluna O = CONFIG.COL.DF_REAL (14, base 0) = coluna 15 (base 1)
  var colMax = CONFIG.COL.DF_REAL + 1;
  var dados = abaD.getRange(2, 1, numLinhas, colMax).getValues();

  var novosDfFinal = [];
  var totalAtualizado = 0;

  for (var i = 0; i < dados.length; i++) {
    var dfFinalAtual = dados[i][CONFIG.COL.DF_REAL]; // col O
    var df           = dados[i][CONFIG.COL.DF];      // col G
    var prazoVal     = dados[i][CONFIG.COL.PRAZO];   // col F

    // Coluna O ja preenchida — nao altera
    if (dfFinalAtual !== '' && dfFinalAtual !== null && dfFinalAtual !== undefined) {
      novosDfFinal.push([dfFinalAtual]);
      continue;
    }

    // Coluna G vazia ou invalida — pula
    if (!df || !(df instanceof Date) || isNaN(df.getTime())) {
      novosDfFinal.push(['']);
      continue;
    }

    // Extrai numero de dias uteis de PRAZO (col F)
    // A celula pode estar formatada como data no Sheets mesmo armazenando
    // um inteiro — nesse caso GAS devolve um Date, e convertemos de volta
    // para o serial do Sheets (offset de 25569 dias em relacao ao Unix epoch).
    var prazo;
    if (prazoVal instanceof Date) {
      prazo = Math.round((prazoVal.getTime() + 2209161600000) / 86400000);
    } else if (typeof prazoVal === 'number') {
      prazo = Math.round(prazoVal);
    } else {
      novosDfFinal.push(['']);
      continue;
    }

    if (!prazo || prazo <= 0) {
      novosDfFinal.push(['']);
      continue;
    }

    var dfFinal = _adicionarDiasUteis(df, prazo, feriados);
    novosDfFinal.push([dfFinal]);
    totalAtualizado++;
  }

  abaD.getRange(2, colMax, numLinhas, 1).setValues(novosDfFinal);
  return { sucesso: true, mensagem: totalAtualizado + ' registro(s) atualizado(s).' };
}

// === GERENCIAR ESTAGIARIOS (botao "Gerenciar Estagiários", aba Utilitarios > Sistema) ===
// Responsabilidade: listar estagiarios elegiveis para finalizacao e marcar
// FINALIZADO = TRUE (coluna E da aba estagiarios) para os selecionados.
// O ID (coluna A) e usado como chave — nunca o nome — para nao haver
// ambiguidade em caso de homonimos.

// Lista, ordenados por nome, todos os estagiarios com FINALIZADO vazio/falso.
// Usado para preencher o modal "Gerenciar Estagiários".
function listarEstagiariosParaGerenciar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, 5).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var id = dados[i][CONFIG.ESTAGIARIOS_COL.ID];
    var nome = String(dados[i][CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    var finalizado = !!String(dados[i][CONFIG.ESTAGIARIOS_COL.FINALIZADO] || '').trim();
    if (!nome || finalizado) continue;
    lista.push({ id: String(id), nome: nome });
  }

  lista.sort(function(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
  return lista;
}

// Recebe uma lista de IDs (strings) marcados no modal e grava FINALIZADO =
// TRUE (coluna E) nas linhas correspondentes da aba estagiarios. IDs que
// nao forem encontrados sao ignorados silenciosamente (podem ter sido
// alterados/removidos entre a abertura do modal e o salvamento).
// Tambem replica FINALIZADO = TRUE na aba estagiarios da planilha GERAL
// (bd!G2), por ID (ver sincronizarFinalizacaoEstagiariosParaGeral em
// Geralsync.js) — falha na GERAL nunca bloqueia o salvamento local, apenas
// e reportada em separado (campo avisoGeral).
function finalizarEstagiariosPorId(ids) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return { sucesso: false, erro: 'Aba estagiarios não encontrada.' };

  ids = (ids || []).map(function(v) { return String(v).trim(); }).filter(Boolean);
  if (ids.length === 0) return { sucesso: true, mensagem: '0 estagiário(s) finalizado(s).' };

  var idsAlvo = {};
  ids.forEach(function(id) { idsAlvo[id] = true; });

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { sucesso: true, mensagem: '0 estagiário(s) finalizado(s).' };

  var numLinhas = ultimaLinha - 1;
  var dadosId = aba.getRange(2, CONFIG.ESTAGIARIOS_COL.ID + 1, numLinhas, 1).getValues();

  var totalFinalizados = 0;
  var idsFinalizados = [];
  for (var i = 0; i < dadosId.length; i++) {
    var id = String(dadosId[i][0]).trim();
    if (idsAlvo[id]) {
      aba.getRange(2 + i, CONFIG.ESTAGIARIOS_COL.FINALIZADO + 1).setValue(true);
      totalFinalizados++;
      idsFinalizados.push(id);
    }
  }

  var resultado = { sucesso: true, mensagem: totalFinalizados + ' estagiário(s) finalizado(s).' };

  var syncGeral = sincronizarFinalizacaoEstagiariosParaGeral(idsFinalizados);
  if (!syncGeral.sucesso) {
    resultado.avisoGeral = syncGeral.erro;
  }

  return resultado;
}