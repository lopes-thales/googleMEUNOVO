// Script temporário — rodar uma unica vez apos apagar SEMESTRE em diligencias.
// Preenche R (SEMESTRE) a partir de G (DF), usando a mesma regra de
// calcularSemestre() em Data.js. Apagar esta funcao depois do uso.
function preencherSemestreDiligenciasUmaVez() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) {
    Logger.log('Aba diligencias nao encontrada.');
    return;
  }

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) {
    Logger.log('Nenhum registro na aba diligencias.');
    return;
  }

  var numLinhas = ultimaLinha - 1;
  var colDF = CONFIG.COL.DF + 1;         // G, 1-indexado
  var colSemestre = CONFIG.COL.SEMESTRE + 1; // R, 1-indexado

  var dadosDF = aba.getRange(2, colDF, numLinhas, 1).getValues();

  var novosSemestres = [];
  var totalPreenchido = 0;
  var totalSemDF = 0;

  for (var i = 0; i < dadosDF.length; i++) {
    var df = dadosDF[i][0];
    var sem = calcularSemestre(df);
    if (sem) {
      totalPreenchido++;
    } else {
      totalSemDF++;
    }
    novosSemestres.push([sem]);
  }

  var rangeSemestre = aba.getRange(2, colSemestre, numLinhas, 1);
  rangeSemestre.setNumberFormat('@'); // forca texto, evita reinterpretacao como Data
  rangeSemestre.setValues(novosSemestres);

  Logger.log('Preenchidos: ' + totalPreenchido + ' | Sem DF (deixados vazios): ' + totalSemDF);
}

// Script temporario — rodar uma unica vez pelo editor do Apps Script
// (Executar > preencherDatasClassroomAntigasTudo) para preencher DI CLASS/
// DF CLASS (colunas recem-criadas: diligencias!W:X, iniciais!M:N,
// acompanhamentos!L:M) em registros ANTIGOS, criados antes de essas colunas
// existirem e do fluxo normal (Classroom.js) passar a preenche-las
// automaticamente a cada novo envio.
//
// Mesma fonte de verdade pedida por Thales para os envios novos: a data de
// criacao e a data de entrega (dueDate) sao lidas DIRETO da atividade no
// Classroom (Classroom.Courses.CourseWork.get), nunca de DI/DF/"hoje" da
// planilha — podem divergir (fuso, atraso no envio etc.).
//
// SEGURANCA: uma linha so e tocada se LINK estiver preenchido E a celula do
// LINK tiver a nota com o codigo (ID) da coursework — mesma nota gravada
// pelo fluxo normal de envio (ver enviarDiligenciasAoClassroom etc. em
// Classroom.js) e pela migracao em MigracaoClassroom.js. Sem os dois, a
// linha fica de fora do relatorio (nao ha como buscar a atividade no
// Classroom) e as colunas ficam em branco, como pedido por Thales. Linhas
// que ja tiverem DI CLASS preenchido tambem sao puladas — assim a funcao e
// segura de rodar mais de uma vez sem refazer chamadas desnecessarias a API.
function _preencherDatasClassroomAntigasDaAba_(nomeAba, cursoId, colIdIndex, colLinkIndex, colDiClassIndex, colDfClassIndex, totalColunas) {
  var relatorio = { aba: nomeAba, preenchidos: [], jaPreenchidos: [], semLinkOuCodigo: [], erros: [] };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(nomeAba);
  if (!aba) {
    relatorio.erro = 'Aba "' + nomeAba + '" nao encontrada.';
    return relatorio;
  }

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return relatorio;

  var dados = aba.getRange(2, 1, ultimaLinha - 1, totalColunas).getValues();

  for (var i = 0; i < dados.length; i++) {
    var linha = i + 2;
    var id = dados[i][colIdIndex];

    if (dados[i][colDiClassIndex]) {
      relatorio.jaPreenchidos.push({ linha: linha, id: id });
      continue;
    }

    var link = String(dados[i][colLinkIndex] || '').trim();
    if (!link) {
      relatorio.semLinkOuCodigo.push({ linha: linha, id: id });
      continue;
    }

    var celulaLink = aba.getRange(linha, colLinkIndex + 1);
    var courseworkId = String(celulaLink.getNote() || '').trim();
    if (!courseworkId) {
      relatorio.semLinkOuCodigo.push({ linha: linha, id: id });
      continue;
    }

    try {
      var courseWork = obterCourseWork(cursoId, courseworkId);
      var diClass = converterCreationTimeClassroomParaData(courseWork.creationTime);
      var dfClass = converterDueDateClassroomParaData(courseWork.dueDate, courseWork.dueTime);

      if (diClass) aba.getRange(linha, colDiClassIndex + 1).setValue(diClass);
      if (dfClass) aba.getRange(linha, colDfClassIndex + 1).setValue(dfClass);

      relatorio.preenchidos.push({ linha: linha, id: id });
    } catch (e) {
      relatorio.erros.push({ linha: linha, id: id, erro: e.message });
    }
  }

  return relatorio;
}

