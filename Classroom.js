// Classroom.gs
// Responsabilidade: toda a comunicacao com a API do Google Classroom
// (servico avancado "Classroom"). Nenhum outro arquivo deve chamar
// Classroom.Courses.* diretamente — tudo passa por aqui.

// --- Configuracao ---

function obterIdCursoClassroom() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) throw new Error('Aba bd nao encontrada.');

  var id = String(aba.getRange(CONFIG.BD_CELL.ID_CLASS).getValue() || '').trim();
  if (!id) throw new Error('ID do curso do Classroom nao configurado em bd!' + CONFIG.BD_CELL.ID_CLASS + '.');

  // IDs de curso do Classroom sao sempre puramente numericos. Se vier letras,
  // muito provavelmente foi copiado o trecho da URL (que e o ID codificado em
  // base64), e nao o ID real usado pela API — erro comum e dificil de notar.
  if (!/^\d+$/.test(id)) {
    throw new Error(
      'ID do curso em bd!' + CONFIG.BD_CELL.ID_CLASS + ' parece invalido ("' + id + '"). ' +
      'IDs de curso do Classroom sao sempre numericos. Se voce copiou da URL da turma ' +
      '(classroom.google.com/c/XXXXX), esse trecho XXXXX esta codificado em base64 — ' +
      'decodifique-o para obter o ID numerico real antes de colar em bd!' + CONFIG.BD_CELL.ID_CLASS + '.'
    );
  }

  return id;
}

// --- Montagem do conteudo da atividade ---

function montarTituloAtividade(reg) {
  return reg.id + ' - ' + reg.assistido + ' - ' + reg.especie;
}

// Texto fixo definido por Thales. So os campos entre {} sao substituidos —
// o restante do texto nunca deve ser alterado.
function montarDescricaoAtividade(reg, subespecie) {
  var linhas = [
    '📝Atividade de Prática Jurídica',
    'Processo: ' + reg.processo,
    'Vara: ' + reg.vara,
    'Assistido(a): ' + reg.assistido,
    'Diligência: ' + reg.diligencia + ' (' + reg.especie + ')',
    'Peça ' + subespecie,
    '',
    'Enviem a atividade em formato WORD (.doc, .docx) ou digitem diretamente na atividade.',
    'Não enviem em PDF, a não ser os anexos (documentos, memórias de cálculo etc.).',
    'Para acessar o processo, procure pelo número nesta pasta:',
    CONFIG.CLASSROOM.PASTA_DRIVE_URL,
    'Esta atividade foi criada automaticamente pelo sistema.'
  ];
  return linhas.join('\n');
}

