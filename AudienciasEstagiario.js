// AudienciasEstagiario.gs
// Responsabilidade: leitura/escrita da aba "audiencias_estagiario" e toda a
// regra de negocio do fluxo de "Audiências do Estagiário" (registro pelo
// proprio estagiario, aprovacao/reprovacao por Thales, reenvio apos
// reprovacao ou enquanto pendente, contagem por tipo/semestre para meta e
// Parcial de Horas). Nenhum outro arquivo deve ler/escrever esta aba
// diretamente.
//
// Modulo INDEPENDENTE da aba "audiencias" (pauta do escritorio, somente
// leitura, ver Audiencias.js) — nao ha vinculo entre um registro daqui e uma
// linha daquela pauta (decisao de Thales, 24/07/2026: o volume da pauta
// tornaria o seletor inutilizavel). O estagiario digita os dados livremente.
//
// Regras de negocio principais (decididas por Thales, 24/07/2026):
//  - Metas fixas por tipo (Escritório Escola/Externa/Tribunal do Júri) vivem
//    em bd!X:Z (ver lerParametrosAudiencias) — nunca codificadas aqui.
//  - SEMESTRE e ESTATICO: gravado uma unica vez na criacao a partir do
//    semestre do proprio estagiario (estagiarios!F), nunca recalculado a
//    partir de DATA (RN-02) — permite registrar audiencia com data anterior
//    ao semestre corrente sem quebrar a contagem da meta corrente (RN-09).
//  - So conta para meta/progresso/Parcial de Horas quando STATUS = 'Aprovada'
//    (RN-05). Excedente sobre a meta e permitido e conta integralmente na
//    Parcial de Horas, mas trava a barra de progresso em 100% (RN-06).
//  - Duplicidade (RN-07): bloqueada por ESTAGIARIO + PROCESSO (normalizado,
//    sem pontuacao) + DATA, independente do TIPO/STATUS — mas so dentro do
//    mesmo estagiario (dois estagiarios podem ter assistido a mesma
//    audiencia).
//  - Reprovado ou Pendente podem ser editados e reenviados na MESMA linha
//    (mesmo ID) — nunca cria um registro novo (RN-04).

// --- Leitura ---

function rowParaObjetoAudienciaEstagiario(row, indice) {
  return {
    _linha: indice + 2,
    id: row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.ID],
    data: formatarData(row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.DATA]),
    // HORA e gravada como string "HH:mm" (ver criar/reenviarAudienciaEstagiario),
    // mas setValue() se comporta como digitacao do usuario: o Sheets converte
    // "14:30" em valor de hora, e getValues() devolve um objeto Date. Devolver
    // esse Date cru ao cliente quebrava a serializacao de google.script.run e
    // fazia o successHandler receber null — bug diagnosticado em 27/07/2026,
    // que derrubava de uma vez a aba Panorama, esta aba e o Painel Aluno
    // inteiro (os tres unicos endpoints que enviam estes objetos ao frontend).
    // Bastava UM registro com hora preenchida para invalidar todo o payload.
    // A planilha continua guardando hora de verdade (ordenavel/filtravel);
    // so a saida para o cliente e normalizada. Ver formatarHora em Data.js.
    hora: formatarHora(row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.HORA]),
    estagiario: row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.ESTAGIARIO],
    email: String(row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.EMAIL] || '').trim(),
    tipo: row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.TIPO],
    vara: row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.VARA],
    processo: row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.PROCESSO],
    partes: row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.PARTES],
    obs: row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.OBS],
    status: String(row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.STATUS] || '').trim(),
    obsAprovacao: row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.OBS_APROVACAO],
    alteradoEm: formatarDataHora(row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.ALTERADO_EM]),
    semestre: normalizarSemestreLido(row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.SEMESTRE])
  };
}

function getTodasAudienciasEstagiario() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_AUDIENCIAS_ESTAGIARIO);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_AUDIENCIAS_ESTAGIARIO).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CONFIG.AUDIENCIAS_ESTAGIARIO_COL.ID]) continue;
    lista.push(rowParaObjetoAudienciaEstagiario(row, i));
  }
  return lista;
}

