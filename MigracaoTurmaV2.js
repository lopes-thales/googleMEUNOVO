// MigracaoTurmaV2.gs
// Responsabilidade: migracao unica para o modelo de turmas v2 (01/08/2026).
// Substitui MigracaoTurma.js, que pode ser removido depois que este rodar.
//
// ORDEM OBRIGATORIA DE EXECUCAO — rodar uma fase por vez, no editor do Apps
// Script, conferindo o resultado na planilha antes de seguir:
//
//   1. migracaoM1_popularTurmas()        -> cria/preenche a aba `turmas`
//      [CONFERIR as datas de inicio/fim de cada turma]
//   2. migracaoM2_gerarIdsMatricula()    -> preenche estagiarios!N (MAT-XXXX)
//   3. migracaoM3_validarTurmasAlunos()  -> confere estagiarios!M
//      [CONFERIR o log e corrigir a mao o que sobrar]
//   4. migracaoM4_backfillTransacionais() -> preenche ID_MATRICULA/TURMA nas
//      5 abas transacionais e cria a aba `_migracao_ambiguos`
//      [PREENCHER a coluna H da aba _migracao_ambiguos]
//   5. aplicarCorrecoesAmbiguos()        -> grava as correcoes manuais
//
// NENHUMA fase chuta. Onde nao houver certeza, a celula fica vazia e o caso
// vai para o relatorio de ambiguos (RN-T10).
//
// Todas as fases sao reexecutaveis: nunca sobrescrevem uma celula ja
// preenchida corretamente.

// =====================================================================
// M1 — Popular a aba `turmas`
// =====================================================================

// Levanta os codigos de turma distintos hoje presentes em estagiarios!M e
// grava uma linha por codigo na aba `turmas`, com as janelas da RN-T01:
//   AAAA.01-A -> 01/01 a 31/01
//   AAAA.01-R -> 01/02 a 30/06
//   AAAA.02-A -> 01/07 a 31/07
//   AAAA.02-R -> 01/08 a 31/12
// As datas sao um PONTO DE PARTIDA: confira e ajuste a mao os dias exatos de
// inicio e fim de cada turma antes de seguir para M2.
function migracaoM1_popularTurmas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_TURMAS);

  if (!aba) {
    aba = ss.insertSheet(CONFIG.SHEET_TURMAS);
    aba.getRange(1, 1, 1, 4).setValues([['CODIGO', 'DATA_INICIO', 'DATA_FIM', 'ATIVA']]);
    aba.setFrozenRows(1);
    aba.getRange('A:A').setNumberFormat('@');
    aba.getRange('B:C').setNumberFormat('dd/MM/yyyy');
  }

  var jaExistem = {};
  if (aba.getLastRow() >= 2) {
    aba.getRange(2, 1, aba.getLastRow() - 1, 1).getValues().forEach(function(r) {
      var c = String(r[0] || '').trim();
      if (c) jaExistem[c] = true;
    });
  }

  var abaEst = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  var codigos = {};
  if (abaEst && abaEst.getLastRow() >= 2) {
    var dados = abaEst.getRange(2, 1, abaEst.getLastRow() - 1, CONFIG.TOTAL_COLUNAS_ESTAGIARIOS).getValues();
    dados.forEach(function(row) {
      var t = String(row[CONFIG.ESTAGIARIOS_COL.TURMA] || '').trim();
      if (t) codigos[t] = true;
      // Se TURMA estiver vazia mas DATA_INICIO existir, deriva o candidato
      // pela regra antiga (mes 1/7 = antecipado) so para nao deixar a turma
      // de fora do cadastro.
      if (!t) {
        var di = row[CONFIG.ESTAGIARIOS_COL.DATA_INICIO];
        if (di instanceof Date && !isNaN(di.getTime())) {
          var mes = di.getMonth() + 1;
          var sem = calcularSemestre(di);
          codigos[sem + ((mes === 1 || mes === 7) ? '-A' : '-R')] = true;
        }
      }
    });
  }

  var novas = [];
  Object.keys(codigos).sort().forEach(function(codigo) {
    if (jaExistem[codigo]) return;
    var janela = _janelaPadraoDaTurma(codigo);
    if (!janela) return;
    novas.push([codigo, janela.inicio, janela.fim, '']);
  });

  if (novas.length > 0) {
    aba.getRange(aba.getLastRow() + 1, 1, novas.length, 4).setValues(novas);
  }

  invalidarCacheTurmas();

  var msg = 'M1 concluida. Turmas ja cadastradas: ' + Object.keys(jaExistem).length +
            '. Turmas criadas agora: ' + novas.length + '.';
  Logger.log(msg);
  novas.forEach(function(n) { Logger.log('  criada: ' + n[0]); });
  Logger.log('CONFIRA as datas de inicio/fim na aba "' + CONFIG.SHEET_TURMAS + '" antes de rodar M2.');
  return msg;
}

