// Turma.gs
// Responsabilidade: derivacao e resolucao da dimensao TURMA para o projeto
// "Painel de Thales". A turma e derivada a partir de DATA_INICIO do estagiario
// (estagiarios!K) e gravada em TURMA (estagiarios!M). Ela e a chave das telas
// de metrica (Panorama, Graficos, Painel Aluno), enquanto SEMESTRE continua
// sendo a chave das telas operacionais (Diligencias, Distribuicao).
//
// Decisoes de arquitetura (27/07/2026):
// - TURMA nunca e editada manualmente: e calculada pelo servidor a partir de
//   DATA_INICIO, mesmo padrao ja usado para SUBESPECIE a partir de ESPECIE.
// - Nenhuma coluna nova e criada nas abas transacionais; o join e feito em
//   tempo de leitura: registro -> aluno -> turma.
// - O formato e "AAAA.SS-A" (antecipado) ou "AAAA.SS-R" (regular).
// - A unica fonte de verdade e estagiarios!M.

// --- Derivacao ---

// Calcula o codigo da turma a partir de uma data de inicio e de um semestre
// fallback. Se dataInicio for valida, o sufixo depende do mes (janeiro ou
// julho -> antecipado -A; demais -> regular -R). Se dataInicio for vazia,
// assume regular do semestre fallback.
function calcularTurma(dataInicio, semestreFallback) {
  var fallback = String(semestreFallback || '').trim();

  if (dataInicio instanceof Date && !isNaN(dataInicio.getTime())) {
    var mes = dataInicio.getMonth() + 1; // 1-12
    var sufixo = (mes === 1 || mes === 7) ? '-A' : '-R';
    return calcularSemestre(dataInicio) + sufixo;
  }

  if (fallback) return fallback + '-R';
  return '';
}

// Retorna o rotulo legivel de uma turma para exibicao nos selects e selos.
// Exemplos:
//   "2026.02-A" -> "Antecipado"
//   "2026.02-R" -> "Regular"
//   "2026.02"   -> "Todas as turmas"
// O mes entre parenteses foi removido em 30/07/2026: -A e sempre janeiro (.01)
// ou julho (.02) — ja e obvio a partir do proprio sufixo — e os meses do
// regular variam sem alterar o sentido do rotulo.
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

// Extrai o semestre base ("AAAA.SS") de um codigo de turma. Se ja receber
// um semestre sem sufixo, devolve o proprio valor.
function extrairSemestreDaTurma(turma) {
  return String(turma || '').split('-')[0];
}

// --- Leitura dos estagiarios com turma ---

// Retorna todos os estagiarios com as colunas ate TURMA (A:M), incluindo
// os campos derivados e as datas brutas de inicio/fim do estagio.
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

    var dataInicio = row[CONFIG.ESTAGIARIOS_COL.DATA_INICIO];
    var semestre = normalizarSemestreLido(row[CONFIG.ESTAGIARIOS_COL.SEMESTRE]);
    var turma = String(row[CONFIG.ESTAGIARIOS_COL.TURMA] || '').trim();

    // Se a celula de TURMA estiver vazia, deriva ao vivo a partir de DATA_INICIO
    // e SEMESTRE. Isso torna os leitores resilientes enquanto a MigracaoTurma
    // ainda nao for executada.
    if (!turma) turma = calcularTurma(dataInicio, semestre);

    lista.push({
      id: row[CONFIG.ESTAGIARIOS_COL.ID],
      nome: nome,
      email: String(row[CONFIG.ESTAGIARIOS_COL.EMAIL] || '').trim(),
      trimestre: row[CONFIG.ESTAGIARIOS_COL.TRIMESTRE],
      finalizado: !!String(row[CONFIG.ESTAGIARIOS_COL.FINALIZADO] || '').trim(),
      semestre: semestre,
      drive: row[CONFIG.ESTAGIARIOS_COL.DRIVE],
      arquivado: String(row[CONFIG.ESTAGIARIOS_COL.ARQUIVADO] || '').trim(),
      periodo: row[CONFIG.ESTAGIARIOS_COL.PERIODO],
      matricula: row[CONFIG.ESTAGIARIOS_COL.MATRICULA],
      dataInicio: dataInicio,
      dataFim: row[CONFIG.ESTAGIARIOS_COL.DATA_FIM],
      turma: turma
    });
  }
  return lista;
}

