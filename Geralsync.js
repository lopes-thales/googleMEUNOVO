// GeralSync.gs
// Responsabilidade: manter as colunas I, J, K, L (ESTAGIARIO, STATUS, OBS,
// ESPECIE) da aba "diligencias" espelhadas na planilha GERAL, via upsert por
// ID. GERAL insere os registros ate a coluna H (ID..ADV) atraves de um script
// proprio dela; este arquivo cuida do restante (I:L) e, quando um ID local
// ainda nao existe em GERAL (ex.: "Pedido Aluno" criado direto aqui), insere
// a linha inteira A:L.
//
// Nunca toca a coluna M da planilha GERAL (uso exclusivo de outro script la).
// Nunca toca ADV (coluna H) na origem — pertence a outro script (ver Config.js).
// Ao INSERIR um registro novo em GERAL (ID ainda nao existia la), a coluna N
// da linha criada e marcada com 'S' — sinalizador exigido por Thales para
// identificar registros criados por este script.
//
// Regra de "lock": uma linha so e processada enquanto SINC (coluna S de
// diligencias) for diferente de TRUE. Quando o STATUS sincronizado for "Ok"
// ou "Protocolado", este script marca SINC = TRUE na origem e a linha deixa
// de ser reprocessada (mesmo que volte a ser editada depois).
//
// Tambem replica FINALIZADO (coluna E da aba estagiarios) para a aba
// estagiarios de GERAL, por ID (coluna A) — ver
// sincronizarFinalizacaoEstagiariosParaGeral, chamada por
// finalizarEstagiariosPorId em Utilitarios.js ao salvar o modal "Gerenciar
// Estagiários". So atualiza linhas ja existentes em GERAL — nunca insere.

// --- Helpers internos ---

function _sincGeralEhVerdadeiro(valor) {
  if (valor === true) return true;
  return String(valor || '').trim().toUpperCase() === 'TRUE';
}

function _sincGeralEhStatusFinal(status) {
  var chave = normalizarChave(status);
  return chave === 'ok' || chave === 'protocolado';
}

// Abre a planilha GERAL (bd!G2). Lanca erro se o ID nao estiver configurado.
function _sincGeralAbrirPlanilha() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaBd = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!abaBd) throw new Error('Aba bd nao encontrada.');

  var idPlanilha = String(abaBd.getRange(CONFIG.BD_CELL.ID_PLANILHA_GERAL).getValue() || '').trim();
  if (!idPlanilha) {
    throw new Error('ID da planilha GERAL nao configurado em bd!' + CONFIG.BD_CELL.ID_PLANILHA_GERAL + '.');
  }

  return SpreadsheetApp.openById(idPlanilha);
}

// Abre a planilha GERAL (bd!G2) e retorna a aba de diligencias de la
// (nome em bd!O2). Lanca erro se algo nao estiver configurado.
function _sincGeralObterAbaDestino() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaBd = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!abaBd) throw new Error('Aba bd nao encontrada.');

  var nomeAba = String(abaBd.getRange(CONFIG.BD_CELL.NOME_ABA_GERAL_DILIGENCIAS).getValue() || '').trim();
  if (!nomeAba) {
    throw new Error('Nome da aba GERAL nao configurado em bd!' + CONFIG.BD_CELL.NOME_ABA_GERAL_DILIGENCIAS + '.');
  }

  var planilhaGeral = _sincGeralAbrirPlanilha();
  var abaGeral = planilhaGeral.getSheetByName(nomeAba);
  if (!abaGeral) {
    throw new Error('Aba "' + nomeAba + '" nao encontrada na planilha GERAL.');
  }

  return abaGeral;
}

// Abre a planilha GERAL (bd!G2) e retorna a aba estagiarios de la (mesmo
// nome usado localmente — CONFIG.SHEET_ESTAGIARIOS). Lanca erro se a aba
// nao existir la.
function _sincGeralObterAbaEstagiarios() {
  var planilhaGeral = _sincGeralAbrirPlanilha();
  var abaGeral = planilhaGeral.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!abaGeral) {
    throw new Error('Aba "' + CONFIG.SHEET_ESTAGIARIOS + '" nao encontrada na planilha GERAL.');
  }
  return abaGeral;
}

// Procura em GERAL (coluna A) a linha cujo ID corresponde ao informado.
// Retorna o numero da linha na planilha ou null se nao encontrado.
function _sincGeralLocalizarLinhaPorId(abaGeral, id) {
  var ultimaLinha = abaGeral.getLastRow();
  if (ultimaLinha < 2) return null;

  var idsGeral = abaGeral.getRange(2, 1, ultimaLinha - 1, 1).getValues();
  var idAlvo = String(id).trim();

  for (var i = 0; i < idsGeral.length; i++) {
    if (String(idsGeral[i][0]).trim() === idAlvo) {
      return i + 2;
    }
  }
  return null;
}

// --- Upsert de uma unica linha (usado por onEdit e pelos pontos do frontend) ---

