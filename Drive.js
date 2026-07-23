// Drive.gs
// Responsabilidade: organizacao dos PDFs de processos no Google Drive.
// Competencia exclusiva deste arquivo: ler/mover/renomear arquivos e
// criar/localizar pastas dentro da pasta configurada em bd!L2
// (CONFIG.BD_CELL.ID_PASTA_PROCESSOS). Nenhum outro script deve mexer em
// Drive/pastas — se precisar, a funcao deve ser adicionada aqui.
//
// Regra de negocio (acionada pelo botao "Organizar Pastas", aba Utilitarios):
//   1. Para cada estagiario com FINALIZADO vazio (nao finalizado) e sem
//      pasta ainda cadastrada em estagiarios!G, localiza (por nome, dentro
//      de bd!L2) ou cria a pasta do estagiario e grava o ID em estagiarios!G.
//   2. Lista os PDFs soltos dentro de bd!L2 (nao entra em subpastas).
//   3. Para cada diligencia com STATUS "Encaminhado" e DRIVE (coluna V)
//      diferente de 'S': normaliza o PROCESSO N° (remove pontuacao/espacos)
//      e procura um PDF cujo nome (sem extensao), tambem normalizado, seja
//      igual. Havendo mais de um PDF com o mesmo nome, usa o primeiro
//      encontrado.
//   4. Encontrando o arquivo, resolve a pasta do estagiario da diligencia —
//      criando-a na hora (mesmo que o estagiario esteja FINALIZADO) caso
//      ainda nao exista — move o arquivo para la, renomeia para
//      "{ID} - {nome original do arquivo}" e marca DRIVE = 'S' na diligencia.
//   5. Diligencias cujo processo nao tenha PDF correspondente ficam com
//      DRIVE vazio (para serem tentadas novamente na proxima execucao) e
//      aparecem no resumo final como "nao encontrados".
//
// Regra de negocio (acionada pelo botao "Arquivar Pastas", aba Utilitarios):
//   Para cada estagiario com FINALIZADO = true (estagiarios!E) e ARQUIVADO
//   (estagiarios!H) diferente de 'S': move a pasta cadastrada em
//   estagiarios!G de dentro de bd!L2 para dentro da subpasta do semestre do
//   estagiario (estagiarios!F), dentro de bd!Q2 — criando a subpasta do
//   semestre se ainda nao existir — e marca ARQUIVADO = 'S'. Estagiario sem
//   semestre cadastrado (F vazio) e pulado, sem marcar ARQUIVADO, e aparece
//   como aviso. Ver arquivarPastasEstagiarios().

// --- Utilidades internas ---

// Remove tudo que nao for letra/numero e poe em minusculo, para comparar
// PROCESSO N° com nome de arquivo ignorando pontos, tracos e espacos.
function _normalizarChaveProcesso(texto) {
  return String(texto || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// Remove a extensao ".pdf" (case-insensitive) do final do nome do arquivo.
function _removerExtensaoPdf(nomeArquivo) {
  return String(nomeArquivo || '').replace(/\.pdf$/i, '');
}

// Retorna a pasta configurada em bd!L2, lancando erro claro se nao estiver
// configurada ou nao puder ser aberta.
function _obterPastaProcessos() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaBd = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!abaBd) throw new Error('Aba bd nao encontrada.');

  var id = String(abaBd.getRange(CONFIG.BD_CELL.ID_PASTA_PROCESSOS).getValue() || '').trim();
  if (!id) {
    throw new Error('ID da pasta de processos nao configurado em bd!' + CONFIG.BD_CELL.ID_PASTA_PROCESSOS + '.');
  }

  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error('Nao foi possivel abrir a pasta configurada em bd!' + CONFIG.BD_CELL.ID_PASTA_PROCESSOS + ' (ID: ' + id + ').');
  }
}

// Localiza (por nome exato) ou cria uma subpasta de "pastaPai" com o nome
// do estagiario. Retorna o ID da subpasta.
function _obterOuCriarPastaEstagiario(pastaPai, nomeEstagiario) {
  var existentes = pastaPai.getFoldersByName(nomeEstagiario);
  if (existentes.hasNext()) {
    return existentes.next().getId();
  }
  var nova = pastaPai.createFolder(nomeEstagiario);
  return nova.getId();
}

