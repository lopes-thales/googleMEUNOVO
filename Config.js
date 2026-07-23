// Config.gs
// Responsabilidade: parametros centrais do projeto "Painel de Thales".
// Qualquer nome de aba, coluna, e-mail autorizado ou constante de negocio usada
// por mais de um script deve viver aqui — nunca duplicar valores espalhados
// pelos demais arquivos.

//ORIENTACOES - AS ABAS NA PLANILHA SEGUEM A ESTRUTURA AQUI INSERIDAS:
//diligencias
//com as colunas (A:X) ID	PROCESSO N°	ASSISTIDA(O)	DILIGÊNCIA	DI	PRAZO	DF	ADV	ESTAGIÁRIO(A)	STATUS	OBS	ESPÉCIE	ALTERADO EM	SUBSESPÉCIE	DF REAL	VARA	LINK	SEMESTRE	SINC	CLASS SEC	SECRETARIA	DRIVE	DI CLASS	DF CLASS
//(coluna V = DRIVE: 'S' quando o PDF do processo ja foi organizado na pasta do estagiario — ver Drive.js)
//(colunas W/X = DI CLASS/DF CLASS: data de criacao e de entrega da atividade, conforme registradas no proprio Google Classroom — ver Classroom.js)
//
//a aba bd (colunas A:Q):
//feriados: c2:c
//spécies: d2:d
//id do classroom: f2
//status: a2:a
//iniciais: e2:e
//id planilha geral: g2 (tambem usada para replicar estagiarios!E FINALIZADO — ver Geralsync.js)
//complexas: h2:h
//numeracao PA: i2
//numeracao PI: j2
//numeracao AC: k2
//id pasta de processos/estagiarios (Drive.js): l2
//m2: nao usado neste desenvolvimento (antigo ID do Google Calendar de audiencias)
//id planilha secretaria: n2
//nome da aba geral de diligencias: o2
//data final do estagio (mensageria — Mensagens.js): p2
//id pasta de arquivo dos estagiarios finalizados (botao "Arquivar Pastas", Drive.js): q2
//
//aba atendimentos a:j
//Data	Void	Nome	CPF	Telefone 1	Telefone 2	Emprego	Ramo	Estagiário SEMESTRE
//(OBS: a coluna "Void" não tem um valor, mas é retornada por causa de uma fórmula)
//
//aba protocolos: a:e
//ASSISTIDO	Nº DO PROCESSO	ÓRGÃO JULGADOR	RESPONSÁVEL PELO PROTOCOLO	ALUNO
//
//aba iniciais: a:p
//ID	DATA	E-MAIL	ASSISTIDO	CPF	ESPÉCIE	STATUS	OBS	ALTERADO EM	DF	LINK	SEMESTRE	DI CLASS	DF CLASS	PROCESSO	VARA
//(colunas O/P = PROCESSO/VARA: preenchidas uma vez por dia pelo cruzamento automatico com a aba protocolos — ver Iniciais.js)
//
//aba audiencias: a:j
//ID	Data	Dia	Hora	Vara	Adv	Tipo	Processo	Assistido(a)	OBS
//(OBS: a coluna "Dia" nao tem valor digitado, e sempre uma formula a partir de "Data" — somente leitura)
//
//aba estagiarios: colunas A:H = ID	nome	e-mail	TRIMESTRE	FINALIZADO	SEMESTRE	DRIVE	ARQUIVADO, sendo que a coluna C tem o e-mail dos ESTAGIÁRIOS.
//(coluna G = DRIVE: ID da pasta do estagiario dentro de bd!L2 — ver Drive.js)
//(coluna E = FINALIZADO: ao salvar no modal "Gerenciar Estagiários", tambem e replicada por ID na aba estagiarios da planilha GERAL — bd!G2, ver Geralsync.js)
//(coluna H = ARQUIVADO: 'S' quando a pasta do estagiario (coluna G) ja foi movida de bd!L2 para bd!Q2 pelo botao "Arquivar Pastas" — ver Drive.js)
//
//aba atendimentos colunas A:J ID	Nome	Processo	Data	Status	e-mail	link	DataEntrega	Semestre
//
//aba atendimentos_online (colunas A:L, base 0) — ver AtendimentoOnline.js:
//ID	DATA	ESTAGIARIO	EMAIL	ATENDIDO	TIPO_ATIVIDADE	ID_ATIVIDADE	JUSTIFICATIVA	STATUS	OBS_APROVACAO	ALTERADO_EM	SEMESTRE
//(so pode referenciar Diligencia ou Inicial — Acompanhamento e Atendimento
//presencial ficam de fora, decisao de Thales; uma atividade — Diligencia ou
//Inicial — so pode ser referenciada UMA UNICA VEZ nesta aba: apos criado o
//Atendimento Online de uma atividade, ela nunca mais pode ser selecionada
//por outro registro, mesmo que o primeiro tenha sido reprovado. Um registro
//Reprovado pode ser editado e reenviado pelo proprio estagiario (mesma
//linha, volta a Pendente), mas isso NAO libera a atividade para um novo
//registro distinto.)
//(so conta na producao do estagiario — Panorama.js/Graficos.js — quando
//STATUS = 'Aprovado'.)
//
//OBS: onde tiver aluno, considere Estagiários, ou seja, aluno=estagiário

