// Producao.gs
// Responsabilidade EXCLUSIVA: montar o payload da "Tabela de Producao" — o
// documento que o estagiario imprime periodicamente e leva para o visto do
// supervisor (modelo .docx "TABELA DE PRODUÇÃO", A4 paisagem).
//
// Documento SEPARADO do Relatorio Final de Estagio (decisao de Thales,
// 02/08/2026): sao dois artefatos distintos, com regras proprias.
//
// Este arquivo NAO le nenhuma aba diretamente. Toda leitura passa pelos
// leitores que ja sao donos de cada dominio:
//   diligencias        -> getTodasDiligencias()        (Data.js)
//   iniciais           -> getTodasIniciais()           (Iniciais.js)
//   acompanhamentos    -> getTodosAcompanhamentos()    (Acompanhamentos.js)
//   atendimentos       -> getTodosAtendimentos()       (Panorama.js)
//   atendimentos_online-> getTodosAtendimentosOnline() (AtendimentoOnline.js)
//   estagiarios        -> getTodosEstagiariosParaCliente() (Turma.js)
//   pesos bd!S2:V2     -> getPesosPontuacaoPanorama()  (Panorama.js)
//
// Todas as regras de negocio (RN-P01 a RN-P09) estao documentadas em
// CONFIG.PRODUCAO (Config.js) — este arquivo apenas as aplica.
//
// Renderizacao: a pagina e montada NO SERVIDOR (TabelaProducao.html, via
// createTemplateFromFile) e nao recebe os dados brutos. O aluno abre HTML ja
// pronto, sem payload manipulavel — requisito de Thales para que a tabela nao
// possa ser alterada antes da entrega.

// --- Formatadores ---

// "2026.02" (ou "2026.02-R") -> "2026.2", exatamente como no cabecalho do
// modelo .docx. Se o valor nao estiver no formato esperado, devolve o proprio
// semestre base sem inventar nada.
function formatarSemestreProducao(semestreOuTurma) {
  var base = String(semestreOuTurma || '').trim().split('-')[0];
  var partes = base.split('.');
  if (partes.length !== 2) return base;
  var ss = parseInt(partes[1], 10);
  if (isNaN(ss)) return base;
  return partes[0] + '.' + ss;
}

// Sufixo de horas do titulo de cada secao, no formato do modelo:
// 1 -> "(01 HORA)", 2 -> "(02 HORAS)", 1.5 -> "(1,5 HORAS)".
// Peso zero/ausente devolve string vazia: o titulo sai sem parenteses, em vez
// de anunciar "(00 HORAS)" por causa de uma celula de bd nao preenchida.
function formatarHorasProducao(peso) {
  var n = Number(peso);
  if (isNaN(n) || n <= 0) return '';
  var texto;
  if (n === Math.floor(n)) {
    texto = (n < 10 ? '0' + n : String(n));
  } else {
    texto = String(n).replace('.', ',');
  }
  return '(' + texto + (n === 1 ? ' HORA)' : ' HORAS)');
}

// Data no formato de exibicao das listas ("dd/MM/yyyy" ou
// "dd/MM/yyyy HH:mm") reduzida ao dia. A tabela impressa nunca mostra hora.
function _producaoSomenteData(texto) {
  var m = String(texto || '').match(/^(\d{2}\/\d{2}\/\d{4})/);
  return m ? m[1] : String(texto || '');
}

