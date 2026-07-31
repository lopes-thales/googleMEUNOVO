// Aluno.gs
// Responsabilidade: agregacao de dados para a pagina "Painel Aluno"
// (?pagina=aluno). Reaproveita os leitores ja existentes de cada aba
// (getTodasDiligencias, getTodasIniciais, getTodosAtendimentos,
// getTodosAcompanhamentos, getTodosEstagiariosCompletos) — nenhuma leitura
// nova de planilha e criada aqui, so o recorte/filtragem por usuario.
//
// Diferenca fundamental em relacao a aba "Panorama" do Painel de Thales: lá
// o payload completo vai para o navegador e a filtragem por aluno/turma e
// feita no frontend (Thales é o unico usuario, e ja enxerga tudo). Aqui,
// quando quem acessa e um ALUNO (tipo === 'aluno'), o recorte por aluno tem
// que ser feito NO SERVIDOR — nunca mandar ao navegador de um estagiario
// registros de outros estagiarios. Quando quem acessa e Thales
// (tipo === 'thales'), o comportamento e o mesmo do Panorama: manda tudo e
// deixa a escolha de aluno/semestre no frontend.
//
// Painel Aluno continua filtrando por SEMESTRE (sem seletor hierarquico de
// turma), mas cada estagiario no payload ja traz a TURMA derivada
// (estagiarios!M) para uso futuro.

// --- Conjunto de estagiarios visiveis para o usuario logado ---
// Pode haver mais de uma linha (uma por turma) para o mesmo e-mail — o
// frontend usa isso para oferecer a troca de turma mesmo para o aluno.
// Usa getTodosEstagiariosParaCliente() (Turma.js), NUNCA
// getTodosEstagiariosCompletos() — este resultado vai direto para o payload
// de getDadosPainelAluno() abaixo, e o segundo inclui dataInicio/dataFim como
// objetos Date crus, que quebram a serializacao de google.script.run assim
// que alguma linha tiver essas celulas preenchidas (payload inteiro vira
// null no cliente).
function getEstagiariosVisiveisPainelAluno(acesso) {
  var todos = getTodosEstagiariosParaCliente(); // Turma.js
  if (acesso.tipo === 'thales') return todos;

  var chaveEmail = normalizarChave(acesso.email);
  return todos.filter(function(e) {
    return normalizarChave(e.email) === chaveEmail;
  });
}

// --- Filtragem server-side dos registros de um conjunto de estagiarios ---
// Mesmas chaves de cruzamento ja usadas em Panorama.js: diligencias e
// atendimentos por nome (ESTAGIARIO), iniciais e acompanhamentos por e-mail.
function filtrarRegistrosPorEstagiarios(lista, estagiarios, camposNome, camposEmail) {
  var nomes = {};
  var emails = {};
  estagiarios.forEach(function(e) {
    if (e.nome) nomes[normalizarChave(e.nome)] = true;
    if (e.email) emails[normalizarChave(e.email)] = true;
  });

  return lista.filter(function(reg) {
    var casaPorNome = camposNome.some(function(campo) {
      return nomes[normalizarChave(reg[campo])];
    });
    if (casaPorNome) return true;
    if (!camposEmail || !camposEmail.length) return false;
    return camposEmail.some(function(campo) {
      return emails[normalizarChave(reg[campo])];
    });
  });
}

