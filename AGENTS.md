# AGENTS.md — Painel de Thales

> Guia para agentes de IA que forem trabalhar neste projeto.
> Última atualização: análise do repositório local em 28/07/2026.

---

## 1. Visão geral do projeto

Este é um projeto **Google Apps Script** (plataforma serverless da Google) que gerencia o fluxo de trabalho do escritório de prática jurídica da Escola CEST, coordenado por Thales.

O sistema expõe **duas páginas Web** dentro de um único deployment:

- **Painel de Thales** (`/`): uso individual do coordenador. Permite cadastrar diligências, distribuir atividades, acompanhar prazos, aprovar atendimentos online/audiências de estagiários, publicar pautas de audiências e executar utilitários.
- **Painel Aluno** (`?pagina=aluno`): uso coletivo dos estagiários cadastrados. Permite criar petições iniciais, registrar atendimentos online e registrar audiências (todas sujeitas à aprovação de Thales).

A base de dados é uma **planilha Google Sheets** vinculada ao script. O sistema também se integra com **Google Classroom**, **Google Drive**, **Gmail**, **Google Forms** e **Google Docs**.

O código-fonte local é versionado com `git` e sincronizado com a Google via **clasp** (`@google/clasp`).

---

## 2. Tecnologia e arquitetura

### Stack

- **Runtime**: Google Apps Script, motor **V8** (ECMAScript moderno, mas sem módulos ES6).
- **Linguagem**: JavaScript (`.js`/`gs`). Todos os arquivos `.js` são, na prática, scripts do Apps Script.
- **Frontend**: HTML5 + CSS + JavaScript puro (sem frameworks). Templates HTML são renderizados pelo `HtmlService` do Apps Script.
- **Banco de dados**: abas do Google Sheets associada ao script (`SpreadsheetApp.getActiveSpreadsheet()`).
- **Ferramenta de deploy/local-dev**: `clasp` (arquivo `.clasp.json` na raiz).
- **SCM**: Git.

### Arquitetura geral

- **Server-side**: funções JavaScript globais, divididas em arquivos por responsabilidade (ver seção 3). Não há imports/exports; no Apps Script V8 todas as funções top-level ficam disponíveis globalmente.
- **Client-side**: os arquivos `thales.html` e `PainelAluno.html` são os templates principais. Eles incluem fragmentos via `<?!= include('Scripts') ?>` e `<?!= include('Styles') ?>`. A lógica de UI vive em:
  - `Scripts.html` / `AlunoScripts.html` (JavaScript do Painel de Thales e do Painel Aluno, respectivamente).
  - `Styles.html` (CSS compartilhado).
- **Comunicação cliente-servidor**: `google.script.run` (API do Apps Script). O servidor expõe funções bem definidas em `Code.js` que servem como controllers.
- **Autenticação**: baseada no e-mail do usuário logado (`Session.getActiveUser().getEmail()`), validado contra configurações em `CONFIG` (`Auth.js`).

### Arquivos de configuração importantes

| Arquivo | Propósito |
|---------|-----------|
| `.clasp.json` | Configuração do clasp: `scriptId` do projeto na Google, extensões reconhecidas (`.js`, `.gs`, `.html`, `.json`) e diretório raiz. |
| `appsscript.json` | Manifesto do Apps Script: fuso horário (`America/Fortaleza`), runtime V8, escopos OAuth, serviço avançado do Classroom e configuração do web app (`executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`). |
| `Config.js` | **Constantes centrais de negócio**: e-mails autorizados, nomes de abas, índices de colunas, regras de status, textos fixos, parâmetros do Classroom, etc. Qualquer valor usado por mais de um script deve ficar aqui. |

### Escopos OAuth solicitados (em `appsscript.json`)

Incluem `spreadsheets`, `drive`, `classroom.*`, `forms`, `script.*`, `send_mail`, `documents`, `userinfo.email` e `script.external_request`. Não remova escopos sem entender o impacto nas APIs usadas.

---

## 3. Organização dos arquivos (módulos)

A regra de ouro é: **um arquivo = uma responsabilidade**. Cada arquivo `.js` começa com um cabeçalho de comentário explicando seu escopo.