// Localiza (por nome exato) ou cria uma subpasta de "pastaPai" com o nome
// do semestre (ex. "2026.02"). Diferente de _obterOuCriarPastaEstagiario,
// retorna o objeto Folder (nao o ID), pois e usado imediatamente para
// mover pastas de estagiario para dentro dela (ver arquivarPastasEstagiarios).
function _obterOuCriarPastaSemestre(pastaPai, semestre) {
  var existentes = pastaPai.getFoldersByName(semestre);
  if (existentes.hasNext()) {
    return existentes.next();
  }
  return pastaPai.createFolder(semestre);
}

// Le a aba estagiarios (A:G) e retorna um array de registros com o numero
// da linha na planilha (1-indexado), para permitir gravar de volta em G.
function _lerEstagiariosParaDrive(ss) {
  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) throw new Error('Aba estagiarios nao encontrada.');

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) return { aba: aba, registros: [] };

  var numLinhas = ultimaLinha - 1;
  var colunas = Math.max(7, aba.getLastColumn()); // garante leitura ate G mesmo se a aba ainda nao tiver a coluna
  var dados = aba.getRange(2, 1, numLinhas, colunas).getValues();

  var registros = [];
  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var nome = String(row[CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    if (!nome) continue;
    registros.push({
      linhaPlanilha: 2 + i,
      nome: nome,
      finalizado: !!String(row[CONFIG.ESTAGIARIOS_COL.FINALIZADO] || '').trim(),
      driveId: String(row[CONFIG.ESTAGIARIOS_COL.DRIVE] || '').trim()
    });
  }
  return { aba: aba, registros: registros };
}

// Grava de volta em estagiarios!G apenas os registros cujo driveId foi
// alterado nesta execucao.
function _gravarDriveIdsEstagiarios(aba, registros) {
  for (var i = 0; i < registros.length; i++) {
    var reg = registros[i];
    if (reg._alterado) {
      aba.getRange(reg.linhaPlanilha, CONFIG.ESTAGIARIOS_COL.DRIVE + 1).setValue(reg.driveId);
    }
  }
}

// Monta um mapa { chaveNormalizada: File } com os PDFs soltos dentro da
// pasta de processos (nao entra em subpastas — Folder.getFilesByType so
// retorna arquivos diretamente dentro da pasta).
function _mapearPdfsPorProcesso(pastaProcessos) {
  var mapa = {};
  var arquivos = pastaProcessos.getFilesByType(MimeType.PDF);
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    var chave = _normalizarChaveProcesso(_removerExtensaoPdf(arquivo.getName()));
    if (!chave) continue;
    // Mais de um PDF com o mesmo nome: mantem o primeiro encontrado.
    if (!mapa.hasOwnProperty(chave)) {
      mapa[chave] = arquivo;
    }
  }
  return mapa;
}

// --- Transferir Atividade (dropdown Gerenciar) ---

// Copia (nao move) o PDF de uma diligencia ja organizada no Drive
// (DRIVE = 'S') da pasta do estagiario original para a pasta do novo
// estagiario, no fluxo "Transferir Atividade" (ver transferirDiligencia,
// Data.js). O arquivo e localizado pelo prefixo "{ID} - " dentro da pasta do
// estagiario original — mesmo padrao de nomeacao gravado por
// organizarPastasDiligencias (ver acima). Retorna true se copiou, false se
// nao havia nada para copiar (ex.: pasta ou arquivo do estagiario original
// nao encontrados) — nesses casos a transferencia continua normalmente.
function copiarPdfParaNovoEstagiario(idDiligencia, nomeEstagiarioAntigo, nomeEstagiarioNovo) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var info = _lerEstagiariosParaDrive(ss);

  var mapaPorNome = {};
  for (var i = 0; i < info.registros.length; i++) {
    mapaPorNome[info.registros[i].nome] = info.registros[i];
  }

  var regAntigo = mapaPorNome[nomeEstagiarioAntigo];
  if (!regAntigo || !regAntigo.driveId) return false;

  var pastaAntiga;
  try {
    pastaAntiga = DriveApp.getFolderById(regAntigo.driveId);
  } catch (e) {
    return false;
  }

  var prefixo = String(idDiligencia || '').trim() + ' - ';
  var arquivoEncontrado = null;
  var arquivos = pastaAntiga.getFilesByType(MimeType.PDF);
  while (arquivos.hasNext()) {
    var arquivo = arquivos.next();
    if (arquivo.getName().indexOf(prefixo) === 0) {
      arquivoEncontrado = arquivo;
      break;
    }
  }
  if (!arquivoEncontrado) return false;

  var pastaProcessos = _obterPastaProcessos();
  var idNovaPasta = _obterOuCriarPastaEstagiario(pastaProcessos, nomeEstagiarioNovo);
  var pastaNova = DriveApp.getFolderById(idNovaPasta);

  arquivoEncontrado.makeCopy(arquivoEncontrado.getName(), pastaNova);

  var regNovo = mapaPorNome[nomeEstagiarioNovo];
  if (regNovo && !regNovo.driveId) {
    regNovo.driveId = idNovaPasta;
    regNovo._alterado = true;
    _gravarDriveIdsEstagiarios(info.aba, info.registros);
  }

  return true;
}