// --- Parametros (bd!X:Z) — fonte unica de tipo/meta/horas ---
// Linhas com a coluna X (tipo) vazia sao ignoradas. Nenhum outro arquivo deve
// ler estas celulas diretamente (RN do documento de requisitos).
function lerParametrosAudiencias() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var faixa = CONFIG.BD_COL.AUDIENCIA_TIPO + '2:' + CONFIG.BD_COL.AUDIENCIA_HORAS + ultimaLinha;
  var dados = aba.getRange(faixa).getValues();

  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var tipo = String(dados[i][0] || '').trim();
    if (!tipo) continue;
    var meta = parseInt(dados[i][1], 10);
    var horas = Number(dados[i][2]);
    lista.push({
      tipo: tipo,
      meta: isNaN(meta) ? 0 : meta,
      horas: isNaN(horas) ? 0 : horas
    });
  }
  return lista;
}

// --- Numeracao (bd!AA2) ---

function proximoNumeroAudienciaEstagiario() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) throw new Error('Aba bd nao encontrada.');

  var celula = aba.getRange(CONFIG.BD_CELL.CONTROLE_AU);
  var atual = parseInt(celula.getValue(), 10);
  if (isNaN(atual)) atual = 0;

  var proximo = atual + 1;
  celula.setValue(proximo);

  return CONFIG.PREFIXO_AUDIENCIA_ESTAGIARIO + String(proximo).padStart(4, '0');
}

// --- Resolucao segura do estagiario/turma alvo (nunca confia em nome/e-mail do payload) ---
// O SEMESTRE gravado no registro e ESTATICO (RN-02) e depende de qual linha
// de "estagiarios" esta selecionada no Painel Aluno — por isso o payload
// precisa identificar essa linha sem ambiguidade. Ate 27/07/2026 a chave era
// payload.semestre (par email+semestre), mas isso e ambiguo quando o aluno
// tem duas linhas no MESMO semestre (antecipado e regular — ver Turma.js):
// o filtro pegava a primeira que casasse, podendo gravar a audiencia na
// turma errada. A chave passou a ser payload.turma (par email+turma, casamento
// exato — um aluno tem no maximo uma linha por turma), exigido e validado
// contra a planilha tanto para o proprio aluno quanto para Thales agindo em
// nome de um aluno (mesmo padrao de validacao ja usado em
// acaoCriarAtendimentoOnline/acaoCriarPedidoInicial, Code.js).
function _resolverEstagiarioAlvoAudiencia(payload, emailUsuario, ehThales) {
  var turmaInformada = String((payload && payload.turma) || '').trim();
  if (!turmaInformada) return null;

  var emailAlvo = ehThales
    ? normalizarChave((payload && payload.emailAluno) || '')
    : normalizarChave(emailUsuario);
  if (!emailAlvo) return null;

  var achado = getTodosEstagiariosCompletos().filter(function(e) {
    return normalizarChave(e.email) === emailAlvo && e.turma === turmaInformada;
  })[0];
  if (!achado) return null;

  return { nome: achado.nome, email: achado.email, semestre: achado.semestre };
}