### Backend (scripts `.js`)

| Arquivo | Responsabilidade |
|---------|------------------|
| `Code.js` | Ponto de entrada (`doGet`) e **controllers** expostos ao frontend via `google.script.run`. Todas as funções chamadas pelo client-side devem passar por aqui. |
| `Auth.js` | Validação de acesso das duas páginas (`validarAcesso`, `validarAcessoAluno`). Único lugar que deve verificar e-mail/autorização. |
| `Config.js` | Constantes globais (`CONFIG`). Nunca duplique valores que já existam aqui. |
| `Data.js` | Leitura/escrita da aba `diligencias` e funções utilitárias compartilhadas (`normalizarChave`, `calcularSubespecie`, `calcularSemestre`, etc.). |
| `Classroom.js` | Toda a comunicação com a API do Google Classroom (criação de atividades, verificação de entregas, notas, tópicos, mural). |
| `Drive.js` | Organização de PDFs de processos e acompanhamentos no Google Drive (criar/mover/renomear pastas). |
| `Mensagens.js` | Envio de mensagens automáticas no mural do Classroom e por e-mail (cobranças, transferências, encerramento de estágio). |
| `Iniciais.js` | Leitura/escrita da aba `iniciais` e cruzamento diário com a aba `protocolos`. |
| `Acompanhamentos.js` | Leitura/escrita da aba `acompanhamentos`. |
| `AtendimentoOnline.js` | CRUD e aprovação de atendimentos online (aba `atendimentos_online`). |
| `AudienciasEstagiario.js` | CRUD e aprovação de audiências registradas pelos estagiários (aba `audiencias_estagiario`). |
| `Audiencias.js` | Leitura somente da aba `audiencias` (pauta do escritório). |
| `Distribuicao.js` | Lógica da aba "Distribuição" (distribuição de atividades para estagiários). |
| `Panorama.js` | Agregação de dados para a aba "Panorama" (produção por estagiário). |
| `Graficos.js` | Dados para gráficos (embora a aba "Gráficos" tenha sido removida, parte da lógica pode permanecer). |
| `Agenda.js` | Cálculos de prazos, dias úteis e gatilhos visuais de proximidade de deadline. |
| `Utilitarios.js` | Funções utilitárias acionadas manualmente (preencher semestre, preencher DF final, calcular dia útil, organizar/arquivar pastas, enviar para secretaria). |
| `Secretaria.js` | Envio de registros para a planilha da secretaria. |
| `Geralsync.js` | Sincronização de registros pendentes com a planilha GERAL. |
| `Icones.js` | Gerenciamento centralizado de ícones da UI. |
| `MigracaoClassroom.js` | Scripts de migração/backfill de dados do Classroom. |
| `MigracaoExecucaoPropria.js` | Backfill único (RN-EP-10) que marca diligências sem estagiário já em status final como execução própria do supervisor. |
| `provisorio.js` | Scripts temporários/utilitários de manutenção. |
| `Aluno.js` | Lógica específica do Painel Aluno no servidor. |
| `Código.js` | Arquivo reserva/legado (apenas 29 bytes). |

### Frontend (HTML)

| Arquivo | Responsabilidade |
|---------|------------------|
| `thales.html` | Template principal do Painel de Thales. |
| `PainelAluno.html` | Template principal do Painel Aluno. |
| `Scripts.html` | JavaScript do Painel de Thales (incluído em `thales.html`). |
| `AlunoScripts.html` | JavaScript do Painel Aluno (incluído em `PainelAluno.html`). |
| `Styles.html` | CSS compartilhado entre as duas páginas. |

---

## 4. Modelo de dados (planilha)

A planilha vinculada contém várias abas. Os nomes e colunas estão detalhados em `Config.js`. Resumo das principais:

