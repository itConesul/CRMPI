# 02 — Design

**Verificado em:** `a673ace` · **Comando:** `git rev-parse --short origin/develop`

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
| FKs que bloqueiam o contato | `baseline.sql` (`conversations_contact_id_fkey`, `messages_contact_id_fkey`) | as **duas únicas** `ON DELETE RESTRICT` para `contacts`; `messages.conversation_id` é `NOT NULL`, então contato sem conversa não tem mensagem |
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
manager/admin ── DELETE /contacts/:id ──┬─ sem conversa ─ 204 + audit contact.deleted
                                        └─ com conversa ─ 409 "peça a um administrador anonimizar"
service_role (cron, workers, LGPD) ───── inalterado
```

**Quem decide o 409 é o banco**, não uma consulta prévia: o `DELETE` do contato falha com `23503` por
`RESTRICT`. Uma checagem antes, pelo cliente do usuário, passaria pela RLS e não enxergaria a conversa de
outro atendente. A FK não tem esse ponto cego nem corrida entre "ver" e "apagar".

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
- **Mensagem do 409** (chave de dicionário, `lib/i18n/dicionario.ts`): *"Este contato tem conversas e não
  pode ser excluído, para preservar o histórico. Peça a um administrador para anonimizá-lo."*
- **UI**: `ContactsTable` renderiza o botão só se o predicado de papel da rota valer (T0b), via
  `useActiveOrg()` e `ROLE_RANK`, como `ChatThread`. O diálogo troca o texto sobre "conversa associada".

## 4. Dados
**Nenhuma coluna, tabela ou função nova.** Uma migration, `20261124140000_0239_conversa_nao_se_apaga_pela_api.sql`
(o número é o próximo livre em `ls supabase/migrations`; confirmar na implementação), com os **cinco
artefatos** declarados:

| # | Artefato | Conteúdo |
|---|---|---|
| 1 | Migration versionada | `drop policy if exists conversations_agent_delete`; `revoke delete on conversations from authenticated, anon`; recria `messages_update` e `messages_delete` com papel `agent`+ e `exists` de conversa visível |
| 2 | Apêndice no `baseline.sql` | O mesmo corpo, **no fim do arquivo**, com o rótulo `-- ---- … (migration 0239) ----` |
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
| RF-4 | §3 handler |
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
| **`agent` perde o direito de excluir contato** (mudança que existia e deixou de existir) | Fragmento `exige_acao` com "Requer atenção"; confirmar a classificação com o revisor (`04-tarefas.md` T7) |
| Contato com conversa vira beco sem saída para `manager` | A mensagem do 409 manda pedir a um administrador. Se o 409 for frequente, a D resolve |
| Janela no `update.sh` em que o `DELETE` volta | Mesma natureza dos outros blocos do apêndice; detalhada em §4. Não há como fechá-la sem editar o dump |
| `UPDATE` direto em `conversations` segue aberto | Declarado em `01-requisitos.md` como fora de escopo; C e D |
| Cliente com script que apaga conversa pelo PostgREST quebra | NÃO VERIFICADO (d). A janela de rollout é o `update.sh`; nota no fragmento |
| UI e rota divergirem de novo no papel | O predicado é o **mesmo** (T0b), e o teste de 403 vigia a rota |
| Mensagem já adulterada por um `viewer` antes da migration | Fora de alcance: a migration fecha a porta, não reverte dado já alterado. `messages.edited_at` existe e pode ajudar numa auditoria futura (NÃO VERIFICADO se é preenchido por esse caminho) |
