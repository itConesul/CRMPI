# 02 — Design

**Verificado em:** `59c76a3` · **Comando:** `git rev-parse --short HEAD`
**Natureza:** proposta. Nada aqui foi implementado. O §4 é a **proposta de schema** que a issue exige
antes de qualquer migration.

## 1. O que existe hoje (verificado lendo cada arquivo)

| Peça | Onde | O que faz / o que NÃO faz |
|---|---|---|
| Horário do **agente de IA** | `lib/agent-engine/agent/janela-de-atendimento.ts` | Lê `trigger_config.filters.business_hours` da versão publicada; adia o turno da IA para a abertura. Falha **aberta** (config torta = sem janela). **Não** toca atendente humano |
| Horário **por atendente** | tabela `attendant_availability` (`schedule jsonb`), `lib/routing/eligibility.ts`, `lib/schemas/routing.ts` | `availabilityScheduleSchema` = `{timezone, windows:[{dow,start,end}]}`; `windows` vazio = 24/7. `isWithinSchedule` e `localMoment` já resolvem fuso e dia da semana. Só decide **elegibilidade para receber distribuição**; **não bloqueia** nada |
| Validação de fuso | `lib/tempo/fusos.ts` (`fusoValido`, `FUSO_PADRAO`) | `Intl` lança `RangeError` em fuso inexistente; a validação é obrigatória no Zod |
| Visibilidade por dono | `fn_can_view_conversation(p_org, p_assigned_to_user_id)` no `supabase/baseline.sql` (migration 0035) | `security definer`, `stable`. `viewer/manager/admin` e platform admin veem tudo; `agent` vê as próprias e, conforme `organizations.settings->>'visibility_mode'` (`all` / `own_and_unassigned` default / `own`), as sem dono. **Não conhece setor** |
| Policy de leitura | `conversations_select` usa a função acima; `messages_select` herda via `exists (select 1 from conversations …)` | Mudar a função de conversas muda mensagens de graça |
| Escrita | `conversations_agent_insert/update/delete`: `agent+` da org | Não restringida por visibilidade. Ingestão e envio usam `service_role` e bypassam RLS |
| Transferência | `fn_conversation_assign` | `security definer` (forward-fix G4-01): o `returning` re-aplicaria a policy de SELECT à linha nova, invisível ao autor |
| Config da organização | `organizations.settings` (jsonb) com `routing`, `visibility_mode` (irmão, lido pela RLS), `security.mfa_required`, `branding` | Schemas Zod em `lib/schemas/routing.ts`. Aninhar `visibility_mode` quebraria a RLS em silêncio |
| Gate de rota | `requireRole(min, opts)` em `lib/auth/require-role.ts` | Server-side, por rota. Já audita `authz.denied`. Ex.: `app/api/v1/conversations/[id]/claim/route.ts` chama `requireRole("agent")` |
| Gate de requisição | `proxy.ts` (Next 16; **não** existe `middleware.ts`) | Só autenticação, cookie de impersonação e `/admin`. O comentário do arquivo diz que roda no Edge sem acesso ao banco |
| Tela de atendimento | `app/app/settings/atendimento` | Configurações › Atendimento: modo de roteamento e `visibility_mode`. **Sem setor** |
| Roteamento por canal | `channel_routing_policies` + `channel_routing_responsibles` (`lib/routing/channel-policies.ts`) | Quem responde por **cada número** (canal). Não é setor |

**Não existe:** tabela de departamentos; vínculo operador↔setor; `department_id` em `conversations`;
expediente da organização; rota ou tela `/fora-de-expediente`; erro `OUT_OF_WORK_HOURS`.

**NÃO VERIFICADO** (medir antes de implementar — viram a tarefa T0):
- Se `loadAuthUser()` já carrega `organizations.settings` (decide se o gate custa uma consulta a mais
  por requisição ou zero).
- Se o app usa canais Realtime de **broadcast** para conversas (não passam por RLS) ou só
  `postgres_changes` (passam). Comando: `grep -rn "broadcast" hooks lib --include=*.ts`.
- O comportamento do Realtime com RLS num evento `UPDATE` em que a linha **sai** do escopo do
  usuário (ex.: conversa transferida para outro setor): o cliente deixa de receber, mas não recebe
  um evento de remoção. Precisa de medição com 2 usuários.