- **`diligencias`**: atividades principais do escritório (A:X).
- **`estagiarios`**: cadastro de estagiários (A:H).
- **`bd`**: picklists, parâmetros e IDs de configuração (A:Z+).
- **`iniciais`**: petições iniciais criadas pelos estagiários (A:P).
- **`protocolos`**: dados de protocolo usados para cruzar com `iniciais` (A:E).
- **`acompanhamentos`**: acompanhamentos processuais (A:N).
- **`atendimentos_online`**: atendimentos online pendentes de aprovação (A:L).
- **`audiencias_estagiario`**: audiências registradas pelos estagiários (A:N).
- **`audiencias`**: pauta de audiências do escritório (A:J), somente leitura.
- **`atendimentos`**: atendimentos presenciais (A:J), usados pelo Panorama.
- **`secretaria`**: destino de registros enviados para a secretaria.

> **Importante**: a documentação completa de cada aba e coluna está no cabeçalho de `Config.js` (linhas 7–106). Leia esse cabeçalho antes de alterar qualquer índice de coluna ou regra de negócio.

---

## 5. Comandos de build e deploy

Não há build formal (compilação/bundler). O fluxo de trabalho é:

```bash
# Fazer push de todos os arquivos locais para o projeto Apps Script
clasp push

# Abrir o editor online do Apps Script
clasp open

# Abrir o web app (último deployment)
clasp open --webapp

# Criar/gerenciar deployments
clasp deploy
clasp deployments
```

### Gatilhos (triggers) automáticos

Vários gatilhos instaláveis devem ser criados **manualmente** na primeira implantação/infraestrutura, executando as funções abaixo no editor Apps Script (ou via `clasp run`, se configurado):

| Função de configuração | Gatilho criado | Frequência |
|------------------------|----------------|------------|
| `configurarGatilhoVerificacaoAutomatica()` (Classroom.js) | `verificarEntregasAutomatico` | A cada 30 minutos, dentro do horário comercial (08h–18h) |
| `configurarGatilhoPautaSemanalAudiencias()` (Classroom.js) | `publicarPautaSemanalAutomatico` | Segundas-feiras, 08h00 |
| `configurarGatilhoVerificacaoProtocolos()` (Iniciais.js) | `verificarProtocolosIniciaisAutomatico` | Diariamente, 08h00 |
| `configurarGatilhoCobrancas()` (Mensagens.js) | `verificarCobrancasAutomatico` | Diariamente, 08h00 |
| `configurarGatilhoEncerramentoEstagio()` (Mensagens.js) | `verificarEncerramentoEstagioAutomatico` | Diariamente, 08h00 |
| `configurarGatilhoPreencherSemestre()` (Utilitarios.js) | `preencherSemestreAutomatico` | A cada 30 minutos |
| `configurarGatilhoSincronizacaoGeral()` (Geralsync.js) | `sincronizarPendentesParaGeral` | A cada 30 minutos |

> Atenção: essas funções de configuração normalmente **apagam gatilhos antigos duplicados** do mesmo handler antes de criar um novo. Execute-as apenas quando necessário.

---

## 6. Estilo de código e convenções

### Idioma

- **Comentários e nomes de arquivos**: em português (padrão do projeto). Exceção: identificadores técnicos do Apps Script (`SpreadsheetApp`, `HtmlService`, etc.) e constantes em inglês quando fizerem sentido (`CONFIG`, `CLASSROOM`).
- **Nomes de funções/variáveis**: `camelCase` em português. Exemplos: `carregarDadosIniciais`, `calcularSubespecie`, `abaDiligencias`.

### Sintaxe e runtime

- O Apps Script V8 aceita `let`/`const`, arrow functions, template strings etc., mas **o projeto ainda usa amplamente `var` e funções tradicionais**. Ao alterar código existente, mantenha o estilo ao redor. Novas funções podem usar `var` para consistência.
- **Não use módulos ES6** (`import`/`export`). O Apps Script não os suporta nativamente; todas as funções top-level são globais.
- **Não use `console.log` diretamente** para logs de produção. Use `Logger.log` ou o Stackdriver (`console.log` funciona no V8, mas `Logger.log` é o padrão histórico do projeto).

### Organização

