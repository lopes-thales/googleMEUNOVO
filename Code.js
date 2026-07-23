// Code.gs
// Responsabilidade: ponto de entrada (doGet) e roteamento de chamadas do
// frontend (google.script.run).

// Pagina de erro generica (mesmo layout usado pelas duas paginas do
// projeto), para nao duplicar o HTML de acesso negado.
function paginaAcessoNegado(tituloPagina, motivo) {
  return HtmlService.createHtmlOutput(
    '<html><body style="font-family:\'Google Sans\',Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0D1B4B;">' +
    '<div style="text-align:center;color:#fff;">' +
    '<h2 style="color:#F87171;">Acesso Negado</h2>' +
    '<p style="color:#A8BFE8;">' + motivo + '</p>' +
    '</div></body></html>'
  ).setTitle(tituloPagina + ' — Acesso Negado');
}

// Roteamento: sem parametro -> Painel de Thales (padrao, uso individual);
// ?pagina=aluno -> Painel Aluno (Thales + qualquer estagiario cadastrado).
// Ver CONFIG.ROTA.
function doGet(e) {
  var parametro = (e && e.parameter) ? e.parameter[CONFIG.ROTA.PARAM] : '';

  if (parametro === CONFIG.ROTA.VALOR_ALUNO) {
    return doGetPainelAluno();
  }

  var acesso = validarAcesso();
  if (!acesso.autorizado) {
    return paginaAcessoNegado('Painel de Thales', acesso.motivo);
  }

  var template = HtmlService.createTemplateFromFile('thales');
  template.nomeUsuario = acesso.nome;

  return template.evaluate()
    .setTitle('Painel de Thales')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGetPainelAluno() {
  var acesso = validarAcessoAluno();
  if (!acesso.autorizado) {
    return paginaAcessoNegado('Painel Aluno', acesso.motivo);
  }

  var template = HtmlService.createTemplateFromFile('PainelAluno');
  template.nomeUsuario = acesso.nome;

  return template.evaluate()
    .setTitle('Painel de ' + acesso.nome)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onEdit(e) {
  processarEdicaoSecretaria(e);
  processarEdicaoGeralSync(e);
  processarEdicaoClassStatusOk(e);
}

// Chamado pelo frontend na inicializacao da pagina.
function carregarDadosIniciais() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return getDadosIniciais();
  } catch (e) {
    return { erro: 'Erro ao carregar dados: ' + e.message };
  }
}

// Chamado apos finalizar estagiarios no modal "Gerenciar Estagiários" —
// recarrega apenas a lista de estagiarios ativos (mais leve que recarregar
// diligencias inteiras via carregarDadosIniciais()).
function recarregarListaEstagiarios() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return { estagiarios: getEstagiarios() };
  } catch (e) {
    return { erro: 'Erro ao recarregar estagiários: ' + e.message };
  }
}

// Chamado para recarregar apos salvar uma edicao, sem tela cheia de loading.
function recarregarDiligencias() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return { diligencias: getTodasDiligencias() };
  } catch (e) {
    return { erro: 'Erro ao recarregar: ' + e.message };
  }
}

// Chamado ao salvar edicao de um registro no modal.
function salvarRegistro(payload) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return salvarEdicaoDiligencia(payload);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao salvar: ' + e.message };
  }
}

// Chamado pelo botao "Enviar ao Classroom" no dropdown Gerenciar.
// Processa diligencias e acompanhamentos juntos (ver enviarPendentesAoClassroom em Classroom.js).
function acaoEnviarAoClassroom() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return enviarPendentesAoClassroom();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao enviar ao Classroom: ' + e.message };
  }
}

// Chamado pelo botao "Verificar Entregas" no dropdown Gerenciar (execucao
// manual, sob demanda — alem do gatilho automatico horario em Classroom.js).
// Processa diligencias e acompanhamentos juntos (ver verificarTodasEntregasClassroom em Classroom.js).
function acaoVerificarEntregas() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return verificarTodasEntregasClassroom();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao verificar entregas: ' + e.message };
  }
}

