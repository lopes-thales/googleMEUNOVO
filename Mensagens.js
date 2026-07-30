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

// --- Mensagens: Atendimento Online aprovado / reprovado (so e-mail, decisao
// de Thales — sem mural do Classroom neste fluxo) ---
// referenciaAtividade segue o mesmo espirito das demais mensagens: um texto
// curto que identifica a atividade sem precisar abrir o sistema. Aqui e
// montada em AtendimentoOnline.js como "{tipoAtividade} de {assistido} —
// Processo {processo}" (ex.: "Diligência de Maria Silva — Processo
// 0001234-56.2026.8.06.0001"), usando o contexto ja resolvido por
// resolverContextoAtividade.
function montarMensagemAtendimentoOnlineAprovado(nomeAluno, idAtendimentoOnline, referenciaAtividade) {
  var linhas = [
    primeiroNome(nomeAluno) + ', seu Atendimento Online ' + idAtendimentoOnline + ' (' + referenciaAtividade + ') foi APROVADO.',
    '',
    'Ele já está contabilizado na sua produção do semestre.'
  ];
  return linhas.join('\n');
}

function montarMensagemAtendimentoOnlineReprovado(nomeAluno, idAtendimentoOnline, referenciaAtividade, motivo) {
  var linhas = [
    primeiroNome(nomeAluno) + ', seu Atendimento Online ' + idAtendimentoOnline + ' (' + referenciaAtividade + ') foi REPROVADO.',
    '',
    'Motivo: ' + motivo,
    '',
    'Você pode corrigir e reenviar o mesmo registro pelo Painel Aluno, na tabela "Atendimentos Online".'
  ];
  return linhas.join('\n');
}

// Chamadas por AtendimentoOnline.js (aprovarAtendimentoOnline/
// reprovarAtendimentoOnline) apos a escrita na planilha ja ter sido feita —
// falha no envio de e-mail nao deve desfazer a decisao de aprovacao/
// reprovacao, por isso cada uma trata seu proprio erro e retorna uma string
// (mensagem de erro) ou null (sucesso), sem lancar excecao para quem chamou.
function enviarEmailAtendimentoOnlineAprovado(email, nomeAluno, idAtendimentoOnline, referenciaAtividade) {
  try {
    var assunto = 'Atendimento Online ' + idAtendimentoOnline + ' aprovado';
    var texto = montarMensagemAtendimentoOnlineAprovado(nomeAluno, idAtendimentoOnline, referenciaAtividade);
    enviarEmailIndividual(email, assunto, texto);
    return null;
  } catch (e) {
    return e.message;
  }
}

function enviarEmailAtendimentoOnlineReprovado(email, nomeAluno, idAtendimentoOnline, referenciaAtividade, motivo) {
  try {
    var assunto = 'Atendimento Online ' + idAtendimentoOnline + ' reprovado';
    var texto = montarMensagemAtendimentoOnlineReprovado(nomeAluno, idAtendimentoOnline, referenciaAtividade, motivo);
    enviarEmailIndividual(email, assunto, texto);
    return null;
  } catch (e) {
    return e.message;
  }
}

// --- Mensagens: Audiências do Estagiário (A-1 a A-4 — so e-mail, mesmo
// espirito de Atendimento Online: sem versao de mural neste fluxo) ---
// Chamadas por AudienciasEstagiario.js apos a escrita na planilha ja ter sido
// feita — falha no envio nunca desfaz a decisao ja gravada (RN-12).

// A-1: aprovacao de uma audiencia.
function montarMensagemAudienciaAprovada(nomeAluno, idAudiencia, tipo, dataFormatada, vara, processo, progressoTexto) {
  var linhas = [
    primeiroNome(nomeAluno) + ', sua audiência ' + idAudiencia + ' (' + tipo + ' — ' + dataFormatada + ', ' + vara + ', processo ' + processo + ') foi APROVADA.',
    '',
    'Progresso atual em "' + tipo + '": ' + progressoTexto + '.'
  ];
  return linhas.join('\n');
}

function enviarEmailAudienciaAprovada(email, nomeAluno, idAudiencia, tipo, dataFormatada, vara, processo, progressoTexto) {
  try {
    var assunto = 'Audiência ' + idAudiencia + ' aprovada';
    var texto = montarMensagemAudienciaAprovada(nomeAluno, idAudiencia, tipo, dataFormatada, vara, processo, progressoTexto);
    enviarEmailIndividual(email, assunto, texto);
    return null;
  } catch (e) {
    return e.message;
  }
}

