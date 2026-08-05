// === DIAGNOSTICO TEMPORARIO (28/07/2026) — "Resposta invalida do servidor" ===
// Investigando por que carregarDadosPanorama()/carregarDadosPainelAluno()
// chegam como null no cliente (google.script.run) mesmo sem excecao no
// servidor. Hipotese: algum campo do payload ainda e um objeto Date cru
// (mesma classe de bug ja documentada para HORA em AudienciasEstagiario.js).
// Varre o payload inteiro recursivamente e loga o CAMINHO exato de qualquer
// Date encontrado. Rodar pelo editor (Executar > diagnosticoPanorama /
// diagnosticoPainelAluno) e ler Executar > Registros de execucao. Apagar
// estas 3 funcoes (ate o proximo comentario "===") depois de resolvido.
function _acharDatasNoObjeto_(obj, caminho, encontrados, visitados) {
  if (obj === null || obj === undefined) return;
  if (obj instanceof Date) {
    encontrados.push(caminho + ' = ' + obj.toString());
    return;
  }
  if (typeof obj !== 'object') return;
  if (visitados.indexOf(obj) !== -1) {
    encontrados.push(caminho + ' = [REFERENCIA CIRCULAR]');
    return;
  }
  visitados.push(obj);

  if (Array.isArray(obj)) {
    for (var i = 0; i < obj.length; i++) {
      _acharDatasNoObjeto_(obj[i], caminho + '[' + i + ']', encontrados, visitados);
    }
    return;
  }
  for (var chave in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, chave)) {
      _acharDatasNoObjeto_(obj[chave], caminho + '.' + chave, encontrados, visitados);
    }
  }
}

function diagnosticoPanorama() {
  var r;
  try {
    r = getDadosPanorama();
  } catch (e) {
    Logger.log('EXCECAO ao chamar getDadosPanorama(): ' + e.message + '\n' + e.stack);
    return;
  }
  Logger.log('getDadosPanorama() retornou sem excecao. Verificando serializacao...');
  try {
    var json = JSON.stringify(r);
    Logger.log('JSON.stringify OK — ' + json.length + ' caracteres.');
  } catch (e) {
    Logger.log('JSON.stringify FALHOU: ' + e.message);
  }
  var achados = [];
  _acharDatasNoObjeto_(r, 'payload', achados, []);
  Logger.log('Objetos Date encontrados no payload: ' + achados.length);
  Logger.log(achados.slice(0, 80).join('\n'));
}

function diagnosticoPainelAluno() {
  var acesso;
  try {
    acesso = validarAcessoAluno();
  } catch (e) {
    Logger.log('EXCECAO ao chamar validarAcessoAluno(): ' + e.message + '\n' + e.stack);
    return;
  }
  Logger.log('acesso: ' + JSON.stringify(acesso));
  if (!acesso || !acesso.autorizado) {
    Logger.log('acesso.autorizado = false — motivo: ' + (acesso && acesso.motivo));
    return;
  }

  var r;
  try {
    r = getDadosPainelAluno(acesso);
  } catch (e) {
    Logger.log('EXCECAO ao chamar getDadosPainelAluno(): ' + e.message + '\n' + e.stack);
    return;
  }
  Logger.log('getDadosPainelAluno() retornou sem excecao. Verificando serializacao...');
  try {
    var json = JSON.stringify(r);
    Logger.log('JSON.stringify OK — ' + json.length + ' caracteres.');
  } catch (e) {
    Logger.log('JSON.stringify FALHOU: ' + e.message);
  }
  var achados = [];
  _acharDatasNoObjeto_(r, 'payload', achados, []);
  Logger.log('Objetos Date encontrados no payload: ' + achados.length);
  Logger.log(achados.slice(0, 80).join('\n'));
}
// === FIM DO DIAGNOSTICO TEMPORARIO ===