- Quantas rotas de `app/api/v1/` leem `conversations` com o client **admin** (que bypassa a RLS e
  portanto precisam repetir a regra de setor à mão). Comando:
  `grep -rl "conversations" app/api/v1 --include=route.ts | xargs grep -l "createAdminClient\|supabase/admin"`.

## 2. Decisão de design

Dois mecanismos independentes, cada um com uma **função pura** testável sem banco ou DOM.

### 2.1 Expediente (RF-3 a RF-6, RNF-1)
- **Fonte única:** `organizations.settings.business_hours`, no **mesmo formato** do horário por
  atendente: `{ timezone, windows: [{dow, start, end}] }`. Reaproveita `availabilityScheduleSchema`,
  `localMoment` e `isWithinSchedule`; **não** nasce um segundo conceito de "janela".
- **Default = sem restrição** (`windows` vazio = 24/7). Uma instalação que atualiza pelo `update.sh`
  continua operando; o expediente só passa a valer quando o admin o configura (primeira impressão).
- **Falha aberta:** config ausente, fuso inválido ou shape torto = sem expediente. Uma configuração
  quebrada não pode trancar a equipe fora do próprio sistema; é o mesmo princípio de
  `janela-de-atendimento.ts`.
- **Função pura** `dentroDoExpediente(config, agora)` e `expedienteBarra({papel, config, agora, isenções})`.
- **Onde aplicar:** no servidor, em `requireRole`. É o ponto por onde toda rota de `agent`+ já passa,
  e é onde o 403 padrão e o audit `authz.denied` já vivem. O `proxy.ts` **não** é o lugar: roda no
  Edge sem banco. A tela redireciona por um `layout` de servidor de `app/app/` que chama a mesma função.
- **Isenções** (RNF-1), todas testadas: papéis `manager` e `admin`; platform admin; sessão de
  suporte/impersonação; rotas `cron/*` e `webhooks/*` (não chamam `requireRole`, autenticam por
  segredo — **NÃO VERIFICADO** para todas, vira teste que varre as rotas).
- **Rota de saída sempre alcançável:** `/fora-de-expediente`, logout e troca de organização não podem
  ser barrados, senão o redirecionamento vira laço.

### 2.2 Setor (RF-1, RF-2, RF-7 a RF-9)
- Tabela `departments` e tabela de vínculo `department_members` (§4). Conversa ganha
  `department_id` **nullable**: conversa que chega pela ingestão nasce **sem setor** e é visível a
  todos os `agent` (RF-7 "ou sem setor"). Quem põe o setor é PRD-02 (distribuição) e PRD-07 (URA).
- Visibilidade por **nova função** `fn_can_view_conversation(p_org, p_assigned, p_department)`,
  porque `create or replace` não troca a lista de argumentos. A policy `conversations_select` passa a
  chamar a nova; a antiga permanece até uma forward-fix posterior (não apagar o que um clone ainda
  referencia).
- Regra proposta (ver §4.3): `viewer/manager/admin` e platform admin veem tudo; `agent` vê a conversa
  se **é o dono**, **ou** (`department_id` é nulo **ou** está entre os seus setores) **e** a regra de
  `visibility_mode` já existente a admite. As duas restrições **somam**; nenhuma substitui a outra.
- **Realtime:** `postgres_changes` aplica a RLS de SELECT ao assinante, então a mudança de policy
  cobre RF-9 sem código novo — **desde que não haja canal de broadcast** (NÃO VERIFICADO acima).

### Alternativas recusadas
| Alternativa | Por que não |
|---|---|
| Nova tabela `tenant_settings` (do texto original) | O repo usa `organizations.settings`; duas fontes para a mesma config é o defeito que o CLAUDE.md proíbe (DIRC) |
| Reaproveitar `attendant_availability.schedule` como expediente | É por **usuário**; o expediente é da **organização**. Misturar obrigaria a copiar a janela para cada atendente e a perderia ao criar um novo |
| Expediente no `proxy.ts` | Edge sem banco; exigiria ler `organizations.settings` em toda requisição, inclusive estáticas |
| Reaproveitar `channel_routing_*` como departamento | É "quem responde por este **número**". Setor atravessa canais (um departamento atende vários números) e vice-versa |
| `department_id` em `crm_leads` (do texto original) | A conversa é `conversations`; o lead é o funil. O isolamento pedido é de atendimento |
| Restringir a policy de **escrita** por setor | A issue pede só leitura. Escrita por setor muda `fn_conversation_assign` e a transferência (PRD-02) |
| Bloquear a tela inteira fora do expediente | Perde rascunho e impede consulta. Ver Q1 |