- Todo arquivo começa com um comentário de cabeçalho indicando a responsabilidade.
- Não duplique constantes de negócio: coloque em `Config.js`.
- Não acesse APIs do Classroom fora de `Classroom.js`, nem valide e-mail fora de `Auth.js`, nem organize arquivos no Drive fora de `Drive.js`.
- Funções que retornam ao frontend (`google.script.run`) devem sempre retornar objetos com `sucesso: true/false` e `erro`/`mensagem`, envolvidas em `try/catch`.

### Manipulação de datas

- `google.script.run` **não serializa objetos `Date`**. Sempre converta datas para strings (ex.: `formatarData`, `formatarDataHora`) antes de devolver ao cliente.
- O fuso horário do script e da planilha é `America/Fortaleza`.

### Manipulação de identidade do usuário

- No Painel Aluno, **nunca confie no `emailAluno` vindo do payload** para identificar um estagiário logado. Sempre use `Session.getActiveUser().getEmail()` e, para Thales, valide o e-mail selecionado contra a aba `estagiarios`. Essa regra está documentada em `Code.js` (`acaoCriarPedidoInicial`, `acaoCriarAtendimentoOnline`, etc.).

---

## 7. Testes

Não há framework de testes automatizado configurado (nenhum `package.json`, `jest.config`, `pytest`, etc.).

### Como testar alterações

1. **Push local**: `clasp push`.
2. **Testar no editor**: `clasp open` e usar a função de execução para rodar funções server-side sem UI.
3. **Testar a UI**: `clasp open --webapp` e navegar pelas duas páginas (`/` e `?pagina=aluno`).
4. **Validar gatilhos**: execute as funções `configurarGatilho*` manualmente e verifique em **Triggers** do editor se apareceram corretamente.
5. **Validar integrações**: crie/atualize registros em uma cópia da planilha (ou em horário de baixo uso) e verifique se:
   - As colunas `CLASS`, `DI_CLASS`, `DF_CLASS` são preenchidas ao enviar ao Classroom.
   - Os e-mails/murais são enviados corretamente.
   - Os PDFs são movidos no Drive.

> **Recomendação**: para alterações de grande impacto, teste primeiro em uma cópia do projeto/script e da planilha, usando um `scriptId` alternativo no `.clasp.json` de teste.

---

## 8. Considerações de segurança

- **Web app anônimo, mas servidor valida tudo**: em `appsscript.json` o web app roda como `USER_DEPLOYING` e permite `ANYONE_ANONYMOUS`. Isso significa que qualquer pessoa pode abrir a URL, mas o servidor rejeita acessos não autorizados em `Auth.js`.
- **Escopos amplos**: o script possui permissões para ler/escrever planilhas, Drive, Classroom, enviar e-mail, etc. Nunca exponha o `scriptId` nem tokens de autenticação.
- **Não versione credenciais**: o único arquivo sensível presente é `.clasp.json`, que contém o `scriptId`. Ele já está versionado no repositório (é necessário para o clasp). Não adicione chaves de API, senhas ou `.env` reais ao projeto.
- **Validação server-side**: toda ação importante (salvar, aprovar, enviar ao Classroom, criar registros) deve passar por `validarAcesso()` ou `validarAcessoAluno()` e só então executar a lógica.
- **E-mail ativo**: o Apps Script identifica o usuário por `Session.getActiveUser()`. Em web apps `ANYONE_ANONYMOUS`, o e-mail ativo é do usuário que abriu a página e concedeu permissão — nunca do deployer. Isso é usado a favor da segurança (`Auth.js`).

---

## 9. Dicas para agentes

- Antes de alterar regras de negócio, leia o cabeçalho de `Config.js` — ele descreve as abas, colunas e regras de status com muito detalhe.
- Se precisar adicionar uma nova aba ou coluna, atualize `Config.js` primeiro e depois os scripts que a usam.
- Se precisar de uma nova função acessível pelo frontend, crie-a em `Code.js` seguindo o padrão `try { validarAcesso(); ... } catch (e) { return { sucesso: false, erro: ... } }`.
- Se a alteração envolver Classroom, teste com uma turma/teste ou fora do horário de produção para evitar spam de notificações aos alunos.
- Mantenha os comentários em português e o tom técnico/direto usado pelo projeto.