// Chamado pelo card "Publicar Pauta da Semana" na aba Utilitarios > Classroom
// do painel (execucao manual, sob demanda — alem do gatilho automatico de
// segunda-feira as 8h, ver publicarPautaSemanalAutomatico em Classroom.js).
function acaoPublicarPautaSemanal() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return publicarPautaSemanalAudiencias();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao publicar pauta da semana: ' + e.message };
  }
}

// Chamado pelo botao "Enviar Cobranças" no dropdown Gerenciar (execucao
// manual, sob demanda — alem do gatilho automatico diario em Mensagens.js).
// Varre diligencias, iniciais e acompanhamentos com prazo vencido e sem
// entrega, enviando a Mensagem 1 ou 2 conforme o caso (ver
// enviarCobrancasPendentes em Mensagens.js).
function acaoEnviarCobrancas() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return enviarCobrancasPendentes();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao enviar cobranças: ' + e.message };
  }
}

// Chamado pelo modal "Novo Pedido" no dropdown Gerenciar.
function acaoCriarPedidoAluno(payload) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return criarPedidoAluno(payload);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao criar pedido: ' + e.message };
  }
}

// Chamado pela etapa 1 do modal "Transferir Atividade" (dropdown Gerenciar),
// ao clicar "Ok" apos digitar o ID da diligencia.
function acaoBuscarDiligenciaParaTransferencia(id) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return buscarDiligenciaPorId(id);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao buscar diligência: ' + e.message };
  }
}

// Chamado pela etapa 2 do modal "Transferir Atividade", apos a confirmacao
// ("Confirma a transferencia..."). Ver transferirDiligencia em Data.js.
function acaoTransferirDiligencia(payload) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return transferirDiligencia(payload);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao transferir diligência: ' + e.message };
  }
}

// Chamado pelo frontend ao abrir/atualizar a aba "Iniciais" (cruza iniciais
// com estagiarios a cada chamada para exibir o nome do estagiario; o
// cruzamento com protocolos roda apenas 1x/dia via gatilho — ver Iniciais.js).
function carregarDadosAbaIniciais() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return getDadosAbaIniciais();
  } catch (e) {
    return { erro: 'Erro ao carregar Iniciais: ' + e.message };
  }
}

// Chamado ao salvar a edicao de STATUS no modal da aba "Iniciais".
function salvarRegistroInicial(payload) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return salvarEdicaoInicial(payload);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao salvar: ' + e.message };
  }
}

// Chamado pelo frontend ao abrir/atualizar a aba "Distribuição" (ver Distribuicao.js).
function carregarDadosAbaDistribuicao() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return getDadosAbaDistribuicao();
  } catch (e) {
    return { erro: 'Erro ao carregar Distribuição: ' + e.message };
  }
}

// Chamado pelos botoes "Salvar" e "Salvar e Enviar" da aba "Distribuição".
function acaoSalvarDistribuicao(payload) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return salvarDistribuicao(payload);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao salvar distribuição: ' + e.message };
  }
}

// Chamado pelo frontend ao abrir/atualizar a aba "Acompanhamentos" (ver Acompanhamentos.js).
function carregarDadosAbaAcompanhamentos() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return getDadosAbaAcompanhamentos();
  } catch (e) {
    return { erro: 'Erro ao carregar Acompanhamentos: ' + e.message };
  }
}

// Chamado ao salvar a edicao de STATUS no modal da aba "Acompanhamentos".
function salvarRegistroAcompanhamento(payload) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return salvarEdicaoAcompanhamento(payload);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao salvar: ' + e.message };
  }
}

// Chamado pelo modal "Novo Acompanhamento" (opcao "Pedido de Acompanhamento" no dropdown Gerenciar).
function acaoCriarAcompanhamento(payload) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return criarAcompanhamento(payload);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao criar acompanhamento: ' + e.message };
  }
}

// Chamado pelo frontend ao abrir a aba "Panorama" — cruza estagiarios com
// diligencias, iniciais, acompanhamentos e atendimentos (ver Panorama.js).
function carregarDadosPanorama() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return getDadosPanorama();
  } catch (e) {
    return { erro: 'Erro ao carregar Panorama: ' + e.message };
  }
}

