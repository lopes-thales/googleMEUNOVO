// Mensagens.gs
// Responsabilidade: montagem e envio de mensagens automaticas individuais no
// mural do Classroom (Announcements com assigneeMode INDIVIDUAL_STUDENTS,
// visiveis somente para o aluno destinatario). Ponto unico de entrada para
// qualquer fluxo que precise avisar um aluno especifico — nenhum outro
// arquivo deve chamar Classroom.Courses.Announcements diretamente. Reunir
// aqui tambem os textos fixos, para que novas mensagens futuras (alem da de
// Inicial marcada como Ok) sigam o mesmo padrao.

// --- Vocativo ---

// Extrai o primeiro nome de um nome completo, para uso como vocativo nas
// mensagens (ex.: "Erico Souza de Magalhaes" -> "Erico"). Decisao de Thales:
// sempre a primeira palavra, mesmo em nomes compostos (ex.: "Ana Paula" vira
// so "Ana") — sem tentar detectar prenomes compostos.
function primeiroNome(nomeCompleto) {
  var nome = String(nomeCompleto || '').trim();
  if (!nome) return '';
  return nome.split(/\s+/)[0];
}

// --- Envio (Classroom Announcements, individual) ---

// Publica um Announcement no mural da turma visivel apenas para o aluno
// (cursoId + userId) — e assim que o Classroom permite uma "mensagem
// individual no mural" pela API (mesmo mecanismo de assigneeMode/
// individualStudentsOptions ja usado em CourseWork.create, ver Classroom.js).
// Lanca excecao com mensagem legivel em caso de erro.
function enviarMensagemIndividualMural(cursoId, userId, texto) {
  var announcement = {
    text: texto,
    state: 'PUBLISHED',
    assigneeMode: 'INDIVIDUAL_STUDENTS',
    individualStudentsOptions: { studentIds: [userId] }
  };
  return Classroom.Courses.Announcements.create(announcement, cursoId);
}

// --- Mensagem: Peticao Inicial marcada como Ok (nota 100) ---
// Texto fixo definido por Thales. So os campos entre {} sao substituidos —
// o restante do texto nunca deve ser alterado (mesma convencao de
// montarDescricaoAtividade em Classroom.js). Disparada por
// verificarEntregasIniciais() (Classroom.js) quando a atividade Inicial
// recebe nota 100 no Classroom E o STATUS na aba iniciais esta como "Ok".
//
// ASSUNCAO A CONFIRMAR (definida por Thales): referenciaAtividade e montada
// como "{ID} - {ASSISTIDO} - {ESPECIE}" (ex.: "20016 - Eduarda Martins
// Gonçalves - Alimentos"), igual ao exemplo dado por Thales — mesmo que o
// TITULO real da coursework no Classroom siga outro formato (ver
// montarTituloAtividadeInicial em Classroom.js, que usa "{ID} - INICIAL -
// {ASSISTIDO}"). Ajustar se Thales preferir usar o titulo real da atividade.
function montarMensagemInicialOk(nomeAluno, referenciaAtividade) {
  var linhas = [
    primeiroNome(nomeAluno) + ', agora que a atividade ' + referenciaAtividade + ' foi marcada como OK, você deve (na ordem):',
    '- imprimir a petição em papel timbrado com as correções realizadas (última versão da petição);',
    '- anexar os documentos necessários;',
    '- anexar: ficha de cadastro, procuração e atestado, TODOS DEVIDAMENTE PREENCHIDOS;',
    '- assinar a petição;',
    '- anotar no acompanhamento da Secretaria;',
    '- entregar para a Jéssica ou Guilherme para realizar o protocolo',
    '',
    'Se tiver dúvidas, entre em contato. Parabéns pelo avanço! 🎉'
  ];
  return linhas.join('\n');
}

