// Data.gs
// Responsabilidade: leitura/escrita da aba diligencias e leitura das picklists
// (bd e estagiarios). Coluna ADV (H) nunca e lida para o frontend nem escrita
// por este arquivo — pertence a outro script.

// --- Regras de negocio ---

function calcularAtraso(df, status) {
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var statusNorm = normalizarChave(status);
  if (CONFIG.STATUS_FINAIS.indexOf(statusNorm) !== -1) return false;

  if (!df || String(df).trim() === '') return false;

  var dataVenc = (df instanceof Date) ? new Date(df) : new Date(df);
  dataVenc.setHours(0, 0, 0, 0);
  if (isNaN(dataVenc.getTime())) return false;

  return dataVenc < hoje;
}

// Resolve qual DF usar no calculo de atraso: prioriza a DF CLASS (data real
// de entrega/dueDate lida do proprio Classroom, ver colunas DI CLASS/DF
// CLASS em Config.js e a escrita delas em Classroom.js), caindo de volta
// para a DF da planilha quando a atividade ainda nao foi criada no Classroom
// (DF CLASS ainda vazia) — decisao de Thales, para nao perder o calculo de
// atraso em registros que ainda nao passaram pelo Classroom (ex.: fila da
// aba Distribuição, Pedido Aluno recem-criado). Usada SOMENTE para o flag
// "atraso" (badge + cobrancas, ver enviarCobrancasPendentes em Mensagens.js)
// — o campo "df" exibido no painel continua sendo sempre a DF da planilha, e
// os gatilhos visuais de proximidade (gatilho1/2/3, calcularGatilhoPrazo em
// Agenda.js) tambem continuam usando a DF da planilha, sem mudanca.
function resolverDfParaAtraso(dfClass, dfPlanilha) {
  if (dfClass instanceof Date && !isNaN(dfClass.getTime())) return dfClass;
  return dfPlanilha;
}