// --- Validacao de payload (campos obrigatorios, data futura, tipo da picklist) ---
// Reaproveitada tanto na criacao quanto no reenvio — mesma regra nos dois
// fluxos (RN-08/campos obrigatorios valem sempre, mesmo corrigindo um
// registro reprovado).
function _validarPayloadAudiencia(payload, parametros) {
  if (!parametros || !parametros.length) {
    return { valido: false, erro: 'Nenhum tipo de audiência cadastrado. Procure o coordenador.' };
  }

  var tipo = String((payload && payload.tipo) || '').trim();
  var vara = String((payload && payload.vara) || '').trim();
  var processo = String((payload && payload.processo) || '').trim();
  var hora = String((payload && payload.hora) || '').trim();
  var partes = String((payload && payload.partes) || '').trim();
  var obs = String((payload && payload.obs) || '').trim();
  var dataInformada = (payload && payload.data) ? new Date(payload.data + 'T00:00:00') : null;

  if (!dataInformada || isNaN(dataInformada.getTime()) || !tipo || !vara || !processo) {
    return { valido: false, erro: 'Informe a data, o tipo, a vara e o número do processo.' };
  }

  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  if (dataInformada > hoje) {
    return { valido: false, erro: 'Não é possível registrar uma audiência com data futura.' };
  }

  var tipoValido = parametros.some(function(p) { return normalizarChave(p.tipo) === normalizarChave(tipo); });
  if (!tipoValido) {
    return { valido: false, erro: 'Tipo de audiência inválido. Selecione uma das opções disponíveis.' };
  }

  return {
    valido: true,
    data: dataInformada,
    hora: hora,
    tipo: tipo,
    vara: vara,
    processo: processo,
    partes: partes,
    obs: obs
  };
}

// Numero do processo "despido de pontuacao e mascara" (RN-07) — mantem so
// digitos, mesma convencao do padrao CNJ (pontos/tracos sao mascara, nunca
// parte do numero).
function _normalizarProcessoAudiencia(valor) {
  return String(valor || '').replace(/\D/g, '');
}

// --- Duplicidade (RN-07): mesmo estagiario + mesmo PROCESSO + mesma DATA,
// independente do TIPO e do STATUS (inclusive Reprovada). Retorna o registro
// conflitante (para a mensagem de erro citar o ID) ou null.
function _audienciaDuplicada(nomeEstagiario, processoNormalizado, dataFormatada, linhaIgnorar) {
  var chaveNome = normalizarChave(nomeEstagiario);
  var lista = getTodasAudienciasEstagiario();
  for (var i = 0; i < lista.length; i++) {
    var reg = lista[i];
    if (linhaIgnorar && reg._linha === linhaIgnorar) continue;
    if (normalizarChave(reg.estagiario) !== chaveNome) continue;
    if (_normalizarProcessoAudiencia(reg.processo) !== processoNormalizado) continue;
    if (reg.data !== dataFormatada) continue;
    return reg;
  }
  return null;
}