// --- Mensagem: diligencia transferida por atraso (Transferir Atividade) ---
// Texto fixo definido por Thales. So os campos entre {} sao substituidos —
// mesma convencao de montarMensagemInicialOk. {PRAZO} e sempre a DF
// ORIGINAL (a que foi descumprida), independente de uma nova DF escolhida no
// modal — decisao de Thales. {DATA_MSG_1}/{DATA_MSG_2} vem do rastreio de
// cobranca gravado na celula OBS da linha original (ver _lerRastreioCobranca
// mais abaixo) — se a diligencia foi transferida antes de qualquer cobranca
// automatica ter sido enviada (ex.: transferencia manual antecipada), cai no
// texto "sem aviso anterior registrado".
function montarMensagemTransferencia(nomeAlunoOriginal, referenciaAtividade, prazoFormatado, dataMsg1, dataMsg2) {
  dataMsg1 = dataMsg1 || 'sem aviso anterior registrado';
  dataMsg2 = dataMsg2 || 'sem aviso anterior registrado';

  var linhas = [
    primeiroNome(nomeAlunoOriginal) + ', informo que a atividade ' + referenciaAtividade +
      ' foi repassada para outro estagiário em razão do não cumprimento do prazo estabelecido (' +
      prazoFormatado + ') e da ausência de retorno aos avisos enviados anteriormente (' +
      dataMsg1 + ' e ' + dataMsg2 + ').',
    '',
    'Preciso reforçar: o cumprimento de prazos é parte da sua avaliação no estágio, e o descumprimento reiterado impacta diretamente sua nota.',
    '',
    'Conto com você para que isso não se repita nas próximas atividades.'
  ];
  return linhas.join('\n');
}

// Resolve curso/aluno e publica no mural individual + envia por e-mail ao
// estagiario original o aviso de que a diligencia foi transferida (ver
// transferirDiligencia, Data.js — canal duplo, mesma convencao das Mensagens
// 1/2, ver enviarMensagemDuploCanal mais abaixo). referenciaAtividade segue a
// mesma convencao de montarMensagemInicialOk: "{ID} - {ASSISTIDO} - {ESPECIE}".
// aba/linha sao a aba diligencias e o numero da linha ORIGINAL (antes de
// virar "Cancelada" em transferirDiligencia) — usados para ler as datas dos
// avisos de cobranca anteriores (COBR_MSG1/COBR_MSG2) gravados na nota da
// celula OBS dessa linha (ver _lerRastreioCobranca).
function enviarAvisoTransferenciaMural(aba, linha, nomeEstagiarioAntigo, idDiligencia, assistido, especie, dfOriginal) {
  var email = buscarEmailEstagiario(nomeEstagiarioAntigo);
  if (!email) throw new Error('Estagiário "' + nomeEstagiarioAntigo + '" sem e-mail cadastrado.');

  var cursoId = obterIdCursoClassroom();
  var userId = obterUserIdDoAluno(cursoId, email);

  var rastreio = _lerRastreioCobranca(aba.getRange(linha, CONFIG.COL.OBS + 1));
  var referencia = idDiligencia + ' - ' + assistido + ' - ' + especie;
  var texto = montarMensagemTransferencia(nomeEstagiarioAntigo, referencia, formatarData(dfOriginal), rastreio.msg1, rastreio.msg2);
  var assunto = 'Atividade ' + referencia + ' repassada — descumprimento de prazo';

  enviarMensagemDuploCanal(cursoId, userId, email, assunto, texto);
}

// --- Envio (e-mail individual) ---

// Envia um e-mail em texto puro (mesmo texto do mural, sem HTML) para um
// estagiario especifico. Usado pelas Mensagens 1, 2, 3 e 5 — a Mensagem 4 e
// o mockTest da OBS4 usam htmlBody diretamente (tabela de producao), sem
// passar por aqui.
function enviarEmailIndividual(email, assunto, corpoTexto) {
  MailApp.sendEmail({ to: email, subject: assunto, body: corpoTexto });
}

// Envia a mesma mensagem pelos dois canais (mural individual do Classroom +
// e-mail), cada um em try/catch isolado — decisao de Thales: um canal falhar
// (ex.: aluno fora da turma no Classroom) nao deve impedir o outro canal de
// sair. Retorna os erros de cada canal (null quando nao houve erro), para o
// chamador decidir se registra/expoe o problema.
function enviarMensagemDuploCanal(cursoId, userId, email, assunto, texto) {
  var muralErro = null;
  var emailErro = null;

  try {
    enviarMensagemIndividualMural(cursoId, userId, texto);
  } catch (e) {
    muralErro = e.message;
  }

  try {
    enviarEmailIndividual(email, assunto, texto);
  } catch (e) {
    emailErro = e.message;
  }

  return { muralErro: muralErro, emailErro: emailErro };
}

