/**
 * AcompanhamentoSemanal.js
 *
 * MENSAGEM 6 — acompanhamento semanal de producao do estagiario.
 *
 * Criado em 02/08/2026 a pedido de Thales. E a unica mensagem do painel que
 * leva TABELAS DETALHADAS (registro a registro) alem do quadro-resumo, e a
 * unica com gatilho SEMANAL proprio. Por isso ganhou arquivo proprio em vez
 * de entrar em Mensagens.js (que ja passa de mil linhas e concentra as
 * Mensagens 1 a 5, todas de texto curto). A divisao segue o principio de
 * competencia especifica por arquivo: aqui mora TUDO que diz respeito a esta
 * mensagem — elegibilidade, agregacao, HTML, envio e gatilho.
 *
 * ESTE ARQUIVO NAO LE NENHUMA ABA DIRETAMENTE. Todos os dados vem dos
 * leitores ja existentes de cada dominio:
 *   getTodasDiligencias()            Data.js
 *   getTodasIniciais()               Iniciais.js
 *   getTodosAcompanhamentos()        Acompanhamentos.js
 *   getTodosAtendimentos()           Panorama.js
 *   getTodosAtendimentosOnline()     AtendimentoOnline.js
 *   getTodasAudienciasEstagiario()   AudienciasEstagiario.js
 *   lerParametrosAudiencias()        AudienciasEstagiario.js (bd!X:Z)
 *   getPesosPontuacaoPanorama()      Panorama.js (bd!S2:V2)
 *   getTodosEstagiariosComTurma()    Turma.js
 * Cada aba e lida UMA UNICA VEZ por execucao e reaproveitada para todos os
 * alunos — nunca uma leitura por estagiario (o gatilho roda para a turma
 * inteira de uma vez).
 *
 * REGRAS DE NEGOCIO fechadas com Thales em 02/08/2026:
 *  RN-S01 Disparo semanal, toda SEXTA-FEIRA as 18h (janela do Apps Script:
 *         18:00-19:00). Feriado NAO suspende o envio — decisao explicita.
 *  RN-S02 O aluno entra na lista a partir da primeira sexta-feira apos a
 *         DATA_INICIO da matricula e sai depois da ultima sexta anterior a
 *         DATA_FIM. Matricula com FINALIZADO marcado nunca recebe.
 *  RN-S03 Os numeros sao ACUMULADOS desde a DATA_INICIO (producao do estagio
 *         inteiro naquela turma), nao apenas a semana corrente.
 *  RN-S04 Entram todos os registros EXCETO os de STATUS "Cancelada" — mesmo
 *         criterio da Tabela de Producao (RN-P02).
 *  RN-S05 ACORDOS nao formam bloco separado: contam normalmente como peca
 *         simples ou complexa, conforme a SUBESPECIE da diligencia. Aqui a
 *         regra difere de proposito da Tabela de Producao (RN-P05), que os
 *         separa por exigencia do modelo impresso.
 *  RN-S06 Quadro-resumo com quantidade E carga horaria, usando os pesos de
 *         bd!S2:V2 e as horas por tipo de audiencia de bd!Z.
 *  RN-S07 Audiencias entram no quadro como UMA linha unica (total), sem
 *         quebra por tipo. O detalhamento por tipo continua no Painel Aluno.
 *  RN-S08 Secao sem nenhum registro nao e omitida: aparece com a frase
 *         "Nenhum registro no periodo".
 *  RN-S09 Aluno zerado em tudo recebe o e-mail assim mesmo.
 *  RN-S10 Canal exclusivo: e-mail. Nao ha versao para o mural do Classroom
 *         (tabela HTML nao sobrevive a um Announcement).
 *  RN-S11 Ao fim de cada execucao, Thales recebe um consolidado com quem
 *         recebeu, os totais de cada um e os erros.
 */

// =====================================================================
// 1. Datas e elegibilidade
// =====================================================================

function _asEhDataValida(valor) {
  return valor instanceof Date && !isNaN(valor.getTime());
}

