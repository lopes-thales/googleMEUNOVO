// MigracaoClassroom.gs
// Responsabilidade: script de migracao UNICO (rodar manualmente uma vez pelo
// editor do Apps Script, funcao migrarNotasClassroomTudo). Nao e chamado
// pelo frontend nem por nenhum outro script do projeto.
//
// CONTEXTO: no fluxo normal do sistema, o ID da coursework do Classroom fica
// gravado como NOTA (comentario) da celula LINK — nunca em uma coluna visivel
// (ver enviarDiligenciasAoClassroom e criarPedidoInicialAluno em
// Classroom.js/Iniciais.js). Registros migrados de um sistema anterior tem o
// LINK preenchido, mas sem essa nota, o que impede a rotina de "Verificar
// Entregas" de localizar a atividade correspondente no Classroom.
//
// SOLUCAO: o link do Classroom carrega o ID da coursework na propria URL, no
// formato confirmado por Thales:
//   https://classroom.google.com/c/{cursoId}/a/{courseworkId}/details
// Este script varre diligencias e iniciais, extrai o courseworkId de cada
// LINK sem nota e grava a nota, replicando exatamente o que o sistema faz ao
// criar uma atividade nova. Nenhuma chamada a API do Classroom e feita aqui
// — e apenas leitura/escrita de celulas da planilha.
//
// SEGURANCA: uma linha so e alterada se (a) o LINK estiver preenchido e
// (b) a celula ainda NAO tiver nota. Linhas ja migradas ou criadas pelo
// sistema normal nunca sao tocadas de novo.

// Regex do link do Classroom: captura o courseworkId (base64) entre "/a/" e a
// proxima barra ou "?" (cobre tanto ".../a/123/details" quanto variacoes
// com parametros de query, ex. "?hl=pt_BR").
var REGEX_LINK_CLASSROOM = /classroom\.google\.com\/c\/[^\/]+\/a\/([^\/?]+)/;

// Os IDs nas URLs do Classroom sao codificados em base64. Esta funcao
// decodifica o segmento extraido da URL para obter o ID numerico real.
function decodificarIdClassroom_(idBase64) {
  try {
    var bytes = Utilities.base64Decode(idBase64);
    return bytes.map(function(b) { return String.fromCharCode(b); }).join('');
  } catch (e) {
    return null;
  }
}

function extrairCourseworkIdDoLink_(link) {
  var m = String(link || '').match(REGEX_LINK_CLASSROOM);
  if (!m) return null;
  return decodificarIdClassroom_(m[1]);
}

// Migra uma aba generica. colLink e o indice (base 0) da coluna LINK dentro
// de CONFIG.COL/INICIAIS_COL correspondente. Retorna um relatorio com
// migrados, corrigidos (nota base64 substituida pelo ID numerico),
// ja-corretos (nota numerica existente), sem-link e fora do padrao.
function migrarNotasClassroomDaAba_(nomeAba, colLinkIndex, totalColunas, colIdIndex) {
  var relatorio = { aba: nomeAba, migrados: [], corrigidos: [], jaTinhaNota: [], semLink: [], forameDoPadrao: [] };

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
    var link = String(dados[i][colLinkIndex] || '').trim();

    if (!link) {
      relatorio.semLink.push({ linha: linha, id: id });
      continue;
    }

    var celulaLink = aba.getRange(linha, colLinkIndex + 1);
    var notaAtual = String(celulaLink.getNote() || '').trim();

    // Nota ja numerica: linha ja esta correta, nada a fazer.
    if (notaAtual && /^\d+$/.test(notaAtual)) {
      relatorio.jaTinhaNota.push({ linha: linha, id: id });
      continue;
    }

    var courseworkId = extrairCourseworkIdDoLink_(link);
    if (!courseworkId) {
      relatorio.forameDoPadrao.push({ linha: linha, id: id, link: link });
      continue;
    }

    celulaLink.setNote(courseworkId);
    if (notaAtual) {
      // Tinha nota no formato errado (base64); foi substituida pelo ID numerico.
      relatorio.corrigidos.push({ linha: linha, id: id, notaAnterior: notaAtual, courseworkId: courseworkId });
    } else {
      relatorio.migrados.push({ linha: linha, id: id, courseworkId: courseworkId });
    }
  }

  return relatorio;
}

function migrarNotasClassroomDiligencias() {
  return migrarNotasClassroomDaAba_(
    CONFIG.SHEET_DILIGENCIAS,
    CONFIG.COL.LINK,
    CONFIG.TOTAL_COLUNAS_DILIGENCIAS,
    CONFIG.COL.ID
  );
}

function migrarNotasClassroomIniciais() {
  return migrarNotasClassroomDaAba_(
    CONFIG.SHEET_INICIAIS,
    CONFIG.INICIAIS_COL.LINK,
    CONFIG.TOTAL_COLUNAS_INICIAIS,
    CONFIG.INICIAIS_COL.ID
  );
}

// --- Ponto de entrada unico: rodar esta funcao pelo editor do Apps Script ---
// Executa a migracao das duas abas e imprime um relatorio consolidado no
// Log de execucao (Ver > Registros de execucao). Linhas fora do padrao
// esperado NAO sao alteradas e ficam listadas em "fora do padrao" para
// tratamento manual por Thales.
function migrarNotasClassroomTudo() {
  var relDiligencias = migrarNotasClassroomDiligencias();
  var relIniciais = migrarNotasClassroomIniciais();

  var linhasLog = [];
  linhasLog.push('=== MIGRACAO DE NOTAS DO CLASSROOM ===');

  [relDiligencias, relIniciais].forEach(function(rel) {
    linhasLog.push('');
    linhasLog.push('--- Aba: ' + rel.aba + ' ---');
    if (rel.erro) {
      linhasLog.push('ERRO: ' + rel.erro);
      return;
    }
    linhasLog.push('Migrados (novos): ' + rel.migrados.length);
    linhasLog.push('Corrigidos (nota base64 -> ID numerico): ' + rel.corrigidos.length);
    linhasLog.push('Ja corretos - nota numerica (ignorados): ' + rel.jaTinhaNota.length);
    linhasLog.push('Sem link (ignorados): ' + rel.semLink.length);
    linhasLog.push('Fora do padrao esperado (NAO alterados): ' + rel.forameDoPadrao.length);

    if (rel.forameDoPadrao.length > 0) {
      linhasLog.push('Detalhe das linhas fora do padrao:');
      rel.forameDoPadrao.forEach(function(item) {
        linhasLog.push('  Linha ' + item.linha + ' (ID ' + item.id + '): ' + item.link);
      });
    }
  });

  var textoRelatorio = linhasLog.join('\n');
  Logger.log(textoRelatorio);

  return {
    diligencias: relDiligencias,
    iniciais: relIniciais,
    relatorioTexto: textoRelatorio
  };
}