// --- Rastreio de avisos de cobranca ja enviados (nota de celula) ---
// Mesma tecnica de marcarNotificacaoInicialEnviada/notificacaoInicialJaEnviada
// (Classroom.js): guarda o dado tecnico como nota (comentario) de uma celula
// ja existente, sem gastar coluna nova. A nota acumula ate duas linhas:
//   COBR_MSG1: dd/MM/yyyy HH:mm:ss
//   COBR_MSG2: dd/MM/yyyy HH:mm:ss
//
// Celula de rastreio usada por aba (decisao de Thales — ver ASSUNCAO no
// cabecalho de enviarCobrancasPendentes): diligencias e iniciais usam a
// celula OBS (nunca tem nota gravada por nenhum outro fluxo do painel);
// acompanhamentos usa a celula STATUS, porque essa aba nao tem coluna OBS e
// a celula LINK ja guarda o courseworkId como nota (ver
// obterCourseworkIdDaLinhaAcompanhamento em Classroom.js).

function _lerRastreioCobranca(cell) {
  var nota = String(cell.getNote() || '');
  var msg1 = nota.match(/COBR_MSG1:\s*([^\n]+)/);
  var msg2 = nota.match(/COBR_MSG2:\s*([^\n]+)/);
  return {
    msg1: msg1 ? msg1[1].trim() : '',
    msg2: msg2 ? msg2[1].trim() : ''
  };
}

function _marcarRastreioCobranca(cell, chave) {
  var rastreio = _lerRastreioCobranca(cell);
  var agora = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  rastreio[chave] = agora;

  var linhasNota = [];
  if (rastreio.msg1) linhasNota.push('COBR_MSG1: ' + rastreio.msg1);
  if (rastreio.msg2) linhasNota.push('COBR_MSG2: ' + rastreio.msg2);
  cell.setNote(linhasNota.join('\n'));
}

// --- Mensagens 1 e 2 (cobranca de prazo vencido, sem entrega) ---
// Texto fixo definido por Thales. So os campos entre {} sao substituidos —
// mesma convencao das demais mensagens deste arquivo. {PRAZO} e sempre a DF
// do registro (a que esta vencida).

function montarMensagemPrazoVencido(nomeAluno, referenciaAtividade, prazoFormatado) {
  var linhas = [
    primeiroNome(nomeAluno) + ', passando para avisar que o prazo da atividade ' + referenciaAtividade +
      ' venceu em ' + prazoFormatado + ' e ainda não recebi sua entrega.',
    '',
    'Sem problema — ainda estou aceitando normalmente, só preciso que você me envie o quanto antes para seguirmos com o andamento do processo.',
    '',
    'Qualquer dificuldade, me chama que a gente resolve juntos. 🙂'
  ];
  return linhas.join('\n');
}

function montarMensagemSegundoAviso(nomeAluno, referenciaAtividade, prazoFormatado, dataMsg1Formatada) {
  var linhas = [
    primeiroNome(nomeAluno) + ', retomando sobre a atividade ' + referenciaAtividade + ': o prazo venceu em ' +
      prazoFormatado + ' e, desde meu último aviso em ' + dataMsg1Formatada + ', ainda não recebi a entrega.',
    '',
    'Preciso que isso seja resolvido o quanto antes, para não travar o processo. Se tem algo dificultando a entrega, me avise agora mesmo — prefiro saber e ajudar do que só cobrar.',
    '',
    'Conto com você.'
  ];
  return linhas.join('\n');
}