function converterDataParaClassroom(data) {
  var d = (data instanceof Date) ? data : new Date(data);
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

// --- Conversao inversa (API Classroom -> Date da planilha) ---
// Usadas para preencher DI CLASS/DF CLASS com as datas que REALMENTE ficaram
// gravadas na atividade do Classroom (creationTime/dueDate retornados pela
// propria API), em vez de reaproveitar DI/DF/"hoje" da planilha — pedido
// explicito de Thales, pois os dois podem divergir (fuso, atraso no envio etc.).

// courseWork.creationTime vem em RFC3339 UTC (ex. "2026-07-13T14:23:01.123Z");
// new Date() do V8 (runtime do Apps Script) interpreta isso corretamente.
function converterCreationTimeClassroomParaData(creationTime) {
  if (!creationTime) return null;
  var d = new Date(creationTime);
  return isNaN(d.getTime()) ? null : d;
}

// courseWork.dueDate/dueTime vem como componentes separados (ano/mes/dia,
// hora/min/seg) SEM fuso horario — mesma suposicao ja usada em
// converterDataParaClassroom (ida): os componentes sao montados como horario
// local do script, que deve coincidir com o fuso da planilha (CONFIG.TIMEZONE).
function converterDueDateClassroomParaData(dueDate, dueTime) {
  if (!dueDate) return null;
  var horas = (dueTime && dueTime.hours) || 0;
  var minutos = (dueTime && dueTime.minutes) || 0;
  var segundos = (dueTime && dueTime.seconds) || 0;
  return new Date(dueDate.year, dueDate.month - 1, dueDate.day, horas, minutos, segundos);
}

// Busca uma coursework existente diretamente pelo ID — usada pelo backfill de
// DI CLASS/DF CLASS em registros antigos (ver provisorio.js), que precisa
// reler creationTime/dueDate de atividades ja criadas anteriormente.
function obterCourseWork(cursoId, courseworkId) {
  return Classroom.Courses.CourseWork.get(cursoId, courseworkId);
}

// Formata "DD/MM/AAAA às HH:MM" para as mensagens automaticas gravadas em OBS.
function formatarDataHoraObs(data) {
  var dataStr = Utilities.formatDate(data, CONFIG.TIMEZONE, 'dd/MM/yyyy');
  var horaStr = Utilities.formatDate(data, CONFIG.TIMEZONE, 'HH:mm');
  return dataStr + ' às ' + horaStr;
}

// --- Topico da atividade (Simples / Complexa) ---

// O Classroom exige que o topico ja exista na turma antes de ser usado em
// uma coursework. Procura um topico com esse nome (normalizado); se nao
// existir, cria. Retorna o topicId.
function obterOuCriarTopicoId(cursoId, nomeTopico) {
  var chaveAlvo = normalizarChave(nomeTopico);

  var resposta = Classroom.Courses.Topics.list(cursoId);
  var topicos = resposta.topic || [];
  for (var i = 0; i < topicos.length; i++) {
    if (normalizarChave(topicos[i].name) === chaveAlvo) return topicos[i].topicId;
  }

  var criado = Classroom.Courses.Topics.create({ name: nomeTopico }, cursoId);
  return criado.topicId;
}

// --- Localizacao do aluno no curso ---

// O Classroom aceita o e-mail do usuario como identificador (userId alias)
// para a maioria dos endpoints de "students". Retorna o userId numerico
// necessario para individualStudentsOptions.studentIds.
function obterUserIdDoAluno(cursoId, email) {
  if (!email) throw new Error('Estagiario sem e-mail cadastrado.');
  try {
    var aluno = Classroom.Courses.Students.get(cursoId, email);
    return aluno.userId;
  } catch (e) {
    // Nao mascarar o erro original: um curso invalido, permissao ausente ou
    // aluno realmente fora da turma geram mensagens diferentes na API, e
    // e importante ve-las para diagnosticar corretamente.
    throw new Error('Falha ao localizar o aluno (' + email + ') na turma (curso ' + cursoId + '): ' + e.message);
  }
}

// --- Criacao da atividade ---

// Cria uma coursework individual no Classroom para uma unica linha da aba
// diligencias. Retorna o alternateLink em caso de sucesso ou lanca excecao
// com uma mensagem legivel em caso de erro.
function criarCourseWorkParaRegistro(reg) {
  var cursoId = obterIdCursoClassroom();
  var subespecie = calcularSubespecie(reg.especie);
  var emailAluno = buscarEmailEstagiario(reg.estagiario);

  if (!emailAluno) {
    throw new Error('Estagiario "' + reg.estagiario + '" nao encontrado na aba estagiarios ou sem e-mail cadastrado.');
  }

  var userId = obterUserIdDoAluno(cursoId, emailAluno);
  var topicId = obterOuCriarTopicoId(cursoId, subespecie);

  // Decisao de Thales (corrigida em 19/07/2026): so agenda a publicacao
  // (state DRAFT + scheduledTime) quando o ENVIO ocorrer fora do horario
  // comercial, em fim de semana ou feriado (ver dentroDoHorarioComercial,
  // Agenda.js, que ja considera os feriados de bd!C2:C). Se o envio ocorrer
  // dentro do horario comercial num dia util, publica imediatamente — nao
  // ha adiamento. IMPORTANTE: criado.alternateLink so vem preenchido quando
  // state = PUBLISHED — quando agendada, a celula LINK fica vazia ate a
  // publicacao real acontecer e e preenchida depois pelo backfill em
  // verificarEntregasClassroom.
  var agendarPublicacao = !dentroDoHorarioComercial();

  var courseWork = {
    title: montarTituloAtividade(reg),
    description: montarDescricaoAtividade(reg, subespecie),
    workType: 'ASSIGNMENT',
    state: agendarPublicacao ? 'DRAFT' : 'PUBLISHED',
    // ASSUNCAO A CONFIRMAR: 100 pontos como maximo padrao, apenas para permitir
    // que a atividade seja avaliavel no Classroom (sem isso nao dava para notar).
    // Ajustar CONFIG.CLASSROOM.PONTUACAO_MAXIMA se Thales quiser outro valor.
    maxPoints: CONFIG.CLASSROOM.PONTUACAO_MAXIMA,
    topicId: topicId,
    assigneeMode: 'INDIVIDUAL_STUDENTS',
    individualStudentsOptions: {
      studentIds: [userId]
    }
  };

  if (agendarPublicacao) {
    courseWork.scheduledTime = calcularProximaPublicacaoClassroom(lerFeriados()).toISOString();
  }

  if (reg.dfRaw) {
    courseWork.dueDate = converterDataParaClassroom(reg.dfRaw);
    courseWork.dueTime = { hours: 23, minutes: 59, seconds: 0, nanos: 0 };
  }

  var criado = Classroom.Courses.CourseWork.create(courseWork, cursoId);
  return {
    link: criado.alternateLink,
    courseworkId: criado.id,
    diClass: converterCreationTimeClassroomParaData(criado.creationTime),
    dfClass: converterDueDateClassroomParaData(criado.dueDate, criado.dueTime)
  };
}

// --- Transferir Atividade (dropdown Gerenciar) ---

// Recria no Classroom a atividade de uma diligencia transferida (ver
// transferirDiligencia, Data.js): cria a nova coursework para o novo
// estagiario e SO ENTAO apaga a coursework antiga — nessa ordem, para nunca
// deixar o novo estagiario sem atividade caso a criacao falhe. So e chamada
// quando a diligencia original ja tinha sido enviada ao Classroom (CLASS
// = 'S'), ou seja, courseworkIdAntigo sempre existe quando isso e chamado.
// Lanca excecao se a CRIACAO da nova coursework falhar (nesse caso a antiga
// continua intacta, e o chamador decide o que fazer). Falha ao apagar a
// antiga NAO lanca excecao — a nova coursework ja existe, que e o que
// importa — mas fica registrada em resultado.avisoExclusao.
function recriarCourseWorkTransferencia(regNovo, courseworkIdAntigo) {
  var resultado = criarCourseWorkParaRegistro(regNovo);

  try {
    var cursoId = obterIdCursoClassroom();
    Classroom.Courses.CourseWork.delete(cursoId, courseworkIdAntigo);
  } catch (e) {
    resultado.avisoExclusao = 'A nova atividade foi criada, mas não foi possível apagar a antiga no Classroom: ' + e.message;
  }

  return resultado;
}

// === INICIAIS (Painel Aluno — "Criar Peticao Inicial") ===
// Diferente de Diligencias/Acompanhamentos, aqui a atividade e criada de
// forma IMEDIATA no momento do "Salvar" do modal (ver criarPedidoInicialAluno
// em Iniciais.js), nao em lote pelo botao "Enviar ao Classroom". O topico e
// sempre SUBESPECIE_VALORES.COMPLEXA ("Complexa"), fixo, por decisao de
// Thales — independente da ESPECIE escolhida no modal.

function montarTituloAtividadeInicial(reg) {
  return 'INICIAL - ' + reg.id + ' - ' + reg.assistido;
}

// Texto fixo definido por Thales. So os campos entre {} sao substituidos —
// o restante do texto nunca deve ser alterado (mesma convencao de
// montarDescricaoAtividade). reg.estagiario e o nome completo do(a)
// estagiario(a) (resolvido a partir do e-mail em criarPedidoInicialAluno,
// ver Iniciais.js) — primeiroNome() (Mensagens.js) extrai o vocativo.
function montarDescricaoAtividadeInicial(reg) {
  var linhas = [
    'Prezado(a) ' + primeiroNome(reg.estagiario) + ',',
    '',
    'Faça o upload da Petição Inicial e de todos os documentos necessários nesta atividade.',
    '',
    'Atenção:',
    '• Prazo para envio: ' + formatarData(reg.dfRaw) + ';',
    '• A petição deve ser redigida no Papel Timbrado (Template) disponibilizado aqui no Classroom;',
    '• Envie a petição em formato WORD (.doc ou .docx); demais documentos podem ser enviados em PDF.',
    '',
    'Em caso de dúvidas, pode falar comigo. 🫱🏽‍🫲🏽',
    '',
    'Esta atividade foi criada automaticamente pelo sistema. 🤖'
  ];
  return linhas.join('\n');
}

// Cria uma coursework individual no Classroom para uma Peticao Inicial
// recem-criada na aba iniciais. reg.dfRaw (DF = hoje + 5 dias uteis, ver
// criarPedidoInicialAluno em Iniciais.js) define o prazo de entrega da
// atividade, igual ao que Diligencias/Acompanhamentos ja fazem. Retorna
// { link, courseworkId } em caso de sucesso ou lanca excecao com mensagem
// legivel em caso de erro — a chamada (Iniciais.js) decide o que fazer com o
// pedido ja salvo se isso falhar.
function criarCourseWorkParaInicial(reg) {
  var cursoId = obterIdCursoClassroom();

  if (!reg.email) {
    throw new Error('Registro "' + reg.id + '" sem e-mail de estagiario(a) informado.');
  }

  var userId = obterUserIdDoAluno(cursoId, reg.email);
  var topicId = obterOuCriarTopicoId(cursoId, CONFIG.SUBESPECIE_VALORES.COMPLEXA);

  var courseWork = {
    title: montarTituloAtividadeInicial(reg),
    description: montarDescricaoAtividadeInicial(reg),
    workType: 'ASSIGNMENT',
    state: 'PUBLISHED',
    maxPoints: CONFIG.CLASSROOM.PONTUACAO_MAXIMA,
    topicId: topicId,
    assigneeMode: 'INDIVIDUAL_STUDENTS',
    individualStudentsOptions: {
      studentIds: [userId]
    }
  };

  if (reg.dfRaw) {
    courseWork.dueDate = converterDataParaClassroom(reg.dfRaw);
    courseWork.dueTime = { hours: 23, minutes: 59, seconds: 0, nanos: 0 };
  }

  var criado = Classroom.Courses.CourseWork.create(courseWork, cursoId);
  return {
    link: criado.alternateLink,
    courseworkId: criado.id,
    diClass: converterCreationTimeClassroomParaData(criado.creationTime),
    dfClass: converterDueDateClassroomParaData(criado.dueDate, criado.dueTime)
  };
}

// === INICIAIS ===
// Regra de negocio confirmada por Thales (progressao automatica de STATUS,
// mesmo mecanismo de Diligencias/Acompanhamentos), relativa a
// CONFIG.CLASSROOM.PONTUACAO_MAXIMA (nota maxima, hoje 100):
//   aluno ainda nao entregou            -> nao mexe no STATUS (fica Encaminhado)
//   aluno entregou, sem nota ainda      -> STATUS = "Entregue"
//   nota lancada >= 50% da nota maxima  -> STATUS = "Ok" + OBS "Atividade validada"
//   nota lancada = 0                    -> STATUS = "Cancelada" + OBS "Atividade cancelada"
//   nota lancada > 0 e < 50%            -> STATUS = "Devolvida"
// Cancelada e um status final (ver CONFIG.STATUS_FINAIS): a partir da, a
// linha nunca mais e reavaliada por esta verificacao (mesmo que o aluno
// reenvie depois), some do Painel Aluno e para de contar na producao do
// Panorama — mesmo tratamento de uma diligencia cancelada manualmente.
// "Protocolado" nunca e tocado por esta verificacao: vem exclusivamente do
// cruzamento com a aba protocolos (ver getTodasIniciais em Iniciais.js).
//
// Retorna { status, obsMotivo } — obsMotivo ('validada' | 'cancelada') so
// existe quando ha um texto padrao para o chamador gravar em OBS.
function classificarStatusPelaSubmissionInicial(submission) {
  if (!submission) return null;

  if (submission.state === 'TURNED_IN') {
    return { status: 'Entregue' };
  }

  if (submission.state === 'RETURNED') {
    var notaAtribuida = submission.assignedGrade;
    var temNota = (notaAtribuida !== undefined && notaAtribuida !== null);
    if (!temNota) return null; // devolvido sem nota lancada — nao deveria ocorrer, nao mexe

    var notaMaxima = CONFIG.CLASSROOM.PONTUACAO_MAXIMA;
    if (notaAtribuida >= notaMaxima * 0.5) return { status: 'Ok', obsMotivo: 'validada' };
    if (notaAtribuida === 0) return { status: 'Cancelada', obsMotivo: 'cancelada' };
    return { status: 'Devolvida' };
  }

  return null; // NEW, CREATED, RECLAIMED_BY_STUDENT -> aluno ainda nao entregou (de novo)
}

// --- Notificacao ao aluno (nota >= 50% confirmada + STATUS "Ok" na planilha) ---
// Quando o STATUS de uma linha (seja pela progressao automatica acima, seja
// por edicao manual de Thales no painel — ver salvarEdicaoInicial em
// Iniciais.js) fica "Ok", o aluno recebe uma mensagem individual no mural
// (ver montarMensagemInicialOk / enviarMensagemIndividualMural em
// Mensagens.js) com o passo a passo do que fazer com a peticao fisica. A
// nota e sempre reconferida diretamente no Classroom antes de enviar (nunca
// confiar apenas no STATUS da planilha) — assim, se Thales marcar "Ok" na
// planilha antes de lancar a nota no Classroom, a mensagem so sai quando a
// nota minima (50% de CONFIG.CLASSROOM.PONTUACAO_MAXIMA) realmente existir.
//
// Para nao reenviar a mesma mensagem a cada verificacao, o envio e marcado
// gravando uma nota (comentario, invisivel na planilha) na propria celula de
// STATUS da linha — mesma tecnica ja usada para guardar o ID da coursework
// na celula LINK.
function marcarNotificacaoInicialEnviada(aba, linha) {
  var agora = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm:ss');
  aba.getRange(linha, CONFIG.INICIAIS_COL.STATUS + 1).setNote('MSG_OK_ENVIADA: ' + agora);
}

function notificacaoInicialJaEnviada(aba, linha) {
  var nota = aba.getRange(linha, CONFIG.INICIAIS_COL.STATUS + 1).getNote();
  return String(nota || '').indexOf('MSG_OK_ENVIADA') !== -1;
}

// Varre iniciais com STATUS fora de Protocolado/Cancelada, consulta a
// entrega/nota real no Classroom e atualiza o STATUS quando necessario
// (classificarStatusPelaSubmissionInicial acima). Em seguida, se o STATUS
// (recem-atualizado ou ja existente) for "Ok" e a linha ainda nao tiver sido
// notificada, reconfere a nota (RETURNED + assignedGrade >= 50% da nota
// maxima) e envia a mensagem individual ao aluno. Chamada pelo botao
// "Verificar Entregas" e pelo gatilho automatico (ver verificarTodasEntregasClassroom).
function verificarEntregasIniciais() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_INICIAIS);
  if (!aba) return { sucesso: false, erro: 'Aba iniciais nao encontrada.' };

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { sucesso: true, atualizados: [], notificados: [], erros: [] };

  var cursoId;
  try {
    cursoId = obterIdCursoClassroom();
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_INICIAIS).getValues();
  var atualizados = [];
  var notificados = [];
  var erros = [];
  var agora = new Date();

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var linha = i + 2;

    if (!row[CONFIG.INICIAIS_COL.ID] && !row[CONFIG.INICIAIS_COL.ASSISTIDO]) continue;

    var statusAtual = String(row[CONFIG.INICIAIS_COL.STATUS] || '').trim();
    var statusNorm = normalizarChave(statusAtual);
    if (statusNorm === 'protocolado' || statusNorm === 'cancelada') continue; // nunca mexidos por aqui

    try {
      var courseworkId = String(aba.getRange(linha, CONFIG.INICIAIS_COL.LINK + 1).getNote() || '').trim();
      if (!courseworkId) {
        throw new Error('ID da coursework nao encontrado (nota da celula LINK ausente).');
      }

      var email = String(row[CONFIG.INICIAIS_COL.EMAIL] || '').trim();
      if (!email) {
        throw new Error('Registro sem e-mail de estagiario(a) cadastrado na linha.');
      }

      var userId = obterUserIdDoAluno(cursoId, email);
      var submission = obterSubmissionDoAluno(cursoId, courseworkId, userId);

      if (statusNorm !== 'ok') {
        var resultado = classificarStatusPelaSubmissionInicial(submission);
        if (resultado && normalizarChave(resultado.status) !== statusNorm) {
          aba.getRange(linha, CONFIG.INICIAIS_COL.STATUS + 1).setValue(resultado.status);
          aba.getRange(linha, CONFIG.INICIAIS_COL.ALTERADO_EM + 1).setValue(agora);
          if (resultado.obsMotivo === 'validada') {
            aba.getRange(linha, CONFIG.INICIAIS_COL.OBS + 1).setValue('Atividade validada em ' + formatarDataHoraObs(agora));
          } else if (resultado.obsMotivo === 'cancelada') {
            aba.getRange(linha, CONFIG.INICIAIS_COL.OBS + 1).setValue('Atividade cancelada em ' + formatarDataHoraObs(agora));
          }
          atualizados.push({ linha: linha, id: row[CONFIG.INICIAIS_COL.ID], statusAnterior: statusAtual, statusNovo: resultado.status, origem: 'iniciais' });
          statusNorm = normalizarChave(resultado.status);
        }
      }

      if (statusNorm === 'ok' && !notificacaoInicialJaEnviada(aba, linha)) {
        var notaMinimaIniciais = CONFIG.CLASSROOM.PONTUACAO_MAXIMA * 0.5;
        var notaConfirmadaOk = submission && submission.state === 'RETURNED' &&
          submission.assignedGrade !== undefined && submission.assignedGrade !== null &&
          submission.assignedGrade >= notaMinimaIniciais;
        if (notaConfirmadaOk) {
          var nomeEstagiario = buscarNomeEstagiarioPorEmail(email) || email;
          var referenciaAtividade =
            String(row[CONFIG.INICIAIS_COL.ID] || '').trim() + ' - ' +
            String(row[CONFIG.INICIAIS_COL.ASSISTIDO] || '').trim() + ' - ' +
            String(row[CONFIG.INICIAIS_COL.ESPECIE] || '').trim();

          var texto = montarMensagemInicialOk(nomeEstagiario, referenciaAtividade);
          enviarMensagemIndividualMural(cursoId, userId, texto);
          marcarNotificacaoInicialEnviada(aba, linha);
          notificados.push({ linha: linha, id: row[CONFIG.INICIAIS_COL.ID] });
        }
      }
    } catch (e) {
      erros.push({ linha: linha, id: row[CONFIG.INICIAIS_COL.ID], erro: e.message, origem: 'iniciais' });
    }
  }

  return { sucesso: true, atualizados: atualizados, notificados: notificados, erros: erros };
}

