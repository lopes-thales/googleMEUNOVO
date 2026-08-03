// Turma.gs
// Responsabilidade: dominio da dimensao TURMA e da MATRICULA DE ESTAGIO no
// projeto "Painel de Thales". Unico arquivo com permissao de ler/escrever a
// aba `turmas`.
//
// MODELO v2 — 01/08/2026. Substitui integralmente o modelo de derivacao
// implantado em 27/07/2026 e corrigido em 30/07/2026.
//
// O que mudou e por que:
// - ANTES: a turma de cada registro era INFERIDA em tempo de leitura, a partir
//   do nome do aluno em texto e de uma data de referencia, com a regra
//   "mes 1 ou 7 -> antecipado" e uma cadeia de desempate de quatro niveis.
//   Isso tornava a classificacao instavel (editar uma diligencia de 2026.01
//   em agosto a movia sozinha para 2026.02-R, porque a data de referencia era
//   ALTERADO EM), fragil (join por nome em texto livre) e cara (uma leitura
//   completa de estagiarios por aluno agregado, duas vezes, no Panorama).
// - AGORA: a matricula e MATERIALIZADA no registro no momento da atribuicao.
//   Cada aba transacional guarda ID_MATRICULA (chave forte, estagiarios!A) e
//   TURMA (espelho legivel). A leitura vira comparacao de string. Nao ha mais
//   nada a inferir nem a desempatar.
//
// Consequencia direta: _resolverEntreCandidatos, resolverTurmaDoRegistro,
// _resolverTurmaLocalmente, criarResolvedorTurma e anotarTurmaEmRegistros
// deixaram de existir. Se alguma alteracao futura precisar "descobrir" a turma
// de um registro ja gravado, a resposta correta e ler a coluna TURMA daquele
// registro — nao recalcular.
//
// Regras de negocio implementadas aqui (ver RN_Modelo_Turmas_v2.md):
// - RN-T01: -A e sempre janeiro (.01) ou julho (.02), mes inteiro; -R vai de
//   fevereiro a junho (.01) ou de agosto a dezembro (.02).
// - RN-T02: um aluno NUNCA tem duas matriculas ativas ao mesmo tempo. E o que
//   torna resolverMatriculaAtiva() deterministico.
// - RN-T05: nao se atribui um registro a uma turma cuja DATA_INICIO seja
//   posterior a DF REAL do registro; DF REAL vazia tambem bloqueia.

// =====================================================================
// 1. Cadastro de turmas (aba `turmas`)
// =====================================================================

// Le a aba `turmas` inteira. Devolve [{ codigo, dataInicio, dataFim, ativa }]
// com as datas ja normalizadas para Date puro (sem horario) ou null.
// Cacheado por execucao para nao reler a planilha em cada chamada.
var _cacheTurmas_ = null;

function obterTurmas() {
  if (_cacheTurmas_) return _cacheTurmas_;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_TURMAS);
  if (!aba) {
    _cacheTurmas_ = [];
    return _cacheTurmas_;
  }

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) {
    _cacheTurmas_ = [];
    return _cacheTurmas_;
  }

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_TURMAS).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var codigo = String(dados[i][CONFIG.TURMAS_COL.CODIGO] || '').trim();
    if (!codigo) continue;
    lista.push({
      codigo: codigo,
      dataInicio: parseDataBR(dados[i][CONFIG.TURMAS_COL.DATA_INICIO]),
      dataFim: parseDataBR(dados[i][CONFIG.TURMAS_COL.DATA_FIM]),
      ativa: String(dados[i][CONFIG.TURMAS_COL.ATIVA] || '').trim().toUpperCase() === 'S'
    });
  }
  _cacheTurmas_ = lista;
  return _cacheTurmas_;
}

// Limpa o cache de turmas. Chamar apos qualquer escrita na aba `turmas`
// dentro da mesma execucao (usado pela migracao).
function invalidarCacheTurmas() {
  _cacheTurmas_ = null;
}

function obterTurmaPorCodigo(codigo) {
  var alvo = String(codigo || '').trim();
  if (!alvo) return null;
  var turmas = obterTurmas();
  for (var i = 0; i < turmas.length; i++) {
    if (turmas[i].codigo === alvo) return turmas[i];
  }
  return null;
}

