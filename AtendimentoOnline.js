// AtendimentoOnline.gs
// Responsabilidade: leitura/escrita da aba "atendimentos_online" e toda a
// regra de negocio do fluxo de Atendimento Online (criacao pelo estagiario,
// aprovacao/reprovacao por Thales, reenvio apos reprovacao). Nenhum outro
// arquivo deve ler/escrever esta aba diretamente.
//
// Regras de negocio (decididas por Thales):
//  - So podem ser referenciadas Diligencias, Iniciais ou Acompanhamentos
//    (nunca um Atendimento presencial da aba "atendimentos", que nao tem ID).
//  - Qualquer STATUS da atividade referenciada e aceito (inclusive Cancelada).
//  - Uma mesma atividade (TIPO_ATIVIDADE + ID_ATIVIDADE) so pode aparecer UMA
//    unica vez nesta aba, para sempre — mesmo que o registro tenha sido
//    reprovado. Reprovado != disponivel de novo: o estagiario edita e reenvia
//    o MESMO registro (mesma linha), nunca cria um novo para a mesma atividade.
//  - So conta na producao do estagiario (ver ajuste em Panorama.js) quando
//    STATUS = CONFIG.STATUS_ATENDIMENTO_ONLINE.APROVADO.

// --- Leitura ---

function rowParaObjetoAtendimentoOnline(row, indice) {
  return {
    _linha: indice + 2,
    id: row[CONFIG.ATENDIMENTO_ONLINE_COL.ID],
    data: formatarData(row[CONFIG.ATENDIMENTO_ONLINE_COL.DATA]),
    estagiario: row[CONFIG.ATENDIMENTO_ONLINE_COL.ESTAGIARIO],
    email: String(row[CONFIG.ATENDIMENTO_ONLINE_COL.EMAIL] || '').trim(),
    atendido: row[CONFIG.ATENDIMENTO_ONLINE_COL.ATENDIDO],
    tipoAtividade: row[CONFIG.ATENDIMENTO_ONLINE_COL.TIPO_ATIVIDADE],
    idAtividade: String(row[CONFIG.ATENDIMENTO_ONLINE_COL.ID_ATIVIDADE] || '').trim(),
    justificativa: row[CONFIG.ATENDIMENTO_ONLINE_COL.JUSTIFICATIVA],
    status: String(row[CONFIG.ATENDIMENTO_ONLINE_COL.STATUS] || '').trim(),
    obsAprovacao: row[CONFIG.ATENDIMENTO_ONLINE_COL.OBS_APROVACAO],
    alteradoEm: formatarDataHora(row[CONFIG.ATENDIMENTO_ONLINE_COL.ALTERADO_EM]),
    semestre: normalizarSemestreLido(row[CONFIG.ATENDIMENTO_ONLINE_COL.SEMESTRE])
  };
}

function getTodosAtendimentosOnline() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ATENDIMENTOS_ONLINE);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_ATENDIMENTO_ONLINE).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CONFIG.ATENDIMENTO_ONLINE_COL.ID]) continue;
    lista.push(rowParaObjetoAtendimentoOnline(row, i));
  }
  return lista;
}

// --- Contexto da atividade referenciada (exibido no card de aprovacao) ---
// Busca processo/assistido/estagiario da diligencia/inicial/acompanhamento
// pelo ID, so para dar contexto a Thales na fila de aprovacao — nunca grava
// nada, apenas leitura reaproveitando os getters ja existentes de cada aba.
function resolverContextoAtividade(tipo, idAtividade) {
  var chaveId = String(idAtividade || '').trim();
  if (!chaveId) return null;

  var chaveTipo = normalizarChave(tipo);
  var lista;
  if (chaveTipo === normalizarChave('Diligência')) lista = getTodasDiligencias();
  else if (chaveTipo === normalizarChave('Inicial')) lista = getTodasIniciais();
  else if (chaveTipo === normalizarChave('Acompanhamento')) lista = getTodosAcompanhamentos();
  else return null;

  for (var i = 0; i < lista.length; i++) {
    if (String(lista[i].id || '').trim() === chaveId) {
      return {
        processo: lista[i].processo || '',
        assistido: lista[i].assistido || '',
        status: lista[i].status || ''
      };
    }
  }
  return null;
}

