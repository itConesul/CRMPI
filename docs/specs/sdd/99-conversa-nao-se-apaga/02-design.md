# 02 — Design

**Verificado em:** `3be7195` (develop, após a v1.23.7) · **Comando:** `git rev-parse --short origin/develop`
**Medições originais em `a673ace`.** Conferido que nenhum arquivo citado nesta spec mudou entre os dois:
`git diff --name-only a673ace 3be7195 -- supabase/baseline.sql supabase/migrations app/api/v1/contacts components/contacts/ContactsTable.tsx lib/auth hooks/contacts app/api/v1/lgpd lib/lgpd workers/lgpd-redact-worker.ts tests/unit/contato-delete.test.ts`
devolve vazio. As sondas em banco (§1.2) usaram o `baseline.sql` de `a673ace`, que é idêntico.

## 1. O que existe hoje (verificado)

### 1.1 Peças
| Peça | Onde | Observação |
|---|---|---|
| Policy de `DELETE` do agent | `supabase/baseline.sql:5576` (`conversations_agent_delete`) | `agent`+ da organização, **sem** olhar visibilidade nem titular; `fn_is_platform_admin()` também passa |
| Privilégios | `baseline.sql:4745-4747`, `4811-4813` | `GRANT ALL` em `conversations` e `messages` para `anon`, `authenticated` e `service_role`. **O dump re-concede a cada re-aplicação** |
| Policies de escrita em `messages` | `baseline.sql:5603` (`messages_update`), `5611` (`messages_delete`) | exigem **só** `organization_id in (select fn_user_org_ids())`. Sem papel, sem visibilidade |
| Policy de leitura em `messages` | `baseline.sql:5589` (`messages_select`) | `exists (select 1 from conversations c where c.id = messages.conversation_id)`: a RLS de `conversations` é aplicada dentro do `exists`, então a leitura já segue a visibilidade |
| Sessão de suporte | `baseline.sql:18452-18460` | `support_write_*` são **`RESTRICTIVE`** e só existem onde `authenticated` tem `INSERT`/`UPDATE`/`DELETE`. Só estreitam; não concedem |
| Rota de apagar contato | `app/api/v1/contacts/[id]/route.ts:130` | `requireRole("agent", …)`; usa `createClient()` do servidor, papel `authenticated` |
| Handler | `app/api/v1/contacts/_handler.ts` (`deleteContactHandler`) | hoje apaga `messages`, depois `conversations`, depois `contacts`, com o cliente do usuário. É o **único** `DELETE` de `conversations` com o cliente do usuário (varredura por `from("conversations")` + `.delete()` em `app lib workers hooks components`) |
| Botão | `components/contacts/ContactsTable.tsx:262-264` | "Excluir contato", **sem** checar papel. `useDeleteContact` só é usado aqui |
| Como a UI lê o papel | `components/inbox/ChatThread.tsx:59-62` | `useActiveOrg()` + `ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager` |
| Anonimizar | `app/api/v1/lgpd/anonymize/route.ts:86` | `requireRole("admin")`; `fn_lgpd_anonymize_contact` é `security definer` e exige `fn_session_mfa_proven()` (`baseline.sql`, `contact_anonymize_mfa_required`) |
| Cascade de LGPD | `lib/lgpd/redact-cascade.ts:40`, `workers/lgpd-redact-worker.ts:94` | usa `createAdminClient()`. `fn_lgpd_cascade_redact_contact` é `security definer` e **não contém `DELETE`**. A revogação **não os alcança** |
| FKs que bloqueiam o contato | catálogo do banco (comando abaixo) | **três** FKs bloqueiam o `DELETE` de `contacts`, todas `RESTRICT`: `conversations_contact_id_fkey`, `messages_contact_id_fkey` e `calendar_appointments_contact_id_fkey` (`baseline.sql:15211`, tabela da Agenda). `messages.conversation_id` é `NOT NULL`, então contato sem conversa não tem mensagem, **mas pode ter compromisso**. **Correção:** a versão anterior desta spec dizia "as duas únicas"; era falso, e vinha de um `grep` que só casava a forma com aspas do dump e não o apêndice. A lista abaixo sai do **catálogo**, não de `grep` |

Comando que lista as FKs que bloqueiam (rodar num banco com o baseline aplicado):

```bash
psql "$SUPABASE_DB_URL" -c "select conrelid::regclass, conname, confdeltype from pg_constraint
  where confrelid='public.contacts'::regclass and contype='f' and confdeltype in ('a','r');"
```
| Dependem de apagar contato | `tests/e2e/*`, `tests/unit/*` | só `tests/unit/contato-delete.test.ts`. Os e2e que citam "DELETE" apagam sessões do WAHA, não contato |