// Script temporário — rodar uma unica vez apos apagar SEMESTRE em diligencias.
// Preenche R (SEMESTRE) a partir de G (DF), usando a mesma regra de
// calcularSemestre() em Data.js. Apagar esta funcao depois do uso.
function preencherSemestreDiligenciasUmaVez() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) {
    Logger.log('Aba diligencias nao encontrada.');
    return;
  }

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) {
    Logger.log('Nenhum registro na aba diligencias.');
    return;
  }

  var numLinhas = ultimaLinha - 1;
  var colDF = CONFIG.COL.DF + 1;         // G, 1-indexado
  var colSemestre = CONFIG.COL.SEMESTRE + 1; // R, 1-indexado

  var dadosDF = aba.getRange(2, colDF, numLinhas, 1).getValues();

  var novosSemestres = [];
  var totalPreenchido = 0;
  var totalSemDF = 0;

  for (var i = 0; i < dadosDF.length; i++) {
    var df = dadosDF[i][0];
    var sem = calcularSemestre(df);
    if (sem) {
      totalPreenchido++;
    } else {
      totalSemDF++;
    }
    novosSemestres.push([sem]);
  }

  var rangeSemestre = aba.getRange(2, colSemestre, numLinhas, 1);
  rangeSemestre.setNumberFormat('@'); // forca texto, evita reinterpretacao como Data
  rangeSemestre.setValues(novosSemestres);

  Logger.log('Preenchidos: ' + totalPreenchido + ' | Sem DF (deixados vazios): ' + totalSemDF);
}

// Script temporario — rodar uma unica vez pelo editor do Apps Script
// (Executar > preencherDatasClassroomAntigasTudo) para preencher DI CLASS/
// DF CLASS (colunas recem-criadas: diligencias!W:X, iniciais!M:N,
// acompanhamentos!L:M) em registros ANTIGOS, criados antes de essas colunas
// existirem e do fluxo normal (Classroom.js) passar a preenche-las
// automaticamente a cada novo envio.
//
// Mesma fonte de verdade pedida por Thales para os envios novos: a data de
// criacao e a data de entrega (dueDate) sao lidas DIRETO da atividade no
// Classroom (Classroom.Courses.CourseWork.get), nunca de DI/DF/"hoje" da
// planilha — podem divergir (fuso, atraso no envio etc.).
//
// SEGURANCA: uma linha so e tocada se LINK estiver preenchido E a celula do
// LINK tiver a nota com o codigo (ID) da coursework — mesma nota gravada
// pelo fluxo normal de envio (ver enviarDiligenciasAoClassroom etc. em
// Classroom.js) e pela migracao em MigracaoClassroom.js. Sem os dois, a
// linha fica de fora do relatorio (nao ha como buscar a atividade no
// Classroom) e as colunas ficam em branco, como pedido por Thales. Linhas
// que ja tiverem DI CLASS preenchido tambem sao puladas — assim a funcao e
// segura de rodar mais de uma vez sem refazer chamadas desnecessarias a API.
function _preencherDatasClassroomAntigasDaAba_(nomeAba, cursoId, colIdIndex, colLinkIndex, colDiClassIndex, colDfClassIndex, totalColunas) {
  var relatorio = { aba: nomeAba, preenchidos: [], jaPreenchidos: [], semLinkOuCodigo: [], erros: [] };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(nomeAba);
  if (!aba) {
    relatorio.erro = 'Aba "' + nomeAba + '" nao encontrada.';
    return relatorio;
  }

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return relatorio;

  var dados = aba.getRange(2, 1, ultimaLinha - 1, totalColunas).getValues();

  for (var i = 0; i < dados.length; i++) {
    var linha = i + 2;
    var id = dados[i][colIdIndex];

    if (dados[i][colDiClassIndex]) {
      relatorio.jaPreenchidos.push({ linha: linha, id: id });
      continue;
    }

    var link = String(dados[i][colLinkIndex] || '').trim();
    if (!link) {
      relatorio.semLinkOuCodigo.push({ linha: linha, id: id });
      continue;
    }

    var celulaLink = aba.getRange(linha, colLinkIndex + 1);
    var courseworkId = String(celulaLink.getNote() || '').trim();
    if (!courseworkId) {
      relatorio.semLinkOuCodigo.push({ linha: linha, id: id });
      continue;
    }

    try {
      var courseWork = obterCourseWork(cursoId, courseworkId);
      var diClass = converterCreationTimeClassroomParaData(courseWork.creationTime);
      var dfClass = converterDueDateClassroomParaData(courseWork.dueDate, courseWork.dueTime);

      if (diClass) aba.getRange(linha, colDiClassIndex + 1).setValue(diClass);
      if (dfClass) aba.getRange(linha, colDfClassIndex + 1).setValue(dfClass);

      relatorio.preenchidos.push({ linha: linha, id: id });
    } catch (e) {
      relatorio.erros.push({ linha: linha, id: id, erro: e.message });
    }
  }

  return relatorio;
}