// Chave de ordenacao cronologica a partir da data ja formatada em pt-BR.
// Registro sem data valida vai para o fim da lista (nunca some da tabela).
function _producaoChaveData(texto) {
  var m = String(texto || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

// --- Liberacao da impressao (RN-P10) ---
//
// O estagiario so imprime a partir de DATA_FIM menos
// CONFIG.PRODUCAO.DIAS_LIBERACAO dias corridos, e dali em diante para sempre.
// A data de encerramento usada e a `dataFimEfetiva` de cada matricula
// (Turma.js): a janela oficial da turma (turmas!C), salvo override individual
// em estagiarios!L.

// Data a partir da qual aquela matricula pode imprimir. Devolve null quando a
// matricula esta sem data de encerramento — situacao que BLOQUEIA (RN-P10),
// em vez de liberar por omissao.
function _producaoDataLiberacao(dataFimEfetiva) {
  if (!(dataFimEfetiva instanceof Date) || isNaN(dataFimEfetiva.getTime())) return null;
  var d = new Date(dataFimEfetiva.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Number(CONFIG.PRODUCAO.DIAS_LIBERACAO || 0));
  return d;
}

// Avalia um CONJUNTO de matriculas (as do aluno dentro do filtro corrente).
// Basta uma estar liberada para liberar o botao; por isso a data anunciada no
// tooltip e a MENOR entre as encontradas — e a primeira que vai destravar.
//
// Recebe objetos de getTodosEstagiariosComTurma() (Turma.js), nunca de
// getTodosEstagiariosParaCliente(), que nao carrega dataFimEfetiva.
function avaliarLiberacaoImpressao(matriculas) {
  var hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  var maisCedo = null;
  (matriculas || []).forEach(function(mat) {
    var liberacao = _producaoDataLiberacao(mat.dataFimEfetiva);
    if (!liberacao) return;
    if (!maisCedo || liberacao.getTime() < maisCedo.getTime()) maisCedo = liberacao;
  });

  if (!maisCedo) {
    return {
      liberado: false,
      disponivelEm: '',
      ordem: 0,
      motivo: 'A turma selecionada está sem data de encerramento cadastrada. ' +
              'Procure o supervisor para que a Tabela de Produção possa ser liberada.'
    };
  }

  var liberado = hoje.getTime() >= maisCedo.getTime();
  return {
    liberado: liberado,
    disponivelEm: formatarData(maisCedo),
    // Timestamp puro para o cliente ordenar datas sem reparsear texto. Numero
    // atravessa google.script.run sem problema; um Date, nao (ver Turma.js).
    ordem: maisCedo.getTime(),
    motivo: liberado ? '' : 'A Tabela de Produção fica disponível a partir de ' + formatarData(maisCedo) + '.'
  };
}

// Mapa { idMatricula: { liberado, disponivelEm, ordem, motivo } } enviado ao
// Painel Aluno dentro do payload de getDadosPainelAluno (Aluno.js). O
// frontend so precisa consultar as matriculas do aluno em foco — nao recebe
// nenhuma data crua nem recalcula a regra.
function getLiberacaoImpressaoProducao() {
  var mapa = {};
  getTodosEstagiariosComTurma().forEach(function(mat) {
    if (!mat.idMatricula) return;
    mapa[mat.idMatricula] = avaliarLiberacaoImpressao([mat]);
  });
  return mapa;
}

// --- Regras de classificacao ---
// RN-P02: entra tudo, menos o que foi cancelado.
function _producaoNaoCancelada(reg) {
  return normalizarChave(reg.status) !== 'cancelada';
}

// RN-P05: ESPECIE que caracteriza acordo (lista em CONFIG.PRODUCAO).
function _producaoEhAcordo(especie) {
  var chave = normalizarChave(especie);
  if (!chave) return false;
  return (CONFIG.PRODUCAO.ESPECIES_ACORDO || []).some(function(valor) {
    return normalizarChave(valor) === chave;
  });
}

// --- Filtragem (RN-P01) ---
// Mesmo criterio do Painel Aluno (ver paFiltrarPorAluno, AlunoScripts.html):
// a turma e conferida REGISTRO a REGISTRO contra reg.turma (modelo de turmas
// v2), e o vinculo com o aluno e feito por nome e/ou e-mail conforme a aba.
function _producaoFiltrar(lista, chaves, filtro, camposNome, camposEmail) {
  return (lista || []).filter(function(reg) {
    if (!turmaCasaComFiltro(reg.turma, filtro)) return false;
    var okNome = camposNome.some(function(campo) {
      return !!chaves.nomes[normalizarChave(reg[campo])];
    });
    if (okNome) return true;
    if (!camposEmail || !camposEmail.length) return false;
    return camposEmail.some(function(campo) {
      return !!chaves.emails[normalizarChave(reg[campo])];
    });
  });
}

// --- Montagem das secoes ---
// Cada secao devolvida tem a mesma forma generica
//   { titulo, colunas: [{ rotulo, largura }], linhas: [[valor, ...]] }
// para que TabelaProducao.html seja apenas um duplo laco, sem uma marcacao
// diferente por secao.
function _producaoSecao(chaveSecao, pesos, colunas, linhas) {
  var def = CONFIG.PRODUCAO.SECOES[chaveSecao];
  var horas = formatarHorasProducao(pesos[def.peso]);
  return {
    titulo: def.rotulo + (horas ? ' ' + horas : ''),
    colunas: colunas,
    linhas: linhas
  };
}

// ATENDIMENTOS — presenciais + online aprovados na mesma tabela (RN-P03).
// ASSUNTO e RESULTADO DO ATENDIMENTO foram removidos do modelo por decisao de
// Thales: nao existem em nenhuma aba e nao seriam preenchidos a mao.
function _producaoSecaoAtendimentos(atendimentos, atendimentosOnline, pesos) {
  var itens = [];

  atendimentos.forEach(function(reg) {
    itens.push({
      data: _producaoSomenteData(reg.data),
      assistido: reg.nome || '',
      tipo: CONFIG.PRODUCAO.TIPO_ATENDIMENTO.PRESENCIAL
    });
  });

  atendimentosOnline
    .filter(function(reg) {
      return normalizarChave(reg.status) ===
             normalizarChave(CONFIG.STATUS_ATENDIMENTO_ONLINE.APROVADO);
    })
    .forEach(function(reg) {
      itens.push({
        data: _producaoSomenteData(reg.data),
        assistido: reg.atendido || '',
        tipo: CONFIG.PRODUCAO.TIPO_ATENDIMENTO.ONLINE
      });
    });

  itens.sort(function(a, b) {
    return _producaoChaveData(a.data) - _producaoChaveData(b.data);
  });

  return _producaoSecao('ATENDIMENTOS', pesos, [
    { rotulo: '', largura: '6%' },
    { rotulo: 'DATA ATEND.', largura: '18%' },
    { rotulo: 'ASSISTIDO', largura: '52%' },
    { rotulo: 'TIPO DE ATENDIMENTO', largura: '24%' }
  ], itens.map(function(item, i) {
    return [_producaoNumero(i), item.data, item.assistido, item.tipo];
  }));
}

// PEÇA SIMPLES / PEÇA COMPLEXA — mesmas colunas, fontes diferentes.
// AÇÃO = ESPECIE (RN-P04). VISTO fica sempre em branco (assinatura).
function _producaoColunasPeca() {
  return [
    { rotulo: '', largura: '5%' },
    { rotulo: 'Nº PROCESSO', largura: '25%' },
    { rotulo: 'ASSISTIDO', largura: '25%' },
    { rotulo: 'VARA', largura: '20%' },
    { rotulo: 'AÇÃO', largura: '15%' },
    { rotulo: 'VISTO', largura: '10%' }
  ];
}

function _producaoLinhaPeca(reg, indice) {
  return [
    _producaoNumero(indice),
    reg.processo || '',
    reg.assistido || '',
    reg.vara || '',
    reg.especie || '',
    '' // VISTO — assinatura manual do supervisor
  ];
}

// ACOMPANHAMENTOS — ASSISTIDO vem da coluna ASSISTIDO da aba (preenchida no
// modal "Pedido de Acompanhamento", ver Acompanhamentos.js). AÇÃO fica em
// branco para preenchimento a mao (decisao de Thales), assim como o VISTO.
function _producaoSecaoAcompanhamentos(acompanhamentos, pesos) {
  var ordenados = acompanhamentos.slice().sort(function(a, b) {
    return _producaoChaveData(a.di) - _producaoChaveData(b.di);
  });

  return _producaoSecao('ACOMPANHAMENTOS', pesos, [
    { rotulo: '', largura: '5%' },
    { rotulo: 'PROCESSO', largura: '35%' },
    { rotulo: 'ASSISTIDO', largura: '25%' },
    { rotulo: 'AÇÃO', largura: '20%' },
    { rotulo: 'VISTO DO SUPERVISOR', largura: '15%' }
  ], ordenados.map(function(reg, i) {
    return [_producaoNumero(i), reg.processo || '', reg.assistido || '', '', ''];
  }));
}

// ACORDOS — o Nº ACORDO e obtido na Secretaria (observacao 3 do modelo) e por
// isso sai em branco; ASSISTIDOS vem do campo ASSISTIDA(O) da diligencia.
function _producaoSecaoAcordos(acordos, pesos) {
  var ordenados = acordos.slice().sort(function(a, b) {
    return _producaoChaveData(a.di) - _producaoChaveData(b.di);
  });

  return _producaoSecao('ACORDOS', pesos, [
    { rotulo: '', largura: '5%' },
    { rotulo: 'Nº ACORDO', largura: '25%' },
    { rotulo: 'ASSISTIDOS', largura: '55%' },
    { rotulo: 'VISTO', largura: '15%' }
  ], ordenados.map(function(reg, i) {
    return [_producaoNumero(i), '', reg.assistido || '', ''];
  }));
}

// Numeracao "01", "02", ... igual a do modelo.
function _producaoNumero(indice) {
  var n = indice + 1;
  return (n < 10 ? '0' + n : String(n));
}

// --- Agregador principal (chamado por doGetTabelaProducao, Code.js) ---
//
// `acesso` vem de validarAcessoAluno() (Auth.js). Quando o tipo e 'aluno', o
// e-mail recebido por parametro e IGNORADO e substituido pelo do usuario
// logado — um estagiario nunca consegue imprimir a producao de outro mexendo
// na URL.
function montarDadosTabelaProducao(acesso, emailParam, turmaParam) {
  var emailAlvo = (acesso.tipo === 'thales')
    ? String(emailParam || '').trim()
    : acesso.email;

  if (!emailAlvo) {
    return { erro: 'Nenhum estagiário informado para a impressão.' };
  }

  var filtro = String(turmaParam || '').trim();
  if (!filtro) {
    return { erro: 'Nenhuma turma informada para a impressão.' };
  }

  var chaveEmailAlvo = normalizarChave(emailAlvo);
  // getTodosEstagiariosComTurma (e nao a versao "ParaCliente") porque a
  // RN-P10 precisa de dataFimEfetiva, que a versao do cliente remove. Esta
  // funcao roda inteiramente no servidor e nada daqui vai cru para o
  // navegador, entao nao ha risco de serializacao.
  var matriculas = getTodosEstagiariosComTurma().filter(function(e) {
    return normalizarChave(e.email) === chaveEmailAlvo &&
           turmaCasaComFiltro(e.turma, filtro);
  });

  if (!matriculas.length) {
    return { erro: 'Nenhuma matrícula deste estagiário foi encontrada na turma selecionada.' };
  }

  // RN-P10 — segunda barreira, indispensavel: o botao inativo no Painel Aluno
  // so protege a interface. Sem esta checagem, colar a URL ?pagina=producao
  // no navegador imprimiria a tabela a qualquer momento. Thales nao passa por
  // aqui.
  if (acesso.tipo !== 'thales') {
    var liberacao = avaliarLiberacaoImpressao(matriculas);
    if (!liberacao.liberado) {
      return { erro: liberacao.motivo };
    }
  }

  // Um mesmo aluno pode ter duas matriculas dentro do mesmo semestre
  // (antecipado + regular). Nome e periodo saem da primeira; os registros sao
  // a uniao das duas, sem risco de dupla contagem porque cada registro
  // pertence a uma unica turma.
  var chaves = { nomes: {}, emails: {} };
  matriculas.forEach(function(e) {
    if (e.nome) chaves.nomes[normalizarChave(e.nome)] = true;
    if (e.email) chaves.emails[normalizarChave(e.email)] = true;
  });

  var diligencias = _producaoFiltrar(getTodasDiligencias(), chaves, filtro, ['estagiario'], [])
    .filter(_producaoNaoCancelada);
  var iniciais = _producaoFiltrar(getTodasIniciais(), chaves, filtro, ['estagiario'], ['email'])
    .filter(_producaoNaoCancelada);
  var acompanhamentos = _producaoFiltrar(getTodosAcompanhamentos(), chaves, filtro, ['estagiario'], ['email'])
    .filter(_producaoNaoCancelada);
  var atendimentos = _producaoFiltrar(getTodosAtendimentos(), chaves, filtro, ['estagiario'], []);
  var atendimentosOnline = _producaoFiltrar(getTodosAtendimentosOnline(), chaves, filtro, ['estagiario'], ['email']);

  // RN-P05: o acordo sai da fila das pecas ANTES da separacao por subespecie.
  var acordos = diligencias.filter(function(reg) {
    return _producaoEhAcordo(reg.especie);
  });
  var pecas = diligencias.filter(function(reg) {
    return !_producaoEhAcordo(reg.especie);
  });

  var chaveSimples = normalizarChave(CONFIG.SUBESPECIE_VALORES.SIMPLES);
  var simples = pecas.filter(function(reg) {
    return normalizarChave(reg.subespecie) === chaveSimples;
  }).sort(function(a, b) { return _producaoChaveData(a.di) - _producaoChaveData(b.di); });

  var chaveComplexa = normalizarChave(CONFIG.SUBESPECIE_VALORES.COMPLEXA);
  var complexas = pecas.filter(function(reg) {
    return normalizarChave(reg.subespecie) === chaveComplexa;
  });

  // Peca complexa = diligencias Complexas + TODAS as iniciais, ordenadas em
  // conjunto pela data de criacao.
  var complexasEIniciais = complexas.concat(iniciais)
    .sort(function(a, b) { return _producaoChaveData(a.di) - _producaoChaveData(b.di); });

  var pesos = getPesosPontuacaoPanorama(); // bd!S2:V2 (Panorama.js) — RN-P08

  var secoes = [];
  secoes.push(_producaoSecaoAtendimentos(atendimentos, atendimentosOnline, pesos));
  secoes.push(_producaoSecao('SIMPLES', pesos, _producaoColunasPeca(),
    simples.map(_producaoLinhaPeca)));
  secoes.push(_producaoSecao('COMPLEXA', pesos, _producaoColunasPeca(),
    complexasEIniciais.map(_producaoLinhaPeca)));
  secoes.push(_producaoSecaoAcompanhamentos(acompanhamentos, pesos));
  secoes.push(_producaoSecaoAcordos(acordos, pesos));

  // RN-P07: secao sem nenhuma linha nao e impressa.
  secoes = secoes.filter(function(secao) { return secao.linhas.length > 0; });

  var semestre = formatarSemestreProducao(matriculas[0].turma || filtro);
  var titulo = CONFIG.PRODUCAO.TITULO + (semestre ? ' ' + semestre : '');

  return {
    titulo: titulo,
    tituloPagina: titulo + ' — ' + (matriculas[0].nome || ''),
    aluno: {
      nome: matriculas[0].nome || '',
      periodo: matriculas[0].periodo || '',
      supervisor: CONFIG.NOME_USUARIO
    },
    secoes: secoes,
    observacoes: CONFIG.PRODUCAO.OBSERVACOES || [],
    vazio: secoes.length === 0
  };
}