// --- Versao segura para o cliente (sem objetos Date) ---

// getTodosEstagiariosComTurma() devolve dataInicio/dataFim como objetos Date
// crus — necessario para as comparacoes de janela usadas internamente por
// resolverTurmaDoRegistro/obterTurmaCorrente/criarResolvedorTurma. Mas
// google.script.run nao serializa Date de forma confiavel dentro de um
// payload maior: um UNICO registro com essas datas preenchidas faz a
// resposta inteira chegar como null no cliente (mesmo bug ja documentado
// para a coluna HORA em audiencias_estagiario — ver AudienciasEstagiario.js/
// Data.js). BUG CORRIGIDO em 28/07/2026: getDadosPanorama (Panorama.js) e
// getDadosPainelAluno (Aluno.js) mandavam getTodosEstagiariosCompletos() —
// com dataInicio/dataFim crus — direto para o cliente, e so quebrava na
// pratica quando alguma linha (a turma antecipada de julho/2026) tinha essas
// celulas preenchidas.
//
// Diagnostico em 28/07/2026 (ver diagnosticoPanorama/diagnosticoPainelAluno,
// provisorio.js) revelou uma SEGUNDA fonte do mesmo problema: TRIMESTRE
// (estagiarios!D), documentada como "sem uso" em Config.js/AGENTS.md, esta na
// pratica preenchida com valores de Data em toda linha da planilha real —
// provavelmente reaproveitada no passado para outra finalidade antes de
// cair em desuso. Como nenhum script le ou grava TRIMESTRE (grep confirmado)
// e nenhuma tela do frontend a exibe, ela tambem foi excluida aqui — a
// coluna em si continua intocada na planilha (nao mexemos nos dados, so
// paramos de manda-la ao cliente).
//
// Nenhuma tela do frontend precisa de dataInicio/dataFim/trimestre brutos (a
// turma ja vem resolvida no campo `turma`), entao esta versao devolve os
// mesmos campos SEM essas tres — usar em qualquer payload que va para o
// navegador; getTodosEstagiariosCompletos() continua reservada para uso
// interno do servidor (Mensagens.js, por exemplo, precisa do dataFim cru).
function getTodosEstagiariosParaCliente() {
  return getTodosEstagiariosComTurma().map(function(e) {
    return {
      id: e.id,
      nome: e.nome,
      email: e.email,
      finalizado: e.finalizado,
      semestre: e.semestre,
      drive: e.drive,
      arquivado: e.arquivado,
      periodo: e.periodo,
      matricula: e.matricula,
      turma: e.turma
    };
  });
}

// --- Resolucao aluno -> turma para um registro transacional ---

// Resolve a turma de um registro a partir do nome/e-mail do aluno e de uma
// data de referencia (ex.: DF de uma diligencia, DATA de uma inicial).
// A chaveAluno pode ser nome ou e-mail. Nao usa buscarEmailEstagiario nem
// outras buscas por nome porque elas retornam apenas o primeiro match —
// incorreto quando um aluno tem duas linhas no mesmo semestre (antecipado +
// regular). A logica de desempate entre candidatos esta em
// _resolverEntreCandidatos.
function resolverTurmaDoRegistro(chaveAluno, dataReferencia) {
  var chave = normalizarChave(chaveAluno);
  if (!chave) return '';

  var candidatos = getTodosEstagiariosComTurma().filter(function(e) {
    return normalizarChave(e.nome) === chave || normalizarChave(e.email) === chave;
  });

  return _resolverEntreCandidatos(candidatos, dataReferencia);
}