function preencherDatasClassroomAntigasDiligencias_(cursoId) {
  return _preencherDatasClassroomAntigasDaAba_(
    CONFIG.SHEET_DILIGENCIAS, cursoId,
    CONFIG.COL.ID, CONFIG.COL.LINK, CONFIG.COL.DI_CLASS, CONFIG.COL.DF_CLASS,
    CONFIG.TOTAL_COLUNAS_DILIGENCIAS
  );
}

function preencherDatasClassroomAntigasIniciais_(cursoId) {
  return _preencherDatasClassroomAntigasDaAba_(
    CONFIG.SHEET_INICIAIS, cursoId,
    CONFIG.INICIAIS_COL.ID, CONFIG.INICIAIS_COL.LINK, CONFIG.INICIAIS_COL.DI_CLASS, CONFIG.INICIAIS_COL.DF_CLASS,
    CONFIG.TOTAL_COLUNAS_INICIAIS
  );
}

function preencherDatasClassroomAntigasAcompanhamentos_(cursoId) {
  return _preencherDatasClassroomAntigasDaAba_(
    CONFIG.SHEET_ACOMPANHAMENTOS, cursoId,
    CONFIG.ACOMPANHAMENTOS_COL.ID, CONFIG.ACOMPANHAMENTOS_COL.LINK, CONFIG.ACOMPANHAMENTOS_COL.DI_CLASS, CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS,
    CONFIG.TOTAL_COLUNAS_ACOMPANHAMENTOS
  );
}

// --- Ponto de entrada unico: rodar esta funcao pelo editor do Apps Script ---
// Executa o preenchimento nas tres abas e imprime um relatorio consolidado
// no Log de execucao (Ver > Registros de execucao).
function preencherDatasClassroomAntigasTudo() {
  var cursoId;
  try {
    cursoId = obterIdCursoClassroom();
  } catch (e) {
    Logger.log('ERRO: ' + e.message);
    return { erro: e.message };
  }

  var relDiligencias = preencherDatasClassroomAntigasDiligencias_(cursoId);
  var relIniciais = preencherDatasClassroomAntigasIniciais_(cursoId);
  var relAcompanhamentos = preencherDatasClassroomAntigasAcompanhamentos_(cursoId);

  var linhasLog = [];
  linhasLog.push('=== PREENCHIMENTO DE DI CLASS/DF CLASS EM REGISTROS ANTIGOS ===');

  [relDiligencias, relIniciais, relAcompanhamentos].forEach(function(rel) {
    linhasLog.push('');
    linhasLog.push('--- Aba: ' + rel.aba + ' ---');
    if (rel.erro) {
      linhasLog.push('ERRO: ' + rel.erro);
      return;
    }
    linhasLog.push('Preenchidos agora: ' + rel.preenchidos.length);
    linhasLog.push('Ja tinham DI CLASS (ignorados): ' + rel.jaPreenchidos.length);
    linhasLog.push('Sem link e/ou codigo do Classroom (deixados em branco): ' + rel.semLinkOuCodigo.length);
    linhasLog.push('Erros ao consultar o Classroom: ' + rel.erros.length);

    if (rel.erros.length > 0) {
      linhasLog.push('Detalhe dos erros:');
      rel.erros.forEach(function(item) {
        linhasLog.push('  Linha ' + item.linha + ' (ID ' + item.id + '): ' + item.erro);
      });
    }
  });

  var textoRelatorio = linhasLog.join('\n');
  Logger.log(textoRelatorio);

  return {
    diligencias: relDiligencias,
    iniciais: relIniciais,
    acompanhamentos: relAcompanhamentos,
    relatorioTexto: textoRelatorio
  };
}

