# 02 — Design

## 1. O que existe (medido em `365a670`)

### 1.1 O defeito, no código
`app/api/v1/conversations/_handler.ts:505-514`:
```ts
.from("conversations").update({ unread_count_for_assignee: 0 })
.eq("id", conversationId).eq("organization_id", ctx.organization_id)
```
Sem comparar `assigned_to_user_id`. A rota (`mark-read/route.ts`) exige `requireRole("agent")` e usa o
client do usuário; a RLS de UPDATE (`conversations_agent_update`, baseline ~5565) libera qualquer
`agent`+ da organização. Quem **vê** a conversa (`fn_can_view_conversation`) e é `agent`+ consegue zerar.

### 1.2 Quem chama
`components/inbox/InboxLayout.tsx:248` → `useMarkAsRead(id, unread)` (`hooks/inbox/useMarkAsRead.ts`):
debounce de 1,5 s, só com `unread > 0`, inerte em `support_readonly`. É a **única** chamada de
`mark-read` no front (`grep useMarkAsRead` em `app components hooks`).

### 1.3 Provedor: nenhuma confirmação de leitura
`grep -rniE "readMessages|sendSeen|mark_as_read|markRead|read.?receipt|confirma[çc][ãa]o de leitura"`
em `lib app workers` → só `lib/waha/ingest.ts` (que **recebe** `ack`/read-receipt de mensagem
outbound, linhas 587 e 955 — direção oposta) e um teste. **Não há chamada de saída.**
Consequência: RF-4 já é verdade hoje; o trabalho é **travá-la com teste** para que ninguém a quebre.
**[NÃO VERIFICADO]:** se o WAHA/Meta enviam "visto" sozinhos por configuração da sessão. É a Q3.

### 1.4 Outros caminhos que mexem no contador
| Caminho | Efeito | Fica? |
|---|---|---|
| `fn_conversation_assign` (baseline 5624+) | zera ao mudar de dono | sim — o novo dono começa limpo |
| `fn_mark_conversation_message` | `inbound` +1; `outbound` → 0 | sim; o "outbound → 0" é a Q5 |
| `messages/_handler.ts:907` | resposta pelo CRM zera | sim; Q5 |

### 1.5 Visibilidade e auditoria
- `fn_can_view_conversation` (baseline 5522): `manager`/`admin`/`viewer` veem **tudo**; `agent`
  vê as próprias e, no default `own_and_unassigned`, as sem dono. Logo o gestor **já** abre conversa
  alheia sem nenhuma permissão nova.
- `audit()` (`lib/audit/index.ts:51`); vocabulário em `lib/audit/actions.ts` (`AUDIT_ACTIONS`, lista
  TS; ex.: `conversation.claimed`). `api_audit_log.action` **não tem CHECK** (grep no baseline só
  acha a policy de INSERT) → ação nova **não exige migration**.
- Papéis: `requireRole("manager", …)` (`lib/auth/require-role.ts`); comparar `ROLE_RANK` direto em
  rota é proibido por aquele arquivo.

## 2. Decisão proposta

### 2.1 Regra no servidor (RF-1, RF-6) — a peça que resolve o PRD
`markConversationReadHandler` passa a receber o `ctx.actor.id` e a só escrever quando
`conv.assigned_to_user_id === ctx.actor.id`. Implementação: um `UPDATE … WHERE id = :id AND
organization_id = :org AND assigned_to_user_id = :ator` seguido de leitura da conversa quando 0
linhas afetadas (para distinguir "não é o titular" de 404). A rota segue exigindo `agent`.
Efeito: resolve o PRD para **todos** os papéis, sem depender de o gestor ligar toggle, e cobre o
cliente antigo em cache. Sem dono → `assigned_to_user_id` é `null` ≠ ator → **não escreve** (RF-6).

### 2.2 Toggle (RF-2, RF-3)
No cabeçalho do chat, visível por `manager`+ em conversa cujo titular ≠ usuário. Com o modo ativo,
`useMarkAsRead` recebe um flag e fica inerte (mesmo padrão do `readonly` de suporte). Como o RF-1
já protege o servidor, o toggle é **conveniência de UX e economia de requisição**, não a defesa.
Local do cabeçalho: **[NÃO VERIFICADO]** — T0 localiza o componente.