// --- Varredura de cobrancas pendentes (diligencias + iniciais + acompanhamentos) ---
// Chamada tanto pelo gatilho diario automatico (verificarCobrancasAutomatico)
// quanto pelo botao manual "Enviar Cobranças" no dropdown Gerenciar (ver
// acaoEnviarCobrancas em Code.js) — mesma funcao por tras dos dois, decisao
// de Thales. So considera "sem entrega" quando STATUS == "Encaminhado" (o
// aluno nunca interagiu no Classroom) e o prazo (DF) ja venceu — se o
// estagiario ja entregou (STATUS "Entregue"/"Devolvida"/etc.), nao cobra,
// mesmo com prazo vencido, porque ele ja interagiu com a atividade.
//
// Cada linha elegivel recebe, na ordem:
//   sem COBR_MSG1 registrado                                    -> Mensagem 1
//   com COBR_MSG1 ha >= CONFIG.COBRANCA.DIAS_ENTRE_AVISOS dias   -> Mensagem 2
//     corridos e sem COBR_MSG2 registrado
//   caso contrario                                               -> nao faz nada
//
// referenciaAtividade segue a mesma convencao usada nas demais mensagens
// deste arquivo: "{ID} - {ASSISTIDO} - {ESPECIE}" para diligencias/iniciais;
// para acompanhamentos (sem ASSISTIDO/ESPECIE) usa "{ID} - {PROCESSO}", mesma
// referencia usada no titulo da atividade no Classroom (ver
// montarTituloAtividadeAcompanhamento, Classroom.js).
function _diasCorridosEntre(dataInicioStr, dataFim) {
  // dataInicioStr no formato "dd/MM/yyyy HH:mm:ss" (ver _marcarRastreioCobranca).
  var partes = dataInicioStr.split(/[\/\s:]/); // [dd, MM, yyyy, HH, mm, ss]
  var dataInicio = new Date(Number(partes[2]), Number(partes[1]) - 1, Number(partes[0]));
  dataInicio.setHours(0, 0, 0, 0);
  var fim = new Date(dataFim);
  fim.setHours(0, 0, 0, 0);
  return Math.round((fim.getTime() - dataInicio.getTime()) / 86400000);
}

// Processa uma unica linha elegivel: decide se envia Mensagem 1 ou 2, monta
// o texto/assunto, resolve o mural (cursoId/userId) e o e-mail, envia pelos
// dois canais e grava o rastreio. Retorna null se nada foi enviado (ja
// cobrado nos dois avisos, ou ainda nao passou o intervalo entre avisos).
function _processarLinhaCobranca(cursoId, cell, email, nomeEstagiario, referencia, prazoFormatado) {
  var rastreio = _lerRastreioCobranca(cell);
  var hoje = new Date();

  var precisaMsg1 = !rastreio.msg1;
  var precisaMsg2 = !precisaMsg1 && !rastreio.msg2 &&
    _diasCorridosEntre(rastreio.msg1, hoje) >= CONFIG.COBRANCA.DIAS_ENTRE_AVISOS;

  if (!precisaMsg1 && !precisaMsg2) return null; // ja cobrado nos dois avisos, ou ainda nao passou o intervalo

  var userId = obterUserIdDoAluno(cursoId, email);

  if (precisaMsg1) {
    var texto1 = montarMensagemPrazoVencido(nomeEstagiario, referencia, prazoFormatado);
    var assunto1 = 'Prazo vencido — ' + referencia;
    enviarMensagemDuploCanal(cursoId, userId, email, assunto1, texto1);
    _marcarRastreioCobranca(cell, 'msg1');
    return 'msg1';
  }

  var texto2 = montarMensagemSegundoAviso(nomeEstagiario, referencia, prazoFormatado, rastreio.msg1.split(' ')[0]);
  var assunto2 = '2º aviso — ' + referencia + ' ainda pendente';
  enviarMensagemDuploCanal(cursoId, userId, email, assunto2, texto2);
  _marcarRastreioCobranca(cell, 'msg2');
  return 'msg2';
}