// --- Criacao (Painel Aluno) ---
// payload: { data, hora, tipo, vara, processo, partes, obs, turma,
// emailAluno (so quando ehThales) }.
function criarAudienciaEstagiario(payload, emailUsuario, ehThales) {
  var parametros = lerParametrosAudiencias();
  var validacao = _validarPayloadAudiencia(payload, parametros);
  if (!validacao.valido) return { sucesso: false, erro: validacao.erro };

  var alvo = _resolverEstagiarioAlvoAudiencia(payload, emailUsuario, ehThales);
  if (!alvo) return { sucesso: false, erro: 'Não foi possível identificar o estagiário(a) e a turma selecionados.' };

  var processoNormalizado = _normalizarProcessoAudiencia(validacao.processo);
  var dataFormatada = formatarData(validacao.data);
  var conflito = _audienciaDuplicada(alvo.nome, processoNormalizado, dataFormatada, null);
  if (conflito) {
    return { sucesso: false, erro: 'Você já registrou uma audiência para este processo nesta data (registro ' + conflito.id + ').' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_AUDIENCIAS_ESTAGIARIO);
  if (!aba) return { sucesso: false, erro: 'Aba audiencias_estagiario não encontrada.' };

  var id = proximoNumeroAudienciaEstagiario();
  var agora = new Date();
  var col = CONFIG.AUDIENCIAS_ESTAGIARIO_COL;

  var novaLinha = [];
  novaLinha[col.ID] = id;
  novaLinha[col.DATA] = validacao.data;
  novaLinha[col.HORA] = validacao.hora;
  novaLinha[col.ESTAGIARIO] = alvo.nome;
  novaLinha[col.EMAIL] = alvo.email;
  novaLinha[col.TIPO] = validacao.tipo;
  novaLinha[col.VARA] = validacao.vara;
  novaLinha[col.PROCESSO] = validacao.processo;
  novaLinha[col.PARTES] = validacao.partes;
  novaLinha[col.OBS] = validacao.obs;
  novaLinha[col.STATUS] = CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.PENDENTE;
  novaLinha[col.OBS_APROVACAO] = '';
  novaLinha[col.ALTERADO_EM] = agora;
  novaLinha[col.SEMESTRE] = alvo.semestre;

  var proximaLinhaPlanilha = aba.getLastRow() + 1;
  aba.getRange(proximaLinhaPlanilha, col.SEMESTRE + 1, 1, 1).setNumberFormat('@');
  aba.getRange(proximaLinhaPlanilha, 1, 1, CONFIG.TOTAL_COLUNAS_AUDIENCIAS_ESTAGIARIO).setValues([novaLinha]);

  return { sucesso: true, id: id, linha: proximaLinhaPlanilha };
}

// --- Reenvio (Pendente ou Reprovada — RN-04) ---
// Reaproveita a MESMA linha/ID. SEMESTRE nunca e alterado aqui (estatico,
// RN-02) — so a proxima aprovacao volta a contar para a meta do semestre
// original do registro.
function reenviarAudienciaEstagiario(payload, emailUsuario, ehThales) {
  var linha = parseInt(payload && payload._linha, 10);
  if (isNaN(linha) || linha < 2) return { sucesso: false, erro: 'Registro inválido.' };

  var parametros = lerParametrosAudiencias();
  var validacao = _validarPayloadAudiencia(payload, parametros);
  if (!validacao.valido) return { sucesso: false, erro: validacao.erro };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_AUDIENCIAS_ESTAGIARIO);
  if (!aba) return { sucesso: false, erro: 'Aba audiencias_estagiario não encontrada.' };

  var col = CONFIG.AUDIENCIAS_ESTAGIARIO_COL;
  var linhaAtual = aba.getRange(linha, 1, 1, CONFIG.TOTAL_COLUNAS_AUDIENCIAS_ESTAGIARIO).getValues()[0];
  var reg = rowParaObjetoAudienciaEstagiario(linhaAtual, linha - 2);

  var statusChave = normalizarChave(reg.status);
  var elegivel = statusChave === normalizarChave(CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.REPROVADA) ||
    statusChave === normalizarChave(CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.PENDENTE);
  if (!elegivel) {
    return { sucesso: false, erro: 'Apenas registros pendentes ou reprovados podem ser editados e reenviados.' };
  }
  if (!ehThales && normalizarChave(reg.email) !== normalizarChave(emailUsuario)) {
    return { sucesso: false, erro: 'Este registro não pertence a você.' };
  }

  var processoNormalizado = _normalizarProcessoAudiencia(validacao.processo);
  var dataFormatada = formatarData(validacao.data);
  var conflito = _audienciaDuplicada(reg.estagiario, processoNormalizado, dataFormatada, linha);
  if (conflito) {
    return { sucesso: false, erro: 'Você já registrou uma audiência para este processo nesta data (registro ' + conflito.id + ').' };
  }

  var agora = new Date();
  aba.getRange(linha, col.DATA + 1).setValue(validacao.data);
  aba.getRange(linha, col.HORA + 1).setValue(validacao.hora);
  aba.getRange(linha, col.TIPO + 1).setValue(validacao.tipo);
  aba.getRange(linha, col.VARA + 1).setValue(validacao.vara);
  aba.getRange(linha, col.PROCESSO + 1).setValue(validacao.processo);
  aba.getRange(linha, col.PARTES + 1).setValue(validacao.partes);
  aba.getRange(linha, col.OBS + 1).setValue(validacao.obs);
  aba.getRange(linha, col.STATUS + 1).setValue(CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.PENDENTE);
  aba.getRange(linha, col.OBS_APROVACAO + 1).setValue('');
  aba.getRange(linha, col.ALTERADO_EM + 1).setValue(agora);

  return { sucesso: true };
}