### 1.2 T0 — prova no banco (feita)
Postgres descartável `pgvector/pgvector:pg15`, `baseline.sql` aplicado com `ON_ERROR_STOP=1`, JWT simulado
(`set role authenticated` + `request.jwt.claims`), como `tests/invariants/rls-isolation.test.ts`. Sem
`RETURNING`, que é como o PostgREST escreve com `return=minimal`.

| Cenário | Antes | Depois da migration |
|---|---|---|
| `viewer` edita o `body` de mensagem que enxerga | **1 linha** | 0 |
| `viewer` apaga mensagem que enxerga | **1 linha** | 0 |
| `viewer` lê a mensagem | 1 | 1 (a barreira é de escrita) |
| `viewer` apaga conversa | 0 (RLS) | `permission denied` |
| `agent`/`manager` apaga conversa visível | permitido | `permission denied` |
| `agent`/`manager` edita mensagem em conversa visível | 1 | 1 (preservado) |
| `service_role` apaga conversa | 1 | 1 (preservado) |
| Políticas `support_write_*` em `conversations` e `messages` | `RESTRICTIVE` | `RESTRICTIVE` |

A sessão de suporte **não abre** caminho extra de `DELETE`: as policies dela são restritivas.

### 1.3 T0b — quem passa em `requireRole("manager")` (medido por leitura do código)
`lib/auth/require-role.ts` e `fn_user_role_in_org` (definição final em `baseline.sql:18399`, que
substitui a primeira de `baseline.sql:817`). O papel efetivo vem **do banco**, não do cookie:

| Quem | Papel efetivo | `requireRole("manager")` |
|---|---|---|
| Membro `manager` ou `admin` da org | o da membership | **passa** |
| Membro `agent` ou `viewer` | o da membership | 403 `forbidden_role` |
| Sessão de suporte **`full`** na org | `admin` | **passa** |
| Sessão de suporte **somente leitura** | `viewer` | 403 |
| `platform admin` **sem** membership e sem sessão de suporte | `null` (rank 0) | **403** (`allowPlatformAdmin` é `false` por padrão e a rota de contatos não o liga) |

A UI lê o mesmo mapeamento em `lib/auth/server.ts:270-275` (`support.access_mode === "full" ? "admin" :
"viewer"`), então `ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager` **espelha a rota exatamente**.

**Armadilha de desenho:** outros componentes somam `user.is_platform_admin ||` ao predicado
(`components/kanban/BulkActionBar.tsx:63`, `app/app/ads/meta/page.tsx:50`). **Aqui isso não pode ser
copiado**: um `platform admin` sem membership veria o botão e a rota responderia 403. O predicado da tela
é **só** `ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager`.

### 1.4 T0c — quem escreve em `messages` com o cliente do usuário
Varredura de `.from("messages")` com `update`/`delete`/`upsert` em `app lib workers hooks components`, e
rastreio do cliente que cada chamador passa. **Só uma porta usa o cliente do usuário (RLS):**

| Escritor | Cliente | Papel exigido | Conversa visível? | Efeito da migration |
|---|---|---|---|---|
| `POST /api/v1/messages` → `sendMessageHandler` (`app/api/v1/messages/route.ts:62`; escreve em `_handler.ts:595-877`, e o eco `external_device` em `:110`) | **usuário** (`createClient()`) | `requireRole("agent")` (`route.ts:29`) | **sim**: o handler carrega a conversa pelo mesmo cliente (RLS) no início, antes das escritas (`_handler.ts:287` em diante). **NÃO VERIFICADO** o ramo exato de conversa invisível | **nenhum**: `agent`+ em conversa visível é exatamente o que a policy nova exige |
| `deleteContactHandler` (`contacts/_handler.ts`) | **usuário** | `agent` hoje, `manager` pela spec | n/d | o `delete` de `messages` **sai** (RF-3) |
| MCP (`lib/mcp/tools/messages.ts:78`) | **admin** (`lib/mcp/auth.ts:91`, `lib/mcp/server.ts:41`) | token | filtro de org à mão | nenhum: ignora a RLS |
| Motor do agente (`lib/agent-engine/edge/crm/send-message.ts:133`) | **service role** (`lib/agent-engine/env.ts`: "exigem o client service-role") | n/a | n/a | nenhum |
| Runtime de IA (`lib/ai/runtime/finalize.ts:146`, `agent.ts`), handoff (`aviso-ao-lead.ts:79`), automação (`send-ai-message.ts:152`, `send-whatsapp.ts:52`), follow-up (`enviar-texto-fixo.ts`) | **admin** | n/a | n/a | nenhum |
| Webhook Meta (`webhooks/meta/[token]/route.ts`), workers de mídia e sentimento, cron `recover-stuck-messages` | **admin** (`createAdminClient()` no arquivo) | n/a | n/a | nenhum |
| Ingestão WAHA (`webhooks/waha/route.ts:178`, `webhooks/waha/[token]/route.ts:175`) e Zernio (`lib/channels/inbound.ts:187,191`) | **admin** (o chamador passa `admin`) | n/a | n/a | nenhum |
| Importação do histórico do aparelho (`lib/channels/importar-historico.handler.ts`) | handler de evento, executado pelo worker. **NÃO VERIFICADO** o cliente linha a linha | n/a | n/a | esperado nenhum: não há JWT de usuário num worker |
| Browser (`hooks/`, `components/`) | **só lê** `messages` | n/a | n/a | nenhum |