function enviarCobrancasPendentes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var cursoId;
  try {
    cursoId = obterIdCursoClassroom();
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }

  var enviados = [];
  var erros = [];

  // --- diligencias ---
  var abaDiligencias = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (abaDiligencias) {
    getTodasDiligencias().forEach(function(reg) {
      if (!reg.atraso || normalizarChave(reg.status) !== 'encaminhado') return;
      try {
        var email = buscarEmailEstagiario(reg.estagiario);
        if (!email) throw new Error('Estagiário "' + reg.estagiario + '" sem e-mail cadastrado.');
        var referencia = reg.id + ' - ' + reg.assistido + ' - ' + reg.especie;
        var cell = abaDiligencias.getRange(reg._linha, CONFIG.COL.OBS + 1);
        var resultado = _processarLinhaCobranca(cursoId, cell, email, reg.estagiario, referencia, reg.prazoAtraso);
        if (resultado) enviados.push({ linha: reg._linha, id: reg.id, mensagem: resultado, origem: 'diligencias' });
      } catch (e) {
        erros.push({ linha: reg._linha, id: reg.id, erro: e.message, origem: 'diligencias' });
      }
    });
  }

  // --- iniciais ---
  var abaIniciais = ss.getSheetByName(CONFIG.SHEET_INICIAIS);
  if (abaIniciais) {
    getTodasIniciais().forEach(function(reg) {
      if (!reg.atraso || normalizarChave(reg.status) !== 'encaminhado') return;
      try {
        if (!reg.email) throw new Error('Registro sem e-mail de estagiário(a) cadastrado na linha.');
        var referencia = reg.id + ' - ' + reg.assistido + ' - ' + reg.especie;
        var cell = abaIniciais.getRange(reg._linha, CONFIG.INICIAIS_COL.OBS + 1);
        var resultado = _processarLinhaCobranca(cursoId, cell, reg.email, reg.estagiario, referencia, reg.prazoAtraso);
        if (resultado) enviados.push({ linha: reg._linha, id: reg.id, mensagem: resultado, origem: 'iniciais' });
      } catch (e) {
        erros.push({ linha: reg._linha, id: reg.id, erro: e.message, origem: 'iniciais' });
      }
    });
  }

  // --- acompanhamentos ---
  var abaAcompanhamentos = ss.getSheetByName(CONFIG.SHEET_ACOMPANHAMENTOS);
  if (abaAcompanhamentos) {
    getTodosAcompanhamentos().forEach(function(reg) {
      if (!reg.atraso || normalizarChave(reg.status) !== 'encaminhado') return;
      try {
        if (!reg.email) throw new Error('Registro sem e-mail de estagiário cadastrado na linha.');
        var referencia = reg.id + ' - ' + reg.processo;
        var cell = abaAcompanhamentos.getRange(reg._linha, CONFIG.ACOMPANHAMENTOS_COL.STATUS + 1);
        var resultado = _processarLinhaCobranca(cursoId, cell, reg.email, reg.estagiario, referencia, reg.prazoAtraso);
        if (resultado) enviados.push({ linha: reg._linha, id: reg.id, mensagem: resultado, origem: 'acompanhamentos' });
      } catch (e) {
        erros.push({ linha: reg._linha, id: reg.id, erro: e.message, origem: 'acompanhamentos' });
      }
    });
  }

  return { sucesso: true, enviados: enviados, erros: erros };
}

// --- Gatilho automatico (executado diariamente as 8h) ---

// Handler chamado pelo trigger instalavel criado em configurarGatilhoCobrancas().
// Sem validarAcesso — nao ha usuario logado dentro de um trigger horario,
// mesmo padrao usado em verificarEntregasAutomatico (Classroom.js).
//
// CORRECAO (bug identificado por Thales em 19/07/2026): o gatilho estava
// disparando todo santo dia as 8h, inclusive sabado/domingo/feriado, porque
// nao existia nenhuma checagem de dia util aqui — diferente de
// verificarEntregasAutomatico (Classroom.js), que ja usava
// dentroDoHorarioComercial() (Agenda.js) para essa mesma finalidade. Agora
// reaproveita ehDiaUtil/lerFeriados (Agenda.js) para so agir em dia util.
function verificarCobrancasAutomatico() {
  if (!ehDiaUtil(new Date(), lerFeriados())) return;
  enviarCobrancasPendentes();
}

// Rodar esta funcao MANUALMENTE uma unica vez pelo editor do Apps Script
// (Executar > configurarGatilhoCobrancas) para instalar o gatilho diario as
// 8h. E seguro executa-la novamente: remove qualquer gatilho antigo do mesmo
// handler antes de criar um novo, evitando duplicatas — mesmo padrao de
// configurarGatilhoVerificacaoAutomatica (Classroom.js).
function configurarGatilhoCobrancas() {
  var gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(function(g) {
    if (g.getHandlerFunction() === 'verificarCobrancasAutomatico') {
      ScriptApp.deleteTrigger(g);
    }
  });

  ScriptApp.newTrigger('verificarCobrancasAutomatico')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();
}

