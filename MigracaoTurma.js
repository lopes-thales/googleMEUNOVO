// MigracaoTurma.gs
// Responsabilidade: backfill unico e descartavel para preencher a coluna
// TURMA (estagiarios!M) a partir de DATA_INICIO (estagiarios!K) e SEMESTRE
// (estagiarios!F). Executar manualmente uma unica vez pelo editor do Apps
// Script (Executar > executarMigracaoTurma).
//
// Regras:
// - Idempotente: e seguro executar varias vezes; linhas ja preenchidas sao
//   ignoradas.
// - Nunca sobrescreve uma celula de TURMA que ja tenha valor.
// - Forca formato de texto (setNumberFormat('@')) antes de gravar, mesmo
//   padrao ja usado para SEMESTRE.
// - Loga um resumo com contagens por turma e linhas que ficaram vazias.
//
// Decisao de Thales (27/07/2026): como a unica turma antecipada ate entao e a
// de julho/2026, so os alunos dela tem DATA_INICIO preenchida; todo o resto
// vira "-R". A regra continua correta no futuro, quando as turmas regulares
// tambem tiverem DATA_INICIO.

function executarMigracaoTurma() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) {
    Logger.log('Erro: aba ' + CONFIG.SHEET_ESTAGIARIOS + ' nao encontrada.');
    return { sucesso: false, erro: 'Aba estagiarios nao encontrada.' };
  }

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) {
    Logger.log('Aba estagiarios vazia — nada a migrar.');
    return { sucesso: true, mensagem: 'Aba estagiarios vazia.', atualizados: 0, porTurma: {}, vazios: 0 };
  }

  var numLinhas = ultimaLinha - 1;
  var dados = aba.getRange(2, 1, numLinhas, CONFIG.TOTAL_COLUNAS_ESTAGIARIOS).getValues();
  var notas = aba.getRange(2, CONFIG.ESTAGIARIOS_COL.TURMA + 1, numLinhas, 1).getNotes();

  var novosValores = [];
  var novasNotas = [];
  var totalAtualizado = 0;
  var porTurma = {};
  var vazios = 0;
  var razoesVazio = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var turmaAtual = String(row[CONFIG.ESTAGIARIOS_COL.TURMA] || '').trim();

    if (turmaAtual) {
      // Ja preenchido — mantem e nao conta
      novosValores.push([turmaAtual]);
      novasNotas.push(notas[i] || ['']);
      continue;
    }

    var dataInicio = row[CONFIG.ESTAGIARIOS_COL.DATA_INICIO];
    var semestre = normalizarSemestreLido(row[CONFIG.ESTAGIARIOS_COL.SEMESTRE]);
    var nome = String(row[CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    var linhaPlanilha = i + 2;

    if (!semestre) {
      vazios++;
      razoesVazio.push('Linha ' + linhaPlanilha + ' (' + (nome || 'sem nome') + '): semestre vazio');
      novosValores.push(['']);
      novasNotas.push(notas[i] || ['']);
      continue;
    }

    var turma = calcularTurma(dataInicio, semestre);

    if (!turma) {
      vazios++;
      razoesVazio.push('Linha ' + linhaPlanilha + ' (' + (nome || 'sem nome') + '): turma nao calculada');
      novosValores.push(['']);
      novasNotas.push(notas[i] || ['']);
      continue;
    }

    novosValores.push([turma]);
    novasNotas.push(['Migração automática em ' + formatarData(new Date())]);
    totalAtualizado++;
    porTurma[turma] = (porTurma[turma] || 0) + 1;
  }

  // Grava somente se houve alguma alteracao
  if (totalAtualizado > 0) {
    var rangeTurma = aba.getRange(2, CONFIG.ESTAGIARIOS_COL.TURMA + 1, numLinhas, 1);
    rangeTurma.setNumberFormat('@');
    rangeTurma.setValues(novosValores);
    rangeTurma.setNotes(novasNotas);
  }

  // Log do resumo
  Logger.log('=== Migracao TURMA ===');
  Logger.log('Linhas atualizadas: ' + totalAtualizado);
  Logger.log('Linhas que ficaram vazias: ' + vazios);
  var turmas = Object.keys(porTurma).sort();
  turmas.forEach(function(t) { Logger.log('  ' + t + ': ' + porTurma[t]); });
  if (razoesVazio.length) {
    Logger.log('Razoes de vazio:');
    razoesVazio.forEach(function(r) { Logger.log('  - ' + r); });
  }

  return {
    sucesso: true,
    mensagem: totalAtualizado + ' linha(s) atualizada(s). ' + vazios + ' linha(s) permaneceram vazias.',
    atualizados: totalAtualizado,
    porTurma: porTurma,
    vazios: vazios,
    razoesVazio: razoesVazio
  };
}
