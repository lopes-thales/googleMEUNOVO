// Aluno.gs
// Responsabilidade: agregacao de dados para a pagina "Painel Aluno"
// (?pagina=aluno). Reaproveita os leitores ja existentes de cada aba
// (getTodasDiligencias, getTodasIniciais, getTodosAtendimentos,
// getTodosAcompanhamentos, getTodosEstagiariosCompletos) — nenhuma leitura
// nova de planilha e criada aqui, so o recorte/filtragem por usuario.
//
// Diferenca fundamental em relacao a aba "Panorama" do Painel de Thales: lá
// o payload completo vai para o navegador e a filtragem por aluno/semestre e
// feita no frontend (Thales é o unico usuario, e ja enxerga tudo). Aqui,
// quando quem acessa e um ALUNO (tipo === 'aluno'), o recorte por aluno tem
// que ser feito NO SERVIDOR — nunca mandar ao navegador de um estagiario
// registros de outros estagiarios. Quando quem acessa e Thales
// (tipo === 'thales'), o comportamento e o mesmo do Panorama: manda tudo e
// deixa a escolha de aluno/semestre no frontend.

// --- Conjunto de estagiarios visiveis para o usuario logado ---
// Pode haver mais de uma linha (um por semestre) para o mesmo e-mail — o
// frontend usa isso para oferecer a troca de semestre mesmo para o aluno.
function getEstagiariosVisiveisPainelAluno(acesso) {
  var todos = getTodosEstagiariosCompletos(); // Panorama.js
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

  if (acesso.tipo !== 'thales') {
    diligencias = filtrarRegistrosPorEstagiarios(diligencias, estagiariosVisiveis, ['estagiario'], []);
    iniciais = filtrarRegistrosPorEstagiarios(iniciais, estagiariosVisiveis, ['estagiario'], ['email']);
    atendimentos = filtrarRegistrosPorEstagiarios(atendimentos, estagiariosVisiveis, ['estagiario'], []);
    acompanhamentos = filtrarRegistrosPorEstagiarios(acompanhamentos, estagiariosVisiveis, ['estagiario'], ['email']);
  }

  return {
    tipo: acesso.tipo,
    nome: acesso.nome,
    email: acesso.email,
    estagiarios: estagiariosVisiveis,
    diligencias: diligencias,
    iniciais: iniciais,
    atendimentos: atendimentos,
    acompanhamentos: acompanhamentos,
    // Picklist de ESPECIE do modal "Criar Peticao Inicial" (bd!E2:E — ver
    // pedido de Thales; distinta da picklist de ESPECIE de diligencias, que
    // vem de bd!D2:D).
    especiePicklistIniciais: lerColunaBd(CONFIG.BD_COL.INICIAIS)
  };
}