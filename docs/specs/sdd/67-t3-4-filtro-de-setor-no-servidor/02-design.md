# 02 — Design

**Verificado em:** `ddc5b2b` (develop, 2026-11-27) · **Comando:** `git rev-parse --short HEAD`

## 1. O que existe hoje (verificado)

| Peça | Onde | Observação |
|---|---|---|
| Regra de visibilidade de conversa | `supabase/baseline.sql:5522` (`fn_can_view_conversation(uuid, uuid)`) | Só existe no **SQL**, com **dois** argumentos até a T4b. Ordem: platform admin → papel ausente nega → `viewer`/`manager`/`admin` veem → dono vê → `visibility_mode` (`all`; `own_and_unassigned` = só sem dono; `own` = nega). Padrão `own_and_unassigned` |
| Regra de visibilidade de lead | `supabase/baseline.sql:5706` (`fn_can_view_lead`) | Mesma forma, pelo **dono do lead** |
| Papel efetivo no banco | `supabase/baseline.sql:18399` (`fn_user_role_in_org`), `:18360` (`fn_support_context`) | Sessão de suporte `full` vira `admin`, a de leitura vira `viewer`; o resto vem de `user_organizations` (`revoked_at is null`) |
| Papel efetivo no app | `lib/auth/require-role.ts:62-111` (`requireRole`) | Devolve `org.role` já efetivo (suporte `full` → `admin`, leitura → `viewer`) e o confirma por `rpc("fn_user_role_in_org")` |
| Modos de visibilidade | `lib/schemas/routing.ts:43` (`VISIBILITY_MODES = all, own_and_unassigned, own`) | Valor em `organizations.settings.visibility_mode` |
| Estrutura de setor (T4a) | `supabase/baseline.sql:23563` (`departments`), `:23579` (`department_members`), `:23595` (`conversations.department_id`, nulável) | `department_members` liga `(department_id, user_id)` com FK composta em `organization_id`. A T4a não troca nenhuma policy |
| **Helper de visibilidade em TypeScript** | **não existe** | A busca por `visibility_mode`, `fn_can_view_conversation` e variantes só acha schema, tela e comentário. `lib/auth/types.ts:147` diz que "a RLS é quem garante o escopo" |
| Rota que sabe que admin client ignora a regra | `app/api/v1/conversations/[id]/pause-ai/route.ts:70` | Comentário (`:69-71`): "Client do REQUEST, nunca admin: é a policy `conversations_select` que aplica o `visibility_mode`", e ler com service role deixaria um agent fora de escopo pausar o automático de uma conversa que ele nem enxerga. Hoje a defesa é **usar sessão**, não filtrar |
| Precedente de varredura de AST | `tests/unit/cron-audita-so-quando-ha-efeito.test.ts` | `ts.createSourceFile`, função de análise **exportada** e testada com fonte sintética, mais uma parte de **comportamento**. Recusa regex porque "a prosa deste repositório cita `audit(` e `if (` em comentário" |
| Precedente de lista que só encolhe | `tests/unit/branding.test.ts` | Allowlist; mensagem "Perdeu marca: a dívida encolheu — atualize (ou apague) a linha da lista" |
| Precedente de isenção com motivo escrito | `02-design.md` da #67, §2.1 (`expediente: { isenta: "<motivo>" }`) | Rota nova nasce barrada; esquecer de declarar nada abre nada |
| Separação regra pura × leitura | `lib/expediente/expediente.ts` × `lib/expediente/carregar.ts` | O padrão que esta spec reaproveita |

**Medido: a função SQL não serve para quem roda com `service_role`.** Num banco local, como `service_role` e sem claims:
`auth.uid()` é `NULL` e `fn_can_view_conversation(org, null)` e `fn_can_view_conversation(org, <uuid>)` devolvem **`false`
para os dois** (2026-11-27). Chamá-la com client admin não filtra: **apaga tudo**.

