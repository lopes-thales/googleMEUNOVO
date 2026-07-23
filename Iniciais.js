// Iniciais.gs
// Responsabilidade: leitura da aba "iniciais", cruzamento com "estagiarios"
// (e-mail -> nome) e com "protocolos" (nome do aluno + assistido -> numero
// do processo e vara) para determinar automaticamente quando um pedido
// inicial foi protocolado. Nenhum outro arquivo deve ler/escrever a aba
// iniciais ou a aba protocolos diretamente.
//
// O cruzamento com protocolos NAO roda mais a cada carregamento da aba.
// Ele roda 1x/dia via gatilho automatico (verificarProtocolosIniciaisAutomatico,
// instalado por configurarGatilhoVerificacaoProtocolos, as 8h) e verifica
// somente os registros de iniciais cuja coluna O (PROCESSO) ainda esteja
// vazia. Ao encontrar correspondencia, grava o numero do processo
// (protocolos!B) na coluna O, a vara (protocolos!C) na coluna P e o STATUS
// "Protocolado" (com ALTERADO EM = agora) — e nunca mais revisita aquela
// linha depois disso, mesmo que Thales edite o STATUS manualmente em
// seguida (ver verificarProtocolosIniciais mais abaixo). getTodasIniciais()
// so LE as colunas O/P ja persistidas; nao faz mais cruzamento nem escrita
// a cada carregamento da aba — por isso o campo Status deixou de ser
// travado no modal (ver abrirModalIniciais em Scripts.html).

// --- Estagiarios: e-mail -> nome ---

function buscarNomeEstagiarioPorEmail(email) {
  var chaveEmail = normalizarChave(email);
  if (!chaveEmail) return '';

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return '';

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return '';

  var dados = aba.getRange(2, 1, ultimaLinha - 1, 5).getValues();
  for (var i = 0; i < dados.length; i++) {
    var emailLinha = dados[i][CONFIG.ESTAGIARIOS_COL.EMAIL];
    if (normalizarChave(emailLinha) === chaveEmail) {
      return String(dados[i][CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    }
  }
  return '';
}

// --- Protocolos ---

function lerProtocolos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_PROTOCOLOS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, 5).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var assistido = String(row[CONFIG.PROTOCOLOS_COL.ASSISTIDO] || '').trim();
    var aluno = String(row[CONFIG.PROTOCOLOS_COL.ALUNO] || '').trim();
    if (!assistido && !aluno) continue;
    lista.push({
      assistido: assistido,
      processo: String(row[CONFIG.PROTOCOLOS_COL.PROCESSO] || '').trim(),
      vara: String(row[CONFIG.PROTOCOLOS_COL.ORGAO_JULGADOR] || '').trim(),
      aluno: aluno
    });
  }
  return lista;
}

// Procura, na lista ja lida de protocolos, uma linha cujo ALUNO e ASSISTIDO
// batam (normalizados) com os informados. Retorna a primeira correspondencia
// encontrada, ou null. Pode haver mais de uma linha com o mesmo aluno +
// assistido em protocolos — a primeira encontrada e usada (ver pergunta 7).
function buscarProtocoloPorAlunoEAssistido(nomeAluno, assistido, listaProtocolos) {
  var chaveAluno = normalizarChave(nomeAluno);
  var chaveAssistido = normalizarChave(assistido);
  if (!chaveAluno || !chaveAssistido) return null;

  for (var i = 0; i < listaProtocolos.length; i++) {
    var p = listaProtocolos[i];
    if (normalizarChave(p.aluno) === chaveAluno && normalizarChave(p.assistido) === chaveAssistido) {
      return p;
    }
  }
  return null;
}

// --- Montagem do objeto para o frontend ---