//Diligências (classificarStatusPelaSubmission e call site em verificarEntregasClassroom):
//nota = nota máxima (100) → Protocolado
//nota ≥ 90% da máxima (mas < 100) → Ok + OBS "Acordo realizado pelo(a) estagiário(a) em DD/MM/AAAA às HH:MM"
//nota ≥ 50% da máxima (mas < 90%) → Ok + OBS "Atividade validada em DD/MM/AAAA às HH:MM"
//nota < 50% (inclusive 0) → Devolvida (sem mudança)
//Iniciais (classificarStatusPelaSubmissionInicial e call site em verificarEntregasIniciais):
//nota ≥ 50% da máxima (inclusive nota 100) → Ok + OBS "Atividade validada em DD/MM/AAAA às HH:MM"
//nota < 50% → Devolvida
//Os limites (50% e 90%) são calculados a partir de CONFIG.CLASSROOM.PONTUACAO_MAXIMA (Config.js:163) em vez de valores fixos — se a nota máxima mudar de 100 no futuro, as faixas se ajustam automaticamente.
//Um ajuste adicional necessário: a notificação ao aluno em Iniciais (mensagem "atividade marcada como OK") checava assignedGrade === 100 exatamente (Classroom.js:412-417). Como agora Ok pode ocorrer a partir de 50%, atualizei essa checagem para >= 50% da nota máxima também — senão a notificação nunca dispararia para notas entre 50 e 99.