// --- Fila de aprovacao (Painel de Thales) ---
function getDadosAprovacaoAudiencias() {
  var todos = getTodasAudienciasEstagiario();

  var pendentes = todos
    .filter(function(a) { return normalizarChave(a.status) === normalizarChave(CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.PENDENTE); })
    .sort(function(a, b) { return String(a.data).localeCompare(String(b.data)); });

  var historico = todos
    .filter(function(a) { return normalizarChave(a.status) !== normalizarChave(CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.PENDENTE); })
    .sort(function(a, b) { return (b._linha || 0) - (a._linha || 0); })
    .slice(0, 50);

  return { pendentes: pendentes, historico: historico };
}

function aprovarAudienciaEstagiario(linha) {
  var linhaNum = parseInt(linha, 10);
  if (isNaN(linhaNum) || linhaNum < 2) return { sucesso: false, erro: 'Registro inválido.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_AUDIENCIAS_ESTAGIARIO);
  if (!aba) return { sucesso: false, erro: 'Aba audiencias_estagiario não encontrada.' };

  var col = CONFIG.AUDIENCIAS_ESTAGIARIO_COL;
  var linhaAtual = aba.getRange(linhaNum, 1, 1, CONFIG.TOTAL_COLUNAS_AUDIENCIAS_ESTAGIARIO).getValues()[0];
  var reg = rowParaObjetoAudienciaEstagiario(linhaAtual, linhaNum - 2);

  aba.getRange(linhaNum, col.STATUS + 1).setValue(CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.APROVADA);
  aba.getRange(linhaNum, col.OBS_APROVACAO + 1).setValue('');
  aba.getRange(linhaNum, col.ALTERADO_EM + 1).setValue(new Date());

  var avisoEmail = null;
  if (reg.email) {
    var parametros = lerParametrosAudiencias();
    var turmaRegistro = resolverTurmaDoRegistro(reg.estagiario || reg.email, parseDataBR(reg.data));
    var contagens = contarAudienciasPorTipo(reg.estagiario, turmaRegistro, getTodasAudienciasEstagiario(), parametros);
    var contagemTipo = contagens.filter(function(c) { return normalizarChave(c.tipo) === normalizarChave(reg.tipo); })[0];
    var progressoTexto = contagemTipo ? (contagemTipo.realizado + '/' + contagemTipo.meta) : '';

    avisoEmail = enviarEmailAudienciaAprovada(reg.email, reg.estagiario, reg.id, reg.tipo, reg.data, reg.vara, reg.processo, progressoTexto);

    // A-3 (meta de um tipo cumprida) / A-4 (todas as metas cumpridas) — ver
    // Mensagens.js. Disparado so apos a contagem ja refletir esta aprovacao.
    var avisoMetas = dispararAvisosMetaAudiencia(reg.estagiario, reg.email, turmaRegistro, contagens);
    if (avisoMetas) avisoEmail = avisoEmail ? (avisoEmail + ' | ' + avisoMetas) : avisoMetas;
  }

  return { sucesso: true, avisoEmail: avisoEmail };
}

function reprovarAudienciaEstagiario(linha, motivo) {
  var linhaNum = parseInt(linha, 10);
  if (isNaN(linhaNum) || linhaNum < 2) return { sucesso: false, erro: 'Registro inválido.' };

  var motivoTexto = String(motivo || '').trim();
  if (!motivoTexto) return { sucesso: false, erro: 'Informe o motivo da reprovação.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_AUDIENCIAS_ESTAGIARIO);
  if (!aba) return { sucesso: false, erro: 'Aba audiencias_estagiario não encontrada.' };

  var col = CONFIG.AUDIENCIAS_ESTAGIARIO_COL;
  var linhaAtual = aba.getRange(linhaNum, 1, 1, CONFIG.TOTAL_COLUNAS_AUDIENCIAS_ESTAGIARIO).getValues()[0];
  var reg = rowParaObjetoAudienciaEstagiario(linhaAtual, linhaNum - 2);

  aba.getRange(linhaNum, col.STATUS + 1).setValue(CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.REPROVADA);
  aba.getRange(linhaNum, col.OBS_APROVACAO + 1).setValue(motivoTexto);
  aba.getRange(linhaNum, col.ALTERADO_EM + 1).setValue(new Date());

  var avisoEmail = null;
  if (reg.email) {
    avisoEmail = enviarEmailAudienciaReprovada(reg.email, reg.estagiario, reg.id, reg.tipo, reg.data, reg.vara, reg.processo, motivoTexto);
  }

  return { sucesso: true, avisoEmail: avisoEmail };
}

// --- Acoes em lote (checkboxes da fila "Pendentes de aprovacao") ---
function aprovarAudienciasEmLote(linhas) {
  var lista = Array.isArray(linhas) ? linhas : [];
  var falhas = [];
  var avisosEmail = [];

  lista.forEach(function(linha) {
    var res = aprovarAudienciaEstagiario(linha);
    if (!res.sucesso) falhas.push({ linha: linha, erro: res.erro });
    else if (res.avisoEmail) avisosEmail.push({ linha: linha, erro: res.avisoEmail });
  });

  return { sucesso: true, total: lista.length, falhas: falhas, avisosEmail: avisosEmail };
}

function reprovarAudienciasEmLote(linhas, motivo) {
  var motivoTexto = String(motivo || '').trim();
  if (!motivoTexto) return { sucesso: false, erro: 'Informe o motivo da reprovação.' };

  var lista = Array.isArray(linhas) ? linhas : [];
  var falhas = [];
  var avisosEmail = [];

  lista.forEach(function(linha) {
    var res = reprovarAudienciaEstagiario(linha, motivoTexto);
    if (!res.sucesso) falhas.push({ linha: linha, erro: res.erro });
    else if (res.avisoEmail) avisosEmail.push({ linha: linha, erro: res.avisoEmail });
  });

  return { sucesso: true, total: lista.length, falhas: falhas, avisosEmail: avisosEmail };
}

// --- Contagem por tipo (meta/progresso — Painel Aluno, Panorama, Gráficos) ---
// Filtrada pela TURMA informada (ex. "2026.02-A" ou "2026.02" para "todas as
// turmas"). So considera STATUS = Aprovada (RN-05). "excedente" so fica true
// quando a meta ja foi definida (meta > 0) e o realizado a ultrapassa (RN-06)
// — a barra de progresso trava em 100% no frontend, mas o numero real
// (realizado) e sempre exibido e conta integralmente na Parcial de Horas.
//
// A turma de cada registro e resolvida em tempo de leitura a partir do
// estagiario e da data da audiencia, sem materializar TURMA na aba
// transacional (decisao de arquitetura, 27/07/2026).
function contarAudienciasPorTipo(nomeEstagiario, turma, lista, parametros) {
  var chaveNome = normalizarChave(nomeEstagiario);
  var resolvedorTurma = criarResolvedorTurma();

  var aprovadas = (lista || []).filter(function(a) {
    if (normalizarChave(a.estagiario) !== chaveNome) return false;
    if (normalizarChave(a.status) !== normalizarChave(CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.APROVADA)) return false;
    var turmaRegistro = resolvedorTurma(a.estagiario || a.email, parseDataBR(a.data));
    return turmaCasaComFiltro(turmaRegistro, turma);
  });

  return (parametros || []).map(function(p) {
    var realizado = aprovadas.filter(function(a) { return normalizarChave(a.tipo) === normalizarChave(p.tipo); }).length;
    var meta = p.meta || 0;
    var faltante = Math.max(0, meta - realizado);
    var percentual = meta > 0 ? Math.min(100, Math.round((realizado / meta) * 100)) : (realizado > 0 ? 100 : 0);
    var excedente = meta > 0 && realizado > meta;
    return {
      tipo: p.tipo,
      meta: meta,
      horas: p.horas || 0,
      realizado: realizado,
      faltante: faltante,
      percentual: percentual,
      excedente: excedente
    };
  });
}