function rowParaObjetoIniciais(row, indice, nomeEstagiario, feriadosTimestamps) {
  var statusFinal = String(row[CONFIG.INICIAIS_COL.STATUS] || '').trim();

  var df = row[CONFIG.INICIAIS_COL.DF];
  var dfParaAtraso = resolverDfParaAtraso(row[CONFIG.INICIAIS_COL.DF_CLASS], df);
  var atrasoVal = calcularAtraso(dfParaAtraso, statusFinal);
  var gatilhoVal = calcularGatilhoPrazo(df, statusFinal, feriadosTimestamps);

  return {
    _linha: indice + 2,
    id: row[CONFIG.INICIAIS_COL.ID],
    di: formatarData(row[CONFIG.INICIAIS_COL.DATA]), // "di" reaproveita ordenacao/exibicao ja existentes em Diligencias
    assistido: row[CONFIG.INICIAIS_COL.ASSISTIDO],
    cpf: row[CONFIG.INICIAIS_COL.CPF],
    especie: row[CONFIG.INICIAIS_COL.ESPECIE],
    status: statusFinal,
    obs: row[CONFIG.INICIAIS_COL.OBS],
    alteradoEm: formatarDataHora(row[CONFIG.INICIAIS_COL.ALTERADO_EM]),
    df: formatarData(df),
    link: String(row[CONFIG.INICIAIS_COL.LINK] || '').trim(),
    diClass: formatarData(row[CONFIG.INICIAIS_COL.DI_CLASS]), // data de criacao real no Classroom, ver Classroom.js
    dfClass: formatarData(row[CONFIG.INICIAIS_COL.DF_CLASS]), // data de entrega/dueDate real no Classroom, ver Classroom.js
    estagiario: nomeEstagiario || '',
    email: String(row[CONFIG.INICIAIS_COL.EMAIL] || '').trim(), // usado pela aba Panorama
    processo: String(row[CONFIG.INICIAIS_COL.PROCESSO] || '').trim(),
    vara: String(row[CONFIG.INICIAIS_COL.VARA] || '').trim(),
    atraso: atrasoVal,
    prazoAtraso: formatarData(dfParaAtraso), // DF CLASS (com fallback para DF) usada no calculo de atraso — consumida pelas cobrancas, ver Mensagens.js
    gatilho: gatilhoVal,
    semestre: normalizarSemestreLido(row[CONFIG.INICIAIS_COL.SEMESTRE]) // fonte unica do semestre do registro — nao e mais recalculado ao vivo a partir de DF
  };
}

// Le toda a aba iniciais, cruza cada linha com estagiarios (e-mail -> nome)
// apenas para exibicao, e retorna a lista ja pronta para o frontend. NAO
// cruza mais com protocolos nem escreve na planilha — isso e feito 1x/dia
// por verificarProtocolosIniciais() (ver mais abaixo). PROCESSO e VARA vem
// diretamente das colunas O/P, ja persistidas.
function getTodasIniciais() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_INICIAIS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_INICIAIS).getValues();
  var feriadosTimestamps = lerFeriados();

  var cacheNomes = {}; // evita reler estagiarios para o mesmo e-mail varias vezes na mesma execucao
  var lista = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CONFIG.INICIAIS_COL.ID] && !row[CONFIG.INICIAIS_COL.ASSISTIDO]) continue;

    var email = String(row[CONFIG.INICIAIS_COL.EMAIL] || '').trim();
    var chaveEmail = normalizarChave(email);
    var nomeEstagiario;
    if (chaveEmail && cacheNomes.hasOwnProperty(chaveEmail)) {
      nomeEstagiario = cacheNomes[chaveEmail];
    } else {
      nomeEstagiario = buscarNomeEstagiarioPorEmail(email);
      if (chaveEmail) cacheNomes[chaveEmail] = nomeEstagiario;
    }

    lista.push(rowParaObjetoIniciais(row, i, nomeEstagiario, feriadosTimestamps));
  }

  return lista;
}

// --- Agregador usado pela aba Iniciais no frontend ---

function getDadosAbaIniciais() {
  return {
    iniciais: getTodasIniciais(),
    statusPicklist: lerColunaBd(CONFIG.BD_COL.STATUS)
  };
}

// --- Cruzamento diario com protocolos (gatilho automatico, 1x/dia) ---