// --- Atividades elegiveis para um estagiario (usado pelo Painel Aluno) ---
// Recebe as listas de diligencias/iniciais/acompanhamentos JA FILTRADAS para
// o estagiario em foco (mesmas listas devolvidas por getDadosPainelAluno, ver
// Aluno.js) e remove as que ja foram referenciadas em atendimentos_online
// (qualquer STATUS, inclusive Reprovado — ver regra de negocio no cabecalho).
function getAtividadesElegiveisAtendimentoOnline(diligenciasDoAluno, iniciaisDoAluno, acompanhamentosDoAluno) {
  var jaReferenciadas = {};
  getTodosAtendimentosOnline().forEach(function(ao) {
    jaReferenciadas[normalizarChave(ao.tipoAtividade) + '|' + String(ao.idAtividade || '').trim()] = true;
  });

  function chaveOcupada(tipo, id) {
    return jaReferenciadas[normalizarChave(tipo) + '|' + String(id || '').trim()];
  }

  var lista = [];

  // estagiario/email/semestre replicados em cada item para o Painel Aluno
  // conseguir filtrar por "aluno em foco" (caso Thales, com varios alunos no
  // mesmo payload) do mesmo jeito que ja faz com diligencias/iniciais/
  // acompanhamentos (ver paFiltrarPorAluno, AlunoScripts.html).
  (diligenciasDoAluno || []).forEach(function(d) {
    if (chaveOcupada('Diligência', d.id)) return;
    lista.push({
      tipo: 'Diligência',
      id: d.id,
      rotulo: (d.processo || 'sem processo') + ' — ' + (d.diligencia || d.especie || 'Diligência'),
      estagiario: d.estagiario || '',
      email: '',
      semestre: d.semestre || ''
    });
  });

  (iniciaisDoAluno || []).forEach(function(ini) {
    if (chaveOcupada('Inicial', ini.id)) return;
    lista.push({
      tipo: 'Inicial',
      id: ini.id,
      rotulo: 'Petição Inicial — ' + (ini.assistido || ini.processo || ini.id),
      estagiario: ini.estagiario || '',
      email: ini.email || '',
      semestre: ini.semestre || ''
    });
  });

  (acompanhamentosDoAluno || []).forEach(function(ac) {
    if (chaveOcupada('Acompanhamento', ac.id)) return;
    lista.push({
      tipo: 'Acompanhamento',
      id: ac.id,
      rotulo: 'Acompanhamento — ' + (ac.processo || ac.id),
      estagiario: ac.estagiario || '',
      email: ac.email || '',
      semestre: ac.semestre || ''
    });
  });

  return lista;
}

// --- Numeracao (bd!R2) ---

function proximoNumeroAtendimentoOnline() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) throw new Error('Aba bd nao encontrada.');

  var celula = aba.getRange(CONFIG.BD_CELL.CONTROLE_AO);
  var atual = parseInt(celula.getValue(), 10);
  if (isNaN(atual)) atual = 0;

  var proximo = atual + 1;
  celula.setValue(proximo);

  return CONFIG.PREFIXO_ATENDIMENTO_ONLINE + String(proximo).padStart(4, '0');
}

