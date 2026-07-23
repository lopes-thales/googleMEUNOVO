// Auth.gs
// Responsabilidade: validacao de acesso das duas paginas do projeto —
// Painel de Thales (validarAcesso, uso individual) e Painel Aluno
// (validarAcessoAluno, uso coletivo: Thales + qualquer estagiario cadastrado
// na aba estagiarios). Nenhum outro arquivo deve conferir e-mail/autorizacao
// diretamente — tudo passa por aqui.

function getUsuarioLogado() {
  var email = Session.getActiveUser().getEmail();
  if (!email) return null;
  return email.toLowerCase().trim();
}

function validarAcesso() {
  var email = getUsuarioLogado();
  if (!email) {
    return {
      autorizado: false,
      motivo: 'Nao foi possivel identificar o usuario logado. Acesse com sua conta Google.'
    };
  }

  var autorizado = String(CONFIG.EMAIL_AUTORIZADO || '').toLowerCase().trim();
  if (email !== autorizado) {
    return {
      autorizado: false,
      motivo: 'Seu usuario (' + email + ') nao tem acesso a este painel.'
    };
  }

  return { autorizado: true, email: email, nome: CONFIG.NOME_USUARIO };
}

// --- Painel Aluno ---
// Dois perfis podem abrir a pagina:
//   'thales' — o e-mail configurado em CONFIG.EMAIL_AUTORIZADO. Ve o painel
//              em modo consulta, podendo escolher qualquer aluno/semestre.
//   'aluno'  — qualquer e-mail cadastrado na aba estagiarios (coluna C). Ve
//              somente os proprios registros, com o mesmo e-mail podendo
//              aparecer em mais de um semestre (o frontend deixa escolher).
// Qualquer outro e-mail (ou usuario nao identificado) e barrado.
function validarAcessoAluno() {
  var email = getUsuarioLogado();
  if (!email) {
    return {
      autorizado: false,
      motivo: 'Nao foi possivel identificar o usuario logado. Acesse com sua conta Google institucional.'
    };
  }

  var emailThales = String(CONFIG.EMAIL_AUTORIZADO || '').toLowerCase().trim();
  if (email === emailThales) {
    return { autorizado: true, tipo: 'thales', email: email, nome: CONFIG.NOME_USUARIO };
  }

  // buscarNomeEstagiarioPorEmail e definida em Iniciais.js (cruzamento
  // e-mail -> nome ja usado pela aba Iniciais) — reaproveitada aqui para nao
  // duplicar a leitura da aba estagiarios.
  var nomeAluno = buscarNomeEstagiarioPorEmail(email);
  if (!nomeAluno) {
    return {
      autorizado: false,
      motivo: 'Seu usuario (' + email + ') nao esta cadastrado na aba de estagiarios.'
    };
  }

  return { autorizado: true, tipo: 'aluno', email: email, nome: nomeAluno };
}