// Retorna a turma corrente:
//   1. a linha marcada com ATIVA = 'S' (override manual para o periodo de
//      sobreposicao administrativa, ex.: fim de julho com o antecipado
//      encerrando e o regular ja cadastrado);
//   2. senao, a unica turma cuja janela contem hoje — se mais de uma contiver,
//      a de DATA_INICIO mais recente;
//   3. senao, a de DATA_INICIO mais recente entre todas.
// Devolve string vazia se a aba `turmas` estiver vazia.
function obterTurmaCorrente() {
  var turmas = obterTurmas();
  if (turmas.length === 0) return '';

  for (var i = 0; i < turmas.length; i++) {
    if (turmas[i].ativa) return turmas[i].codigo;
  }

  var hoje = new Date();
  var hojeTs = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();

  var contendo = turmas.filter(function(t) {
    return t.dataInicio && t.dataFim &&
           hojeTs >= t.dataInicio.getTime() && hojeTs <= t.dataFim.getTime();
  });

  var pool = contendo.length > 0 ? contendo : turmas.slice();
  pool.sort(function(a, b) {
    var ta = a.dataInicio ? a.dataInicio.getTime() : 0;
    var tb = b.dataInicio ? b.dataInicio.getTime() : 0;
    return tb - ta;
  });

  return pool[0].codigo;
}

// Lista os codigos de turma cadastrados, do mais recente para o mais antigo.
// ALTERADO: le a aba `turmas` em vez de derivar do conjunto de alunos.
function listarTurmasDistintas() {
  return obterTurmas()
    .map(function(t) { return t.codigo; })
    .sort()
    .reverse();
}

// =====================================================================
// 2. Helpers de codigo/rotulo de turma
// =====================================================================

// Retorna o rotulo legivel de uma turma para exibicao nos selects e selos.
//   "2026.02-A" -> "2026.02 — Antecipado"
//   "2026.02-R" -> "2026.02 — Regular"
//   "2026.02"   -> "2026.02 — Todas as turmas"
function formatarRotuloTurma(turma) {
  var codigo = String(turma || '').trim();
  if (!codigo) return '';

  var partes = codigo.split('-');
  var semestre = partes[0] || '';
  var sufixo = partes[1] || '';

  if (sufixo === 'A') return semestre + ' — Antecipado';
  if (sufixo === 'R') return semestre + ' — Regular';
  return semestre + ' — Todas as turmas';
}

// Rotulo EXPLICITO de uma MATRICULA (nao de uma turma abstrata), usado no
// seletor do Painel Aluno a partir de 02/08/2026. Acrescenta ao rotulo da
// turma a janela de meses efetiva daquela matricula:
//   "2026.01 — Regular (abr–jun/2026)"
//   "2026.02 — Antecipado (jul/2026)"
//   "2026.02 — Regular (nov/2026–jan/2027)"
// Sem janela conhecida, degrada silenciosamente para formatarRotuloTurma().
//
// Montado NO SERVIDOR de proposito: depende de dataInicioEfetiva/dataFimEfetiva,
// que sao objetos Date e nunca podem trafegar no payload de google.script.run
// (ver nota em getTodosEstagiariosParaCliente).
var MESES_ABREV_ = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatarPeriodoMatricula(inicio, fim) {
  if (!inicio && !fim) return '';
  if (inicio && !fim) return MESES_ABREV_[inicio.getMonth()] + '/' + inicio.getFullYear();
  if (!inicio && fim) return MESES_ABREV_[fim.getMonth()] + '/' + fim.getFullYear();

  var mesInicio = MESES_ABREV_[inicio.getMonth()];
  var anoInicio = inicio.getFullYear();
  var mesFim = MESES_ABREV_[fim.getMonth()];
  var anoFim = fim.getFullYear();

  if (anoInicio === anoFim && mesInicio === mesFim) return mesInicio + '/' + anoInicio;
  if (anoInicio === anoFim) return mesInicio + '–' + mesFim + '/' + anoInicio;
  return mesInicio + '/' + anoInicio + '–' + mesFim + '/' + anoFim;
}

function formatarRotuloMatricula(turma, inicio, fim) {
  var base = formatarRotuloTurma(turma);
  if (!base) return '';
  var periodo = formatarPeriodoMatricula(inicio, fim);
  return periodo ? base + ' (' + periodo + ')' : base;
}

