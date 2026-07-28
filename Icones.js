/**
 * Icones.js
 *
 * FONTE ÚNICA DE VERDADE dos ícones da interface (Material Symbols Outlined).
 *
 * Decisão de arquitetura (25/07/2026):
 * Antes desta versão os nomes de ícones estavam espalhados em cinco lugares
 * (thales.html, PainelAluno.html, Scripts.html, AlunoScripts.html e mapas JS
 * duplicados entre os dois painéis), o que gerou divergências reais - por
 * exemplo, Iniciais aparecia como "description" nas tabelas e "history_edu"
 * no gráfico, e Audiências alternava entre "gavel" e "balance".
 *
 * Agora todo ícone é declarado UMA ÚNICA VEZ aqui e consumido de duas formas:
 *
 *   1) HTML estático (thales.html / PainelAluno.html), que são templates
 *      HtmlService e portanto avaliam scriptlets:
 *          <span class="material-symbols-outlined"><?= ICONES.iniciais ?></span>
 *
 *   2) JavaScript do cliente (Scripts.html / AlunoScripts.html), que NÃO são
 *      templates (o include() em Code.js usa createHtmlOutputFromFile, que não
 *      avalia scriptlets). Por isso o mapa é injetado como variável global
 *      dentro do <script> do próprio template, ANTES do include:
 *          <script>var ICONES = <?!= JSON.stringify(ICONES) ?>;</script>
 *      Observe o uso de <?!= ?> (saída não escapada) - com <?= ?> as aspas do
 *      JSON seriam convertidas em &quot; e o script quebraria.
 *
 * REGRA: nenhum nome de ícone deve ser escrito literalmente em arquivo HTML
 * ou JS. Para acrescentar um ícone novo, adicione a chave aqui primeiro.
 *
 * Chaves repetindo o mesmo glifo são intencionais quando o reuso é semântico
 * (ex.: enviar / reenviar / cardEncaminhado usam todos "send"). Isso mantém a
 * intenção explícita no ponto de uso e permite desacoplar depois sem caçar
 * ocorrências.
 */

var ICONES = {

  // ===== ENTIDADES E ÁREAS DO SISTEMA =====
  diligencias:          'assignment',
  distribuicao:         'assignment_ind',
  iniciais:             'contract',
  acompanhamentos:      'timeline',
  atendimentos:         'conversation',
  atendimentoOnline:    'forum',
  audiencias:           'gavel',
  audienciasSecretaria: 'calendar_month',
  complexas:            'description',
  simples:              'draft',
  panorama:             'dashboard',
  meusRegistros:        'dashboard',
  graficos:             'bar_chart',
  utilitarios:          'build',
  pendencias:           'pending_actions',

  // ===== SEÇÕES DE UTILITÁRIOS =====
  sistema:              'settings',
  classroom:            'school',
  drive:                'folder_open',
  fia:                  'grading',
  relatorio:            'bar_chart',

  // ===== PESSOAS =====
  estagiarios:          'groups',
  aluno:                'person',
  usuarioThales:        'owl',
  usuarioAluno:         'sentiment_satisfied',

  // ===== AÇÕES =====
  salvar:               'save',
  enviar:               'send',
  reenviar:             'send',
  aprovar:              'check_circle',
  reprovar:             'cancel',
  aprovarPeticoes:      'approval',
  calcular:             'calculate',
  copiar:               'content_copy',
  fechar:               'close',
  limpar:               'close',
  atualizar:            'refresh',
  sincronizar:          'sync',
  transferir:           'swap_horiz',
  cobrancas:            'campaign',
  organizarPastas:      'drive_file_move',
  arquivarPastas:       'archive',
  verificarEntregas:    'move_to_inbox',
  verificarProtocolos:  'fact_check',
  novoPedido:           'post_add',
  novaPeticao:          'note_add',
  solicitarDiligencia:  'assignment_add',
  gerenciar:            'tune',
  dropdown:             'arrow_drop_down',
  preencherSemestre:    'event_repeat',
  preencherDfFinal:     'edit_calendar',
  calcularDiaUtil:      'event_available',
  muralSemana:          'event_upcoming',
  preencherFIA:         'rule',

  // ===== CARDS DE RESUMO =====
  cardTotal:            'inventory_2',
  cardEncaminhado:      'send',
  cardEntregue:         'move_to_inbox',
  cardDevolvida:        'undo',
  cardConcluido:        'check_circle',
  cardCancelada:        'block',
  cardAtraso:           'warning',
  cardSemEstagiario:    'person_off',
  cardPadrao:           'folder',
  parcialHoras:         'flag',

  // ===== FEEDBACK E ESTADOS =====
  carregando:           'hourglass_top',
  sucesso:              'check_circle',
  erro:                 'error',
  alerta:               'warning',
  info:                 'info',
  semResultado:         'search_off',
  semPendencias:        'task_alt',
  semAlunos:            'group_off',
  semEstagiario:        'person_off',
  prazoProximo:         'schedule',
  historico:            'history',
  todasAudiencias:      'history',
  avisoEmail:           'mail',

  // ===== NAVEGAÇÃO E CONTROLES =====
  buscar:               'search',
  filtroData:           'date_range',
  semestre:             'event',
  paginaAnterior:       'chevron_left',
  paginaProxima:        'chevron_right',
  temaEscuro:           'dark_mode',
  temaClaro:            'light_mode',
  graficoBarras:        'stacked_bar_chart',
  graficoProducao:      'bar_chart'

};

/**
 * Retorna o mapa de ícones serializado para injeção no cliente.
 * Usado pelos templates thales.html e PainelAluno.html.
 */
function obterMapaIcones() {
  return JSON.stringify(ICONES);
}