// Retorna a pasta configurada em bd!Q2 (destino do arquivamento), lancando
// erro claro se nao estiver configurada ou nao puder ser aberta. Mesmo padrao
// de _obterPastaProcessos, mas para a pasta de arquivo dos finalizados.
function _obterPastaArquivoEstagiarios() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var abaBd = ss.getSheetByName(CONFIG.SHEET_BD);
  if (!abaBd) throw new Error('Aba bd nao encontrada.');

  var id = String(abaBd.getRange(CONFIG.BD_CELL.ID_PASTA_ARQUIVO_ESTAGIARIOS).getValue() || '').trim();
  if (!id) {
    throw new Error('ID da pasta de arquivo nao configurado em bd!' + CONFIG.BD_CELL.ID_PASTA_ARQUIVO_ESTAGIARIOS + '.');
  }

  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error('Nao foi possivel abrir a pasta configurada em bd!' + CONFIG.BD_CELL.ID_PASTA_ARQUIVO_ESTAGIARIOS + ' (ID: ' + id + ').');
  }
}

// --- Funcao principal (acionada pelo botao "Arquivar Pastas") ---
//
// Para cada estagiario com FINALIZADO = true (coluna E) e ARQUIVADO != 'S'
// (coluna H): move a pasta cadastrada em estagiarios!G de dentro de bd!L2
// para a subpasta do semestre do estagiario (estagiarios!F, ex. "2026.02")
// dentro de bd!Q2 — criando a subpasta do semestre se ainda nao existir —
// removendo a pasta de qualquer pai atual que nao seja essa subpasta — e
// marca ARQUIVADO = 'S'. Estagiario finalizado sem pasta cadastrada em G
// (nunca teve pasta criada) ou sem semestre cadastrado em F e pulado — nao
// ha nada fisico para arquivar / nao ha como saber em qual subpasta colocar
// — e fica registrado como aviso, sem marcar ARQUIVADO, para poder ser
// conferido manualmente.
function arquivarPastasEstagiarios() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var pastaArquivo;
  try {
    pastaArquivo = _obterPastaArquivoEstagiarios();
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }

  var aba = ss.getSheetByName(CONFIG.SHEET_ESTAGIARIOS);
  if (!aba) return { sucesso: false, erro: 'Aba estagiarios nao encontrada.' };

  var ultimaLinha = aba.getLastRow();
  if (ultimaLinha < 2) {
    return { sucesso: true, mensagem: '0 pasta(s) arquivada(s).', arquivados: 0, avisos: [] };
  }

  var numLinhas = ultimaLinha - 1;
  var colMax = Math.max(CONFIG.ESTAGIARIOS_COL.ARQUIVADO + 1, aba.getLastColumn());
  var dados = aba.getRange(2, 1, numLinhas, colMax).getValues();

  var novosArquivado = [];
  var arquivados = 0;
  var avisos = [];
  var cachePastasSemestre = {}; // semestre -> Folder, evita relistar/criar a mesma subpasta a cada linha

  for (var i = 0; i < dados.length; i++) {
    var row = dados[i];
    var nome = String(row[CONFIG.ESTAGIARIOS_COL.NOME] || '').trim();
    var finalizado = !!String(row[CONFIG.ESTAGIARIOS_COL.FINALIZADO] || '').trim();
    var arquivadoAtual = String(row[CONFIG.ESTAGIARIOS_COL.ARQUIVADO] || '').trim().toUpperCase();
    var driveId = String(row[CONFIG.ESTAGIARIOS_COL.DRIVE] || '').trim();
    var semestre = String(normalizarSemestreLido(row[CONFIG.ESTAGIARIOS_COL.SEMESTRE]) || '').trim();

    var elegivel = nome && finalizado && arquivadoAtual !== CONFIG.ARQUIVADO_ESTAGIARIO;
    if (!elegivel) {
      novosArquivado.push([row[CONFIG.ESTAGIARIOS_COL.ARQUIVADO]]);
      continue;
    }

    if (!semestre) {
      novosArquivado.push([row[CONFIG.ESTAGIARIOS_COL.ARQUIVADO]]); // sem semestre cadastrado — nao marca, fica para conferencia manual
      avisos.push(nome + ': sem semestre cadastrado (coluna F vazia) — pasta nao arquivada.');
      continue;
    }

    if (!driveId) {
      novosArquivado.push([row[CONFIG.ESTAGIARIOS_COL.ARQUIVADO]]); // sem pasta cadastrada — nao marca, fica para conferencia manual
      avisos.push(nome + ': sem pasta cadastrada (coluna G vazia) — nada para arquivar.');
      continue;
    }

    var pasta;
    try {
      pasta = DriveApp.getFolderById(driveId);
    } catch (e) {
      novosArquivado.push([row[CONFIG.ESTAGIARIOS_COL.ARQUIVADO]]);
      avisos.push(nome + ': nao foi possivel abrir a pasta cadastrada (ID: ' + driveId + ').');
      continue;
    }

    try {
      var pastaSemestre = cachePastasSemestre[semestre];
      if (!pastaSemestre) {
        pastaSemestre = _obterOuCriarPastaSemestre(pastaArquivo, semestre);
        cachePastasSemestre[semestre] = pastaSemestre;
      }

      pastaSemestre.addFolder(pasta);
      var pais = pasta.getParents();
      while (pais.hasNext()) {
        var pai = pais.next();
        if (pai.getId() !== pastaSemestre.getId()) {
          pai.removeFolder(pasta);
        }
      }
      novosArquivado.push([CONFIG.ARQUIVADO_ESTAGIARIO]);
      arquivados++;
    } catch (e) {
      novosArquivado.push([row[CONFIG.ESTAGIARIOS_COL.ARQUIVADO]]);
      avisos.push(nome + ': erro ao mover a pasta — ' + e.message);
    }
  }

  aba.getRange(2, CONFIG.ESTAGIARIOS_COL.ARQUIVADO + 1, numLinhas, 1).setValues(novosArquivado);

  var mensagem = arquivados + ' pasta(s) arquivada(s).';
  if (avisos.length > 0) mensagem += ' ' + avisos.length + ' aviso(s).';

  return {
    sucesso: true,
    mensagem: mensagem,
    arquivados: arquivados,
    avisos: avisos
  };
}