// Extrai o semestre base ("AAAA.SS") de um codigo de turma. Se ja receber
// um semestre sem sufixo, devolve o proprio valor.
// A PARTIR DE 01/08/2026 esta e a UNICA origem do campo SEMESTRE gravado nas
// abas transacionais (RN-T08): SEMESTRE deixou de ser calculado da data do
// registro e passou a ser derivado da TURMA escolhida.
function extrairSemestreDaTurma(turma) {
  return String(turma || '').split('-')[0];
}

// Retorna true se o codigo de turma casa com o filtro. O filtro pode ser:
// - um codigo completo (ex.: "2026.02-A") -> casamento exato;
// - um semestre base (ex.: "2026.02") -> prefixo do codigo de turma.
function turmaCasaComFiltro(turma, filtro) {
  var t = String(turma || '').trim();
  var f = String(filtro || '').trim();
  if (!t || !f) return false;
  if (t === f) return true;
  return t.indexOf(f + '-') === 0;
}

// Deriva o codigo da turma cuja janela contem a data informada.
//
// ATENCAO — escopo reduzido em 01/08/2026. Esta funcao SAIU do caminho quente.
// Ela NAO classifica mais registros transacionais (que agora tem TURMA gravada)
// e nao deve ser usada para isso. Sobrou para exatamente dois usos:
//   a) a aba `atendimentos`, que e alimentada por fora do painel e nao tem
//      colunas de matricula (a inferencia ali continua exata por causa da
//      RN-T02: nunca ha duas matriculas ativas na mesma data);
//   b) o backfill unico de MigracaoTurmaV2.js.
//
// A regra antiga "mes 1 ou 7 -> antecipado" foi REMOVIDA: agora a janela vem
// da aba `turmas`, que e a fonte de verdade. Se nenhuma turma cadastrada
// contiver a data, devolve string vazia — melhor vazio do que chutado.
function calcularTurma(data, semestreFallback) {
  var ref = parseDataBR(data);
  if (ref) {
    var refTs = ref.getTime();
    var turmas = obterTurmas();
    for (var i = 0; i < turmas.length; i++) {
      var t = turmas[i];
      if (t.dataInicio && t.dataFim &&
          refTs >= t.dataInicio.getTime() && refTs <= t.dataFim.getTime()) {
        return t.codigo;
      }
    }
  }

  var fallback = String(semestreFallback || '').trim();
  if (fallback) return fallback + '-R';
  return '';
}

// Converte string "dd/MM/yyyy" (com ou sem horario) em Date puro, ignorando
// o horario. Retorna null se nao for possivel.
function parseDataBR(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  }
  var texto = String(valor || '').split(' ')[0].trim();
  var m = texto.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!m) return null;
  var dia = parseInt(m[1], 10);
  var mes = parseInt(m[2], 10) - 1;
  var ano = parseInt(m[3], 10);
  var d = new Date(ano, mes, dia);
  if (isNaN(d.getTime()) || d.getFullYear() !== ano || d.getMonth() !== mes || d.getDate() !== dia) return null;
  return d;
}

// =====================================================================
// 3. Matriculas de estagio (aba `estagiarios`)
// =====================================================================