**Sessão de suporte `full`:** `fn_role_at_least` chama `fn_user_role_in_org`, que devolve `admin` para ela
(`baseline.sql:18399`). Logo passa em `agent`+. Provado abaixo.

**Prova do fluxo de envio, antes e depois da migration** (pg15 descartável, JWT simulado; a sessão de suporte
foi simulada com `platform_admins`, `auth.sessions` e `platform_support_sessions` reais do schema):

| Passo | `agent` antes | `agent` depois | Suporte `full` antes | Suporte `full` depois |
|---|---|---|---|---|
| inserir mensagem (`queued`) | 1 | 1 | 1 | 1 |
| marcar `failed` | 1 | 1 | 1 | 1 |
| reenviar (`sent`) | 1 | 1 | 1 | 1 |
| inserir eco `external_device` e apagá-lo | 1 / 1 | 1 / 1 | — | — |
| controle: `viewer` edita o `body` | — | **0** | — | — |

Papel efetivo medido da sessão de suporte: `admin`. O invariante (T1) incorpora esses passos para que a
prova não dependa desta tabela.

**NÃO VERIFICADO** (declarado, não escondido):
- a) ~~Como `requireRole("manager")` trata platform admin e sessão de suporte~~ — **medido em §1.3**.
- b) Comportamento de uma **sessão de suporte real** (`platform_support_sessions`) tentando apagar
  contato. Só as flags `RESTRICTIVE` foram medidas.
- c) O modo `none` de `visibility_mode`.
- d) Se há script ou integração de cliente que apaga conversa pelo PostgREST. Os do repositório usam
  conexão direta ou `service_role`.

## 2. Decisão de design
**B+ com apagar-contato 409 e regra `manager`+.** Uma migration que fecha o `DELETE` de `conversations`
e aperta a escrita de `messages`; o handler deixa de apagar histórico; a rota e o botão passam a
`manager`+.

```
agent/viewer ─┬─ DELETE conversations ──✗ (sem privilégio, sem policy)
              ├─ UPDATE/DELETE messages ─✗ viewer | ✓ agent+ em conversa visível
              └─ DELETE /contacts/:id ───✗ 403 (agent, viewer)
manager/admin ── DELETE /contacts/:id ──┬─ sem conversa e sem compromisso ─ 204 + audit contact.deleted
                                        └─ com conversa OU compromisso ──── 409 "peça a um administrador anonimizar"
service_role (cron, workers, LGPD) ───── inalterado
```

**Quem decide o 409 é o banco**, não uma consulta prévia: o `DELETE` do contato falha com `23503` por
`RESTRICT`. Uma checagem antes, pelo cliente do usuário, passaria pela RLS e não enxergaria a conversa de
outro atendente. A FK não tem esse ponto cego nem corrida entre "ver" e "apagar".

**O `23503` tem três origens, não duas** (§1.1): conversa, mensagem e **compromisso**. O erro do banco
identifica a constraint (`violates foreign key constraint "calendar_appointments_contact_id_fkey" on table
"calendar_appointments"`, medido), então o handler **poderia** escolher o texto por causa. **A spec escolhe
um texto único que cobre as causas**, por dois motivos: (1) a saída é a mesma nos dois casos, **pedir a um
administrador para anonimizar**, porque anonimizar preserva a linha; (2) um contato com conversa **e**
compromisso devolve **uma** violação por vez (o Postgres reporta uma; **não medi** o caso com as duas
causas juntas), e um texto por causa poderia mandar o usuário remover o compromisso para só então
descobrir a conversa. **Regra proposta para o compromisso**
(`01-requisitos.md` RF-4b, **confirmada** pelo revisor em 2026-11-24): o que é permitido **não muda** (contato com
compromisso já era recusado hoje, pelo mesmo `RESTRICT`); só a mensagem passa a explicar.
**NÃO VERIFICADO:** (e) que anonimizar um contato que tem compromisso conclui sem erro em produção
(`tests/invariants/agenda-lgpd-alcanca.test.ts` cobre a agenda no cascade de LGPD, mas não é essa
chamada), e (f) se há caminho **na tela** para o operador remover compromissos de um contato. Se não
houver, a mensagem única continua correta (manda anonimizar), e a lacuna vai para a issue da D.