## 3. Contratos

**Erro:** `OUT_OF_WORK_HOURS` (403) em `lib/api/errors.ts`, mensagem em português via `traduzir`.
Envelope padrão `{ error: { code, message, details? } }` com `details: { opens_at }` quando calculável
(próxima abertura no fuso da organização).

**Zod** (em `lib/schemas/`, junto de `routing.ts`):
- `expedienteConfigSchema = availabilityScheduleSchema` (reuso; mesma validação de fuso e `start < end`).
- `departamentoInputSchema = { name: string 1..60, trim, único por organização sem diferenciar caixa }`.
- `vinculoDepartamentoInputSchema = { user_id: uuid }`.

**Rotas** (`/api/v1/…`, snake_case, wrappers `ok()`/`fail()`, `organization_id` resolvido do cookie,
nunca do body):
| Método | Rota | Papel | Observação |
|---|---|---|---|
| `GET` | `/settings/expediente` | `agent`+ | Lê a config (a tela de "fora de expediente" precisa) |
| `PATCH` | `/settings/expediente` | `admin` | Audita `expediente.config_changed` |
| `GET/POST` | `/departments` | leitura `agent`+, escrita `admin` | `Idempotency-Key` no POST |
| `PATCH/DELETE` | `/departments/[id]` | `admin` | Excluir **não** apaga conversas (§4) |
| `PUT` | `/departments/[id]/members` | `admin` | Substitui a lista de operadores do setor |

**Tela:** `/fora-de-expediente` (RF-5), com a janela da empresa, o horário de reabertura e o botão de
sair. Configuração em **Configurações › Atendimento**: seção "Expediente" e seção "Departamentos".

## 4. Dados — PROPOSTA DE SCHEMA (aguarda aprovação)

> Nada abaixo foi escrito como migration. O número `NNNN` é o próximo de `ls supabase/migrations/`
> no momento de implementar (o último medido em `59c76a3` foi `0238`).

### 4.1 Reaproveita o que já existe
- `organizations.settings.business_hours` (jsonb **já existente**): **sem coluna nova**. Schema Zod
  central em `lib/schemas/`; a UI lê por esse schema, não por path solto (anti-pattern 6).
- Papéis `viewer/agent/manager/admin` e `fn_user_role_in_org`, `fn_user_org_ids`, `fn_is_platform_admin`.

### 4.2 Novo
```sql
-- departments: 1 linha por setor
create table if not exists public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 60),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists uq_departments_org_name
  on public.departments (organization_id, lower(btrim(name)));

-- department_members: operador ↔ setor (N:N)
create table if not exists public.department_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  department_id   uuid not null references public.departments(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (department_id, user_id)
);
create index if not exists idx_department_members_user
  on public.department_members (organization_id, user_id);

-- conversa ganha o setor (nullable: nasce sem setor)
alter table public.conversations
  add column if not exists department_id uuid references public.departments(id) on delete set null;
create index if not exists idx_conversations_department
  on public.conversations (organization_id, department_id) where department_id is not null;
```
- **`on delete set null` em `conversations.department_id`**, não `cascade`: excluir um departamento
  **não** apaga conversa nem mensagem (anti-pattern 7, cascade fantasma). A conversa volta a "sem
  setor" e fica visível a todos os `agent`.