// Retorna todas as matriculas de estagio (uma por LINHA de estagiarios) com
// os campos usados pelo painel. `idMatricula` (coluna A) e a chave forte.
//
// ALTERADO: a TURMA e lida direto de estagiarios!M, sem derivacao. Se a celula
// estiver vazia, a linha fica com turma vazia e aparece nos diagnosticos —
// nao ha mais fallback silencioso a partir de DATA_INICIO.
function getTodosEstagiariosComTurma() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_ESTAGIARIOS).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var nome = String(row[CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    if (!nome) continue;

    lista.push({
      // id = coluna A, identificador do aluno usado por planilhas EXTERNAS.
      // O painel apenas LE esta coluna, nunca escreve nela.
      id: row[CONFIG.ESTAGIARIOS_COL.ID],
      // idMatricula = coluna N, ID da matricula de estagio (MAT-XXXX), unico
      // por LINHA. E a chave forte gravada nas abas transacionais.
      idMatricula: String(row[CONFIG.ESTAGIARIOS_COL.MATRICULA_ESTAGIO] || '').trim(),
      linha: i + 2,
      nome: nome,
      email: String(row[CONFIG.ESTAGIARIOS_COL.EMAIL] || '').trim(),
      trimestre: row[CONFIG.ESTAGIARIOS_COL.TRIMESTRE],
      finalizado: !!String(row[CONFIG.ESTAGIARIOS_COL.FINALIZADO] || '').trim(),
      semestre: normalizarSemestreLido(row[CONFIG.ESTAGIARIOS_COL.SEMESTRE]),
      drive: row[CONFIG.ESTAGIARIOS_COL.DRIVE],
      arquivado: String(row[CONFIG.ESTAGIARIOS_COL.ARQUIVADO] || '').trim(),
      periodo: row[CONFIG.ESTAGIARIOS_COL.PERIODO],
      matricula: row[CONFIG.ESTAGIARIOS_COL.MATRICULA],
      dataInicio: row[CONFIG.ESTAGIARIOS_COL.DATA_INICIO],
      dataFim: row[CONFIG.ESTAGIARIOS_COL.DATA_FIM],
      turma: String(row[CONFIG.ESTAGIARIOS_COL.TURMA] || '').trim()
    });
  }

  // Janela EFETIVA de cada matricula: a da aba `turmas`, salvo override
  // individual em estagiarios!K/L. Preenchida aqui, num segundo passe, para
  // que obterTurmas() seja lido uma unica vez.
  // dataFimEfetiva substitui o antigo uso de estagiarios!L na mensageria de
  // encerramento (Mensagens.js): a data de fim e uma propriedade da COORTE,
  // nao de cada aluno — antes ela precisava estar repetida em cada linha e o
  // consolidado da turma usava "a data do primeiro aluno encontrado" como
  // representante.
  lista.forEach(function(e) {
    var t = obterTurmaPorCodigo(e.turma);
    e.dataInicioEfetiva = parseDataBR(e.dataInicio) || (t ? t.dataInicio : null);
    e.dataFimEfetiva = parseDataBR(e.dataFim) || (t ? t.dataFim : null);
  });

  return lista;
}

// Versao segura para o cliente: sem objetos Date.
// google.script.run nao serializa Date de forma confiavel dentro de um payload
// maior — um UNICO registro com dataInicio/dataFim/trimestre preenchidos faz a
// resposta inteira chegar como null no navegador (bug diagnosticado em
// 28/07/2026). Usar SEMPRE esta versao em qualquer payload que va para o
// cliente; getTodosEstagiariosComTurma() fica reservada ao servidor.
function getTodosEstagiariosParaCliente() {
  return getTodosEstagiariosComTurma().map(function(e) {
    return {
      id: e.id,
      idMatricula: e.idMatricula,
      nome: e.nome,
      email: e.email,
      finalizado: e.finalizado,
      semestre: e.semestre,
      drive: e.drive,
      arquivado: e.arquivado,
      periodo: e.periodo,
      matricula: e.matricula,
      turma: e.turma,
      // 02/08/2026: rotulo explicito da matricula, ja pronto para exibicao
      // ("2026.01 — Regular (abr–jun/2026)"). Calculado aqui porque depende
      // das datas efetivas, que sao Date e ficam de fora do payload.
      rotulo: formatarRotuloMatricula(e.turma, e.dataInicioEfetiva, e.dataFimEfetiva)
    };
  });
}

// Janela efetiva de uma matricula: a da aba `turmas`, salvo override
// individual preenchido em estagiarios!K/L (extensao/excecao real).
function _janelaDaMatricula(mat) {
  if (mat.dataInicioEfetiva || mat.dataFimEfetiva) {
    return { inicio: mat.dataInicioEfetiva || null, fim: mat.dataFimEfetiva || null };
  }
  var turma = obterTurmaPorCodigo(mat.turma);
  return {
    inicio: parseDataBR(mat.dataInicio) || (turma ? turma.dataInicio : null),
    fim: parseDataBR(mat.dataFim) || (turma ? turma.dataFim : null)
  };
}