// --- Leitura das linhas elegiveis (CLASS != "S") ---

function coletarLinhasElegiveisParaEnvio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues();
  var lista = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CONFIG.COL.ID] && !row[CONFIG.COL.PROCESSO]) continue;

    var jaEnviado = String(row[CONFIG.COL.CLASS] || '').trim().toUpperCase() === CONFIG.CLASS_ENVIADO;
    if (jaEnviado) continue;

    lista.push({
      _linha: i + 2,
      id: row[CONFIG.COL.ID],
      processo: row[CONFIG.COL.PROCESSO],
      assistido: row[CONFIG.COL.ASSISTIDO],
      diligencia: row[CONFIG.COL.DILIGENCIA],
      especie: row[CONFIG.COL.ESPECIE],
      vara: row[CONFIG.COL.VARA],
      estagiario: row[CONFIG.COL.ESTAGIARIO],
      dfRaw: row[CONFIG.COL.DF]
    });
  }
  return lista;
}

// --- Gatilho de edicao (onEdit) — marca CLASS quando STATUS vira "Ok" ---

// Edicao manual do STATUS diretamente na planilha (fora do modal do painel)
// para "Ok" tambem marca CLASS = "S" — mesma regra aplicada em
// salvarEdicaoDiligencia (Data.js) para o caminho do modal. Chamado a partir
// de onEdit() em Code.js.
function processarEdicaoClassStatusOk(e) {
  if (!e || !e.range) return;

  var range = e.range;
  var sheet = range.getSheet();
  if (!sheet || sheet.getName() !== CONFIG.SHEET_DILIGENCIAS) return;
  if (range.getNumRows() !== 1 || range.getNumColumns() !== 1) return;
  if (range.getColumn() !== CONFIG.COL.STATUS + 1) return;
  if (range.getRow() < 2) return;

  if (normalizarChave(range.getValue()) !== 'ok') return;

  sheet.getRange(range.getRow(), CONFIG.COL.CLASS + 1).setValue(CONFIG.CLASS_ENVIADO);
}