// === CRIACAO EM MASSA DE ACOMPANHAMENTOS A PARTIR DE DILIGENCIAS ===
// Script temporario — rodar uma unica vez pelo editor do Apps Script
// (Executar > processarProvisorioAcompanhamentos) para criar em massa
// atividades do tipo Acompanhamento a partir da aba "provisorio_acomp".
// Motivo: diligencias podem gerar a necessidade de um Acompanhamento
// vinculado para o mesmo aluno — pedido de Thales em 24/07/2026.
//
// Layout esperado da aba "provisorio_acomp" (colunas A:F, sem cabecalho
// pulado — a leitura comeca na linha 2):
//   A = ID do estagiario (chave da aba estagiarios!A, nunca o nome)
//   B = ID da atividade (diligencia) de origem (so para referencia no texto
//       da descricao da atividade, nao e validado contra a aba diligencias)
//   C = Processo (numero do processo, igual a acompanhamentos!C)
//   D = Prazo, em dias uteis (considerando bd!C2:C) a partir de hoje, usado
//       para calcular a DATA_ENTREGA do acompanhamento — mesmo campo pedido
//       no modal "Novo Acompanhamento" (ver criarAcompanhamento, Acompanhamentos.js)
//   E = Assistido(a) — nome gravado em acompanhamentos!Q (coluna ASSISTIDO,
//       criada por Thales em 05/08/2026), mesmo campo pedido no modal
//   F = OK — marcado TRUE por este script apos sucesso; linhas com F=TRUE
//       sao ignoradas em reexecucoes (a funcao e segura de rodar mais de
//       uma vez sem duplicar atividades)
//
// Para cada linha elegivel: cria o registro na aba acompanhamentos (mesmas
// regras de criarAcompanhamento — ID sequencial AC-XXXX, STATUS
// "Encaminhado" etc.) e, na sequencia, cria IMEDIATAMENTE a atividade no
// Classroom (mesmas regras de criarCourseWorkParaAcompanhamento), em vez de
// deixar para o botao "Enviar ao Classroom" processar depois. A descricao da
// atividade tem uma linha extra no topo — "Acompanhamento relativo à
// atividade ID {C}." — antes do texto padrao de Acompanhamento (ver
// montarDescricaoAtividadeAcompanhamento, Classroom.js). So entao D e
// marcado TRUE. Erros em uma linha nao interrompem o processamento das
// demais.
var SHEET_PROVISORIO_ACOMP = 'provisorio_acomp';
var PROVISORIO_ACOMP_COL = {
  ID_ESTAGIARIO: 0, // A
  ID_DILIGENCIA: 1, // B
  PROCESSO: 2,      // C
  PRAZO: 3,         // D
  ASSISTIDO: 4,     // E
  OK: 5             // F
};
var TOTAL_COLUNAS_PROVISORIO_ACOMP = 6; // A ate F