function normalizarChave(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatarData(val) {
  if (!val || val === '') return '';
  var d = (val instanceof Date) ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  var dia = String(d.getDate()).padStart(2, '0');
  var mes = String(d.getMonth() + 1).padStart(2, '0');
  var ano = d.getFullYear();
  return dia + '/' + mes + '/' + ano;
}

// Retorna "Complexa" se o valor de especie constar em bd!H2:H (normalizado),
// senao "Simples". SUBESPECIE nunca e escolhida manualmente — e sempre
// recalculada aqui a partir de ESPECIE.
function calcularSubespecie(especie) {
  var complexas = lerColunaBd(CONFIG.BD_COL.COMPLEXAS);
  var chaveEspecie = normalizarChave(especie);
  if (!chaveEspecie) return '';

  for (var i = 0; i < complexas.length; i++) {
    if (normalizarChave(complexas[i]) === chaveEspecie) {
      return CONFIG.SUBESPECIE_VALORES.COMPLEXA;
    }
  }
  return CONFIG.SUBESPECIE_VALORES.SIMPLES;
}

// Retorna "AAAA.01" (jan-jun) ou "AAAA.02" (jul-dez) a partir do valor de DF.
function calcularSemestre(df) {
  if (!df || String(df).trim() === '') return '';
  var d = (df instanceof Date) ? df : new Date(df);
  if (isNaN(d.getTime())) return '';
  var ano = d.getFullYear();
  var mes = d.getMonth() + 1;
  return ano + '.' + (mes <= 6 ? '01' : '02');
}

// Le o valor bruto de uma celula SEMESTRE. O valor esperado e sempre texto
// simples "AAAA.01" (jan-jun) ou "AAAA.02" (jul-dez) — as duas unicas opcoes
// validas. Uma linha isolada pode acabar guardando um Date de verdade na
// celula (por exemplo, digitacao/formatacao acidental) em vez desse texto;
// nesse caso, reconstituimos "AAAA.01"/"AAAA.02" a partir do Date usando a
// mesma regra de meia-ano de calcularSemestre (nao o mes literal).
function normalizarSemestreLido(valorBruto) {
  if (valorBruto instanceof Date && !isNaN(valorBruto.getTime())) {
    return calcularSemestre(valorBruto);
  }
  return String(valorBruto || '').trim();
}

// --- Leitura da aba diligencias ---

function rowParaObjeto(row, indice, feriadosTimestamps) {
  var dfParaAtraso = resolverDfParaAtraso(row[CONFIG.COL.DF_CLASS], row[CONFIG.COL.DF]);
  var atrasoVal = calcularAtraso(dfParaAtraso, row[CONFIG.COL.STATUS]);
  var gatilhoVal = calcularGatilhoPrazo(row[CONFIG.COL.DF], row[CONFIG.COL.STATUS], feriadosTimestamps);

  return {
    _linha: indice + 2,
    id: row[CONFIG.COL.ID],
    processo: row[CONFIG.COL.PROCESSO],
    assistido: row[CONFIG.COL.ASSISTIDO],
    diligencia: row[CONFIG.COL.DILIGENCIA],
    di: formatarData(row[CONFIG.COL.DI]),
    prazo: row[CONFIG.COL.PRAZO],
    df: formatarData(row[CONFIG.COL.DF]),
    estagiario: row[CONFIG.COL.ESTAGIARIO],
    status: row[CONFIG.COL.STATUS],
    obs: row[CONFIG.COL.OBS],
    especie: row[CONFIG.COL.ESPECIE],
    subespecie: row[CONFIG.COL.SUBESPECIE],
    vara: row[CONFIG.COL.VARA],
    link: String(row[CONFIG.COL.LINK] || '').trim(),
    diClass: formatarData(row[CONFIG.COL.DI_CLASS]), // data de criacao real no Classroom, ver Classroom.js
    dfClass: formatarData(row[CONFIG.COL.DF_CLASS]), // data de entrega/dueDate real no Classroom, ver Classroom.js
    alteradoEm: formatarDataHora(row[CONFIG.COL.ALTERADO_EM]),
    atraso: atrasoVal,
    prazoAtraso: formatarData(dfParaAtraso), // DF CLASS (com fallback para DF) usada no calculo de atraso — consumida pelas cobrancas, ver Mensagens.js
    gatilho: gatilhoVal, // null | 'gatilho1' | 'gatilho2' | 'gatilho3'
    semestre: normalizarSemestreLido(row[CONFIG.COL.SEMESTRE]) // fonte unica do semestre do registro — nao e mais recalculado ao vivo a partir de DF
    // ADV, DF REAL e SINC nunca sao enviados ao frontend
  };
}

function formatarDataHora(val) {
  if (!val) return '';
  var d = (val instanceof Date) ? val : new Date(val);
  if (isNaN(d.getTime())) return String(val);
  try {
    return Utilities.formatDate(d, CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm');
  } catch (e) {
    return formatarData(d);
  }
}

function getTodasDiligencias() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues();
  var feriadosTimestamps = lerFeriados();
  var lista = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CONFIG.COL.ID] && !row[CONFIG.COL.PROCESSO]) continue;
    lista.push(rowParaObjeto(row, i, feriadosTimestamps));
  }
  return lista;
}