// --- Validacao de propriedade/elegibilidade da atividade (nunca confia no payload) ---
// Confere, lendo a planilha de novo no servidor, que a atividade informada
// (tipo + id) realmente pertence ao estagiario dono do e-mail informado.
function _atividadePertenceAoEstagiario(tipo, idAtividade, nomeEstagiario, emailEstagiario) {
  var chaveId = String(idAtividade || '').trim();
  var chaveTipo = normalizarChave(tipo);
  var chaveNome = normalizarChave(nomeEstagiario);
  var chaveEmail = normalizarChave(emailEstagiario);

  if (chaveTipo === normalizarChave('Diligência')) {
    return getTodasDiligencias().some(function(d) {
      return String(d.id || '').trim() === chaveId && normalizarChave(d.estagiario) === chaveNome;
    });
  }
  if (chaveTipo === normalizarChave('Inicial')) {
    return getTodasIniciais().some(function(ini) {
      return String(ini.id || '').trim() === chaveId &&
        (normalizarChave(ini.estagiario) === chaveNome || normalizarChave(ini.email) === chaveEmail);
    });
  }
  if (chaveTipo === normalizarChave('Acompanhamento')) {
    return getTodosAcompanhamentos().some(function(ac) {
      return String(ac.id || '').trim() === chaveId &&
        (normalizarChave(ac.estagiario) === chaveNome || normalizarChave(ac.email) === chaveEmail);
    });
  }
  return false;
}

function _atividadeJaReferenciada(tipo, idAtividade, ignorarLinha) {
  var chaveId = String(idAtividade || '').trim();
  var chaveTipo = normalizarChave(tipo);
  return getTodosAtendimentosOnline().some(function(ao) {
    if (ignorarLinha && ao._linha === ignorarLinha) return false;
    return normalizarChave(ao.tipoAtividade) === chaveTipo && String(ao.idAtividade || '').trim() === chaveId;
  });
}

// --- Criacao (Painel Aluno) ---
// payload: { tipoAtividade, idAtividade, atendido, data (yyyy-mm-dd), justificativa }
// nomeEstagiario/emailEstagiario: resolvidos no servidor (Code.js), nunca a
// partir de um campo "estagiario" enviado pelo cliente — mesmo padrao de
// acaoCriarPedidoInicial (Thales escolhe aluno via seletor validado; aluno
// sempre usa o proprio e-mail logado).
function criarAtendimentoOnline(payload, nomeEstagiario, emailEstagiario) {
  var tipo = String((payload && payload.tipoAtividade) || '').trim();
  var idAtividade = String((payload && payload.idAtividade) || '').trim();
  var atendido = String((payload && payload.atendido) || '').trim();
  var justificativa = String((payload && payload.justificativa) || '').trim();
  var dataInformada = (payload && payload.data) ? new Date(payload.data + 'T00:00:00') : null;

  if (CONFIG.TIPOS_ATIVIDADE_ATENDIMENTO_ONLINE.indexOf(tipo) === -1) {
    return { sucesso: false, erro: 'Selecione um tipo de atividade válido.' };
  }
  if (!idAtividade) return { sucesso: false, erro: 'Selecione a atividade referente a este atendimento.' };
  if (!atendido) return { sucesso: false, erro: 'Informe o nome da pessoa atendida.' };
  if (!justificativa) return { sucesso: false, erro: 'Informe uma justificativa.' };
  if (!dataInformada || isNaN(dataInformada.getTime())) return { sucesso: false, erro: 'Informe uma data válida.' };
  if (!nomeEstagiario || !emailEstagiario) return { sucesso: false, erro: 'Não foi possível identificar o estagiário(a) logado.' };

  if (!_atividadePertenceAoEstagiario(tipo, idAtividade, nomeEstagiario, emailEstagiario)) {
    return { sucesso: false, erro: 'Esta atividade não pertence a você ou não foi encontrada.' };
  }
  if (_atividadeJaReferenciada(tipo, idAtividade, null)) {
    return { sucesso: false, erro: 'Esta atividade já possui um Atendimento Online registrado.' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ATENDIMENTOS_ONLINE);
  if (!aba) return { sucesso: false, erro: 'Aba atendimentos_online não encontrada.' };

  var id = proximoNumeroAtendimentoOnline();
  var semestre = calcularSemestre(dataInformada);
  var agora = new Date();

  var novaLinha = [];
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.ID] = id;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.DATA] = dataInformada;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.ESTAGIARIO] = nomeEstagiario;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.EMAIL] = emailEstagiario;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.ATENDIDO] = atendido;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.TIPO_ATIVIDADE] = tipo;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.ID_ATIVIDADE] = idAtividade;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.JUSTIFICATIVA] = justificativa;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.STATUS] = CONFIG.STATUS_ATENDIMENTO_ONLINE.PENDENTE;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.OBS_APROVACAO] = '';
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.ALTERADO_EM] = agora;
  novaLinha[CONFIG.ATENDIMENTO_ONLINE_COL.SEMESTRE] = semestre;

  var proximaLinhaPlanilha = aba.getLastRow() + 1;
  aba.getRange(proximaLinhaPlanilha, CONFIG.ATENDIMENTO_ONLINE_COL.SEMESTRE + 1, 1, 1).setNumberFormat('@');
  aba.getRange(proximaLinhaPlanilha, 1, 1, CONFIG.TOTAL_COLUNAS_ATENDIMENTO_ONLINE).setValues([novaLinha]);

  return { sucesso: true, id: id, linha: proximaLinhaPlanilha };
}

