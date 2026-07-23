// Audiencias.gs
// Responsabilidade: leitura da aba "audiencias" para a aba "Audiencias" do
// painel. Somente leitura — todas as colunas (incluindo DIA, que e uma
// formula a partir de DATA) vem prontas da planilha e nunca sao gravadas
// por este painel.

// Converte a coluna HORA (celula de hora do Sheets) em "HH:mm". Aceita tanto
// um Date (caso normal) quanto texto solto, para nao quebrar se a celula
// estiver formatada como texto.
function formatarHoraAudiencia(val) {
  if (val === '' || val === null || val === undefined) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    try {
      return Utilities.formatDate(val, CONFIG.TIMEZONE, 'HH:mm');
    } catch (e) {
      return '';
    }
  }
  return String(val).trim();
}

// Minutos desde 00:00, usado apenas para ordenar audiencias no mesmo dia.
function _minutosDoDiaAudiencia(val) {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.getHours() * 60 + val.getMinutes();
  }
  var m = String(val || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  return 0;
}

function getTodasAudiencias() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_AUDIENCIAS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_AUDIENCIAS).getValues();
  var lista = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var dataVal = row[CONFIG.AUDIENCIAS_COL.DATA];
    var processo = String(row[CONFIG.AUDIENCIAS_COL.PROCESSO] || '').trim();
    var assistido = String(row[CONFIG.AUDIENCIAS_COL.ASSISTIDO] || '').trim();
    if (!dataVal && !processo && !assistido) continue;

    var dataObj = (dataVal instanceof Date && !isNaN(dataVal.getTime())) ? dataVal : null;

    lista.push({
      _linha: i + 2,
      _ordData: dataObj ? dataObj.getTime() : null,
      _ordHora: _minutosDoDiaAudiencia(row[CONFIG.AUDIENCIAS_COL.HORA]),
      id: row[CONFIG.AUDIENCIAS_COL.ID],
      data: formatarData(dataVal),
      dia: String(row[CONFIG.AUDIENCIAS_COL.DIA] || '').trim(),
      hora: formatarHoraAudiencia(row[CONFIG.AUDIENCIAS_COL.HORA]),
      vara: row[CONFIG.AUDIENCIAS_COL.VARA],
      adv: row[CONFIG.AUDIENCIAS_COL.ADV],
      tipo: row[CONFIG.AUDIENCIAS_COL.TIPO],
      processo: processo,
      assistido: assistido,
      obs: row[CONFIG.AUDIENCIAS_COL.OBS]
    });
  }

  // Sem data valida vai para o final — nao ha como agrupar/classificar por
  // semana uma linha assim, mas ainda aparece com "Mostrar passadas".
  lista.sort(function(a, b) {
    if (a._ordData === null && b._ordData === null) return 0;
    if (a._ordData === null) return 1;
    if (b._ordData === null) return -1;
    if (a._ordData !== b._ordData) return a._ordData - b._ordData;
    return a._ordHora - b._ordHora;
  });

  lista.forEach(function(r) {
    delete r._ordData;
    delete r._ordHora;
  });

  return lista;
}

// Chamado pelo frontend ao abrir a aba "Audiencias" do painel — so mostra os
// registros do proprio Thales (coluna ADV = CONFIG.NOME_USUARIO), decisao de
// Thales: o painel individual so deve listar as audiencias dele mesmo, ainda
// que a aba "audiencias" da planilha reuna registros de toda a equipe.
// IMPORTANTE: a publicacao semanal no Classroom (getAudienciasDaSemana,
// abaixo) NAO usa esse filtro — reune as audiencias de TODOS os registros da
// semana, de qualquer advogado(a).
function getDadosAbaAudiencias() {
  var chaveThales = normalizarChave(CONFIG.NOME_USUARIO);
  var audiencias = getTodasAudiencias().filter(function(reg) {
    return normalizarChave(reg.adv) === chaveThales;
  });
  return { audiencias: audiencias };
}

// === PAUTA SEMANAL (publicacao no mural do Classroom) ===
// Ver publicarPautaSemanalAudiencias em Classroom.js.

var DIAS_SEMANA_PAUTA_AUDIENCIAS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];

// Le a aba audiencias diretamente e filtra por intervalo de datas
// [inicioTs, fimTs] (timestamps de meia-noite, inclusive dos dois lados),
// SEM filtrar por advogado(a) — usada pela publicacao semanal no Classroom,
// que deve reunir as audiencias de todos os registros da semana, diferente
// de getDadosAbaAudiencias (acima), que so mostra as de Thales. Linhas sem
// DATA valida sao ignoradas (nao ha como saber se caem na semana).
function getAudienciasDaSemana(inicioTs, fimTs) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_AUDIENCIAS);
  if (!aba) return [];

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return [];

  var dados = aba.getRange(2, 1, ultimaLinha - 1, CONFIG.TOTAL_COLUNAS_AUDIENCIAS).getValues();
  var lista = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var dataVal = row[CONFIG.AUDIENCIAS_COL.DATA];
    if (!(dataVal instanceof Date) || isNaN(dataVal.getTime())) continue;

    var diaTrunc = new Date(dataVal);
    diaTrunc.setHours(0, 0, 0, 0);
    var ts = diaTrunc.getTime();
    if (ts < inicioTs || ts > fimTs) continue;

    lista.push({
      _ordHora: _minutosDoDiaAudiencia(row[CONFIG.AUDIENCIAS_COL.HORA]),
      ts: ts,
      data: formatarData(dataVal),
      diaSemana: DIAS_SEMANA_PAUTA_AUDIENCIAS[diaTrunc.getDay() - 1] || '',
      hora: formatarHoraAudiencia(row[CONFIG.AUDIENCIAS_COL.HORA]),
      vara: String(row[CONFIG.AUDIENCIAS_COL.VARA] || '').trim(),
      adv: String(row[CONFIG.AUDIENCIAS_COL.ADV] || '').trim(),
      tipo: String(row[CONFIG.AUDIENCIAS_COL.TIPO] || '').trim()
    });
  }

  lista.sort(function(a, b) {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return a._ordHora - b._ordHora;
  });
  lista.forEach(function(r) { delete r._ordHora; });

  return lista;
}
