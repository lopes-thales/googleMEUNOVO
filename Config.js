// Config.gs
// Responsabilidade: parametros centrais do projeto "Painel de Thales".
// Qualquer nome de aba, coluna, e-mail autorizado ou constante de negocio usada
// por mais de um script deve viver aqui — nunca duplicar valores espalhados
// pelos demais arquivos.

//ORIENTACOES - AS ABAS NA PLANILHA SEGUEM A ESTRUTURA AQUI INSERIDAS:
//diligencias
//com as colunas (A:Y) ID	PROCESSO N°	ASSISTIDA(O)	DILIGÊNCIA	DI	PRAZO	DF	ADV	ESTAGIÁRIO(A)	STATUS	OBS	ESPÉCIE	ALTERADO EM	SUBSESPÉCIE	DF REAL	VARA	LINK	SEMESTRE	SINC	CLASS SEC	SECRETARIA	DRIVE	DI CLASS	DF CLASS	COMENTÁRIO
//(coluna V = DRIVE: 'S' quando o PDF do processo ja foi organizado na pasta do estagiario — ver Drive.js)
//(colunas W/X = DI CLASS/DF CLASS: data de criacao e de entrega da atividade, conforme registradas no proprio Google Classroom — ver Classroom.js)
//(coluna Y = COMENTARIO: observacao adicional digitada por Thales no modal, exibida no painel embaixo de OBS. Quando preenchida, entra nas Instrucoes da Atividade do Classroom — ver montarDescricaoAtividade em Classroom.js — precedida de "⚠️⚠️" e com a primeira letra maiuscula; quando vazia, a descricao da atividade segue o comportamento padrao, sem esse aviso.)
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
//(p2 foi aposentado em 27/07/2026: data final do estagio agora fica em estagiarios!L, por aluno — ver Mensagens.js)
//id pasta de arquivo dos estagiarios finalizados (botao "Arquivar Pastas", Drive.js): q2
//pesos do calculo de "Parcial de Horas" (aba Panorama — Panorama.js): peso por atendimento: s2, peso por simples: t2, peso por complexa/inicial: u2, peso por acompanhamento: v2
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
//aba estagiarios: colunas A:M = ID	nome	e-mail	TRIMESTRE	FINALIZADO	SEMESTRE	DRIVE	ARQUIVADO	PERIODO	MATRICULA	DATA_INICIO	DATA_FIM	TURMA, sendo que a coluna C tem o e-mail dos ESTAGIÁRIOS.
//(coluna G = DRIVE: ID da pasta do estagiario dentro de bd!L2 — ver Drive.js)
//(coluna E = FINALIZADO: ao salvar no modal "Gerenciar Estagiários", tambem e replicada por ID na aba estagiarios da planilha GERAL — bd!G2, ver Geralsync.js)
//(coluna H = ARQUIVADO: 'S' quando a pasta do estagiario (coluna G) ja foi movida de bd!L2 para bd!Q2 pelo botao "Arquivar Pastas" — ver Drive.js)
//(coluna I = PERIODO: periodo do aluno na IES — dimensao distinta da turma de estagio)
//(coluna K = DATA_INICIO: inicio do estagio — origem da derivacao de TURMA)
//(coluna L = DATA_FIM: fim do estagio — substitui bd!P2 na mensageria)
//(coluna M = TURMA: codigo "AAAA.SS-A" ou "AAAA.SS-R", derivado de DATA_INICIO)
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
//aba audiencias_estagiario (colunas A:R, base 0) — ver AudienciasEstagiario.js:
//ID	DATA	HORA	ESTAGIARIO	EMAIL	TIPO	VARA	PROCESSO	PARTES	OBS	STATUS	OBS_APROVACAO	ALTERADO_EM	SEMESTRE	(O nao mapeada)	ESPECIE	ID_MATRICULA	TURMA
//(coluna P = ESPECIE: picklist bd!AB2:AB, adicionada em 03/08/2026 — campo
//livre de classificacao, distinto do TIPO/F, que continua controlando a
//meta/limite. HORA/C deixou de ser coletada pelo Painel Aluno na mesma data,
//mas a coluna continua existindo na planilha para os registros antigos.)
//(modulo INDEPENDENTE da aba "audiencias" — pauta do escritorio, domínio
//distinto, somente leitura, ver Audiencias.js — e que NUNCA deve ser lida ou
//escrita por AudienciasEstagiario.js, nem vice-versa. Nao ha vinculo entre um
//registro desta aba e uma linha da pauta: decisao de Thales, 24/07/2026, o
//volume de audiencias na pauta tornaria o seletor inutilizavel — o estagiario
//digita os dados livremente.)
//(SEMESTRE aqui e ESTATICO — gravado uma unica vez na criacao a partir do
//semestre do proprio estagiario, nunca recalculado a partir de DATA. Isso
//permite registrar uma audiencia com data anterior ao semestre corrente sem
//quebrar a contagem da meta do semestre em curso — decisao de Thales,
//24/07/2026.)
//(nao ha coluna de comprovante: a ata/declaracao de presenca continua sendo
//enviada por e-mail e conferida manualmente por Thales — decisao de Thales,
//24/07/2026, avaliado e descartado o upload para o Drive.)
//(so conta para meta/progresso/graficos/Parcial de Horas quando STATUS =
//'Aprovada' — Pendente e Reprovada aparecem nas tabelas mas nunca somam.)
//
//aba bd, bloco X:Z (picklist + parametros de audiencias_estagiario, ver
//lerParametrosAudiencias em AudienciasEstagiario.js): X2:X = tipo de
//audiencia (fonte unica da picklist do modal do estagiario), Y2:Y = meta
//daquele tipo (inteiro, informativa — pode ser excedida, RN-06), Z2:Z =
//quantas horas cada audiencia daquele tipo vale no calculo de "Parcial de
//Horas" (aba Panorama). Linhas com X vazio sao ignoradas. Nenhum tipo/meta/
//hora e codificado no JavaScript — se o bloco estiver vazio, o modulo se
//comporta como se nao houvesse tipos cadastrados.
//aa2: contador para numeracao AU-XXXX (Audiencia do Estagiario), mesmo padrao de i2/j2/k2/r2.
//ab2:ab: picklist de ESPECIE do modal de audiencia do estagiario
//(audiencias_estagiario!P) — lista solta, sem alinhamento de linha com X:Z.
//af2:af: teto (inteiro) de audiencias por TIPO, alinhado por LINHA com X
//(mesma logica de Y/Z). Ao ser atingido (Aprovadas + Pendentes daquele tipo),
//BLOQUEIA um novo registro daquele tipo — diferente da meta Y, que so
//informa o progresso e pode ser excedida. Linha com AF vazio/0 = sem teto.
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
  // ALTERADO EM 02/08/2026: terceira rota — ?pagina=producao devolve a
  // "Tabela de Producao" pronta para impressao (ver Producao.js e
  // TabelaProducao.html). E uma pagina AUTONOMA, renderizada no servidor: o
  // aluno recebe HTML ja montado, nao os dados brutos, justamente para que a
  // tabela nao possa ser alterada antes da entrega (decisao de Thales).
  ROTA: {
    PARAM: 'pagina',
    VALOR_ALUNO: 'aluno',
    VALOR_PRODUCAO: 'producao',
    // Parametros aceitos por ?pagina=producao. EMAIL so e respeitado quando
    // quem acessa e Thales; para um estagiario o servidor SEMPRE sobrepoe com
    // o proprio e-mail logado (ver montarDadosTabelaProducao, Producao.js).
    PARAM_EMAIL: 'email',
    PARAM_TURMA: 'turma'
  },

  // --- Abas da planilha ---
  SHEET_DILIGENCIAS: 'diligencias',
  SHEET_ESTAGIARIOS: 'estagiarios',

  // --- Aba turmas (colunas A:D) — NOVA em 01/08/2026 ---
  // Cadastro das turmas de estagio. Fonte UNICA das janelas de cada turma e
  // da turma corrente. Substitui a antiga derivacao de obterTurmaCorrente() a
  // partir das linhas de estagiarios e o uso do "primeiro aluno da turma" como
  // representante da data de encerramento (Mensagens.js).
  // Janelas oficiais (RN-T01): -A e sempre janeiro (.01) ou julho (.02), mes
  // inteiro; -R vai de fevereiro a junho (.01) ou de agosto a dezembro (.02).
  // Somente Turma.js le ou escreve esta aba.
  SHEET_TURMAS: 'turmas',
  SHEET_BD: 'bd',
  SHEET_AUDIENCIAS: 'audiencias',

  TIMEZONE: 'America/Fortaleza',

  // --- Colunas da aba diligencias (A:Y, base 0) ---
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
    DF_REAL: 14,       // O (somente leitura no modal — exibida como "DF Real")
    VARA: 15,         // P
    LINK: 16,         // Q  (link do Classroom — populado automaticamente ao criar a atividade)
    SEMESTRE: 17,      // R
    SINC: 18,         // S  (nao usado nesta pagina)
    CLASS: 19,        // T  ('S' quando a atividade ja foi criada no Classroom, senao vazio)
    SECRETARIA: 20,   // U  ('S' quando o registro ja foi copiado para a aba secretaria)
    DRIVE: 21,        // V  ('S' quando o PDF do processo ja foi organizado na pasta do estagiario — ver Drive.js)
    DI_CLASS: 22,     // W  (data de criacao da atividade no Classroom — preenchida com o valor retornado pela API, nao com DI/hoje)
    DF_CLASS: 23,     // X  (data de entrega/dueDate da atividade no Classroom — preenchida com o valor retornado pela API, nao com DF)
    ID_MATRICULA: 25, // Z  (ID da matricula de estagio — estagiarios!N. Chave forte do vinculo registro -> matricula; gravada pelo servidor na atribuicao, NUNCA inferida em leitura. Ver Turma.js)
    TURMA: 26,        // AA (codigo da turma, espelho legivel de ID_MATRICULA: "AAAA.SS-A" ou "AAAA.SS-R". Gravada junto com ID_MATRICULA, nunca editada a mao na planilha)
    COMENTARIO: 24    // Y  (campo "Comentário" do modal — observacao adicional que, quando preenchida, entra nas Instrucoes da Atividade do Classroom, ver montarDescricaoAtividade em Classroom.js)
  },
  TOTAL_COLUNAS_DILIGENCIAS: 27, // A ate AA

  SHEET_SECRETARIA: 'secretaria',

  // Valor gravado na coluna CLASS apos a criacao bem-sucedida da atividade no Classroom.
  CLASS_ENVIADO: 'S',

  // Valor gravado na coluna DRIVE (diligencias!V) apos o PDF do processo ser
  // localizado e movido para a pasta do estagiario (ver Drive.js).
  DRIVE_ORGANIZADO: 'S',

  // Valor gravado na coluna ARQUIVADO (estagiarios!H) apos a pasta do
  // estagiario ser movida de bd!L2 para bd!Q2 (botao "Arquivar Pastas" — ver Drive.js).
  ARQUIVADO_ESTAGIARIO: 'S',

  // --- Colunas da aba estagiarios (A:M) ---
  // B = nome (usado no picklist e na aba Panorama), C = e-mail institucional
  // (usado para localizar o aluno no Classroom e na aba Panorama/Iniciais).
  // F = SEMESTRE (texto simples, ex. "2026.01") — preenchido manualmente por
  // Thales; continua sendo a dimensao das telas operacionais (Diligencias,
  // Distribuicao).
  // ALTERADO EM 01/08/2026 (modelo de turmas v2):
  // A = ID permanece INTOCADO pelo painel. Nenhuma funcao deste projeto
  // escreve nessa coluna — ela e lida por planilhas/scripts EXTERNOS e
  // continua sendo o identificador do aluno usado por eles.
  // N = MATRICULA_ESTAGIO ("MAT-0001") e o ID DA MATRICULA DE ESTAGIO, unico
  // por LINHA (nao por aluno): o mesmo aluno em duas turmas tem dois valores
  // diferentes. E a chave forte gravada nas abas transacionais. Preenchida
  // automaticamente (gatilho onEdit ao digitar o NOME) e tambem pelo botao
  // "Gerar Matrículas de Estágio" do dropdown Gerenciar.
  // J = MATRICULA e a matricula ACADEMICA do aluno, preenchida manualmente
  // quando ele se apresenta (pode levar semanas). E OPCIONAL e nunca bloqueia
  // nenhuma operacao (RN-T09). Nao desempata turma: a mesma matricula
  // academica se repete em todas as linhas do mesmo aluno.
  // K = DATA_INICIO e L = DATA_FIM deixam de ser a origem da TURMA e passam a
  // ser OVERRIDES OPCIONAIS: vazias por padrao; preenchidas apenas em
  // extensao/excecao individual, quando prevalecem sobre a janela da aba
  // turmas.
  // M = TURMA passa a ser ESCOLHIDA no cadastro (validada contra turmas!A) em
  // vez de derivada de DATA_INICIO. Entrar no antecipado e uma decisao de
  // matricula, nao uma inferencia a partir do mes de uma data.
  TURMAS_COL: {
    CODIGO: 0,       // A  ("AAAA.SS-A" ou "AAAA.SS-R") — chave da aba
    DATA_INICIO: 1,  // B  (Date) inicio oficial da turma
    DATA_FIM: 2,     // C  (Date) fim oficial da turma
    ATIVA: 3         // D  ('S' força esta turma como corrente; vazio = derivada das datas)
  },
  TOTAL_COLUNAS_TURMAS: 4, // A ate D

  ESTAGIARIOS_COL: {
    ID: 0,          // A  (identificador do aluno usado por planilhas EXTERNAS — o painel NUNCA escreve aqui)
    NOME: 1,        // B
    EMAIL: 2,       // C
    TRIMESTRE: 3,   // D
    FINALIZADO: 4,  // E
    SEMESTRE: 5,    // F
    DRIVE: 6,       // G  (ID da pasta do estagiario dentro de bd!L2 — ver Drive.js)
    ARQUIVADO: 7,   // H  ('S' quando a pasta (coluna G) ja foi movida de bd!L2 para bd!Q2 — botao "Arquivar Pastas", ver Drive.js)
    PERIODO: 8,     // I  (periodo do aluno na IES — NAO e a turma de estagio)
    MATRICULA: 9,   // J  (matricula ACADEMICA do aluno — opcional, ver RN-T09)
    DATA_INICIO: 10, // K  (override opcional da janela da turma)
    DATA_FIM: 11,    // L  (override opcional da janela da turma)
    TURMA: 12,       // M  ("AAAA.SS-A" ou "AAAA.SS-R") — escolhida, validada contra turmas!A
    MATRICULA_ESTAGIO: 13 // N  ("MAT-XXXX") — ID da matricula de estagio, unico por LINHA
  },
  TOTAL_COLUNAS_ESTAGIARIOS: 14, // A ate N

  // --- Colunas da aba bd (picklists e parametros), base A:H ---
  BD_COL: {
    STATUS: 'A',            // picklist manual de STATUS
    VARA: 'B',              // picklist manual de VARA
    FERIADOS: 'C',          // lista de feriados (nacional/estadual/municipal) para calculo de dias uteis
    ESPECIE: 'D',           // picklist manual de ESPECIE (coluna L de diligencias)
    INICIAIS: 'E',          // picklist de ESPECIE usado no modal "Criar Peticao Inicial" (Painel Aluno) - ver Iniciais.js
    ID_CLASS: 'F',          // celula unica: ID da turma no Google Classroom
    ID_PLANILHA_GERAL: 'G', // celula unica: nao usado neste desenvolvimento
    COMPLEXAS: 'H',         // valores de ESPECIE (coluna D) que geram SUBESPECIE = "Complexa"
    AUDIENCIA_TIPO: 'X',    // picklist de TIPO de audiencia do estagiario — ver lerParametrosAudiencias, AudienciasEstagiario.js
    AUDIENCIA_META: 'Y',    // meta (inteiro) de cada TIPO de audiencia (coluna X, mesma linha) — informativa, pode ser excedida (RN-06)
    AUDIENCIA_HORAS: 'Z',   // horas que cada audiencia daquele TIPO vale no calculo de "Parcial de Horas" (coluna X, mesma linha)
    AUDIENCIA_ESPECIE: 'AB', // picklist manual de ESPECIE do modal de audiencia do estagiario (audiencias_estagiario!P) — lista solta, sem vinculo de linha com X:Z
    AUDIENCIA_LIMITE: 'AF'  // teto (inteiro) de audiencias daquele TIPO (coluna X, mesma linha) — ao ser atingido, BLOQUEIA novo registro (distinto da meta Y, que so orienta o progresso)
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
    // (P2 foi aposentado: data final do estagio agora fica em estagiarios!L)
    ID_PASTA_ARQUIVO_ESTAGIARIOS: 'Q2', // ID da pasta no Drive para onde vao as pastas dos estagiarios finalizados, retiradas de bd!L2 — botao "Arquivar Pastas" (Drive.js)
    CONTROLE_AO: 'R2', // contador para numeracao AO-XXXX (Atendimento Online) — guarda apenas o numero inteiro atual, ver AtendimentoOnline.js
    ID_PASTA_ACOMPANHAMENTOS: 'W2', // ID da pasta no Drive com os PDFs de acompanhamentos recebidos, ainda soltos — botao "Organizar Pastas" (Drive.js). O destino continua sendo a MESMA pasta do estagiario usada pelas diligencias (estagiarios!G, dentro de bd!L2).
    CONTROLE_AU: 'AA2', // contador para numeracao AU-XXXX (Audiencia do Estagiario) — guarda apenas o numero inteiro atual, ver AudienciasEstagiario.js
    CONTROLE_MAT: 'AH2', // contador para numeracao MAT-XXXX (ID da matricula de estagio, estagiarios!N) — guarda apenas o numero inteiro atual, ver Turma.js
    CONSOLIDADO_AUDIENCIAS_TURMA: 'AE2', // ancoradouro da guarda de duplicidade do A-6 (consolidado de pendencias de audiencias por turma), substituindo a antiga nota em bd!P2 — ver Mensagens.js

    // Pesos usados no calculo de "Parcial de Horas" da aba Panorama (ver
    // getPesosPontuacaoPanorama, Panorama.js). Cada celula guarda um unico
    // numero — quantas "horas" vale uma unidade daquele tipo de atividade.
    PESO_ATENDIMENTO: 'S2',      // peso por atendimento (presencial + online aprovado)
    PESO_SIMPLES: 'T2',          // peso por diligencia simples
    PESO_COMPLEXA: 'U2',         // peso por diligencia complexa + inicial
    PESO_ACOMPANHAMENTO: 'V2'    // peso por acompanhamento
  },

  // --- Integracao Google Classroom ---
  CLASSROOM: {
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
    VARA: 15,        // P  (vara — preenchida pelo cruzamento diario com protocolos!C, ver verificarProtocolosIniciais em Iniciais.js)
    ID_MATRICULA: 16, // Q  (ID da matricula de estagio — estagiarios!N)
    TURMA: 17        // R  (codigo da turma, espelho legivel)
  },
  TOTAL_COLUNAS_INICIAIS: 18,

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
    SEMESTRE_LEGADO: 9, // J (antiga coluna de semestre; mantida so como fallback de leitura)
    SEMESTRE: 10,   // K (texto simples, ex. "2026.02") — devolvido por formula
    TURMA: 11       // L (texto simples, ex. "2026.02-R") — devolvido por formula
  },
  // ALTERADO EM 02/08/2026: a aba passou a trazer SEMESTRE (K) e TURMA (L)
  // por formula. Com isso, `atendimentos` deixou de ser a excecao do modelo de
  // turmas v2 — TODAS as abas transacionais agora carregam a turma na propria
  // linha, e a inferencia por data (anotarTurmaEmAtendimentos) foi removida.
  //
  // Motivo: a inferencia casava o aluno pelo NOME e, quando ele tinha uma
  // unica matricula cadastrada, devolvia essa matricula qualquer que fosse a
  // data do atendimento. Um aluno que nao era estagiario no periodo anterior
  // via os atendimentos daquele periodo migrarem para a turma atual.
  //
  // A aba inteira e READ-ONLY para o painel: nenhuma funcao deste projeto
  // escreve em `atendimentos`.
  TOTAL_COLUNAS_ATENDIMENTOS: 12, // A ate L

  // --- Aba acompanhamentos (colunas A:Q, base 0) ---
  // NOME e EMAIL sao gravados diretamente na linha (mesma fonte de
  // estagiarios!B e estagiarios!C, respectivamente) — ao contrario da aba
  // iniciais, aqui nao ha cruzamento por e-mail em tempo de leitura.
  // Nao ha coluna OBS nem ALTERADO EM nesta aba.
  // ASSISTIDO (coluna Q) foi criada por Thales em 05/08/2026: e digitada
  // diretamente no modal "Pedido de Acompanhamento" (nao ha cruzamento em
  // tempo de leitura, ao contrario de iniciais/protocolos).
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
    DF_CLASS: 12,              // M  (data de entrega/dueDate da atividade no Classroom — preenchida com o valor retornado pela API, nao com DATA_ENTREGA)
    DRIVE: 13,                 // N  ('S' quando o PDF do acompanhamento ja foi organizado na pasta do estagiario — ver Drive.js)
    ID_MATRICULA: 14,          // O  (ID da matricula de estagio — estagiarios!N)
    TURMA: 15,                 // P  (codigo da turma, espelho legivel)
    ASSISTIDO: 16              // Q  (nome do(a) assistido(a) — coluna "ASSISTIDO(A)" criada por Thales em 05/08/2026)
  },
  TOTAL_COLUNAS_ACOMPANHAMENTOS: 17, // A ate Q

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
    SEMESTRE: 11,           // L  (estatico — derivado da TURMA na criacao, ver RN-T08)
    ID_MATRICULA: 12,       // M  (ID da matricula de estagio — estagiarios!N)
    TURMA: 13               // N  (codigo da turma, espelho legivel)
  },
  TOTAL_COLUNAS_ATENDIMENTO_ONLINE: 14, // A ate N

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

  // --- Aba audiencias_estagiario (colunas A:N, base 0) ---
  // Ver AudienciasEstagiario.js (unico arquivo com permissao de ler/escrever
  // esta aba). Modulo independente da aba "audiencias" (pauta do escritorio,
  // ver AUDIENCIAS_COL mais abaixo) — nao ha vinculo entre as duas.
  SHEET_AUDIENCIAS_ESTAGIARIO: 'audiencias_estagiario',
  AUDIENCIAS_ESTAGIARIO_COL: {
    ID: 0,              // A  (AU-0001, ...)
    DATA: 1,             // B  (data da audiencia, informada pelo estagiario — nunca futura, ver RN-08)
    HORA: 2,             // C  (horario da audiencia — nao obrigatorio)
    ESTAGIARIO: 3,        // D  (nome do estagiario — sempre resolvido no servidor, nunca do payload)
    EMAIL: 4,             // E  (e-mail do estagiario logado — sempre resolvido no servidor, nunca do payload)
    TIPO: 5,              // F  (valor da picklist bd!X2:X)
    VARA: 6,              // G  (vara ou orgao julgador)
    PROCESSO: 7,          // H  (numero do processo)
    PARTES: 8,            // I  (partes ou assistido(a) — nao obrigatorio)
    OBS: 9,               // J  (texto livre — nao obrigatorio)
    STATUS: 10,           // K  ('Pendente' | 'Aprovada' | 'Reprovada')
    OBS_APROVACAO: 11,    // L  (motivo informado por Thales ao reprovar — obrigatorio ao reprovar)
    ALTERADO_EM: 12,      // M
    // O (14) NAO e mapeada: e coluna da planilha que este projeto nao conhece
    // nem escreve. Ao montar uma linha nova em criarAudienciaEstagiario, esse
    // indice e preenchido com string vazia para nao gerar array esparso
    // (setValues rejeita `undefined`).
    ESPECIE: 15,           // P  (picklist bd!AB2:AB — classificacao livre, distinta do TIPO/meta/limite)
    ID_MATRICULA: 16,     // Q  (ID da matricula de estagio — estagiarios!N)
    TURMA: 17,            // R  (codigo da turma, espelho legivel)
    SEMESTRE: 13          // N  (ESTATICO — gravado uma unica vez na criacao a partir do semestre do estagiario, nunca recalculado a partir de DATA, ver RN-02)
  },
  TOTAL_COLUNAS_AUDIENCIAS_ESTAGIARIO: 18, // A ate R

  PREFIXO_AUDIENCIA_ESTAGIARIO: 'AU-',

  // Prefixo do ID da matricula de estagio (estagiarios!N) — ver Turma.js.
  PREFIXO_MATRICULA_ESTAGIO: 'MAT-',

  // --- Execucao propria de diligencias (RN-EP, ver RN_Execucao_Propria.md) ---
  // Uma diligencia cumprida pelo proprio Thales (sem estagiario) e marcada por
  // uma linha gravada na NOTA da celula ADV (H) da aba diligencias — nunca no
  // VALOR da celula, que pertence a um script externo (ver Config.js, coluna
  // COL.ADV). A marcacao e lida/escrita por linha da nota (nunca por igualdade
  // da nota inteira), mesma tecnica de _lerRastreioCobranca/_marcarRastreioCobranca
  // (Mensagens.js) — ver leitor/gravador/removedor em Turma.js.
  EXEC_PROPRIA: {
    PREFIXO_NOTA: 'EXEC_PROPRIA'
  },

  // Aba criada e alimentada por MigracaoTurmaV2.js com os registros cuja
  // matricula nao pode ser resolvida com seguranca no backfill. Thales
  // preenche a coluna H (TURMA) e roda aplicarCorrecoesAmbiguos().
  SHEET_MIGRACAO_AMBIGUOS: '_migracao_ambiguos',

  STATUS_AUDIENCIA_ESTAGIARIO: {
    PENDENTE: 'Pendente',
    APROVADA: 'Aprovada',
    REPROVADA: 'Reprovada'
  },

  // Texto fixo definido por Thales (24/07/2026) — exibido no modal de
  // registro, na confirmacao de sucesso e como legenda da tabela do Painel
  // Aluno enquanto houver registro pendente (ver RN-13). O e-mail de destino
  // e sempre interpolado a partir de CONFIG.EMAIL_AUTORIZADO, nunca digitado
  // fixo no HTML.
  AVISO_COMPROVANTE_AUDIENCIA: 'Para que a audiência seja validada, é necessário enviar a ata ou a declaração de presença por e-mail para {EMAIL}. Enquanto o documento não for recebido e conferido, o registro permanecerá pendente.',

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
  // que compara hoje com DATA_FIM de cada estagiario (estagiarios!L), por
  // aluno. bd!P2 foi aposentado em 27/07/2026.
  //   DIAS_AVISO_PRODUCAO dias corridos antes de DATA_FIM -> Mensagem 4 (resumo de producao, e-mail)
  //   DIAS_AVISO_FLUXO    dias corridos antes de DATA_FIM -> Mensagem 5 (fluxo de encerramento, mural + e-mail)
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
  },

  // --- Mensagem 6: acompanhamento semanal (AcompanhamentoSemanal.js) ---
  // NOVO EM 02/08/2026. E-mail semanal, individual, com o quadro-resumo da
  // producao acumulada do estagiario e as tabelas detalhadas de cada bloco.
  // Todas as regras de negocio (RN-S01 a RN-S11) estao no cabecalho de
  // AcompanhamentoSemanal.js — este bloco guarda apenas os parametros.
  //
  // DIA_SEMANA e o nome da constante em ScriptApp.WeekDay ('MONDAY' ..
  // 'SUNDAY'), lido em configurarGatilhoAcompanhamentoSemanal(). Alterar aqui
  // e RODAR DE NOVO aquela funcao — mudar a constante sozinha nao remaneja um
  // gatilho ja instalado.
  //
  // HORA e a FAIXA de hora do Apps Script: 18 dispara entre 18:00 e 19:00.
  // Nao existe agendamento de horario exato na plataforma.
  ACOMPANHAMENTO_SEMANAL: {
    DIA_SEMANA: 'FRIDAY',
    HORA: 18,
    ASSUNTO: 'Acompanhamento semanal do seu estágio',
    ASSUNTO_CONSOLIDADO: 'Consolidado do acompanhamento semanal'
  },

  // --- Tabela de Producao (Producao.js / TabelaProducao.html) ---
  // Documento SEPARADO do Relatorio Final de Estagio (decisao de Thales,
  // 02/08/2026): e a tabela que o estagiario imprime periodicamente e leva
  // para o visto do supervisor, replicando o modelo em .docx fornecido
  // ("TABELA DE PRODUÇÃO"), em A4 paisagem.
  //
  // Regras de negocio fechadas com Thales em 02/08/2026:
  //  RN-P01 O recorte e SEMPRE a selecao corrente do Painel Aluno (filtro de
  //         turma + aluno em foco) — nunca a producao acumulada do estagio.
  //  RN-P02 Entram todos os registros EXCETO os de STATUS "Cancelada".
  //  RN-P03 Atendimentos presenciais (aba atendimentos) e Atendimentos Online
  //         (aba atendimentos_online, somente STATUS "Aprovado") ocupam a
  //         MESMA tabela, distinguidos pela coluna TIPO DE ATENDIMENTO.
  //  RN-P04 A coluna AÇÃO das pecas e a ESPECIE do registro (diligencias!L /
  //         iniciais!F), nunca o campo DILIGENCIA.
  //  RN-P05 Uma diligencia de ESPECIE de acordo (ver ESPECIES_ACORDO) entra
  //         SOMENTE na secao ACORDOS — nunca tambem em Peca Simples/Complexa.
  //         Sem essa regra o mesmo registro seria contado duas vezes.
  //  RN-P06 So sao impressas as linhas existentes: nao ha preenchimento ate
  //         uma quantidade fixa como no modelo .docx original.
  //  RN-P07 Secao sem nenhum registro e omitida por inteiro.
  //  RN-P08 As horas do titulo de cada secao vem de bd!S2:V2 (os MESMOS pesos
  //         do "Parcial de Horas" da aba Panorama — ver
  //         getPesosPontuacaoPanorama, Panorama.js), nunca fixas no codigo.
  //         ACORDOS nao tem celula propria e usa o peso de COMPLEXA.
  //  RN-P09 Nao ha totalizador de horas no rodape: so as tabelas e as
  //         OBSERVACOES.
  //  RN-P10 O estagiario so consegue imprimir nos DIAS_LIBERACAO dias corridos
  //         que antecedem a data de encerramento do estagio, e dali em diante
  //         indefinidamente (a conferencia na Secretaria acontece DEPOIS do
  //         termino). Antes disso o botao fica inativo, com a data de
  //         liberacao no tooltip. Quando o filtro corrente abrange mais de uma
  //         matricula (antecipado + regular no mesmo semestre), basta UMA
  //         delas estar liberada. Matricula cuja turma esteja sem DATA_FIM
  //         cadastrada NAO libera — a lacuna de cadastro precisa aparecer.
  //         Thales NUNCA e submetido a esta regra. A checagem existe em dois
  //         lugares de proposito: no botao (AlunoScripts.html) e dentro de
  //         montarDadosTabelaProducao (Producao.js) — sem a segunda, bastaria
  //         colar a URL ?pagina=producao no navegador para furar o bloqueio.
  PRODUCAO: {
    TITULO: 'TABELA DE PRODUÇÃO',

    // RN-P10 — dias corridos antes do fim do estagio em que a impressao e
    // liberada para o estagiario.
    //
    // Constante PROPRIA, deliberadamente separada de
    // CONFIG.ENCERRAMENTO_ESTAGIO.DIAS_AVISO_PRODUCAO (que hoje tambem vale
    // 15 e dispara a Mensagem 4). Sao decisoes independentes: mudar o momento
    // do e-mail de resumo nao pode arrastar junto o momento em que a tabela
    // fica imprimivel. Decisao de Thales, 02/08/2026.
    DIAS_LIBERACAO: 15,

    // Valores de ESPECIE (diligencias!L, picklist bd!D2:D) que classificam a
    // diligencia como ACORDO. Comparacao por chave normalizada (sem acento,
    // minuscula) — acrescentar aqui qualquer variacao que passe a existir na
    // picklist, nunca no meio do codigo.
    ESPECIES_ACORDO: ['ACORDO'],

    // Rotulo de cada secao e de qual peso de bd!S2:V2 ela tira as horas.
    // A chave `peso` casa com as chaves devolvidas por
    // getPesosPontuacaoPanorama() (Panorama.js).
    SECOES: {
      ATENDIMENTOS:    { rotulo: 'ATENDIMENTOS',    peso: 'atendimento' },
      SIMPLES:         { rotulo: 'PEÇA SIMPLES',    peso: 'simples' },
      COMPLEXA:        { rotulo: 'PEÇA COMPLEXA',   peso: 'complexa' },
      ACOMPANHAMENTOS: { rotulo: 'ACOMPANHAMENTOS', peso: 'acompanhamento' },
      ACORDOS:         { rotulo: 'ACORDOS',         peso: 'complexa' } // RN-P08
    },

    // Rotulos da coluna "TIPO DE ATENDIMENTO" (RN-P03).
    TIPO_ATENDIMENTO: {
      PRESENCIAL: 'Presencial',
      ONLINE: 'On line'
    },

    // OBSERVACOES do rodape, transcritas do modelo .docx (a numeracao e
    // gerada pela propria lista ordenada do HTML, por isso nao aparece aqui).
    OBSERVACOES: [
      'RELATÓRIO TEM QUE SER ENTREGUE 1 (UMA) SEMANA ANTES DO TÉRMINO DO ESTÁGIO.',
      'OS DIVÓRCIOS E ACORDOS DEVERÃO SER ASSINADOS E RUBRICADOS POR TODAS AS PARTES, ESTAGIÁRIOS E SUPERVISORES, SOB PENA DE NÃO SEREM PROTOCOLADOS OU ACEITOS.',
      'O Nº DOS ACORDOS DEVEM SER OBTIDOS NA SECRETARIA E FAZER CONSTAR NOS ACORDOS.',
      'A CADA CONCLUSÃO DAS TAREFAS APRESENTAR ESTA PRODUÇÃO PARA VISTO DO SUPERVISOR.',
      'A CADA 15 DIAS APRESENTAR ESTA TABELA AO SEU SUPERVISOR.'
    ]
  }
};