// Resolve a matricula de um aluno ATIVA numa data de referencia.
//
// chaveAluno pode ser nome OU e-mail. Como um aluno nunca tem duas matriculas
// ativas ao mesmo tempo (RN-T02), o resultado e unico ou vazio — NUNCA
// ambiguo. Nao ha cadeia de desempate: se nenhuma janela contiver a data, a
// funcao devolve vazio em vez de chutar.
//
// Usada por: registros criados pelo proprio aluno no PainelAluno (RN-T07),
// pela aba `atendimentos` e pelo backfill.
//
// Devolve { idMatricula, turma, nome, email } ou null.
function resolverMatriculaAtiva(chaveAluno, dataReferencia, listaOpcional) {
  var chave = normalizarChave(chaveAluno);
  if (!chave) return null;

  var ref = parseDataBR(dataReferencia);
  var lista = listaOpcional || getTodosEstagiariosComTurma();

  var candidatos = lista.filter(function(e) {
    return normalizarChave(e.nome) === chave || normalizarChave(e.email) === chave;
  });

  if (candidatos.length === 0) return null;

  if (candidatos.length === 1) {
    return _formatarMatricula(candidatos[0]);
  }

  if (!ref) return null;
  var refTs = ref.getTime();

  for (var i = 0; i < candidatos.length; i++) {
    var janela = _janelaDaMatricula(candidatos[i]);
    if (janela.inicio && janela.fim &&
        refTs >= janela.inicio.getTime() && refTs <= janela.fim.getTime()) {
      return _formatarMatricula(candidatos[i]);
    }
  }

  return null;
}

function _formatarMatricula(e) {
  return {
    idMatricula: e.idMatricula,
    turma: e.turma,
    nome: e.nome,
    email: e.email,
    linha: e.linha
  };
}

// Lista as matriculas NAO finalizadas de um aluno, do mais recente para o mais
// antigo. Alimenta o seletor de turma da Distribuicao e do modal de edicao.
// Devolve [{ idMatricula, turma, rotulo, dataInicio }] — dataInicio como
// string "dd/MM/yyyy" para nao quebrar a serializacao do google.script.run.
function listarMatriculasDoAluno(chaveAluno) {
  var chave = normalizarChave(chaveAluno);
  if (!chave) return [];

  var lista = getTodosEstagiariosComTurma().filter(function(e) {
    if (e.finalizado) return false;
    return normalizarChave(e.nome) === chave || normalizarChave(e.email) === chave;
  });

  return lista.map(function(e) {
    var janela = _janelaDaMatricula(e);
    return {
      idMatricula: e.idMatricula,
      turma: e.turma,
      rotulo: formatarRotuloTurma(e.turma),
      dataInicio: janela.inicio
        ? Utilities.formatDate(janela.inicio, CONFIG.TIMEZONE, 'dd/MM/yyyy')
        : ''
    };
  }).sort(function(a, b) {
    return String(b.turma).localeCompare(String(a.turma));
  });
}

// Devolve, para todos os alunos nao finalizados, o mapa
// { chaveNormalizadaDoNome: [matriculas] }. Usado pelo frontend da
// Distribuicao e do modal de edicao para montar os selects de turma sem uma
// chamada ao servidor por linha. O endpoint que o expoe ao cliente fica em
// Code.js (getMapaMatriculas), seguindo a convencao do projeto.
function mapaMatriculasNaoFinalizadas() {
  var mapa = {};
  getTodosEstagiariosComTurma().forEach(function(e) {
    if (e.finalizado || !e.turma) return;
    var chave = normalizarChave(e.nome);
    if (!mapa[chave]) mapa[chave] = [];
    var janela = _janelaDaMatricula(e);
    mapa[chave].push({
      idMatricula: e.idMatricula,
      turma: e.turma,
      rotulo: formatarRotuloTurma(e.turma),
      dataInicio: janela.inicio
        ? Utilities.formatDate(janela.inicio, CONFIG.TIMEZONE, 'dd/MM/yyyy')
        : ''
    });
  });
  Object.keys(mapa).forEach(function(k) {
    mapa[k].sort(function(a, b) { return String(b.turma).localeCompare(String(a.turma)); });
  });
  return mapa;
}