- `department_members.organization_id` é redundante com `departments.organization_id`, mantido para a
  RLS filtrar por org sem junção. Um **teste de invariante** garante que os dois coincidem (sem isso,
  um vínculo cruzaria organizações).
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
-- depois: drop policy + create policy conversations_select usando a nova assinatura
```
As **duas origens** de `EXECUTE` são revogadas (A: `anon` direto; B: `PUBLIC`), como a doutrina exige.
`messages_select` não muda (herda por `exists`).

### 4.4 Impacto em quem já instalou (`update.sh`)
- Migration + **apêndice idempotente** no `baseline.sql` (`create … if not exists`, `add column if not
  exists`, `create or replace function`), acima do bloco de varredura anon.
- **Nenhuma linha existente muda de comportamento:** toda conversa existente tem `department_id` nulo
  = "sem setor" = visível como hoje; `business_hours` ausente = sem expediente. Não há backfill nem
  constraint nova sobre dados antigos.
- `lib/database.types.ts` regenerado. Linha em `supabase/migrations/MANIFEST.md`.

### 4.5 Rotas que usam o client **admin**
O client admin bypassa a RLS. Qualquer rota que liste conversas com ele e sirva a um `agent` precisa
aplicar a regra de setor **na consulta**, com `organization_id` resolvido do cookie. A lista dessas
rotas é a saída do comando do §1 e entra em `04-tarefas.md` como tarefa de auditoria (T3). Sem ela, a
RLS correta no banco coexiste com uma API que vaza.

## 5. Rastreabilidade
| Requisito | Onde é atendido neste design |
|---|---|
| RF-1, RF-2 | §3 (rotas `/departments`), §4.2 |
| RF-3 | §2.1, §3 (`PATCH /settings/expediente`), §4.1 |
| RF-4 | §2.1 (`requireRole`), §3 (`OUT_OF_WORK_HOURS`) |
| RF-5 | §2.1 (layout de servidor), §3 (tela) |
| RF-6, RNF-1 | §2.1 (isenções) |
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
  `OUT_OF_WORK_HOURS` em `requireRole`, redirecionamento para `/fora-de-expediente`, e a RLS de
  `conversations`.
- **Emite atividade/log:** audit `expediente.config_changed`, `department.created/updated/deleted`,
  `department.member_set` em `api_audit_log`; tentativa barrada reaproveita `authz.denied` de
  `requireRole`. **A decidir (T0):** se a tentativa barrada vira linha por requisição ou só uma por
  atendente por hora, para não repetir o erro das rodadas de cron vazias que inflaram o audit.
- **Aparece na tela:** Configurações › Atendimento (seções Expediente e Departamentos) e
  `/fora-de-expediente`. Quantas tentativas foram barradas hoje aparece no cabeçalho da seção
  Expediente (dado para o admin enxergar se a regra está pegando).
- **Porta na navegação (`lib/navigation/registry.ts`):** as seções ficam dentro de Configurações ›
  Atendimento, que já tem porta. `/fora-de-expediente` é destino de redirecionamento, não item de
  menu: entra na allowlist de `tests/unit/navegacao-completude.test.ts` **com justificativa escrita**.
- **Mecanismo anti-morte:** falha aberta (§2.1); `admin`/`manager` nunca barrados, então sempre há
  quem corrija um expediente mal configurado; `/fora-de-expediente` sempre alcançável.
- **Laço de retorno (o que muda quando erra):** se o expediente barra quem não devia, o atendente vê
  `/fora-de-expediente` com a janela configurada e o admin vê o contador de barrados e corrige na
  mesma tela. Se o setor esconde conversa demais, o admin vê no contador por setor e move o operador.
  Conversa sem setor é visível a todos, então nenhuma fica invisível por erro de classificação.
- **Mapa vivo (`docs/architecture/`):** novo `expediente-e-setor.architecture.json` com as peças
  (`departments`, `department_members`, `business_hours`, `requireRole`, `fn_can_view_conversation`,
  `/fora-de-expediente`) e ≥2 arestas cada, e atualização de `organizacoes-e-acesso.architecture.json`.

## 8. Riscos
| Risco | Mitigação |
|---|---|
| **Vazamento entre setores** pela RLS ou por rota com client admin | Invariante `test:db` com 2 organizações **e** 2 setores; auditoria das rotas admin (T3) |
| **Esconder conversa da organização inteira** por erro na função | Setor nulo = visível a todos; função `stable` testada contra `viewer/manager/admin/platform admin` |
| **Trancar a equipe fora** por expediente mal configurado ou fuso inválido | Falha aberta; `admin`/`manager` isentos; validação Zod do fuso |
| **Laço de redirecionamento** em `/fora-de-expediente` | A rota de saída, o logout e a troca de organização ficam fora do gate; teste dedicado |
| **Cliente escreve às 22h e ninguém é barrado nem avisado** | Fora deste PRD: o que o cliente recebe é PRD-07 (#73). Até lá a conversa fica sem dono até a abertura — a IA, se ativa, mantém a própria janela |
| **Realtime não remover da tela** a conversa que saiu do escopo por transferência | Medir (§1, NÃO VERIFICADO); o cliente refaz a consulta ao receber `UPDATE` e filtra |
| **Fuso/horário de verão** | `localMoment` usa `Intl` com o fuso IANA; teste com data de virada |
| **Escopo crescer** (leads, contatos, escrita por setor) | Fora de escopo explícito; Q6 |