// Localiza nome e e-mail de um estagiario pelo ID (estagiarios!A), nunca
// pelo nome — evita ambiguidade em caso de homonimos (mesmo cuidado de
// finalizarEstagiariosPorId, Utilitarios.js). Retorna null se nao encontrado.
function _buscarEstagiarioPorId_(idEstagiario) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return null;

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return null;

  var idAlvo = String(idEstagiario).trim();
  if (!idAlvo) return null;

  var dados = aba.getRange(2, 1, ultimaLinha - 1, 3).getValues();
  for (var i = 0; i < dados.length; i++) {
    if (String(dados[i][CONFIG.ESTAGIARIOS_COL.ID]).trim() === idAlvo) {
      return {
        nome: String(dados[i][CONFIG.ESTAGIARIOS_COL.NOME] || '').trim(),
        email: String(dados[i][CONFIG.ESTAGIARIOS_COL.EMAIL] || '').trim()
      };
    }
  }
  return null;
}

// Reaproveitamento em caso de reexecucao apos falha parcial: se uma execucao
// anterior criou a linha em acompanhamentos mas falhou ANTES de conseguir
// criar a atividade no Classroom (rede instavel, API fora do ar etc.), a
// coluna D (OK) da provisorio_acomp nunca chegou a ser marcada — sem esta
// checagem, rodar a funcao de novo criaria uma SEGUNDA linha duplicada em
// acompanhamentos para o mesmo processo/estagiario. Procura uma linha ja
// existente com o mesmo PROCESSO + NOME e ainda nao enviada ao Classroom
// (CLASS vazio) para retomar a partir dela, em vez de criar uma nova.
function _buscarLinhaAcompanhamentoPendente_(abaAcomp, processo, nomeEstagiario) {
  var ultimaLinha = abaAcomp.getLastRow();
  if (ultimaLinha < 2) return null;

  var processoAlvo = String(processo).trim();
  var nomeAlvo = normalizarChave(nomeEstagiario);

  var dados = abaAcomp.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_ACOMPANHAMENTOS).getValues();
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var jaEnviado = String(row[CONFIG.ACOMPANHAMENTOS_COL.CLASS] || '').trim().toUpperCase() === CONFIG.CLASS_ENVIADO;
    if (jaEnviado) continue;

    var processoRow = String(row[CONFIG.ACOMPANHAMENTOS_COL.PROCESSO] || '').trim();
    var nomeRow = normalizarChave(row[CONFIG.ACOMPANHAMENTOS_COL.NOME]);
    if (processoRow === processoAlvo && nomeRow === nomeAlvo) {
      return {
        linha: i + 2,
        id: row[CONFIG.ACOMPANHAMENTOS_COL.ID],
        dataEntregaRaw: row[CONFIG.ACOMPANHAMENTOS_COL.DATA_ENTREGA]
      };
    }
  }
  return null;
}

