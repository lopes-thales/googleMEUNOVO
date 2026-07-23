// Secretaria.gs
// Responsabilidade: copiar diligencias protocoladas para a aba secretaria,
// marcar a coluna U da origem para evitar reenvio, enviar a aba secretaria
// para a planilha destino e disparar o e-mail de resumo.

function ehStatusProtocolado(valor) {
  return normalizarChave(valor) === 'protocolado';
}

function jaEnviadoParaSecretaria(valor) {
  return String(valor || '').trim().toUpperCase() === 'S';
}

function montarLinhaSecretaria(row) {
  return [
    row[CONFIG.COL.PROCESSO],
    row[CONFIG.COL.ASSISTIDO],
    row[CONFIG.COL.ALTERADO_EM],
    row[CONFIG.COL.ESTAGIARIO],
    row[CONFIG.COL.ESPECIE],
    row[CONFIG.COL.VARA]
  ];
}

function _obterIdPlanilhaSecretariaDestino(ss) {
  var abaBd = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!abaBd) {
    throw new Error('Aba bd nao encontrada.');
  }

  var idDestino = String(abaBd.getRange(CONFIG.BD_CELL.ID_PLANILHA_SECRETARIA).getValue() || '').trim();
  if (!idDestino) {
    throw new Error('ID da planilha de secretaria nao configurado em bd!' + CONFIG.BD_CELL.ID_PLANILHA_SECRETARIA + '.');
  }
  return idDestino;
}

