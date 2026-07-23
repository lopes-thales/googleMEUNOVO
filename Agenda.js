// Agenda.gs
// Responsabilidade: calculos de dias uteis, feriados (bd!C2:C) e classificacao
// dos gatilhos visuais de prazo (Gatilho 1/2/3). Nenhum outro arquivo deve
// calcular dias uteis por conta propria — tudo passa por aqui.

// --- Feriados ---

// Le bd!C2:C e retorna um array de timestamps (00:00) normalizados, um por
// feriado. Formato esperado: uma data (tipo Date do Sheets) por linha.
function lerFeriados() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!aba) return [];

  var dados = aba.getRange(CONFIG.BD_COL.FERIADOS + '2:' + CONFIG.BD_COL.FERIADOS).getValues();
  var lista = [];
  for (var i = 0; i < dados.length; i++) {
    var val = dados[i][0];
    if (!val) continue;
    var d = (val instanceof Date) ? new Date(val) : new Date(val);
    if (isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    lista.push(d.getTime());
  }
  return lista;
}

// --- Dias uteis ---

function ehFimDeSemana(data) {
  var dia = data.getDay(); // 0 = domingo, 6 = sabado
  return dia === 0 || dia === 6;
}

function ehFeriado(data, feriadosTimestamps) {
  var ts = new Date(data);
  ts.setHours(0, 0, 0, 0);
  return feriadosTimestamps.indexOf(ts.getTime()) !== -1;
}

function ehDiaUtil(data, feriadosTimestamps) {
  return !ehFimDeSemana(data) && !ehFeriado(data, feriadosTimestamps);
}

// Soma "quantidade" dias uteis a partir de dataBase (nao inclui dataBase em
// si na contagem — o primeiro dia util APOS dataBase conta como 1). Usado
// para calcular DF = DI + Prazo (em dias uteis) no fluxo de "Novo Pedido".
function adicionarDiasUteis(dataBase, quantidade, feriadosTimestamps) {
  var resultado = new Date(dataBase);
  resultado.setHours(0, 0, 0, 0);
  var restantes = quantidade;

  while (restantes > 0) {
    resultado.setDate(resultado.getDate() + 1);
    if (ehDiaUtil(resultado, feriadosTimestamps)) restantes--;
  }
  return resultado;
}

// Conta quantos dias uteis existem estritamente entre "hoje" (exclusivo) e
// "dataAlvo" (inclusivo). Se dataAlvo <= hoje, retorna um valor <= 0 (nao
// deve ser usado para classificar atraso — ver calcularAtraso em Data.js).
function contarDiasUteisAteAlvo(hoje, dataAlvo, feriadosTimestamps) {
  var cursor = new Date(hoje);
  cursor.setHours(0, 0, 0, 0);
  var alvo = new Date(dataAlvo);
  alvo.setHours(0, 0, 0, 0);

  if (alvo.getTime() <= cursor.getTime()) {
    return alvo.getTime() === cursor.getTime() ? 0 : -1;
  }

  var contador = 0;
  var passo = new Date(cursor);
  while (passo.getTime() < alvo.getTime()) {
    passo.setDate(passo.getDate() + 1);
    if (ehDiaUtil(passo, feriadosTimestamps)) contador++;
  }
  return contador;
}

// --- Classificacao dos gatilhos de prazo (indicador visual, sem e-mail) ---
// Gatilho 1: 5 dias uteis antes da DF
// Gatilho 2: 1 dia util antes da DF (vespera)
// Gatilho 3: no dia da DF
// Retorna null se nenhum gatilho se aplica (fora da janela de alerta) ou se
// o registro ja esta em status final / sem DF valida.
function calcularGatilhoPrazo(df, status, feriadosTimestamps) {
  var statusNorm = normalizarChave(status);
  if (CONFIG.STATUS_FINAIS.indexOf(statusNorm) !== -1) return null;
  if (!df || String(df).trim() === '') return null;

  var dataDf = (df instanceof Date) ? new Date(df) : new Date(df);
  if (isNaN(dataDf.getTime())) return null;

  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  dataDf.setHours(0, 0, 0, 0);

  var diasUteisRestantes = contarDiasUteisAteAlvo(hoje, dataDf, feriadosTimestamps);

  if (diasUteisRestantes < 0) return null; // ja vencido -> tratado como atraso, nao como gatilho
  if (dataDf.getTime() === hoje.getTime()) return 'gatilho3';
  if (diasUteisRestantes === 1) return 'gatilho2';
  if (diasUteisRestantes === 5) return 'gatilho1';
  return null;
}

// --- Semana da pauta de Audiencias (mural do Classroom) ---
// Segunda a sexta-feira — decisao explicita para a publicacao semanal (ver
// publicarPautaSemanalAudiencias, Classroom.js). Diferente da "semana" usada
// na vista padrao da aba Audiencias do painel (sabado a sexta, ver
// calcularLimitesSemanaAudiencias em Scripts.html), que e so uma janela de
// exibicao. Se dataRef cair num sabado ou domingo, calcula a partir da
// segunda-feira mais recente (a anterior).
function calcularLimitesSemanaPautaAudiencias(dataRef) {
  var hoje = dataRef ? new Date(dataRef) : new Date();
  hoje.setHours(0, 0, 0, 0);
  var diasDesdeSegunda = (hoje.getDay() + 6) % 7; // 0=dom...6=sab -> distancia ate a segunda mais recente
  var segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - diasDesdeSegunda);
  var sexta = new Date(segunda);
  sexta.setDate(segunda.getDate() + 4);
  return { inicio: segunda.getTime(), fim: sexta.getTime(), segunda: segunda, sexta: sexta };
}

// --- Horario comercial (para o gatilho automatico de "Verificar Entregas") ---
// Assuncao a confirmar com Thales: 08:00-18:00, dias uteis (considerando
// feriados de bd!C2:C). Ajustar CONFIG.HORARIO_COMERCIAL se necessario.
function dentroDoHorarioComercial() {
  var agora = new Date();
  if (!ehDiaUtil(agora, lerFeriados())) return false;

  var hora = agora.getHours();
  return hora >= CONFIG.HORARIO_COMERCIAL.INICIO && hora < CONFIG.HORARIO_COMERCIAL.FIM;
}

// --- Agendamento de publicacao no Classroom (Diligencias/Acompanhamentos) ---
// Decisao de Thales (corrigida em 19/07/2026): as atividades de Diligencias
// e Acompanhamentos so sao criadas como "Programada" (state DRAFT +
// scheduledTime) quando o ENVIO ocorrer fora do horario comercial, em fim
// de semana ou feriado (ver dentroDoHorarioComercial acima, que ja
// considera os feriados de bd!C2:C). Se o envio ocorrer dentro do horario
// comercial num dia util, a atividade e publicada imediatamente — nao ha
// adiamento (ver criarCourseWorkParaRegistro/criarCourseWorkParaAcompanhamento
// em Classroom.js, que decidem isso chamando dentroDoHorarioComercial()).
// Iniciais fica FORA dessa regra e continua publicando de forma imediata
// sempre (ver criarCourseWorkParaInicial em Classroom.js).
// Esta funcao so calcula O HORARIO do agendamento quando ele e necessario:
// o proximo dia util as CONFIG.HORARIO_COMERCIAL.INICIO horas.
function calcularProximaPublicacaoClassroom(feriadosTimestamps) {
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  var proximoDiaUtil = adicionarDiasUteis(hoje, 1, feriadosTimestamps);
  proximoDiaUtil.setHours(CONFIG.HORARIO_COMERCIAL.INICIO, 0, 0, 0);
  return proximoDiaUtil;
}