// --- Orquestracao (chamada pelo frontend via google.script.run) ---

// Varre toda a aba diligencias em busca de registros com CLASS != "S",
// cria a atividade individual no Classroom para cada um, e grava de volta
// LINK, CLASS = "S", DI = hoje e STATUS = "Encaminhado". Erros em uma linha
// nao interrompem o processamento das demais.
function enviarDiligenciasAoClassroom() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };

  var elegiveis;
  try {
    elegiveis = coletarLinhasElegiveisParaEnvio();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao ler diligencias: ' + e.message };
  }

  if (elegiveis.length === 0) {
    return { sucesso: true, enviados: [], erros: [], mensagem: 'Nenhuma diligencia pendente de envio ao Classroom.' };
  }

  var agora = new Date();
  var enviados = [];
  var erros = [];

  elegiveis.forEach(function(reg) {
    try {
      var resultado = criarCourseWorkParaRegistro(reg);
      var linkCelula = aba.getRange(reg._linha, CONFIG.COL.LINK + 1);

      linkCelula.setValue(resultado.link);
      // O ID bruto da coursework fica como nota (comentario) da celula LINK,
      // invisivel na planilha, para ser lido depois por "Verificar Entregas"
      // sem precisar de uma coluna extra.
      linkCelula.setNote(resultado.courseworkId);

      aba.getRange(reg._linha, CONFIG.COL.CLASS + 1).setValue(CONFIG.CLASS_ENVIADO);
      aba.getRange(reg._linha, CONFIG.COL.DI + 1).setValue(agora);
      aba.getRange(reg._linha, CONFIG.COL.STATUS + 1).setValue('Encaminhado');
      aba.getRange(reg._linha, CONFIG.COL.OBS + 1).setValue('Atividade criada e encaminhada ao aluno em ' + formatarDataHoraObs(agora));
      aba.getRange(reg._linha, CONFIG.COL.ALTERADO_EM + 1).setValue(agora);
      if (resultado.diClass) aba.getRange(reg._linha, CONFIG.COL.DI_CLASS + 1).setValue(resultado.diClass);
      if (resultado.dfClass) aba.getRange(reg._linha, CONFIG.COL.DF_CLASS + 1).setValue(resultado.dfClass);
      sincronizarLinhaParaGeral(reg._linha);

      enviados.push({ linha: reg._linha, id: reg.id, link: resultado.link });
    } catch (e) {
      erros.push({ linha: reg._linha, id: reg.id, erro: e.message });
    }
  });

  return { sucesso: true, enviados: enviados, erros: erros };
}

// --- Verificar Entregas ---
// Regra de negocio confirmada por Thales (fonte de verdade), com faixas
// relativas a CONFIG.CLASSROOM.PONTUACAO_MAXIMA (nota maxima, hoje 100):
//   aluno ainda nao entregou              -> nao mexe no STATUS (fica Encaminhado)
//   aluno entregou, sem nota ainda        -> STATUS = "Entregue"
//   nota lancada = nota maxima            -> STATUS = "Protocolado"
//   nota lancada >= 90% da nota maxima    -> STATUS = "Ok" + OBS "Acordo realizado pelo(a) estagiario(a)"
//   nota lancada >= 50% da nota maxima    -> STATUS = "Ok" + OBS "Atividade validada"
//   nota lancada = 0                      -> STATUS = "Cancelada" + OBS "Atividade cancelada"
//   nota lancada > 0 e < 50% da maxima    -> STATUS = "Devolvida"
// So a nota maxima cheia e considerada "Protocolada" agora — as faixas
// intermediarias (50%-89% e 90%-99%) viram "Ok", diferenciadas apenas pelo
// texto gravado em OBS. Cancelada e um status final (ver
// CONFIG.STATUS_FINAIS): a partir da, a linha nunca mais e reavaliada por
// esta verificacao (mesmo que o aluno reenvie depois), some do Painel Aluno
// e para de contar na producao do Panorama — mesmo tratamento de uma
// diligencia cancelada manualmente (ver transferirDiligencia em Data.js).
// O ciclo se repete: apos "Devolvida" o aluno pode reenviar, e uma nova
// verificacao classifica de novo.

// Le o ID bruto da coursework gravado como nota da celula LINK.
function obterCourseworkIdDaLinha(aba, linha) {
  var nota = aba.getRange(linha, CONFIG.COL.LINK + 1).getNote();
  return String(nota || '').trim();
}

// Retorna a submission (studentSubmissions) de um aluno especifico para uma
// coursework, ou null se nao encontrada.
function obterSubmissionDoAluno(cursoId, courseworkId, userId) {
  var resposta = Classroom.Courses.CourseWork.StudentSubmissions.list(
    cursoId, courseworkId, { userId: userId }
  );
  var submissions = resposta.studentSubmissions || [];
  return submissions.length > 0 ? submissions[0] : null;
}

// Classifica o novo STATUS a partir do estado da submission. Retorna null
// se nada deve mudar (ex.: aluno ainda nao entregou).
//
// IMPORTANTE: o campo assignedGrade do Classroom NAO e limpo automaticamente
// quando o aluno reenvia apos ser devolvido — ele fica com a nota antiga ate
// o professor avaliar de novo. Por isso o ESTADO da entrega (state) precisa
// ser checado ANTES da nota: TURNED_IN sempre significa "aguardando
// correcao" (mesmo que exista uma assignedGrade residual de uma tentativa
// anterior), e so em RETURNED (professor corrigiu e devolveu) a nota vale.
// Retorna { status, obsMotivo } — obsMotivo ('acordo' | 'validada' | 'cancelada')
// so existe quando ha um texto padrao para o chamador gravar em OBS.
function classificarStatusPelaSubmission(submission) {
  if (!submission) return null;

  if (submission.state === 'TURNED_IN') {
    return { status: 'Entregue' };
  }

  if (submission.state === 'RETURNED') {
    var notaAtribuida = submission.assignedGrade;
    var temNota = (notaAtribuida !== undefined && notaAtribuida !== null);
    if (!temNota) return null; // devolvido sem nota lancada — nao deveria ocorrer, nao mexe

    var notaMaxima = CONFIG.CLASSROOM.PONTUACAO_MAXIMA;
    if (notaAtribuida >= notaMaxima) return { status: 'Protocolado' };
    if (notaAtribuida >= notaMaxima * 0.9) return { status: 'Ok', obsMotivo: 'acordo' };
    if (notaAtribuida >= notaMaxima * 0.5) return { status: 'Ok', obsMotivo: 'validada' };
    if (notaAtribuida === 0) return { status: 'Cancelada', obsMotivo: 'cancelada' };
    return { status: 'Devolvida' };
  }

  return null; // NEW, CREATED, RECLAIMED_BY_STUDENT -> aluno ainda nao entregou (de novo)
}