// --- Mensagem 4: resumo de producao (e-mail, 15 dias antes do fim do estagio) ---
// So sai por e-mail (nao tem versao de mural) — decisao explicita do
// documento de templates. Contagens vem de getContagemProducaoEstagiario
// (Panorama.js), filtradas pelo SEMESTRE do proprio estagiario (nao e
// producao acumulada do estagio inteiro).

// Tabela HTML no mesmo formato visual do e-mail da Secretaria (ver
// _enviarEmailSecretaria, Secretaria.js) — reaproveita _escapeHtmlSecretaria
// (funcoes top-level sao globais entre arquivos .gs no Apps Script).
function montarTabelaProducaoHtml(contagens) {
  var linhas = [
    ['Diligências simples', contagens.qtdSimples],
    ['Diligências complexas', contagens.qtdComplexas],
    ['Atendimentos', contagens.qtdAtendimentos],
    ['Acompanhamentos', contagens.qtdAcompanhamentos]
  ];

  var html = '<table border="1" cellpadding="8" cellspacing="0" '
    + 'style="border-collapse:collapse; font-family:Arial,sans-serif; '
    + 'font-size:13px; min-width:400px;">'
    + '<thead>'
    + '<tr style="background:#3D6A61; color:#ffffff;">'
    + '<th style="text-align:left; padding:10px 12px;">Tipo</th>'
    + '<th style="text-align:left; padding:10px 12px;">Quantidade</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody>';

  for (var i = 0; i < linhas.length; i++) {
    var bgRow = (i % 2 === 0) ? '#ffffff' : '#f4f8f6';
    html += '<tr style="background:' + bgRow + ';">'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linhas[i][0]) + '</td>'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linhas[i][1]) + '</td>'
      + '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

// Texto fixo definido por Thales. So os campos entre {} sao substituidos —
// mesma convencao das demais mensagens deste arquivo.
function montarEmailProducaoEstagio(nomeAluno, dataFinalizacaoFormatada, semestre, contagens) {
  var html = '<p style="font-family:Arial,sans-serif; font-size:14px;">'
    + primeiroNome(nomeAluno) + ', faltam 15 dias para o encerramento do seu período de estágio (' + dataFinalizacaoFormatada + ').</p>'
    + '<p style="font-family:Arial,sans-serif; font-size:14px;">'
    + 'Para que você tenha uma visão clara do seu desempenho neste semestre (' + semestre + '), segue um resumo da sua produção:</p>'
    + montarTabelaProducaoHtml(contagens)
    + '<p style="font-family:Arial,sans-serif; font-size:14px; margin-top:16px;">'
    + 'Fico à disposição caso queira conversar sobre esses números ou sobre o que ainda pode ser feito até o fim do período. Seguimos juntos até a reta final. 🙂</p>';

  return {
    assunto: 'Seu desempenho no estágio — resumo de produção',
    html: html
  };
}

// estagiario: { nome, email, semestre } (ver getTodosEstagiariosCompletos, Panorama.js).
function enviarEmailProducaoEstagio(estagiario) {
  var contagens = getContagemProducaoEstagiario(estagiario.nome, estagiario.semestre);
  var dataFinalizacao = _lerDataFinalizacaoEstagio();
  var email = montarEmailProducaoEstagio(estagiario.nome, formatarData(dataFinalizacao), estagiario.semestre, contagens);

  MailApp.sendEmail({ to: estagiario.email, subject: email.assunto, htmlBody: email.html });
}

// --- Mensagem 5: fluxo de encerramento (mural + e-mail, 7 dias antes do fim) ---
// Texto fixo definido por Thales. PASSOS vem de CONFIG.ENCERRAMENTO_ESTAGIO.PASSOS
// (definidos por Thales) — lista numerada montada com o mesmo padrao de
// montarMensagemInicialOk (linhas.join('\n')).
function montarMensagemEncerramento(nomeAluno, dataFinalizacaoFormatada) {
  var linhas = [
    primeiroNome(nomeAluno) + ', esta é a última semana do seu período de estágio, que se encerra em ' + dataFinalizacaoFormatada + '.',
    '',
    'Para organizarmos o encerramento com tranquilidade, segue o fluxo que você deve seguir nesta semana:',
    ''
  ];

  CONFIG.ENCERRAMENTO_ESTAGIO.PASSOS.forEach(function(passo, indice) {
    linhas.push((indice + 1) + '. ' + passo);
  });

  linhas.push('');
  linhas.push('Qualquer dúvida sobre esse processo, me procure. Foi um prazer acompanhar seu trabalho até aqui.');

  return linhas.join('\n');
}