// Desempata entre as linhas (candidatos) de um mesmo aluno para achar a
// turma correta de um registro com data de referencia dataReferencia.
// Corrigido em 30/07/2026: a linha "regular" normalmente NAO tem DATA_INICIO
// preenchida (so a antecipada de julho tem, ver MigracaoTurma.js), entao a
// janela [DATA_INICIO, DATA_FIM] quase nunca casava e tudo caia no fallback
// de FINALIZADO vazio — que ignora dataReferencia e por isso jogava TODA a
// producao do aluno (de qualquer semestre) na turma ativa no momento.
// Ordem de decisao:
//   1. linha cuja janela [DATA_INICIO, DATA_FIM] contem dataReferencia —
//      so dispara quando as DUAS datas foram preenchidas manualmente
//      (extensao/excecao real, tem prioridade sobre a regra generica);
//   2. senao, a linha cujo codigo bate com a turma "natural" da
//      dataReferencia pela mesma regra usada em calcularTurma (mes 1/7 vira
//      antecipado, resto vira regular do semestre correspondente) — cobre o
//      caso comum de DATA_INICIO/DATA_FIM ausentes;
//   3. senao, a linha com FINALIZADO vazio;
//   4. senao, a de DATA_INICIO mais recente.
function _resolverEntreCandidatos(candidatos, dataReferencia) {
  if (candidatos.length === 0) return '';
  if (candidatos.length === 1) return candidatos[0].turma;

  var ref = (dataReferencia instanceof Date && !isNaN(dataReferencia.getTime()))
    ? dataReferencia
    : null;

  if (ref) {
    // 1) Janela [DATA_INICIO, DATA_FIM] contem dataReferencia
    for (var i = 0; i < candidatos.length; i++) {
      var e = candidatos[i];
      var inicio = e.dataInicio;
      var fim = e.dataFim;
      if (inicio instanceof Date && !isNaN(inicio.getTime()) &&
          fim instanceof Date && !isNaN(fim.getTime())) {
        // Ignora a parte do horario para a comparacao
        var refTs = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
        var inicioTs = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).getTime();
        var fimTs = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime();
        if (refTs >= inicioTs && refTs <= fimTs) return e.turma;
      }
    }

    // 2) Turma natural da dataReferencia (mesma regra de calcularTurma)
    var turmaNatural = calcularTurma(ref, '');
    if (turmaNatural) {
      for (var j = 0; j < candidatos.length; j++) {
        if (candidatos[j].turma === turmaNatural) return candidatos[j].turma;
      }
    }
  }

  // 3) Linha com FINALIZADO vazio
  var naoFinalizados = candidatos.filter(function(e) { return !e.finalizado; });
  if (naoFinalizados.length > 0) candidatos = naoFinalizados;

  // 4) DATA_INICIO mais recente
  candidatos.sort(function(a, b) {
    var ta = (a.dataInicio instanceof Date && !isNaN(a.dataInicio.getTime())) ? a.dataInicio.getTime() : 0;
    var tb = (b.dataInicio instanceof Date && !isNaN(b.dataInicio.getTime())) ? b.dataInicio.getTime() : 0;
    return tb - ta;
  });

  return candidatos[0].turma;
}

// --- Turma corrente ---