// REMOVIDO EM 02/08/2026: anotarTurmaEmAtendimentos.
//
// A aba `atendimentos` passou a trazer SEMESTRE e TURMA por formula (colunas
// K e L), lidas em getTodosAtendimentos (Panorama.js). Com isso NENHUMA aba
// transacional depende mais de inferencia de turma.
//
// A funcao removida resolvia a turma pelo nome do aluno + data do atendimento.
// O defeito: quando o aluno tinha uma unica matricula cadastrada, o casamento
// por nome resolvia sozinho e a data era ignorada — atendimentos de um periodo
// em que ele nem era estagiario apareciam na turma atual.
//
// Nao reintroduzir. Se alguma leitura precisar da turma de um atendimento, a
// resposta e a coluna L daquela linha.

// =====================================================================
// 4. Validacao de atribuicao (RN-T05)
// =====================================================================

// Verifica se um registro com a DF REAL informada pode ser atribuido a uma
// turma. Regra: a DF REAL nao pode ser anterior a DATA_INICIO da turma de
// destino; DF REAL vazia ou invalida TAMBEM bloqueia (decisao de 01/08/2026 —
// nao ha substituicao pela DF).
//
// Devolve { valido: true } ou { valido: false, erro: '...' }.
function validarTurmaParaRegistro(codigoTurma, dfReal) {
  var codigo = String(codigoTurma || '').trim();
  if (!codigo) {
    return { valido: false, erro: 'Selecione a turma do estagiário antes de salvar.' };
  }

  var turma = obterTurmaPorCodigo(codigo);
  if (!turma) {
    return { valido: false, erro: 'A turma "' + codigo + '" não está cadastrada na aba "turmas".' };
  }

  if (!turma.dataInicio) {
    return { valido: false, erro: 'A turma "' + codigo + '" está sem DATA_INICIO na aba "turmas".' };
  }

  var ref = parseDataBR(dfReal);
  if (!ref) {
    return {
      valido: false,
      erro: 'Este registro está sem DF Real. Preencha a DF Real antes de atribuí-lo a uma turma.'
    };
  }

  if (ref.getTime() < turma.dataInicio.getTime()) {
    return {
      valido: false,
      erro: 'A DF Real (' + Utilities.formatDate(ref, CONFIG.TIMEZONE, 'dd/MM/yyyy') +
            ') é anterior ao início da turma ' + formatarRotuloTurma(codigo) + ' (' +
            Utilities.formatDate(turma.dataInicio, CONFIG.TIMEZONE, 'dd/MM/yyyy') +
            '). Escolha outra turma ou ajuste a DF Real.'
    };
  }

  return { valido: true };
}

// Resolve e valida de uma vez o par (aluno, turma) informado na atribuicao.
// Devolve { ok, idMatricula, turma, semestre, erro }.
function resolverAtribuicao(nomeAluno, codigoTurma, dfReal, listaOpcional) {
  var chave = normalizarChave(nomeAluno);
  if (!chave) {
    return { ok: false, erro: 'Estagiário não informado.' };
  }

  var lista = listaOpcional || getTodosEstagiariosComTurma();
  var alvo = null;
  for (var i = 0; i < lista.length; i++) {
    var e = lista[i];
    if ((normalizarChave(e.nome) === chave || normalizarChave(e.email) === chave) &&
        e.turma === String(codigoTurma || '').trim()) {
      alvo = e;
      break;
    }
  }

  if (!alvo) {
    return {
      ok: false,
      erro: 'Não encontrei a matrícula de "' + nomeAluno + '" na turma ' +
            formatarRotuloTurma(codigoTurma) + '. Cadastre a linha desse aluno nessa turma antes de atribuir.'
    };
  }

  var validacao = validarTurmaParaRegistro(alvo.turma, dfReal);
  if (!validacao.valido) return { ok: false, erro: validacao.erro };

  return {
    ok: true,
    idMatricula: alvo.idMatricula,
    turma: alvo.turma,
    semestre: extrairSemestreDaTurma(alvo.turma)
  };
}

// =====================================================================
// 5. Geracao de ID de matricula
// =====================================================================

// Gera o proximo ID de matricula de estagio (MAT-XXXX), incrementando o
// contador em bd!AH2. Mesmo padrao ja usado para PA-, PI-, AC-, AO- e AU-.
function proximoIdMatricula() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bd = ss.getSheetByName(CONFIG.SHEET_BD);
  var celula = bd.getRange(CONFIG.BD_CELL.CONTROLE_MAT);
  var atual = parseInt(celula.getValue(), 10);
  if (isNaN(atual) || atual < 0) atual = 0;
  var proximo = atual + 1;
  celula.setValue(proximo);
  return CONFIG.PREFIXO_MATRICULA_ESTAGIO + Utilities.formatString('%04d', proximo);
}