// Janela padrao de um codigo "AAAA.SS-X" pela RN-T01.
function _janelaPadraoDaTurma(codigo) {
  var m = String(codigo || '').match(/^(\d{4})\.(01|02)-(A|R)$/);
  if (!m) return null;
  var ano = parseInt(m[1], 10);
  var sem = m[2];
  var tipo = m[3];

  if (tipo === 'A') {
    if (sem === '01') return { inicio: new Date(ano, 0, 1), fim: new Date(ano, 0, 31) };
    return { inicio: new Date(ano, 6, 1), fim: new Date(ano, 6, 31) };
  }
  if (sem === '01') return { inicio: new Date(ano, 1, 1), fim: new Date(ano, 5, 30) };
  return { inicio: new Date(ano, 7, 1), fim: new Date(ano, 11, 31) };
}

// =====================================================================
// M2 — Gerar os IDs de matricula de estagio (estagiarios!N)
// =====================================================================

// Preenche estagiarios!N (MATRICULA_ESTAGIO) com MAT-XXXX em toda linha com
// NOME e celula vazia. Nunca sobrescreve valor existente.
//
// ATENCAO: a coluna A (ID) NAO e tocada. Ela e lida por planilhas e scripts
// EXTERNOS a este projeto e permanece sob controle exclusivo deles (decisao de
// 01/08/2026).
//
// A logica vive em preencherMatriculasEstagioPendentes (Turma.js), que e a
// mesma usada pelo gatilho onEdit e pelo botao do dropdown Gerenciar — aqui
// esta funcao e apenas o ponto de entrada da migracao.
function migracaoM2_gerarIdsMatricula() {
  var resultado = preencherMatriculasEstagioPendentes();
  var msg = 'M2 concluida. Matriculas de estagio geradas: ' + resultado.gerados +
            ' (de ' + resultado.total + ' linhas com nome).';
  Logger.log(msg);
  return msg;
}

// =====================================================================
// M3 — Validar a TURMA de cada aluno
// =====================================================================