// Retorna a turma que esta ativa hoje (DATA_INICIO <= hoje <= DATA_FIM).
// Se nenhuma casar, retorna a turma com DATA_INICIO mais recente.
// Se nao houver nenhuma, retorna string vazia.
function obterTurmaCorrente() {
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  var hojeTs = hoje.getTime();

  var turmas = getTodosEstagiariosComTurma();
  if (turmas.length === 0) return '';

  // 1) Janela ativa
  for (var i = 0; i < turmas.length; i++) {
    var e = turmas[i];
    var inicio = e.dataInicio;
    var fim = e.dataFim;
    if (inicio instanceof Date && !isNaN(inicio.getTime()) &&
        fim instanceof Date && !isNaN(fim.getTime())) {
      var inicioTs = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate()).getTime();
      var fimTs = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate()).getTime();
      if (hojeTs >= inicioTs && hojeTs <= fimTs) return e.turma;
    }
  }

  // 2) DATA_INICIO mais recente
  turmas.sort(function(a, b) {
    var ta = (a.dataInicio instanceof Date && !isNaN(a.dataInicio.getTime())) ? a.dataInicio.getTime() : 0;
    var tb = (b.dataInicio instanceof Date && !isNaN(b.dataInicio.getTime())) ? b.dataInicio.getTime() : 0;
    return tb - ta;
  });

  if (turmas[0].dataInicio instanceof Date && !isNaN(turmas[0].dataInicio.getTime())) {
    return turmas[0].turma;
  }

  // 3) Nenhuma data de inicio preenchida: devolve o primeiro semestre encontrado
  // como regular, mantendo o comportamento legacy ate que DATA_INICIO seja
  // preenchido para todas as turmas.
  for (var j = 0; j < turmas.length; j++) {
    if (turmas[j].semestre) return turmas[j].semestre + '-R';
  }

  return '';
}

// --- Cache local de resolucao ---

// Retorna uma funcao que resolve turmas sem reler a planilha a cada chamada.
// Usada pelos agregadores que processam muitos registros (Panorama.js,
// Mensagens.js) — evita uma leitura completa de estagiarios por registro.
function criarResolvedorTurma() {
  var estagiarios = getTodosEstagiariosComTurma();
  return function(chaveAluno, dataReferencia) {
    return _resolverTurmaLocalmente(chaveAluno, dataReferencia, estagiarios);
  };
}

function _resolverTurmaLocalmente(chaveAluno, dataReferencia, estagiarios) {
  var chave = normalizarChave(chaveAluno);
  if (!chave) return '';

  var candidatos = (estagiarios || []).filter(function(e) {
    return normalizarChave(e.nome) === chave || normalizarChave(e.email) === chave;
  });

  return _resolverEntreCandidatos(candidatos, dataReferencia);
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

// --- Helpers de filtro por turma/semestre ---

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

// Retorna a lista de turmas distintas presentes nos estagiarios, ordenadas
// decrescentemente, com um flag indicando se e antecipada.
function listarTurmasDistintas() {
  var presentes = {};
  getTodosEstagiariosComTurma().forEach(function(e) {
    if (e.turma) presentes[e.turma] = true;
  });
  return Object.keys(presentes).sort().reverse();
}

// --- Anotacao de turma em listas de registros ---

// Resolve e anota reg.turma (registro -> aluno -> turma) em cada item de uma
// lista de registros transacionais, usando um resolvedorTurma ja criado (ver
// criarResolvedorTurma) para nao reler a planilha por registro. obterChaveAluno
// e obterDataReferencia sao funcoes (reg) -> valor, especificas de cada aba
// (ex.: diligencias usa reg.estagiario/reg.df; iniciais usa reg.email||
// reg.estagiario/reg.di — ver tabela de cruzamentos da secao 2.4 do
// documento de migracao de TURMA).
//
// Usada por Panorama.js (getDadosPanorama) e Aluno.js (getDadosPainelAluno)
// para expor a turma ja resolvida ao frontend — assim Scripts.html e
// AlunoScripts.html filtram pelo seletor hierarquico direto em reg.turma, sem
// duplicar a logica de resolucao (janela DATA_INICIO/DATA_FIM, fallback
// FINALIZADO/DATA_INICIO mais recente) em JavaScript. Mutila a lista in-place
// (mesmo padrao ja usado em rowParaObjeto* dos demais arquivos, que sempre
// devolvem objetos novos prontos para o cliente) e tambem a devolve, para uso
// encadeado.
function anotarTurmaEmRegistros(lista, resolvedorTurma, obterChaveAluno, obterDataReferencia) {
  (lista || []).forEach(function(reg) {
    reg.turma = resolvedorTurma(obterChaveAluno(reg), parseDataBR(obterDataReferencia(reg)));
  });
  return lista;
}