**Medido: o tamanho do alvo.** Conjunto protegido = as 20 tabelas do F6 (`02-design.md` da #67, §1) mais `conversations`,
`messages`, `ai_reply_drafts` e `conversation_assignment_events`. Contagem por arquivo de produção (fora de testes e de
`lib/database.types.ts`), **limite superior**, porque um arquivo pode ter sessão e admin juntos:

| O que se mede | Resultado |
|---|---|
| Arquivos que citam uma tabela protegida (string ou SQL), qualquer client | **253** |
| Arquivos com `.from("<tabela protegida>")` do supabase-js | **113** |
| …dos quais com client **admin** no arquivo (`createAdminClient` ou `createSupabaseAdminClient`) | **57** |
| …com sessão ou browser | **21** |
| …sem marca de client no arquivo (o client chega por **parâmetro**) | **35** |
| Arquivos com SQL em `pg` sobre tabela protegida | **44** |

Dos **57** com admin, por prefixo: `app/api/v1/cron/` **5**, `app/api/v1/webhooks/` **1**, `workers/` **5**,
`app/api/v1/admin/` **8** (platform admin), **rotas que servem uma pessoa** (resto de `app/api/v1/`) **21**, e **17** em
`lib/`, `app/actions/` e `app/app/` (helpers e Server Actions). **Consequência para a T3.5:** o inventário dela ("7 rotas e
helpers") foi medido por acesso a `conversations`; **por tabela protegida são até 21 rotas de pessoa com client admin**
(limite superior; classificação fina na implementação).

Para reproduzir (rode, não confie neste número):
```bash
T='conversations|messages|ai_reply_drafts|conversation_assignment_events|conversation_notes|agent_inbox_items|agent_case_events|agent_cases|lead_notes|contact_field_proposals|lead_checkpoints|followup_enrollments|demandas|demanda_conversas|calendar_appointments|ai_agent_runs|ai_invocations|ai_router_decisions|outbound_copies|lead_state|lead_state_transitions|event_log|job_queue|crm_lead_reactivations'
EXCL=(':!*.test.*' ':!*.spec.*' ':!lib/database.types.ts')
# 253: cita a tabela (string entre aspas, ou SQL), qualquer client — limite superior, com ruído
git grep -lIE "(['\"\`])($T)\1|\b(from|join|into|update)\s+(public\.)?($T)\b" -- app lib workers hooks components "${EXCL[@]}" | wc -l
# 113: acesso por supabase-js          | 57: dos quais com client admin
# (os 21 de sessão e os 35 sem marca saem de classificar os 113 − 57 pelo marcador createClient()/supabase/server)
git grep -lIE "\.from\(\s*['\"]($T)['\"]" -- app lib workers hooks components "${EXCL[@]}" | wc -l
git grep -lIE "\.from\(\s*['\"]($T)['\"]" -- app lib workers hooks components "${EXCL[@]}" | xargs grep -lE "createAdminClient|createSupabaseAdminClient" | wc -l
# 44: SQL em pg
git grep -lIE "\b(from|join|into|update)\s+(public\.)?($T)\b" -- app lib workers "${EXCL[@]}" | xargs grep -lE "pg\.Pool|from \"pg\"|from 'pg'|pool\.query|client\.query|db\.query" | wc -l
```

**NÃO VERIFICADO:**
- Que cada um dos 57 use o client **admin** para a tabela protegida (a contagem é por arquivo). A varredura resolve por
  **chamada**, e é ela que dá o número real.
- Quantos dos **35** com client por parâmetro acessam tabela protegida com um client admin vindo do chamador.
- A sintaxe e o desempenho do filtro PostgREST por **recurso embutido** (`conversations!inner`) a partir de cada tabela
  protegida. Sondar na implementação, antes de depender dela (R-5).
- **A chave do interruptor de setor.** A spec da #67 diz só que "o valor vive em `organizations.settings`" (Q-3).
- Que a sessão de suporte de leitura (papel `viewer` efetivo) deva seguir a regra de setor do `viewer` com o interruptor
  ligado. Assumido, por ser o papel efetivo; **é a Q-6**.

## 2. Decisão de design

**Uma regra normalizada, calculada uma vez, e três renderizações dela.** Decidir visibilidade tem três formas de uso, e as
três têm de dar o mesmo conjunto: um **predicado** sobre uma linha já lida, um **filtro PostgREST** para `supabase-js` e um
**fragmento SQL** para `pg`. Se cada forma reimplementasse a regra, elas divergiriam. Então o módulo faz dois passos: da
regra do ator ele deriva uma `RegraEfetiva` (dados puros), e cada renderizador só traduz essa estrutura.

### 2.1 O ator
- **`usuario`**: `userId`, `organizationId`, `papel` (o **efetivo**, vindo de `requireRole`, nunca recalculado aqui) e
  `setores` (os `department_id` de `department_members`).
- **`sistema`**: processo sem pessoa (cron, webhook, worker, ingestão, motor do agente), com **`motivo` obrigatório**. É
  a isenção declarada, no estilo `expediente: { isenta: "<motivo>" }`: o tipo exige o motivo e a varredura o lê.
- **`token`** (MCP): **reservado à T3.6**. Não existe nesta tarefa: o token não tem usuário nem setor
  (`02-design.md` da #67, §1, F1), e a spec que o trata ainda não existe.

### 2.2 A semântica (tabela de verdade)
Espelha `fn_can_view_conversation` de hoje (`supabase/baseline.sql:5522`) e o que a T4b decidiu para o setor (Q5, Q10,
decisão C; `02-design.md` da #67, §4.3). "Setor ligado" é o interruptor de §2.3.

| Ator | Setor desligado (**como o banco de hoje**) | Setor ligado |
|---|---|---|
| `sistema` com motivo | vê | vê |
| papel ausente | **não vê** | **não vê** |
| `manager`, `admin` | vê | vê |
| `viewer` | vê (hoje o banco o deixa ver tudo) | vê se `department_id` é **nulo** ou está em `setores` (Q10 e decisão C) |
| `agent` **dono** da conversa | vê | vê (o dono vem **antes** do setor, Q5) |
| `agent` não dono | `all`: vê · `own_and_unassigned`: vê só se **sem dono** · `own`: não vê | se `department_id` não é nulo **e** não está em `setores`: **não vê**; senão cai no `visibility_mode` da coluna ao lado |

Platform admin **não é um ator desta função**: a rota de pessoa o recebe como papel efetivo pela sessão de suporte, e as
rotas de plataforma estão isentas por categoria (§2.7).

### 2.3 O interruptor de setor
A spec da #67 pôs o "desligado por padrão" **dentro de `fn_can_view_conversation`**, com o valor em
`organizations.settings`, para um único `if` ligar tudo (§1, "Onde mora"). O espelho em TypeScript lê o **mesmo valor**
(`ContextoDaOrganizacao.setorLigado`), no **mesmo** carregamento de `visibility_mode`. O nome da chave **não está
decidido** (Q-3). Enquanto estiver desligado, a decisão é a do banco de hoje (RF-6), o que mantém a T3.4 sem efeito visível.

### 2.4 As três renderizações
- **Predicado:** `podeVerConversa(ator, ctx, { assignedToUserId, departmentId })`. Para decidir sobre linha já lida
  (por exemplo, um item único ou os destinatários de um push).
- **Filtro PostgREST:** para **listagem**, na consulta. Em `conversations`, vira filtro de colunas (`assigned_to_user_id`,
  `department_id`). Nas tabelas que herdam a visibilidade por `conversation_id`, vira filtro sobre o **recurso embutido**
  (`conversations!inner(...)`), que é o que a RLS faz com `exists`. **Proibido buscar os ids visíveis e fazer
  `.in("conversation_id", ids)`**: o conjunto de ids cresce com a organização e pode estourar o limite de URL do
  PostgREST (**não medido**; a proibição não depende disso, basta não escalar).
- **Fragmento SQL:** `{ sql, params }` para `WHERE` em consulta `pg`, com parâmetros posicionais (nunca interpolação).

Tabelas **sem** `conversation_id` (`lead_notes`, `lead_state`, `outbound_copies`…) não são decididas aqui: a regra delas
vem das tarefas T3.3 e T3.3b e das decisões P-B, P-C e P-E da T3.2. O módulo expõe o primitivo; **qual tabela usa qual
regra não é desta tarefa.**

### 2.5 Paginação (RF-3)
`meta.total` e `has_more` saem da **consulta já filtrada**. Filtrar linhas depois do `select` deixaria `total` contar
conversas que o ator não vê e faria a página vir "curta". Isso vale para todo consumidor: o contrato do módulo é entregar
filtro, não só predicado, para quem lista.

### 2.6 Falha fechada (RF-5)
Se a leitura do ator falhar, ou o papel não vier, `carregarAtor` **lança** e a rota responde erro; ela **não** cai para
"sem restrição". Um `catch` que devolva ator `sistema` por conveniência é o defeito que a varredura (§2.7) existe para pegar.

### 2.7 A varredura de AST (RF-8, RF-9)
Segue o precedente de `tests/unit/cron-audita-so-quando-ha-efeito.test.ts`: `typescript` (`ts.createSourceFile`), função
de análise **exportada**, testada com fonte sintética, e uma parte de comportamento. **Por chamada, não por arquivo.**

**O que reprova** (em `app/`, `lib/`, `workers/`, fora de teste): uma chamada `.from("<tabela protegida>")` cuja raiz resolve
para client admin (`createAdminClient()`, `createSupabaseAdminClient(...)` ou variável atribuída a eles no mesmo escopo),
e uma chamada `.query(...)` de `pg` cujo SQL (literal ou template) cita tabela protegida, **quando** nenhuma das três:
1. a consulta passa por um renderizador do módulo (o AST vê a chamada na cadeia, ou o fragmento na SQL);
2. o ator é declarado `sistema` com motivo no escopo;
3. o arquivo consta da **lista de exceções**.

**Client por parâmetro** (os 35): o AST local **não resolve**. Eles entram numa categoria própria, `indeterminado`, com o
chamador nomeado, e **só saem** quando a T3.5 classifica. Não são tratados como seguros.

**A lista de exceções não pode nascer vazia** (Q-2). A tarefa diz "nasce com a lista de exceções vazia e justificada, e só
encolhe", e a leitura literal é impossível: medido, **57 + 44** arquivos já cairiam. Proposta: ela nasce **completa e
justificada por categoria**, e as categorias dizem o que pode encolher:

| Categoria | O que é | Permanente? | Justificativa que o teste exige |
|---|---|---|---|
| `sistema` | cron, webhooks, workers, ingestão, motor do agente: **sem pessoa** | sim | "processo sem pessoa"; e o arquivo **não pode** chamar `requireRole`/`loadAuthUser` (se autentica pessoa, não é sistema) |
| `plataforma` | `app/api/v1/admin/**` (`requirePlatformAdmin`) | sim | a função SQL já devolve `true` para platform admin |
| `pessoa` | rota ou helper que **serve uma pessoa** com client admin | **não** (T3.5) | nome da tarefa que a migra |
| `mcp` | `lib/mcp/**` | **não** (T3.6) | `T3.6` |
| `indeterminado` | client por parâmetro | **não** | chamador a classificar |

`sistema` e `plataforma` entram **por glob de diretório**, para que uma rota de cron nova não exija editar a lista (e a
regra do `requireRole` acima impede esconder rota de pessoa ali). `pessoa`, `mcp` e `indeterminado` entram **por arquivo**
e **só podem diminuir**: o teste compara a contagem com um **teto gravado** e reprova tanto se ela passar dele quanto se
ela cair abaixo dele sem o teto ser reduzido (mesma mecânica da mensagem do `branding.test.ts`: a dívida encolheu,
atualize a lista). O teto só desce.

### 2.8 A paridade com o banco (RF-7)
Um invariante em `tests/invariants/` roda a **mesma matriz** pelos dois lados: o SQL com JWT de gente de verdade (papel
`authenticated` + `request.jwt.claims`, como `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts`) e a função
TypeScript. Eixos: papel × `visibility_mode` × dono × setor da conversa × pertence ao setor × interruptor. Os dois têm de
concordar em **toda** célula. Ele é escrito **vermelho primeiro** e é o que vigia a T4b: quando a função SQL ganhar o
terceiro argumento, a matriz é a prova de que o espelho a acompanhou.

### Alternativas recusadas
| Alternativa | Por que não |
|---|---|
| Chamar `fn_can_view_conversation` com o client admin | **Medido:** devolve `false` para tudo (`auth.uid()` nulo). Filtraria apagando |
| Rodar a consulta como o usuário (`set local role authenticated` + claims, dentro de transação `pg`) | Não alcança tabela **já revogada** de `authenticated` (migrations `0241` e `0242`), nem o ator `sistema` ou `token`. Serviria a uma parte e deixaria dois mecanismos |
| Filtrar as linhas em TypeScript depois do `select` | Vaza `total` e `has_more`, e a página vem curta (§2.5) |
| Reimplementar a regra três vezes (predicado, PostgREST, SQL) | Divergem. Por isso a `RegraEfetiva` única |
| Função SQL com **usuário explícito** (`fn_..._for(p_user, …)`), chamada por `rpc` com `service_role` | **Viável e mais DIRC** (uma fonte só, no banco). Exige migration, que esta tarefa não tem (não é 🔒), e um *round trip* por decisão. **É a Q-1**; recomendação em `05-revisao.md` |
| Varredura por `grep` ou regex | Acusa o texto que descreve a regra (precedente do `cron-audita-…`) |
| Lista de exceções vazia no nascimento | Impossível, medido (§2.7) |

## 3. Contratos
Os **nomes são proposta**; os arquivos são **a criar**.

```ts
// lib/visibilidade/regra.ts — PURO: sem banco, sem client, sem DOM
export type ModoDeVisibilidade = "all" | "own_and_unassigned" | "own";

export type AtorDeVisibilidade =
  | { tipo: "usuario"; userId: string; organizationId: string; papel: Role | null; setores: readonly string[] }
  | { tipo: "sistema"; motivo: string };                 // motivo obrigatório; "token" fica para a T3.6

export interface ContextoDaOrganizacao { modo: ModoDeVisibilidade; setorLigado: boolean }

export interface ConversaParaDecidir { assignedToUserId: string | null; departmentId: string | null }

export function podeVerConversa(ator: AtorDeVisibilidade, ctx: ContextoDaOrganizacao, c: ConversaParaDecidir): boolean;

// A regra normalizada: dados puros, que os renderizadores traduzem.
export type RegraEfetiva =
  | { tipo: "tudo" }
  | { tipo: "nada" }
  | { tipo: "filtrada"; donoId: string | null; semDono: boolean; todosSemSetor: boolean; setores: readonly string[] | null };
export function regraEfetiva(ator: AtorDeVisibilidade, ctx: ContextoDaOrganizacao): RegraEfetiva;

// lib/visibilidade/filtros.ts — PURO
export function filtroPostgrest(regra: RegraEfetiva, alvo: { assigned: string; department: string }): string | null; // null = sem filtro; "nada" = ver abaixo
export function fragmentoSql(regra: RegraEfetiva, alvo: { assigned: string; department: string }, primeiroParam: number): { sql: string; params: unknown[] };

// lib/visibilidade/carregar.ts — LEITURA; o client chega por PARÂMETRO (o módulo não importa client admin)
export async function carregarContexto(db: SupabaseClientLike, organizationId: string): Promise<ContextoDaOrganizacao>;
export async function carregarAtor(db: SupabaseClientLike, i: { organizationId: string; userId: string; papel: Role }): Promise<AtorDeVisibilidade>;
export async function carregarAtores(db: SupabaseClientLike, organizationId: string, userIds: readonly string[]): Promise<Map<string, AtorDeVisibilidade>>;
```
Regra "nada": o filtro devolve um filtro **impossível** (nunca `null`), para que "nada" nunca seja lido como "sem filtro".
Item único invisível responde **404**, como a RLS (linha invisível não existe), e não 403.

## 4. Dados
**Nenhuma mudança de schema, RLS, API ou tela.** O carregador **lê** `user_organizations`, `department_members` e
`organizations.settings`. Se a **Q-1** for decidida pela função SQL com usuário explícito, ela é uma migration à parte
(tripla: arquivo, apêndice no `baseline.sql`, `MANIFEST`, `revoke` das duas origens de `EXECUTE`), na T4b ou antes, e
**não** é desta tarefa.

## 5. Rastreabilidade
| Requisito | Onde é atendido |
|---|---|
| RF-1, RF-6 | §2.2, §2.3, §3 (`podeVerConversa`, `regraEfetiva`) |
| RF-2 | §2.4, §3 (`filtroPostgrest`, `fragmentoSql`) |
| RF-3 | §2.5, §2.4 |
| RF-4 | §2.1 |
| RF-5 | §2.6 |
| RF-7 | §2.8 |
| RF-8, RF-9 | §2.7 |
| RNF-1 | §3 (`carregarAtores` em lote) |
| RNF-2 | §3 (regra e filtros puros; carregador recebe o client) |

## 6. Living System Checklist
(`docs/doctrine/sistema-vivo.md`) — cada resposta nomeia o artefato concreto.
- **Entrada e saída:** entrada = o ator (de `requireRole` em `lib/auth/require-role.ts` + `carregarAtor`) e a conversa ou
  a consulta; saída = boolean, filtro PostgREST ou fragmento SQL. **Consumidor real:** nesta tarefa são os dois testes
  (paridade e varredura). **O primeiro consumidor de produção é a T3.5.** Peça sem chamador de produção entre os dois PRs é o
  anti-pattern 3 do `CLAUDE.md`; o risco R-4 o declara e a ordem de PRs o limita.
- **Emite atividade/log:** não. É uma função de decisão. A negação é invisível por desenho (linha ausente, ou 404).
- **Aparece na tela:** não nesta tarefa. O efeito aparece na T3.5, quando uma rota passa a omitir conversa de outro setor.
- **Porta na navegação (`lib/navigation/registry.ts`):** não se aplica (não cria tela).
- **Mecanismo anti-morte:** a **varredura de AST** (§2.7): rota admin nova que leia conversa sem a função reprova no CI.
- **Laço de retorno (o que muda quando ela erra):** falha **fechada** (§2.6): lista vazia, que o operador percebe e reporta,
  e nunca vazamento silencioso. Se o espelho divergir do banco, o invariante de paridade (§2.8) fica vermelho.
- **Mapa vivo (`docs/architecture/`):** o nó "visibilidade no servidor" entra no PR de código, com arestas para
  `requireRole`, `department_members`, `fn_can_view_conversation` e a varredura (≥2 arestas, DoD 13).

## 7. Riscos
| # | Risco | Mitigação |
|---|---|---|
| R-1 | O espelho TypeScript diverge do SQL | Invariante de paridade (§2.8), vermelho primeiro; alternativa Q-1 |
| R-2 | A varredura deixa passar (client por parâmetro, nome de tabela dinâmico) | Categoria `indeterminado` explícita; tabela buscada por string em qualquer posição (a lição do ponto cego da T3.0); a lista só encolhe |
| R-3 | A varredura gera ruído e é desligada na primeira semana | Isenção por glob para `sistema` e `plataforma`; `pessoa`, `mcp` e `indeterminado` por arquivo |
| R-4 | A função fica sem chamador até a T3.5 | Ordem de PRs: T3.5 logo depois; o invariante e a varredura já são consumidores |
| R-5 | O filtro PostgREST por recurso embutido não se comporta como a RLS (sintaxe, ou desempenho com volume) | Sonda descartável **antes** de depender dele; sem isso a renderização de PostgREST não é entregue (só predicado e SQL) |
| R-6 | A T3.5 muda o que um `agent` em modo `own` vê nas rotas admin (hoje elas devolvem tudo) | É a correção pretendida, **não** é desta tarefa; a T3.5 declara o efeito num fragmento de `.changes/` |
| R-7 | Esconder rota de pessoa na categoria `sistema` | O teste exige que arquivo `sistema` **não** chame `requireRole`/`loadAuthUser` |
