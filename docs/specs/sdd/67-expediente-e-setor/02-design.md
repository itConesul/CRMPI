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
  (ii) um `DELETE` **não passa pela RLS** (o `postgres_changes` entrega a todos os assinantes da
  organização) mas, com `REPLICA IDENTITY DEFAULT`, só leva o id. A mitigação desenhada é o refetch
  que a lista já faz ao voltar o foco da janela; a T0 mede e a T8 prova com **transferência entre
  setores em dois navegadores**.
- **Desempenho da função por linha (condição 6):** `fn_can_view_conversation` roda por linha
  (um `exists` em `department_members` e um `select` em `organizations.settings`). A T4b registra o
  plano de `explain (analyze, buffers)` da listagem de conversas como `agent`, com volume (ordem de
  100 mil conversas, 10 setores), e **decide com o revisor** se a função basta ou se vira policy com
  `exists` inline. Não há limite numérico definido ainda.
- Quantas rotas de `app/api/v1/` leem `conversations` com o client **admin** (que bypassa a RLS e
  portanto precisam repetir a regra de setor à mão). Comando:
  `grep -rl "conversations" app/api/v1 --include=route.ts | xargs grep -l "createAdminClient\|supabase/admin"`.

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
    `notifications/push` (`PUT`/`DELETE`, "inscrição de push do próprio navegador"). A T0(f)
    confirma, **rota a rota**, "marcar notificação como lida" e "presença": se forem rotas de API que
    passam por `requireRole`, entram na lista fixa com o motivo escrito.
  - **CRM interno (leads, contatos, tarefas, agenda): barrado POR PADRÃO e liberado rota a rota**
    (decisão do dono do produto), com o **motivo escrito** e um único critério: **"esta rota dispara
    mensagem ao cliente?"** Se dispara, continua barrada. A lista de liberações sai da T0(f), gerada
    por script a partir das rotas reais, e entra no teste. Hoje está **vazia de propósito**: nada do
    CRM interno é liberado sem essa justificativa.
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
- **Na tela:** uma faixa no shell do app (mesmo lugar de `FaixaDeAvisos`) mostra a janela da empresa
  e a próxima abertura, e os controles de ação ficam desabilitados com o motivo. Calculado no
  servidor pela mesma função pura, para cliente e servidor não divergirem.
- **Bypass auditado (RF-10).** Quando `admin`/`manager` passam pelo gate **fora do expediente**,
  `requireRole` devolve `foraDoExpediente: true` no resultado, e a rota o repassa para o `audit()` que
  **já** grava a mutação (`metadata.fora_do_expediente = true`). Não há linha nova: a doutrina de
  audit manda auditar quando há efeito, e uma linha emitida no gate registraria tentativas que a
  rota depois recusa por outro motivo. Dentro do expediente nada é acrescentado. Como as rotas de
  ação já chamam `audit()` após o sucesso, o custo é um campo; se alguma não chamar, a varredura de
  T2 a reprova.
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
  cobre RF-9 sem código novo — **desde que não haja canal de broadcast** (NÃO VERIFICADO acima).
  Limites conhecidos, a medir na T0 e provar na T8: a conversa que **sai** do escopo não gera evento
  de remoção, e o `DELETE` não passa pela RLS (mas só leva o id).
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
| `GET` | `/settings/expediente` | `agent`+ | Lê a config **e o estado avaliado pelo servidor**: `agora` (`dow`, `hhmm` e ISO no fuso da organização), `dentro` (booleano) e `opens_at`. A tela de "fora de expediente" precisa, e o e2e constrói a janela em torno desse `agora`, sem depender do relógio do runner |
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
| **Fuso/horário de verão** | `localMoment` usa `Intl` com o fuso IANA; teste com data de virada |
| **Escopo crescer** (leads, contatos, expediente por setor) | Fora de escopo explícito: Q6 (risco aceito, #80) e Q9 (evolução prevista, §4.1) |