// Preenche MATRICULA_ESTAGIO (estagiarios!N) em toda linha que tenha NOME e
// esteja com a celula vazia. Nunca sobrescreve um valor ja existente e NUNCA
// toca na coluna A (reservada a planilhas externas).
//
// Usada pelos dois caminhos de preenchimento:
//   - gatilho onEdit (processarEdicaoMatriculaEstagio, abaixo)
//   - botao "Gerar Matrículas de Estágio" do dropdown Gerenciar
//
// Devolve { gerados, total } — `gerados` = quantas celulas foram preenchidas
// agora; `total` = quantas linhas com nome existem na aba.
function preencherMatriculasEstagioPendentes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return { gerados: 0, total: 0 };

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { gerados: 0, total: 0 };

  var n = ultimaLinha - 1;
  var nomes = aba.getRange(2, CONFIG.ESTAGIARIOS_COL.NOME + 1, n, 1).getValues();
  var rangeMat = aba.getRange(2, CONFIG.ESTAGIARIOS_COL.MATRICULA_ESTAGIO + 1, n, 1);
  var mats = rangeMat.getValues();

  var total = 0;
  var pendentes = [];
  for (var i = 0; i < n; i++) {
    if (!String(nomes[i][0] || '').trim()) continue;
    total++;
    if (!String(mats[i][0] || '').trim()) pendentes.push(i);
  }

  if (pendentes.length === 0) return { gerados: 0, total: total };

  // Uma unica leitura/escrita do contador para todo o lote, em vez de uma por
  // linha (proximoIdMatricula faz um getValue/setValue por chamada).
  var bd = ss.getSheetByName(CONFIG.SHEET_BD);
  var celulaContador = bd.getRange(CONFIG.BD_CELL.CONTROLE_MAT);
  var contador = parseInt(celulaContador.getValue(), 10);
  if (isNaN(contador) || contador < 0) contador = 0;

  // Nunca reemitir um numero ja presente na coluna, mesmo que o contador
  // esteja atrasado (ex.: alguem colou valores a mao).
  var maior = contador;
  for (var k = 0; k < n; k++) {
    var m = String(mats[k][0] || '').trim().match(/^MAT-(\d+)$/);
    if (m) maior = Math.max(maior, parseInt(m[1], 10));
  }
  contador = maior;

  pendentes.forEach(function(idx) {
    contador++;
    mats[idx][0] = CONFIG.PREFIXO_MATRICULA_ESTAGIO + Utilities.formatString('%04d', contador);
  });

  rangeMat.setNumberFormat('@');
  rangeMat.setValues(mats);
  celulaContador.setValue(contador);

  return { gerados: pendentes.length, total: total };
}

// Gatilho onEdit (chamado a partir de onEdit em Code.js). Ao digitar o NOME
// (coluna B) de uma linha da aba estagiarios, gera a MATRICULA_ESTAGIO da
// linha se ela ainda estiver vazia — mesmo padrao ja usado para SUBESPECIE,
// que se calcula sozinha a partir de ESPECIE.
//
// Cobre tambem a colagem de varias linhas de uma vez (e.range pode abranger
// um intervalo). Silencioso por design: erro aqui nunca deve impedir a edicao
// da planilha.
function processarEdicaoMatriculaEstagio(e) {
  try {
    if (!e || !e.range) return;
    var aba = e.range.getSheet();
    if (aba.getName() !== CONFIG.SHEET_ESTAGIARIOS) return;

    var colInicio = e.range.getColumn();
    var colFim = colInicio + e.range.getNumColumns() - 1;
    var colNome = CONFIG.ESTAGIARIOS_COL.NOME + 1;
    if (colNome < colInicio || colNome > colFim) return;
    if (e.range.getRow() < 2) return;

    preencherMatriculasEstagioPendentes();
  } catch (err) {
    Logger.log('processarEdicaoMatriculaEstagio: ' + err.message);
  }
}