var CONFIG = {

  // --- Acesso ---
  // Unico e-mail autorizado a abrir o painel (escritorio de uma pessoa so).
  EMAIL_AUTORIZADO: 'thales.lopes@cest.edu.br',
  EMAILS_SECRETARIA: ['escritorioescola@cest.edu.br', 'telma.souza@cest.edu.br'],
  NOME_USUARIO: 'Thales',

  // --- Roteamento do Web App (doGet) ---
  // O mesmo deployment atende duas paginas: o Painel de Thales (padrao, sem
  // parametro) e o Painel Aluno (?pagina=aluno). Ver Code.js.
  ROTA: {
    PARAM: 'pagina',
    VALOR_ALUNO: 'aluno'
  },

  // --- Abas da planilha ---
  SHEET_DILIGENCIAS: 'diligencias',
  SHEET_ESTAGIARIOS: 'estagiarios',
  SHEET_BD: 'bd',
  SHEET_AUDIENCIAS: 'audiencias',

  TIMEZONE: 'America/Fortaleza',

  // --- Colunas da aba diligencias (A:U, base 0) ---
  COL: {
    ID: 0,            // A
    PROCESSO: 1,      // B
    ASSISTIDO: 2,      // C
    DILIGENCIA: 3,     // D
    DI: 4,            // E
    PRAZO: 5,         // F
    DF: 6,            // G
    ADV: 7,           // H  (usada por outro script — nunca exibir/alterar aqui)
    ESTAGIARIO: 8,     // I
    STATUS: 9,        // J
    OBS: 10,          // K
    ESPECIE: 11,       // L  (picklist manual — vem de bd!D2:D)
    ALTERADO_EM: 12,   // M
    SUBESPECIE: 13,    // N  (SEMPRE calculada automaticamente a partir de ESPECIE — nunca editada manualmente)
    DF_REAL: 14,       // O (nao usado nesta pagina)
    VARA: 15,         // P
    LINK: 16,         // Q  (link do Classroom — populado automaticamente ao criar a atividade)
    SEMESTRE: 17,      // R
    SINC: 18,         // S  (nao usado nesta pagina)
    CLASS: 19,        // T  ('S' quando a atividade ja foi criada no Classroom, senao vazio)
    SECRETARIA: 20,   // U  ('S' quando o registro ja foi copiado para a aba secretaria)
    DRIVE: 21,        // V  ('S' quando o PDF do processo ja foi organizado na pasta do estagiario — ver Drive.js)
    DI_CLASS: 22,     // W  (data de criacao da atividade no Classroom — preenchida com o valor retornado pela API, nao com DI/hoje)
    DF_CLASS: 23      // X  (data de entrega/dueDate da atividade no Classroom — preenchida com o valor retornado pela API, nao com DF)
  },
  TOTAL_COLUNAS_DILIGENCIAS: 24, // A ate X

  SHEET_SECRETARIA: 'secretaria',

  // Valor gravado na coluna CLASS apos a criacao bem-sucedida da atividade no Classroom.
  CLASS_ENVIADO: 'S',

  // Valor gravado na coluna DRIVE (diligencias!V) apos o PDF do processo ser
  // localizado e movido para a pasta do estagiario (ver Drive.js).
  DRIVE_ORGANIZADO: 'S',

  // Valor gravado na coluna ARQUIVADO (estagiarios!H) apos a pasta do
  // estagiario ser movida de bd!L2 para bd!Q2 (botao "Arquivar Pastas" — ver Drive.js).
  ARQUIVADO_ESTAGIARIO: 'S',

  // --- Colunas da aba estagiarios (A:H) ---
  // B = nome (usado no picklist e na aba Panorama), C = e-mail institucional
  // (usado para localizar o aluno no Classroom e na aba Panorama/Iniciais).
  // F = SEMESTRE (texto simples, ex. "2026.01") — preenchido manualmente por
  // Thales; e a unica fonte do semestre do estagiario na aba Panorama (TRIMESTRE
  // nao e mais usado para isso).
  ESTAGIARIOS_COL: {
    ID: 0,          // A
    NOME: 1,        // B
    EMAIL: 2,       // C
    TRIMESTRE: 3,   // D
    FINALIZADO: 4,  // E
    SEMESTRE: 5,    // F
    DRIVE: 6,       // G  (ID da pasta do estagiario dentro de bd!L2 — ver Drive.js)
    ARQUIVADO: 7    // H  ('S' quando a pasta (coluna G) ja foi movida de bd!L2 para bd!Q2 — botao "Arquivar Pastas", ver Drive.js)
  },

  // --- Colunas da aba bd (picklists e parametros), base A:H ---
  BD_COL: {
    STATUS: 'A',            // picklist manual de STATUS
    VARA: 'B',              // picklist manual de VARA
    FERIADOS: 'C',          // lista de feriados (nacional/estadual/municipal) para calculo de dias uteis
    ESPECIE: 'D',           // picklist manual de ESPECIE (coluna L de diligencias)
    INICIAIS: 'E',          // picklist de ESPECIE usado no modal "Criar Peticao Inicial" (Painel Aluno) - ver Iniciais.js
    ID_CLASS: 'F',          // celula unica: ID da turma no Google Classroom
    ID_PLANILHA_GERAL: 'G', // celula unica: nao usado neste desenvolvimento
    COMPLEXAS: 'H'          // valores de ESPECIE (coluna D) que geram SUBESPECIE = "Complexa"
  },

  // Celulas unicas (nao sao listas) dentro da aba bd.
  BD_CELL: {
    ID_CLASS: 'F2',
    ID_PLANILHA_GERAL: 'G2', //ID da planilha GERAL — usado por GeralSync.js (upsert de I:L)
    CONTROLE_PA: 'I2', // contador para numeracao PA-XXXX (Novo Pedido) — guarda apenas o numero inteiro atual
    CONTROLE_PI: 'J2', // contador para numeracao PI-XXXX — nao usado neste desenvolvimento
    CONTROLE_AC: 'K2', // contador para numeracao AC-XXXX (Novo Acompanhamento) — guarda apenas o numero inteiro atual
    ID_PASTA_PROCESSOS: 'L2', // ID da pasta no Drive com os PDFs de processos recebidos e as subpastas por estagiario — usado por Drive.js
    ID_PLANILHA_SECRETARIA: 'N2', // ID da planilha destino para envio da aba secretaria
    NOME_ABA_GERAL_DILIGENCIAS: 'O2', // nome da aba de diligencias dentro da planilha GERAL
    DATA_FINALIZACAO_ESTAGIO: 'P2', // data final do periodo de estagio corrente (mensageria — ver Mensagens.js)
    ID_PASTA_ARQUIVO_ESTAGIARIOS: 'Q2', // ID da pasta no Drive para onde vao as pastas dos estagiarios finalizados, retiradas de bd!L2 — botao "Arquivar Pastas" (Drive.js)
    CONTROLE_AO: 'R2' // contador para numeracao AO-XXXX (Atendimento Online) — guarda apenas o numero inteiro atual, ver AtendimentoOnline.js
  },

  // --- Integracao Google Classroom ---
  CLASSROOM: {
    PASTA_DRIVE_URL: 'https://drive.google.com/drive/folders/1LHjznEPH2515FD33m1llQlhAD8xpb3hp?usp=sharing',
    // ASSUNCAO A CONFIRMAR: pontuacao maxima padrao das atividades (necessaria
    // para que a atividade seja avaliavel/notavel no Classroom).
    PONTUACAO_MAXIMA: 100,
    // Nome fixo do topico usado para todas as atividades de Acompanhamento
    // (diligencias usa Simples/Complexa como topico; acompanhamentos nao tem
    // essa classificacao, entao usa um unico topico fixo).
    TOPICO_ACOMPANHAMENTOS: 'Acompanhamento'
  },

  // Janela em que o gatilho automatico de "Verificar Entregas" pode rodar.
  // ASSUNCAO A CONFIRMAR: 08:00-18:00. Ajustar se Thales definir outro horario.
  HORARIO_COMERCIAL: { INICIO: 8, FIM: 18 },

  // --- Valores fixos de negocio ---
  SUBESPECIE_VALORES: { SIMPLES: 'Simples', COMPLEXA: 'Complexa' },
  PREFIXO_PEDIDO_ALUNO: 'PA-',
  DILIGENCIA_PEDIDO_ALUNO: 'PEDIDO ALUNO',

  // Numeracao das Peticoes Iniciais criadas pelo modal "Criar Peticao Inicial"
  // do Painel Aluno (contador em bd!J2 — ver CONTROLE_PI). O topico da
  // atividade no Classroom para essas peticoes e sempre SUBESPECIE_VALORES.COMPLEXA
  // ("Complexa"), fixo, por decisao de Thales — nao depende da ESPECIE escolhida.
  PREFIXO_PEDIDO_INICIAL: 'PI-',
  STATUS_INICIAL_PADRAO: 'Encaminhado',
  // Prazo padrao (em dias uteis, considerando bd!C2:C) somado a hoje para
  // calcular o DF de uma Peticao Inicial criada pelo Painel Aluno.
  PRAZO_DIAS_PEDIDO_INICIAL: 5,

  // --- Regras de status ---
  // Status finais: uma vez neste estado, o registro nao conta mais como
  // "em atraso" nem como "sem estagiario", mesmo com DF vencido.
  STATUS_FINAIS: ['ok', 'protocolado', 'cancelada'],

  // Ordem/rotulo oficial dos status (fluxo do escritorio)
  STATUS_VALORES: ['Encaminhado', 'Entregue', 'Devolvida', 'Ok', 'Protocolado', 'Cancelada'],

  // --- Aba iniciais (colunas A:P, base 0) ---
  SHEET_INICIAIS: 'iniciais',
  INICIAIS_COL: {
    ID: 0,           // A
    DATA: 1,         // B  (equivalente a DI — data de inicio do pedido)
    EMAIL: 2,        // C  (e-mail do estagiario — cruzado com estagiarios!C)
    ASSISTIDO: 3,    // D
    CPF: 4,          // E
    ESPECIE: 5,      // F
    STATUS: 6,       // G  (sobrescrito uma unica vez para "Protocolado" quando o cruzamento diario encontra match em protocolos — ver verificarProtocolosIniciais em Iniciais.js)
    OBS: 7,          // H  (somente leitura neste painel)
    ALTERADO_EM: 8,  // I
    DF: 9,           // J
    LINK: 10,        // K  (somente leitura — Classroom)
    SEMESTRE: 11,    // L
    DI_CLASS: 12,    // M  (data de criacao da atividade no Classroom — preenchida com o valor retornado pela API, nao com DATA/hoje)
    DF_CLASS: 13,    // N  (data de entrega/dueDate da atividade no Classroom — preenchida com o valor retornado pela API, nao com DF)
    PROCESSO: 14,    // O  (Nº do processo — preenchido pelo cruzamento diario com protocolos!B, ver verificarProtocolosIniciais em Iniciais.js)
    VARA: 15         // P  (vara — preenchida pelo cruzamento diario com protocolos!C, ver verificarProtocolosIniciais em Iniciais.js)
  },
  TOTAL_COLUNAS_INICIAIS: 16,

  // --- Aba protocolos (colunas A:E), usada para cruzar com iniciais ---
  SHEET_PROTOCOLOS: 'protocolos',
  PROTOCOLOS_COL: {
    ASSISTIDO: 0,       // A
    PROCESSO: 1,        // B  (Nº DO PROCESSO)
    ORGAO_JULGADOR: 2,  // C  (VARA)
    RESPONSAVEL: 3,     // D
    ALUNO: 4            // E  (nome do estagiario, cruzado com estagiarios!B)
  },

  // --- Aba atendimentos (colunas A:J), usada somente pela aba "Panorama" ---
  // Nenhum outro arquivo deve ler/escrever esta aba diretamente (ver Panorama.js).
  SHEET_ATENDIMENTOS: 'atendimentos',
  ATENDIMENTOS_COL: {
    DATA: 0,        // A (data e hora do atendimento)
    VOID: 1,        // B (coluna de formula, sem uso no painel)
    NOME: 2,        // C (nome do atendido/assistido)
    CPF: 3,         // D
    TELEFONE1: 4,   // E
    TELEFONE2: 5,   // F
    EMPREGO: 6,     // G
    RAMO: 7,        // H
    ESTAGIARIO: 8,  // I (nome do aluno — cruzado com estagiarios!B na aba Panorama)
    SEMESTRE: 9     // J (texto simples, ex. "2026.01") — preenchido manualmente por Thales
  },
  TOTAL_COLUNAS_ATENDIMENTOS: 10, // A ate J

  // --- Aba acompanhamentos (colunas A:K, base 0) ---
  // NOME e EMAIL sao gravados diretamente na linha (mesma fonte de
  // estagiarios!B e estagiarios!C, respectivamente) — ao contrario da aba
  // iniciais, aqui nao ha cruzamento por e-mail em tempo de leitura.
  // Nao ha coluna ASSISTIDO nem OBS nem ALTERADO EM nesta aba.
  SHEET_ACOMPANHAMENTOS: 'acompanhamentos',
  ACOMPANHAMENTOS_COL: {
    ID: 0,                     // A
    NOME: 1,                   // B  (nome do estagiario)
    PROCESSO: 2,               // C
    DATA: 3,                   // D  (data de criacao — equivalente a DI)
    STATUS: 4,                 // E
    EMAIL: 5,                  // F  (e-mail do estagiario)
    COD_ATIVIDADE_CLASSROOM: 6, // G (coluna existente na planilha; nao lida/escrita neste painel — o id da atividade e guardado como nota na celula LINK, ver Classroom.js)
    LINK: 7,                   // H  (link do Classroom — populado automaticamente ao criar a atividade)
    DATA_ENTREGA: 8,           // I  (equivalente a DF — prazo de entrega)
    SEMESTRE: 9,               // J
    CLASS: 10,                 // K  ('S' quando a atividade ja foi criada no Classroom, senao vazio)
    DI_CLASS: 11,              // L  (data de criacao da atividade no Classroom — preenchida com o valor retornado pela API, nao com DATA/hoje)
    DF_CLASS: 12               // M  (data de entrega/dueDate da atividade no Classroom — preenchida com o valor retornado pela API, nao com DATA_ENTREGA)
  },
  TOTAL_COLUNAS_ACOMPANHAMENTOS: 13, // A ate M

  PREFIXO_ACOMPANHAMENTO: 'AC-',

  // --- Aba atendimentos_online (colunas A:L, base 0) ---
  // Ver AtendimentoOnline.js (unico arquivo com permissao de ler/escrever
  // esta aba). Cada linha e o registro de um Atendimento Online feito pelo
  // estagiario, obrigatoriamente vinculado a uma Diligencia ou Inicial
  // propria (Acompanhamento fica de fora, decisao de Thales), e sujeito a
  // aprovacao de Thales.
  SHEET_ATENDIMENTOS_ONLINE: 'atendimentos_online',
  ATENDIMENTO_ONLINE_COL: {
    ID: 0,               // A  (AO-0001, ...)
    DATA: 1,              // B  (data do atendimento, informada pelo estagiario)
    ESTAGIARIO: 2,        // C  (nome do estagiario)
    EMAIL: 3,              // D  (e-mail do estagiario logado — nunca vem do payload do cliente)
    ATENDIDO: 4,           // E  (nome da pessoa atendida)
    TIPO_ATIVIDADE: 5,    // F  ('Diligência' | 'Inicial')
    ID_ATIVIDADE: 6,      // G  (ID da diligencia/inicial referenciada — unico na aba)
    JUSTIFICATIVA: 7,      // H
    STATUS: 8,             // I  ('Pendente' | 'Aprovado' | 'Reprovado')
    OBS_APROVACAO: 9,      // J  (motivo informado por Thales ao reprovar)
    ALTERADO_EM: 10,        // K
    SEMESTRE: 11            // L  (estatico, calculado uma unica vez a partir de DATA na criacao)
  },
  TOTAL_COLUNAS_ATENDIMENTO_ONLINE: 12, // A ate L

  PREFIXO_ATENDIMENTO_ONLINE: 'AO-',

  STATUS_ATENDIMENTO_ONLINE: {
    PENDENTE: 'Pendente',
    APROVADO: 'Aprovado',
    REPROVADO: 'Reprovado'
  },

  // Tipos de atividade vinculavel a um Atendimento Online — decisao de
  // Thales: apenas Diligencia e Inicial (Acompanhamento removido; Atendimento
  // presencial da aba "atendimentos" tambem fica de fora, pois aquela aba nao
  // tem ID unico por linha).
  TIPOS_ATIVIDADE_ATENDIMENTO_ONLINE: ['Diligência', 'Inicial'],

  // --- Aba audiencias (colunas A:J, base 0) ---
  // Somente leitura neste painel: todos os valores vem prontos da planilha
  // (DIA e sempre uma formula a partir de DATA — nunca calculada aqui).
  AUDIENCIAS_COL: {
    ID: 0,         // A
    DATA: 1,       // B
    DIA: 2,        // C (formula a partir de DATA)
    HORA: 3,       // D
    VARA: 4,       // E
    ADV: 5,        // F
    TIPO: 6,       // G
    PROCESSO: 7,   // H
    ASSISTIDO: 8,  // I
    OBS: 9         // J
  },
  TOTAL_COLUNAS_AUDIENCIAS: 10, // A ate J

  // --- Mensageria (Mensagens.js) ---
  // Mensagens 1/2 (cobranca de prazo vencido, diligencias/iniciais/acompanhamentos):
  // intervalo minimo, em dias corridos, entre o 1o e o 2o aviso.
  COBRANCA: {
    DIAS_ENTRE_AVISOS: 2
  },

  // Mensagens 4/5 (encerramento de estagio), disparadas pelo gatilho diario
  // que compara hoje com bd!P2 (CONFIG.BD_CELL.DATA_FINALIZACAO_ESTAGIO):
  //   DIAS_AVISO_PRODUCAO dias corridos antes de P2 -> Mensagem 4 (resumo de producao, e-mail)
  //   DIAS_AVISO_FLUXO    dias corridos antes de P2 -> Mensagem 5 (fluxo de encerramento, mural + e-mail)
  // PASSOS: texto fixo definido por Thales para a Mensagem 5 — lista numerada
  // montada em montarMensagemEncerramento (Mensagens.js).
  ENCERRAMENTO_ESTAGIO: {
    DIAS_AVISO_PRODUCAO: 15,
    DIAS_AVISO_FLUXO: 7,
    PASSOS: [
      'Passar e/ou atualizar na ficha da Secretaria todas as atividades que você fez durante o estágio. Para isso, você pode se valer do Painel do Aluno para servir de base no preenchimento da referida ficha.',
      'Imprimir o Relatório Final de Estágio com essas informações (existe um modelo aqui no Classroom disponível na Seção "Modelos").',
      'Fazer a conferência das atividades junto à Secretaria, que vai fazer a validação em todas as atividades realizadas, com exceção dos atendimentos.',
      'Fazer a conferência dos atendimentos junto à Recepção, que vai fazer a validação.',
      'Levar o Relatório Final de Estágio para minha assinatura.',
      'Lembrem-se que OS ATENDIMENTOS ONLINE devem ser validados por mim e só serão contados AQUELES RELACIONADOS A PROCESSOS ENVIADOS POR MIM no Classroom. Qualquer outro atendimento online que não esteja relacionado diretamente aos processos e partes de diligências enviadas por mim NÃO SERÁ ACEITO.',
      'Dar entrada no referido Relatório na Central de Atendimento CEST.'
    ]
  }
};