// --- Escrita ---
// Campos editaveis pelo painel: estagiario, status, obs, especie, vara.
// alteradoEm, semestre e subespecie sao sempre recalculados automaticamente
// no servidor (subespecie nunca e recebida do frontend, so calculada).
function salvarEdicaoDiligencia(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };

  var linha = parseInt(payload._linha);
  if (isNaN(linha) || linha < 2) return { sucesso: false, erro: 'Linha invalida.' };

  var dfAtual = aba.getRange(linha, CONFIG.COL.DF + 1).getValue();
  var dfClassAtual = aba.getRange(linha, CONFIG.COL.DF_CLASS + 1).getValue();
  var statusAnterior = aba.getRange(linha, CONFIG.COL.STATUS + 1).getValue();
  var novoStatus = String(payload.status || '').trim();
  var novoAtraso = calcularAtraso(resolverDfParaAtraso(dfClassAtual, dfAtual), novoStatus);
  var novoSemestre = calcularSemestre(dfAtual);
  var novaEspecie = payload.especie || '';
  var novaSubespecie = calcularSubespecie(novaEspecie); // sempre calculada, nunca vem do payload
  var agora = new Date();

  aba.getRange(linha, CONFIG.COL.ESTAGIARIO + 1).setValue(payload.estagiario || '');
  aba.getRange(linha, CONFIG.COL.STATUS + 1).setValue(novoStatus);
  aba.getRange(linha, CONFIG.COL.OBS + 1).setValue(payload.obs || '');
  aba.getRange(linha, CONFIG.COL.ESPECIE + 1).setValue(novaEspecie);
  aba.getRange(linha, CONFIG.COL.SUBESPECIE + 1).setValue(novaSubespecie);
  aba.getRange(linha, CONFIG.COL.VARA + 1).setValue(payload.vara || '');
  aba.getRange(linha, CONFIG.COL.ALTERADO_EM + 1).setValue(agora);
  aba.getRange(linha, CONFIG.COL.SEMESTRE + 1).setValue(novoSemestre);

  var secretaria = null;
  if (normalizarChave(novoStatus) === 'protocolado' && normalizarChave(statusAnterior) !== 'protocolado') {
    secretaria = sincronizarDiligenciasParaSecretaria([linha]);
  }

  // STATUS "Ok" marca CLASS = "S" — decisao de Thales: uma diligencia que
  // chega a "Ok" por fora do fluxo do Classroom (ex. edicao manual no modal)
  // nao deve ser considerada elegivel para envio (ver
  // coletarLinhasElegiveisParaEnvio, em Classroom.js).
  if (normalizarChave(novoStatus) === 'ok') {
    aba.getRange(linha, CONFIG.COL.CLASS + 1).setValue(CONFIG.CLASS_ENVIADO);
  }

  var geral = sincronizarLinhaParaGeral(linha);

  return {
    sucesso: true,
    novoAtraso: novoAtraso,
    subespecie: novaSubespecie,
    alteradoEm: formatarDataHora(agora),
    semestre: novoSemestre,
    secretaria: secretaria,
    geral: geral
  };
}

// --- Picklists (aba bd) ---

function lerColunaBd(letra) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) return [];

  var dados = aba.getRange(letra + '2:' + letra).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var val = String(dados[i][0]).trim();
    if (val) lista.push(val);
  }
  return lista;
}

// SUBESPECIE nao e mais um picklist manual: ela e sempre calculada a partir
// de ESPECIE (ver calcularSubespecie). Por isso expomos "complexas" — a lista
// de valores de ESPECIE que geram SUBESPECIE = "Complexa" — para o frontend
// conseguir mostrar uma previa em tempo real antes de salvar.
function getPicklists() {
  return {
    status: lerColunaBd(CONFIG.BD_COL.STATUS),
    vara: lerColunaBd(CONFIG.BD_COL.VARA),
    especie: lerColunaBd(CONFIG.BD_COL.ESPECIE),
    complexas: lerColunaBd(CONFIG.BD_COL.COMPLEXAS)
  };
}

// --- Estagiarios (aba estagiarios, A:F = ID, nome, e-mail, TRIMESTRE, FINALIZADO, SEMESTRE) ---

// Retorna apenas os nomes dos estagiarios com FINALIZADO vazio/falso — e a
// lista usada para popular TODOS os selects de "Estagiário(a)" do frontend
// (Novo Pedido, Novo Acompanhamento, editar Diligência). Um estagiario ja
// FINALIZADO nao pode ser escolhido em nenhum desses selects; caso ja
// esteja atribuido a um registro antigo, o proprio popularSelectSimples()
// no frontend garante que o valor atual continue aparecendo selecionado
// mesmo fora desta lista (ver Scripts.html).
function getEstagiarios() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, 5).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var nome = String(dados[i][CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    var finalizado = !!String(dados[i][CONFIG.ESTAGIARIOS_COL.FINALIZADO] || '').trim();
    if (nome && !finalizado) lista.push(nome);
  }
  return lista;
}