function _escapeHtmlSecretaria(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function _formatarDataSecretaria(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return Utilities.formatDate(valor, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');
  }
  return valor ? String(valor) : '--';
}

function _enviarEmailSecretaria(linhasEnviadas) {
  if (!linhasEnviadas || !linhasEnviadas.length) return;

  var dataRef = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');
  var html = '<p style="font-family:Arial,sans-serif; font-size:14px;">Ola,</p>'
           + '<p style="font-family:Arial,sans-serif; font-size:14px;">'
           + 'Seguem as atividades protocoladas ate ' + dataRef + ':</p>'
           + '<table border="1" cellpadding="8" cellspacing="0" '
           + 'style="border-collapse:collapse; font-family:Arial,sans-serif; '
           + 'font-size:13px; min-width:600px;">'
           + '<thead>'
           + '<tr style="background:#3D6A61; color:#ffffff;">'
           + '<th style="text-align:left; padding:10px 12px;">Processo</th>'
           + '<th style="text-align:left; padding:10px 12px;">Assistida(o)</th>'
           + '<th style="text-align:left; padding:10px 12px;">Estagiaria(o)</th>'
           + '<th style="text-align:left; padding:10px 12px;">Especie</th>'
           + '<th style="text-align:left; padding:10px 12px;">Data Protocolo</th>'
           + '<th style="text-align:left; padding:10px 12px;">Vara</th>'
           + '</tr>'
           + '</thead>'
           + '<tbody>';

  for (var i = 0; i < linhasEnviadas.length; i++) {
    var linha = linhasEnviadas[i];
    var bgRow = (i % 2 === 0) ? '#ffffff' : '#f4f8f6';
    html += '<tr style="background:' + bgRow + ';">'
         +  '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linha[0]) + '</td>'
         +  '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linha[1]) + '</td>'
         +  '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linha[3]) + '</td>'
         +  '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linha[4]) + '</td>'
         +  '<td style="padding:8px 12px;">' + _formatarDataSecretaria(linha[2]) + '</td>'
         +  '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linha[5]) + '</td>'
         +  '</tr>';
  }

  html += '</tbody></table>'
        + '<p style="font-family:Arial,sans-serif; font-size:11px; color:#888; margin-top:20px;">'
        + 'Mensagem gerada automaticamente pelo sistema criado por Thales.</p>';

  MailApp.sendEmail({
    to: CONFIG.EMAILS_SECRETARIA.join(','),
    subject: 'Atividades Protocoladas por Thales em ' + dataRef,
    htmlBody: html
  });
}

function sincronizarDiligenciasParaSecretaria(linhasAlvo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaDiligencias = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  var abaSecretaria = ss.getSheetByName(CONFIG.SHEET_SECRETARIA);

  if (!abaDiligencias) {
    throw new Error('Aba diligencias nao encontrada.');
  }
  if (!abaSecretaria) {
    throw new Error('Aba secretaria nao encontrada.');
  }

  var ultimaLinha = abaDiligencias.getLastRow();
  if (ultimaLinha < 2) {
    return { sucesso: true, quantidade: 0, linhas: [] };
  }

  var linhasPermitidas = null;
  if (linhasAlvo && linhasAlvo.length) {
    linhasPermitidas = {};
    linhasAlvo.forEach(function(linha) {
      var linhaNum = parseInt(linha, 10);
      if (!isNaN(linhaNum) && linhaNum >= 2) {
        linhasPermitidas[linhaNum] = true;
      }
    });
  }

  var dados = abaDiligencias.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues();
  var linhasOrigem = [];
  var linhasSecretaria = [];

  for (var i = 0; i < dados.length; i++) {
    var linhaPlanilha = i + 2;
    if (linhasPermitidas && !linhasPermitidas[linhaPlanilha]) continue;

    var row = dados[i];
    var processo = String(row[CONFIG.COL.PROCESSO] || '').trim();
    if (!processo) continue;
    if (!ehStatusProtocolado(row[CONFIG.COL.STATUS])) continue;
    if (jaEnviadoParaSecretaria(row[CONFIG.COL.SECRETARIA])) continue;

    linhasOrigem.push(linhaPlanilha);
    linhasSecretaria.push(montarLinhaSecretaria(row));
  }

  if (!linhasSecretaria.length) {
    return { sucesso: true, quantidade: 0, linhas: [] };
  }

  var primeiraLinhaSecretaria = abaSecretaria.getLastRow() + 1;
  abaSecretaria.getRange(primeiraLinhaSecretaria, 1, linhasSecretaria.length, 6).setValues(linhasSecretaria);

  linhasOrigem.forEach(function(linha) {
    abaDiligencias.getRange(linha, CONFIG.COL.SECRETARIA + 1).setValue('S');
  });

  return {
    sucesso: true,
    quantidade: linhasSecretaria.length,
    linhas: linhasOrigem
  };
}

function processarEdicaoSecretaria(e) {
  if (!e || !e.range) return;

  var range = e.range;
  var sheet = range.getSheet();
  if (!sheet || sheet.getName() !== CONFIG.SHEET_DILIGENCIAS) return;
  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;
  if (range.getColumn() !== CONFIG.COL.STATUS + 1) return;
  if (range.getRow() < 2) return;

  var novoValor = range.getValue();
  if (!ehStatusProtocolado(novoValor)) return;

  var flagSecretaria = sheet.getRange(range.getRow(), CONFIG.COL.SECRETARIA + 1).getValue();
  if (jaEnviadoParaSecretaria(flagSecretaria)) return;

  sincronizarDiligenciasParaSecretaria([range.getRow()]);
}

function enviarSecretariaParaPlanilhaDestino() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaSecretaria = ss.getSheetByName(CONFIG.SHEET_SECRETARIA);
  if (!abaSecretaria) {
    return { sucesso: false, erro: 'Aba secretaria nao encontrada.' };
  }

  var ultimaLinha = abaSecretaria.getLastRow();
  if (ultimaLinha < 2) {
    return { sucesso: true, quantidade: 0, mensagem: 'Nenhum registro pendente na aba secretaria.' };
  }

  var numLinhas = ultimaLinha - 1;
  var dados = abaSecretaria.getRange(2, 1, numLinhas, 7).getValues();
  var linhasOrigem = [];
  var linhasDestino = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var linhaPlanilha = i + 2;
    var vazio = true;

    for (var j = 0; j < 6; j++) {
      if (String(row[j] || '').trim() !== '') {
        vazio = false;
        break;
      }
    }

    if (vazio) continue;
    if (jaEnviadoParaSecretaria(row[6])) continue;

    linhasOrigem.push(linhaPlanilha);
    linhasDestino.push(row.slice(0, 6));
  }

  if (!linhasDestino.length) {
    return { sucesso: true, quantidade: 0, mensagem: 'Nenhum registro pendente na aba secretaria.' };
  }

  var idDestino = _obterIdPlanilhaSecretariaDestino(ss);
  var planilhaDestino = SpreadsheetApp.openById(idDestino);
  var abaDestino = planilhaDestino.getSheetByName('thales');
  if (!abaDestino) {
    return { sucesso: false, erro: 'Aba thales nao encontrada na planilha destino.' };
  }

  var primeiraLinhaDestino = abaDestino.getLastRow() + 1;
  abaDestino.getRange(primeiraLinhaDestino, 1, linhasDestino.length, 6).setValues(linhasDestino);

  linhasOrigem.forEach(function(linha) {
    abaSecretaria.getRange(linha, 7).setValue('S');
  });

  try {
    _enviarEmailSecretaria(linhasDestino);
  } catch (e) {
    return {
      sucesso: false,
      erro: 'Os registros foram enviados para a planilha da secretaria, mas o e-mail falhou: ' + e.message
    };
  }

  return {
    sucesso: true,
    quantidade: linhasDestino.length,
    mensagem: linhasDestino.length + ' registro(s) enviado(s) para a planilha da secretaria e e-mail enviado com sucesso.'
  };
}