### 2.3 Auditoria (RF-5)
O `mark-read` **não serve de gatilho**: só dispara com `unread > 0` e depois de 1,5 s. Para auditar
"gestor viu" é preciso um evento ao abrir. Proposta: `POST /api/v1/conversations/[id]/spy-view`
(`requireRole("manager")`), que `audit()`a `conversation.spy_viewed` e **só** grava quando
`assigned_to_user_id` existe e ≠ ator; chamado pelo front uma vez por conversa aberta por sessão de
tela. Granularidade (toda abertura × só com modo ativo × dedupe por janela) é a Q4. Ação nova entra
em `AUDIT_ACTIONS`; o teste `tests/unit/audit-lista-do-painel-e-derivada.test.tsx` mostra que o
painel deriva da lista — **medir em T0** o que a UI do painel de auditoria exige para a ação nova.

### 2.4 Contrato
| Rota | Mudança |
|---|---|
| `POST conversations/[id]/mark-read` | mesma assinatura e resposta; passa a ser no-op para não titular |
| `POST conversations/[id]/spy-view` | **nova** (a confirmar na Q4); 200 `{ data: { audited: boolean } }`; `fail()` padrão |

Idempotência: `spy-view` não é criação; sem `Idempotency-Key`. Rate limit: herdado do padrão das
rotas de conversa. **[NÃO VERIFICADO]** qual helper — T0.

## 3. Alternativas recusadas
- **Só o toggle (como o texto pede):** deixa o defeito para quem esquecer de ligá-lo e para o `agent`
  que abre conversa de outro (`own_and_unassigned` + `all`). A issue já aponta isso.
- **Coluna `read_by_user_id` / contador por usuário:** correto no limite, mas é schema e foge do
  "sem migration" da issue. Se Q1 revelar que o contador deve ser por leitor, **parar e alinhar**.
- **Auditar dentro do `mark-read`:** não cobre conversa sem não lidas.

## 4. Riscos
| Risco | Mitigação |
|---|---|
| Badge do titular nunca zera se ele estiver com a conversa aberta e o `assigned_to_user_id` divergir do `auth.uid()` (ex.: dono IA/`assignee_kind ≠ user`) | CA-2 + T0 mede `assignee_kind`; só `kind = user` entra na comparação |
| Conversa na fila deixa de zerar ao ser aberta por `agent` (mudança perceptível) | É a Q2; a spec propõe e o review decide |
| Volume de `spy_viewed` se auditar toda abertura | Q4: dedupe; fire-and-forget; não bloqueia |
| Gestor responde e zera (Q5) — o PRD continua parcialmente aberto | Declarado em "Fora de escopo" e Q5 |

## 5. Living System Checklist (`docs/doctrine/sistema-vivo.md`)
| Item | Resposta |
|---|---|
| Entrada e saída | Entrada: gestor abre conversa alheia. Saída: contador do titular intacto + linha de audit |
| Emite log/atividade | `conversation.spy_viewed` em `api_audit_log` |
| Aparece na tela | Toggle no cabeçalho; linha no painel de auditoria (**T0 confirma** que o painel a lista) |
| Porta na navegação | Sem tela nova; nada a declarar em `lib/navigation/registry.ts` |
| Anti-morte | O não lido do titular deixa de morrer por olhar alheio — é o objetivo da issue |
| Laço de retorno (invariante 7) | Se o gestor espiar demais, o audit mostra quem viu o quê; se RF-1 errar para o titular, o badge nunca zera e aparece no e2e (CA-2) |
| Mapa vivo | **[A decidir no review]** se a peça (`spy-view`) merece nó em `docs/architecture/`; exige ≥2 arestas (inbox → rota → audit) |
| `.changes/` | 1 fragmento, `capacidade_nova` (o operador passa a ver o toggle e o contador deixa de ser zerado por terceiros) |
| Schema / RLS / API | Schema: nenhum. RLS: nenhuma. API: RF-1 muda comportamento; `spy-view` nova |