// Chamado pelo frontend ao abrir a aba "Gráficos" — soma a producao dos
// estagiarios ativos, cada um no seu proprio semestre (ver Graficos.js).
function carregarDadosAbaGraficos() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return getDadosGraficos();
  } catch (e) {
    return { erro: 'Erro ao carregar Gráficos: ' + e.message };
  }
}

// Chamado pelo botao "Preencher Semestre" na aba "Utilitarios".
function acaoPreencherSemestre() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return preencherSemestrePlanilha();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao preencher semestre: ' + e.message };
  }
}

// Chamado pelo botao "Preencher DF Final" na aba "Utilitarios".
function acaoPreencherDfFinal() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return preencherDfFinalPlanilha();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao preencher DF Final: ' + e.message };
  }
}

// Chamado pelo modal "Calcular Dia Util" na aba "Utilitarios" (Sistema).
function acaoCalcularDiaUtil(dataIso, prazo) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return calcularDiaUtilPlanilha(dataIso, prazo);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao calcular dia útil: ' + e.message };
  }
}

// Chamado pelo botao "Enviar para Secretaria" na aba "Utilitarios".
function acaoEnviarParaSecretaria() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return enviarSecretariaParaPlanilhaDestino();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao enviar para Secretaria: ' + e.message };
  }
}

// Chamado pelo botao "Verificar Protocolos" na aba "Utilitarios" (Sistema) —
// dispara manualmente o cruzamento iniciais x protocolos (mesma logica do
// gatilho diario as 8h, ver verificarProtocolosIniciais em Iniciais.js).
function acaoVerificarProtocolosIniciais() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return verificarProtocolosIniciais();
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao verificar protocolos: ' + e.message };
  }
}

// Chamado pelo botao "Gerenciar Estagiários" na aba "Utilitarios" (Sistema),
// ao abrir o modal — lista os estagiarios elegiveis para finalizacao.
function acaoListarEstagiariosParaGerenciar() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return { sucesso: true, estagiarios: listarEstagiariosParaGerenciar() };
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao carregar estagiários: ' + e.message };
  }
}

// Chamado pelo botao "Salvar" do modal "Gerenciar Estagiários" — recebe os
// IDs marcados e grava FINALIZADO = TRUE para cada um.
function acaoFinalizarEstagiarios(ids) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return finalizarEstagiariosPorId(ids);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao finalizar estagiários: ' + e.message };
  }
}

// === PAINEL ALUNO ===

// Chamado pelo frontend do Painel Aluno na inicializacao da pagina.
function carregarDadosPainelAluno() {
  try {
    var acesso = validarAcessoAluno();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return getDadosPainelAluno(acesso);
  } catch (e) {
    return { erro: 'Erro ao carregar dados: ' + e.message };
  }
}

// Chamado pelo botao "Criar Petição Inicial" do Painel Aluno.
// Resolucao do e-mail dono do registro (decisao de Thales):
//   - Thales (tipo 'thales'): usa o e-mail do aluno selecionado no seletor
//     (payload.emailAluno), validado contra a aba estagiarios — nunca aceito
//     "as cegas" do frontend.
//   - Aluno (tipo 'aluno'): usa sempre o proprio e-mail logado, mesmo que o
//     payload traga outro valor — evita que um aluno crie um pedido em nome
//     de outro.
function acaoCriarPedidoInicial(payload) {
  try {
    var acesso = validarAcessoAluno();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };

    var emailFinal;
    if (acesso.tipo === 'thales') {
      var emailInformado = normalizarChave((payload && payload.emailAluno) || '');
      var existe = getTodosEstagiariosCompletos().some(function(e) {
        return normalizarChave(e.email) === emailInformado;
      });
      if (!emailInformado || !existe) {
        return { sucesso: false, erro: 'Selecione um aluno valido antes de criar a petição inicial.' };
      }
      emailFinal = emailInformado;
    } else {
      emailFinal = acesso.email;
    }

    return criarPedidoInicialAluno({
      cpf: payload && payload.cpf,
      assistido: payload && payload.assistido,
      especie: payload && payload.especie,
      email: emailFinal
    });
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao criar petição inicial: ' + e.message };
  }
}