// Confere que estagiarios!M esta preenchido e existe na aba `turmas`.
// Onde estiver vazio, deriva de DATA_INICIO pela regra antiga (mes 1/7 =
// antecipado). Onde nao for possivel derivar, DEIXA VAZIO e reporta no log.
function migracaoM3_validarTurmasAlunos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba || aba.getLastRow() < 2) return 'Aba estagiarios vazia.';

  invalidarCacheTurmas();
  var cadastradas = {};
  obterTurmas().forEach(function(t) { cadastradas[t.codigo] = true; });

  var n = aba.getLastRow() - 1;
  var dados = aba.getRange(2, 1, n, CONFIG.TOTAL_COLUNAS_ESTAGIARIOS).getValues();
  var rangeTurma = aba.getRange(2, CONFIG.ESTAGIARIOS_COL.TURMA + 1, n, 1);
  var turmas = rangeTurma.getValues();

  var preenchidas = 0;
  var pendentes = [];
  var foraDoCadastro = [];

  for (var i = 0; i < n; i++) {
    var nome = String(dados[i][CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    if (!nome) continue;

    var turma = String(turmas[i][0] || '').trim();

    if (!turma) {
      var di = dados[i][CONFIG.ESTAGIARIOS_COL.DATA_INICIO];
      if (di instanceof Date && !isNaN(di.getTime())) {
        var mes = di.getMonth() + 1;
        turma = calcularSemestre(di) + ((mes === 1 || mes === 7) ? '-A' : '-R');
        turmas[i][0] = turma;
        preenchidas++;
      } else {
        pendentes.push('linha ' + (i + 2) + ': ' + nome);
        continue;
      }
    }

    if (!cadastradas[turma]) {
      foraDoCadastro.push('linha ' + (i + 2) + ': ' + nome + ' -> ' + turma);
    }
  }

  rangeTurma.setNumberFormat('@');
  rangeTurma.setValues(turmas);

  Logger.log('M3 concluida. Turmas preenchidas por derivacao: ' + preenchidas);
  if (pendentes.length > 0) {
    Logger.log('SEM TURMA e SEM DATA_INICIO (preencher a mao em estagiarios!M):');
    pendentes.forEach(function(p) { Logger.log('  ' + p); });
  }
  if (foraDoCadastro.length > 0) {
    Logger.log('TURMA que NAO existe na aba "' + CONFIG.SHEET_TURMAS + '" (rodar M1 de novo ou corrigir):');
    foraDoCadastro.forEach(function(p) { Logger.log('  ' + p); });
  }
  return 'M3 concluida. Derivadas: ' + preenchidas + '. Pendentes: ' + pendentes.length +
         '. Fora do cadastro: ' + foraDoCadastro.length + '. Ver Logger.';
}

// =====================================================================
// M4 — Backfill das abas transacionais
// =====================================================================

// Configuracao do backfill, uma entrada por aba. Para cada uma:
//   chaves     — indices de coluna (base 0) tentados em ordem para achar o aluno
//   datas      — indices de coluna tentados em ordem como data de referencia
//   colIdMat   — indice da coluna ID_MATRICULA
//   colTurma   — indice da coluna TURMA
//   total      — total de colunas da aba
function _abasDoBackfill() {
  return [
    {
      nome: CONFIG.SHEET_DILIGENCIAS,
      colId: CONFIG.COL.ID,
      chaves: [CONFIG.COL.ESTAGIARIO],
      datas: [CONFIG.COL.DF_REAL, CONFIG.COL.DF],
      colIdMat: CONFIG.COL.ID_MATRICULA,
      colTurma: CONFIG.COL.TURMA,
      total: CONFIG.TOTAL_COLUNAS_DILIGENCIAS
    },
    {
      nome: CONFIG.SHEET_INICIAIS,
      colId: CONFIG.INICIAIS_COL.ID,
      chaves: [CONFIG.INICIAIS_COL.EMAIL],
      datas: [CONFIG.INICIAIS_COL.DATA],
      colIdMat: CONFIG.INICIAIS_COL.ID_MATRICULA,
      colTurma: CONFIG.INICIAIS_COL.TURMA,
      total: CONFIG.TOTAL_COLUNAS_INICIAIS
    },
    {
      nome: CONFIG.SHEET_ACOMPANHAMENTOS,
      colId: CONFIG.ACOMPANHAMENTOS_COL.ID,
      chaves: [CONFIG.ACOMPANHAMENTOS_COL.EMAIL, CONFIG.ACOMPANHAMENTOS_COL.NOME],
      datas: [CONFIG.ACOMPANHAMENTOS_COL.DATA_ENTREGA, CONFIG.ACOMPANHAMENTOS_COL.DATA],
      colIdMat: CONFIG.ACOMPANHAMENTOS_COL.ID_MATRICULA,
      colTurma: CONFIG.ACOMPANHAMENTOS_COL.TURMA,
      total: CONFIG.TOTAL_COLUNAS_ACOMPANHAMENTOS
    },
    {
      nome: CONFIG.SHEET_ATENDIMENTOS_ONLINE,
      colId: CONFIG.ATENDIMENTO_ONLINE_COL.ID,
      chaves: [CONFIG.ATENDIMENTO_ONLINE_COL.EMAIL, CONFIG.ATENDIMENTO_ONLINE_COL.ESTAGIARIO],
      datas: [CONFIG.ATENDIMENTO_ONLINE_COL.DATA],
      colIdMat: CONFIG.ATENDIMENTO_ONLINE_COL.ID_MATRICULA,
      colTurma: CONFIG.ATENDIMENTO_ONLINE_COL.TURMA,
      total: CONFIG.TOTAL_COLUNAS_ATENDIMENTO_ONLINE
    },
    {
      nome: CONFIG.SHEET_AUDIENCIAS_ESTAGIARIO,
      colId: CONFIG.AUDIENCIAS_ESTAGIARIO_COL.ID,
      chaves: [CONFIG.AUDIENCIAS_ESTAGIARIO_COL.EMAIL, CONFIG.AUDIENCIAS_ESTAGIARIO_COL.ESTAGIARIO],
      datas: [CONFIG.AUDIENCIAS_ESTAGIARIO_COL.DATA],
      colIdMat: CONFIG.AUDIENCIAS_ESTAGIARIO_COL.ID_MATRICULA,
      colTurma: CONFIG.AUDIENCIAS_ESTAGIARIO_COL.TURMA,
      total: CONFIG.TOTAL_COLUNAS_AUDIENCIAS_ESTAGIARIO
    }
  ];
}

// Numero de dias, a partir do inicio e antes do fim de uma turma, dentro dos
// quais uma data e considerada "de fronteira" e o caso vai para revisao.
var MIGRACAO_DIAS_FRONTEIRA = 5;

function migracaoM4_backfillTransacionais() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  invalidarCacheTurmas();

  var estagiarios = getTodosEstagiariosComTurma();
  var ambiguos = [];
  var resumo = [];

  _abasDoBackfill().forEach(function(cfg) {
    var aba = ss.getSheetByName(cfg.nome);
    if (!aba || aba.getLastRow() < 2) {
      resumo.push(cfg.nome + ': aba vazia ou inexistente');
      return;
    }

    var n = aba.getLastRow() - 1;
    var dados = aba.getRange(2, 1, n, cfg.total).getValues();
    var saidaIdMat = [];
    var saidaTurma = [];
    var resolvidos = 0;
    var jaTinha = 0;
    var pendentes = 0;

    for (var i = 0; i < n; i++) {
      var row = dados[i];
      var idMatAtual = String(row[cfg.colIdMat] || '').trim();
      var turmaAtual = String(row[cfg.colTurma] || '').trim();

      if (idMatAtual && turmaAtual) {
        saidaIdMat.push([idMatAtual]);
        saidaTurma.push([turmaAtual]);
        jaTinha++;
        continue;
      }

      var idRegistro = String(row[cfg.colId] || '').trim();
      var vazia = _linhaVazia(row);
      if (vazia) {
        saidaIdMat.push(['']);
        saidaTurma.push(['']);
        continue;
      }

      var chave = '';
      for (var c = 0; c < cfg.chaves.length && !chave; c++) {
        chave = String(row[cfg.chaves[c]] || '').trim();
      }

      var dataRef = null;
      for (var d = 0; d < cfg.datas.length && !dataRef; d++) {
        dataRef = parseDataBR(row[cfg.datas[d]]);
      }

      var diag = _diagnosticarLinha(chave, dataRef, estagiarios);

      if (diag.ok) {
        saidaIdMat.push([diag.idMatricula]);
        saidaTurma.push([diag.turma]);
        resolvidos++;
      } else {
        saidaIdMat.push(['']);
        saidaTurma.push(['']);
        pendentes++;
        ambiguos.push([
          cfg.nome,
          i + 2,
          idRegistro,
          chave,
          dataRef ? Utilities.formatDate(dataRef, CONFIG.TIMEZONE, 'dd/MM/yyyy') : '',
          diag.motivo,
          diag.candidatas,
          ''
        ]);
      }
    }

    aba.getRange(2, cfg.colIdMat + 1, n, 1).setNumberFormat('@').setValues(saidaIdMat);
    aba.getRange(2, cfg.colTurma + 1, n, 1).setNumberFormat('@').setValues(saidaTurma);

    resumo.push(cfg.nome + ': ' + resolvidos + ' resolvidos, ' + jaTinha +
                ' ja preenchidos, ' + pendentes + ' para revisao');
  });

  _gravarAmbiguos(ambiguos);

  resumo.forEach(function(l) { Logger.log(l); });
  Logger.log('Casos para revisao manual: ' + ambiguos.length +
             ' (aba "' + CONFIG.SHEET_MIGRACAO_AMBIGUOS + '")');
  return 'M4 concluida. ' + resumo.join(' | ') + '. Ambiguos: ' + ambiguos.length;
}

