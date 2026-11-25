# 02 — Design

**Verificado em:** `eb8bd68` (re-conferido em 2026-11-17) · **Comando:** `git rev-parse --short HEAD`
**Natureza:** proposta. Nada aqui foi implementado. O §4 é a **proposta de schema** que a issue exige
antes de qualquer migration.
**Decisões:** Q1 a Q9 e N1 a N4 estão **confirmadas pelo dono do produto** (comentários de 2026-11-13
e 2026-11-17 na #67) e este documento já as reflete — registro em `05-revisao.md`. O schema (§4) foi
**aprovado em 2026-11-17** depois de seis ajustes e de uma segunda rodada de nove itens, todos incorporados aqui
(registro em `05-revisao.md`).

## 1. O que existe hoje (verificado lendo cada arquivo)

| Peça | Onde | O que faz / o que NÃO faz |
|---|---|---|
| Horário do **agente de IA** | `lib/agent-engine/agent/janela-de-atendimento.ts` | Lê `trigger_config.filters.business_hours` da versão publicada; adia o turno da IA para a abertura. Falha **aberta** (config torta = sem janela). **Não** toca atendente humano |
| Horário **por atendente** | tabela `attendant_availability` (`schedule jsonb`), `lib/routing/eligibility.ts`, `lib/schemas/routing.ts` | `availabilityScheduleSchema` = `{timezone, windows:[{dow,start,end}]}`; `windows` vazio = 24/7. `isWithinSchedule` e `localMoment` já resolvem fuso e dia da semana. Só decide **elegibilidade para receber distribuição**; **não bloqueia** nada |
| Validação de fuso | `lib/tempo/fusos.ts` (`fusoValido`, `FUSO_PADRAO`) | `Intl` lança `RangeError` em fuso inexistente; a validação é obrigatória no Zod |
| Visibilidade por dono | `fn_can_view_conversation(p_org, p_assigned_to_user_id)` no `supabase/baseline.sql` (migration 0035) | `security definer`, `stable`. `viewer/manager/admin` e platform admin veem tudo; `agent` vê as próprias e, conforme `organizations.settings->>'visibility_mode'` (`all` / `own_and_unassigned` default / `own`), as sem dono. **Não conhece setor** |
| Policy de leitura | `conversations_select` usa a função acima; `messages_select` herda via `exists (select 1 from conversations …)` | Mudar a função de conversas muda mensagens de graça |
| Escrita | `conversations_agent_insert/update/delete` e `messages_insert/update/delete`: `agent+` da org | **Medido num banco com a `baseline.sql` (agente de teste, `visibility_mode` padrão, conversa atribuída a outro usuário):** `SELECT` devolve 0 linhas; `UPDATE`/`DELETE … WHERE id=…` e `UPDATE` por filtro de coluna alteram **0 linhas** (com `WHERE` que referencia colunas, o Postgres aplica também a policy de SELECT); mas `INSERT` em `messages` dessa conversa **passa** (`INSERT 0 1`), porque `messages_insert` só confere a organização. Não testado: `UPDATE` sem nenhum `WHERE` (depende de o PostgREST recusar), e a troca de `assigned_to_user_id`/`department_id` pelo `WITH CHECK` atual. Ingestão e envio usam `service_role` e bypassam RLS |
| Chamadores de `fn_can_view_conversation(uuid, uuid)` | `supabase/baseline.sql` (consulta ao catálogo e `grep`) | **5**: a policy `conversations_select`; `fn_appointment_stamp` (2 pontos); `fn_meet_action`; a policy `tenant_isolation_ai_reply_drafts_all`; `fn_reply_action`. Qualquer um que ficasse na assinatura antiga ignoraria o setor. Comando para reconferir: `grep -n "fn_can_view_conversation" supabase/baseline.sql` |
| Realtime | `REPLICA IDENTITY` de `conversations` e `messages` | **`DEFAULT`** (medido em `pg_class.relreplident`): um evento `DELETE` carrega só a chave primária, não a linha. O vazamento possível pelo `DELETE` é de **ids**, não de conteúdo |
| Transferência | `fn_conversation_assign` | `security definer` (forward-fix G4-01): o `returning` re-aplicaria a policy de SELECT à linha nova, invisível ao autor |
| Config da organização | `organizations.settings` (jsonb) com `routing`, `visibility_mode` (irmão, lido pela RLS), `security.mfa_required`, `branding` | Schemas Zod em `lib/schemas/routing.ts`. Aninhar `visibility_mode` quebraria a RLS em silêncio |
| Gate de rota | `requireRole(min, opts)` em `lib/auth/require-role.ts` | Server-side, por rota. Já audita `authz.denied`. Ex.: `app/api/v1/conversations/[id]/claim/route.ts` chama `requireRole("agent")`. **Não recebe a requisição**: `opts` tem `requestId`, `resource`, `allowPlatformAdmin` e `organizationId`, então ele **não conhece o método HTTP** (relevante para o fail-closed, §2.1) |
| Superfície de escrita | `app/api/v1/**/route.ts` (contagem em `eb8bd68`) | **165** rotas com método de escrita; só **15** em `conversations/**`. Fora dela, **34** exigem apenas `agent` (entre outras: `messages`, `leads/*`, `contacts`, `tasks`, `agenda/*`, `ai/cases/[id]/reply`, `ai/replies/[id]`, `ai/inbox/*`, `demandas/[id]`, `attendants/availability/[user_id]`). Comando: `grep -rlE "export (async )?function (POST\|PATCH\|PUT\|DELETE)" app/api/v1 --include=route.ts \| wc -l` |
| Gate de requisição | `proxy.ts` (Next 16; **não** existe `middleware.ts`) | Só autenticação, cookie de impersonação e `/admin`. O comentário do arquivo diz que roda no Edge sem acesso ao banco |
| Tela de atendimento | `app/app/settings/atendimento` | Configurações › Atendimento: modo de roteamento e `visibility_mode`. **Sem setor** |
| Roteamento por canal | `channel_routing_policies` + `channel_routing_responsibles` (`lib/routing/channel-policies.ts`) | Quem responde por **cada número** (canal). Não é setor |

**Não existe:** tabela de departamentos; vínculo operador↔setor; `department_id` em `conversations`;
expediente da organização; rota ou tela `/app/fora-de-expediente`; erro `OUT_OF_WORK_HOURS`.

**NÃO VERIFICADO** (medir antes de implementar — viram a tarefa T0):
- Se `loadAuthUser()` já carrega `organizations.settings` (decide se o gate custa uma consulta a mais
  por requisição ou zero).
- Se o app usa canais Realtime de **broadcast** para conversas (não passam por RLS) ou só
  `postgres_changes` (passam). Comando: `grep -rn "broadcast" hooks lib --include=*.ts` — **já há
  ocorrências** em `hooks/realtime/useRealtimeChannel.ts`, `hooks/useAlertsRealtime.ts`,
  `hooks/useTenantHealth.ts`, `lib/ai/handoff/orchestrator.ts` e `lib/mcp/tools/handoff.ts`; a T0
  diz se alguma carrega dado de conversa.
- **Realtime (condição 6 da aprovação), comportamento esperado a medir com 2 usuários:**
  (i) um `UPDATE` em que a linha **sai** do escopo do usuário (conversa transferida para setor alheio)
  **não** gera evento para quem perdeu o acesso, então a lista dele fica obsoleta até recarregar;
  (ii) um `DELETE` **não passa pela RLS** e, com `REPLICA IDENTITY DEFAULT`, só leva o id — **mas a
  premissa original ("o `postgres_changes` entrega a todos os assinantes da organização") estava
  errada para o app**: medido na T0(c), com o filtro `organization_id=eq.<org>` que o app usa o
  `DELETE` **não chegou a ninguém**; sem filtro chegou a todos, só com o id (detalhe em "MEDIDO", abaixo).
  A mitigação desenhada é o refetch
  que a lista já faz ao voltar o foco da janela; a T0 mede e a T8 prova com **transferência entre
  setores em dois navegadores**.
  **MEDIDO em 2026-11-19 (T0(c) e T0(b)).** Sonda descartável, **não commitada**, contra o Supabase
  local (`realtime:v2.147.1`, `postgres:15.19.0.007`, baseline aplicada), na organização do e2e com
  `visibility_mode = own_and_unassigned`; 3 sessões reais (`agent` A, `agent` B criado só para a
  sonda e removido ao fim, `manager`) assinando `postgres_changes` de `conversations` **com o filtro
  que o app usa** (`organization_id=eq.<org>`, `hooks/inbox/useConversationsRealtime.ts`); as escritas
  vieram por service role. **A conversa mudou de dono (`assigned_to_user_id`) no lugar de mudar de
  setor**, porque a RLS de setor ainda não existe: o mecanismo (a RLS avaliada por assinante) é o mesmo,
  mas **a T8 tem de provar com setores de verdade, em dois navegadores**. 3 execuções (R1 e R2 com o
  filtro do app; R3 sem filtro).

  | Caso | `agent` A (dono) | `agent` B | `manager` | Execuções |
  |---|---|---|---|---|
  | `INSERT` atribuída ao A | 1 evento em **2 de 3** (**0 em R1**) | 0 | 1 | R1–R3 |
  | `UPDATE` que não muda o escopo | 1 | 0 | 1 | R1–R3 |
  | **Transferência A→B** (a linha **sai** do escopo do A e **entra** no do B) | **nenhum evento** | `UPDATE` | `UPDATE` | R1–R3 |
  | `SELECT` depois da transferência | **0 linhas** | 1 linha | — | R1–R3 |
  | `UPDATE` depois, em conversa que o A já perdeu | 0 | 1 | 1 | R1–R3 |
  | **`DELETE`, com o filtro do app** | **nenhum** | **nenhum** | **nenhum** | R1, R2 |
  | **`DELETE`, sem filtro** | `DELETE` (só `id`) | `DELETE` (só `id`) | `DELETE` (só `id`) | R3 |

  - **(i) confirmado:** quem **perde** o acesso por transferência não recebe nenhum evento, e o `SELECT`
    dele já devolve 0 linhas — a lista dele fica com a conversa até recarregar. Quem **ganha** recebe o
    `UPDATE`. A mitigação desenhada (refetch ao voltar o foco, `useConversationsRealtime.ts`) existe,
    e o hook tem também uma rede de segurança que compara a contagem de conversas e o maior
    `last_message_at`. **Não medido:** se essa rede detecta a saída de uma conversa (a contagem cai) e
    em quanto tempo; a T8 mede pela tela.
  - **(ii) corrigido — a premissa acima estava errada para o app.** O texto dizia que o `DELETE` "é
    entregue a todos os assinantes da organização". **Com o filtro `organization_id=eq.<org>` que o
    app usa, o `DELETE` não chegou a ninguém, nem ao `manager`** (R1 e R2): com `REPLICA IDENTITY
    DEFAULT` a linha antiga só traz o `id`, e o filtro não consegue ser avaliado sobre ela. Então uma
    conversa apagada por outra pessoa **permanece na lista até o refetch**. **Sem filtro** o `DELETE`
    chega a **todos**, inclusive a quem nunca enxergou a conversa, **sem RLS e só com o `id`** (R3): quem
    montar à mão uma assinatura sem filtro obtém os ids das conversas apagadas de outros setores. É
    vazamento de **ids**, não de conteúdo, como a spec já afirmava; o que muda é que o app comum não o
    recebe e também não recebe o próprio `DELETE`.
  - **(b) `broadcast`: o canal `org:<org>:queue` é público e ninguém no app o assina.**
    `lib/ai/handoff/orchestrator.ts:259` envia `handoff_pending` com `{ conversation_id, reason }`, e
    `grep -rnE ":queue|handoff_pending" app components hooks lib` só acha **emissores**, nenhum
    assinante. Na sonda (**R1 apenas, não repetida**), tanto o `agent` B autenticado quanto um **cliente
    anônimo, só com a anon key e sem login**, receberam o payload (`conversation_id,reason`). Ou seja,
    quem souber o id da organização escuta os handoffs dela, **de qualquer setor e de qualquer
    organização**, e a anon key é pública. O conteúdo da conversa não vai no payload. **Não foi corrigido
    nesta tarefa** (ela só mede). **Desfecho (2026-11-24):** o dono do produto decidiu pela **Opção A**,
    remover o envio ([#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-7133170911),
    [#100](https://github.com/itConesul/CRMPI/pull/100#issuecomment-7132824541)); o PR #100 o removeu e
    foi mergeado (`8a2d197`), com um teste que reprova qualquer emissor de `broadcast` em `app/`, `lib/` e
    `workers/`. A Opção B (canal privado com política em `realtime.messages`) ficou descartada por ora.
    **A medição acima descreve o estado de 2026-11-19, antes do #100.** **Continua não medido:** os
    `broadcast` de `useAlertsRealtime.ts` e `useTenantHealth.ts` (só assinantes; parecem de plataforma, não
    li os payloads) — issue própria, [#103](https://github.com/itConesul/CRMPI/issues/103) — e se o
    Realtime do ambiente de produção tem acesso público desligado (a sonda foi no local, com o padrão).
  - **Limites da medição:** o `INSERT` do A não chegou na R1 e chegou na R2 e R3 (**perda não
    determinística, causa não investigada**); aguardei 2,5 s por escrita; o Realtime foi o do Supabase
    local, e o de um self-host pode ter outra versão; a sonda não está no repositório, então
    **reproduzir exige reescrevê-la** a partir desta descrição.
- **Desempenho da função por linha (condição 6):** `fn_can_view_conversation` roda por linha
  (um `exists` em `department_members` e um `select` em `organizations.settings`). A T4b registra o
  plano de `explain (analyze, buffers)` da listagem de conversas como `agent`, com volume (ordem de
  100 mil conversas, 10 setores), e **decide com o revisor** se a função basta ou se vira policy com
  `exists` inline. Não há limite numérico definido ainda.
- Quantas rotas de `app/api/v1/` leem `conversations` com o client **admin** (que bypassa a RLS e
  portanto precisam repetir a regra de setor à mão). Comando:
  `grep -rl "conversations" app/api/v1 --include=route.ts | xargs grep -l "createAdminClient\|supabase/admin"`.
  **MEDIDO em 2026-11-19 (T0(d)), `origin/develop` em `365a670`** — o comando acima **superestima**: só
  confere que a palavra aparece e que o client admin é importado, não que o admin consulta a tabela.

  | O que se mede | Comando | Resultado |
  |---|---|---|
  | `route.ts` que citam `conversations` | `grep -rl "conversations" app/api/v1 --include=route.ts \| wc -l` | **44** |
  | …com o client admin importado (o comando acima) | o comando acima, com `\| wc -l` | **23** |
  | …em que o **admin consulta `conversations` diretamente** | `grep -rPzl "\b(admin\|adminClient\|service\|svc\|createAdminClient\(\))\s*\.from\(\s*[\"']conversations[\"']" app/api/v1 --include=route.ts \| tr '\0' '\n'` (`-z` trata o arquivo como uma linha, para pegar o `.from(` na linha de baixo) | **7** |

  **As 7 não servem um `agent`:** `admin/dashboard/kpis`, `admin/inbox/conversations`,
  `admin/inbox/conversations/[id]`, `admin/tenants/[id]` e `admin/usage` (console de platform admin) e
  `cron/contact-phones` e `cron/snooze-watcher` (segredo, sem sessão). **As 8 rotas de `agent`/`viewer`
  entre as 23** (`agenda/agendamentos/[id]`, `ai/cases/[id]/reply`, `conversations/[id]/{close,media,notes,transfer}`,
  `conversations/open-with-contact`, `metrics/attendants`) **não consultam `conversations` com o admin**
  na medição por texto. **Lido linha a linha em 4 delas** (`close`, `media`, `notes`, `agendamentos/[id]`):
  a leitura de visibilidade da conversa usa o client da **sessão** (`createClient()`, sob RLS) e o admin
  só entra depois, para efeito (`rpc`, storage, evento). Com a RLS de setor ligada na T4b, essas herdam
  a regra sem mudança. **Não lidas linha a linha:** `transfer`, `open-with-contact` (a spec já a
  declara "não afetada", §4.3), `ai/cases/[id]/reply` e `metrics/attendants`.

  **O trabalho real da T3 está fora de `route.ts`** — onde o admin chega a `conversations` por helper,
  por parâmetro ou pelo MCP:
  - **MCP:** `ctx.supabase` é o client **admin** (`lib/mcp/server.ts:41`). `from("conversations")` em
    `lib/mcp/tools/handoff.ts` (linha 139) e `lib/mcp/tools/governance.ts`.
  - **Helpers com `createAdminClient` que consultam `conversations`:** `lib/routing/worker.ts`,
    `lib/ai/dispatcher/index.ts`, `lib/ai/handoff/orchestrator.ts`, `lib/ai/rag/ingest/conversations.ts`,
    `lib/ai/runtime/agent.ts`, `lib/lgpd/export-collector.ts`; e os workers `workers/ai-response-worker.ts`
    e `workers/ai-sentiment-worker.ts` (processos internos, sem pessoa em sessão).
  - **Chamadores de `fn_can_view_conversation` que não são policy:** `fn_appointment_stamp`,
    `fn_meet_action`, `fn_reply_action` (já na T3).

  **A medição é um PISO, não o total.** O scan casa texto: acha `createAdminClient()` ligado a uma
  variável **no mesmo arquivo** e **não acha** um client admin recebido como parâmetro com outro nome
  (`db`, `client`) — é assim que `lib/routing/queue.ts` e o MCP o recebem. **Não medido:** (1) **quem chama
  o MCP** (token de API ou agente de IA) e se um `agent` humano chega às ferramentas, o que decide se o MCP
  entra no escopo de setor; (2) se cada helper acima **lista conversas para uma pessoa em sessão** ou só
  serve processo interno. A T3 fecha esses dois pontos, helper a helper.

  **T3 — inventário completo, MEDIDO em 2026-11-25 (`origin/develop` em `f582cbc`).** Fecha os dois
  "não medidos" acima. A medição por texto de 2026-11-19 (piso: só `route.ts`) vira a medição por
  **todo acesso direto a `conversations`**, em qualquer arquivo de produção, com o client de origem
  **resolvido pelos chamadores**:

  | O que se mede | Comando | Resultado |
  |---|---|---|
  | Arquivos que acessam `from("conversations")` | `git grep -lE '\.from\(\s*["'"'"']conversations["'"'"']\s*\)' -- app lib workers hooks components ':!*.test.*' ':!*.spec.*' \| wc -l` | **46** |
  | Chamadas (linhas) | o mesmo, com `-c` e `awk -F: '{s+=$2} END{print s}'` | **72** |
  | Dessas, com o client de origem **indireta** (parâmetro ou variável distante) | resolvidas lendo os chamadores de cada arquivo | **25** |

  A classificação não sai de um comando: sai de ler, para cada chamada, **de onde vem o client** e
  **quem a alcança**. Cinco grupos:

  | Grupo | Client | Quem alcança | Onde | O que a T3 faz |
  |---|---|---|---|---|
  | **A. Pessoa em sessão** | `createClient()` — a RLS vale | `viewer`+ logado | `conversations/_handler.ts` (REST), `conversations/[id]/{close,draft-reply,media,notes,pause-ai,retention,snooze,usable-for-rag}`, `conversations/counts`, `messages/_handler.ts` (REST), `contacts/*` (REST), `agenda/{vinculos,agendamentos/[id]}`, `pipelines/[id]/board`, `lib/escalacao/retomada.ts` (`reactivate-bot`), `lib/leads/radar-de-risco.ts` (`leads/at-risk`), `hooks/notifications/useInboundMessageAlerts.ts` | **Nada a mudar.** Herdam a regra quando a T4b a liga. A T3 **prova** por teste, uma rota por papel |
  | **B. Token de API (MCP)** | `createAdminClient()` em `lib/mcp/server.ts:41` — **a RLS NÃO vale** | credencial externa de organização, com papel `agent`+ | `lib/mcp/tools/{conversations,governance,handoff,contacts,leads}.ts` e os handlers que elas **compartilham** com o REST (`conversations/_handler.ts`, `messages/_handler.ts`, `contacts/_handler.ts`), mais `lib/escalacao/{atendentes,retomada}.ts`, `lib/leads/radar-de-risco.ts`, `lib/routing/{eligibles,queue}.ts` e `lib/operacao/marcadores-e-time.ts` quando chamados por tool | **Decisão tomada (F1): o token ganha departamento; spec própria.** É o trabalho real da T3 |
  | **C. Platform admin** | admin | `requirePlatformAdmin()` | `admin/dashboard/kpis`, `admin/inbox/conversations{,/[id]}`, `admin/tenants/[id]`, `admin/usage` | **Nada.** `fn_can_view_conversation` já devolve `true` para platform admin. `kpis:60` conta `pending` sem `organization_id` **por desenho** (painel entre organizações) |
  | **D. Sistema, sem pessoa** | admin | segredo de cron, webhook, worker, dispatcher, agente de IA nativo | `cron/{contact-phones,snooze-watcher}`, `workers/*`, `lib/ai/{dispatcher,runtime/agent,elegibilidade,handoff,rag/ingest}`, `lib/channels/zernio/ingest.ts`, `lib/routing/worker.ts`, `lib/followup/{silence-sweep,gatilho-caso,reactivity}`, `lib/escalacao/atendimento-manual.ts`, `lib/atendimento/origem-automacao.ts` | **Nada.** Organização inteira é o contrato de quem processa. A distribuição **por setor** é outra decisão (a #73, URA) |
  | **E. Admin com papel humano, caso a caso** | admin | `agent`+ ou `admin` | `attendants/availability` (`agent`+): lê só `assigned_to_user_id` para contar a carga de cada atendente, e a conta **precisa** ser de todos os setores. `lgpd/requests/[id]/preview` (`admin`): lê id, status e canal de **todas** as conversas do contato, por obrigação legal de exportação | **Nada**, com a justificativa escrita aqui |

  **Resolvido (era "não medido" (1)): quem chama o MCP.** Um bearer `dsk_…` da tabela `api_tokens`
  (`lib/mcp/auth.ts`). O papel vem do escopo `role:<papel>` (padrão `agent`) e o ator é
  `{ type: "user", id: <id do TOKEN> }` ou `ai_agent`: **o token não tem `user_id` nem setor** (a coluna `created_by` é o admin que o
  CRIOU, não quem o opera). A criação
  é só de `admin` (policy `api_tokens_admin_only`). O agente de IA **nativo** não passa pelo `/api/mcp`
  (`lib/ai/runtime/tools.ts`). Quem chama o MCP é, então, uma credencial externa da organização, e não
  uma pessoa `agent` em sessão — por isso `visibility_mode` e setor não têm a quem se aplicar.

  **Resolvido (era "não medido" (2)):** os helpers estão nos grupos acima. Só os do grupo B listam
  conversas para além do processo interno, e só por tool do MCP.

  **Achados que a T3 leva adiante (nenhum corrigido neste PR):**
  - **F1 — O contrato 14 promete o que o MCP não faz.** `14-contrato-governanca-agentes-externos.md` §0 e
    §4 diziam que o agente externo lê "sujeito à RLS" e "não vê além do escopo". O MCP usa service role
    (`lib/mcp/server.ts:41`; o próprio comentário de `app/api/v1/leads/_handler.ts:203-209` diz que ele
    "bypassa RLS"), e **nenhum** TypeScript aplica `visibility_mode` (`git grep -n visibility_mode -- app lib
    workers ':!*.test.*'` só acha leitura e escrita da CONFIGURAÇÃO, nenhum filtro). O isolamento entre **organizações** é do handler
    e é real (`tests/invariants/mcp-nao-alcanca-outro-tenant.test.ts`); o isolamento por **atendente** não
    existe no MCP, e **não existiria por setor** depois da T4b: um token `agent` lê toda conversa da
    organização. **Lido no código; não executei uma chamada MCP real para provar.** O §0 e o §4 do contrato
    foram corrigidos para dizer isto. **Decisão do dono (2026-11-25, [#67](https://github.com/itConesul/CRMPI/issues/67)):**
    manter o token lendo a empresa toda por padrão **não atende à regra** de isolamento entre equipes (a
    opção (i), que este achado recomendava, foi **recusada**). **O token passa a ter departamento**; o acesso
    à empresa inteira só por **escolha explícita** de quem é `admin` ou `manager`. É funcionalidade nova e
    **precisa de spec própria** (token com departamento, como o handler o aplica à mão, e o que acontece
    com os tokens que já existem). Não é desta PR e **não muda o comportamento de hoje**.
  - **F2 — `messages/_handler.ts` lê e atualiza a conversa só por `id`** (linhas 314–322 e 912, sem
    `organization_id` no próprio acesso). Ele é chamado pelo REST (sessão) e também pelo agent-engine com
    service role e pelo MCP. Ponto de atenção da doutrina ("admin client **DEVE** filtrar `organization_id`"),
    **lido, não explorado**: o `conversation_id` vem de quem chama, e a T3 confere cada chamador.
  - **F3 — Os chamadores de `fn_can_view_conversation` que não são policy** (`fn_appointment_stamp`,
    `fn_meet_action`, `fn_reply_action`) **não foram lidos nesta rodada**; "de onde vem o setor" nesses três
    segue sendo item da T3.
  - **F4 — Fora do que esta medição alcança:** SQL dentro de funções `fn_*` e `rpc`; o join embutido
    `conversations!inner` em `lib/routing/eligibles.ts:87`; as assinaturas Realtime (sob RLS, sessão); a
    tabela `messages`, que herda a visibilidade da conversa; e **leads e contatos**, que ficavam de fora
    pela Q6 (a #80) e **entram pela decisão D de 2026-11-25** (ver F6, abaixo).
  **T3 — continuação, MEDIDA em 2026-11-25 (`origin/develop` em `a94d41d`).** Fecha o **F3**, acrescenta o
  **F5** e mede o alcance da **decisão D** (2026-11-25). O método é o **catálogo de um banco recém-instalado
  do `baseline.sql`** (Postgres 15 descartável, só leitura): `pg_depend`, `pg_policy`, `pg_proc.prosrc` e
  `information_schema`. As consultas que sustentam os números:

  | O que se mede | Consulta | Resultado |
  |---|---|---|
  | Policies que dependem de `fn_can_view_conversation` | `pg_depend` ⨝ `pg_policy` onde `refobjid` é a função | **2:** `conversations_select` e `tenant_isolation_ai_reply_drafts_all` |
  | Funções cujo **corpo** a cita | `select proname from pg_proc where prosrc ilike '%fn_can_view_conversation%'` | **3**, todas `plpgsql`: `fn_appointment_stamp`, `fn_meet_action`, `fn_reply_action` |
  | O mesmo para `fn_can_view_lead` | as duas consultas acima, com a outra função | **6 policies** (`crm_leads` ×4, `crm_lead_activities_select`, `crm_lead_links_select`) e **0 funções** |
  | Relações (tabelas e views) com coluna `conversation_id` | `information_schema.columns` | **14** |
  | Policies **restritivas** de leitura em `public` | `pg_policy` onde `not polpermissive` e `polcmd in ('r','*')` | **1**, em `idempotency_keys` (nenhuma nas tabelas abaixo) |

  - **F3 — FECHADO.** Os dependentes são 2 policies e 3 funções, e **nos cinco o setor é a coluna da própria
    conversa, que eles já leem na mesma consulta**: `conversations_select` (a linha), a subconsulta
    `conversations c` da policy de `ai_reply_drafts`, o `from public.conversations …` de
    `fn_appointment_stamp` e de `fn_meet_action` (que passam `organization_id, assigned_to_user_id` da
    mesma linha) e o `from conversations c join ai_reply_drafts r` de `fn_reply_action`. Para a T4b basta
    passar `department_id` junto; **não há consulta nova nem fonte externa de setor**. A lista da spec (3
    funções) estava **incompleta**: faltava a policy de `ai_reply_drafts`.
  - **F5 — O amparo do `drop function` não cobre as três funções.** A T4b conta com "`drop function` falha se
    ainda houver dependente, então um chamador esquecido aparece como erro no `install`". **Medido** (sonda
    descartável, no mesmo Postgres 15): com uma **policy** dependente o `drop function` falha (`cannot drop
    function … because other objects depend on it`); com só uma função **`plpgsql`** dependente ele **passa em
    silêncio**, a função continua existindo e quebra ao ser chamada (`function public.zz_alvo(unknown,
    unknown) does not exist`). Logo, depois de a T4b trocar a assinatura, as 3 funções continuariam instaladas
    e falhariam **em runtime**, na primeira vez que uma pessoa em sessão marcasse um compromisso numa
    conversa, executasse a ação do Meet ou a do rascunho de resposta. **Proposta para a T4b (a decidir no review
    dela):** recriar as 3 funções (`create or replace`) na mesma migration **e** um invariante que rode a
    segunda consulta da tabela e reprove se algum corpo ainda chamar a assinatura antiga: o amparo tem de ser
    um **teste**, não o `drop`.
  - **F6 — O alcance da decisão D, medido (a decisão D diz "ficha e linha do tempo do contato"; o catálogo
    mostra um problema maior).** O que exige para ser **lida** cada uma das 14 relações com `conversation_id` e
    mais `agent_case_events`, `agent_inbox_items`, `demandas`, `lead_notes`, `contacts`, `ai_chunks` e as do lead
    (lido em `pg_policy`; **não executei uma leitura como usuário**):
    1. **Herdam a visibilidade da conversa** (subconsulta a `conversations`, sob RLS): `messages`,
       `conversation_assignment_events` e `ai_reply_drafts`. A T4b os cobre sem mudança.
    2. **Só organização** — `organization_id in (select fn_user_org_ids())`, sem olhar a conversa: `conversation_notes`
       (corpo da nota interna), `agent_inbox_items` e `agent_case_events` (corpo), `lead_notes` (corpo),
       `contact_field_proposals` (dado dito pelo cliente na conversa), `lead_checkpoints`, `followup_enrollments`,
       `agent_cases`, `demandas`, `demanda_conversas`, `calendar_appointments` (leitura; a escrita exige `agent`),
       `ai_agent_runs`, `ai_invocations` e `ai_router_decisions` (o conteúdo destas três **não foi conferido**).
       São **14 tabelas**; **10** têm `conversation_id`, e `agent_case_events`, `agent_inbox_items`, `demandas` e
       `lead_notes` entram por terem texto ou serem da conversa, **sem coluna que as ligue a ela** (o vínculo destas
       quatro com uma conversa **não foi medido**).
       Pela policy, **qualquer membro ativo da organização, `viewer` inclusive, lê estas linhas direto pelo
       PostgREST, hoje, sem enxergar a conversa que as originou**. Isso **não depende de setor**: vale com o
       `visibility_mode` de hoje. A regra do dono ("equipes distintas não veem as conversas umas das outras")
       alcança estas tabelas, e a decisão D não as nomeia: **o dono precisa dizer se entram.**
    3. **Lead e contato.** A visibilidade do lead é por **dono do lead** (`fn_can_view_lead(org, owner_user_id)`,
       em `crm_leads`, `crm_lead_activities` e `crm_lead_links`), **não por conversa nem por setor**; `contacts`
       é só organização. A ficha e a linha do tempo leem com o client de **sessão** (`contacts/[id]/timeline`,
       `contacts/[id]/crm-summary`, `leads/[id]/timeline`), então uma policy nova as alcança sem mudar a rota.
       O que a linha do tempo carrega **de conversa** (lido no código): `ai_turn` (`payload.added_commitments` e
       `added_objections`, o que a IA extraiu da conversa), `handoff_triggered`/`handoff_resolved` e
       `conversation_claimed`/`transferred`/`released`/`ai_paused` (só o `reason`). `evidence` guarda só ids, e
       `reason` é "sem PII" por contrato. **Não conferi** o `payload` dos demais tipos do vocabulário.
    4. **Questão de desenho em aberto, que a T3 não resolve sozinha:** `crm_lead_activities` **não tem
       `conversation_id` nem `department_id`** (não está entre as 14 tabelas acima), então a RLS **não tem como
       saber de qual conversa ou departamento uma atividade veio**. Opções, **sem escolha minha**: (a) gravar o
       `department_id` (ou o `conversation_id`) na atividade ao emiti-la e filtrar na policy, com backfill dos
       tipos já gravados; (b) esconder **categorias inteiras de tipo** (`ai_turn`, `note`, …) de quem não é do
       departamento, sem olhar a conversa; (c) derivar por `source_id` quando `source_module` aponta uma
       conversa (**não medi** se todo emissor grava isso). Cada uma muda o que o dono quis ver, e a escolha vem
       **antes** de a T3 aplicar a regra.
    5. **Não medido:** `ai_chunks` (o RAG): a policy é só organização e `lib/ai/rag/ingest/conversations.ts` ingere
       conversas, mas o chunk não tem `conversation_id` (só `knowledge_source_id`) e **não conferi se ele guarda
       texto de conversa**; as notificações push (#120 e #123); e o Realtime destas tabelas.

## 2. Decisão de design

Dois mecanismos independentes, cada um com uma **função pura** testável sem banco ou DOM.

### 2.1 Expediente (RF-3 a RF-6, RNF-1)
- **Fonte única:** `organizations.settings.business_hours`, no **mesmo formato** do horário por
  atendente: `{ timezone, windows: [{dow, start, end}] }`. Reaproveita `availabilityScheduleSchema`,
  `localMoment` e `isWithinSchedule`; **não** nasce um segundo conceito de "janela".
- **Virada de dia (N3) — só no expediente, com schema próprio (decisão revista em 2026-11-17).**
  `22:00–06:00` é rejeitado hoje porque `scheduleWindowSchema` exige `start < end`. A versão
  anterior desta spec **estendia o schema compartilhado**; a revisão do PR (comentário de 19:43) e
  a medição mostraram que isso **não é retrocompatível com a agenda**, e a decisão mudou:
  - **Inventário dos 5 consumidores de `availabilityScheduleSchema`** e o que cada um faz com uma
    janela `end < start`:

    | Consumidor | Como lê | Com `end < start` |
    |---|---|---|
    | `lib/agenda/jornada.ts` | `safeParse` | cai no ramo de falha (jornada padrão) |
    | `lib/agenda/horarios-livres.ts` | `{ inicio, fim }` por `dow` | **descarta** a janela: o cabeçalho do arquivo declara "nada aqui cruza a meia-noite" (`22:00–02:00` é descartada) e a limitação é simétrica |
    | `lib/routing/eligibles.ts` | `.parse` | **lança** se o dado existisse |
    | `lib/escalacao/atendentes.ts` | `.parse` | **lança** se o dado existisse |
    | `lib/escalacao/disponibilidade.ts` | `.parse` | **lança** se o dado existisse |

    Se o schema do atendente aceitasse a virada, o roteamento a trataria e a agenda a descartaria:
    duas telas divergindo sobre o mesmo dado, e o plantão noturno sumiria da agenda em silêncio.
  - **A saída adotada:** o horário **por atendente continua rejeitando** `end < start` (nada muda
    nesses 5 consumidores) e a virada existe **só** no expediente da organização, num schema próprio
    (`expedienteWindowSchema`/`expedienteConfigSchema`, em `lib/schemas/routing.ts`), que reusa só a
    validação de fuso. **A lógica de janela continua numa só função** (`janelaContem` em
    `lib/routing/eligibility.ts`), com a virada como opção `viradaDeDia` **desligada por padrão**:
    roteamento e agenda não a ligam, então nada neles muda. O que são duas coisas é o *schema* (o que
    se pode gravar), não a regra de pertencer a uma janela. Isto contraria a leitura literal de "uma só
    fonte" e por isso **pede confirmação do dono do produto** (ver `05-revisao.md`).
  - **Semântica:** se `end < start` a janela vira o dia e **pertence ao `dow` em que começa**:
    `(dow == w.dow && hhmm >= start) || (dow == (w.dow + 1) % 7 && hhmm < end)`. Sábado→Domingo
    incluso (`(6 + 1) % 7 = 0`). Só `start == end` é rejeitado. `end` é **exclusivo** e
    `end = "00:00"` vale meia-noite (resolve o furo do minuto 23:59, já que `24:00` não passa na
    regex `HHMM`).
  - **Bordas que a T1 testa (implementadas):** `22:00–06:00` às 21:59, 22:00, 23:59, 00:00, 05:59 e
    06:00; a virada no sábado; `start == end` inválido; a janela de um `dow` não vaza para o `dow`
    anterior; **`opens_at`** (terça 06:00 → próxima segunda 22:00; domingo 06:00 → próximo sábado
    22:00; dentro da madrugada da janela → nada a anunciar; `end = 00:00`); regressão: o schema do
    atendente segue rejeitando a virada e `isWithinSchedule` sem a opção trata `end < start` como antes.
    **A faixa da tela (T7)** deve mostrar a janela como o admin a escreveu (`22:00–06:00`) e o
    `opens_at` do 403, para janela que vira o dia também.
- **Fora desta entrega, registrado a pedido do review do #88 (menores 1, 3 e 4; medido em 2026-11-19):**
  - **Sem cache da leitura do expediente.** Cada escrita de `agent` faz 1 SELECT em `organizations`
    (`gate.ts:63`, em até 169 rotas com `requireRole`) e `loadEligibleAttendants` faz 1 por chamada
    (`eligibles.ts:109`). `business_hours` só é gravado por `PATCH /settings/expediente`. Um cache em
    memória não é invalidado entre processos (`app` e `worker` são separados), então só um TTL
    funcionaria, e com ele um expediente alterado leva até o TTL para valer. **TTL e invalidação são
    decisão de produto que esta spec não tem**; fica para issue.
  - **A UI trava só parte das ações.** A trava está em `Composer.tsx` e `ConversationHeader.tsx`. Os
    arquivos de UI que escrevem em lead, tag, contato ou tarefa — `CRMSidePanel`, `useBoard`,
    `useTasks`, `PropostasDeDado` — não a têm: o `agent` fora do horário pode clicar e recebe o 403
    `OUT_OF_WORK_HOURS` cru. **A contagem é por padrão de texto (`method: "POST"` etc.) e pode estar
    incompleta.** O servidor barra do mesmo jeito; o que falta é a UI avisar antes do clique.
  - **Dicionário `es`:** faltam `sáb`, `a` e `e` em `lib/i18n/dicionario.ts` (`seg` e `dom` existem), então
    a frase do horário em espanhol sai com esses termos em português. Antes de acrescentar `a` e `e`,
    conferir se as chaves curtas não traduzem outra string igual.
- **Default = sem restrição** (`windows` vazio = 24/7). Uma instalação que atualiza pelo `update.sh`
  continua operando; o expediente só passa a valer quando o admin o configura (primeira impressão).
- **Falha aberta:** config ausente, fuso inválido ou shape torto = sem expediente. Uma configuração
  quebrada não pode trancar a equipe fora do próprio sistema; é o mesmo princípio de
  `janela-de-atendimento.ts`.
- **Função pura** `dentroDoExpediente(config, agora)` e `expedienteBarra({papel, config, agora, isenções})`.
- **Bloqueia a ação, não a leitura (Q1).** Fora do expediente o `agent` ainda abre e lê conversas;
  não pode assumir, responder, transferir, anotar, soltar, adiar nem encerrar.
- **Onde aplicar — fail-closed.** *(Substitui a versão opt-in `exigeExpediente: true`, que deixava
  aberta toda rota de escrita esquecida e cuja varredura só cobria `conversations/**`; ver a condição
  5 da aprovação e `05-revisao.md`.)* A regra é **invertida**: fora do expediente, todo método que não
  seja `GET`/`HEAD`/`OPTIONS` chamado por um `agent` é barrado **por padrão**, e a rota só escapa
  declarando `expediente: { isenta: "<motivo>" }`. Uma rota nova de escrita nasce **barrada**; esquecer
  de declarar nada abre nada.
  - **O ponto de aplicação é `requireRole`** (por onde a rota já passa e onde o 403 padrão vive). Ele
    **não conhece o método HTTP** (§1), então o `proxy.ts` o carimba no cabeçalho de requisição
    `x-metodo-http` e o `requireRole` o lê por `headers()`. **Medido na T0(e), contra o app real
    buildado:** o carimbo **chega** ao handler e **não é forjável**. A prova de que chega é indireta e
    forte: um `GET` de conversas passa fora do expediente, e se o cabeçalho não chegasse o método seria
    "desconhecido", tratado como escrita, e esse `GET` levaria 403. Um `POST` que mande
    `x-metodo-http: GET` continua barrado, porque o proxy sempre sobrescreve (`set`). Dois cuidados:
    os cabeçalhos da requisição são montados **antes** de `NextResponse.next` (o `x-pathname` que o
    proxy já estampa é mutado **depois**, e a base já não o usa: não é precedente de que funcione), e
    método ausente conta como escrita. O carimbo não custa consulta ao banco (o proxy roda no Edge) e
    **não muda nenhuma das 140 rotas de escrita**. Custo no `requireRole`: zero para leitura e para
    `manager`/`admin`; **uma leitura de `organizations.settings`** por escrita de `agent`.
  - **T0(a):** `loadAuthUser` **não** carrega `organizations.settings` (seleciona `display_name,
    locale`), então o gate faz a própria leitura (`carregarExpediente`, falha aberta, service role não
    usado: é o client do usuário, sob RLS).
    - **Por que a RLS não esconde a linha de quem chega ao gate (medido em 2026-11-19, banco local com
      a `baseline.sql`, JWT simulado por papel, transação desfeita com `ROLLBACK`).** O gate só roda
      para quem `fn_user_role_in_org` devolveu `agent`, e essa função e `fn_user_org_ids` (a da policy
      `orgs_select`) filtram as duas `revoked_at is null`. Resultado: `admin`, `manager`, `agent` e
      `viewer` ativos leem `organizations.settings` da própria organização e **nunca** a de outra;
      um `agent` com vínculo revogado lê `NULL` mas também leva `NULL` em `fn_user_role_in_org`, então
      o `requireRole` o barra por papel (403 `forbidden_role`) **antes** do gate. Platform admin e
      sessão de suporte não passam pelo gate (`!user.is_platform_admin && !user.support`). **Não
      medido:** o `requireRole` de ponta a ponta (a sonda foi em SQL) e chamadores de
      `loadEligibleAttendants` além do MCP (`createAdminClient()` em `lib/mcp/server.ts`) e do
      `routing/worker.ts`, que passam o client admin.
    - **A premissa é frágil e a spec a vigia.** O gate só enxerga a linha enquanto as duas funções
      coincidirem. Se divergirem (uma ganha condição que a outra não tem) ou a policy `orgs_select`
      passar a exigir papel mínimo, `maybeSingle` devolve `null` **sem erro** e o gate falha aberto
      para todos, em silêncio. Duas travas: (1) em `carregarExpediente`, linha **ausente sem erro**
      é logada com `logger.warn` — o chamador acabou de resolver a organização, então "ausente" não é
      estado normal; segue falhando aberto (a regra acima não muda), só deixa de ser invisível;
      (2) o invariante de `03-testes.md` amarra `fn_user_role_in_org` à leitura de `organizations`.
      O comentário de `lib/expediente/carregar.ts` ("Service role e `organization_id` explícito")
      contradiz esta spec e o código; deve passar a dizer "client do usuário, sob RLS".
  - **Isenções FIXAS (decisão do dono do produto, 2026-11-17).** Fora do expediente, o `agent` em
    sessão humana continua podendo: **ler**; **login e logout**; **trocar de organização**;
    **perfil**; **preferências**; **cadastro e verificação de MFA**; **marcar notificação como lida**;
    **presença** e `attendants/availability`. Nenhuma dispara mensagem ao cliente nem assume
    atendimento. **Barrado:** tudo que fala com o cliente ou assume atendimento — assumir, responder,
    transferir, encerrar, `messages`, aprovar resposta da IA, agent-inbox.
  - **Medido na T0(f), o que a implementação já encontrou:** perfil, idioma e MFA são **Server
    Actions** que autenticam só por `loadAuthUser`/`getUser`, e **nenhuma** Server Action chama
    `requireRole` — então o gate **não as alcança** e o cadastro de MFA nunca é barrado (era a
    preocupação do review: trancar quem a organização obriga a ter MFA).
    **Cuidado com a leitura desta frase** (esclarecida em 2026-11-17, a pedido do revisor):
    `grep -rl requireRole app/actions` lista **dois** arquivos — `updateBranding.ts` e
    `updateMarcaDaOrganizacao.ts` (a primeira exige platform admin; a segunda, admin da organização) —,
    mas é por **comentário**: os dois dizem que
    **não** usam o `requireRole` ("Server Action NÃO é rota: não passa por `requireRole`"; "Nenhuma das
    actions de `app/actions/` chama"). Nenhuma tem **chamada nem import** dele; cada uma faz o próprio
    gate (`updateBranding`: `requirePlatformAdmin()`; `updateMarcaDaOrganizacao`: `loadAuthUser` +
    `ROLE_RANK` com piso `admin`). O comando que separa as duas leituras é
    `grep -rnE 'requireRole *\(|from +.@/lib/auth/require-role' app/actions`, que devolve **vazio** (e
    enxerga uma chamada real: o mesmo padrão aplicado a `app/api/v1/settings/routing/route.ts` a
    encontra). **Cuidado:** a variante `grep -rn 'auth/require-role'` **não** serve, porque casa dois
    comentários que citam o caminho do arquivo. Para o expediente a conclusão é a mesma nos dois casos
    (nenhuma é alcançada pelo gate, e as duas exigem papel de administração, que nunca é barrado), mas
    só a primeira leitura é a verdadeira. Das rotas de API, as duas
    isenções que existem hoje são `attendants/availability/[user_id]` ("o atendente gerencia a
    própria disponibilidade", senão ficaria "disponível" no roteamento sem como sair) e
    `notifications/push` (`PUT`/`DELETE`, "inscrição de push do próprio navegador").
  - **T0(f) conferida rota a rota (2026-11-18, no código da branch `feat/67-expediente-gate`).** Os 9
    itens da lista fixa escapam do gate por **três mecanismos**, e a conta fecha assim:

    | Mecanismo | Itens |
    |---|---|
    | **Método:** `GET`/`HEAD`/`OPTIONS` nunca são barrados | leitura |
    | **Por construção:** não passam por `requireRole` | login/logout (`app/actions/auth/signOut.ts`), troca de organização (Server Action `setActiveOrg`), perfil, preferências, MFA (Server Actions, acima) e "marcar notificação como lida" (não há rota de API para isso: `app/api/v1/notifications/` só tem `push`) |
    | **Isenção declarada** em `expediente: { isenta }` | **presença e `attendants/availability` são a MESMA rota**: `PATCH attendants/availability/[user_id]` grava o `is_available` e, quando `true`, o `last_heartbeat_at` |

    Fora dos 9 há uma isenção declarada a mais, `notifications/push`, **ratificada** em 2026-11-18
    (abaixo), e a isenção do `mark-read` (P1) entra com o PR do gate. Quantas rotas declaram isenção é
    **estado, não prosa** (DoD 16): para saber, na branch que tem o gate,
    `grep -rn "expediente: { isenta:" app/api/v1 --include=route.ts` lista as declarações, e
    `pnpm vitest run tests/unit/expediente-rotas-de-acao.test.ts` **falha** se a lista de isenções, a de
    rotas fora do alcance do gate ou o motivo escrito mudarem sem decisão.
  - **Decidido pelo dono do produto em 2026-11-18** ([#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6980072775)).
    **P1:** `POST conversations/[id]/mark-read` (zera `unread_count_for_assignee`) passava por
    `requireRole("agent")` e era barrada fora do expediente. O inbox a dispara sozinho 1,5 s depois de a
    conversa ficar em foco (`hooks/inbox/useMarkAsRead.ts`), então o `agent` que abre uma conversa para
    **ler** — o que a Q1 e o RF-4 garantem — levaria 403 a cada abertura, e o contador de não lidas nunca
    zeraria. **Decisão: isentar**, com o motivo escrito "ação automática da UI, sem efeito para o
    cliente". É uma regressão funcional **do próprio gate**, por isso **bloqueia o merge do PR do gate**,
    que leva a isenção e o e2e dela (`agent` abre a conversa fora do expediente, lê, sem 403, com o
    Composer travado). **P2:** `notifications/push` **ratificada** e passa a fazer parte da lista fixa.
  - **CRM interno (leads, contatos, tarefas, agenda): barrado POR PADRÃO e liberado rota a rota**
    (decisão do dono do produto), com o **motivo escrito** e um critério. Há **dois critérios de
    isenção**, e a rota precisa cumprir o que se aplica a ela:
    1. **CRM interno:** *"esta rota dispara mensagem ao cliente?"* Se dispara, continua barrada.
    2. **Rotas de conversa** (decisão de 2026-11-18): *"é ação automática da UI, sem efeito para o
       cliente?"* — a que o inbox dispara sozinho, como `mark-read`, não vira exceção caso a caso. Uma
       rota que o usuário aciona de propósito (assumir, responder, transferir, encerrar) **não** é
       "automática" e segue barrada.

    A lista de liberações sai da T0(f), gerada por script a partir das rotas reais, e entra no teste.
    Do CRM interno, hoje está **vazia de propósito**: nada é liberado sem essa justificativa.
  - **FORA do gate — por escrito e com teste de varredura:** token **Bearer**, **MCP**, **agente de
    IA**, **webhooks**, **cron** e a **ingestão de mensagens**. A IA cobre a noite e a mensagem do
    cliente tem de entrar na fila (RF-11). O motivo: o expediente é uma regra para **atendente
    humano em sessão**. MCP e tokens Bearer (`dsk_…`, papel padrão `agent`, escrevem com
    `mcp:write`) autenticam por `lib/mcp/auth.ts` (`ensureRole`) e nunca chamam `requireRole`; o
    agente de IA tem a própria janela (`janela-de-atendimento.ts`); webhooks e cron autenticam por
    segredo. O teste `tests/unit/expediente-rotas-de-acao.test.ts` fixa isto: `lib/mcp` e
    `app/api/mcp` não podem chamar `requireRole`, `cron/*` e `webhooks/*` também não, e **nenhuma
    Server Action** o chama (nem chamada nem import; ver a nota acima). Consequência a ter à vista: uma Server Action de **atendimento**
    escaparia do gate; hoje nenhuma existe, e quem criar uma deve chamar o gate explicitamente.
  - **Limite do fail-closed (T0(f), inventário):** o gate só alcança rotas que chamam `requireRole`.
    Das **140** rotas de escrita fora de `cron/*` e `webhooks/*`, **17 não o chamam** (`admin/*`,
    `system/*`, `marca/logo`, `team/[user_id]*`, `channels/partner/templates*`,
    `agenda/agendamentos/[id]/google/*`). Ficam numa lista **fixa** em teste (rota nova de escrita
    sem `requireRole` reprova), mas as de organização (`team`, `channels`, `agenda/google`,
    `marca`) ainda precisam da decisão "um `agent` as alcança?" na T0(f).
  - **A varredura de AST cobre `app/api/v1/**`** (e não só `conversations/**`) e reprova: isenção sem
    motivo; rota `cron/*` ou `webhooks/*` ligada ao gate. O que o teste protege deixa de ser "a lista
    de rotas protegidas" (que envelhecia) e passa a ser "a lista de isenções" (que é curta e tem
    motivo).
- **Tentativa barrada: sem linha de audit por tentativa (N4, RNF-5).** O 403 por expediente **não**
  passa pelo `authz.denied` de `requireRole`: com retry ou polling da UI, uma linha por tentativa
  repetiria o defeito das rodadas de cron vazias (~95% do audit log numa VPS real). Conta-se em um
  **contador agregado** `expediente:barrados:<organization_id>:<AAAA-MM-DD no fuso da org>` (`INCR`
  com validade de 48 h) no mesmo Redis que o app já exige (`serverless-redis-http`; sem env nova). O
  contador alimenta o cabeçalho da seção Expediente (§7). **Se o Redis não responder, o contador fica
  em `—` e a regra continua valendo**: contar nunca pode bloquear nem liberar ninguém.
  - **A chave nunca fica sem validade (invariante).** Foi a forma que o primeiro `contador.ts`
    escolheu — `INCR` e, **só quando o total é 1**, `EXPIRE` — que não a garante: se o `EXPIRE` do
    primeiro incremento falhar (Redis cai entre os dois comandos), a chave fica **para sempre sem
    validade**, e o incremento seguinte já devolve 2 e nunca mais tenta pôr a validade. A spec exige a
    invariante, não um comando: **nenhuma falha parcial pode deixar a chave sem validade, nem
    perpetuamente**. Formas que a cumprem: (1) `INCR` e `EXPIRE` na mesma transação/`pipeline`, ou (2)
    `EXPIRE <chave> <48 h> NX` depois de **todo** `INCR` (idempotente: só age quando a chave ainda não
    tem validade, e por isso **se cura sozinho** no incremento seguinte). `NX` exige Redis 7.0 — o
    `docker-compose.prod.yml` fixa `redis:7-alpine` (`grep -n "image:.*redis" docker-compose.prod.yml`).
    **Não medido aqui:** se o `serverless-redis-http` fixado por digest aceita transação (`MULTI`); a
    implementação **prova** a forma escolhida contra o Redis do compose, não contra um mock.
    **Estado em 2026-11-19:** o PR do gate (#88, `b8d6886`) adotou `INCR` + `EXPIRE … NX` num
    `pipeline` em **toda** contagem, com teste de unidade que usa um Redis falso. **A prova contra o
    Redis do compose ainda não foi feita** — o teste do #88 é mock, e é exatamente o que este
    parágrafo diz que não basta.
  - **O contador tem leitor nomeado, ou não é escrito.** O leitor é `lerBarradosDoDia`
    (`lib/expediente/contador.ts`), lido pelo cabeçalho da seção Expediente (T6). Só que a T6 é a
    quinta na ordem de `04-tarefas.md` (depois de T4a, T3, T4b e T5): sem decisão, o contador seria
    **escrito e não lido** por vários PRs — "evento sem consumer", o anti-pattern 3 do `CLAUDE.md`, e
    o DoD 13 ("aparece na tela") sem resposta. Como o contador só guarda "hoje" (validade de 48 h),
    escrever antes da T6 **não preserva histórico nenhum**. Três saídas; **o dono escolheu a (b) em
    2026-11-23** ([#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-7105707792), registrado em
    `05-revisao.md`) — as outras ficam como o histórico do que foi recusado:
    - **(a)** Aceitar o intervalo, com o leitor (T6) e o prazo escritos. Sem nada visível até lá.
    - **(b) — ESCOLHIDA pelo dono:** o `GET /api/v1/settings/expediente` devolve `barrados_hoje` (número, ou
      `null` com o Redis fora) **só a `admin`/`manager`**; `agent` e `viewer` recebem `null`. O laço fecha
      já, o código existente é reaproveitado, e a tela da T6 só passa a consumir o que a API já dá.
      Custo: o contrato da rota ganha um campo que depende do papel.
      **Contrato do campo (detalhe da (b); proposta do autor em 2026-11-24, não muda a escolha do dono):**
      1. **Forma:** `data.barrados_hoje: number | null`, ao lado de `agora`, `dentro` e `opens_at` (que
         `descreverExpediente` já devolve). Só leitura: o `GET` nunca escreve nem grava audit (a
         auditoria do `CLAUDE.md` vale para mutação).
      2. **Quem:** o papel vem de `authz.org.role` (já devolvido pelo `requireRole("viewer")` da rota).
         `admin` e `manager` recebem o número; `agent` e `viewer` recebem `null` **sem nenhuma ida ao
         Redis**. Isso importa porque a faixa do shell consulta esta rota de **todo usuário logado, a cada
         60 s** (`hooks/expediente/useExpediente.ts`: `refetchInterval: 60_000`, `staleTime: 30_000`):
         com o filtro por papel, o Redis só é consultado para `admin`/`manager`, uma vez por minuto por aba.
         Sessão de suporte entra pelo papel que o `requireRole` já lhe dá (`full` → `admin`, senão `viewer`).
      3. **"Hoje":** o dia de `agora` no fuso da organização, a mesma `chaveDoContador` que o gate usa
         para escrever (`lib/expediente/contador.ts`).
      4. **`0` e `null` são coisas diferentes** (e já são o que `lerBarradosDoDia` devolve): **número,
         inclusive `0`,** quando o Redis respondeu (chave ausente = nenhuma tentativa barrada hoje);
         **`null`** quando o Redis está ausente, malformado ou fora. A tela mostra `0` e `—`, respectivamente.
      5. **Sem expediente configurado** (`business_hours` ausente ou inválido): **proposta:** `null`. Sem
         configuração o gate nunca barra, então nada foi contado, mas também não há fuso da organização
         para dizer qual é "hoje"; `null` evita inventar um dia em UTC. **Aceito pelo revisor em 2026-11-24**
         ([review do #114](https://github.com/itConesul/CRMPI/pull/114#pullrequestreview-6045684214): "é detalhe de
         exibição"); a T2d o confirma ao implementar, e a tela da T6 depende dele.
      6. **Falha do Redis não derruba nem atrasa o `GET`.** A falha vira `null` (o cliente é criado com
         `retry: false`). **MEDIDO em 2026-11-24 (T2d, `@upstash/redis` 1.38.3):** o cliente **não tem
         timeout por padrão**. Contra um servidor TCP que aceita a conexão e não responde, com `retry: false`
         e sem `signal`, a chamada seguia **pendente aos 8 s**; com `signal: () => AbortSignal.timeout(1500)`
         abortou em 1519 ms. Por isso o cliente do contador é criado com esse `signal` (`PRAZO_DO_REDIS_MS`,
         1500 ms), **em forma de função** (o cliente é um singleton: sabotado com um `AbortSignal` fixo, a
         **segunda** leitura voltou em 1 ms, porque o sinal já tinha expirado). Com o Redis do compose
         **pausado** (mudo) a rota respondeu 200 e `null` em 1903 ms. **Limites:** não medi o Upstash de
         nuvem, e não investiguei os ~400 ms entre o prazo de 1500 ms e os 1903 ms. A leitura é opcional:
         perdê-la só vira `null`.
    - **(c)** Tirar a escrita do contador do PR do gate e entregá-la **junto com** o leitor, na T6.
      Nada escrito sem leitor e nada se perde (só "hoje"); o custo é descartar código já escrito e
      testado para reescrevê-lo depois.
- **Na tela:** uma faixa no shell do app (mesmo lugar de `FaixaDeAvisos`) mostra a janela da empresa
  e a próxima abertura, e os controles de ação ficam desabilitados com o motivo. Calculado no
  servidor pela mesma função pura, para cliente e servidor não divergirem.
- **Bypass auditado (RF-10) — mecanismo proposto em 2026-11-18 e ACEITO pelo dono do produto em
  2026-11-23 ([#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-7105707792);
  `05-revisao.md`); troca o texto anterior, "o `requireRole` devolve `foraDoExpediente` e a rota o
  repassa ao `audit()`".** Quem decide é o próprio `audit()` (`lib/audit/index.ts`), na hora de gravar
  a linha da mutação que **já** vai gravar: acrescenta `metadata.fora_do_expediente = true`. Não há
  linha nova — a doutrina de audit manda auditar quando há efeito, e uma linha emitida no gate
  registraria tentativas que a rota depois recusa por outro motivo. Dentro do expediente nada é
  acrescentado. O `requireRole` **não muda** por causa do RF-10 e nenhuma rota é editada.

  **Regra, na ordem em que é avaliada (do barato ao caro; a primeira que falhar encerra sem marcar):**
  1. **Ator humano de sessão numa organização:** `actorUserId` e `organizationId` presentes e
     `actorApiTokenId` ausente. Worker, cron, Bearer, MCP, IA e ingestão ficam de fora.
  2. **É uma mutação:** o método HTTP carimbado pelo `proxy.ts` (T0(e), mesmo cabeçalho que o gate
     lê) é de escrita. **Método ausente NÃO marca** — o oposto do gate: o gate é fail-closed para
     barrar, o campo é fail-open para marcar. Isso deixa de fora, sem regra extra, tudo o que roda sem
     requisição (workers) e as rotas `GET` que auditam leitura. A linha de recusa `authz.denied`
     (emitida pelo `requireRole`) é excluída por nome: é a recusa, não a ação. O carimbo **chega às
     Server Actions** (`POST`, medido — ver "Server Actions" abaixo), por isso a família de sessão
     `auth.` também é excluída por nome (decidido pelo dono em 2026-11-23, ponto 6).
  3. **O expediente da organização**, lido pela **mesma função de leitura do gate** (`carregarExpediente`),
     **envolvida por um cache próprio do `audit()`**: por organização, TTL de 30 s, em memória do
     processo, descartado quando `PATCH /settings/expediente` roda no mesmo processo. **O cache NÃO fica
     dentro de `carregarExpediente`:** o gate e `loadEligibleAttendants` leem direto no banco, sem cache
     (decisão do dono em 2026-11-24, [#110](https://github.com/itConesul/CRMPI/issues/110#issuecomment-7141507471)),
     para que o expediente salvo valha na hora para quem barra e para quem recebe conversa. Sem expediente configurado, ou
     inválido, ou dentro do horário: não marca. Dentro do expediente o custo é só o acerto de cache.
  4. **O papel, só se já estiver fora do expediente:** `rpc("fn_user_role_in_org", { p_org })` com o
     client da sessão — a **mesma fonte** que o `requireRole` usa (`lib/auth/require-role.ts`), nunca
     um snapshot. **Guarda de identidade, antes da `rpc`:** a sessão tem de SER o ator —
     `(await db.auth.getUser()).data.user?.id === entry.actorUserId`, a mesma conferência que o
     `audit()` já faz antes de `readSupportContext` (`lib/audit/index.ts:73-74`, medido em
     2026-11-19). A `rpc` usa o `auth.uid()` da sessão, então sem a guarda um `actorUserId` diferente
     do usuário da sessão leria o papel de OUTRA pessoa: a marca sairia errada, ou deixaria de sair.
     Sessão que não é o ator → não marca (e a linha segue sendo gravada). Só `admin` e `manager`
     marcam. **`agent` nunca marca, nem em rota isenta**
     (`mark-read`, `attendants/availability`): isenção é "o `agent` não é barrado ali", não é bypass.
     **Platform admin e sessão de suporte (proposta do review do #87, item 3; **decidido pelo dono em 2026-11-23**):
     MARCAM.** Eles passam pelo gate sem serem barrados (RF-6, RNF-1) e são os atores com mais poder e
     menos rastro de "fora do expediente": a sessão de suporte tem `support_session_id`, mas isso diz
     *quem* agiu, não *quando*; o platform admin sem vínculo não deixa nada. A `rpc` de papel devolve
     `null` para o platform admin sem vínculo, então para esses dois a regra 4 **não depende do papel**:
     `support_session_id` e `entry.actingAsPlatformAdmin` já estão no `audit()` na hora de gravar
     (`lib/audit/index.ts`) e contam como bypass, sem `rpc`. Custo: uma condição na regra 4. **A versão
     anterior desta spec dizia "não marcam" como padrão; era escolha de quem escreveu, não decisão do
     dono. O dono decidiu que MARCAM (abaixo).**
  5. **Falha nunca atrapalha:** erro ou tempo esgotado em 3 ou 4 → não marca e segue; o `try/catch`
     fica dentro do `audit()` e a linha é gravada sem o campo. Registra `logger.warn`, **sem** alerta
     Sentry por mutação (seria ruído proporcional ao tráfego); falha de *gravação* do audit continua
     alertando, como hoje. **Sinal agregado (proposta, review do #87 item 4):** só o `warn` não
     basta — se a leitura falhar sempre, a marca nunca sai e ninguém percebe. Além do `warn` por
     falha, o `audit()` emite **um** aviso por organização e por dia, por processo ("a marca do RF-10
     está falhando"), com a contagem acumulada, guardado no mesmo mapa em memória do cache da regra 3.
     Não é alerta por mutação: o ruído fica limitado a 1 por organização/dia/processo. A prova de que
     o caminho marca continua sendo o e2e da T2c; o aviso cobre o que o e2e não vê, a falha em
     produção depois do deploy.
  - **T2c — o que foi medido ao implementar o RF-10 (2026-11-24/25; o que NÃO foi provado está no fim).**
    (1) **Lista de exclusão por nome** (constante única em `lib/audit/fora-do-expediente.ts`, com teste):
    `authz.denied` e a família `auth.` (19 códigos) **não marcam** — decisão do dono.
    `organization.switched` e `profile.updated` também ficam fora, por **decisão do dono** (2026-11-25, no PR #127; a lista nasceu da proposta do autor e o dono a aceitou). `security.mfa_desativada` e
    `mfa.recovery_codes_regenerated` **marcam** de propósito. (2) **Rotas isentas do `agent` que
    auditam:** só `attendants/availability` (`attendant.availability_changed`) e `notifications/push`
    (`notification_prefs.changed`); `mark-read` não audita; `agent` nunca marca. (3) **Escritores diretos
    em `api_audit_log` fora do `audit()`:** só `lib/ai/handoff/orchestrator.ts` (ação da IA, sem ator
    humano), numa allowlist com motivo que só encolhe (`tests/unit/audit-so-um-escritor.test.ts`).
    (4) **Defeito que só o e2e achou:** o cache do expediente do `audit()`, como `Map` de módulo, **não é
    compartilhado** entre rota de API e Server Action no build de produção do Next (grafos de módulo
    diferentes): o `PATCH /settings/expediente` descartava só a cópia da rota, e uma Server Action marcou
    "fora" 0,7 s depois de o expediente virar "dentro". **Correção:** estado em `globalThis` por
    `Symbol.for`. Causa raiz provada pela prova inversa (desfeita só essa correção, o mesmo e2e reprova).
    Teste sem Next: `lib/expediente/cache-do-audit.instancias.test.ts` (`vi.resetModules`).
    (5) O e2e muda o expediente pela **API do produto** (`PATCH /settings/expediente`, admin com TOTP),
    nunca direto no banco, porque o cache de 30 s manteria o valor antigo. **Não provado:** Node 24 /
    `--experimental-async-context-frame`; instância com mais de um processo (o cache é por processo,
    TTL 30 s, e o `PATCH` só descarta o do processo que o atendeu).
  - **`void audit()` (125 chamadas): o que se sabe, o que NÃO foi medido e o que a T2c mede antes de
    depender disto (review do #87, item 2).** Fato lido no código, **não** medição: o corpo de
    `audit()` roda **de forma síncrona até o primeiro `await`**, dentro do contexto da requisição, mesmo
    quando o chamador faz `void audit(...)`. E o `audit()` de hoje já lê `cookies()` (via
    `createClient()`) depois de `await`s nesses mesmos casos — **precedente, não prova** de que
    `headers()` se comporta igual. **Regra decorrente (proposta):** a regra 2 chama `headers()` **na
    primeira instrução do `audit()`, antes de qualquer `await`** (guarda só a promessa; o `await` vem
    depois), para a leitura não depender de o contexto sobreviver ao fim da resposta.
    **Medição (2026-11-24): `headers()` devolve o método dentro de um `void audit()` depois de a
    resposta sair — a premissa vale. O RF-10 de ponta a ponta continua por provar (ver "Limites").**
    - **Como:** worktree descartável a partir de `feat/67-expediente-gate` (`164450a`, onde o `proxy.ts`
      carimba `x-metodo-http`), `pnpm e2e:build` + `next start` contra o Supabase local, **Node 22.23.5**
      (as imagens são `node:22-alpine`; `--experimental-async-context-frame` **não** estava ligado). Uma
      rota de sonda descartável, **não commitada** (`POST`/`PATCH`, caminho público
      `/api/v1/cron/sonda-void-audit`, só para dispensar login), faz `void audit({...})` e responde na
      hora; o `audit()` foi instrumentado (também descartável) para ler o método de três jeitos,
      **depois de esperar 800 ms** (a resposta já saiu): (a) `headers()` chamado na **primeira
      instrução**, promessa lida logo em seguida; (b) a **mesma promessa** lida 800 ms depois; (c) um
      **`headers()` novo** chamado 800 ms depois. Os três valores foram gravados em
      `api_audit_log.metadata` e lidos por `request_id`:
      `docker exec supabase_db_deskcomm-crm psql -U postgres -At -c "select metadata->>'modo', metadata->>'probe_cedo_sincrono', metadata->>'probe_promessa_guardada_lida_tarde', metadata->>'probe_headers_novo_chamado_tarde' from api_audit_log where request_id in (...)"`.
    - **Resultado** (10 requisições, **10 linhas gravadas**; as 3 leituras iguais em todas):

      | Caso | Resposta | Método lido (a / b / c) |
      |---|---|---|
      | `void` + `POST` (×5) | 90–106 ms | `POST` / `POST` / `POST` |
      | `void` + `PATCH` (×1) | 103 ms | `PATCH` / `PATCH` / `PATCH` |
      | `void` + `POST` com `x-metodo-http: GET` forjado (×1) | 94 ms | `POST` / `POST` / `POST` (o forjado é ignorado) |
      | `await` + `POST` (×3, controle) | ~915 ms | `POST` / `POST` / `POST` |

      A diferença de latência (≈ 95 ms contra ≈ 915 ms) é a prova de que, no modo `void`, **a resposta
      saiu antes de o `audit()` terminar** — e mesmo assim o método foi lido, **inclusive por um
      `headers()` chamado do zero depois**. Ou seja, a regra proposta (`headers()` na primeira
      instrução) funciona, **e a leitura tardia também funcionou**: a regra 2 não depende do cuidado
      de ordem para ser correta nesta versão do Node, embora o cuidado continue sendo o desenho
      defensivo.
    - **Limites (o que isto NÃO prova):**
      1. **Mede a premissa, não o RF-10.** A regra 3 (cache de 30 s), a regra 4 (`rpc fn_user_role_in_org`
         e a guarda de identidade) e a gravação de `fora_do_expediente` **não existem ainda**; o
         critério original ("a linha tem `fora_do_expediente` quando `admin` age fora do expediente")
         só se fecha no e2e da T2c.
      2. **Sem sessão.** A sonda é uma rota pública, sem ator; o `audit()` não passou pelo ramo de
         `getUser()` / `readSupportContext`, que têm latência real. O atraso fixo de 800 ms cobre o
         pior caso de **tempo**, não o fluxo autenticado.
      3. **Uma sessão de medição**, Node 22. **Não medido** com `--experimental-async-context-frame`
         (padrão do Node 24, segundo a documentação do Node, não medida aqui). **Não medi** como o Next
         guarda o contexto de `headers()` por dentro nem se ele muda com essa flag, então o resultado
         **não** se transfere sozinho para o Node 24. Se a imagem mudar de major, repetir a sonda.
      4. A sonda e a instrumentação **não estão no repositório**, de propósito (mesma técnica da Server
         Action). Para reproduzir: uma rota que faz `void audit({ action, requestId, metadata })` e
         responde com `NextResponse.json(...)`, e no início do `audit()` um
         `const p = headers()` seguido de leituras de `(await p).get("x-metodo-http")` antes e depois de
         um `await new Promise(r => setTimeout(r, 800))`.
    - **Plano B** (se uma medição futura falhar — Node 24, outra versão do Next ou o e2e da T2c):
      o mecanismo "o `audit()` decide" não vale para as 125 chamadas `void audit(`. Alternativas, em
      ordem de custo: (i) converter em `await audit()` só as chamadas de **mutação de `admin`/`manager`**
      (a marca só importa para elas; a lista sai do inventário da T2c); (ii) capturar o método **antes**
      do `void`, num argumento explícito do `audit()` que as rotas relevantes repassam — o que volta ao
      "rota por rota" já recusado, por isso só para a lista curta de (i); (iii) o `AsyncLocalStorage`
      continua **recusado** (§2.1: depende da versão do Node e falha em silêncio).
  - **Uma só verdade para a decisão.** "Fora do expediente **e** `admin`/`manager`" **já é uma função
    pura**, escrita na T1: `expedienteBarra({ papel, config, agora }).bypassAuditado`
    (`lib/expediente/expediente.ts`, no PR do gate). O `audit()` **chama essa função**; não reimplementa
    a conta. Para não pagar a `rpc` do papel dentro do expediente, ele pergunta antes
    `dentroDoExpediente(config, agora)` (a mesma que `expedienteBarra` usa por dentro) e só busca o
    papel se estiver fora. Sem isso `bypassAuditado` fica calculado e sem consumidor (anti-pattern 3
    do `CLAUDE.md`), e a regra existiria em dois lugares que divergem no primeiro ajuste de fuso.
  - **Custo:** dentro do expediente, nenhuma E/S além do cache. Fora dele, **uma** `rpc` por mutação
    auditada de sessão humana — o `audit()` já faz `getUser()` e `readSupportContext` por chamada
    (`lib/audit/index.ts`), então o custo não é categoria nova.
  - **Aceito:** o relógio é o do momento do `audit()`, não o do gate. Na fronteira do expediente uma
    ação iniciada às 17:59:59 e auditada às 18:00:01 sai marcada. Também aceito: até 30 s de atraso
    para a regra enxergar um expediente recém-alterado em OUTRO processo.
  - **Server Actions: medido, o carimbo CHEGA. Uma versão anterior deste texto (e do comentário na
    #67) afirmava o contrário e foi retratada em 2026-11-18.** Ela dizia que o carimbo cobre só
    `/api/v1` e que Server Actions "não marcam". Falso, por duas medidas:
    (1) **o matcher do `proxy.ts` cobre tudo, menos estáticos** —
    `git show feat/67-expediente-gate:proxy.ts | grep -n -A3 "matcher"` →
    `"/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)"`
    — e o carimbo é posto **antes** do retorno de rota pública; (2) **medido contra o app real**
    (build de produção, Supabase local, 2026-11-18): uma Server Action de sonda descartável, não
    commitada, leu `(await headers()).get("x-metodo-http")` e recebeu **`"POST"`**. A regra 2 portanto
    **alcança** as Server Actions, sem código extra: `grep -rlE "\baudit\(" app/actions --include=*.ts --exclude=*.test.ts | wc -l`
    → **32 arquivos** (em `d1d3c30`), mais **2** (`grep -rlE "^.use server.;?" app --include=*.ts --include=*.tsx | xargs grep -lE "\baudit\(" | grep -v "^app/actions/"`
    → `app/app/ai/agents/_actions.ts` e `app/app/ai/agents/[id]/_actions.ts`), incluindo as de `admin`
    que mais importam (`apagarDadosOperacionaisDaOrganizacao`, `updateTenant`, `updateBranding`,
    `updatePipelineConfig`). **Não foi medido** se o carimbo também chega a uma Server Action
    disparada por navegação sem JavaScript (envio nativo de formulário); a T2c prova com o e2e.
  - **O que sobra no lugar do "ponto 6" antigo — ruído, não furo:** Server Actions de **sessão e
    perfil** (logout, idioma, o próprio perfil) também são `POST` com ator humano, então um `admin` que
    sai do sistema às 23h teria a linha de `auth.logout` marcada como "fora do expediente". Isso não é
    bypass de ação de atendimento, é ruído que desvaloriza a marca. **Decidido pelo dono em 2026-11-23
    (ponto 6):** a regra 2 exclui por nome a família `auth.` (`grep -c '^  "auth\.' lib/audit/actions.ts` → 19
    códigos) além de `authz.denied`; a T2c mede que outras famílias de sessão/perfil entram
    (`profile.*`, `onboarding.*`) e fecha a lista numa **constante compartilhada**, com teste.
  - **Decidido pelo dono (2026-11-23, ponto 2): sessão de suporte/impersonação e platform admin
    MARCAM**, identificados por `support_session_id` e `actingAsPlatformAdmin`, sem depender da `rpc`
    de papel ([#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-7105707792)). A alternativa
    recusada era "não marcam", porque o RF-6 fala só de `admin`/`manager` do tenant e o suporte já é
    rastreado por `support_session_id`. Ressalva que fica para a T2c observar: marcar o suporte pode
    virar ruído numa instalação em que ele atua fora do horário por rotina. **A T2c precisa conferir,
    nos chamadores de `audit()`, que `actingAsPlatformAdmin` é de fato preenchido** — só o `audit()`
    foi lido aqui.
  - **Vigia:** só `lib/audit/index.ts` pode inserir em `api_audit_log`; hoje há **um escritor que o
    contorna**, `lib/ai/handoff/orchestrator.ts` (ação da IA, sem ator humano, fora da regra por
    construção). A varredura de `03-testes.md` o nomeia numa allowlist com motivo que só encolhe.

  **Alternativas recusadas, com a medida que as recusa** (rode os comandos; os números envelhecem,
  os comandos não):
  - **"A rota repassa" (a letra da spec anterior).** Reprovada por tamanho e por modo de falha.
    `grep -rlE "requireRole\(" app/api/v1 --include=route.ts | wc -l` → **168** rotas;
    `grep -rhoE "\baudit\(" app/api/v1 --include=route.ts | wc -l` → **187** chamadas nelas, mas
    `grep -rhoE "\baudit\(" app lib workers --include=*.ts --include=*.tsx --exclude=*.test.ts --exclude=*.test.tsx | wc -l`
    → **315** no total, e `grep -rlE "\baudit\(" app lib workers --include=*.ts --include=*.tsx --exclude=*.test.ts --exclude=*.test.tsx | grep -v "/route.ts$" | wc -l`
    → **68 arquivos fora de `route.ts`** chamam `audit()` (helpers e libs). Repassar exigiria alterar
    centenas de pontos e as assinaturas desses helpers, e **a rota esquecida gera bypass sem rastro**:
    nada falha, a marca só não existe. É o modo de falha que a doutrina de audit mais teme.
    (Medido em `d1d3c30`, `develop`, em 2026-11-18.)
  - **Canal por requisição com `AsyncLocalStorage.enterWith()` dentro do `requireRole`.** Recusado
    porque o resultado **depende da versão do Node e a falha é silenciosa** (o campo nunca é gravado,
    nenhum teste de unidade acusa). Medido com o script abaixo, em Node 22.23.5 (`.nvmrc` = 22):
    sem flag, o valor **volta** ao chamador depois do `await` nas quatro variantes (I/O real, três
    níveis, dentro de outro `als.run()`, lido num `setImmediate` como o `void audit()`); com
    `--experimental-async-context-frame`, **não volta em nenhuma** (`null` nas quatro). Essa flag
    liga a implementação `AsyncContextFrame`, que o Node 24 adota por padrão (informação da
    documentação do Node, **não medida aqui**), e `package.json` declara `"node": ">=22"` e as imagens
    usam `node:22-alpine`. Ou seja: funciona hoje, e para de funcionar numa troca de base de imagem.
    Não foi medido dentro do runtime do Next.
    ```js
    // als-prova.mjs — rode: node als-prova.mjs  e  node --experimental-async-context-frame als-prova.mjs
    import { AsyncLocalStorage } from "node:async_hooks";
    import { setTimeout as sleep } from "node:timers/promises";
    const als = new AsyncLocalStorage();
    async function nivel2() { await sleep(5); als.enterWith({ fora: true }); }
    async function requireRoleFake() { await sleep(5); await nivel2(); }
    async function handler() { await requireRoleFake(); return als.getStore(); }
    console.log(process.version, JSON.stringify((await handler()) ?? null));
    // Node 22.23.5 sem flag → {"fora":true}   |   com a flag → null
    ```
    (As quatro variantes citadas acima foram medidas num script descartável, não commitado; o bloco é
    a forma mínima, **rodada nas duas formas em 2026-11-18**, e reproduz a divergência. Quem
    implementar roda as duas antes de confiar.)
- **Distribuição (RF-12).** `eligibility.ts` hoje decide "disponível ∧ janela própria ∧ folga"
  (`isWithinSchedule` sobre `attendant_availability.schedule`). O expediente da organização entra
  como **mais uma conjunção**, via parâmetro opcional `expediente` em `lib/routing/eligibility.ts`
  e `decide.ts` (funções puras; `undefined` = sem restrição, então nenhum chamador existente muda de
  comportamento). Quem monta a entrada do roteamento passa `organizations.settings.business_hours`.
  Fora do expediente, ninguém `agent` é elegível e a conversa **fica na fila sem dono** (RF-11).
  `admin`/`manager` continuam elegíveis porque não são barrados (RF-6).
- **Ingestão intocada (RF-11).** Webhooks de mensagem recebida não chamam `requireRole` e não leem o
  expediente: a mensagem do cliente entra sempre. O teste de isenções varre `webhooks/*` para
  garantir que ninguém ligue o gate ali sem querer.
- **Isenções** (RNF-1), todas testadas: papéis `manager` e `admin`; platform admin; sessão de
  suporte/impersonação; e o que fica **fora do gate** (Bearer, MCP, IA, webhooks, cron, ingestão; ver
  §2.1 acima). `cron/*` e `webhooks/*` não chamam `requireRole`: o teste de varredura reprova quem
  ligar o gate ali.
- **Leitura e saída sempre alcançáveis:** `GET`, `/app/fora-de-expediente`, logout e troca de
  organização nunca são barrados. Como não há redirecionamento forçado, não existe laço a evitar.

### 2.2 Setor (RF-1, RF-2, RF-7 a RF-9)
- Tabela `departments` e tabela de vínculo `department_members` (§4). Conversa ganha
  `department_id` **nullable**: conversa que chega pela ingestão nasce **sem setor** e é visível a
  todos os `agent` (RF-7 "ou sem setor"). Quem põe o setor é PRD-02 (distribuição) e PRD-07 (URA).
- Visibilidade por **nova função** `fn_can_view_conversation(p_org, p_assigned, p_department)`,
  porque `create or replace` não troca a lista de argumentos. **Todos** os chamadores da assinatura
  antiga (5, §1) migram para a nova na mesma migration e a antiga é **removida** — deixá-la viva
  faria qualquer policy, função ou RPC esquecida ignorar o setor em silêncio (condição 2 da
  aprovação). Como `drop function` falha se ainda houver dependente, um chamador esquecido aparece
  como erro no `install` (`ON_ERROR_STOP=1`) em vez de vazar. O `update.sh` (sem `ON_ERROR_STOP`)
  reaplica o baseline de cima para baixo, então o estado final é o do apêndice novo.
- Regra proposta (ver §4.3): `viewer/manager/admin` e platform admin veem tudo; `agent` vê a conversa
  se **é o dono**, **ou** (`department_id` é nulo **ou** está entre os seus setores) **e** a regra de
  `visibility_mode` já existente a admite. As duas restrições **somam**; nenhuma substitui a outra.
- **Realtime:** `postgres_changes` aplica a RLS de SELECT ao assinante, então a mudança de policy
  cobre RF-9 sem código novo — **desde que não haja canal de broadcast**. **Medido em 2026-11-19 (§1,
  T0(b)): havia um** (`org:<org>:queue`, público, sem assinante no app, com `conversation_id` e `reason`).
  **O dono decidiu removê-lo em 2026-11-24** ([#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-7133170911))
  e o #100 o removeu (`8a2d197`), então a condição **passa a valer com o #100 na `develop`**; antes da
  T4b/T8, **conferir que ele está lá** (`git branch -r --contains 8a2d197`). Restam os dois `broadcast`
  (`alerts-platform`, `tenant-health`), só assinantes, a medir na #103: pelo nome parecem de
  plataforma, mas **ninguém leu os payloads nem achou quem emite**; não afirmo que não carreguem dado de
  conversa.
  Limites medidos na T0 (§1) e a provar na T8: a conversa que **sai** do escopo não gera evento
  de remoção; o `DELETE` não passa pela RLS e só leva o id, mas **com o filtro que o app usa nem chega**.
- **Escrita (N2, RF-14):** a mesma regra vale em `UPDATE`/`DELETE` de `conversations` e em
  `INSERT`/`UPDATE`/`DELETE` de `messages` (§4.3). A alternativa recusada na versão anterior
  ("a issue pede só leitura") deixou de valer: o dono do produto decidiu o contrário e a medição
  confirmou um buraco real no `INSERT` de `messages`.

### Alternativas recusadas
| Alternativa | Por que não |
|---|---|
| Nova tabela `tenant_settings` (do texto original) | O repo usa `organizations.settings`; duas fontes para a mesma config é o defeito que o CLAUDE.md proíbe (DIRC) |
| Reaproveitar `attendant_availability.schedule` como expediente | É por **usuário**; o expediente é da **organização**. Misturar obrigaria a copiar a janela para cada atendente e a perderia ao criar um novo |
| Expediente no `proxy.ts` | Edge sem banco; exigiria ler `organizations.settings` em toda requisição, inclusive estáticas |
| Reaproveitar `channel_routing_*` como departamento | É "quem responde por este **número**". Setor atravessa canais (um departamento atende vários números) e vice-versa |
| `department_id` em `crm_leads` (do texto original) | A conversa é `conversations`; o lead é o funil. O isolamento pedido é de atendimento |
| Manter a policy de **escrita** sem setor | **Recusada em 2026-11-17 (N2).** Medido: `INSERT` em `messages` de conversa que o agente não vê passa. A escrita passa a exigir a mesma visibilidade (§4.3); a transferência continua por `fn_conversation_assign` (`security definer`) |
| `on delete set null` em `conversations.department_id` | **Recusada em 2026-11-17 (N1).** Apagar um setor devolveria todas as suas conversas a "sem setor", visível a todos os `agent`: uma regressão de privacidade silenciosa. Fica `no action` + 409 + reatribuição explícita (§4.2) |
| Gate de expediente opt-in por rota (`exigeExpediente: true`) | **Recusada em 2026-11-17.** Rota esquecida fica aberta às 22h. Fail-closed com isenções justificadas (§2.1) |
| Uma linha de `authz.denied` por tentativa barrada | **Recusada em 2026-11-17 (N4).** Retry e polling inflam o audit log. Contador agregado (§2.1) |
| Estender o `scheduleWindowSchema` compartilhado para aceitar a virada | **Recusada em 2026-11-17** (revisão do PR, 19:43): a agenda (`horarios-livres.ts`) descarta janela com `end < start` e 3 consumidores usam `.parse`; roteamento e agenda divergiriam sobre o mesmo dado. Adotado: schema **próprio** do expediente + a função de janela compartilhada com a virada desligada por padrão (§2.1, N3) |
| Bloquear a tela inteira fora do expediente (o que o texto pedia) | Perde rascunho e impede consulta. Decidido na Q1: barra-se a ação, não a leitura |

## 3. Contratos

**Erro:** `OUT_OF_WORK_HOURS` (403) em `lib/api/errors.ts`, mensagem em português via `traduzir`.
Envelope padrão `{ error: { code, message, details? } }` com `details: { opens_at }` quando calculável
(próxima abertura no fuso da organização).

**Zod** (em `lib/schemas/`, junto de `routing.ts`):
- `expedienteConfigSchema` (próprio, em `lib/schemas/routing.ts`): `{ timezone, windows }` com a MESMA
  validação de fuso do atendente (`availabilityScheduleSchema.shape.timezone`) e janelas
  `expedienteWindowSchema`, que aceitam `end < start` (virada de dia) e rejeitam `start == end` (N3, §2.1).
  O schema do **atendente** não muda.
- `departamentoInputSchema = { name: string 1..60, trim, único por organização sem diferenciar caixa }`.
- `vinculoDepartamentoInputSchema = { user_id: uuid }`.

**Rotas** (`/api/v1/…`, snake_case, wrappers `ok()`/`fail()`, `organization_id` resolvido do cookie,
nunca do body):
| Método | Rota | Papel | Observação |
|---|---|---|---|
| `GET` | `/settings/expediente` | `viewer`+ (qualquer membro) | Lê a config **e o estado avaliado pelo servidor**: `agora` (`dow`, `hhmm` e ISO no fuso da organização), `dentro` (booleano) e `opens_at`. A faixa do shell chama esta rota para **todo** usuário logado, e o e2e constrói a janela em torno desse `agora`, sem depender do relógio do runner. **Era `agent`+ e estava errado:** o `viewer` e a sessão de suporte somente-leitura levavam 403 a cada carga de tela, e cada 403 grava um `authz.denied` (medido: 3 linhas em ~70 s; achado pelo `e2e-parte (3)` do CI) |
| `PATCH` | `/settings/expediente` | `admin` | Audita `expediente.config_changed` |
| `GET/POST` | `/departments` | leitura `agent`+, escrita `admin` | `Idempotency-Key` no POST |
| `PATCH/DELETE` | `/departments/[id]` | `admin` | `DELETE` com conversas no setor responde **`409 department_not_empty`** com `details: { conversation_count }` (N1); sem conversas, apaga. Nunca apaga nem desvincula conversa |
| `POST` | `/departments/[id]/reassign` | `admin` | Corpo `{ to_department_id: uuid }` (outro setor da **mesma** organização) ou `{ sem_setor: true }` — a volta a "sem setor" é um ato **explícito**. Audita `department.conversations_reassigned` com a contagem |
| `PUT` | `/departments/[id]/members` | `admin` | Substitui a lista de operadores do setor |

**Tela:** faixa no shell do app + página informativa `/app/fora-de-expediente` (RF-5), com a janela da
empresa, o horário de reabertura e o botão de sair. Configuração em **Configurações › Atendimento**: seção "Expediente" e seção "Departamentos".

## 4. Dados — PROPOSTA DE SCHEMA (aguarda aprovação)

> Nada abaixo foi escrito como migration. O número `NNNN` é o próximo de `ls supabase/migrations/`
> no momento de implementar — descubra com `ls supabase/migrations/ | tail -3` (em `eb8bd68`, a mesma
> base das demais medições desta spec, o último era `0238`).

### 4.1 Reaproveita o que já existe
- `organizations.settings.business_hours` (jsonb **já existente**): **sem coluna nova**. Schema Zod
  central em `lib/schemas/`; a UI lê por esse schema, não por path solto (anti-pattern 6).
- Papéis `viewer/agent/manager/admin` e `fn_user_role_in_org`, `fn_user_org_ids`, `fn_is_platform_admin`.
- `fn_set_updated_at()` (`baseline.sql`), o trigger padrão de `updated_at` do repo.
- `user_organizations` (`unique (user_id, organization_id)`), alvo da FK composta do vínculo.

**Evolução prevista — NÃO faz parte desta spec (Q9).** Se o dono do produto quiser expediente por
setor: `departments.business_hours jsonb` **nullable**, com fallback para
`organizations.settings.business_hours` quando nulo. É **aditivo**: sem backfill, nenhuma linha
existente muda de comportamento e o `update.sh` de um clone não quebra. Registrada aqui para o §4.2
não fechar a porta (`departments` já tem `updated_at` e trigger, e nada nele pressupõe expediente
único).

### 4.2 Novo
```sql
-- departments: 1 linha por setor
create table if not exists public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id)            -- alvo das FKs compostas abaixo
);
create unique index if not exists uq_departments_org_name
  on public.departments (organization_id, lower(btrim(name)));
drop trigger if exists departments_updated_at on public.departments;
create trigger departments_updated_at before update on public.departments
  for each row execute function public.fn_set_updated_at();

-- department_members: operador ↔ setor (N:N). A integridade entre organizações é CONSTRAINT, não teste.
create table if not exists public.department_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id   uuid not null,
  user_id         uuid not null,
  created_at      timestamptz not null default now(),
  primary key (department_id, user_id),
  -- o setor tem de ser da MESMA organização da linha
  foreign key (department_id, organization_id)
    references public.departments (id, organization_id) on delete cascade,
  -- o usuário tem de ser membro dessa organização (e não só existir em auth.users)
  foreign key (organization_id, user_id)
    references public.user_organizations (organization_id, user_id) on delete cascade
);
create index if not exists idx_department_members_user
  on public.department_members (organization_id, user_id);

-- conversa ganha o setor (nullable: nasce sem setor)
alter table public.conversations add column if not exists department_id uuid;
-- idempotente: só cria se ainda não existir (re-aplicação pelo update.sh)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_department_fk') then
    alter table public.conversations add constraint conversations_department_fk
      foreign key (department_id, organization_id)
      references public.departments (id, organization_id)   -- NO ACTION (N1): bloqueia apagar setor com conversas
      not valid;                                            -- não varre a tabela com lock forte (ver abaixo)
  end if;
end $$;
-- VALIDATE em seguida: varre com lock mais fraco (não bloqueia leitura nem escrita). Só roda se ainda
-- não foi validada, então re-aplicar pelo update.sh é um no-op.
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'conversations_department_fk' and not convalidated) then
    alter table public.conversations validate constraint conversations_department_fk;
  end if;
end $$;
create index if not exists idx_conversations_department
  on public.conversations (organization_id, department_id) where department_id is not null;
```
- **N1 — `conversations_department_fk` é `no action` (o padrão), não `set null` nem `cascade`.**
  Excluir um setor **com conversas** falha com `23503` (a API traduz em `409 department_not_empty`) e
  excluir um setor **vazio** funciona. Nunca apaga conversa (anti-pattern 7, cascade fantasma) e nunca
  devolve conversa a "sem setor" sem um ato explícito (`POST /departments/[id]/reassign`).
  **Por que `no action` e não `restrict`:** o `restrict` é verificado na hora e não pode ser adiado;
  o `no action` é verificado no fim do comando. Medido em tabelas de teste: **ambos** deixaram apagar
  a organização inteira (que apaga setores e conversas em cascata), e o `no action` **bloqueou** apagar
  só o setor com conversas (o `restrict` bloquearia por definição; não o medi). A escolha é pelo que
  **não depende da ordem do cascade** — uma garantia por definição, e não só pelo ordenamento que
  testei.
- **`NOT VALID` + `VALIDATE` na FK da conversa (decisão do dono do produto, 2026-11-17).** `conversations`
  é a tabela com tráfego ao vivo, e um `add constraint foreign key` comum toma um lock que bloqueia
  escrita enquanto varre a tabela inteira — num `update.sh` de uma VPS em produção isso é conversa
  travada. Com `NOT VALID` o lock é breve e só as linhas **novas** são checadas; o `VALIDATE`
  seguinte varre com um lock que **não** bloqueia leitura nem escrita. Como todo `department_id`
  existente é nulo (a FK não checa nulos), a validação é trivialmente satisfeita. As tabelas novas
  (`departments`, `department_members`) nascem vazias e não precisam disso.
- **FKs compostas (condição 1).** O `organization_id` do vínculo (e da conversa) é **amarrado** à
  organização do setor, e o `user_id` é amarrado a um **membro** daquela organização:
  `unique (id, organization_id)` em `departments` é o alvo, e `user_organizations` já tem
  `unique (user_id, organization_id)`. Medido: o Postgres aceita a FK `(organization_id, user_id)`
  mesmo com as colunas em ordem diferente da unique existente. Um `INSERT` errado (rota com bug,
  client admin) **falha**, em vez de ser pego depois por teste. Com `MATCH SIMPLE`, a FK da conversa
  não é checada quando `department_id` é nulo.
  `user_organizations.revoked_at` é um *soft delete*: a FK não o enxerga, mas `fn_user_role_in_org`
  devolve nulo para membro revogado, então a RLS já nega; a rota de vínculo (T5) também só aceita
  membro ativo.
- `updated_at` de `departments` usa o `fn_set_updated_at()` do repo (trigger no apêndice).
- RLS por comando (nunca `FOR ALL`), por `fn_user_org_ids()`: `SELECT` para membros da org;
  `INSERT/UPDATE/DELETE` só `admin` (`fn_role_at_least(organization_id,'admin')`). Nome da policy no
  padrão `tenant_isolation_<tabela>_<comando>` quando houver aderência; senão o padrão por comando
  já usado em `attendant_availability`.

### 4.3 RLS de leitura (a mudança de maior risco)
```sql
create or replace function public.fn_can_view_conversation(
  p_org uuid, p_assigned_to_user_id uuid, p_department_id uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when public.fn_is_platform_admin() then true
    when public.fn_user_role_in_org(p_org) is null then false
    when public.fn_user_role_in_org(p_org) in ('viewer','manager','admin') then true
    when p_assigned_to_user_id = auth.uid() then true                       -- dono sempre vê (Q5)
    when not (p_department_id is null
              or exists (select 1 from public.department_members m
                          where m.department_id = p_department_id
                            and m.user_id = auth.uid()))                    -- setor alheio: nega
         then false
    else case coalesce((select settings->>'visibility_mode'
                          from public.organizations where id = p_org),'own_and_unassigned')
           when 'all' then true
           when 'own_and_unassigned' then p_assigned_to_user_id is null
           else false end
  end;
$$;
revoke all on function public.fn_can_view_conversation(uuid, uuid, uuid) from public;
revoke execute on function public.fn_can_view_conversation(uuid, uuid, uuid) from anon;
grant  execute on function public.fn_can_view_conversation(uuid, uuid, uuid) to authenticated, service_role;
```
As **duas origens** de `EXECUTE` são revogadas (A: `anon` direto; B: `PUBLIC`), como a doutrina exige.
`messages_select` não muda (herda por `exists`).

**Migração dos chamadores e remoção da assinatura antiga (condição 2).** Na mesma migration:
1. recriar com a assinatura nova, passando o setor da conversa, os 5 chamadores do §1:
   `conversations_select`, `fn_appointment_stamp`, `fn_meet_action`,
   `tenant_isolation_ai_reply_drafts_all` e `fn_reply_action`. Onde a função só tem
   `organization_id`/`assigned_to_user_id` à mão, ela passa a ler `department_id` da própria
   conversa (T3 decide chamador a chamador);
2. `drop function if exists public.fn_can_view_conversation(uuid, uuid);` ao fim do apêndice. Se algum
   dependente ficou para trás o `drop` falha no `install` (`ON_ERROR_STOP=1`) e o problema aparece
   antes de chegar a um self-hoster;
3. um **teste de invariante por consulta ao catálogo** garante que nenhuma policy, função nem trigger
   referencia a assinatura antiga, e que cada chamador respeita o setor (um caso por chamador):
   `tests/invariants/fn-can-view-conversation-chamadores.test.ts`.

**`update.sh` e o `drop function` (cuidado do review, 2026-11-17).** O `baseline.sql` é um dump seguido
de apêndices, e o `update.sh` o **reaplica inteiro, de cima para baixo, sem `ON_ERROR_STOP`**. Então, a
cada reaplicação, **o dump recria a função antiga** (e os apêndices anteriores recriam os chamadores
com ela); o apêndice novo, por vir **depois**, migra os chamadores e a remove no fim. O estado final é
o certo. A armadilha é o inverso: um dependente esquecido faz o `drop` falhar, e **sem
`ON_ERROR_STOP` a falha passa em silêncio** — o clone fica com a função antiga viva (o estado de
hoje, mais seguro do que quebrar, mas sem a regra de setor nesse chamador). Por isso o teste de
`update` com **banco povoado** é obrigatório e reaplica o baseline **duas vezes**: ao fim, a assinatura
antiga não existe e nenhum objeto aponta para ela.

**Escrita com a mesma regra (N2, RF-14) — SQL por extenso.** `A` é o predicado que já existe hoje em
`conversations_agent_*` (platform admin, ou membro da organização com papel `agent`+), escrito aqui
sem abreviação:
```sql
-- A = public.fn_is_platform_admin()
--     or ((organization_id in (select public.fn_user_org_ids()))
--         and public.fn_role_at_least(organization_id, 'agent'))

-- conversations: INSERT, UPDATE e DELETE exigem a MESMA visibilidade do SELECT. O WITH CHECK impede
-- criar ou mover uma conversa para onde quem escreve não enxerga.
drop policy if exists conversations_agent_insert on public.conversations;
create policy conversations_agent_insert on public.conversations for insert with check (
  ( public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent')) )
  and public.fn_can_view_conversation(organization_id, assigned_to_user_id, department_id)
);

drop policy if exists conversations_agent_update on public.conversations;
create policy conversations_agent_update on public.conversations for update
  using (
    ( public.fn_is_platform_admin()
      or ((organization_id in (select public.fn_user_org_ids()))
          and public.fn_role_at_least(organization_id, 'agent')) )
    and public.fn_can_view_conversation(organization_id, assigned_to_user_id, department_id)
  )
  with check (
    ( public.fn_is_platform_admin()
      or ((organization_id in (select public.fn_user_org_ids()))
          and public.fn_role_at_least(organization_id, 'agent')) )
    and public.fn_can_view_conversation(organization_id, assigned_to_user_id, department_id)
  );

drop policy if exists conversations_agent_delete on public.conversations;
create policy conversations_agent_delete on public.conversations for delete using (
  ( public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and public.fn_role_at_least(organization_id, 'agent')) )
  and public.fn_can_view_conversation(organization_id, assigned_to_user_id, department_id)
);

-- messages: INSERT, UPDATE e DELETE exigem enxergar a conversa. O exists roda com a RLS de quem
-- chama, então herda a regra de conversations_select — é o mesmo mecanismo do messages_select.
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert with check (
  public.fn_is_platform_admin()
  or ((organization_id in (select public.fn_user_org_ids()))
      and exists (select 1 from public.conversations c where c.id = messages.conversation_id))
);

drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update
  using (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and exists (select 1 from public.conversations c where c.id = messages.conversation_id))
  )
  with check (
    public.fn_is_platform_admin()
    or ((organization_id in (select public.fn_user_org_ids()))
        and exists (select 1 from public.conversations c where c.id = messages.conversation_id))
  );

drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete using (
  public.fn_is_platform_admin()
  or ((organization_id in (select public.fn_user_org_ids()))
      and exists (select 1 from public.conversations c where c.id = messages.conversation_id))
);
```
- **Guarda do `department_id` — ACEITA pelo dono do produto (2026-11-17); deixa de ser "proposta do
  autor".** O `WITH CHECK` acima impede mover uma conversa para um setor que o agente não enxerga, mas
  **não** impede um `agent` de trocar o setor de uma conversa que enxerga, nem de zerá-lo (o que a
  torna visível a todos). A regra decidida: **`agent` não muda nem zera o setor**; `manager`+, platform
  admin e `service_role` podem; `fn_conversation_assign` continua `security definer`. Por extenso:
```sql
create or replace function public.fn_guard_department_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.department_id is distinct from old.department_id
     and auth.uid() is not null                          -- service_role e postgres não têm JWT: passam
     and not public.fn_is_platform_admin()
     and not public.fn_role_at_least(new.organization_id, 'manager') then
    raise exception 'department_id só pode ser alterado por manager ou admin' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.fn_guard_department_change() from public;
revoke execute on function public.fn_guard_department_change() from anon;

drop trigger if exists conversations_guard_department on public.conversations;
create trigger conversations_guard_department
  before update of department_id on public.conversations
  for each row execute function public.fn_guard_department_change();
```
  O trigger é só de `UPDATE`: criar a conversa já passa pela policy de `INSERT` acima (o setor tem de
  ser um que quem cria enxerga). Quem muda setor depois é o PRD-02/PRD-07 e a rota de reatribuição do
  admin; se o PRD-02 vier a mudar o setor dentro de `fn_conversation_assign`, o `auth.uid()` continua
  sendo o do chamador e o trigger o barraria para um `agent` — decisão daquele PRD. Entra na **T4b**,
  com um teste por papel (`agent` não muda nem zera; `manager`, `admin`, platform admin e
  `service_role` mudam).
- **`INSERT` manual por `agent` com `visibility_mode = own` (caso registrado a pedido do revisor,
  2026-11-17).** Em `own`, uma conversa **sem dono** não é visível a quem a cria (a função só admite
  as próprias), então o `WITH CHECK` da policy de `INSERT` **nega** um `INSERT` direto, pelo
  PostgREST com o JWT do agente, que não traga `assigned_to_user_id = auth.uid()`. Com o dono
  preenchido com o próprio autor passa; em `own_and_unassigned` (o padrão) e em `all` a conversa sem
  dono já é visível e passa. **A rota de produto não é afetada:** `conversations/open-with-contact`, o
  caminho em que um `agent` abre conversa à mão, usa o client **admin** (bypassa a RLS) e a
  ingestão de mensagem também. Não há `INSERT` em `conversations` pelo client de sessão em código de
  produto. O comportamento "negado" é, portanto, **o esperado e fica fixado por teste**, e não um
  defeito: quem quiser criar conversa por JWT em `own` tem de se atribuir como dono.
- **Risco a testar:** o `WITH CHECK` por visibilidade rejeita um `UPDATE` direto que deixa a linha
  invisível ao próprio autor (ex.: um `agent` com `visibility_mode = own` que **solta** a conversa:
  a linha nova fica sem dono e deixa de ser visível a ele). Fluxos de soltar/transferir já passam por
  `fn_conversation_assign` (`security definer`); a T3 confere que **nenhuma** rota faz esse `UPDATE`
  direto, e a T4b tem um teste por fluxo (assumir, soltar, transferir, encerrar).

### 4.4 Impacto em quem já instalou (`update.sh`)
- Migration + **apêndice idempotente** no `baseline.sql` (`create … if not exists`, `add column if not
  exists`, `create or replace function`), acima do bloco de varredura anon.
- **Nenhuma linha existente muda de comportamento no dia da migration:** toda conversa existente tem
  `department_id` nulo = "sem setor" = visível como hoje; `business_hours` ausente = sem expediente.
  Não há backfill nem constraint nova sobre dados antigos: as FKs compostas novas só valem para
  colunas novas (`department_id` nulo não é checado). *(A frase "nenhuma linha muda" só vale nesse
  dia: depois dele, apagar setor é bloqueado por N1 justamente para o comportamento não mudar em
  silêncio.)*
- **`update.sh` sem travar tabela com tráfego:** a FK da conversa entra com `NOT VALID` e é validada
  em seguida (§4.2), e a re-aplicação é idempotente (só valida se ainda não validou).
- **A troca das policies é a parte que muda comportamento** (N2: escrita passa a exigir visibilidade).
  Ela fica na **T4b**, depois da T3, e é testada com o `baseline.sql` em `install` e `update` contra
  um banco **com conversas existentes**, para provar que um clone com dados continua vendo e
  operando como antes.
- `lib/database.types.ts` regenerado. Linha em `supabase/migrations/MANIFEST.md`. `updated_at` de
  `departments` por `fn_set_updated_at()` (§4.2).

### 4.5 Rotas que usam o client **admin**
O client admin bypassa a RLS. Qualquer rota que liste conversas com ele e sirva a um `agent` precisa
aplicar a regra de setor **na consulta**, com `organization_id` resolvido do cookie. A lista dessas
rotas é a saída do comando do §1 e entra em `04-tarefas.md` como tarefa de auditoria (T3). Sem ela, a
RLS correta no banco coexiste com uma API que vaza. **Por decisão do dono do produto (condição 4),
a T3 é pré-requisito de ativar a RLS de setor (T4b), e não uma tarefa posterior:** primeiro nenhuma
rota contorna a regra, depois a regra é ligada.

## 5. Rastreabilidade
| Requisito | Onde é atendido neste design |
|---|---|
| RF-1, RF-2 | §3 (rotas `/departments`), §4.2 |
| RF-3 | §2.1, §3 (`PATCH /settings/expediente`), §4.1 |
| RF-4 | §2.1 (`requireRole`), §3 (`OUT_OF_WORK_HOURS`) |
| RF-5 | §2.1 (faixa no shell do app), §3 (tela) |
| RF-6, RNF-1 | §2.1 (isenções) |
| RF-10 | §2.1 (bypass auditado), §7 |
| RF-11 | §2.1 (ingestão intocada), §8 |
| RF-12 | §2.1 (distribuição), §6 |
| RF-3 (virada de dia) | §2.1 (N3) |
| RF-4 (fail-closed) | §2.1 (onde aplicar) |
| RF-13 | §3 (`409 department_not_empty`, `reassign`), §4.2 (N1) |
| RF-14 | §4.3 (N2), §1 (medição) |
| RNF-5 | §2.1 (contador agregado), §7 |
| RF-7, RF-8 | §4.3 |
| RF-9 | §2.2 (Realtime herda a RLS) + NÃO VERIFICADO do §1 |
| RNF-2 | §4.3, §4.5, `03-testes.md` |
| RNF-3 | §4.4 |
| RNF-4 | nenhuma chamada de LLM em todo o design |

## 6. Interação com o que já existe
- **Horário por atendente** continua valendo **além** do expediente: ser elegível a receber
  distribuição exige estar no expediente da empresa **e** na janela própria. São duas camadas
  somadas, não duas fontes da mesma verdade — a primeira é política da organização, a segunda é
  disponibilidade pessoal.
- **Agente de IA** mantém sua janela. Fora do expediente humano, quem atende o cliente é a IA (se a
  organização a tem) ou ninguém até a abertura (Q7).
- **`visibility_mode`** permanece e soma com o setor (§4.3).

## 7. Living System Checklist
(`docs/doctrine/sistema-vivo.md`) — cada resposta nomeia o artefato concreto.
- **Entrada e saída:** entrada = `PATCH /settings/expediente` e `/departments*` (admin); saída = 403
  `OUT_OF_WORK_HOURS` em `requireRole` (rotas de ação), faixa na tela com link para `/app/fora-de-expediente`, e a RLS de
  `conversations`.
- **Emite atividade/log:** audit `expediente.config_changed`, `department.created/updated/deleted`,
  `department.member_set` e `department.conversations_reassigned` em `api_audit_log`; ação de
  `admin`/`manager` fora do expediente carrega `metadata.fora_do_expediente = true` na linha da própria
  mutação (RF-10). **A tentativa barrada NÃO gera linha de audit** (N4, decidido): é contada no
  contador agregado `expediente:barrados:<org>:<dia>` (§2.1). Nenhuma rodada que não fez nada audita.
- **Aparece na tela:** Configurações › Atendimento (seções Expediente e Departamentos) e
  `/app/fora-de-expediente`. O cabeçalho da seção Expediente mostra **quantas tentativas foram barradas
  hoje**, lido do contador agregado (`—` se o Redis não responde): dado para o admin enxergar se a
  regra está pegando.
- **Porta na navegação (`lib/navigation/registry.ts`):** as seções ficam dentro de Configurações ›
  Atendimento, que já tem porta. `/app/fora-de-expediente` é destino do link da faixa, não item de
  menu: entra na allowlist de `tests/unit/navegacao-completude.test.ts` **com justificativa escrita**.
- **Mecanismo anti-morte:** falha aberta (§2.1); `admin`/`manager` nunca barrados, então sempre há
  quem corrija um expediente mal configurado; `/app/fora-de-expediente` sempre alcançável.
- **Laço de retorno (o que muda quando erra):** se o expediente barra quem não devia, o atendente vê
  `/app/fora-de-expediente` com a janela configurada e o admin vê o contador de barrados e corrige na
  mesma tela. Se o setor esconde conversa demais, o admin vê, na seção Departamentos, quantas
  conversas cada setor tem e quem o integra, e move o operador. Conversa sem setor é visível a todos,
  então nenhuma fica invisível por erro de classificação, e apagar um setor com conversas é bloqueado
  (N1), então nenhuma volta a "sem setor" sem um ato explícito.
- **Mapa vivo (`docs/architecture/`):** novo `expediente-e-setor.architecture.json` com as peças
  (`departments`, `department_members`, `business_hours`, `requireRole`, `fn_can_view_conversation`,
  `/app/fora-de-expediente`) e ≥2 arestas cada, e atualização de `organizacoes-e-acesso.architecture.json`.

## 8. Riscos
| Risco | Mitigação |
|---|---|
| **Vazamento entre setores** pela RLS ou por rota com client admin | Invariante `test:db` com 2 organizações **e** 2 setores; auditoria das rotas admin (T3) |
| **Esconder conversa da organização inteira** por erro na função | Setor nulo = visível a todos; função `stable` testada contra `viewer/manager/admin/platform admin` |
| **Trancar a equipe fora** por expediente mal configurado ou fuso inválido | Falha aberta; `admin`/`manager` isentos; validação Zod do fuso |
| **Rota de escrita esquecida** fica aberta fora do expediente | **Fail-closed** (§2.1): toda rota de escrita de `agent` nasce barrada; a varredura cobre `app/api/v1/**` e reprova isenção sem motivo |
| **Excluir um setor expõe conversas** (regressão de privacidade) | N1: FK `no action` + 409 + reatribuição explícita (§4.2) |
| **Policy, função ou RPC esquecida na assinatura antiga** ignora o setor | Os 5 chamadores migram, a antiga é removida e um teste de catálogo reprova qualquer referência (§4.3) |
| **`INSERT` em `messages` de conversa alheia** (medido, existe hoje) | N2 (§4.3); a T4b tem um caso de invariante |
| **`WITH CHECK` por visibilidade quebra um fluxo legítimo** (soltar/transferir por `UPDATE` direto) | A T3 confirma que nenhuma rota faz isso; teste por fluxo na T4b (§4.3) |
| **Vínculo ou conversa apontando para setor de outra organização** | FKs compostas (§4.2): falha na hora, não por teste |
| **Q6: timeline, atividades e 360 do contato mostram conteúdo de outro setor** | **Risco aceito** pelo dono do produto (2026-11-17), mapeado na [#80](https://github.com/itConesul/CRMPI/issues/80); não é tratado aqui |
| **Contador de barrados some** se o Redis cair | Mostra `—`; a regra de expediente não depende dele (§2.1) |
| **Ação barrada sem explicação** | Faixa com a janela e a próxima abertura; controles desabilitados com o motivo |
| **Cliente escreve às 22h e ninguém é barrado nem avisado** | Fora deste PRD: o que o cliente recebe é PRD-07 (#73). Até lá a conversa fica sem dono até a abertura — a IA, se ativa, mantém a própria janela |
| **Realtime não remover da tela** a conversa que saiu do escopo por transferência (não há evento para quem perdeu o acesso), e `DELETE` que não passa pela RLS (só leva o id) | Medir na T0 e provar na T8 com 2 navegadores (§1). Mitigação desenhada: refetch ao voltar o foco da janela, que a lista já faz |
| **Função por linha lenta** com volume | `explain (analyze, buffers)` da listagem com ~100 mil conversas na T4b; se não bastar, policy com `exists` inline (§1) |
| **Fuso/horário de verão** | `localMoment` usa `Intl` com o fuso IANA; teste com data de virada. **Limitação conhecida e medida (2026-11-19):** `proximaAbertura` soma minutos corridos, então numa semana com virada de horário de verão a abertura anunciada erra **60 min** (sonda descartável: `Europe/Madrid`, sábado 27/03/2027 20:00, janela seg 09:00 → erro 60 min; a mesma conta sem virada e em `America/Sao_Paulo` → 0 min). Só afeta **exibição** (`opens_at` do 403 e `descreverExpediente`); a decisão de barrar usa `dentroDoExpediente`, que não soma minutos. Não corrigido neste PR (review do #88, menor 2); consertar é calcular no fuso da organização e testar com fusos de horário de verão |
| **Escopo crescer** (leads, contatos, expediente por setor) | Fora de escopo explícito: Q6 (risco aceito, #80) e Q9 (evolução prevista, §4.1) |