// A-2: reprovacao de uma audiencia.
function montarMensagemAudienciaReprovada(nomeAluno, idAudiencia, tipo, dataFormatada, vara, processo, motivo) {
  var linhas = [
    primeiroNome(nomeAluno) + ', sua audiência ' + idAudiencia + ' (' + tipo + ' — ' + dataFormatada + ', ' + vara + ', processo ' + processo + ') foi REPROVADA.',
    '',
    'Motivo: ' + motivo,
    '',
    'Você pode corrigir e reenviar o mesmo registro pelo Painel Aluno, na tabela "Audiências".'
  ];
  return linhas.join('\n');
}

function enviarEmailAudienciaReprovada(email, nomeAluno, idAudiencia, tipo, dataFormatada, vara, processo, motivo) {
  try {
    var assunto = 'Audiência ' + idAudiencia + ' reprovada';
    var texto = montarMensagemAudienciaReprovada(nomeAluno, idAudiencia, tipo, dataFormatada, vara, processo, motivo);
    enviarEmailIndividual(email, assunto, texto);
    return null;
  } catch (e) {
    return e.message;
  }
}

// A-3: meta de UM tipo cumprida (disparada uma unica vez por tipo, por
// estagiario, por TURMA — controle de reenvio via nota de celula, ver
// dispararAvisosMetaAudiencia mais abaixo).
function montarMensagemMetaAudienciaCumprida(nomeAluno, tipo, meta) {
  var linhas = [
    primeiroNome(nomeAluno) + ', parabéns! Você atingiu a meta de ' + meta + ' audiência(s) do tipo "' + tipo + '".',
    '',
    'Audiências extras desse tipo continuam sendo registradas e aprovadas normalmente, mas a meta já está cumprida.'
  ];
  return linhas.join('\n');
}

function enviarEmailMetaAudienciaCumprida(email, nomeAluno, tipo, meta) {
  var assunto = 'Meta de audiências cumprida — ' + tipo;
  var texto = montarMensagemMetaAudienciaCumprida(nomeAluno, tipo, meta);
  enviarEmailIndividual(email, assunto, texto);
}

// A-4: as TRES metas cumpridas (disparada uma unica vez por estagiario, por
// TURMA — mensagem de encerramento do requisito, distinta da A-3).
function montarMensagemTodasMetasAudienciaCumpridas(nomeAluno) {
  var linhas = [
    primeiroNome(nomeAluno) + ', você cumpriu as três metas de audiências do estágio (Escritório Escola, Externas e Tribunal do Júri). Parabéns pelo empenho!',
    '',
    'Lembre-se: a validação de cada audiência depende do envio da ata ou declaração de presença por e-mail, conforme avisado no momento do registro.'
  ];
  return linhas.join('\n');
}

function enviarEmailTodasMetasAudienciaCumpridas(email, nomeAluno) {
  var assunto = 'Todas as metas de audiências cumpridas';
  var texto = montarMensagemTodasMetasAudienciaCumpridas(nomeAluno);
  enviarEmailIndividual(email, assunto, texto);
}

// Localiza a linha exata de "estagiarios" (par NOME+TURMA, ja que um mesmo
// estagiario pode ter mais de uma linha — ex.: antecipado e regular do mesmo
// semestre) para gravar/ler a nota de rastreio de A-3/A-4 na celula NOME
// (coluna B), mesma tecnica de _avisoEncerramentoJaEnviado/
// _marcarAvisoEncerramentoEnviado (mais abaixo).
function _linhaEstagiarioPorNomeTurma(abaEstagiarios, nome, turma) {
  var ultimaLinha = abaEstagiarios.getLastRow();
  if (ultimaLinha < 2) return null;

  var dados = abaEstagiarios.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_ESTAGIARIOS).getValues();
  var chaveNome = normalizarChave(nome);
  for (var i = 0; i < dados.length; i++) {
    var linhaNome = normalizarChave(dados[i][CONFIG.ESTAGIARIOS_COL.NOME]);
    var linhaTurma = String(dados[i][CONFIG.ESTAGIARIOS_COL.TURMA] || '').trim();
    if (!linhaTurma) {
      var dataInicio = dados[i][CONFIG.ESTAGIARIOS_COL.DATA_INICIO];
      var semestre = normalizarSemestreLido(dados[i][CONFIG.ESTAGIARIOS_COL.SEMESTRE]);
      linhaTurma = calcularTurma(dataInicio, semestre);
    }
    if (linhaNome === chaveNome && linhaTurma === turma) return i + 2;
  }
  return null;
}