// Varre diligencias com CLASS = "S" e STATUS fora dos finais (Ok/Protocolado/
// Cancelada), consulta a entrega/nota real no Classroom e atualiza o STATUS
// quando necessario. Chamada pelo botao "Verificar Entregas" e pelo gatilho
// automatico horario (dentro do horario comercial).
function verificarEntregasClassroom() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { sucesso: true, atualizados: [], erros: [] };

  var cursoId;
  try {
    cursoId = obterIdCursoClassroom();
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues();
  var atualizados = [];
  var erros = [];
  var agora = new Date();

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var linha = i + 2;

    if (!row[CONFIG.COL.ID] && !row[CONFIG.COL.PROCESSO]) continue;

    var classEnviado = String(row[CONFIG.COL.CLASS] || '').trim().toUpperCase() === CONFIG.CLASS_ENVIADO;
    if (!classEnviado) continue; // so verifica quem ja foi enviado ao Classroom

    var statusAtual = String(row[CONFIG.COL.STATUS] || '').trim();
    var statusNorm = normalizarChave(statusAtual);
    if (CONFIG.STATUS_FINAIS.indexOf(statusNorm) !== -1) continue; // Ok/Protocolado/Cancelada -> nao verifica mais

    try {
      var courseworkId = obterCourseworkIdDaLinha(aba, linha);
      if (!courseworkId) {
        throw new Error('ID da coursework nao encontrado (nota da celula LINK ausente).');
      }

      var emailAluno = buscarEmailEstagiario(row[CONFIG.COL.ESTAGIARIO]);
      if (!emailAluno) {
        throw new Error('Estagiario "' + row[CONFIG.COL.ESTAGIARIO] + '" sem e-mail cadastrado.');
      }

      // Backfill de LINK/DI_CLASS/DF_CLASS: atividades criadas como "Programada"
      // (state DRAFT + scheduledTime, ver criarCourseWorkParaRegistro) nao tem
      // alternateLink/creationTime/dueDate utilizaveis ate serem publicadas de
      // verdade pelo Classroom. Enquanto alguma dessas celulas estiver vazia,
      // verifica se ja foi publicada e, se sim, preenche as que faltarem.
      if (!row[CONFIG.COL.LINK] || !row[CONFIG.COL.DI_CLASS] || !row[CONFIG.COL.DF_CLASS]) {
        try {
          var courseWorkAtual = obterCourseWork(cursoId, courseworkId);
          if (courseWorkAtual.state === 'PUBLISHED') {
            if (!row[CONFIG.COL.LINK] && courseWorkAtual.alternateLink) {
              aba.getRange(linha, CONFIG.COL.LINK + 1).setValue(courseWorkAtual.alternateLink);
            }
            if (!row[CONFIG.COL.DI_CLASS]) {
              var diClassBackfill = converterCreationTimeClassroomParaData(courseWorkAtual.creationTime);
              if (diClassBackfill) aba.getRange(linha, CONFIG.COL.DI_CLASS + 1).setValue(diClassBackfill);
            }
            if (!row[CONFIG.COL.DF_CLASS]) {
              var dfClassBackfill = converterDueDateClassroomParaData(courseWorkAtual.dueDate, courseWorkAtual.dueTime);
              if (dfClassBackfill) aba.getRange(linha, CONFIG.COL.DF_CLASS + 1).setValue(dfClassBackfill);
            }
          }
        } catch (eLink) {
          // Nao interrompe a verificacao de entrega por causa do backfill.
        }
      }

      var userId = obterUserIdDoAluno(cursoId, emailAluno);
      var submission = obterSubmissionDoAluno(cursoId, courseworkId, userId);
      var resultado = classificarStatusPelaSubmission(submission);

      if (resultado && normalizarChave(resultado.status) !== statusNorm) {
        var statusNormNovo = normalizarChave(resultado.status);
        aba.getRange(linha, CONFIG.COL.STATUS + 1).setValue(resultado.status);
        aba.getRange(linha, CONFIG.COL.ALTERADO_EM + 1).setValue(agora);

        if (statusNormNovo === 'protocolado') {
          aba.getRange(linha, CONFIG.COL.OBS + 1).setValue('Atividade protocolada em ' + formatarDataHoraObs(agora));

          // onEdit nao dispara em setValue() programatico (ver linha 553 acima),
          // entao processarEdicaoSecretaria nunca seria chamado para esta linha.
          // Chamada direta, mesmo padrao ja usado com sincronizarLinhaParaGeral.
          sincronizarDiligenciasParaSecretaria([linha]);
        } else if (resultado.obsMotivo === 'acordo') {
          aba.getRange(linha, CONFIG.COL.OBS + 1).setValue('Acordo realizado pelo(a) estagiário(a) em ' + formatarDataHoraObs(agora));
        } else if (resultado.obsMotivo === 'validada') {
          aba.getRange(linha, CONFIG.COL.OBS + 1).setValue('Atividade validada em ' + formatarDataHoraObs(agora));
        } else if (resultado.obsMotivo === 'cancelada') {
          aba.getRange(linha, CONFIG.COL.OBS + 1).setValue('Atividade cancelada em ' + formatarDataHoraObs(agora));
        }

        atualizados.push({ linha: linha, id: row[CONFIG.COL.ID], statusAnterior: statusAtual, statusNovo: resultado.status });
        sincronizarLinhaParaGeral(linha);
      }
    } catch (e) {
      erros.push({ linha: linha, id: row[CONFIG.COL.ID], erro: e.message });
    }
  }

  return { sucesso: true, atualizados: atualizados, erros: erros };
}

// === ACOMPANHAMENTOS ===
// Mesma logica de Diligencias (criacao de coursework individual + verificacao
// de entregas), com duas diferencas de negocio confirmadas por Thales:
//   1. Nao ha ESPECIE/SUBESPECIE nesta aba, entao o titulo e a descricao da
//      atividade sao mais simples, e o topico da coursework e sempre fixo
//      (CONFIG.CLASSROOM.TOPICO_ACOMPANHAMENTOS), em vez de Simples/Complexa.
//   2. Nota lancada > 0 classifica o registro como "Ok" (nunca "Protocolado"
//      — um acompanhamento nunca e protocolado).
// O e-mail do estagiario ja vem gravado diretamente na linha (coluna EMAIL),
// entao aqui nao e preciso cruzar com a aba estagiarios como em Diligencias.

function montarTituloAtividadeAcompanhamento(reg) {
  return 'Acompanhamento - ' + reg.id + ' - ' + reg.processo;
}