function processarProvisorioAcompanhamentos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaProv = ss.getSheetByName(SHEET_PROVISORIO_ACOMP);
  if (!abaProv) {
    Logger.log('Aba "' + SHEET_PROVISORIO_ACOMP + '" nao encontrada.');
    return { erro: 'Aba "' + SHEET_PROVISORIO_ACOMP + '" nao encontrada.' };
  }

  var abaAcomp = ss.getSheetByName(CONFIG.SHEET_ACOMPANHAMENTOS);
  if (!abaAcomp) {
    Logger.log('Aba "' + CONFIG.SHEET_ACOMPANHAMENTOS + '" nao encontrada.');
    return { erro: 'Aba "' + CONFIG.SHEET_ACOMPANHAMENTOS + '" nao encontrada.' };
  }

  var ultimaLinha = abaProv.getLastRow();
  if (ultimaLinha < 2) {
    Logger.log('Nenhum registro em "' + SHEET_PROVISORIO_ACOMP + '".');
    return { processados: [], ignorados: [], erros: [] };
  }

  var dados = abaProv.getRange(2, 1, ultimaLinha - 1, TOTAL_COLUNAS_PROVISORIO_ACOMP).getValues();
  var processados = [];
  var ignorados = [];
  var erros = [];

  for (var i = 0; i < dados.length; i++) {
    var linha = i + 2;
    var row = dados[i];

    var jaOk = row[PROVISORIO_ACOMP_COL.OK] === true ||
      normalizarChave(row[PROVISORIO_ACOMP_COL.OK]) === 'true';
    if (jaOk) {
      ignorados.push({ linha: linha, motivo: 'ja marcado OK' });
      continue;
    }

    var idEstagiario = String(row[PROVISORIO_ACOMP_COL.ID_ESTAGIARIO] || '').trim();
    var processo = String(row[PROVISORIO_ACOMP_COL.PROCESSO] || '').trim();
    var idDiligencia = String(row[PROVISORIO_ACOMP_COL.ID_DILIGENCIA] || '').trim();
    var assistido = String(row[PROVISORIO_ACOMP_COL.ASSISTIDO] || '').trim();
    var prazoDias = parseInt(row[PROVISORIO_ACOMP_COL.PRAZO], 10);

    if (!idEstagiario && !processo && !idDiligencia) continue; // linha em branco

    try {
      if (!idEstagiario) throw new Error('ID do estagiario (coluna A) em branco.');
      if (!processo) throw new Error('Processo (coluna B) em branco.');
      if (!idDiligencia) throw new Error('ID da diligencia (coluna C) em branco.');
      if (isNaN(prazoDias) || prazoDias <= 0) throw new Error('Prazo (coluna D) invalido — informe dias uteis > 0.');
      if (!assistido) throw new Error('Assistido(a) (coluna E) em branco.');

      var estagiario = _buscarEstagiarioPorId_(idEstagiario);
      if (!estagiario || !estagiario.nome) {
        throw new Error('Estagiario com ID "' + idEstagiario + '" nao encontrado na aba estagiarios.');
      }
      if (!estagiario.email) {
        throw new Error('Estagiario "' + estagiario.nome + '" (ID ' + idEstagiario + ') sem e-mail cadastrado.');
      }

      // 1) Cria o registro na aba acompanhamentos — mesmas regras do modal
      // "Novo Acompanhamento" (ver criarAcompanhamento, Acompanhamentos.js).
      // Antes, verifica se uma execucao anterior ja criou essa linha e falhou
      // so na etapa do Classroom (ver _buscarLinhaAcompanhamentoPendente_
      // acima) — se achar, reaproveita em vez de duplicar.
      var idAcompanhamento, linhaAcomp;
      var pendente = _buscarLinhaAcompanhamentoPendente_(abaAcomp, processo, estagiario.nome);
      if (pendente) {
        idAcompanhamento = pendente.id;
        linhaAcomp = pendente.linha;
      } else {
        var resultadoCriacao = criarAcompanhamento({
          processo: processo,
          estagiario: estagiario.nome,
          assistido: assistido,
          prazo: prazoDias
        });
        if (!resultadoCriacao.sucesso) {
          throw new Error('Falha ao criar registro em acompanhamentos: ' + resultadoCriacao.erro);
        }
        idAcompanhamento = resultadoCriacao.id;
        linhaAcomp = resultadoCriacao.linha;
      }

      // 2) Cria IMEDIATAMENTE a atividade no Classroom (em vez de esperar o
      // botao "Enviar ao Classroom"), com a linha extra de referencia a
      // diligencia de origem na descricao (ver idDiligenciaOrigem em
      // montarDescricaoAtividadeAcompanhamento, Classroom.js).
      var dataEntregaRaw = abaAcomp.getRange(linhaAcomp, CONFIG.ACOMPANHAMENTOS_COL.DATA_ENTREGA + 1).getValue();

      var resultadoClass = criarCourseWorkParaAcompanhamento({
        id: idAcompanhamento,
        processo: processo,
        assistido: assistido,
        estagiario: estagiario.nome,
        email: estagiario.email,
        dataEntregaRaw: dataEntregaRaw,
        idDiligenciaOrigem: idDiligencia
      });

      var linkCelula = abaAcomp.getRange(linhaAcomp, CONFIG.ACOMPANHAMENTOS_COL.LINK + 1);
      linkCelula.setValue(resultadoClass.link);
      // Mesma estrategia usada em enviarAcompanhamentosAoClassroom: o ID
      // bruto da coursework fica como nota (comentario) da celula LINK.
      linkCelula.setNote(resultadoClass.courseworkId);
      abaAcomp.getRange(linhaAcomp, CONFIG.ACOMPANHAMENTOS_COL.CLASS + 1).setValue(CONFIG.CLASS_ENVIADO);
      if (resultadoClass.diClass) abaAcomp.getRange(linhaAcomp, CONFIG.ACOMPANHAMENTOS_COL.DI_CLASS + 1).setValue(resultadoClass.diClass);
      if (resultadoClass.dfClass) abaAcomp.getRange(linhaAcomp, CONFIG.ACOMPANHAMENTOS_COL.DF_CLASS + 1).setValue(resultadoClass.dfClass);

      // 3) So agora marca OK na aba provisorio_acomp.
      abaProv.getRange(linha, PROVISORIO_ACOMP_COL.OK + 1).setValue(true);

      processados.push({
        linha: linha,
        idAcompanhamento: idAcompanhamento,
        estagiario: estagiario.nome,
        processo: processo,
        idDiligencia: idDiligencia,
        link: resultadoClass.link
      });
    } catch (e) {
      erros.push({ linha: linha, idEstagiario: idEstagiario, processo: processo, erro: e.message });
    }
  }

  var linhasLog = [];
  linhasLog.push('=== CRIACAO EM MASSA DE ACOMPANHAMENTOS (provisorio_acomp) ===');
  linhasLog.push('Processados com sucesso: ' + processados.length);
  linhasLog.push('Ja estavam OK (ignorados): ' + ignorados.length);
  linhasLog.push('Erros: ' + erros.length);
  if (erros.length > 0) {
    linhasLog.push('Detalhe dos erros:');
    erros.forEach(function(item) {
      linhasLog.push('  Linha ' + item.linha + ' (estagiario ' + item.idEstagiario + ', processo ' + item.processo + '): ' + item.erro);
    });
  }
  var textoRelatorio = linhasLog.join('\n');
  Logger.log(textoRelatorio);

  return { processados: processados, ignorados: ignorados, erros: erros, relatorioTexto: textoRelatorio };
}