function _linhaVazia(row) {
  for (var i = 0; i < row.length; i++) {
    if (String(row[i] || '').trim() !== '') return false;
  }
  return true;
}

// Decide se da para resolver a matricula com seguranca. Devolve
// { ok, idMatricula, turma, motivo, candidatas }.
function _diagnosticarLinha(chave, dataRef, estagiarios) {
  var norm = normalizarChave(chave);
  if (!norm) {
    return { ok: false, motivo: 'Sem nome/e-mail do estagiário na linha', candidatas: '' };
  }

  var candidatos = estagiarios.filter(function(e) {
    return normalizarChave(e.nome) === norm || normalizarChave(e.email) === norm;
  });

  if (candidatos.length === 0) {
    return { ok: false, motivo: 'Nome/e-mail não encontrado na aba estagiarios', candidatas: '' };
  }

  var listaTurmas = candidatos.map(function(e) { return e.turma || '(sem turma)'; }).join(', ');

  // Homonimo: mesmo nome, e-mails diferentes
  var emails = {};
  candidatos.forEach(function(e) { if (e.email) emails[e.email.toLowerCase()] = true; });
  if (Object.keys(emails).length > 1) {
    return { ok: false, motivo: 'Homônimo: o mesmo nome aparece com e-mails diferentes', candidatas: listaTurmas };
  }

  if (candidatos.length === 1) {
    if (!candidatos[0].turma) {
      return { ok: false, motivo: 'A única matrícula encontrada está sem TURMA em estagiarios!M', candidatas: '' };
    }
    return { ok: true, idMatricula: candidatos[0].idMatricula, turma: candidatos[0].turma };
  }

  if (!dataRef) {
    return { ok: false, motivo: 'Aluno com mais de uma matrícula e registro sem data de referência', candidatas: listaTurmas };
  }

  var refTs = dataRef.getTime();
  var dentro = [];
  var fronteira = false;

  for (var i = 0; i < candidatos.length; i++) {
    var janela = _janelaDaMatricula(candidatos[i]);
    if (!janela.inicio || !janela.fim) continue;
    if (refTs >= janela.inicio.getTime() && refTs <= janela.fim.getTime()) {
      dentro.push(candidatos[i]);
      var margem = MIGRACAO_DIAS_FRONTEIRA * 24 * 60 * 60 * 1000;
      if ((refTs - janela.inicio.getTime()) < margem || (janela.fim.getTime() - refTs) < margem) {
        fronteira = true;
      }
    }
  }

  if (dentro.length === 0) {
    return { ok: false, motivo: 'A data do registro não cai na janela de nenhuma das matrículas do aluno', candidatas: listaTurmas };
  }
  if (dentro.length > 1) {
    return { ok: false, motivo: 'A data do registro cai na janela de mais de uma matrícula', candidatas: listaTurmas };
  }
  if (fronteira) {
    return {
      ok: false,
      motivo: 'Data em janela de fronteira (a até ' + MIGRACAO_DIAS_FRONTEIRA +
              ' dias do início ou do fim da turma ' + dentro[0].turma + ')',
      candidatas: listaTurmas
    };
  }
  if (!dentro[0].turma) {
    return { ok: false, motivo: 'Matrícula resolvida está sem TURMA em estagiarios!M', candidatas: '' };
  }

  return { ok: true, idMatricula: dentro[0].idMatricula, turma: dentro[0].turma };
}