// Texto fixo definido por Thales. So os campos entre {} sao substituidos —
// o restante do texto nunca deve ser alterado (mesma convencao de
// montarDescricaoAtividade). reg.estagiario e o nome completo do(a)
// estagiario(a) (coluna NOME da aba acompanhamentos, ver
// coletarLinhasElegiveisAcompanhamentoParaEnvio abaixo) — primeiroNome()
// (Mensagens.js) extrai o vocativo.
function montarDescricaoAtividadeAcompanhamento(reg) {
  var linhas = [
    'Prezado(a) ' + primeiroNome(reg.estagiario) + ',',
    '',
    'Você deve elaborar um relatório de acompanhamento processual referente ao',
    'processo nº ' + reg.processo + ', contendo, obrigatoriamente, as seguintes informações:',
    '',
    '1. Nome da(o) Assistida(o);',
    '2. Número do Processo;',
    '3. Vara;',
    '4. Objeto;',
    '5. Argumento do Requerente;',
    '6. Argumento do Requerido (se houver);',
    '7. Principal aspecto do processo;',
    '8. Diligência requerida pelo juiz;',
    '9. Atual estado do processo.',
    '',
    'Atenção:',
    '• Prazo para entrega: ' + formatarData(reg.dataEntregaRaw) + ';',
    '• Consulte o andamento processual antes de elaborar o relatório;',
    '• Envie o relatório em formato WORD (.doc ou .docx) ou, de preferência, no formato Google Docs. O processo encontra-se na pasta com seu nome no Google Drive. 📁',
    CONFIG.CLASSROOM.PASTA_DRIVE_URL,
    '',
    'Em caso de dúvidas, pode entrar em contato comigo. 🫱🏽‍🫲🏽',
    '',
    'Esta atividade foi criada automaticamente pelo sistema. 🤖'
  ];
  return linhas.join('\n');
}

// Cria uma coursework individual no Classroom para uma unica linha da aba
// acompanhamentos. Retorna o alternateLink em caso de sucesso ou lanca
// excecao com uma mensagem legivel em caso de erro.
function criarCourseWorkParaAcompanhamento(reg) {
  var cursoId = obterIdCursoClassroom();

  if (!reg.email) {
    throw new Error('Registro "' + reg.id + '" sem e-mail de estagiario cadastrado na linha.');
  }

  var userId = obterUserIdDoAluno(cursoId, reg.email);
  var topicId = obterOuCriarTopicoId(cursoId, CONFIG.CLASSROOM.TOPICO_ACOMPANHAMENTOS);

  // Mesma regra de Diligencias (ver criarCourseWorkParaRegistro acima): so
  // agenda (state DRAFT + scheduledTime) quando o envio ocorrer fora do
  // horario comercial/fim de semana/feriado (dentroDoHorarioComercial,
  // Agenda.js). Dentro do horario comercial, publica na hora.
  var agendarPublicacaoAcomp = !dentroDoHorarioComercial();

  var courseWork = {
    title: montarTituloAtividadeAcompanhamento(reg),
    description: montarDescricaoAtividadeAcompanhamento(reg),
    workType: 'ASSIGNMENT',
    state: agendarPublicacaoAcomp ? 'DRAFT' : 'PUBLISHED',
    maxPoints: CONFIG.CLASSROOM.PONTUACAO_MAXIMA,
    topicId: topicId,
    assigneeMode: 'INDIVIDUAL_STUDENTS',
    individualStudentsOptions: {
      studentIds: [userId]
    }
  };

  if (agendarPublicacaoAcomp) {
    courseWork.scheduledTime = calcularProximaPublicacaoClassroom(lerFeriados()).toISOString();
  }

  if (reg.dataEntregaRaw) {
    courseWork.dueDate = converterDataParaClassroom(reg.dataEntregaRaw);
    courseWork.dueTime = { hours: 23, minutes: 59, seconds: 0, nanos: 0 };
  }

  var criado = Classroom.Courses.CourseWork.create(courseWork, cursoId);
  return {
    link: criado.alternateLink,
    courseworkId: criado.id,
    diClass: converterCreationTimeClassroomParaData(criado.creationTime),
    dfClass: converterDueDateClassroomParaData(criado.dueDate, criado.dueTime)
  };
}

// --- Leitura das linhas elegiveis (CLASS != "S") ---

function coletarLinhasElegiveisAcompanhamentoParaEnvio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ACOMPANHAMENTOS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_ACOMPANHAMENTOS).getValues();
  var lista = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CONFIG.ACOMPANHAMENTOS_COL.ID] && !row[CONFIG.ACOMPANHAMENTOS_COL.PROCESSO]) continue;

    var jaEnviado = String(row[CONFIG.ACOMPANHAMENTOS_COL.CLASS] || '').trim().toUpperCase() === CONFIG.CLASS_ENVIADO;
    if (jaEnviado) continue;

    lista.push({
      _linha: i + 2,
      id: row[CONFIG.ACOMPANHAMENTOS_COL.ID],
      processo: row[CONFIG.ACOMPANHAMENTOS_COL.PROCESSO],
      estagiario: String(row[CONFIG.ACOMPANHAMENTOS_COL.NOME] || '').trim(),
      email: String(row[CONFIG.ACOMPANHAMENTOS_COL.EMAIL] || '').trim(),
      dataEntregaRaw: row[CONFIG.ACOMPANHAMENTOS_COL.DATA_ENTREGA]
    });
  }
  return lista;
}

// --- Orquestracao (chamada pelo frontend via google.script.run) ---

// Varre toda a aba acompanhamentos em busca de registros com CLASS != "S",
// cria a atividade individual no Classroom para cada um, e grava de volta
// LINK, CLASS = "S", DATA = hoje e STATUS = "Encaminhado". Erros em uma
// linha nao interrompem o processamento das demais.
function enviarAcompanhamentosAoClassroom() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ACOMPANHAMENTOS);
  if (!aba) return { sucesso: false, erro: 'Aba acompanhamentos nao encontrada.' };

  var elegiveis;
  try {
    elegiveis = coletarLinhasElegiveisAcompanhamentoParaEnvio();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao ler acompanhamentos: ' + e.message };
  }

  if (elegiveis.length === 0) {
    return { sucesso: true, enviados: [], erros: [], mensagem: 'Nenhum acompanhamento pendente de envio ao Classroom.' };
  }

  var agora = new Date();
  var enviados = [];
  var erros = [];

  elegiveis.forEach(function(reg) {
    try {
      var resultado = criarCourseWorkParaAcompanhamento(reg);
      var linkCelula = aba.getRange(reg._linha, CONFIG.ACOMPANHAMENTOS_COL.LINK + 1);

      linkCelula.setValue(resultado.link);
      // O ID bruto da coursework fica como nota (comentario) da celula LINK,
      // invisivel na planilha — mesma estrategia usada em Diligencias.
      linkCelula.setNote(resultado.courseworkId);

      aba.getRange(reg._linha, CONFIG.ACOMPANHAMENTOS_COL.CLASS + 1).setValue(CONFIG.CLASS_ENVIADO);
      aba.getRange(reg._linha, CONFIG.ACOMPANHAMENTOS_COL.DATA + 1).setValue(agora);
      aba.getRange(reg._linha, CONFIG.ACOMPANHAMENTOS_COL.STATUS + 1).setValue('Encaminhado');
      if (resultado.diClass) aba.getRange(reg._linha, CONFIG.ACOMPANHAMENTOS_COL.DI_CLASS + 1).setValue(resultado.diClass);
      if (resultado.dfClass) aba.getRange(reg._linha, CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS + 1).setValue(resultado.dfClass);

      enviados.push({ linha: reg._linha, id: reg.id, link: resultado.link, origem: 'acompanhamentos' });
    } catch (e) {
      erros.push({ linha: reg._linha, id: reg.id, erro: e.message, origem: 'acompanhamentos' });
    }
  });

  return { sucesso: true, enviados: enviados, erros: erros };
}

// --- Verificar Entregas ---
// Regra de negocio confirmada por Thales (fonte de verdade) — igual a
// Diligencias, exceto que nota > 0 classifica como "Ok" em vez de
// "Protocolado" (um acompanhamento nunca e protocolado):
//   aluno ainda nao entregou        -> nao mexe no STATUS (fica Encaminhado)
//   aluno entregou, sem nota ainda  -> STATUS = "Entregue"
//   nota lancada > 0                -> STATUS = "Ok"
//   nota lancada = 0                -> STATUS = "Devolvida"