// Localiza o e-mail institucional (@cest.edu.br) de um estagiario a partir do
// nome exibido no picklist. Usado para atribuir a atividade individualmente
// no Classroom. Retorna '' se nao encontrado.
function buscarEmailEstagiario(nomeEstagiario) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return '';

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return '';

  var chaveAlvo = normalizarChave(nomeEstagiario);
  if (!chaveAlvo) return '';

  var dados = aba.getRange(2, 1, ultimaLinha - 1, 5).getValues();
  for (var i = 0; i < dados.length; i++) {
    var nome = dados[i][CONFIG.ESTAGIARIOS_COL.NOME];
    if (normalizarChave(nome) === chaveAlvo) {
      return String(dados[i][CONFIG.ESTAGIARIOS_COL.EMAIL] || '').trim();
    }
  }
  return '';
}

// --- Novo Pedido (PEDIDO ALUNO) ---

// Le bd!I2, incrementa e grava de volta. Retorna o ID formatado "PA-0008".
// Guarda apenas o numero inteiro na celula, nunca o ID formatado — assim
// nao ha ambiguidade de parsing entre execucoes.
function proximoNumeroPedidoAluno() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) throw new Error('Aba bd nao encontrada.');

  var celula = aba.getRange(CONFIG.BD_CELL.CONTROLE_PA);
  var atual = parseInt(celula.getValue(), 10);
  if (isNaN(atual)) atual = 0;

  var proximo = atual + 1;
  celula.setValue(proximo);

  var numeroFormatado = String(proximo).padStart(4, '0');
  return CONFIG.PREFIXO_PEDIDO_ALUNO + numeroFormatado;
}

// Cria uma nova linha na aba diligencias a partir do modal "Novo Pedido".
// Campos coletados: processo, assistido, prazoDias (dias uteis), estagiario,
// especie. DI = hoje, DF = DI + prazoDias (dias uteis, considerando bd!C2:C),
// SUBESPECIE calculada automaticamente (mesma logica de Diligencias, ver
// calcularSubespecie), STATUS = "Encaminhado", DILIGENCIA fixa como
// CONFIG.DILIGENCIA_PEDIDO_ALUNO ("PEDIDO ALUNO"), ADV (H) fixo como
// CONFIG.NOME_USUARIO ("Thales") — unica excecao a regra geral de que ADV
// pertence a outro script (ver cabecalho do arquivo e Geralsync.js): todo
// "Pedido Aluno" e de responsabilidade direta de Thales, entao a coluna ja
// nasce preenchida em vez de ficar vazia esperando outro processo.
//
// Esta funcao e o unico ponto de criacao de registros "PEDIDO ALUNO" e deve
// ser reaproveitada (nunca duplicada) por qualquer novo fluxo que crie o
// mesmo tipo de registro — por exemplo, quando o botao "Solicitar Diligência"
// do Painel Aluno (hoje um stub "Em breve", ver PainelAluno.html/AlunoScripts.html)
// for implementado. Assim, o preenchimento de ADV com CONFIG.NOME_USUARIO e a
// logica de SUBESPECIE valem automaticamente para os dois fluxos sem precisar
// repetir codigo. Diferenca esperada nesse fluxo futuro: quem chama esta
// funcao a partir do Painel Aluno deve resolver o "estagiario" a partir do
// e-mail logado (mesmo padrao usado em criarPedidoInicialAluno, Iniciais.js),
// em vez de receber o nome direto de um select como faz o modal de Thales.
function criarPedidoAluno(payload) {
  var processo = String(payload.processo || '').trim();
  var assistido = String(payload.assistido || '').trim();
  var estagiario = String(payload.estagiario || '').trim();
  var especie = String(payload.especie || '').trim();
  var prazoDias = parseInt(payload.prazo, 10);

  if (!processo) return { sucesso: false, erro: 'Informe o processo.' };
  if (!assistido) return { sucesso: false, erro: 'Informe o assistido(a).' };
  if (!estagiario) return { sucesso: false, erro: 'Selecione o estagiario(a).' };
  if (isNaN(prazoDias) || prazoDias <= 0) return { sucesso: false, erro: 'Informe um prazo valido (em dias uteis).' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };

  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var feriados = lerFeriados();
  var df = adicionarDiasUteis(hoje, prazoDias, feriados);
  var subespecie = calcularSubespecie(especie);
  var semestre = calcularSemestre(df);
  var id = proximoNumeroPedidoAluno();

  // Ordem exata das colunas A:V. ADV (H) = CONFIG.NOME_USUARIO neste fluxo
  // especifico (ver comentario acima da funcao) — nos demais fluxos que
  // escrevem em diligencias, a coluna H continua fora do escopo deste arquivo.
  var novaLinha = [];
  novaLinha[CONFIG.COL.ID] = id;
  novaLinha[CONFIG.COL.PROCESSO] = processo;
  novaLinha[CONFIG.COL.ASSISTIDO] = assistido;
  novaLinha[CONFIG.COL.DILIGENCIA] = CONFIG.DILIGENCIA_PEDIDO_ALUNO;
  novaLinha[CONFIG.COL.DI] = hoje;
  novaLinha[CONFIG.COL.PRAZO] = prazoDias;
  novaLinha[CONFIG.COL.DF] = df;
  novaLinha[CONFIG.COL.ADV] = CONFIG.NOME_USUARIO;
  novaLinha[CONFIG.COL.ESTAGIARIO] = estagiario;
  novaLinha[CONFIG.COL.STATUS] = 'Encaminhado';
  novaLinha[CONFIG.COL.OBS] = '';
  novaLinha[CONFIG.COL.ESPECIE] = especie;
  novaLinha[CONFIG.COL.ALTERADO_EM] = hoje;
  novaLinha[CONFIG.COL.SUBESPECIE] = subespecie;
  novaLinha[CONFIG.COL.DF_REAL] = '';
  novaLinha[CONFIG.COL.VARA] = '';
  novaLinha[CONFIG.COL.LINK] = '';
  novaLinha[CONFIG.COL.SEMESTRE] = semestre;
  novaLinha[CONFIG.COL.SINC] = '';
  novaLinha[CONFIG.COL.CLASS] = '';
  novaLinha[CONFIG.COL.SECRETARIA] = '';
  novaLinha[CONFIG.COL.DRIVE] = '';
  novaLinha[CONFIG.COL.DI_CLASS] = '';
  novaLinha[CONFIG.COL.DF_CLASS] = '';

  var proximaLinhaPlanilha = aba.getLastRow() + 1;
  aba.getRange(proximaLinhaPlanilha, 1, 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).setValues([novaLinha]);

  var geral = sincronizarLinhaParaGeral(proximaLinhaPlanilha);

  return { sucesso: true, id: id, linha: proximaLinhaPlanilha, df: formatarData(df) };
}

