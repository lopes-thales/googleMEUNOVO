// Distribuicao.gs
// Responsabilidade: aba "Distribuição" do Painel de Thales. Fila de
// diligencias que ja tem ESPECIE/DF REAL/VARA preenchidos por Thales mas
// ainda NAO tem ESTAGIARIO atribuido — e o momento em que ele distribui o
// registro para um estagiario, opcionalmente enviando a atividade ao
// Classroom na mesma acao. Nenhum outro arquivo deve duplicar este filtro.

// Regra de elegibilidade (confirmada por Thales):
//   - CLASS (coluna T) != "S"            -> ainda nao foi enviado ao Classroom
//   - STATUS fora de CONFIG.STATUS_FINAIS -> nao esta Ok / Protocolado / Cancelada
//   - ESTAGIARIO (coluna I) vazio         -> ainda sem estagiario distribuido
function getRegistrosParaDistribuir() {
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

    var classEnviado = String(row[CONFIG.COL.CLASS] || '').trim().toUpperCase() === CONFIG.CLASS_ENVIADO;
    if (classEnviado) continue;

    var statusNorm = normalizarChave(row[CONFIG.COL.STATUS]);
    if (CONFIG.STATUS_FINAIS.indexOf(statusNorm) !== -1) continue; // Ok / Protocolado / Cancelada

    var estagiarioAtual = String(row[CONFIG.COL.ESTAGIARIO] || '').trim();
    if (estagiarioAtual) continue; // ja distribuido

    lista.push({
      _linha: i + 2,
      id: row[CONFIG.COL.ID],
      processo: row[CONFIG.COL.PROCESSO],
      assistido: row[CONFIG.COL.ASSISTIDO],
      diligencia: row[CONFIG.COL.DILIGENCIA],
      di: formatarData(row[CONFIG.COL.DI]),
      prazo: row[CONFIG.COL.PRAZO],
      df: formatarData(row[CONFIG.COL.DF]),
      dfReal: formatarData(row[CONFIG.COL.DF_REAL]),
      status: row[CONFIG.COL.STATUS],
      obs: row[CONFIG.COL.OBS],
      especie: row[CONFIG.COL.ESPECIE],
      subespecie: row[CONFIG.COL.SUBESPECIE],
      vara: row[CONFIG.COL.VARA],
      alteradoEm: formatarDataHora(row[CONFIG.COL.ALTERADO_EM]),
      // Registros desta fila tem CLASS != "S" (ver regra de elegibilidade
      // acima), entao DF CLASS ainda esta sempre vazia aqui — o resolver cai
      // no fallback (DF da planilha) na pratica, mas usamos a mesma funcao
      // por consistencia com o resto do painel (ver resolverDfParaAtraso, Data.js).
      atraso: calcularAtraso(resolverDfParaAtraso(row[CONFIG.COL.DF_CLASS], row[CONFIG.COL.DF]), row[CONFIG.COL.STATUS])
      // ADV, LINK, SEMESTRE, SINC, CLASS, SECRETARIA e DRIVE nunca sao
      // enviados ao frontend desta aba.
    });
  }
  return lista;
}

// Agregador chamado na abertura/atualizacao da aba "Distribuição". Os
// estagiarios ja chegam ao frontend via carregarDadosIniciais() (mesma lista
// reaproveitada em todos os selects do painel) — nao ha necessidade de
// devolve-los de novo aqui. producaoPorEstagiario reaproveita o mesmo
// agregador da aba "Gráficos" (getDadosGraficos, Graficos.js) para exibir o
// grafico "Complexas, simples e acompanhamentos por estagiário" tambem nesta
// aba (decisao de Thales) — nenhuma nova regra de contagem e criada aqui.
function getDadosAbaDistribuicao() {
  return {
    registros: getRegistrosParaDistribuir(),
    producaoPorEstagiario: getDadosGraficos().porEstagiario
  };
}