function obterCourseworkIdDaLinhaAcompanhamento(aba, linha) {
  var nota = aba.getRange(linha, CONFIG.ACOMPANHAMENTOS_COL.LINK + 1).getNote();
  return String(nota || '').trim();
}

function classificarStatusPelaSubmissionAcompanhamento(submission) {
  if (!submission) return null;

  if (submission.state === 'TURNED_IN') {
    return 'Entregue';
  }

  if (submission.state === 'RETURNED') {
    var notaAtribuida = submission.assignedGrade;
    var temNota = (notaAtribuida !== undefined && notaAtribuida !== null);
    if (!temNota) return null; // devolvido sem nota lancada — nao mexe
    return notaAtribuida > 0 ? 'Ok' : 'Devolvida';
  }

  return null; // NEW, CREATED, RECLAIMED_BY_STUDENT -> aluno ainda nao entregou (de novo)
}

// Varre acompanhamentos com CLASS = "S" e STATUS fora dos finais (Ok/
// Cancelada — "Protocolado" nunca se aplica aqui, mas continua listado em
// CONFIG.STATUS_FINAIS por ser compartilhado com Diligencias/Iniciais),
// consulta a entrega/nota real no Classroom e atualiza o STATUS quando
// necessario. Chamada pelo botao "Verificar Entregas" e pelo gatilho
// automatico horario (dentro do horario comercial).
function verificarEntregasAcompanhamentos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ACOMPANHAMENTOS);
  if (!aba) return { sucesso: false, erro: 'Aba acompanhamentos nao encontrada.' };

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { sucesso: true, atualizados: [], erros: [] };

  var cursoId;
  try {
    cursoId = obterIdCursoClassroom();
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_ACOMPANHAMENTOS).getValues();
  var atualizados = [];
  var erros = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var linha = i + 2;

    if (!row[CONFIG.ACOMPANHAMENTOS_COL.ID] && !row[CONFIG.ACOMPANHAMENTOS_COL.PROCESSO]) continue;

    var classEnviado = String(row[CONFIG.ACOMPANHAMENTOS_COL.CLASS] || '').trim().toUpperCase() === CONFIG.CLASS_ENVIADO;
    if (!classEnviado) continue; // so verifica quem ja foi enviado ao Classroom

    var statusAtual = String(row[CONFIG.ACOMPANHAMENTOS_COL.STATUS] || '').trim();
    var statusNorm = normalizarChave(statusAtual);
    if (CONFIG.STATUS_FINAIS.indexOf(statusNorm) !== -1) continue; // Ok/Cancelada -> nao verifica mais

    try {
      var courseworkId = obterCourseworkIdDaLinhaAcompanhamento(aba, linha);
      if (!courseworkId) {
        throw new Error('ID da coursework nao encontrado (nota da celula LINK ausente).');
      }

      var emailAluno = String(row[CONFIG.ACOMPANHAMENTOS_COL.EMAIL] || '').trim();
      if (!emailAluno) {
        throw new Error('Registro sem e-mail de estagiario cadastrado na linha.');
      }

      // Backfill de LINK/DI_CLASS/DF_CLASS — mesma logica de
      // verificarEntregasClassroom (Diligencias): atividades "Programadas" so
      // ganham alternateLink/creationTime/dueDate utilizaveis apos publicadas
      // de fato.
      if (!row[CONFIG.ACOMPANHAMENTOS_COL.LINK] || !row[CONFIG.ACOMPANHAMENTOS_COL.DI_CLASS] || !row[CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS]) {
        try {
          var courseWorkAtualAcomp = obterCourseWork(cursoId, courseworkId);
          if (courseWorkAtualAcomp.state === 'PUBLISHED') {
            if (!row[CONFIG.ACOMPANHAMENTOS_COL.LINK] && courseWorkAtualAcomp.alternateLink) {
              aba.getRange(linha, CONFIG.ACOMPANHAMENTOS_COL.LINK + 1).setValue(courseWorkAtualAcomp.alternateLink);
            }
            if (!row[CONFIG.ACOMPANHAMENTOS_COL.DI_CLASS]) {
              var diClassBackfillAcomp = converterCreationTimeClassroomParaData(courseWorkAtualAcomp.creationTime);
              if (diClassBackfillAcomp) aba.getRange(linha, CONFIG.ACOMPANHAMENTOS_COL.DI_CLASS + 1).setValue(diClassBackfillAcomp);
            }
            if (!row[CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS]) {
              var dfClassBackfillAcomp = converterDueDateClassroomParaData(courseWorkAtualAcomp.dueDate, courseWorkAtualAcomp.dueTime);
              if (dfClassBackfillAcomp) aba.getRange(linha, CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS + 1).setValue(dfClassBackfillAcomp);
            }
          }
        } catch (eLinkAcomp) {
          // Nao interrompe a verificacao de entrega por causa do backfill.
        }
      }

      var userId = obterUserIdDoAluno(cursoId, emailAluno);
      var submission = obterSubmissionDoAluno(cursoId, courseworkId, userId);
      var novoStatus = classificarStatusPelaSubmissionAcompanhamento(submission);

      if (novoStatus && normalizarChave(novoStatus) !== statusNorm) {
        aba.getRange(linha, CONFIG.ACOMPANHAMENTOS_COL.STATUS + 1).setValue(novoStatus);
        atualizados.push({ linha: linha, id: row[CONFIG.ACOMPANHAMENTOS_COL.ID], statusAnterior: statusAtual, statusNovo: novoStatus, origem: 'acompanhamentos' });
      }
    } catch (e) {
      erros.push({ linha: linha, id: row[CONFIG.ACOMPANHAMENTOS_COL.ID], erro: e.message, origem: 'acompanhamentos' });
    }
  }

  return { sucesso: true, atualizados: atualizados, erros: erros };
}

// === ORQUESTRACAO COMBINADA (Diligencias + Acompanhamentos) ===
// Os botoes "Enviar ao Classroom" e "Verificar Entregas" (e o gatilho
// automatico horario) processam as duas abas em uma unica acao — ver
// pedido de Thales. Se uma das duas abas falhar por completo (ex.: aba nao
// encontrada), o erro correspondente e adicionado a lista de erros, sem
// impedir o processamento da outra aba.

function enviarPendentesAoClassroom() {
  var resDiligencias = enviarDiligenciasAoClassroom();
  var resAcompanhamentos = enviarAcompanhamentosAoClassroom();

  var enviados = [];
  var erros = [];

  if (resDiligencias.sucesso) {
    enviados = enviados.concat(resDiligencias.enviados || []);
    erros = erros.concat(resDiligencias.erros || []);
  } else {
    erros.push({ origem: 'diligencias', erro: resDiligencias.erro });
  }

  if (resAcompanhamentos.sucesso) {
    enviados = enviados.concat(resAcompanhamentos.enviados || []);
    erros = erros.concat(resAcompanhamentos.erros || []);
  } else {
    erros.push({ origem: 'acompanhamentos', erro: resAcompanhamentos.erro });
  }

  var mensagem = (enviados.length === 0 && erros.length === 0)
    ? 'Nenhuma diligência ou acompanhamento pendente de envio ao Classroom.'
    : undefined;

  return { sucesso: true, enviados: enviados, erros: erros, mensagem: mensagem };
}