// --- Transferir Atividade (dropdown Gerenciar) ---

// Localiza uma diligencia pelo ID (coluna A) para a etapa 1 do modal
// "Transferir Atividade". Diferente do resto deste arquivo (que opera por
// _linha), a busca aqui e por ID porque e o dado que Thales tem em maos ao
// decidir uma transferencia. Bloqueia diligencias ja canceladas (podem ja
// ter sido transferidas antes).
function buscarDiligenciaPorId(id) {
  var idAlvo = String(id || '').trim();
  if (!idAlvo) return { sucesso: false, erro: 'Informe o ID da diligência.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { sucesso: false, erro: 'Diligência ' + idAlvo + ' não encontrada.' };

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues();
  var feriadosTimestamps = lerFeriados();

  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i][CONFIG.COL.ID] || '').trim() !== idAlvo) continue;

    if (normalizarChave(dados[i][CONFIG.COL.STATUS]) === 'cancelada') {
      return { sucesso: false, erro: 'Diligência ' + idAlvo + ' já está cancelada.' };
    }
    return { sucesso: true, registro: rowParaObjeto(dados[i], i, feriadosTimestamps) };
  }
  return { sucesso: false, erro: 'Diligência ' + idAlvo + ' não encontrada.' };
}

// Transfere uma diligencia de um estagiario para outro (etapa 2 do modal
// "Transferir Atividade", apos a confirmacao). Faz o seguinte, nessa ordem:
//  1. cria uma nova linha para o novo estagiario com o MESMO ID/PROCESSO/
//     DILIGENCIA/ESPECIE/VARA/PRAZO/DI da original, DF conforme o modal
//     (mantida ou ajustada) e STATUS reiniciado como "Encaminhado";
//  2. marca a linha original como STATUS "Cancelada" (nunca apaga a linha,
//     para manter rastro na planilha) com uma OBS explicando a transferencia;
//  3. (best-effort, nao desfaz 1-2 se falhar) se a diligencia original JA
//     tinha sido enviada ao Classroom (CLASS = 'S'), cria a atividade
//     equivalente no Classroom para o novo estagiario e SO ENTAO apaga a
//     antiga (ver recriarCourseWorkTransferencia, Classroom.js) — se nunca
//     tinha sido enviada, o envio continua manual pelo "Enviar ao Classroom";
//  4. (best-effort) copia o PDF do processo — se ja organizado no Drive —
//     para a pasta do novo estagiario;
//  5. (best-effort) avisa o estagiario original pelo mural individual do
//     Classroom.
// payload: { _linha, novoEstagiario, novaDf (aaaa-mm-dd, opcional) }.
function transferirDiligencia(payload) {
  var linha = parseInt(payload._linha, 10);
  if (isNaN(linha) || linha < 2) return { sucesso: false, erro: 'Linha inválida.' };

  var novoEstagiario = String(payload.novoEstagiario || '').trim();
  if (!novoEstagiario) return { sucesso: false, erro: 'Selecione o novo estagiário.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };

  var linhaAtual = aba.getRange(linha, 1, 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues()[0];
  var estagiarioAntigo = String(linhaAtual[CONFIG.COL.ESTAGIARIO] || '').trim();
  var dfOriginal = linhaAtual[CONFIG.COL.DF];
  var idDiligencia = String(linhaAtual[CONFIG.COL.ID] || '').trim();
  var assistido = linhaAtual[CONFIG.COL.ASSISTIDO];
  var especie = linhaAtual[CONFIG.COL.ESPECIE];
  var jaEnviadoClassroom = normalizarChave(linhaAtual[CONFIG.COL.CLASS]) === normalizarChave(CONFIG.CLASS_ENVIADO);
  var courseworkIdAntigo = jaEnviadoClassroom ? obterCourseworkIdDaLinha(aba, linha) : '';

  if (!estagiarioAntigo) return { sucesso: false, erro: 'Diligência sem estagiário atribuído — nada a transferir.' };
  if (normalizarChave(estagiarioAntigo) === normalizarChave(novoEstagiario)) {
    return { sucesso: false, erro: 'O novo estagiário deve ser diferente do atual.' };
  }

  var novaDf = payload.novaDf ? new Date(payload.novaDf + 'T00:00:00') : dfOriginal;
  if (isNaN(novaDf.getTime())) return { sucesso: false, erro: 'DF inválida.' };

  var novoSemestre = calcularSemestre(novaDf);
  var agora = new Date();

  // 1) Nova linha para o novo estagiario.
  var novaLinha = linhaAtual.slice();
  novaLinha[CONFIG.COL.DF] = novaDf;
  novaLinha[CONFIG.COL.ESTAGIARIO] = novoEstagiario;
  novaLinha[CONFIG.COL.STATUS] = 'Encaminhado';
  novaLinha[CONFIG.COL.OBS] = '';
  novaLinha[CONFIG.COL.ALTERADO_EM] = agora;
  novaLinha[CONFIG.COL.SEMESTRE] = novoSemestre;
  novaLinha[CONFIG.COL.LINK] = '';
  novaLinha[CONFIG.COL.CLASS] = '';
  novaLinha[CONFIG.COL.SECRETARIA] = '';
  novaLinha[CONFIG.COL.DRIVE] = '';
  // Nunca herdar DI CLASS/DF CLASS da linha original (slice acima copia tudo):
  // so devem ser preenchidas quando a NOVA atividade for de fato criada no
  // Classroom, no passo 3 abaixo.
  novaLinha[CONFIG.COL.DI_CLASS] = '';
  novaLinha[CONFIG.COL.DF_CLASS] = '';

  var proximaLinhaPlanilha = aba.getLastRow() + 1;
  aba.getRange(proximaLinhaPlanilha, 1, 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).setValues([novaLinha]);

  // 2) Cancela a linha original, preservando rastro.
  aba.getRange(linha, CONFIG.COL.STATUS + 1).setValue('Cancelada');
  aba.getRange(linha, CONFIG.COL.OBS + 1).setValue(
    'Transferida para ' + novoEstagiario + ' em ' + formatarData(agora) + '.'
  );
  aba.getRange(linha, CONFIG.COL.ALTERADO_EM + 1).setValue(agora);

  sincronizarLinhaParaGeral(linha);
  sincronizarLinhaParaGeral(proximaLinhaPlanilha);

  // 3) Classroom — so quando a diligencia original ja tinha sido enviada
  // (CLASS = 'S'); best-effort: se a criacao da nova coursework falhar, a
  // antiga NAO e apagada (ver recriarCourseWorkTransferencia, Classroom.js).
  var classroomAviso = null;
  if (jaEnviadoClassroom) {
    try {
      var regNovo = {
        id: idDiligencia,
        processo: linhaAtual[CONFIG.COL.PROCESSO],
        assistido: assistido,
        diligencia: linhaAtual[CONFIG.COL.DILIGENCIA],
        especie: especie,
        vara: linhaAtual[CONFIG.COL.VARA],
        estagiario: novoEstagiario,
        dfRaw: novaDf
      };
      var resultadoClassroom = recriarCourseWorkTransferencia(regNovo, courseworkIdAntigo);

      var linkCelulaNova = aba.getRange(proximaLinhaPlanilha, CONFIG.COL.LINK + 1);
      linkCelulaNova.setValue(resultadoClassroom.link);
      linkCelulaNova.setNote(resultadoClassroom.courseworkId);
      aba.getRange(proximaLinhaPlanilha, CONFIG.COL.CLASS + 1).setValue(CONFIG.CLASS_ENVIADO);
      if (resultadoClassroom.diClass) aba.getRange(proximaLinhaPlanilha, CONFIG.COL.DI_CLASS + 1).setValue(resultadoClassroom.diClass);
      if (resultadoClassroom.dfClass) aba.getRange(proximaLinhaPlanilha, CONFIG.COL.DF_CLASS + 1).setValue(resultadoClassroom.dfClass);

      if (resultadoClassroom.avisoExclusao) classroomAviso = resultadoClassroom.avisoExclusao;
    } catch (e) {
      classroomAviso = 'Não foi possível criar a nova atividade no Classroom (a antiga foi mantida): ' + e.message;
    }
  }

  // 4) PDF no Drive — best-effort, nao interrompe a transferencia se falhar.
  var driveAviso = null;
  try {
    if (normalizarChave(linhaAtual[CONFIG.COL.DRIVE]) === normalizarChave(CONFIG.DRIVE_ORGANIZADO)) {
      var copiou = copiarPdfParaNovoEstagiario(idDiligencia, estagiarioAntigo, novoEstagiario);
      if (copiou) aba.getRange(proximaLinhaPlanilha, CONFIG.COL.DRIVE + 1).setValue(CONFIG.DRIVE_ORGANIZADO);
    }
  } catch (e) {
    driveAviso = 'Erro ao copiar o PDF para o novo estagiário: ' + e.message;
  }

  // 5) Mensagem no mural para o estagiario original — best-effort.
  var muralAviso = null;
  try {
    enviarAvisoTransferenciaMural(aba, linha, estagiarioAntigo, idDiligencia, assistido, especie, dfOriginal);
  } catch (e) {
    muralAviso = 'Erro ao avisar o estagiário original no mural: ' + e.message;
  }

  return {
    sucesso: true,
    id: idDiligencia,
    linha: proximaLinhaPlanilha,
    df: formatarData(novaDf),
    classroomAviso: classroomAviso,
    driveAviso: driveAviso,
    muralAviso: muralAviso
  };
}

// --- Agregador usado na carga inicial ---

function getDadosIniciais() {
  return {
    diligencias: getTodasDiligencias(),
    estagiarios: getEstagiarios(),
    picklists: getPicklists()
  };
}