function _asSomenteDia(data) {
  var d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

// RN-S02 — janela de envio de uma matricula.
//
// A comparacao usa a janela EFETIVA (override individual em estagiarios!K/L
// ou, na falta dele, a janela da turma no cadastro — ver
// getTodosEstagiariosComTurma em Turma.js), nunca a coluna crua.
//
// Os dois extremos sao INCLUSIVOS por decisao de projeto: as 18h de sexta o
// dia ja foi integralmente cumprido, entao uma sexta que caia exatamente na
// DATA_INICIO (ou na DATA_FIM) e um dia de estagio como qualquer outro e
// merece o e-mail. Para excluir os extremos, trocar >= por > e <= por <.
function _asDentroDaJanela(matricula, hoje) {
  if (!_asEhDataValida(matricula.dataInicioEfetiva)) return false;
  if (!_asEhDataValida(matricula.dataFimEfetiva)) return false;

  var dia = _asSomenteDia(hoje);
  return dia >= _asSomenteDia(matricula.dataInicioEfetiva) &&
         dia <= _asSomenteDia(matricula.dataFimEfetiva);
}

// Matriculas que devem receber a Mensagem 6 na data informada.
// Um aluno nunca tem duas matriculas ativas ao mesmo tempo (RN-T02, Turma.js),
// entao esta lista nunca gera dois e-mails para a mesma pessoa no mesmo dia.
function _asMatriculasElegiveis(hoje) {
  return getTodosEstagiariosComTurma().filter(function(m) {
    if (m.finalizado) return false;
    if (!m.email) return false;
    if (!m.turma) return false;
    return _asDentroDaJanela(m, hoje);
  });
}

// Lista simplificada dos elegiveis de hoje — usada pelo modal "Enviar
// Relatório de Acompanhamento" (aba Utilitarios > Relatório) para que Thales
// escolha um subconjunto antes de enviar. Mesmo criterio de elegibilidade do
// gatilho semanal (RN-S02); nao agrega producao nem monta e-mail, so a lista
// de nomes para exibicao.
function listarElegiveisAcompanhamentoSemanal() {
  return _asMatriculasElegiveis(new Date())
    .map(function(m) {
      return { idMatricula: m.idMatricula, nome: m.nome, turma: m.turma };
    })
    .sort(function(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
}

// =====================================================================
// 2. Agregacao da producao de um aluno
// =====================================================================

// Le todas as abas de uma vez. Chamado UMA unica vez por execucao.
function _asCarregarFontes() {
  return {
    diligencias: getTodasDiligencias(),
    iniciais: getTodasIniciais(),
    acompanhamentos: getTodosAcompanhamentos(),
    atendimentos: getTodosAtendimentos(),
    atendimentosOnline: getTodosAtendimentosOnline(),
    audiencias: getTodasAudienciasEstagiario(),
    parametrosAudiencias: lerParametrosAudiencias(),
    pesos: getPesosPontuacaoPanorama()
  };
}

// RN-S04.
function _asNaoCancelada(reg) {
  return normalizarChave(reg.status) !== 'cancelada';
}

// Vinculo registro <-> matricula. A turma e conferida REGISTRO a REGISTRO
// contra reg.turma (modelo de turmas v2), exatamente como fazem o Painel
// Aluno e a Tabela de Producao — e o que evita dupla contagem quando o mesmo
// aluno tem duas matriculas dentro do mesmo semestre.
// O vinculo com a pessoa aceita nome OU e-mail: as abas iniciais,
// acompanhamentos, atendimentos_online e audiencias_estagiario guardam o
// e-mail; diligencias e atendimentos guardam so o nome.
function _asPertenceAoAluno(reg, chaves, turma) {
  if (!turmaCasaComFiltro(reg.turma, turma)) return false;
  if (chaves.nome && normalizarChave(reg.estagiario) === chaves.nome) return true;
  if (chaves.email && reg.email && normalizarChave(reg.email) === chaves.email) return true;
  return false;
}

// Data no formato "dd/MM/yyyy" ou "dd/MM/yyyy HH:mm" reduzida a um numero
// ordenavel. Registro sem data vai para o fim da lista.
function _asChaveData(texto) {
  var m = String(texto || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])).getTime();
}

function _asSomenteData(texto) {
  var m = String(texto || '').match(/^(\d{2}\/\d{2}\/\d{4})/);
  return m ? m[1] : String(texto || '');
}

function _asOrdenarPorData(lista, campo) {
  return lista.slice().sort(function(a, b) {
    return _asChaveData(a[campo]) - _asChaveData(b[campo]);
  });
}

// Producao acumulada de UMA matricula (RN-S03), ja separada em blocos e
// pronta tanto para o quadro-resumo quanto para as tabelas detalhadas.
function _asProducaoDaMatricula(matricula, fontes) {
  var chaves = {
    nome: normalizarChave(matricula.nome),
    email: normalizarChave(matricula.email)
  };
  var turma = matricula.turma;

  function meu(reg) { return _asPertenceAoAluno(reg, chaves, turma); }

  // RN-S05: nenhuma separacao de acordos aqui — a subespecie manda.
  var diligencias = fontes.diligencias.filter(meu).filter(_asNaoCancelada);
  var chaveSimples = normalizarChave(CONFIG.SUBESPECIE_VALORES.SIMPLES);
  var chaveComplexa = normalizarChave(CONFIG.SUBESPECIE_VALORES.COMPLEXA);

  var simples = diligencias.filter(function(d) {
    return normalizarChave(d.subespecie) === chaveSimples;
  });
  var complexasDiligencias = diligencias.filter(function(d) {
    return normalizarChave(d.subespecie) === chaveComplexa;
  });

  var iniciais = fontes.iniciais.filter(meu).filter(_asNaoCancelada);
  // Peca complexa = diligencia Complexa + TODA inicial (mesma regra do
  // Panorama e da Tabela de Producao).
  var complexas = complexasDiligencias.concat(iniciais);

  var acompanhamentos = fontes.acompanhamentos.filter(meu).filter(_asNaoCancelada);

  var atendimentos = fontes.atendimentos.filter(meu);
  var atendimentosOnline = fontes.atendimentosOnline.filter(meu).filter(function(ao) {
    return normalizarChave(ao.status) ===
           normalizarChave(CONFIG.STATUS_ATENDIMENTO_ONLINE.APROVADO);
  });

  var audiencias = fontes.audiencias.filter(meu).filter(function(a) {
    return normalizarChave(a.status) ===
           normalizarChave(CONFIG.STATUS_AUDIENCIA_ESTAGIARIO.APROVADA);
  });

  return {
    simples: _asOrdenarPorData(simples, 'di'),
    complexas: _asOrdenarPorData(complexas, 'di'),
    acompanhamentos: _asOrdenarPorData(acompanhamentos, 'di'),
    atendimentos: _asOrdenarPorData(atendimentos.map(function(reg) {
      return { data: _asSomenteData(reg.data), assistido: reg.nome || '',
               tipo: CONFIG.PRODUCAO.TIPO_ATENDIMENTO.PRESENCIAL };
    }).concat(atendimentosOnline.map(function(reg) {
      return { data: _asSomenteData(reg.data), assistido: reg.atendido || '',
               tipo: CONFIG.PRODUCAO.TIPO_ATENDIMENTO.ONLINE };
    })), 'data'),
    audiencias: _asOrdenarPorData(audiencias, 'data')
  };
}

// Horas de audiencia: cada audiencia Aprovada soma integralmente as horas do
// seu tipo em bd!Z, inclusive o que excede a meta (RN-06 das audiencias,
// mesmo criterio do card "Parcial de Horas" do Panorama). Tipo que nao
// estiver cadastrado em bd!X:Z soma zero hora, mas continua contado na
// quantidade — a quantidade e um fato, a hora e um parametro.
function _asHorasAudiencias(audiencias, parametros) {
  var mapa = {};
  (parametros || []).forEach(function(p) {
    mapa[normalizarChave(p.tipo)] = Number(p.horas) || 0;
  });

  return audiencias.reduce(function(soma, a) {
    return soma + (mapa[normalizarChave(a.tipo)] || 0);
  }, 0);
}

// RN-S06 — quadro-resumo: [rotulo, quantidade, horas].
function _asQuadroResumo(producao, fontes) {
  var pesos = fontes.pesos || {};

  var linhas = [
    { rotulo: 'Peças simples', qtd: producao.simples.length, horas: producao.simples.length * (pesos.simples || 0) },
    { rotulo: 'Peças complexas', qtd: producao.complexas.length, horas: producao.complexas.length * (pesos.complexa || 0) },
    { rotulo: 'Acompanhamentos', qtd: producao.acompanhamentos.length, horas: producao.acompanhamentos.length * (pesos.acompanhamento || 0) },
    { rotulo: 'Atendimentos', qtd: producao.atendimentos.length, horas: producao.atendimentos.length * (pesos.atendimento || 0) },
    { rotulo: 'Audiências', qtd: producao.audiencias.length, horas: _asHorasAudiencias(producao.audiencias, fontes.parametrosAudiencias) }
  ];

  var totalQtd = linhas.reduce(function(s, l) { return s + l.qtd; }, 0);
  var totalHoras = linhas.reduce(function(s, l) { return s + l.horas; }, 0);

  return { linhas: linhas, totalQtd: totalQtd, totalHoras: totalHoras };
}

// Secoes detalhadas, na mesma forma generica da Tabela de Producao
// ({ titulo, colunas, linhas }) para que a montagem do HTML seja um unico
// laco, sem marcacao diferente por secao. Colunas definidas por Thales:
// sem DI/DF (o aluno ve as datas no Painel Aluno) e sem VISTO (que so faz
// sentido no papel).
function _asSecoesDetalhadas(producao) {
  function linhaPeca(reg, i) {
    return [
      _asNumero(i),
      reg.processo || '',
      reg.assistido || '',
      reg.vara || '',
      reg.especie || '',
      reg.status || ''
    ];
  }

  var colunasPeca = ['#', 'PROCESSO', 'ASSISTIDO', 'VARA', 'AÇÃO', 'STATUS'];

  return [
    {
      titulo: 'Peças simples',
      colunas: colunasPeca,
      linhas: producao.simples.map(linhaPeca)
    },
    {
      titulo: 'Peças complexas',
      colunas: colunasPeca,
      linhas: producao.complexas.map(linhaPeca)
    },
    {
      titulo: 'Acompanhamentos',
      colunas: ['#', 'PROCESSO', 'STATUS'],
      linhas: producao.acompanhamentos.map(function(reg, i) {
        return [_asNumero(i), reg.processo || '', reg.status || ''];
      })
    },
    {
      titulo: 'Atendimentos',
      colunas: ['#', 'DATA', 'ASSISTIDO', 'TIPO'],
      linhas: producao.atendimentos.map(function(item, i) {
        return [_asNumero(i), item.data, item.assistido, item.tipo];
      })
    },
    {
      titulo: 'Audiências',
      colunas: ['#', 'DATA', 'TIPO', 'VARA', 'PROCESSO'],
      linhas: producao.audiencias.map(function(reg, i) {
        return [_asNumero(i), _asSomenteData(reg.data), reg.tipo || '', reg.vara || '', reg.processo || ''];
      })
    }
  ];
}

function _asNumero(indice) {
  var n = indice + 1;
  return (n < 10 ? '0' + n : String(n));
}

// =====================================================================
// 3. Montagem do e-mail (HTML)
// =====================================================================
//
// Estilo inline em todos os elementos: cliente de e-mail nao aplica <style>
// de forma confiavel. A paleta repete a ja usada nos e-mails da Secretaria e
// na Mensagem 4 (cabecalho #3D6A61, zebra #f4f8f6). A pilha de fonte comeca
// por Google Sans (padrao visual do projeto) e cai para Arial onde a fonte
// nao estiver disponivel — nenhum cliente de e-mail aceita @font-face
// externo de forma confiavel.

var _AS_FONTE = "'Google Sans', Arial, sans-serif";

function _asHorasTexto(valor) {
  var n = Number(valor) || 0;
  return n.toFixed(1).replace('.', ',') + ' h';
}

function _asParagrafo(texto, margemTopo) {
  return '<p style="font-family:' + _AS_FONTE + '; font-size:14px; color:#202124; '
    + 'line-height:1.55; margin:' + (margemTopo || 0) + 'px 0 12px 0;">' + texto + '</p>';
}

function _asTabelaResumoHtml(resumo) {
  var html = '<table border="1" cellpadding="8" cellspacing="0" '
    + 'style="border-collapse:collapse; border-color:#d6e0dc; font-family:' + _AS_FONTE + '; '
    + 'font-size:13px; min-width:420px;">'
    + '<thead>'
    + '<tr style="background:#3D6A61; color:#ffffff;">'
    + '<th style="text-align:left; padding:10px 12px;">Atividade</th>'
    + '<th style="text-align:center; padding:10px 12px;">Quantidade</th>'
    + '<th style="text-align:right; padding:10px 12px;">Carga horária</th>'
    + '</tr>'
    + '</thead>'
    + '<tbody>';

  resumo.linhas.forEach(function(linha, i) {
    var bg = (i % 2 === 0) ? '#ffffff' : '#f4f8f6';
    html += '<tr style="background:' + bg + ';">'
      + '<td style="padding:8px 12px;">' + _escapeHtmlSecretaria(linha.rotulo) + '</td>'
      + '<td style="padding:8px 12px; text-align:center;">' + linha.qtd + '</td>'
      + '<td style="padding:8px 12px; text-align:right;">' + _asHorasTexto(linha.horas) + '</td>'
      + '</tr>';
  });

  html += '<tr style="background:#e8f0ed; font-weight:bold;">'
    + '<td style="padding:8px 12px;">Total</td>'
    + '<td style="padding:8px 12px; text-align:center;">' + resumo.totalQtd + '</td>'
    + '<td style="padding:8px 12px; text-align:right;">' + _asHorasTexto(resumo.totalHoras) + '</td>'
    + '</tr>';

  html += '</tbody></table>';
  return html;
}

// RN-S08: secao vazia continua aparecendo, com a frase no lugar da tabela.
function _asTabelaSecaoHtml(secao) {
  var html = '<h3 style="font-family:' + _AS_FONTE + '; font-size:14px; color:#3D6A61; '
    + 'margin:24px 0 8px 0;">' + _escapeHtmlSecretaria(secao.titulo) + '</h3>';

  if (!secao.linhas.length) {
    html += '<p style="font-family:' + _AS_FONTE + '; font-size:13px; color:#5f6368; '
      + 'font-style:italic; margin:0;">Nenhum registro no período.</p>';
    return html;
  }

  html += '<table border="1" cellpadding="8" cellspacing="0" '
    + 'style="border-collapse:collapse; border-color:#d6e0dc; font-family:' + _AS_FONTE + '; '
    + 'font-size:13px; width:100%;">'
    + '<thead><tr style="background:#3D6A61; color:#ffffff;">';

  secao.colunas.forEach(function(rotulo) {
    html += '<th style="text-align:left; padding:8px 10px;">' + _escapeHtmlSecretaria(rotulo) + '</th>';
  });

  html += '</tr></thead><tbody>';

  secao.linhas.forEach(function(linha, i) {
    var bg = (i % 2 === 0) ? '#ffffff' : '#f4f8f6';
    html += '<tr style="background:' + bg + ';">';
    linha.forEach(function(valor) {
      html += '<td style="padding:7px 10px;">' + _escapeHtmlSecretaria(valor) + '</td>';
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  return html;
}

// URL do Painel Aluno. Dentro de um gatilho instalavel
// ScriptApp.getService().getUrl() continua devolvendo a URL da implantacao —
// mesma chamada usada em doGet (Code.js). Se a implantacao ainda nao existir,
// o e-mail sai sem o botao, em vez de com um link quebrado.
function _asUrlPainelAluno() {
  var base = ScriptApp.getService().getUrl() || '';
  if (!base) return '';
  return base + '?' + CONFIG.ROTA.PARAM + '=' + CONFIG.ROTA.VALOR_ALUNO;
}

function _asBotaoPainelHtml(url) {
  if (!url) return '';
  return '<p style="margin:20px 0 4px 0;">'
    + '<a href="' + url + '" '
    + 'style="display:inline-block; background:#3D6A61; color:#ffffff; text-decoration:none; '
    + 'font-family:' + _AS_FONTE + '; font-size:14px; font-weight:bold; '
    + 'padding:11px 22px; border-radius:8px;">Abrir minha página de acompanhamento</a>'
    + '</p>';
}

// Texto de apoio proposto por Claude e aprovado por Thales em 02/08/2026.
function montarEmailAcompanhamentoSemanal(matricula, resumo, secoes, dataReferencia) {
  var url = _asUrlPainelAluno();

  var html = ''
    + _asParagrafo(_escapeHtmlSecretaria(primeiroNome(matricula.nome))
        + ', aqui está o seu acompanhamento desta semana.')
    + _asParagrafo('O quadro abaixo reúne tudo o que você já produziu no estágio ('
        + _escapeHtmlSecretaria(formatarRotuloTurma(matricula.turma)) + ') até '
        + _escapeHtmlSecretaria(dataReferencia) + ', com a carga horária correspondente:')
    + _asTabelaResumoHtml(resumo);

  html += '<p style="font-family:' + _AS_FONTE + '; font-size:14px; color:#202124; '
    + 'margin:28px 0 0 0; font-weight:bold;">Detalhamento</p>';

  secoes.forEach(function(secao) {
    html += _asTabelaSecaoHtml(secao);
  });

  html += _asParagrafo('Esses números são um retrato do caminho até aqui, não uma cobrança. '
      + 'Se algo estiver fora do ritmo que você esperava, ou se tiver dúvida sobre qualquer '
      + 'atividade da lista, me procure: é bem mais fácil ajustar a rota agora do que na reta final.', 28)
    + _asParagrafo('Estou à disposição durante a semana, aqui pelo e-mail, no Classroom ou '
      + 'pessoalmente no Escritório Escola.')
    + _asParagrafo('Informações mais detalhadas — prazos, situação de cada atividade e progresso '
      + 'das audiências — você encontra sempre atualizadas na sua página de acompanhamento:')
    + _asBotaoPainelHtml(url)
    + _asParagrafo('Bom fim de semana e seguimos juntos.', 16);

  return {
    assunto: CONFIG.ACOMPANHAMENTO_SEMANAL.ASSUNTO,
    html: html
  };
}

// =====================================================================
// 4. Consolidado para Thales (RN-S11)
// =====================================================================

function _asMontarConsolidadoHtml(enviados, erros, dataReferencia) {
  var html = _asParagrafo('Acompanhamento semanal de ' + _escapeHtmlSecretaria(dataReferencia) + '.');

  if (!enviados.length && !erros.length) {
    return html + _asParagrafo('Nenhum estagiário elegível nesta data (nenhuma matrícula ativa dentro da janela).');
  }

  if (enviados.length) {
    html += '<table border="1" cellpadding="8" cellspacing="0" '
      + 'style="border-collapse:collapse; border-color:#d6e0dc; font-family:' + _AS_FONTE + '; '
      + 'font-size:13px; width:100%;">'
      + '<thead><tr style="background:#3D6A61; color:#ffffff;">'
      + '<th style="text-align:left; padding:8px 10px;">ESTAGIÁRIO(A)</th>'
      + '<th style="text-align:left; padding:8px 10px;">TURMA</th>'
      + '<th style="text-align:center; padding:8px 10px;">SIMPLES</th>'
      + '<th style="text-align:center; padding:8px 10px;">COMPLEXAS</th>'
      + '<th style="text-align:center; padding:8px 10px;">ACOMP.</th>'
      + '<th style="text-align:center; padding:8px 10px;">ATEND.</th>'
      + '<th style="text-align:center; padding:8px 10px;">AUD.</th>'
      + '<th style="text-align:right; padding:8px 10px;">HORAS</th>'
      + '</tr></thead><tbody>';

    enviados.forEach(function(e, i) {
      var bg = (i % 2 === 0) ? '#ffffff' : '#f4f8f6';
      html += '<tr style="background:' + bg + ';">'
        + '<td style="padding:7px 10px;">' + _escapeHtmlSecretaria(e.nome) + '</td>'
        + '<td style="padding:7px 10px;">' + _escapeHtmlSecretaria(formatarRotuloTurma(e.turma)) + '</td>'
        + '<td style="padding:7px 10px; text-align:center;">' + e.simples + '</td>'
        + '<td style="padding:7px 10px; text-align:center;">' + e.complexas + '</td>'
        + '<td style="padding:7px 10px; text-align:center;">' + e.acompanhamentos + '</td>'
        + '<td style="padding:7px 10px; text-align:center;">' + e.atendimentos + '</td>'
        + '<td style="padding:7px 10px; text-align:center;">' + e.audiencias + '</td>'
        + '<td style="padding:7px 10px; text-align:right;">' + _asHorasTexto(e.totalHoras) + '</td>'
        + '</tr>';
    });

    html += '</tbody></table>';
  }

  if (erros.length) {
    html += _asParagrafo('<strong>Falhas de envio:</strong>', 20);
    html += '<ul style="font-family:' + _AS_FONTE + '; font-size:13px; color:#202124;">';
    erros.forEach(function(e) {
      html += '<li>' + _escapeHtmlSecretaria(e.nome) + ' — ' + _escapeHtmlSecretaria(e.erro) + '</li>';
    });
    html += '</ul>';
  }

  return html;
}

function _asEnviarConsolidado(enviados, erros, dataReferencia) {
  try {
    MailApp.sendEmail({
      to: CONFIG.EMAIL_AUTORIZADO,
      subject: CONFIG.ACOMPANHAMENTO_SEMANAL.ASSUNTO_CONSOLIDADO + ' — ' + dataReferencia,
      htmlBody: _asMontarConsolidadoHtml(enviados, erros, dataReferencia)
    });
  } catch (e) {
    // O consolidado e um relatorio de acompanhamento: falhar aqui nunca pode
    // invalidar os e-mails que ja foram entregues aos alunos.
    Logger.log('Erro ao enviar consolidado do acompanhamento semanal: ' + e.message);
  }
}

// =====================================================================
// 5. Execucao
// =====================================================================

// Varre as matriculas elegiveis e envia a Mensagem 6 para cada uma.
// Chamada tanto pelo gatilho semanal (verificarAcompanhamentoSemanalAutomatico)
// quanto pelo card "Enviar Acompanhamento" da aba Utilitarios (ver
// acaoEnviarAcompanhamentoSemanal em Code.js) — mesma funcao por tras dos
// dois, mesmo padrao de enviarCobrancasPendentes (Mensagens.js).
//
// dataReferencia (opcional) existe para teste manual: permite simular outra
// sexta-feira sem mexer no relogio do projeto. O gatilho sempre passa vazio.
//
// idsMatricula (opcional) restringe o envio a um subconjunto dos elegiveis,
// pelo idMatricula (coluna N de estagiarios) — usado pelo modal "Enviar
// Relatório de Acompanhamento" da aba Utilitarios (ver
// acaoEnviarAcompanhamentoSemanalSelecionados em Code.js) quando Thales quer
// reenviar so para alguns alunos. Se vazio/omitido, envia para todos os
// elegiveis, como sempre foi (gatilho semanal e card "Enviar Acompanhamento").
function enviarAcompanhamentoSemanal(dataReferencia, idsMatricula) {
  var hoje = _asEhDataValida(dataReferencia) ? dataReferencia : new Date();
  var rotuloData = formatarData(hoje);

  var elegiveis = _asMatriculasElegiveis(hoje);

  if (idsMatricula && idsMatricula.length) {
    var chaveSet = {};
    idsMatricula.forEach(function(id) { chaveSet[String(id).trim()] = true; });
    elegiveis = elegiveis.filter(function(m) { return chaveSet[String(m.idMatricula).trim()]; });

    if (!elegiveis.length) {
      return { sucesso: false, erro: 'Nenhum dos alunos selecionados está elegível para o acompanhamento semanal nesta data.' };
    }
  }

  if (!elegiveis.length) {
    _asEnviarConsolidado([], [], rotuloData);
    return { sucesso: true, enviados: [], erros: [], mensagem: 'Nenhum estagiário elegível nesta data.' };
  }

  var fontes = _asCarregarFontes();
  var enviados = [];
  var erros = [];

  elegiveis.forEach(function(matricula) {
    try {
      var producao = _asProducaoDaMatricula(matricula, fontes);
      var resumo = _asQuadroResumo(producao, fontes);
      var secoes = _asSecoesDetalhadas(producao);
      var email = montarEmailAcompanhamentoSemanal(matricula, resumo, secoes, rotuloData);

      MailApp.sendEmail({
        to: matricula.email,
        subject: email.assunto,
        htmlBody: email.html
      });

      enviados.push({
        nome: matricula.nome,
        email: matricula.email,
        turma: matricula.turma,
        simples: producao.simples.length,
        complexas: producao.complexas.length,
        acompanhamentos: producao.acompanhamentos.length,
        atendimentos: producao.atendimentos.length,
        audiencias: producao.audiencias.length,
        totalHoras: resumo.totalHoras
      });
    } catch (e) {
      // Erro isolado por estagiario — nunca interrompe os demais.
      erros.push({ nome: matricula.nome, email: matricula.email, erro: e.message });
      Logger.log('Erro no acompanhamento semanal de ' + matricula.nome + ': ' + e.message);
    }
  });

  _asEnviarConsolidado(enviados, erros, rotuloData);

  return { sucesso: true, enviados: enviados, erros: erros };
}

// --- Gatilho automatico (toda sexta-feira as 18h) ---

// Handler chamado pelo trigger instalavel criado em
// configurarGatilhoAcompanhamentoSemanal(). Sem validarAcesso — nao ha
// usuario logado dentro de um gatilho horario, mesmo padrao de
// verificarCobrancasAutomatico (Mensagens.js).
//
// RN-S01: nao ha checagem de dia util aqui, de proposito. Diferente das
// cobrancas, este envio acontece mesmo que a sexta-feira caia em feriado —
// decisao de Thales em 02/08/2026.
function enviarAcompanhamentoSemanalAutomatico() {
  enviarAcompanhamentoSemanal();
}

// Rodar esta funcao MANUALMENTE uma unica vez pelo editor do Apps Script
// (Executar > configurarGatilhoAcompanhamentoSemanal) para instalar o gatilho
// semanal. E seguro executa-la novamente: remove qualquer gatilho antigo do
// mesmo handler antes de criar um novo, evitando duplicatas — mesmo padrao de
// configurarGatilhoCobrancas (Mensagens.js).
//
// O Apps Script agenda por FAIXA de hora: atHour(18) dispara entre 18:00 e
// 19:00, nao exatamente as 18:00. Nao ha como pedir horario exato.
function configurarGatilhoAcompanhamentoSemanal() {
  var gatilhos = ScriptApp.getProjectTriggers();
  gatilhos.forEach(function(g) {
    if (g.getHandlerFunction() === 'enviarAcompanhamentoSemanalAutomatico') {
      ScriptApp.deleteTrigger(g);
    }
  });

  ScriptApp.newTrigger('enviarAcompanhamentoSemanalAutomatico')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay[CONFIG.ACOMPANHAMENTO_SEMANAL.DIA_SEMANA])
    .atHour(CONFIG.ACOMPANHAMENTO_SEMANAL.HORA)
    .create();
}

// --- Teste manual de UM aluno especifico (por ID de estagiarios!A) ---
// Monta a Mensagem 6 com os dados REAIS do aluno e envia para o e-mail de
// Thales, com "[TESTE]" no assunto. Rodar MANUALMENTE pelo editor do Apps
// Script (Executar > mockTestAcompanhamentoSemanalPorId).
//
// Diferente do envio de producao, este teste IGNORA de proposito a janela de
// datas e o FINALIZADO (RN-S02): a intencao e ver o layout com dados de
// verdade, nao simular a elegibilidade. Se o aluno tiver mais de uma
// matricula (antecipado + regular), sai um e-mail por matricula, com a turma
// no assunto — sao recortes de producao diferentes.
//
// Para testar outro aluno, alterar o ID abaixo (coluna A da aba estagiarios).
var AS_ID_ALUNO_TESTE = '231';

function mockTestAcompanhamentoSemanalPorId() {
  var chaveId = String(AS_ID_ALUNO_TESTE).trim();

  var matriculas = getTodosEstagiariosComTurma().filter(function(m) {
    return String(m.id).trim() === chaveId;
  });

  if (!matriculas.length) {
    return { sucesso: false, erro: 'Nenhuma linha da aba estagiarios com ID ' + chaveId + '.' };
  }

  var fontes = _asCarregarFontes();
  var rotuloData = formatarData(new Date());
  var enviados = [];

  matriculas.forEach(function(matricula) {
    var producao = _asProducaoDaMatricula(matricula, fontes);
    var resumo = _asQuadroResumo(producao, fontes);
    var secoes = _asSecoesDetalhadas(producao);
    var email = montarEmailAcompanhamentoSemanal(matricula, resumo, secoes, rotuloData);

    MailApp.sendEmail({
      to: CONFIG.EMAIL_AUTORIZADO,
      subject: '[TESTE] ' + email.assunto + ' — ' + matricula.nome +
               (matricula.turma ? ' (' + matricula.turma + ')' : ''),
      htmlBody: email.html
    });

    enviados.push({
      nome: matricula.nome,
      turma: matricula.turma,
      emailReal: matricula.email,
      totalRegistros: resumo.totalQtd,
      totalHoras: resumo.totalHoras
    });
  });

  return { sucesso: true, enviadosPara: CONFIG.EMAIL_AUTORIZADO, matriculas: enviados };
}

// --- Teste manual (validacao do layout antes de confiar no gatilho) ---
// Envia o acompanhamento semanal de TODOS os elegiveis para o e-mail de
// Thales em vez do e-mail real de cada aluno, com "[TESTE]" no assunto.
// Rodar MANUALMENTE pelo editor do Apps Script — mesmo proposito de
// mockTestEnviarProducaoEstagiarios (Mensagens.js).
function mockTestAcompanhamentoSemanal() {
  var hoje = new Date();
  var rotuloData = formatarData(hoje);
  var elegiveis = _asMatriculasElegiveis(hoje);

  if (!elegiveis.length) {
    return { sucesso: true, enviados: [], mensagem: 'Nenhum estagiário elegível nesta data.' };
  }

  var fontes = _asCarregarFontes();
  var enviados = [];

  elegiveis.forEach(function(matricula) {
    var producao = _asProducaoDaMatricula(matricula, fontes);
    var resumo = _asQuadroResumo(producao, fontes);
    var secoes = _asSecoesDetalhadas(producao);
    var email = montarEmailAcompanhamentoSemanal(matricula, resumo, secoes, rotuloData);

    MailApp.sendEmail({
      to: CONFIG.EMAIL_AUTORIZADO,
      subject: '[TESTE] ' + email.assunto + ' — ' + matricula.nome,
      htmlBody: email.html
    });
    enviados.push(matricula.nome);
  });

  return { sucesso: true, enviados: enviados };
}