// Chamada por aprovarAudienciaEstagiario (AudienciasEstagiario.js) apos cada
// aprovacao, ja com a contagem atualizada (contagens = contarAudienciasPorTipo).
// Dispara A-3 para cada tipo recem-completado e A-4 quando os tres tipos
// estiverem completos — cada um no maximo uma vez por estagiario+TURMA
// (27/07/2026: chave trocada de semestre para turma, ja que um estagiario
// pode ter uma linha por turma dentro do mesmo semestre civil — antecipado e
// regular), controlado por nota na celula NOME (mesmo mecanismo de
// _avisoEncerramentoJaEnviado/_marcarAvisoEncerramentoEnviado). Falha de
// envio nunca interrompe o restante (RN-12) — erros sao concatenados e
// devolvidos como aviso nao bloqueante.
function dispararAvisosMetaAudiencia(nomeEstagiario, email, turma, contagens) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaEstagiarios = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!abaEstagiarios) return null;

  var linha = _linhaEstagiarioPorNomeTurma(abaEstagiarios, nomeEstagiario, turma);
  if (!linha) return null;
  var cellNome = abaEstagiarios.getRange(linha, CONFIG.ESTAGIARIOS_COL.NOME + 1);

  var erros = [];
  var lista = contagens || [];

  lista.forEach(function(c) {
    if (c.meta > 0 && c.realizado >= c.meta) {
      var chaveTipo = 'AUDIENCIA_META_' + normalizarChave(c.tipo).toUpperCase();
      if (!_avisoEncerramentoJaEnviado(cellNome, chaveTipo, turma)) {
        try {
          enviarEmailMetaAudienciaCumprida(email, nomeEstagiario, c.tipo, c.meta);
          _marcarAvisoEncerramentoEnviado(cellNome, chaveTipo, turma);
        } catch (e) {
          erros.push(e.message);
        }
      }
    }
  });

  var todasCumpridas = lista.length > 0 && lista.every(function(c) { return c.meta > 0 && c.realizado >= c.meta; });
  if (todasCumpridas) {
    var chaveTodas = 'AUDIENCIA_TODAS_METAS';
    if (!_avisoEncerramentoJaEnviado(cellNome, chaveTodas, turma)) {
      try {
        enviarEmailTodasMetasAudienciaCumpridas(email, nomeEstagiario);
        _marcarAvisoEncerramentoEnviado(cellNome, chaveTodas, turma);
      } catch (e) {
        erros.push(e.message);
      }
    }
  }

  return erros.length ? erros.join(' | ') : null;
}

// --- A-6: consolidado de pendencias de audiencias para Thales ---
// Disparado pelo mesmo gatilho da Mensagem 4 (ver verificarEncerramentoEstagioAutomatico
// mais abaixo), agora UMA VEZ POR TURMA (27/07/2026 — antes era um unico
// e-mail para todo o periodo, o que misturava antecipado e regular do mesmo
// semestre civil). Um e-mail para Thales por turma, restrito aos
// estagiarios ativos daquela turma que ainda nao fecharam alguma meta de
// audiencia e o quanto falta em cada tipo. Nao envia nada se ninguem daquela
// turma tiver pendencia.
function montarEmailConsolidadoPendenciasAudiencias(pendencias) {
  var linhas = [];
  pendencias.forEach(function(p) {
    p.faltantes.forEach(function(f) {
      linhas.push([p.nome, f.tipo, f.realizado + '/' + f.meta, f.faltante]);
    });
  });

  var html = '<p style="font-family:Arial,sans-serif; font-size:14px;">'
    + 'Estagiários ativos com metas de audiências ainda não cumpridas:</p>'
    + '<table border="1" cellpadding="8" cellspacing="0" '
    + 'style="border-collapse:collapse; font-family:Arial,sans-serif; '
    + 'font-size:13px; min-width:500px;">'
    + '<thead>'
    + '<tr style="background:#3D6A61; color:#ffffff;">'
    + '<th style="text-align:left; padding:10px 12px;">Estagiário(a)</th>'
    + '<th style="text-align:left; padding:10px 12px;">Tipo</th>'
    + '<th style="text-align:left; padding:10px 12px;">Realizado/Meta</th>'
    + '<th style="text-align:left; padding:10px 12px;">Faltam</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody>';

  for (var i = 0; i < linhas.length; i++) {
    var bgRow = (i % 2 === 0) ? '#ffffff' : '#f4f8f6';
    html += '<tr style="background:' + bgRow + ';">'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linhas[i][0]) + '</td>'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linhas[i][1]) + '</td>'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linhas[i][2]) + '</td>'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linhas[i][3]) + '</td>'
      + '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