function verificarTodasEntregasClassroom() {
  var resDiligencias = verificarEntregasClassroom();
  var resAcompanhamentos = verificarEntregasAcompanhamentos();
  var resIniciais = verificarEntregasIniciais();

  var atualizados = [];
  var erros = [];

  if (resDiligencias.sucesso) {
    atualizados = atualizados.concat(resDiligencias.atualizados || []);
    erros = erros.concat(resDiligencias.erros || []);
  } else {
    erros.push({ origem: 'diligencias', erro: resDiligencias.erro });
  }

  if (resAcompanhamentos.sucesso) {
    atualizados = atualizados.concat(resAcompanhamentos.atualizados || []);
    erros = erros.concat(resAcompanhamentos.erros || []);
  } else {
    erros.push({ origem: 'acompanhamentos', erro: resAcompanhamentos.erro });
  }

  if (resIniciais.sucesso) {
    atualizados = atualizados.concat(resIniciais.atualizados || []);
    // Envio de mensagem ao aluno nao e uma mudanca de STATUS, mas entra na
    // mesma lista "atualizados" para dar visibilidade no retorno do botao
    // "Verificar Entregas".
    (resIniciais.notificados || []).forEach(function(n) {
      atualizados.push({ linha: n.linha, id: n.id, statusAnterior: 'Ok', statusNovo: 'Ok (aluno notificado)', origem: 'iniciais' });
    });
    erros = erros.concat(resIniciais.erros || []);
  } else {
    erros.push({ origem: 'iniciais', erro: resIniciais.erro });
  }

  return { sucesso: true, atualizados: atualizados, erros: erros };
}

// --- Gatilho automatico (executado a cada 30 minutos, so age dentro do horario comercial) ---

// Handler chamado pelo trigger instalavel criado em configurarGatilhoVerificacaoAutomatica().
// Fora do horario comercial (ver CONFIG.HORARIO_COMERCIAL e Agenda.js) a
// execucao e ignorada, sem custo de chamadas a API do Classroom. Verifica
// diligencias, acompanhamentos e iniciais (progressao de STATUS + notificacao
// ao aluno quando nota 100 + STATUS "Ok") juntos — ver verificarTodasEntregasClassroom.
function verificarEntregasAutomatico() {
  if (!dentroDoHorarioComercial()) return;
  verificarTodasEntregasClassroom();
}

// Rodar esta funcao MANUALMENTE uma unica vez pelo editor do Apps Script
// (Executar > configurarGatilhoVerificacaoAutomatica) para instalar o
// gatilho de 30 em 30 minutos. E seguro executa-la novamente: ela remove
// qualquer gatilho antigo do mesmo handler antes de criar um novo, evitando
// duplicatas.
function configurarGatilhoVerificacaoAutomatica() {
  var gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(function(g) {
    if (g.getHandlerFunction() === 'verificarEntregasAutomatico') {
      ScriptApp.deleteTrigger(g);
    }
  });

  ScriptApp.newTrigger('verificarEntregasAutomatico')
    .timeBased()
    .everyMinutes(30)
    .create();
}

// === PAUTA SEMANAL DE AUDIENCIAS (Announcement no mural do Classroom) ===
// Publicada toda segunda-feira as 8h (gatilho automatico abaixo) e tambem
// sob demanda pelo card "Publicar Pauta da Semana" na aba Utilitarios >
// Classroom do painel (ver acaoPublicarPautaSemanal, Code.js). Reune as audiencias de
// segunda a sexta da semana corrente, de QUALQUER advogado(a) (ver
// getAudienciasDaSemana, Audiencias.js) — diferente da aba Audiencias do
// painel, que so mostra as de Thales. Publicada como Announcement (mural),
// visivel a todos os participantes da turma — sem assigneeMode/
// individualStudentsOptions, diferente das courseworks individuais de
// Diligencias/Acompanhamentos, que vao so para um aluno especifico.
// IMPORTANTE: o recurso Announcement da API do Classroom NAO tem campo
// topicId (so CourseWork/CourseWorkMaterial tem) — API rejeita com "Unknown
// name topicId" se enviado. Por isso a publicacao nao usa
// CONFIG.CLASSROOM.TOPICO_AUDIENCIAS/obterOuCriarTopicoId; a organizacao por
// tipo fica so no cabecalho do texto ("📅 AUDIÊNCIAS DA SEMANA").

// Monta o texto da publicacao, organizado por dia (so os dias que tem
// audiencia aparecem). Announcements da API do Classroom nao tem campo de
// titulo separado (diferente de CourseWork, que tem title+description) —
// "Audiências da Semana" e a primeira linha do proprio texto.
function montarCorpoPautaSemanal(lista, limites) {
  var periodo = Utilities.formatDate(limites.segunda, CONFIG.TIMEZONE, 'dd/MM') +
    ' a ' + Utilities.formatDate(limites.sexta, CONFIG.TIMEZONE, 'dd/MM/yyyy');

  var linhas = ['📅 AUDIÊNCIAS DA SEMANA', periodo, ''];

  if (lista.length === 0) {
    linhas.push('Nenhuma audiência agendada para esta semana.');
    return linhas.join('\n');
  }

  var separador = '━━━━━━━━━━━━━━━━━━━━━━━━';
  var dataAnterior = null;

  lista.forEach(function(reg) {
    if (reg.data !== dataAnterior) {
      dataAnterior = reg.data;
      if (linhas.length > 3) linhas.push('');
      linhas.push(separador);
      linhas.push((reg.diaSemana + ', ' + reg.data).toUpperCase());
      linhas.push(separador);
    }
    linhas.push('🕐 ' + (reg.hora || '--:--') + '  •  ' + (reg.vara || '—'));
    linhas.push('    Tipo: ' + (reg.tipo || '—') + '   |   Adv.: ' + (reg.adv || '—'));
  });

  return linhas.join('\n');
}

// Publica a pauta da semana corrente (segunda a sexta) no mural do
// Classroom. Retorna { sucesso, link, quantidade }. Lanca excecao em caso de
// falha (curso invalido, permissao ausente etc.) — o chamador decide como
// tratar (ver acaoPublicarPautaSemanal em Code.js e
// publicarPautaSemanalAutomatico abaixo).
function publicarPautaSemanalAudiencias() {
  var cursoId = obterIdCursoClassroom();
  var limites = calcularLimitesSemanaPautaAudiencias();
  var lista = getAudienciasDaSemana(limites.inicio, limites.fim);

  var criado = Classroom.Courses.Announcements.create({
    text: montarCorpoPautaSemanal(lista, limites),
    state: 'PUBLISHED'
  }, cursoId);

  return { sucesso: true, link: criado.alternateLink, quantidade: lista.length };
}

// --- Gatilho automatico (toda segunda-feira as 8h) ---

// Handler chamado pelo trigger instalavel criado em
// configurarGatilhoPautaSemanalAudiencias(). Mesmo padrao de
// verificarCobrancasAutomatico (Mensagens.js): gatilho diario as 8h + uma
// checagem interna do dia da semana, ja que o Apps Script nao tem um
// builder de trigger "toda segunda as 8h" combinando os dois — so
// onWeekDay() (sem hora fixa garantida) ou atHour()+everyDays() (todo dia).
// Feriado na segunda-feira NAO impede a publicacao: a pauta e sobre as
// audiencias da semana, nao sobre o dia da publicacao em si.
function publicarPautaSemanalAutomatico() {
  if (new Date().getDay() !== 1) return; // 1 = segunda-feira
  publicarPautaSemanalAudiencias();
}

// Rodar esta funcao MANUALMENTE uma unica vez pelo editor do Apps Script
// (Executar > configurarGatilhoPautaSemanalAudiencias) para instalar o
// gatilho diario as 8h. E seguro executa-la novamente: remove qualquer
// gatilho antigo do mesmo handler antes de criar um novo, evitando
// duplicatas — mesmo padrao de configurarGatilhoVerificacaoAutomatica acima.
function configurarGatilhoPautaSemanalAudiencias() {
  var gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(function(g) {
    if (g.getHandlerFunction() === 'publicarPautaSemanalAutomatico') {
      ScriptApp.deleteTrigger(g);
    }
  });

  ScriptApp.newTrigger('publicarPautaSemanalAutomatico')
    .timeBased()
    .atHour(8)
    .everyDays(1)
    .create();
}