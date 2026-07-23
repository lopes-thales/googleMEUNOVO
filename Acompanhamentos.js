// Acompanhamentos.gs
// Responsabilidade: leitura/escrita da aba "acompanhamentos" e criacao de
// novos registros (modal "Novo Acompanhamento"). Nenhum outro arquivo deve
// ler/escrever esta aba diretamente.
//
// A aba nao tem coluna ASSISTIDO, OBS nem ALTERADO EM (ao contrario de
// diligencias/iniciais) — por isso o modal de detalhe/edicao e mais enxuto
// e a criacao de um registro novo tambem nao pede Assistido(a) nem Especie
// (ver thales.html / Scripts.html).
//
// Os campos do objeto retornado ao frontend reaproveitam os nomes "estagiario",
// "di" e "df" (em vez de "nome", "data" e "dataEntrega") de proposito: assim
// as funcoes genericas de UI ja existentes (renderizarCelulaEstagiario,
// ehSemEstagiario, classificarRegistro, badgeStatus, compararRegistros,
// converterDataBRParaTimestamp etc., ver Scripts.html) funcionam sem
// duplicacao de codigo — mesma logica usada por Iniciais.js.

// --- Montagem do objeto para o frontend ---

function rowParaObjetoAcompanhamento(row, indice, feriadosTimestamps) {
  var status = String(row[CONFIG.ACOMPANHAMENTOS_COL.STATUS] || '').trim();
  var dataEntrega = row[CONFIG.ACOMPANHAMENTOS_COL.DATA_ENTREGA];
  var dfParaAtraso = resolverDfParaAtraso(row[CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS], dataEntrega);
  var atrasoVal = calcularAtraso(dfParaAtraso, status);
  var gatilhoVal = calcularGatilhoPrazo(dataEntrega, status, feriadosTimestamps);

  return {
    _linha: indice + 2,
    id: row[CONFIG.ACOMPANHAMENTOS_COL.ID],
    estagiario: row[CONFIG.ACOMPANHAMENTOS_COL.NOME], // reaproveita "estagiario" (ver nota acima)
    processo: row[CONFIG.ACOMPANHAMENTOS_COL.PROCESSO],
    di: formatarData(row[CONFIG.ACOMPANHAMENTOS_COL.DATA]), // reaproveita "di" (data de criacao)
    status: status,
    email: String(row[CONFIG.ACOMPANHAMENTOS_COL.EMAIL] || '').trim(),
    link: String(row[CONFIG.ACOMPANHAMENTOS_COL.LINK] || '').trim(),
    diClass: formatarData(row[CONFIG.ACOMPANHAMENTOS_COL.DI_CLASS]), // data de criacao real no Classroom, ver Classroom.js
    dfClass: formatarData(row[CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS]), // data de entrega/dueDate real no Classroom, ver Classroom.js
    df: formatarData(dataEntrega), // reaproveita "df" (data de entrega)
    semestre: normalizarSemestreLido(row[CONFIG.ACOMPANHAMENTOS_COL.SEMESTRE]),
    atraso: atrasoVal,
    prazoAtraso: formatarData(dfParaAtraso), // DF CLASS (com fallback para DATA_ENTREGA) usada no calculo de atraso — consumida pelas cobrancas, ver Mensagens.js
    gatilho: gatilhoVal // null | 'gatilho1' | 'gatilho2' | 'gatilho3'
  };
}

// Le toda a aba acompanhamentos e retorna a lista ja pronta para o frontend.
function getTodosAcompanhamentos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ACOMPANHAMENTOS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_ACOMPANHAMENTOS).getValues();
  var feriadosTimestamps = lerFeriados();
  var lista = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CONFIG.ACOMPANHAMENTOS_COL.ID] && !row[CONFIG.ACOMPANHAMENTOS_COL.PROCESSO]) continue;
    lista.push(rowParaObjetoAcompanhamento(row, i, feriadosTimestamps));
  }
  return lista;
}

// --- Agregador usado pela aba "Acompanhamentos" no frontend ---

function getDadosAbaAcompanhamentos() {
  return {
    acompanhamentos: getTodosAcompanhamentos(),
    // Mesma picklist de status usada por Diligencias/Iniciais (bd!A2:A).
    // "Protocolado" permanece disponivel na lista por decisao de Thales,
    // ainda que nunca seja atribuido automaticamente a um acompanhamento.
    statusPicklist: lerColunaBd(CONFIG.BD_COL.STATUS)
  };
}

// --- Escrita (somente STATUS e editavel manualmente pelo painel nesta aba) ---