**A mensagem do 409 manda pedir a um administrador**, e não "anonimize": anonimizar exige `admin` com
MFA e a aba LGPD só aparece para `isAdmin`. Um `manager` que recebe o 409 não pode anonimizar sozinho.
**Decisão registrada da spec** (comentário 13:39).

### Alternativas recusadas
| Alternativa | Por que não |
|---|---|
| Apagar contato por `admin client` no handler (opção (a)) | O dono escolheu (b). Mantém o histórico apagável pelo produto |
| Só remover a policy, sem revogar o privilégio | Sob RLS, sem policy permissiva o `DELETE` já é negado. A revogação do privilégio é a **segunda trava**: continua valendo se uma policy permissiva de `DELETE` voltar por engano. Os dois juntos custam uma linha cada |
| RPC `security definer` para o contador (opção C) | Fora de escopo por decisão. Mudaria a T1 da #70 |
| Exclusão lógica (opção D) | Funcionalidade nova, issue própria |
| Esconder o botão sem endurecer a rota | A rota é a porta; o botão é conveniência. A regra mora no servidor |

## 3. Contratos
- **Rota** `DELETE /api/v1/contacts/[id]`: `requireRole("manager", { resource: "contacts" })`. `agent` e
  `viewer`: 403 `forbidden_role`. Sucesso: 204 com `X-Request-Id`, como hoje.
- **Handler** `deleteContactHandler(supabase, ctx, contactId)`: `select` do contato (404 se não existe) →
  `delete` de `contacts` → se o erro tem `code === "23503"`, `ApiError(409, "state_conflict", …)`; outro
  erro → 500; sucesso → `emit_event` + `audit("contact.deleted")` como hoje.
- **Mensagem do 409** (chave de dicionário, `lib/i18n/dicionario.ts`; texto único para as três causas):
  *"Este contato tem conversas ou compromissos vinculados e não pode ser excluído, para preservar o
  histórico. Peça a um administrador para anonimizá-lo."* (`es` no mesmo dicionário). O handler **não**
  lê o nome da constraint para escolher texto; só testa `code === "23503"`.
- **UI**: `ContactsTable` renderiza o botão só se o predicado de papel da rota valer (T0b), via
  `useActiveOrg()` e `ROLE_RANK`, como `ChatThread`. O diálogo troca o texto sobre "conversa associada".

