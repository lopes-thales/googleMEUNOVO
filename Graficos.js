// Graficos.gs
// Responsabilidade: agregacao de dados para os graficos de producao exibidos
// ao final da aba "Distribuição" (ver getDadosAbaDistribuicao,
// Distribuicao.js) — soma a producao (pecas complexas, simples,
// acompanhamentos, atendimentos e iniciais) de todos os estagiarios ATIVOS
// (FINALIZADO != true), cada um contado na SUA PROPRIA TURMA (ex. "2026.02-A",
// "2026.02-R", derivada de DATA_INICIO em estagiarios!M — ver Turma.js) —
// mesma convencao ja usada na Mensagem 4 (Mensagens.js). Reaproveita
// getTodosEstagiariosCompletos() e getProducaoPorEstagiarios() (Panorama.js) —
// nenhuma nova regra de cruzamento ou de contagem e criada aqui;
// complexas/simples/acompanhamentos ja excluem STATUS "Cancelada" e iniciais
// ja contam como complexas, tudo decidido naquela funcao.
//
// porEstagiario traz a mesma contagem quebrada por aluno/turma (para os
// graficos de barras agrupadas "por estagiario"), ordenada alfabeticamente
// pelo nome.
//
// A producao de todos os estagiarios ativos e calculada em uma unica passada
// por getProducaoPorEstagiarios (Panorama.js), que le cada aba de origem
// (diligencias, iniciais, atendimentos, acompanhamentos) UMA unica vez —
// antes, cada estagiario disparava sua propria leitura completa das 4 abas
// (getContagemProducaoEstagiario), o que deixava esta aba visivelmente lenta
// com muitos estagiarios ativos.
// audienciasTotais: producao agregada de audiencias por TIPO, entre todos os
// alunos ativos (mesmo espirito de "totais", mas quebrada por tipo em vez de
// um unico numero — cada tipo tem sua propria meta, ver
// lerParametrosAudiencias em AudienciasEstagiario.js). porEstagiario[].audiencias
// traz a mesma quebra por tipo de CADA aluno, para o grafico de barras
// agrupadas com a linha da meta marcada sobre cada barra (ver
// renderizarGraficoAudiencias, Scripts.html).
function getDadosGraficos() {
  var ativos = getTodosEstagiariosCompletos().filter(function(e) { return !e.finalizado; });

  var totais = {
    complexas: 0,
    simples: 0,
    acompanhamentos: 0,
    atendimentos: 0,
    iniciais: 0
  };

  var parametrosAudiencias = lerParametrosAudiencias(); // AudienciasEstagiario.js
  var realizadoAudienciasPorTipo = {};
  parametrosAudiencias.forEach(function(p) { realizadoAudienciasPorTipo[p.tipo] = 0; });

  var porEstagiario = getProducaoPorEstagiarios(ativos).map(function(contagens) {
    totais.complexas += contagens.qtdComplexas;
    totais.simples += contagens.qtdSimples;
    totais.acompanhamentos += contagens.qtdAcompanhamentos;
    totais.atendimentos += contagens.qtdAtendimentos;
    totais.iniciais += contagens.qtdIniciais;

    (contagens.audiencias || []).forEach(function(a) {
      realizadoAudienciasPorTipo[a.tipo] = (realizadoAudienciasPorTipo[a.tipo] || 0) + a.realizado;
    });

    return {
      nome: contagens.nome,
      primeiroNome: String(contagens.nome || '').trim().split(/\s+/)[0],
      complexas: contagens.qtdComplexas,
      simples: contagens.qtdSimples,
      acompanhamentos: contagens.qtdAcompanhamentos,
      atendimentos: contagens.qtdAtendimentos,
      iniciais: contagens.qtdIniciais,
      audiencias: contagens.audiencias || []
    };
  }).sort(function(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

  var audienciasTotais = parametrosAudiencias.map(function(p) {
    return { tipo: p.tipo, meta: p.meta, realizado: realizadoAudienciasPorTipo[p.tipo] || 0 };
  });

  return {
    totalAlunosAtivos: ativos.length,
    totais: totais,
    porEstagiario: porEstagiario,
    parametrosAudiencias: parametrosAudiencias,
    audienciasTotais: audienciasTotais
  };
}