// --- Reenvio apos reprovacao (Painel Aluno) ---
// Reaproveita a MESMA linha/ID — nunca cria um registro novo (a atividade
// vinculada continua "ocupada" pelo mesmo AO, ver regra de negocio no
// cabecalho). So permitido quando STATUS atual = Reprovado e o e-mail
// informado e o mesmo dono da linha (Thales pode reenviar em nome de
// qualquer estagiario; o proprio estagiario so pode mexer no que e seu).
function reenviarAtendimentoOnline(payload, emailUsuario, ehThales) {
  var linha = parseInt(payload && payload._linha, 10);
  if (isNaN(linha) || linha < 2) return { sucesso: false, erro: 'Registro inválido.' };

  var atendido = String((payload && payload.atendido) || '').trim();
  var justificativa = String((payload && payload.justificativa) || '').trim();
  var dataInformada = (payload && payload.data) ? new Date(payload.data + 'T00:00:00') : null;

  if (!atendido) return { sucesso: false, erro: 'Informe o nome da pessoa atendida.' };
  if (!justificativa) return { sucesso: false, erro: 'Informe uma justificativa.' };
  if (!dataInformada || isNaN(dataInformada.getTime())) return { sucesso: false, erro: 'Informe uma data válida.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ATENDIMENTOS_ONLINE);
  if (!aba) return { sucesso: false, erro: 'Aba atendimentos_online não encontrada.' };

  var linhaAtual = aba.getRange(linha, 1, 1, CONFIG.TOTAL_COLUNAS_ATENDIMENTO_ONLINE).getValues()[0];
  var statusAtual = String(linhaAtual[CONFIG.ATENDIMENTO_ONLINE_COL.STATUS] || '').trim();
  var emailDono = String(linhaAtual[CONFIG.ATENDIMENTO_ONLINE_COL.EMAIL] || '').trim();

  if (normalizarChave(statusAtual) !== normalizarChave(CONFIG.STATUS_ATENDIMENTO_ONLINE.REPROVADO)) {
    return { sucesso: false, erro: 'Apenas registros reprovados podem ser editados e reenviados.' };
  }
  if (!ehThales && normalizarChave(emailDono) !== normalizarChave(emailUsuario)) {
    return { sucesso: false, erro: 'Este registro não pertence a você.' };
  }

  var semestre = calcularSemestre(dataInformada);
  var agora = new Date();

  aba.getRange(linha, CONFIG.ATENDIMENTO_ONLINE_COL.ATENDIDO + 1).setValue(atendido);
  aba.getRange(linha, CONFIG.ATENDIMENTO_ONLINE_COL.DATA + 1).setValue(dataInformada);
  aba.getRange(linha, CONFIG.ATENDIMENTO_ONLINE_COL.JUSTIFICATIVA + 1).setValue(justificativa);
  aba.getRange(linha, CONFIG.ATENDIMENTO_ONLINE_COL.STATUS + 1).setValue(CONFIG.STATUS_ATENDIMENTO_ONLINE.PENDENTE);
  aba.getRange(linha, CONFIG.ATENDIMENTO_ONLINE_COL.OBS_APROVACAO + 1).setValue('');
  aba.getRange(linha, CONFIG.ATENDIMENTO_ONLINE_COL.ALTERADO_EM + 1).setValue(agora);
  var semestreCelula = aba.getRange(linha, CONFIG.ATENDIMENTO_ONLINE_COL.SEMESTRE + 1);
  semestreCelula.setNumberFormat('@');
  semestreCelula.setValue(semestre);

  return { sucesso: true };
}

// --- Fila de aprovacao (Painel de Thales) ---
// pendentes: usados na fila de trabalho. historico: as ultimas decisoes
// (Aprovado/Reprovado), so para auditoria/consulta rapida — nao editavel.
function getDadosAprovacaoAtendimentoOnline() {
  var todos = getTodosAtendimentosOnline();

  var pendentes = todos
    .filter(function(ao) { return normalizarChave(ao.status) === normalizarChave(CONFIG.STATUS_ATENDIMENTO_ONLINE.PENDENTE); })
    .map(function(ao) {
      ao.contexto = resolverContextoAtividade(ao.tipoAtividade, ao.idAtividade);
      return ao;
    })
    .sort(function(a, b) { return String(a.data).localeCompare(String(b.data)); });

  var historico = todos
    .filter(function(ao) { return normalizarChave(ao.status) !== normalizarChave(CONFIG.STATUS_ATENDIMENTO_ONLINE.PENDENTE); })
    .sort(function(a, b) { return (b._linha || 0) - (a._linha || 0); })
    .slice(0, 50);

  return { pendentes: pendentes, historico: historico };
}

function aprovarAtendimentoOnline(linha) {
  var linhaNum = parseInt(linha, 10);
  if (isNaN(linhaNum) || linhaNum < 2) return { sucesso: false, erro: 'Registro inválido.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ATENDIMENTOS_ONLINE);
  if (!aba) return { sucesso: false, erro: 'Aba atendimentos_online não encontrada.' };

  aba.getRange(linhaNum, CONFIG.ATENDIMENTO_ONLINE_COL.STATUS + 1).setValue(CONFIG.STATUS_ATENDIMENTO_ONLINE.APROVADO);
  aba.getRange(linhaNum, CONFIG.ATENDIMENTO_ONLINE_COL.OBS_APROVACAO + 1).setValue('');
  aba.getRange(linhaNum, CONFIG.ATENDIMENTO_ONLINE_COL.ALTERADO_EM + 1).setValue(new Date());

  return { sucesso: true };
}

function reprovarAtendimentoOnline(linha, motivo) {
  var linhaNum = parseInt(linha, 10);
  if (isNaN(linhaNum) || linhaNum < 2) return { sucesso: false, erro: 'Registro inválido.' };

  var motivoTexto = String(motivo || '').trim();
  if (!motivoTexto) return { sucesso: false, erro: 'Informe o motivo da reprovação.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ATENDIMENTOS_ONLINE);
  if (!aba) return { sucesso: false, erro: 'Aba atendimentos_online não encontrada.' };

  aba.getRange(linhaNum, CONFIG.ATENDIMENTO_ONLINE_COL.STATUS + 1).setValue(CONFIG.STATUS_ATENDIMENTO_ONLINE.REPROVADO);
  aba.getRange(linhaNum, CONFIG.ATENDIMENTO_ONLINE_COL.OBS_APROVACAO + 1).setValue(motivoTexto);
  aba.getRange(linhaNum, CONFIG.ATENDIMENTO_ONLINE_COL.ALTERADO_EM + 1).setValue(new Date());

  return { sucesso: true };
}