## 4. Dados
**Nenhuma coluna, tabela ou função nova.** Uma migration, `20261126190000_0240_conversa_nao_se_apaga_pela_api.sql`
(o número é o próximo livre: a `0239` foi tomada pelo #131, T4a da #67; **0240 na implementação**, ver `05-revisao.md`), com os **cinco
artefatos** declarados:

| # | Artefato | Conteúdo |
|---|---|---|
| 1 | Migration versionada | `drop policy if exists conversations_agent_delete`; `revoke delete on conversations from authenticated, anon`; recria `messages_update` e `messages_delete` com papel `agent`+ e `exists` de conversa visível |
| 2 | Apêndice no `baseline.sql` | O mesmo corpo, **no fim do arquivo**, com o rótulo `-- ---- … (migration 0240) ----` |
| 3 | Linha no `MANIFEST.md` | versão, nome, o quê e por quê |
| 4 | Invariante no `pnpm test:db` | `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts`, com pares (quem não pode é barrado **e** quem pode passa) e sabotagem provada |
| 5 | Revogar `EXECUTE` de função nova | **Não se aplica** (RNF-2): não há função nova |

**Ordem no baseline importa.** O dump re-concede `GRANT ALL` e o apêndice anterior recria
`conversations_agent_delete` a cada re-aplicação. O bloco novo vai **depois**, no fim, para a revogação
vencer. Há uma janela, dentro do próprio `update.sh`, em que o privilégio volta e é retirado de novo; a
janela é a de uma re-aplicação, mesma natureza de outros endurecimentos do apêndice.

**Idempotente:** `drop … if exists`, `revoke` (sem efeito se já revogado), `create policy` após `drop`.
Provado re-aplicando a migration duas vezes, e o baseline em install e update.

## 5. Rastreabilidade
| Requisito | Onde é atendido |
|---|---|
| RF-1 | §4 item 1, §2 diagrama |
| RF-2 | §4 item 1; leitura em §1.1 (`messages_select`) |
| RF-3 | §2 ("quem decide é o banco"), §3 handler |
| RF-2b | §1.4 (T0c e prova do fluxo de envio) |
| RF-4 | §3 handler |
| RF-4b | §2 (três origens do `23503`), §3 mensagem |
| RF-5 | §3 rota |
| RF-6, RF-7 | §3 UI |
| RNF-1 | §4 |
| RNF-2 | §4 item 5 |
| RNF-3 | §3 handler e rota |

## 6. Living System Checklist
(`docs/doctrine/sistema-vivo.md`)
- **Entrada e saída:** entrada, o usuário tenta apagar contato, conversa ou mensagem. Saída, 204, 409
  (com orientação) ou 403.
- **Emite atividade/log:** o 204 emite `contact.deleted` (`audit()` + `emit_event`); o 403 emite
  `authz.denied` (`requireRole`); o 409 **não** (não é mutação, RNF-3). O motivo desta spec é justamente
  preservar o log de conversas.
- **Aparece na tela:** o botão some para quem não pode; o 409 aparece como toast (`showApiError` em
  `hooks/contacts/useDeleteContact.ts`) e o diálogo explica antes.
- **Porta na navegação:** sem tela nova; nada a declarar em `lib/navigation/registry.ts`.
- **Mecanismo anti-morte:** o histórico deixa de morrer por um clique de atendente. O contato que não
  pode ser apagado tem caminho: anonimizar (admin).
- **Laço de retorno (invariante 7):** se a regra errar para cima, o `manager` recebe 409 e pede ao
  administrador; se errar para baixo, o invariante do `test:db` reprova. O 409 recorrente é sinal de que a
  exclusão lógica (D) é necessária — fica registrado na issue da D.
- **Mapa vivo (`docs/architecture/`):** nenhuma peça nova; sem nó a acrescentar. **[A decidir no
  review]** se a regra "só `manager`+ apaga contato" merece aresta no mapa de RBAC.

## 7. Riscos
| Risco | Mitigação |
|---|---|
| **`agent` perde o direito de excluir contato** (mudança que existia e deixou de existir) | Fragmento `exige_acao` com "Requer atenção" (**decidido pelo dono**, release major 2.0.0; `04-tarefas.md` T7). O texto precisa dizer que `agent` e `viewer` perdem o botão |
| Contato com conversa **ou compromisso** vira beco sem saída para `manager` | A mensagem do 409 manda pedir a um administrador. Se o 409 for frequente, a D resolve |
| Comentário desatualizado no baseline (`baseline.sql:15206-15207`: "as duas únicas FKs RESTRICT do schema") repete a frase falsa e pode enganar a próxima medição | T3 corrige o **comentário** do apêndice da Agenda no baseline (só texto, sem efeito de schema). Não se edita a migration de origem, que é histórica. O revisor decide se entra neste PR ou fica de fora |
| Janela no `update.sh` em que o `DELETE` volta | Mesma natureza dos outros blocos do apêndice; detalhada em §4. Não há como fechá-la sem editar o dump |
| `UPDATE` direto em `conversations` segue aberto | Declarado em `01-requisitos.md` como fora de escopo; C e D |
| Cliente com script que apaga conversa pelo PostgREST quebra | NÃO VERIFICADO (d). A janela de rollout é o `update.sh`; nota no fragmento |
| **Janela do `update.sh` com o app ANTIGO e o banco NOVO** (achado na implementação, T6) | **Medido:** com o banco já na `0240` e a imagem ainda antiga, o `deleteContactHandler` antigo faz `DELETE` em `conversations` e o `authenticated` leva `permission denied for table conversations` **mesmo com zero linhas**; "Excluir contato" devolve erro para **todos** os contatos até a imagem trocar. O `update.sh` aplica o baseline (`setup-kit/update.sh:149`) antes de recriar a imagem (`:213` em diante). Transitório e só nessa ação; o fragmento avisa. Não há como inverter a ordem sem mexer no `update.sh`, fora desta spec |
| UI e rota divergirem de novo no papel | O predicado é o **mesmo** (T0b), e o teste de 403 vigia a rota |
| Mensagem já adulterada por um `viewer` antes da migration | Fora de alcance: a migration fecha a porta, não reverte dado já alterado. `messages.edited_at` existe e pode ajudar numa auditoria futura (NÃO VERIFICADO se é preenchido por esse caminho) |
