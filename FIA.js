/**
 * FIA.js
 *
 * Competencia exclusiva: estrutura da Ficha Individual de Avaliacao (FIA) do
 * estagio curricular obrigatorio do curso de Direito (CEST).
 *
 * Este script e a fonte unica de verdade dos indicadores, pesos, faixas de
 * classificacao (baixa/media/alta), regra de arredondamento da nota final e
 * regras de aprovacao/reprovacao. O modal em thales.html/Scripts.html busca
 * essa estrutura em obterEstruturaFIA() e faz todo o calculo no cliente, pois
 * a FIA nao e persistida em nenhuma planilha (uso apenas como calculadora).
 *
 * Nenhuma funcao deste arquivo grava dados. Nao ha leitura/escrita de abas.
 */

/**
 * Faixas de nota (0 a 10) associadas a cada classificacao qualitativa.
 * O valor "padrao" e usado para o preenchimento automatico ao classificar
 * um bloco inteiro; o usuario pode editar cada indicador manualmente depois.
 */
var FIA_FAIXAS = {
  baixa: { min: 5, max: 6, padrao: 5 },
  media: { min: 7, max: 8, padrao: 7 },
  alta:  { min: 9, max: 10, padrao: 9 }
};

/**
 * Nota minima (apos arredondamento) para aprovacao, alem da regra de
 * reprovacao automatica abaixo.
 */
var FIA_NOTA_MINIMA_APROVACAO = 7;

/**
 * Estrutura oficial da FIA (CEST - Curso de Direito).
 * Peso total = 100 (16 + 50 + 34), de forma que
 * NOTA FINAL = SOMA(nota_indicador * peso_indicador) / 100
 */
var FIA_ESTRUTURA = {
  blocos: [
    {
      id: 'A',
      nome: 'Aspectos Conceituais',
      indicadores: [
        { id: 'A1', nome: 'Conhecimento', peso: 4 },
        { id: 'A2', nome: 'Pesquisa', peso: 4 },
        { id: 'A3', nome: 'Escrita Técnica', peso: 4 },
        { id: 'A4', nome: 'Comunicação', peso: 4 }
      ]
    },
    {
      id: 'B',
      nome: 'Aspectos Procedimentais',
      indicadores: [
        { id: 'B1', nome: 'Atendimento', peso: 10 },
        { id: 'B2', nome: 'Manuseio Documentação', peso: 10 },
        { id: 'B3', nome: 'Descrição do Fato', peso: 10 },
        { id: 'B4', nome: 'Processabilidade', peso: 10 },
        { id: 'B5', nome: 'Gestão', peso: 10 }
      ]
    },
    {
      id: 'C',
      nome: 'Aspectos Atitudinais',
      indicadores: [
        { id: 'C1', nome: 'Ética', peso: 5 },
        { id: 'C2', nome: 'Disciplina', peso: 5 },
        { id: 'C3', nome: 'Produtividade', peso: 5 },
        { id: 'C4', nome: 'Relacionamento', peso: 5 },
        { id: 'C5', nome: 'Assiduidade', peso: 10 },
        { id: 'C6', nome: 'Pontualidade e Presença', peso: 4 }
      ]
    }
  ],
  /**
   * Regra: se a nota de qualquer um destes indicadores for menor que o
   * limite indicado, o estagiario esta automaticamente reprovado,
   * independente da nota final.
   */
  reprovacaoAutomatica: [
    { indicadorId: 'C1', limite: 7 },
    { indicadorId: 'C3', limite: 7 }
  ]
};

/**
 * Retorna ao cliente toda a estrutura/parametrizacao necessaria para
 * montar e calcular o modal da FIA. Nao le nem grava nada na planilha.
 * @return {Object}
 */
function obterEstruturaFIA() {
  return {
    estrutura: FIA_ESTRUTURA,
    faixas: FIA_FAIXAS,
    notaMinimaAprovacao: FIA_NOTA_MINIMA_APROVACAO
  };
}