// Sincroniza UMA linha da aba diligencias (local) para GERAL.
//   - Pula silenciosamente se a linha nao tiver ID ou se SINC ja for TRUE.
//   - Se o ID existir em GERAL: atualiza somente I:L (4 celulas).
//   - Se o ID nao existir em GERAL: insere a linha inteira A:L (12 colunas)
//     e marca a coluna N dessa linha nova com 'S'.
//   - Se o STATUS resultante for "Ok" ou "Protocolado": marca SINC = TRUE na origem.
// Nunca lanca excecao para quem chama — erros de rede/permissao na planilha
// GERAL nao podem travar o salvamento local (retorna {sucesso:false, erro:...}).
function sincronizarLinhaParaGeral(linhaPlanilha) {
  if (!linhaPlanilha || linhaPlanilha < 2) {
    return { sucesso: false, erro: 'Linha invalida.' };
  }

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var abaLocal = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
    if (!abaLocal) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };
    if (linhaPlanilha > abaLocal.getLastRow()) return { sucesso: true, pulado: true };

    var linha = abaLocal.getRange(linhaPlanilha, 1, 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues()[0];
    var id = String(linha[CONFIG.COL.ID] || '').trim();
    if (!id) return { sucesso: true, pulado: true };

    if (_sincGeralEhVerdadeiro(linha[CONFIG.COL.SINC])) {
      return { sucesso: true, pulado: true, motivo: 'ja sincronizado (SINC = TRUE)' };
    }

    var abaGeral = _sincGeralObterAbaDestino();
    var linhaGeral = _sincGeralLocalizarLinhaPorId(abaGeral, id);

    if (linhaGeral) {
      abaGeral.getRange(linhaGeral, CONFIG.COL.ESTAGIARIO + 1, 1, 4).setValues([[
        linha[CONFIG.COL.ESTAGIARIO],
        linha[CONFIG.COL.STATUS],
        linha[CONFIG.COL.OBS],
        linha[CONFIG.COL.ESPECIE]
      ]]);
    } else {
      var novaLinhaGeral = linha.slice(0, 12); // A:L — nunca toca a coluna M de GERAL
      var proximaLinhaGeral = abaGeral.getLastRow() + 1;
      abaGeral.getRange(proximaLinhaGeral, 1, 1, 12).setValues([novaLinhaGeral]);
      abaGeral.getRange(proximaLinhaGeral, 14).setValue('S'); // coluna N — sinaliza registro novo (insert)
    }

    if (_sincGeralEhStatusFinal(linha[CONFIG.COL.STATUS])) {
      abaLocal.getRange(linhaPlanilha, CONFIG.COL.SINC + 1).setValue(true);
    }

    return { sucesso: true, pulado: false, acao: linhaGeral ? 'update' : 'insert' };
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao sincronizar com GERAL: ' + e.message };
  }
}

// --- Upsert em lote (gatilho horario e botao manual) ---

// Sincroniza todas as linhas pendentes (SINC != TRUE) de uma vez, lendo a
// coluna de IDs de GERAL uma unica vez (mais eficiente que chamar
// sincronizarLinhaParaGeral em loop). Usada pelo gatilho horario e por uma
// execucao manual (ex.: botao "Sincronizar GERAL" na aba Utilitarios).
function sincronizarPendentesParaGeral() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaLocal = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!abaLocal) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };

  var ultimaLinha = abaLocal.getLastRow();
  if (ultimaLinha < 2) return { sucesso: true, quantidade: 0, erros: [] };

  var dados = abaLocal.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues();

  var pendentes = [];
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var id = String(row[CONFIG.COL.ID] || '').trim();
    if (!id) continue;
    if (_sincGeralEhVerdadeiro(row[CONFIG.COL.SINC])) continue;
    pendentes.push({ linha: i + 2, row: row, id: id });
  }

  if (!pendentes.length) return { sucesso: true, quantidade: 0, erros: [] };

  var abaGeral;
  try {
    abaGeral = _sincGeralObterAbaDestino();
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }

  var ultimaLinhaGeral = abaGeral.getLastRow();
  var mapaIdParaLinha = {};
  if (ultimaLinhaGeral >= 2) {
    var idsGeral = abaGeral.getRange(2, 1, ultimaLinhaGeral - 1, 1).getValues();
    for (var j = 0; j < idsGeral.length; j++) {
      var idGeral = String(idsGeral[j][0]).trim();
      if (idGeral) mapaIdParaLinha[idGeral] = j + 2;
    }
  }

  var quantidade = 0;
  var erros = [];
  var novasLinhasGeral = [];
  var filaInsercao = {}; // evita duplicar insercao se o mesmo ID aparecer 2x no lote (nao deveria acontecer)

  pendentes.forEach(function(pendente) {
    try {
      var linhaGeralExistente = mapaIdParaLinha[pendente.id];
      if (linhaGeralExistente) {
        abaGeral.getRange(linhaGeralExistente, CONFIG.COL.ESTAGIARIO + 1, 1, 4).setValues([[
          pendente.row[CONFIG.COL.ESTAGIARIO],
          pendente.row[CONFIG.COL.STATUS],
          pendente.row[CONFIG.COL.OBS],
          pendente.row[CONFIG.COL.ESPECIE]
        ]]);
      } else if (!filaInsercao[pendente.id]) {
        novasLinhasGeral.push(pendente.row.slice(0, 12));
        filaInsercao[pendente.id] = true;
      }

      if (_sincGeralEhStatusFinal(pendente.row[CONFIG.COL.STATUS])) {
        abaLocal.getRange(pendente.linha, CONFIG.COL.SINC + 1).setValue(true);
      }
      quantidade++;
    } catch (e) {
      erros.push({ linha: pendente.linha, id: pendente.id, erro: e.message });
    }
  });

  if (novasLinhasGeral.length) {
    var proximaLinhaGeral = abaGeral.getLastRow() + 1;
    abaGeral.getRange(proximaLinhaGeral, 1, novasLinhasGeral.length, 12).setValues(novasLinhasGeral);
    // coluna N — sinaliza registros novos (insert); setValue preenche todas as celulas do range
    abaGeral.getRange(proximaLinhaGeral, 14, novasLinhasGeral.length, 1).setValue('S');
  }

  return { sucesso: true, quantidade: quantidade, erros: erros };
}