// estagiario: { nome, email } (ver getTodosEstagiariosCompletos, Panorama.js).
function enviarMensagemEncerramento(estagiario) {
  var cursoId = obterIdCursoClassroom();
  var userId = obterUserIdDoAluno(cursoId, estagiario.email);
  var dataFinalizacao = _lerDataFinalizacaoEstagio();

  var texto = montarMensagemEncerramento(estagiario.nome, formatarData(dataFinalizacao));
  var assunto = 'Última semana de estágio — fluxo de encerramento';

  enviarMensagemDuploCanal(cursoId, userId, estagiario.email, assunto, texto);
}

// --- Gatilho diario de encerramento de estagio (bd!P2) ---
// Le bd!P2 (CONFIG.BD_CELL.DATA_FINALIZACAO_ESTAGIO — "Data final do
// estágio", celula unica compartilhada por todos os estagiarios ativos do
// periodo corrente, preenchida manualmente por Thales). Quando faltam
// exatamente DIAS_AVISO_PRODUCAO dias corridos, dispara a Mensagem 4 para
// todos os estagiarios ativos (FINALIZADO vazio); quando faltam exatamente
// DIAS_AVISO_FLUXO dias corridos, dispara a Mensagem 5. Guarda de
// duplicidade (mesma tecnica de marcarNotificacaoInicialEnviada): nota na
// celula NOME (coluna B) da aba estagiarios, incluindo o semestre — assim,
// se Thales atualizar bd!P2 para um novo periodo/semestre, o aviso volta a
// disparar normalmente.

function _lerDataFinalizacaoEstagio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) return null;

  var valor = aba.getRange(CONFIG.BD_CELL.DATA_FINALIZACAO_ESTAGIO).getValue();
  if (!(valor instanceof Date) || isNaN(valor.getTime())) return null;
  return valor;
}

function _diasCorridosAte(dataAlvo) {
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  var alvo = new Date(dataAlvo);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

function _avisoEncerramentoJaEnviado(cellNome, chave, semestre) {
  var nota = String(cellNome.getNote() || '');
  return nota.indexOf(chave + ': ' + semestre) !== -1;
}

function _marcarAvisoEncerramentoEnviado(cellNome, chave, semestre) {
  var notaAtual = String(cellNome.getNote() || '');
  var novaLinha = chave + ': ' + semestre;
  cellNome.setNote(notaAtual ? notaAtual + '\n' + novaLinha : novaLinha);
}

function verificarEncerramentoEstagioAutomatico() {
  var dataFinalizacao = _lerDataFinalizacaoEstagio();
  if (!dataFinalizacao) return;

  var diasRestantes = _diasCorridosAte(dataFinalizacao);
  var ehDiaAvisoProducao = diasRestantes === CONFIG.ENCERRAMENTO_ESTAGIO.DIAS_AVISO_PRODUCAO;
  var ehDiaAvisoFluxo = diasRestantes === CONFIG.ENCERRAMENTO_ESTAGIO.DIAS_AVISO_FLUXO;
  if (!ehDiaAvisoProducao && !ehDiaAvisoFluxo) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaEstagiarios = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!abaEstagiarios) return;

  var estagiarios = getTodosEstagiariosCompletos().filter(function(e) { return !e.finalizado && e.email; });

  estagiarios.forEach(function(estagiario) {
    // Localiza a linha do estagiario na aba (para gravar a nota de rastreio).
    var linha = _linhaEstagiarioPorId(abaEstagiarios, estagiario.id);
    if (!linha) return;
    var cellNome = abaEstagiarios.getRange(linha, CONFIG.ESTAGIARIOS_COL.NOME + 1);

    try {
      if (ehDiaAvisoProducao && !_avisoEncerramentoJaEnviado(cellNome, 'MSG_PRODUCAO_ENVIADA', estagiario.semestre)) {
        enviarEmailProducaoEstagio(estagiario);
        _marcarAvisoEncerramentoEnviado(cellNome, 'MSG_PRODUCAO_ENVIADA', estagiario.semestre);
      }
      if (ehDiaAvisoFluxo && !_avisoEncerramentoJaEnviado(cellNome, 'MSG_ENCERRAMENTO_ENVIADA', estagiario.semestre)) {
        enviarMensagemEncerramento(estagiario);
        _marcarAvisoEncerramentoEnviado(cellNome, 'MSG_ENCERRAMENTO_ENVIADA', estagiario.semestre);
      }
    } catch (e) {
      // Erro isolado por estagiario — nao interrompe os demais. Sem lista de
      // retorno porque este handler roda dentro de um gatilho automatico
      // (sem usuario para ver o resultado); erros ficam no log de execucoes
      // do Apps Script.
      Logger.log('Erro ao processar encerramento de estagio para ' + estagiario.nome + ': ' + e.message);
    }
  });
}