// --- Funcao principal (acionada pelo botao "Organizar Pastas") ---

function organizarPastasDiligencias() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var pastaProcessos;
  try {
    pastaProcessos = _obterPastaProcessos();
  } catch (e) {
    return { sucesso: false, erro: e.message };
  }

  var abaDiligencias = ss.getSheetByName(CONFIG.SHEET_DILIGENCIAS);
  if (!abaDiligencias) return { sucesso: false, erro: 'Aba diligencias nao encontrada.' };

  var infoEstagiarios = _lerEstagiariosParaDrive(ss);
  var registrosEstagiarios = infoEstagiarios.registros;

  // Mapa nome do estagiario -> registro, para lookup rapido durante o
  // processamento das diligencias.
  var mapaEstagiariosPorNome = {};
  for (var i = 0; i < registrosEstagiarios.length; i++) {
    mapaEstagiariosPorNome[registrosEstagiarios[i].nome] = registrosEstagiarios[i];
  }

  // Passo 1: garante pasta para todo estagiario NAO finalizado que ainda
  // nao tem ID de pasta gravado em G.
  var pastasCriadas = 0;
  for (var j = 0; j < registrosEstagiarios.length; j++) {
    var reg = registrosEstagiarios[j];
    if (reg.finalizado) continue;
    if (reg.driveId) continue;

    var idAntesDaCriacao = reg.driveId;
    reg.driveId = _obterOuCriarPastaEstagiario(pastaProcessos, reg.nome);
    reg._alterado = true;
    if (reg.driveId !== idAntesDaCriacao) pastasCriadas++;
  }

  // Passo 2: mapeia os PDFs soltos na pasta de processos.
  var mapaArquivos = _mapearPdfsPorProcesso(pastaProcessos);

  // Passo 3: percorre diligencias elegiveis (STATUS "Encaminhado" e
  // DRIVE != 'S') e tenta mover o PDF correspondente.
  var ultimaLinha = abaDiligencias.getLastRow();
  var movidos = 0;
  var naoEncontrados = 0;
  var ignorados = 0;
  var avisos = [];

  if (ultimaLinha >= 2) {
    var numLinhas = ultimaLinha - 1;
    var colMax = CONFIG.COL.DRIVE + 1; // coluna V
    var dados = abaDiligencias.getRange(2, 1, numLinhas, colMax).getValues();
    var novosDrive = [];

    for (var k = 0; k < dados.length; k++) {
      var row = dados[k];
      var status = String(row[CONFIG.COL.STATUS] || '').trim().toLowerCase();
      var driveAtual = String(row[CONFIG.COL.DRIVE] || '').trim().toUpperCase();

      var elegivel = (status === CONFIG.STATUS_VALORES[0].toLowerCase()) && (driveAtual !== CONFIG.DRIVE_ORGANIZADO);
      if (!elegivel) {
        novosDrive.push([row[CONFIG.COL.DRIVE]]);
        continue;
      }

      var idDiligencia = String(row[CONFIG.COL.ID] || '').trim();
      var processo = String(row[CONFIG.COL.PROCESSO] || '').trim();
      var nomeEstagiario = String(row[CONFIG.COL.ESTAGIARIO] || '').trim();

      if (!processo || !nomeEstagiario) {
        novosDrive.push([row[CONFIG.COL.DRIVE]]);
        ignorados++;
        avisos.push((idDiligencia || '(sem ID)') + ': processo ou estagiario nao preenchido — ignorada.');
        continue;
      }

      var chave = _normalizarChaveProcesso(processo);
      var arquivo = mapaArquivos[chave];

      if (!arquivo) {
        novosDrive.push([row[CONFIG.COL.DRIVE]]);
        naoEncontrados++;
        continue;
      }

      // Resolve (ou cria na hora) a pasta do estagiario da diligencia —
      // inclusive se ele estiver FINALIZADO ou nao constar em estagiarios.
      var regEstagiario = mapaEstagiariosPorNome[nomeEstagiario];
      if (!regEstagiario) {
        regEstagiario = { linhaPlanilha: null, nome: nomeEstagiario, finalizado: true, driveId: '' };
        mapaEstagiariosPorNome[nomeEstagiario] = regEstagiario;
        avisos.push(idDiligencia + ': estagiario "' + nomeEstagiario + '" nao encontrado na aba estagiarios — pasta criada mesmo assim, mas cadastre-o na aba.');
      }
      if (!regEstagiario.driveId) {
        regEstagiario.driveId = _obterOuCriarPastaEstagiario(pastaProcessos, nomeEstagiario);
        regEstagiario._alterado = true;
        if (regEstagiario.linhaPlanilha) pastasCriadas++;
      }

      try {
        var pastaDestino = DriveApp.getFolderById(regEstagiario.driveId);
        var novoNome = idDiligencia + ' - ' + arquivo.getName();
        arquivo.moveTo(pastaDestino);
        arquivo.setName(novoNome);

        novosDrive.push([CONFIG.DRIVE_ORGANIZADO]);
        movidos++;
        delete mapaArquivos[chave]; // evita reaproveitar o mesmo arquivo em outra linha
      } catch (e) {
        novosDrive.push([row[CONFIG.COL.DRIVE]]);
        avisos.push(idDiligencia + ': erro ao mover/renomear o arquivo — ' + e.message);
      }
    }

    abaDiligencias.getRange(2, CONFIG.COL.DRIVE + 1, numLinhas, 1).setValues(novosDrive);
  }

  // Passo 4: grava de volta os IDs de pasta novos/atualizados em estagiarios!G.
  _gravarDriveIdsEstagiarios(infoEstagiarios.aba, registrosEstagiarios);
  // Registros criados na hora para estagiarios sem linha na planilha (passo 3)
  // nao sao gravados aqui, pois nao ha linha para gravar — ficam so no aviso.

  var mensagem = movidos + ' arquivo(s) movido(s). ' +
    pastasCriadas + ' pasta(s) criada(s). ' +
    naoEncontrados + ' processo(s) sem PDF correspondente.';
  if (ignorados > 0) mensagem += ' ' + ignorados + ' diligencia(s) ignorada(s) por falta de dados.';

  return {
    sucesso: true,
    mensagem: mensagem,
    movidos: movidos,
    pastasCriadas: pastasCriadas,
    naoEncontrados: naoEncontrados,
    ignorados: ignorados,
    avisos: avisos
  };
}