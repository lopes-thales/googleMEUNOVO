// MigracaoAcessoEditorAlunos.gs
// Responsabilidade: migracao unica (07/08/2026) para compartilhar como
// Editor, com o proprio aluno, as pastas de estagiario que ja existiam ANTES
// de _obterOuCriarPastaEstagiario passar a fazer isso automaticamente (ver
// Drive.js). Nao mexe no compartilhamento padrao herdado da pasta-mae
// (bd!L2, hoje "Leitor" para todos da Instituicao) — apenas ACRESCENTA o
// aluno como Editor da propria pasta. As duas permissoes convivem sem
// conflito.
//
// Rodar UMA VEZ, no editor do Apps Script: migrarAcessoEditorAlunosLegado().
// E reexecutavel sem risco — para quem ja e Editor, addEditor nao faz nada.
//
// Percorre a aba estagiarios (A:G): para cada linha com NOME, DRIVE (pasta
// ja criada) e EMAIL preenchidos, abre a pasta pelo ID de estagiarios!G e
// garante o aluno como Editor. Casos sem pasta, sem e-mail ou com erro ao
// abrir a pasta/adicionar o editor viram avisos no log — nada e alterado na
// planilha, nenhuma linha e pulada por causa de outra.
function migrarAcessoEditorAlunosLegado() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) {
    Logger.log('Aba estagiarios nao encontrada.');
    return { sucesso: false, erro: 'Aba estagiarios nao encontrada.' };
  }

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) {
    Logger.log('0 estagiario(s) na aba — nada a migrar.');
    return { sucesso: true, compartilhados: 0, jaEditor: 0, avisos: [] };
  }

  var numLinhas = ultimaLinha - 1;
  var colunas = Math.max(7, aba.getLastColumn());
  var dados = aba.getRange(2, 1, numLinhas, colunas).getValues();

  var compartilhados = 0;
  var semPasta = 0;
  var semEmail = 0;
  var avisos = [];

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var nome = String(row[CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    if (!nome) continue;

    var driveId = String(row[CONFIG.ESTAGIARIOS_COL.DRIVE] || '').trim();
    var email = String(row[CONFIG.ESTAGIARIOS_COL.EMAIL] || '').trim();

    if (!driveId) {
      semPasta++;
      continue; // sem pasta cadastrada — nada para compartilhar
    }
    if (!email) {
      semEmail++;
      avisos.push(nome + ': sem e-mail cadastrado (coluna C) — pasta nao compartilhada.');
      continue;
    }

    try {
      var pasta = DriveApp.getFolderById(driveId);
      pasta.addEditor(email);
      compartilhados++;
    } catch (e) {
      avisos.push(nome + ': erro ao compartilhar a pasta (ID: ' + driveId + ') com ' + email + ' — ' + e.message);
    }
  }

  Logger.log(compartilhados + ' pasta(s) compartilhada(s) como Editor com o respectivo aluno.');
  Logger.log(semPasta + ' estagiario(s) sem pasta cadastrada (ignorados).');
  Logger.log(semEmail + ' estagiario(s) sem e-mail cadastrado.');
  if (avisos.length > 0) {
    Logger.log('Avisos (' + avisos.length + '):');
    avisos.forEach(function(a) { Logger.log('  ' + a); });
  }

  return {
    sucesso: true,
    compartilhados: compartilhados,
    semPasta: semPasta,
    semEmail: semEmail,
    avisos: avisos
  };
}