// Verifica os registros de "iniciais" cuja coluna O (PROCESSO) ainda esteja
// vazia. Para cada um, cruza estagiario (por e-mail) + assistido com a aba
// "protocolos": ao encontrar correspondencia, grava o numero do processo
// (protocolos!B) na coluna O, a vara (protocolos!C) na coluna P e sobrescreve
// o STATUS para "Protocolado" (com ALTERADO EM = agora). Uma vez gravada a
// coluna O, aquela linha nunca mais e revisitada por esta funcao — mesmo que
// Thales edite o STATUS manualmente depois (ver configurarGatilhoVerificacaoProtocolos
// para o agendamento diario).
function verificarProtocolosIniciais() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_INICIAIS);
  if (!aba) return { sucesso: false, erro: 'Aba iniciais nao encontrada.' };

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { sucesso: true, atualizados: 0 };

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_INICIAIS).getValues();
  var listaProtocolos = lerProtocolos();
  var agora = new Date();
  var cacheNomes = {};
  var atualizados = 0;

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CONFIG.INICIAIS_COL.ID] && !row[CONFIG.INICIAIS_COL.ASSISTIDO]) continue;

    var processoAtual = String(row[CONFIG.INICIAIS_COL.PROCESSO] || '').trim();
    if (processoAtual) continue; // ja verificado antes — nunca revisitado

    var email = String(row[CONFIG.INICIAIS_COL.EMAIL] || '').trim();
    var chaveEmail = normalizarChave(email);
    var nomeEstagiario;
    if (chaveEmail && cacheNomes.hasOwnProperty(chaveEmail)) {
      nomeEstagiario = cacheNomes[chaveEmail];
    } else {
      nomeEstagiario = buscarNomeEstagiarioPorEmail(email);
      if (chaveEmail) cacheNomes[chaveEmail] = nomeEstagiario;
    }

    var assistido = String(row[CONFIG.INICIAIS_COL.ASSISTIDO] || '').trim();
    var protocolo = nomeEstagiario ? buscarProtocoloPorAlunoEAssistido(nomeEstagiario, assistido, listaProtocolos) : null;
    if (!protocolo) continue;

    var linha = i + 2;
    aba.getRange(linha, CONFIG.INICIAIS_COL.PROCESSO + 1).setValue(protocolo.processo);
    aba.getRange(linha, CONFIG.INICIAIS_COL.VARA + 1).setValue(protocolo.vara);
    aba.getRange(linha, CONFIG.INICIAIS_COL.STATUS + 1).setValue('Protocolado');
    aba.getRange(linha, CONFIG.INICIAIS_COL.ALTERADO_EM + 1).setValue(agora);
    atualizados++;
  }

  return { sucesso: true, atualizados: atualizados };
}

// Handler chamado pelo trigger instalavel criado em
// configurarGatilhoVerificacaoProtocolos(). Sem validarAcesso — nao ha
// usuario logado dentro de um trigger horario, mesmo padrao usado em
// verificarCobrancasAutomatico (Mensagens.js).
function verificarProtocolosIniciaisAutomatico() {
  verificarProtocolosIniciais();
}

// Rodar esta funcao MANUALMENTE uma unica vez pelo editor do Apps Script
// (Executar > configurarGatilhoVerificacaoProtocolos) para instalar o
// gatilho diario as 8h. E seguro executa-la novamente: remove qualquer
// gatilho antigo do mesmo handler antes de criar um novo, evitando
// duplicatas — mesmo padrao de configurarGatilhoCobrancas (Mensagens.js).
function configurarGatilhoVerificacaoProtocolos() {
  var gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(function(g) {
    if (g.getHandlerFunction() === 'verificarProtocolosIniciaisAutomatico') {
      ScriptApp.deleteTrigger(g);
    }
  });

  ScriptApp.newTrigger('verificarProtocolosIniciaisAutomatico')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();
}

// --- Escrita (somente STATUS e editavel pelo painel nesta aba) ---