function salvarEdicaoAcompanhamento(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ACOMPANHAMENTOS);
  if (!aba) return { sucesso: false, erro: 'Aba acompanhamentos nao encontrada.' };

  var linha = parseInt(payload._linha, 10);
  if (isNaN(linha) || linha < 2) return { sucesso: false, erro: 'Linha invalida.' };

  var novoStatus = String(payload.status || '').trim();
  var dataEntregaAtual = aba.getRange(linha, CONFIG.ACOMPANHAMENTOS_COL.DATA_ENTREGA + 1).getValue();
  var dfClassAtual = aba.getRange(linha, CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS + 1).getValue();

  aba.getRange(linha, CONFIG.ACOMPANHAMENTOS_COL.STATUS + 1).setValue(novoStatus);

  return {
    sucesso: true,
    novoAtraso: calcularAtraso(resolverDfParaAtraso(dfClassAtual, dataEntregaAtual), novoStatus)
  };
}

// --- Novo Acompanhamento ---

// Le bd!K2, incrementa e grava de volta. Retorna o ID formatado "AC-0008".
// Guarda apenas o numero inteiro na celula, nunca o ID formatado — mesma
// estrategia usada por proximoNumeroPedidoAluno() em Data.js.
function proximoNumeroAcompanhamento() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) throw new Error('Aba bd nao encontrada.');

  var celula = aba.getRange(CONFIG.BD_CELL.CONTROLE_AC);
  var atual = parseInt(celula.getValue(), 10);
  if (isNaN(atual)) atual = 0;

  var proximo = atual + 1;
  celula.setValue(proximo);

  var numeroFormatado = String(proximo).padStart(4, '0');
  return CONFIG.PREFIXO_ACOMPANHAMENTO + numeroFormatado;
}

// Cria uma nova linha na aba acompanhamentos a partir do modal "Novo
// Acompanhamento" (chamado pela opcao "Pedido de Acompanhamento" em
// Gerenciar). Campos coletados: processo, prazoDias (dias uteis),
// estagiario. Nao ha campo Assistido(a) nem Especie nesta aba.
// DATA = hoje, DATA_ENTREGA = DATA + prazoDias (dias uteis, considerando
// bd!C2:C), STATUS = "Encaminhado", EMAIL = localizado em estagiarios!C
// a partir do nome selecionado.
function criarAcompanhamento(payload) {
  var processo = String(payload.processo || '').trim();
  var estagiario = String(payload.estagiario || '').trim();
  var prazoDias = parseInt(payload.prazo, 10);

  if (!processo) return { sucesso: false, erro: 'Informe o processo.' };
  if (!estagiario) return { sucesso: false, erro: 'Selecione o estagiario(a).' };
  if (isNaN(prazoDias) || prazoDias <= 0) return { sucesso: false, erro: 'Informe um prazo valido (em dias uteis).' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ACOMPANHAMENTOS);
  if (!aba) return { sucesso: false, erro: 'Aba acompanhamentos nao encontrada.' };

  var emailEstagiario = buscarEmailEstagiario(estagiario); // definida em Data.js
  if (!emailEstagiario) {
    return { sucesso: false, erro: 'Estagiario(a) "' + estagiario + '" nao encontrado na aba estagiarios ou sem e-mail cadastrado.' };
  }

  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var feriados = lerFeriados();
  var dataEntrega = adicionarDiasUteis(hoje, prazoDias, feriados);
  var semestre = calcularSemestre(dataEntrega);
  var id = proximoNumeroAcompanhamento();

  // Ordem exata das colunas A:K.
  var novaLinha = [];
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.ID] = id;
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.NOME] = estagiario;
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.PROCESSO] = processo;
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.DATA] = hoje;
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.STATUS] = 'Encaminhado';
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.EMAIL] = emailEstagiario;
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.COD_ATIVIDADE_CLASSROOM] = '';
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.LINK] = '';
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.DATA_ENTREGA] = dataEntrega;
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.SEMESTRE] = semestre;
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.CLASS] = '';
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.DI_CLASS] = '';
  novaLinha[CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS] = '';

  var proximaLinhaPlanilha = aba.getLastRow() + 1;
  // Forca a celula SEMESTRE como Texto simples antes de gravar — evita que o
  // Sheets reinterprete "2026.02" como uma data de verdade caso a coluna
  // esteja formatada como Data (ver normalizarSemestreLido em Data.js).
  aba.getRange(proximaLinhaPlanilha, CONFIG.ACOMPANHAMENTOS_COL.SEMESTRE + 1, 1, 1).setNumberFormat('@');
  aba.getRange(proximaLinhaPlanilha, 1, 1, CONFIG.TOTAL_COLUNAS_ACOMPANHAMENTOS).setValues([novaLinha]);

  return { sucesso: true, id: id, linha: proximaLinhaPlanilha, dataEntrega: formatarData(dataEntrega) };
}