function preencherDatasClassroomAntigasDiligencias_(cursoId) {
  return _preencherDatasClassroomAntigasDaAba_(
    CONFIG.SHEET_DILIGENCIAS, cursoId,
    CONFIG.COL.ID, CONFIG.COL.LINK, CONFIG.COL.DI_CLASS, CONFIG.COL.DF_CLASS,
    CONFIG.TOTAL_COLUNAS_DILIGENCIAS
  );
}

function preencherDatasClassroomAntigasIniciais_(cursoId) {
  return _preencherDatasClassroomAntigasDaAba_(
    CONFIG.SHEET_INICIAIS, cursoId,
    CONFIG.INICIAIS_COL.ID, CONFIG.INICIAIS_COL.LINK, CONFIG.INICIAIS_COL.DI_CLASS, CONFIG.INICIAIS_COL.DF_CLASS,
    CONFIG.TOTAL_COLUNAS_INICIAIS
  );
}

function preencherDatasClassroomAntigasAcompanhamentos_(cursoId) {
  return _preencherDatasClassroomAntigasDaAba_(
    CONFIG.SHEET_ACOMPANHAMENTOS, cursoId,
    CONFIG.ACOMPANHAMENTOS_COL.ID, CONFIG.ACOMPANHAMENTOS_COL.LINK, CONFIG.ACOMPANHAMENTOS_COL.DI_CLASS, CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS,
    CONFIG.TOTAL_COLUNAS_ACOMPANHAMENTOS
  );
}

// --- Ponto de entrada unico: rodar esta funcao pelo editor do Apps Script ---
// Executa o preenchimento nas tres abas e imprime um relatorio consolidado
// no Log de execucao (Ver > Registros de execucao).
function preencherDatasClassroomAntigasTudo() {
  var cursoId;
  try {
    cursoId = obterIdCursoClassroom();
  } catch (e) {
    Logger.log('ERRO: ' + e.message);
    return { erro: e.message };
  }

  var relDiligencias = preencherDatasClassroomAntigasDiligencias_(cursoId);
  var relIniciais = preencherDatasClassroomAntigasIniciais_(cursoId);
  var relAcompanhamentos = preencherDatasClassroomAntigasAcompanhamentos_(cursoId);

  var linhasLog = [];
  linhasLog.push('=== PREENCHIMENTO DE DI CLASS/DF CLASS EM REGISTROS ANTIGOS ===');

  [relDiligencias, relIniciais, relAcompanhamentos].forEach(function(rel) {
    linhasLog.push('');
    linhasLog.push('--- Aba: ' + rel.aba + ' ---');
    if (rel.erro) {
      linhasLog.push('ERRO: ' + rel.erro);
      return;
    }
    linhasLog.push('Preenchidos agora: ' + rel.preenchidos.length);
    linhasLog.push('Ja tinham DI CLASS (ignorados): ' + rel.jaPreenchidos.length);
    linhasLog.push('Sem link e/ou codigo do Classroom (deixados em branco): ' + rel.semLinkOuCodigo.length);
    linhasLog.push('Erros ao consultar o Classroom: ' + rel.erros.length);

    if (rel.erros.length > 0) {
      linhasLog.push('Detalhe dos erros:');
      rel.erros.forEach(function(item) {
        linhasLog.push('  Linha ' + item.linha + ' (ID ' + item.id + '): ' + item.erro);
      });
    }
  });

  var textoRelatorio = linhasLog.join('\n');
  Logger.log(textoRelatorio);

  return {
    diligencias: relDiligencias,
    iniciais: relIniciais,
    acompanhamentos: relAcompanhamentos,
    relatorioTexto: textoRelatorio
  };
}