// --- Agregador principal (chamado por carregarDadosPainelAluno em Code.js) ---
function getDadosPainelAluno(acesso) {
  var estagiariosVisiveis = getEstagiariosVisiveisPainelAluno(acesso);

  var diligencias = getTodasDiligencias();
  var iniciais = getTodasIniciais();
  var atendimentos = getTodosAtendimentos(); // Panorama.js
  var acompanhamentos = getTodosAcompanhamentos(); // Acompanhamentos.js
  var atendimentosOnline = getTodosAtendimentosOnline(); // AtendimentoOnline.js
  var audienciasEstagiario = getTodasAudienciasEstagiario(); // AudienciasEstagiario.js

  if (acesso.tipo !== 'thales') {
    diligencias = filtrarRegistrosPorEstagiarios(diligencias, estagiariosVisiveis, ['estagiario'], []);
    iniciais = filtrarRegistrosPorEstagiarios(iniciais, estagiariosVisiveis, ['estagiario'], ['email']);
    atendimentos = filtrarRegistrosPorEstagiarios(atendimentos, estagiariosVisiveis, ['estagiario'], []);
    acompanhamentos = filtrarRegistrosPorEstagiarios(acompanhamentos, estagiariosVisiveis, ['estagiario'], ['email']);
    atendimentosOnline = filtrarRegistrosPorEstagiarios(atendimentosOnline, estagiariosVisiveis, ['estagiario'], ['email']);
    audienciasEstagiario = filtrarRegistrosPorEstagiarios(audienciasEstagiario, estagiariosVisiveis, ['estagiario'], ['email']);
  }

  // TURMA (27/07/2026): cada lista recebe aqui a turma JA RESOLVIDA (registro
  // -> aluno -> turma, ver anotarTurmaEmRegistros/criarResolvedorTurma em
  // Turma.js) — mesma tecnica usada em getDadosPanorama (Panorama.js). O
  // Painel Aluno passa a ter o mesmo seletor hierarquico de turma do
  // Panorama (AlunoScripts.html), e filtra direto em reg.turma.
  //
  // Diligencias: a data de referencia para resolver a turma e o ALTERADO EM (M)
  // com fallback para DF (G), mesma regra adotada no Panorama.
  var resolvedorTurma = criarResolvedorTurma();
  anotarTurmaEmRegistros(diligencias, resolvedorTurma, function(r) { return r.estagiario; }, function(r) { return r.alteradoEm || r.df; });
  anotarTurmaEmRegistros(iniciais, resolvedorTurma, function(r) { return r.email || r.estagiario; }, function(r) { return r.di; });
  anotarTurmaEmRegistros(atendimentos, resolvedorTurma, function(r) { return r.estagiario; }, function(r) { return r.data; });
  anotarTurmaEmRegistros(acompanhamentos, resolvedorTurma, function(r) { return r.email || r.estagiario; }, function(r) { return r.di; });
  anotarTurmaEmRegistros(atendimentosOnline, resolvedorTurma, function(r) { return r.email || r.estagiario; }, function(r) { return r.data; });
  anotarTurmaEmRegistros(audienciasEstagiario, resolvedorTurma, function(r) { return r.estagiario || r.email; }, function(r) { return r.data; });

  // Atividades ainda sem Atendimento Online vinculado, calculadas a partir
  // das MESMAS listas ja filtradas acima (ver AtendimentoOnline.js) — o
  // frontend do Painel Aluno usa isso para popular o seletor de atividade no
  // formulario de "Atendimento Online". Quando tipo === 'thales' (varios
  // alunos ao mesmo tempo), a filtragem por aluno em foco continua sendo
  // feita no cliente, exatamente como ja acontece com diligencias/iniciais/
  // acompanhamentos nesta mesma funcao.
  var atividadesElegiveisAO = getAtividadesElegiveisAtendimentoOnline(diligencias, iniciais);

  return {
    tipo: acesso.tipo,
    nome: acesso.nome,
    email: acesso.email,
    estagiarios: estagiariosVisiveis,
    diligencias: diligencias,
    iniciais: iniciais,
    atendimentos: atendimentos,
    acompanhamentos: acompanhamentos,
    atendimentosOnline: atendimentosOnline,
    atividadesElegiveisAO: atividadesElegiveisAO,
    audienciasEstagiario: audienciasEstagiario, // AudienciasEstagiario.js
    parametrosAudiencias: lerParametrosAudiencias(), // bd!X:Z — tipo/meta/horas (AudienciasEstagiario.js)
    turmaCorrente: obterTurmaCorrente(), // TURMA ativa hoje (Turma.js) — padrao do seletor hierarquico
    // RN-13: aviso obrigatorio sobre a ata/declaracao, com o e-mail sempre
    // interpolado a partir de CONFIG.EMAIL_AUTORIZADO — nunca digitado fixo
    // no HTML (ver modal/confirmacao/legenda em AlunoScripts.html).
    avisoComprovanteAudiencia: String(CONFIG.AVISO_COMPROVANTE_AUDIENCIA || '').replace('{EMAIL}', CONFIG.EMAIL_AUTORIZADO),
    // Picklist de ESPECIE do modal "Criar Peticao Inicial" (bd!E2:E — ver
    // pedido de Thales; distinta da picklist de ESPECIE de diligencias, que
    // vem de bd!D2:D).
    especiePicklistIniciais: lerColunaBd(CONFIG.BD_COL.INICIAIS)
  };
}