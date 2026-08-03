// MigracaoExecucaoPropria.gs
// Responsabilidade: backfill UNICO da RN-EP (Execucao Propria de Diligencias,
// fechada em 03/08/2026 — ver RN_Execucao_Propria.md, RN-EP-10). Marca como
// execucao propria toda diligencia sem estagiario que ja chegou a um status
// final, deduzindo a turma pela DF Real quando possivel.
//
// Rodar UMA VEZ, pelo editor do Apps Script:
//   backfillExecucaoPropria()
//
// Seguro para reexecucao: uma linha que ja carrega a nota EXEC_PROPRIA em H e
// pulada — nunca remarcada nem reprocessada. Isso preserva de proposito
// qualquer linha que o modal ja tenha marcado manualmente com AA em branco
// (estado legitimo da RN-EP-03, escolha de turma adiada).
//
// Criterio de selecao (RN-EP-10): ESTAGIARIO (I) vazio E STATUS (J) em
// CONFIG.STATUS_FINAIS ('ok', 'protocolado', 'cancelada').
//
// Acao por linha elegivel:
//   1. grava a nota EXEC_PROPRIA em H (ver marcarNotaExecPropria, Turma.js);
//   2. deduz a turma por calcularTurma(DF Real) — a janela cadastrada em
//      `turmas` que contem a DF Real. Uso legitimo de calcularTurma() fora do
//      caminho quente: o cabecalho de Turma.js reserva a funcao a exatamente
//      dois casos, sendo este um deles;
//   3. se a deducao retornar um codigo: grava AA e deriva SEMESTRE
//      (extrairSemestreDaTurma, RN-T08 preservada — nunca calculado da data);
//   4. se a DF Real estiver vazia ou fora de toda janela cadastrada: deixa AA
//      em branco e inclui a linha no relatorio de pendencias, para resolucao
//      manual no modal de Diligencia.
function backfillExecucaoPropria() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) {
    Logger.log('Aba diligencias nao encontrada.');
    return { marcadasAgora: 0, jaMarcadas: 0, comTurma: 0, pendentes: [] };
  }

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) {
    Logger.log('Aba diligencias vazia.');
    return { marcadasAgora: 0, jaMarcadas: 0, comTurma: 0, pendentes: [] };
  }

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues();
  var notasAdv = aba.getRange(2, CONFIG.COL.ADV + 1, ultimaLinha - 1, 1).getNotes();

  var marcadasAgora = 0;
  var jaMarcadas = 0;
  var comTurma = 0;
  var pendentes = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CONFIG.COL.ID] && !row[CONFIG.COL.PROCESSO]) continue;

    var estagiario = String(row[CONFIG.COL.ESTAGIARIO] || '').trim();
    if (estagiario) continue;

    var statusNorm = normalizarChave(row[CONFIG.COL.STATUS]);
    if (CONFIG.STATUS_FINAIS.indexOf(statusNorm) === -1) continue;

    var linha = i + 2;

    if (notaContemExecPropria(notasAdv[i][0])) {
      jaMarcadas++;
      continue; // seguro para reexecucao: nunca remarca linha ja marcada
    }

    var advCell = aba.getRange(linha, CONFIG.COL.ADV + 1);
    marcarNotaExecPropria(advCell);
    marcadasAgora++;

    // Defensivo: invariante 4 do RN-EP proibe Z preenchida com a marcacao
    // presente. Nao deveria acontecer numa linha sem estagiario, mas nunca
    // sobrescrever silenciosamente sem deixar rastro no log.
    var idMatriculaAtual = String(row[CONFIG.COL.ID_MATRICULA] || '').trim();
    if (idMatriculaAtual) {
      aba.getRange(linha, CONFIG.COL.ID_MATRICULA + 1).setNumberFormat('@').setValue('');
      Logger.log('Linha ' + linha + ': ID_MATRICULA (' + idMatriculaAtual + ') limpo — inconsistente com ESTAGIARIO vazio.');
    }

    var dfReal = row[CONFIG.COL.DF_REAL];
    var turmaDeduzida = calcularTurma(dfReal);

    if (turmaDeduzida) {
      aba.getRange(linha, CONFIG.COL.TURMA + 1).setNumberFormat('@').setValue(turmaDeduzida);
      aba.getRange(linha, CONFIG.COL.SEMESTRE + 1).setNumberFormat('@').setValue(extrairSemestreDaTurma(turmaDeduzida));
      comTurma++;
    } else {
      pendentes.push({
        linha: linha,
        id: row[CONFIG.COL.ID],
        dfReal: formatarData(dfReal)
      });
    }
  }

  Logger.log('Backfill Execucao Propria concluido.');
  Logger.log('Marcadas agora: ' + marcadasAgora + '. Ja estavam marcadas: ' + jaMarcadas + '.');
  Logger.log('Com turma deduzida: ' + comTurma + '. Pendentes (sem turma): ' + pendentes.length + '.');
  if (pendentes.length > 0) {
    Logger.log('Linhas pendentes (resolver a mao no modal de Diligencia):');
    pendentes.forEach(function(p) {
      Logger.log('  linha ' + p.linha + ' — ID ' + p.id + ' — DF Real: ' + (p.dfReal || '(vazia)'));
    });
  }

  return { marcadasAgora: marcadasAgora, jaMarcadas: jaMarcadas, comTurma: comTurma, pendentes: pendentes };
}