// === PREENCHIMENTO DO ASSISTIDO EM ACOMPANHAMENTOS A PARTIR DE DILIGENCIAS ===
// Script temporario — rodar uma unica vez pelo editor do Apps Script
// (Executar > preencherAssistidoAcompanhamento) para preencher
// retroativamente a coluna ASSISTIDO (Q) da aba acompanhamentos, criada por
// Thales em 05/08/2026 (ver Config.js). Registros criados ANTES dessa coluna
// existir ficaram com Q vazio; este script cruza pelo numero do PROCESSO
// para localizar o assistido correspondente na aba diligencias.
//
// Regra: para cada linha de acompanhamentos com PROCESSO (coluna C)
// preenchido e ASSISTIDO (coluna Q) ainda vazio, procura em diligencias uma
// linha cujo PROCESSO (coluna B) seja igual (apos trim) e copia o valor de
// ASSISTIDO (coluna C de diligencias) para acompanhamentos!Q. Linhas de
// acompanhamentos que ja tem Q preenchido sao puladas (seguro rodar mais de
// uma vez). Quando o mesmo processo aparece em mais de uma linha de
// diligencias com assistidos diferentes, usa a PRIMEIRA ocorrencia
// encontrada (decisao de Thales, 05/08/2026). Quando o processo nao e
// encontrado em diligencias, a linha fica de fora e e listada em
// semCorrespondencia, sem gravar nada.
function preencherAssistidoAcompanhamento() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var abaDiligencias = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!abaDiligencias) {
    Logger.log('Aba diligencias nao encontrada.');
    return { erro: 'Aba diligencias nao encontrada.' };
  }
  var abaAcomp = ss.getSheetByName(CONFIG.SHEET_ACOMPANHAMENTOS);
  if (!abaAcomp) {
    Logger.log('Aba acompanhamentos nao encontrada.');
    return { erro: 'Aba acompanhamentos nao encontrada.' };
  }

  // --- Mapa PROCESSO -> ASSISTIDO(A), lido uma unica vez da aba diligencias.
  // Em caso de processo duplicado, mantem a PRIMEIRA ocorrencia encontrada. ---
  var ultimaLinhaDil = abaDiligencias.getLastRow();
  var mapaAssistidoPorProcesso = {};

  if (ultimaLinhaDil >= 2) {
    var dadosDil = abaDiligencias.getRange(2, 1, ultimaLinhaDil - 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues();
    for (var d = 0; d < dadosDil.length; d++) {
      var processoDil = String(dadosDil[d][CONFIG.COL.PROCESSO] || '').trim();
      var assistidoDil = String(dadosDil[d][CONFIG.COL.ASSISTIDO] || '').trim();
      if (!processoDil || !assistidoDil) continue;
      if (Object.prototype.hasOwnProperty.call(mapaAssistidoPorProcesso, processoDil)) continue;
      mapaAssistidoPorProcesso[processoDil] = assistidoDil;
    }
  }

  // --- Varre acompanhamentos e preenche Q onde estiver vazio ---
  var ultimaLinhaAcomp = abaAcomp.getLastRow();
  var preenchidos = [];
  var jaPreenchidos = [];
  var semProcesso = [];
  var semCorrespondencia = [];

  if (ultimaLinhaAcomp >= 2) {
    var dadosAcomp = abaAcomp.getRange(2, 1, ultimaLinhaAcomp - 1, CONFIG.TOTAL_COLUNAS_ACOMPANHAMENTOS).getValues();

    for (var i = 0; i < dadosAcomp.length; i++) {
      var linha = i + 2;
      var row = dadosAcomp[i];
      var id = row[CONFIG.ACOMPANHAMENTOS_COL.ID];

      if (String(row[CONFIG.ACOMPANHAMENTOS_COL.ASSISTIDO] || '').trim()) {
        jaPreenchidos.push({ linha: linha, id: id });
        continue;
      }

      var processo = String(row[CONFIG.ACOMPANHAMENTOS_COL.PROCESSO] || '').trim();
      if (!processo) {
        semProcesso.push({ linha: linha, id: id });
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(mapaAssistidoPorProcesso, processo)) {
        semCorrespondencia.push({ linha: linha, id: id, processo: processo });
        continue;
      }

      var assistido = mapaAssistidoPorProcesso[processo];
      abaAcomp.getRange(linha, CONFIG.ACOMPANHAMENTOS_COL.ASSISTIDO + 1).setValue(assistido);
      preenchidos.push({ linha: linha, id: id, processo: processo, assistido: assistido });
    }
  }

  var linhasLog = [];
  linhasLog.push('=== PREENCHIMENTO DE ASSISTIDO EM ACOMPANHAMENTOS (a partir de diligencias) ===');
  linhasLog.push('Preenchidos agora: ' + preenchidos.length);
  linhasLog.push('Ja tinham ASSISTIDO (ignorados): ' + jaPreenchidos.length);
  linhasLog.push('Sem processo preenchido (deixados em branco): ' + semProcesso.length);
  linhasLog.push('Sem correspondencia em diligencias (deixados em branco): ' + semCorrespondencia.length);
  if (semCorrespondencia.length > 0) {
    linhasLog.push('Detalhe:');
    semCorrespondencia.forEach(function(item) {
      linhasLog.push('  Linha ' + item.linha + ' (ID ' + item.id + ', processo ' + item.processo + ')');
    });
  }
  var textoRelatorio = linhasLog.join('\n');
  Logger.log(textoRelatorio);

  return {
    preenchidos: preenchidos,
    jaPreenchidos: jaPreenchidos,
    semProcesso: semProcesso,
    semCorrespondencia: semCorrespondencia,
    relatorioTexto: textoRelatorio
  };
}