function _gravarAmbiguos(linhas) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_MIGRACAO_AMBIGUOS);
  if (!aba) aba = ss.insertSheet(CONFIG.SHEET_MIGRACAO_AMBIGUOS);

  aba.clear();
  aba.getRange(1, 1, 1, 8).setValues([[
    'ABA', 'LINHA', 'ID DO REGISTRO', 'ESTAGIÁRIO GRAVADO',
    'DATA DE REFERÊNCIA', 'MOTIVO', 'TURMAS CANDIDATAS', 'TURMA (preencher aqui)'
  ]]);
  aba.setFrozenRows(1);
  aba.getRange('H:H').setNumberFormat('@');

  if (linhas.length > 0) {
    aba.getRange(2, 1, linhas.length, 8).setValues(linhas);
  }

  aba.autoResizeColumns(1, 8);
}

// =====================================================================
// 5. Aplicar as correcoes manuais do relatorio de ambiguos
// =====================================================================

// Le a aba `_migracao_ambiguos`, e para cada linha com a coluna H (TURMA)
// preenchida, resolve o ID_MATRICULA correspondente e grava ID_MATRICULA +
// TURMA na linha de origem. Reexecutavel: linhas ja aplicadas com sucesso
// sao ignoradas na proxima rodada porque a origem passa a ter as colunas
// preenchidas.
function aplicarCorrecoesAmbiguos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_MIGRACAO_AMBIGUOS);
  if (!aba || aba.getLastRow() < 2) return 'Nada a aplicar.';

  invalidarCacheTurmas();
  var estagiarios = getTodosEstagiariosComTurma();

  var cfgPorAba = {};
  _abasDoBackfill().forEach(function(c) { cfgPorAba[c.nome] = c; });

  var dados = aba.getRange(2, 1, aba.getLastRow() - 1, 8).getValues();
  var aplicados = 0;
  var erros = [];

  for (var i = 0; i < dados.length; i++) {
    var nomeAba = String(dados[i][0] || '').trim();
    var linha = parseInt(dados[i][1], 10);
    var chave = String(dados[i][3] || '').trim();
    var turmaEscolhida = String(dados[i][7] || '').trim();

    if (!turmaEscolhida) continue;

    var cfg = cfgPorAba[nomeAba];
    if (!cfg) {
      erros.push('linha ' + (i + 2) + ': aba desconhecida "' + nomeAba + '"');
      continue;
    }

    var norm = normalizarChave(chave);
    var alvo = null;
    for (var j = 0; j < estagiarios.length; j++) {
      var e = estagiarios[j];
      if ((normalizarChave(e.nome) === norm || normalizarChave(e.email) === norm) &&
          e.turma === turmaEscolhida) {
        alvo = e;
        break;
      }
    }

    if (!alvo) {
      erros.push('linha ' + (i + 2) + ': não achei "' + chave + '" na turma ' + turmaEscolhida);
      continue;
    }

    var abaDestino = ss.getSheetByName(nomeAba);
    abaDestino.getRange(linha, cfg.colIdMat + 1).setNumberFormat('@').setValue(alvo.idMatricula);
    abaDestino.getRange(linha, cfg.colTurma + 1).setNumberFormat('@').setValue(alvo.turma);
    aplicados++;
  }

  Logger.log('Correcoes aplicadas: ' + aplicados);
  erros.forEach(function(e) { Logger.log('ERRO: ' + e); });
  return 'Aplicadas ' + aplicados + ' correcoes. Erros: ' + erros.length + '. Ver Logger.';
}

// =====================================================================
// Diagnostico pos-migracao
// =====================================================================

// Conta quantas linhas de cada aba transacional continuam sem ID_MATRICULA.
// Rodar depois de aplicarCorrecoesAmbiguos() para confirmar que a virada
// (fase F4) pode acontecer com seguranca.
function diagnosticoMigracaoTurmaV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var linhas = [];

  _abasDoBackfill().forEach(function(cfg) {
    var aba = ss.getSheetByName(cfg.nome);
    if (!aba || aba.getLastRow() < 2) {
      linhas.push(cfg.nome + ': vazia');
      return;
    }
    var n = aba.getLastRow() - 1;
    var dados = aba.getRange(2, 1, n, cfg.total).getValues();
    var semMat = 0;
    var comMat = 0;
    for (var i = 0; i < n; i++) {
      if (_linhaVazia(dados[i])) continue;
      if (String(dados[i][cfg.colIdMat] || '').trim()) comMat++;
      else semMat++;
    }
    linhas.push(cfg.nome + ': ' + comMat + ' com matricula, ' + semMat + ' SEM matricula');
  });

  linhas.forEach(function(l) { Logger.log(l); });
  return linhas.join(' | ');
}