// turma: codigo da turma (ex. "2026.02-A") — passado explicitamente (em vez
// de reaproveitar e.turma de cada estagiario) porque contarAudienciasPorTipo
// espera o FILTRO de turma, nao a turma do proprio registro (turmaCasaComFiltro
// trata um valor "AAAA.SS" sem sufixo como semestre inteiro — passar e.turma
// aqui garante casamento exato com a turma sendo processada).
// estagiariosDaTurma: ja pre-filtrados pelo chamador (ver
// verificarEncerramentoEstagioAutomatico) para conter somente os alunos
// ativos daquela turma.
function enviarConsolidadoPendenciasAudiencias(turma, estagiariosDaTurma) {
  var parametros = lerParametrosAudiencias(); // AudienciasEstagiario.js
  var audienciasTodas = getTodasAudienciasEstagiario(); // AudienciasEstagiario.js

  var pendencias = [];
  (estagiariosDaTurma || []).forEach(function(e) {
    var contagens = contarAudienciasPorTipo(e.nome, turma, audienciasTodas, parametros);
    var faltantes = contagens.filter(function(c) { return c.meta > 0 && c.faltante > 0; });
    if (faltantes.length) pendencias.push({ nome: e.nome, faltantes: faltantes });
  });

  if (!pendencias.length) return null;

  var html = montarEmailConsolidadoPendenciasAudiencias(pendencias);
  MailApp.sendEmail({
    to: CONFIG.EMAIL_AUTORIZADO,
    subject: 'Consolidado de pendências de audiências — turma ' + formatarRotuloTurma(turma),
    htmlBody: html
  });
  return null;
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
// (Panorama.js), filtradas pela TURMA do proprio estagiario (27/07/2026 —
// antes era pelo SEMESTRE; nao e producao acumulada do estagio inteiro).

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

// A-5: bloco de audiencias acrescentado a Mensagem 4 — mesmo formato visual
// da tabela de producao acima, com realizado/meta/faltante por tipo (ver
// contarAudienciasPorTipo, AudienciasEstagiario.js). Nao gera nenhuma tabela
// quando nao ha tipo cadastrado em bd!X:Z (contagens.audiencias vazio).
function montarTabelaAudienciasHtml(audiencias) {
  if (!audiencias || !audiencias.length) return '';

  var html = '<table border="1" cellpadding="8" cellspacing="0" '
    + 'style="border-collapse:collapse; font-family:Arial,sans-serif; '
    + 'font-size:13px; min-width:400px; margin-top:12px;">'
    + '<thead>'
    + '<tr style="background:#3D6A61; color:#ffffff;">'
    + '<th style="text-align:left; padding:10px 12px;">Audiências</th>'
    + '<th style="text-align:left; padding:10px 12px;">Realizado/Meta</th>'
    + '<th style="text-align:left; padding:10px 12px;">Faltam</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody>';

  for (var i = 0; i < audiencias.length; i++) {
    var a = audiencias[i];
    var bgRow = (i % 2 === 0) ? '#ffffff' : '#f4f8f6';
    html += '<tr style="background:' + bgRow + ';">'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(a.tipo) + '</td>'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(a.realizado + '/' + a.meta) + '</td>'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(a.faltante) + '</td>'
      + '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

// Texto fixo definido por Thales. So os campos entre {} sao substituidos —
// mesma convencao das demais mensagens deste arquivo. O campo que antes
// mostrava o SEMESTRE agora mostra o rotulo legivel da TURMA (27/07/2026 —
// ver formatarRotuloTurma, Turma.js), ja que a producao contada abaixo e a
// da turma do aluno, nao do semestre civil inteiro.
function montarEmailProducaoEstagio(nomeAluno, dataFinalizacaoFormatada, turma, contagens) {
  var html = '<p style="font-family:Arial,sans-serif; font-size:14px;">'
    + primeiroNome(nomeAluno) + ', faltam 15 dias para o encerramento do seu período de estágio (' + dataFinalizacaoFormatada + ').</p>'
    + '<p style="font-family:Arial,sans-serif; font-size:14px;">'
    + 'Para que você tenha uma visão clara do seu desempenho neste período (' + formatarRotuloTurma(turma) + '), segue um resumo da sua produção:</p>'
    + montarTabelaProducaoHtml(contagens)
    + montarTabelaAudienciasHtml(contagens.audiencias)
    + '<p style="font-family:Arial,sans-serif; font-size:14px; margin-top:16px;">'
    + 'Fico à disposição caso queira conversar sobre esses números ou sobre o que ainda pode ser feito até o fim do período. Seguimos juntos até a reta final. 🙂</p>';

  return {
    assunto: 'Seu desempenho no estágio — resumo de produção',
    html: html
  };
}

// estagiario: { nome, email, turma, dataFim } (ver getTodosEstagiariosCompletos,
// Panorama.js/Turma.js). dataFim substitui a antiga leitura de bd!P2
// (27/07/2026 — ver secao 3 do documento de migracao de TURMA).
function enviarEmailProducaoEstagio(estagiario) {
  var contagens = getContagemProducaoEstagiario(estagiario.nome, estagiario.turma);
  var email = montarEmailProducaoEstagio(estagiario.nome, formatarData(estagiario.dataFim), estagiario.turma, contagens);

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

// estagiario: { nome, email, dataFim } (ver getTodosEstagiariosCompletos,
// Panorama.js/Turma.js). dataFim substitui a antiga leitura de bd!P2
// (27/07/2026).
function enviarMensagemEncerramento(estagiario) {
  var cursoId = obterIdCursoClassroom();
  var userId = obterUserIdDoAluno(cursoId, estagiario.email);

  var texto = montarMensagemEncerramento(estagiario.nome, formatarData(estagiario.dataFim));
  var assunto = 'Última semana de estágio — fluxo de encerramento';

  enviarMensagemDuploCanal(cursoId, userId, estagiario.email, assunto, texto);
}

// --- Gatilho diario de encerramento de estagio (por DATA_FIM, por aluno) ---
// Ate 27/07/2026 este gatilho lia uma unica celula (bd!P2,
// DATA_FINALIZACAO_ESTAGIO) compartilhada por TODOS os estagiarios ativos.
// Com duas turmas por semestre (antecipado e regular — ver Turma.js) essa
// celula unica deixou de fazer sentido: a turma antecipada de julho encerra
// em 31/07 e a regular do mesmo semestre civil encerra em dezembro. bd!P2
// foi aposentada (CONFIG.BD_CELL.DATA_FINALIZACAO_ESTAGIO removida); o
// encerramento agora e calculado individualmente contra DATA_FIM
// (estagiarios!L) de cada aluno.
//
// A cada execucao diaria (configurarGatilhoEncerramentoEstagio):
//   1. Guarda obrigatoria (secao 3.3 do documento de migracao de TURMA):
//      alerta o coordenador se algum aluno ativo estiver sem DATA_FIM
//      preenchida — ver _alertarEstagiariosSemDataFim. Sem essa guarda, o
//      esquecimento seria silencioso (nao ha ponto de cadastro no codigo,
//      as linhas de estagiarios sao criadas a mao na planilha).
//   2. Mensagens 4/5: por aluno com DATA_FIM valida, compara hoje com o
//      proprio DATA_FIM e dispara quando faltam DIAS_AVISO_PRODUCAO ou
//      DIAS_AVISO_FLUXO dias corridos — guarda de duplicidade na nota da
//      celula NOME (coluna B), agora chaveada por TURMA em vez de SEMESTRE
//      (um aluno pode ter uma linha por turma dentro do mesmo semestre).
//   3. A-6: consolidado de pendencias de audiencias, uma vez por TURMA (nao
//      mais um unico e-mail para todo o periodo), 15 dias antes do DATA_FIM
//      daquela turma, restrito aos alunos daquela turma.

function _diasCorridosAte(dataAlvo) {
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  var alvo = new Date(dataAlvo);
  alvo.setHours(0, 0, 0, 0);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

function _dataFimValida(valor) {
  return valor instanceof Date && !isNaN(valor.getTime());
}

function _avisoEncerramentoJaEnviado(cellNome, chave, turma) {
  var nota = String(cellNome.getNote() || '');
  return nota.indexOf(chave + ': ' + turma) !== -1;
}

function _marcarAvisoEncerramentoEnviado(cellNome, chave, turma) {
  var notaAtual = String(cellNome.getNote() || '');
  var novaLinha = chave + ': ' + turma;
  cellNome.setNote(notaAtual ? notaAtual + '\n' + novaLinha : novaLinha);
}

// Guarda de duplicidade da A-6, uma vez por TURMA (27/07/2026). Como esse
// aviso e um unico e-mail agregado por turma (nao ha uma linha de
// estagiario individual para gravar a nota), o ancoradouro escolhido e a
// nota da propria celula bd!AE2 (CONFIG.BD_CELL.CONSOLIDADO_AUDIENCIAS_TURMA,
// celula reservada exclusivamente para este fim — ver Config.js), que
// acumula uma linha por turma+data-fim ja avisada, mesma tecnica de
// _avisoEncerramentoJaEnviado/_marcarAvisoEncerramentoEnviado acima. A
// chave inclui a DATA_FIM formatada da turma — se ela mudar (ex.:
// prorrogacao), o aviso volta a disparar normalmente.
function _consolidadoAudienciasJaEnviado(turma, dataFimFormatada) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) return false;
  var nota = String(aba.getRange(CONFIG.BD_CELL.CONSOLIDADO_AUDIENCIAS_TURMA).getNote() || '');
  return nota.indexOf('CONSOLIDADO_AUDIENCIAS_' + turma + ': ' + dataFimFormatada) !== -1;
}

function _marcarConsolidadoAudienciasEnviado(turma, dataFimFormatada) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) return;
  var cell = aba.getRange(CONFIG.BD_CELL.CONSOLIDADO_AUDIENCIAS_TURMA);
  var notaAtual = String(cell.getNote() || '');
  var novaLinha = 'CONSOLIDADO_AUDIENCIAS_' + turma + ': ' + dataFimFormatada;
  cell.setNote(notaAtual ? notaAtual + '\n' + novaLinha : novaLinha);
}

// Guarda obrigatoria (secao 3.3): sem DATA_FIM, as Mensagens 4/5 e a A-6
// nunca disparam para o aluno/turma afetado, sem erro, sem log, sem sintoma
// ate o fim do semestre. Reaproveita o mesmo gatilho e a mesma infraestrutura
// de e-mail ja existentes (decisao de Thales — nao criar gatilho novo).
function _alertarEstagiariosSemDataFim(estagiariosAtivos) {
  var semDataFim = (estagiariosAtivos || []).filter(function(e) { return !_dataFimValida(e.dataFim); });
  if (!semDataFim.length) return;

  var linhas = semDataFim.map(function(e) {
    return '- ' + e.nome + ' (' + (e.turma || 'turma não derivada — DATA_INICIO também vazia') + ')';
  });

  var corpo = 'Os estagiários abaixo estão ativos (FINALIZADO vazio) mas sem DATA_FIM preenchida na aba "estagiarios".\n\n'
    + 'Sem essa data, as Mensagens 4 e 5 (resumo de produção e fluxo de encerramento) e o consolidado de '
    + 'pendências de audiências (A-6) nunca serão disparados para eles:\n\n'
    + linhas.join('\n')
    + '\n\nPreencha DATA_FIM na linha de cada um para que o fluxo automático volte a funcionar.';

  try {
    MailApp.sendEmail({
      to: CONFIG.EMAIL_AUTORIZADO,
      subject: 'Alerta: estagiário(s) sem DATA_FIM cadastrada',
      body: corpo
    });
  } catch (e) {
    Logger.log('Erro ao enviar alerta de DATA_FIM ausente: ' + e.message);
  }
}

function verificarEncerramentoEstagioAutomatico() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaEstagiarios = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!abaEstagiarios) return;

  var estagiariosAtivos = getTodosEstagiariosCompletos().filter(function(e) { return !e.finalizado && e.email; });

  _alertarEstagiariosSemDataFim(estagiariosAtivos);

  var comDataFim = estagiariosAtivos.filter(function(e) { return _dataFimValida(e.dataFim); });

  // --- Mensagens 4/5: por aluno, contra o proprio DATA_FIM ---
  comDataFim.forEach(function(estagiario) {
    var diasRestantes = _diasCorridosAte(estagiario.dataFim);
    var ehDiaAvisoProducao = diasRestantes === CONFIG.ENCERRAMENTO_ESTAGIO.DIAS_AVISO_PRODUCAO;
    var ehDiaAvisoFluxo = diasRestantes === CONFIG.ENCERRAMENTO_ESTAGIO.DIAS_AVISO_FLUXO;
    if (!ehDiaAvisoProducao && !ehDiaAvisoFluxo) return;

    // Localiza a linha do estagiario na aba (para gravar a nota de rastreio).
    var linha = _linhaEstagiarioPorId(abaEstagiarios, estagiario.id);
    if (!linha) return;
    var cellNome = abaEstagiarios.getRange(linha, CONFIG.ESTAGIARIOS_COL.NOME + 1);

    try {
      if (ehDiaAvisoProducao && !_avisoEncerramentoJaEnviado(cellNome, 'MSG_PRODUCAO_ENVIADA', estagiario.turma)) {
        enviarEmailProducaoEstagio(estagiario);
        _marcarAvisoEncerramentoEnviado(cellNome, 'MSG_PRODUCAO_ENVIADA', estagiario.turma);
      }
      if (ehDiaAvisoFluxo && !_avisoEncerramentoJaEnviado(cellNome, 'MSG_ENCERRAMENTO_ENVIADA', estagiario.turma)) {
        enviarMensagemEncerramento(estagiario);
        _marcarAvisoEncerramentoEnviado(cellNome, 'MSG_ENCERRAMENTO_ENVIADA', estagiario.turma);
      }
    } catch (e) {
      // Erro isolado por estagiario — nao interrompe os demais. Sem lista de
      // retorno porque este handler roda dentro de um gatilho automatico
      // (sem usuario para ver o resultado); erros ficam no log de execucoes
      // do Apps Script.
      Logger.log('Erro ao processar encerramento de estagio para ' + estagiario.nome + ': ' + e.message);
    }
  });

  // --- A-6: consolidado de pendencias de audiencias, uma vez por TURMA ---
  // Agrupa os alunos ativos com DATA_FIM valida por turma. Assume-se que
  // todos os alunos de uma mesma turma compartilham a mesma DATA_FIM (e uma
  // data de coorte, nao individual) — usa-se a data do primeiro aluno
  // encontrado como representante da turma.
  var estagiariosPorTurma = {};
  comDataFim.forEach(function(e) {
    if (!e.turma) return;
    if (!estagiariosPorTurma[e.turma]) estagiariosPorTurma[e.turma] = [];
    estagiariosPorTurma[e.turma].push(e);
  });

  Object.keys(estagiariosPorTurma).forEach(function(turma) {
    var estagiariosDaTurma = estagiariosPorTurma[turma];
    var dataFimTurma = estagiariosDaTurma[0].dataFim;
    var diasRestantes = _diasCorridosAte(dataFimTurma);
    if (diasRestantes !== CONFIG.ENCERRAMENTO_ESTAGIO.DIAS_AVISO_PRODUCAO) return;

    var dataFimFormatada = formatarData(dataFimTurma);
    if (_consolidadoAudienciasJaEnviado(turma, dataFimFormatada)) return;

    try {
      enviarConsolidadoPendenciasAudiencias(turma, estagiariosDaTurma);
      _marcarConsolidadoAudienciasEnviado(turma, dataFimFormatada);
    } catch (e) {
      Logger.log('Erro ao enviar consolidado de pendencias de audiencias da turma ' + turma + ': ' + e.message);
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
      var contagens = getContagemProducaoEstagiario(estagiario.nome, estagiario.turma);
      var email = montarEmailProducaoEstagio(estagiario.nome, formatarData(estagiario.dataFim), estagiario.turma, contagens);

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