function _linhaEstagiarioPorId(abaEstagiarios, id) {
  var ultimaLinha = abaEstagiarios.getLastRow();
  if (ultimaLinha < 2) return null;

  var dadosId = abaEstagiarios.getRange(2, CONFIG.ESTAGIARIOS_COL.ID + 1, ultimaLinha - 1, 1).getValues();
  for (var i = 0; i < dadosId.length; i++) {
    if (String(dadosId[i][0]).trim() === String(id).trim()) return i + 2;
  }
  return null;
}

// Rodar esta funcao MANUALMENTE uma unica vez pelo editor do Apps Script
// (Executar > configurarGatilhoEncerramentoEstagio) para instalar o gatilho
// diario as 8h. E seguro executa-la novamente — mesmo padrao de
// configurarGatilhoCobrancas acima.
function configurarGatilhoEncerramentoEstagio() {
  var gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(function(g) {
    if (g.getHandlerFunction() === 'verificarEncerramentoEstagioAutomatico') {
      ScriptApp.deleteTrigger(g);
    }
  });

  ScriptApp.newTrigger('verificarEncerramentoEstagioAutomatico')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();
}

// --- Mock test (OBS4) — valida o formato do e-mail de producao ---
// Reenvia o e-mail de resumo de producao (Mensagem 4) de 3 estagiarios
// especificos, sempre para escritorioescola@cest.edu.br em vez do e-mail
// real de cada um — para Thales validar o layout antes de confiar no envio
// automatico do gatilho de encerramento. Rodar MANUALMENTE pelo editor do
// Apps Script (Executar > mockTestEnviarProducaoEstagiarios). Nomes fixos
// pedidos por Thales — "EE" e um apelido/nome real ja cadastrado na aba
// estagiarios.
function mockTestEnviarProducaoEstagiarios() {
  var nomes = ['Iasmyn Martins Gomes', 'Arnaldo Cezar Costa Serra Neto', 'EE'];
  var destinatarioTeste = CONFIG.EMAILS_SECRETARIA[0]; // escritorioescola@cest.edu.br
  var todosEstagiarios = getTodosEstagiariosCompletos();

  var enviados = [];
  var erros = [];

  nomes.forEach(function(nome) {
    var estagiario = todosEstagiarios.filter(function(e) {
      return normalizarChave(e.nome) === normalizarChave(nome);
    })[0];

    if (!estagiario) {
      erros.push({ nome: nome, erro: 'Estagiário não encontrado na aba estagiarios.' });
      return;
    }

    try {
      var contagens = getContagemProducaoEstagiario(estagiario.nome, estagiario.semestre);
      var dataFinalizacao = _lerDataFinalizacaoEstagio();
      var email = montarEmailProducaoEstagio(estagiario.nome, formatarData(dataFinalizacao), estagiario.semestre, contagens);

      MailApp.sendEmail({
        to: destinatarioTeste,
        subject: '[TESTE] ' + email.assunto + ' — ' + estagiario.nome,
        htmlBody: email.html
      });
      enviados.push(estagiario.nome);
    } catch (e) {
      erros.push({ nome: nome, erro: e.message });
    }
  });

  return { sucesso: true, enviados: enviados, erros: erros };
}