// --- Criar Peticao Inicial (Painel Aluno) ---
// Le bd!J2 (CONTROLE_PI), incrementa e grava de volta. Retorna o ID
// formatado "PI-0008". Mesma estrategia de proximoNumeroPedidoAluno() (Data.js)
// e proximoNumeroAcompanhamento() (Acompanhamentos.js): guarda so o numero
// inteiro na celula, nunca o ID formatado.
function proximoNumeroPedidoInicial() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) throw new Error('Aba bd nao encontrada.');

  var celula = aba.getRange(CONFIG.BD_CELL.CONTROLE_PI);
  var atual = parseInt(celula.getValue(), 10);
  if (isNaN(atual)) atual = 0;

  var proximo = atual + 1;
  celula.setValue(proximo);

  var numeroFormatado = String(proximo).padStart(4, '0');
  return CONFIG.PREFIXO_PEDIDO_INICIAL + numeroFormatado;
}

// Cria uma nova linha na aba iniciais a partir do modal "Criar Peticao
// Inicial" do Painel Aluno, e em seguida cria a atividade individual
// correspondente no Classroom (ver criarCourseWorkParaInicial em
// Classroom.js — nenhuma chamada a API do Classroom e feita aqui). Campos
// coletados no modal: cpf, assistido, especie. O e-mail (dono do registro) e
// resolvido e validado por quem chama esta funcao (ver acaoCriarPedidoInicial
// em Code.js) — nunca confiar em um e-mail vindo direto do payload do
// frontend sem essa validacao de acesso.
//
// DATA (DI) = hoje. DF = hoje + CONFIG.PRAZO_DIAS_PEDIDO_INICIAL dias uteis
// (considerando feriados em bd!C2:C — ver adicionarDiasUteis/lerFeriados em
// Agenda.js), mesma logica ja usada em "Novo Pedido" (Data.js) e "Pedido de
// Acompanhamento" (Acompanhamentos.js). STATUS = "Encaminhado" (mesmo status
// inicial dos demais fluxos). SEMESTRE e calculado a partir do DF (nao de
// hoje), para manter o mesmo criterio dos demais fluxos de criacao. Se a
// criacao da atividade no Classroom falhar, o pedido ainda assim fica salvo
// na planilha (STATUS "Encaminhado") — o erro e retornado ao frontend para
// Thales/aluno saberem que precisam tentar novamente ou avisar Thales.
function criarPedidoInicialAluno(payload) {
  var cpf = String((payload && payload.cpf) || '').trim();
  var assistido = String((payload && payload.assistido) || '').trim();
  var especie = String((payload && payload.especie) || '').trim();
  var email = normalizarChave((payload && payload.email) || '');

  if (!email) return { sucesso: false, erro: 'Nao foi possivel identificar o e-mail do estagiario(a).' };
  if (!assistido) return { sucesso: false, erro: 'Informe o assistido(a).' };
  if (!especie) return { sucesso: false, erro: 'Selecione a especie.' };

  var cpfDigitos = cpf.replace(/\D/g, '');
  if (cpfDigitos.length !== 11) return { sucesso: false, erro: 'Informe um CPF valido (11 digitos).' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_INICIAIS);
  if (!aba) return { sucesso: false, erro: 'Aba iniciais nao encontrada.' };

  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var feriados = lerFeriados();
  var df = adicionarDiasUteis(hoje, CONFIG.PRAZO_DIAS_PEDIDO_INICIAL, feriados);
  var semestre = calcularSemestre(df);
  var id = proximoNumeroPedidoInicial();

  // Ordem exata das colunas A:P.
  var novaLinha = [];
  novaLinha[CONFIG.INICIAIS_COL.ID] = id;
  novaLinha[CONFIG.INICIAIS_COL.DATA] = hoje;
  novaLinha[CONFIG.INICIAIS_COL.EMAIL] = email;
  novaLinha[CONFIG.INICIAIS_COL.ASSISTIDO] = assistido;
  novaLinha[CONFIG.INICIAIS_COL.CPF] = cpf;
  novaLinha[CONFIG.INICIAIS_COL.ESPECIE] = especie;
  novaLinha[CONFIG.INICIAIS_COL.STATUS] = CONFIG.STATUS_INICIAL_PADRAO;
  novaLinha[CONFIG.INICIAIS_COL.OBS] = '';
  novaLinha[CONFIG.INICIAIS_COL.ALTERADO_EM] = hoje;
  novaLinha[CONFIG.INICIAIS_COL.DF] = df;
  novaLinha[CONFIG.INICIAIS_COL.LINK] = '';
  novaLinha[CONFIG.INICIAIS_COL.SEMESTRE] = semestre;
  novaLinha[CONFIG.INICIAIS_COL.DI_CLASS] = '';
  novaLinha[CONFIG.INICIAIS_COL.DF_CLASS] = '';
  novaLinha[CONFIG.INICIAIS_COL.PROCESSO] = ''; // preenchida pelo cruzamento diario com protocolos (ver verificarProtocolosIniciais)
  novaLinha[CONFIG.INICIAIS_COL.VARA] = '';

  var proximaLinhaPlanilha = aba.getLastRow() + 1;
  // Forca a celula SEMESTRE como Texto simples antes de gravar — mesma
  // precaucao usada em criarAcompanhamento (Acompanhamentos.js).
  aba.getRange(proximaLinhaPlanilha, CONFIG.INICIAIS_COL.SEMESTRE + 1, 1, 1).setNumberFormat('@');
  aba.getRange(proximaLinhaPlanilha, 1, 1, CONFIG.TOTAL_COLUNAS_INICIAIS).setValues([novaLinha]);

  var resultado = {
    sucesso: true,
    id: id,
    linha: proximaLinhaPlanilha,
    df: formatarData(df),
    classroom: { sucesso: false }
  };

  try {
    // Nome completo resolvido a partir do e-mail (mesma funcao ja usada em
    // getTodasIniciais/verificarEntregasIniciais) — usado no vocativo
    // "Prezado(a) {PRIMEIRO NOME}" da descricao da atividade (ver
    // montarDescricaoAtividadeInicial em Classroom.js).
    var nomeEstagiario = buscarNomeEstagiarioPorEmail(email);
    var criado = criarCourseWorkParaInicial({ id: id, assistido: assistido, especie: especie, email: email, estagiario: nomeEstagiario, dfRaw: df });
    var linkCelula = aba.getRange(proximaLinhaPlanilha, CONFIG.INICIAIS_COL.LINK + 1);
    linkCelula.setValue(criado.link);
    linkCelula.setNote(criado.courseworkId);
    if (criado.diClass) aba.getRange(proximaLinhaPlanilha, CONFIG.INICIAIS_COL.DI_CLASS + 1).setValue(criado.diClass);
    if (criado.dfClass) aba.getRange(proximaLinhaPlanilha, CONFIG.INICIAIS_COL.DF_CLASS + 1).setValue(criado.dfClass);

    resultado.classroom = { sucesso: true, link: criado.link };
  } catch (e) {
    resultado.classroom = {
      sucesso: false,
      erro: 'Peticao salva, mas a atividade no Classroom nao foi criada: ' + e.message
    };
  }

  return resultado;
}

function salvarEdicaoInicial(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_INICIAIS);
  if (!aba) return { sucesso: false, erro: 'Aba iniciais nao encontrada.' };

  var linha = parseInt(payload._linha, 10);
  if (isNaN(linha) || linha < 2) return { sucesso: false, erro: 'Linha invalida.' };

  var novoStatus = String(payload.status || '').trim();
  var dfAtual = aba.getRange(linha, CONFIG.INICIAIS_COL.DF + 1).getValue();
  var dfClassAtual = aba.getRange(linha, CONFIG.INICIAIS_COL.DF_CLASS + 1).getValue();
  var agora = new Date();

  aba.getRange(linha, CONFIG.INICIAIS_COL.STATUS + 1).setValue(novoStatus);
  aba.getRange(linha, CONFIG.INICIAIS_COL.ALTERADO_EM + 1).setValue(agora);

  return {
    sucesso: true,
    novoAtraso: calcularAtraso(resolverDfParaAtraso(dfClassAtual, dfAtual), novoStatus),
    alteradoEm: formatarDataHora(agora)
  };
}