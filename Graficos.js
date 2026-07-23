// Graficos.gs
// Responsabilidade: agregacao de dados para a aba "Gráficos" — soma a
// producao (pecas complexas, simples, acompanhamentos, atendimentos e
// iniciais) de todos os estagiarios ATIVOS (FINALIZADO != true), cada um
// contado no SEU PROPRIO semestre (coluna SEMESTRE da aba estagiarios) —
// mesma convencao ja usada na Mensagem 4 (Mensagens.js). Este mesmo agregador
// e reaproveitado pela aba Distribuição para exibir o grafico "Complexas,
// simples e acompanhamentos por estagiário" (ver getDadosAbaDistribuicao,
// Distribuicao.js). Reaproveita getTodosEstagiariosCompletos() e
// getContagemProducaoEstagiario() (Panorama.js) — nenhuma nova regra de
// cruzamento ou de contagem e criada aqui; complexas/simples/acompanhamentos
// ja excluem STATUS "Cancelada" e iniciais ja contam como complexas, tudo
// decidido naquela funcao.
//
// porEstagiario traz a mesma contagem quebrada por aluno (para os graficos
// de barras agrupadas "por estagiario"), ordenada alfabeticamente pelo nome.
//
// A producao de todos os estagiarios ativos e calculada em uma unica passada
// por getProducaoPorEstagiarios (Panorama.js), que le cada aba de origem
// (diligencias, iniciais, atendimentos, acompanhamentos) UMA unica vez —
// antes, cada estagiario disparava sua propria leitura completa das 4 abas
// (getContagemProducaoEstagiario), o que deixava esta aba visivelmente lenta
// com muitos estagiarios ativos.
function getDadosGraficos() {
  var ativos = getTodosEstagiariosCompletos().filter(function(e) { return !e.finalizado; });

  var totais = {
    complexas: 0,
    simples: 0,
    acompanhamentos: 0,
    atendimentos: 0,
    iniciais: 0
  };

  var porEstagiario = getProducaoPorEstagiarios(ativos).map(function(contagens) {
    totais.complexas += contagens.qtdComplexas;
    totais.simples += contagens.qtdSimples;
    totais.acompanhamentos += contagens.qtdAcompanhamentos;
    totais.atendimentos += contagens.qtdAtendimentos;
    totais.iniciais += contagens.qtdIniciais;

    return {
      nome: contagens.nome,
      primeiroNome: String(contagens.nome || '').trim().split(/\s+/)[0],
      complexas: contagens.qtdComplexas,
      simples: contagens.qtdSimples,
      acompanhamentos: contagens.qtdAcompanhamentos,
      atendimentos: contagens.qtdAtendimentos,
      iniciais: contagens.qtdIniciais
    };
  }).sort(function(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

  return {
    totalAlunosAtivos: ativos.length,
    totais: totais,
    porEstagiario: porEstagiario
  };
}