// --- Gravacao ---
// payload = {
//   registros: [ { _linha, id, estagiario }, ... ],  // somente linhas com estagiario escolhido
//   enviarClassroom: boolean
// }
//
// Passo 1 (sempre): grava ESTAGIARIO, muda STATUS para "Encaminhado" e
// atualiza ALTERADO_EM para cada linha valida — mesma decisao de Thales que
// ja existe no modal de edicao de Diligencia (escolher estagiario com status
// vazio -> "Encaminhado"; aqui e sempre aplicado, pois a fila da aba
// Distribuição so contem registros fora dos status finais). Tambem calcula e
// grava SEMESTRE a partir do DF (coluna G) quando a celula ainda esta vazia —
// esta e, na pratica, a unica chance que muitos registros desta fila tem de
// receber um SEMESTRE, ja que podem nunca passar pelo modal de edicao (que e
// o outro unico lugar que grava essa coluna). Sem isso o registro fica
// distribuido corretamente mas nunca aparece no Panorama, que filtra
// diligencias por igualdade exata de SEMESTRE.
//
// Passo 2 (somente se enviarClassroom = true): cria a atividade no Classroom
// para cada linha salva com sucesso no passo 1, seguindo exatamente a mesma
// logica de enviarDiligenciasAoClassroom() (Classroom.js) — LINK, nota com o
// courseworkId, CLASS = "S", DI = agora, STATUS = "Encaminhado", OBS com a
// mensagem automatica e sincronizacao com a planilha GERAL.
//
// Erros em uma linha (passo 1 ou passo 2) nao interrompem o processamento
// das demais. Uma linha que falhou apenas no envio ao Classroom (passo 2)
// continua salva (estagiario ja gravado) — por isso ela some da aba
// Distribuição no proximo carregamento, mesmo aparecendo em "erros".
function salvarDistribuicao(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!aba) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };

  var itens = (payload && payload.registros) || [];
  var enviarClassroom = !!(payload && payload.enviarClassroom);

  var validos = itens.filter(function(it) {
    var linha = parseInt(it && it._linha, 10);
    return it && !isNaN(linha) && linha >= 2 && String(it.estagiario || '').trim();
  });

  if (validos.length === 0) {
    return { sucesso: false, erro: 'Selecione ao menos um estagiario antes de salvar.' };
  }

  var agora = new Date();
  var salvos = [];
  var erros = [];

  validos.forEach(function(it) {
    var linha = parseInt(it._linha, 10);
    try {
      var estagiario = String(it.estagiario).trim();

      aba.getRange(linha, CONFIG.COL.ESTAGIARIO + 1).setValue(estagiario);
      aba.getRange(linha, CONFIG.COL.STATUS + 1).setValue('Encaminhado');
      aba.getRange(linha, CONFIG.COL.ALTERADO_EM + 1).setValue(agora);

      // A fila de Distribuição contém registros que, até este ponto, podem
      // nunca ter passado pelo modal de edição (unico outro lugar que grava
      // SEMESTRE em diligencias) — sem isso a linha fica com SEMESTRE vazio
      // para sempre e nunca aparece no Panorama, mesmo com ESTAGIARIO
      // preenchido. So calcula se a celula ainda estiver vazia, para nao
      // sobrescrever um SEMESTRE ja gravado manualmente por Thales.
      var semestreCelula = aba.getRange(linha, CONFIG.COL.SEMESTRE + 1);
      var semestreAtual = semestreCelula.getValue();
      if (!semestreAtual || String(semestreAtual).trim() === '') {
        var dfAtual = aba.getRange(linha, CONFIG.COL.DF + 1).getValue();
        var semestreCalculado = calcularSemestre(dfAtual);
        if (semestreCalculado) {
          semestreCelula.setNumberFormat('@'); // forca texto simples, evita reinterpretacao como Data
          semestreCelula.setValue(semestreCalculado);
        }
      }

      sincronizarLinhaParaGeral(linha);

      salvos.push({ _linha: linha, id: it.id || '', estagiario: estagiario });
    } catch (e) {
      erros.push({ _linha: linha, id: it.id || '', erro: e.message });
    }
  });

  var enviados = [];
  if (enviarClassroom && salvos.length > 0) {
    // Releitura apos o passo 1 para pegar o ESTAGIARIO recem-gravado (a
    // criacao da coursework precisa do e-mail do aluno, resolvido a partir
    // desse valor em criarCourseWorkParaRegistro -> buscarEmailEstagiario).
    var ultimaLinha = aba.getLastRow();
    var dadosAtualizados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_DILIGENCIAS).getValues();

    salvos.forEach(function(s) {
      try {
        var row = dadosAtualizados[s._linha - 2];
        if (!row) throw new Error('Linha nao encontrada apos gravacao.');

        var reg = {
          _linha: s._linha,
          id: row[CONFIG.COL.ID],
          processo: row[CONFIG.COL.PROCESSO],
          assistido: row[CONFIG.COL.ASSISTIDO],
          diligencia: row[CONFIG.COL.DILIGENCIA],
          especie: row[CONFIG.COL.ESPECIE],
          vara: row[CONFIG.COL.VARA],
          estagiario: row[CONFIG.COL.ESTAGIARIO],
          dfRaw: row[CONFIG.COL.DF]
        };

        var resultado = criarCourseWorkParaRegistro(reg);
        var agoraEnvio = new Date();
        var linkCelula = aba.getRange(s._linha, CONFIG.COL.LINK + 1);

        linkCelula.setValue(resultado.link);
        linkCelula.setNote(resultado.courseworkId);

        aba.getRange(s._linha, CONFIG.COL.CLASS + 1).setValue(CONFIG.CLASS_ENVIADO);
        aba.getRange(s._linha, CONFIG.COL.DI + 1).setValue(agoraEnvio);
        aba.getRange(s._linha, CONFIG.COL.STATUS + 1).setValue('Encaminhado');
        aba.getRange(s._linha, CONFIG.COL.OBS + 1).setValue('Atividade criada e encaminhada ao aluno em ' + formatarDataHoraObs(agoraEnvio));
        aba.getRange(s._linha, CONFIG.COL.ALTERADO_EM + 1).setValue(agoraEnvio);
        sincronizarLinhaParaGeral(s._linha);

        enviados.push({ _linha: s._linha, id: s.id, link: resultado.link });
      } catch (e) {
        erros.push({ _linha: s._linha, id: s.id, erro: e.message });
      }
    });
  }

  return { sucesso: true, salvos: salvos, enviados: enviados, erros: erros };
}