// === ATENDIMENTO ONLINE ===

// Chamado pelo formulario "Atendimento Online" do Painel Aluno. Resolucao do
// e-mail/nome dono do registro segue exatamente a mesma decisao de Thales ja
// aplicada em acaoCriarPedidoInicial: Thales usa o aluno escolhido no
// seletor (payload.emailAluno), validado contra a aba estagiarios; um aluno
// sempre usa o proprio e-mail logado, nunca um valor vindo do payload.
function acaoCriarAtendimentoOnline(payload) {
  try {
    var acesso = validarAcessoAluno();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };

    var emailFinal, nomeFinal;
    if (acesso.tipo === 'thales') {
      var emailInformado = normalizarChave((payload && payload.emailAluno) || '');
      var estagiarioAlvo = getTodosEstagiariosCompletos().filter(function(e) {
        return normalizarChave(e.email) === emailInformado;
      })[0];
      if (!estagiarioAlvo) {
        return { sucesso: false, erro: 'Selecione um aluno válido antes de registrar o atendimento.' };
      }
      emailFinal = estagiarioAlvo.email;
      nomeFinal = estagiarioAlvo.nome;
    } else {
      emailFinal = acesso.email;
      nomeFinal = acesso.nome;
    }

    return criarAtendimentoOnline(payload, nomeFinal, emailFinal);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao criar atendimento online: ' + e.message };
  }
}

// Chamado ao editar/reenviar um Atendimento Online Reprovado, no Painel Aluno.
function acaoReenviarAtendimentoOnline(payload) {
  try {
    var acesso = validarAcessoAluno();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return reenviarAtendimentoOnline(payload, acesso.email, acesso.tipo === 'thales');
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao reenviar atendimento online: ' + e.message };
  }
}

// Chamado pelo frontend ao abrir a aba "Atendimento Online" no Painel de Thales.
function carregarDadosAprovacaoAtendimentoOnline() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return getDadosAprovacaoAtendimentoOnline();
  } catch (e) {
    return { erro: 'Erro ao carregar Atendimento Online: ' + e.message };
  }
}

// Chamado pelo botao "Aprovar" na fila de Atendimento Online.
function acaoAprovarAtendimentoOnline(linha) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return aprovarAtendimentoOnline(linha);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao aprovar: ' + e.message };
  }
}

// Chamado pelo botao "Reprovar" (com motivo) na fila de Atendimento Online.
function acaoReprovarAtendimentoOnline(linha, motivo) {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };
    return reprovarAtendimentoOnline(linha, motivo);
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao reprovar: ' + e.message };
  }
}

// Chamado pelo botao "Sincronizar GERAL" na aba "Utilitarios" (se criado).
// Chamado pelo botao "Sincronizar GERAL" na aba "Utilitarios".
function acaoSincronizarGeral() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { sucesso: false, erro: acesso.motivo };

    var resultado = sincronizarPendentesParaGeral();
    if (!resultado.sucesso) return resultado;

    var mensagem;
    if (resultado.quantidade === 0) {
      mensagem = 'Nenhum registro pendente de sincronizacao com GERAL.';
    } else {
      mensagem = resultado.quantidade + ' registro(s) sincronizado(s) com GERAL.';
      if (resultado.erros && resultado.erros.length) {
        mensagem += ' (' + resultado.erros.length + ' com erro — ver log)';
      }
    }

    return {
      sucesso: true,
      quantidade: resultado.quantidade,
      erros: resultado.erros,
      mensagem: mensagem
    };
  } catch (e) {
    return { sucesso: false, erro: 'Erro ao sincronizar com GERAL: ' + e.message };
  }
}

// Chamado pelo frontend ao abrir a aba "Audiencias" — le a aba audiencias
// diretamente (somente leitura, ver Audiencias.js).
function carregarDadosAbaAudiencias() {
  try {
    var acesso = validarAcesso();
    if (!acesso.autorizado) return { erro: acesso.motivo };
    return getDadosAbaAudiencias();
  } catch (e) {
    return { erro: 'Erro ao carregar Audiências: ' + e.message };
  }
}