// --- Sincronizacao de FINALIZADO da aba estagiarios (botao "Gerenciar
// Estagiarios", aba Utilitarios > Sistema) ---

// Recebe os IDs marcados como finalizados localmente e marca FINALIZADO =
// TRUE (coluna E) nas linhas correspondentes da aba estagiarios da planilha
// GERAL (bd!G2), localizando cada linha pelo ID (coluna A). IDs que nao
// existirem em GERAL sao ignorados silenciosamente (mesmo comportamento
// usado localmente em finalizarEstagiariosPorId, ver Utilitarios.js).
// Nunca lanca excecao para quem chama — erro de rede/permissao na planilha
// GERAL nao pode travar o salvamento local (retorna {sucesso:false, erro:...}).
function sincronizarFinalizacaoEstagiariosParaGeral(ids) {
  ids = (ids || []).map(function(v) { return String(v).trim(); }).filter(Boolean);
  if (ids.length === 0) return { sucesso: true, quantidade: 0 };

  try {
    var abaGeral = _sincGeralObterAbaEstagiarios();

    var ultimaLinhaGeral = abaGeral.getLastRow();
    if (ultimaLinhaGeral < 2) return { sucesso: true, quantidade: 0 };

    var idsAlvo = {};
    ids.forEach(function(id) { idsAlvo[id] = true; });

    var numLinhas = ultimaLinhaGeral - 1;
    var dadosIdGeral = abaGeral.getRange(2, CONFIG.ESTAGIARIOS_COL.ID + 1, numLinhas, 1).getValues();

    var quantidade = 0;
    for (var i = 0; i < dadosIdGeral.length; i++) {
      var id = String(dadosIdGeral[i][0]).trim();
      if (idsAlvo[id]) {
        abaGeral.getRange(2 + i, CONFIG.ESTAGIARIOS_COL.FINALIZADO + 1).setValue(true);
        quantidade++;
      }
    }

    return { sucesso: true, quantidade: quantidade };
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao sincronizar FINALIZADO com GERAL: ' + e.message };
  }
}

// --- Gatilho de edicao (onEdit) ---

// Qualquer edicao manual na aba diligencias (qualquer coluna, inclusive fora
// de I:L, ex. PROCESSO) dispara a resincronizacao da(s) linha(s) afetada(s) —
// decisao de Thales. Chamado a partir de onEdit() em Code.js.
function processarEdicaoGeralSync(e) {
  if (!e || !e.range) return;

  var range = e.range;
  var sheet = range.getSheet();
  if (!sheet || sheet.getName() !== CONFIG.SHEET_DILIGENCIAS) return;

  var linhaInicial = range.getRow();
  var numLinhas = range.getNumRows();

  for (var i = 0; i < numLinhas; i++) {
    var linha = linhaInicial + i;
    if (linha < 2) continue;
    sincronizarLinhaParaGeral(linha);
  }
}

// --- Gatilho automatico (a cada hora) ---

// Rodar esta funcao MANUALMENTE uma unica vez pelo editor do Apps Script
// (Executar > configurarGatilhoSincronizacaoGeral) para instalar o gatilho.
// Seguro executar novamente: remove qualquer gatilho antigo do mesmo handler
// antes de criar um novo, evitando duplicatas (mesmo padrao usado em
// configurarGatilhoVerificacaoAutomatica, em Classroom.js).
function configurarGatilhoSincronizacaoGeral() {
  var gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(function(g) {
    if (g.getHandlerFunction() === 'sincronizarPendentesParaGeral') {
      ScriptApp.deleteTrigger(g);
    }
  });

  ScriptApp.newTrigger('sincronizarPendentesParaGeral')
    .timeBased()
    .everyHours(1)
    .create();
}