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

### 1.6 Medições da T0 que bloqueavam a aprovação (2026-11-23, sobre `0e79ee2`)
Resposta ao review do Sciuba (ponto 4): estas medições mudam a regra do RF-1, então entram **antes**
da aprovação.

| Item | Medição | Consequência |
|---|---|---|
| (b) `assignee_kind` | `baseline.sql` ~5328-5360 (migration 0032): CHECK em forma de implicação, `kind='user'` ⇒ dono humano; `kind='ai'` ⇒ **sem dono**. Conversa de IA tem `assigned_to_user_id = null` | A comparação `assigned_to_user_id = ator` **já cobre a IA**: dono IA → null ≠ ator → não escreve (mesmo caminho do RF-6). Não é preciso filtrar por `kind`. O risco "dono IA" da §4 deixa de existir |
| (e) outros chamadores do `mark-read` | `grep -rnE "mark-read\|useMarkAsRead\|markConversationReadHandler"` em `app components hooks lib workers`, sem testes: **só** `hooks/inbox/useMarkAsRead.ts`, usado em `components/inbox/InboxLayout.tsx:248`, e a própria rota | Nenhum worker, MCP ou outra tela chama a rota. Mudar o comportamento dela só afeta o inbox |
| Tipo de ator na rota | `mark-read/route.ts` monta `actor: { type: "user", id }` fixo a partir de `requireRole`; `grep Bearer` em `lib/auth/require-role.ts` não acha tratamento de token | A rota hoje só atende sessão de usuário. Mesmo assim o handler **recusa escrever** se `ctx.actor.type !== "user"` (defesa em profundidade; ex.: `_handler.ts:193` já faz essa checagem em outra função) |

**Ainda não medido (continuam na T0, mas não mudam a regra):** (a) componente do cabeçalho do chat;
(c) o que o painel de auditoria exige para a ação nova; (d) helper de rate limit; (f) se
`listMessagesHandler` recebe o ator no `ctx` (decide o ponto de auditoria da §2.3).

## 2. Decisão proposta

### 2.1 Regra no servidor (RF-1, RF-6) — a peça que resolve o PRD
`markConversationReadHandler` passa a receber o `ctx.actor.id` e a só escrever quando
`conv.assigned_to_user_id === ctx.actor.id`. Implementação: um `UPDATE … WHERE id = :id AND
organization_id = :org AND assigned_to_user_id = :ator` seguido de leitura da conversa quando 0
linhas afetadas (para distinguir "não é o titular" de 404). A rota segue exigindo `agent`. Se `ctx.actor.type !== "user"` o handler responde sem escrever (§1.6).
Efeito: resolve o PRD para **todos** os papéis, sem depender de o gestor ligar toggle, e cobre o
cliente antigo em cache. Sem dono → `assigned_to_user_id` é `null` ≠ ator → **não escreve** (RF-6).

### 2.2 Toggle (RF-2, RF-3)
No cabeçalho do chat, visível por `manager`+ em conversa cujo titular ≠ usuário. Com o modo ativo,
`useMarkAsRead` recebe um flag e fica inerte (mesmo padrão do `readonly` de suporte). Como o RF-1
já protege o servidor, o toggle é **conveniência de UX e economia de requisição**, não a defesa.
Local do cabeçalho: **[NÃO VERIFICADO]** — T0 localiza o componente.

### 2.3 Auditoria (RF-5) — **no servidor, na leitura**
Revisão do Sciuba (pontos 1 e 5): a versão anterior auditava por uma rota `POST …/spy-view` que o
**front** precisava chamar. Quem lesse por `GET` ou pela API não deixava rastro, então não era
controle. E "toda abertura" sem dedupe vira ruído — o oposto da doutrina de audit. **Esta seção
substitui a rota `spy-view`, que sai da spec.**

**Onde:** na leitura do **conteúdo**, não numa chamada de UX. Medido: o conteúdo das mensagens sai por
`listMessagesHandler` (`app/api/v1/messages/_handler.ts:183`), usado pela rota
`GET /conversations/[id]/messages` **e** pela tool MCP `crm_get_conversation_history`
(`lib/mcp/tools/conversations.ts:181`). Auditar no handler cobre as duas portas. Se a T0(f) mostrar
que o `ctx` do handler não traz o ator, a auditoria fica na rota e o MCP vira limitação declarada
(RNF-5) — o MCP já tem a própria governança de leitura (`tests/unit/mcp-read-governance.test.ts`).

**Quando grava (e só então):** ator `manager`/`admin` (via `requireRole`, nunca `ROLE_RANK` direto),
conversa com `assigned_to_user_id` não nulo **e** ≠ ator. Sem titular não há quem espiar; titular
lendo a própria não é espionagem.

**Dedupe (obrigatório):** uma linha por (organização, conversa, ator) por janela de **30 minutos**
(`JANELA_SPY_VIEW_MIN`, constante nomeada). A rota de mensagens é chamada a cada página e a cada
reabertura, então sem isso um gestor supervisionando o dia gera centenas de linhas. Mecanismo: chave
no Redis do rate limit (`SET NX EX`), sem schema novo. **Falha aberta:** Redis ausente ou fora do ar →
audita sem dedupe (excesso de log é pior que o normal, mas falta de rastro é pior que excesso). O
helper concreto é **[NÃO VERIFICADO]**, T0.

**Fire-and-forget:** `audit()` não bloqueia nem muda a resposta da leitura (RNF-3). Falha de gravação
vai para o Sentry, como o resto do audit.

**Ação nova** `conversation.spy_viewed` entra em `AUDIT_ACTIONS`; `tests/unit/audit-lista-do-painel-e-derivada.test.tsx`
mostra que o painel deriva da lista — T0(c) mede o que a UI do painel exige.

**O que continua sem rastro (declarado, RNF-5):** o Realtime (`postgres_changes`) entrega a mensagem
nova direto ao navegador sob RLS, sem passar por handler nosso; e o PostgREST com JWT lê
`messages` direto. A auditoria prova leitura **pelo produto**, não impede nem registra acesso
direto ao banco com credencial de gestor.

### 2.4 Contrato
| Rota | Mudança |
|---|---|
| `POST conversations/[id]/mark-read` | mesma assinatura e resposta; passa a ser no-op para não titular |
| `GET conversations/[id]/messages` | mesma assinatura e resposta; passa a gravar `conversation.spy_viewed` (fire-and-forget, com dedupe) quando as condições da §2.3 valem |

**Nenhuma rota nova.** Rate limit: herdado do padrão das rotas de conversa. **[NÃO VERIFICADO]**
qual helper — T0(d).

### 2.5 Limitação conhecida: a proteção do RF-1 vale para a rota, não para o dado
Revisão do Sciuba (ponto 2). Medido em `baseline.sql:5566`: `conversations_agent_update` libera
`UPDATE` a **qualquer** `agent`+ da organização. Logo um usuário com o JWT dele pode zerar
`unread_count_for_assignee` direto pelo PostgREST, sem passar pelo handler. O RF-1 conserta o
**produto**; não fecha a porta do banco.

Fechar exigiria endurecer a policy (ou mover a escrita para uma RPC `security definer`) — isso é
**migration + apêndice do baseline**, que o RNF-2 proíbe nesta issue. Decisão da spec: **declarar
como limitação conhecida (RNF-4)** e abrir issue própria de endurecimento, em vez de relaxar o
RNF-2 aqui. Efeito prático: o contador é uma **conveniência de atendimento**, não um dado de
segurança; o risco de um usuário autenticado zerar o contador alheio por fora do produto não
expõe conteúdo nenhum.

## 3. Alternativas recusadas
- **Só o toggle (como o texto pede):** deixa o defeito para quem esquecer de ligá-lo e para o `agent`
  que abre conversa de outro (`own_and_unassigned` + `all`). A issue já aponta isso.
- **Coluna `read_by_user_id` / contador por usuário:** correto no limite, mas é schema e foge do
  "sem migration" da issue. Se Q1 revelar que o contador deve ser por leitor, **parar e alinhar**.
- **Auditar dentro do `mark-read`:** não cobre conversa sem não lidas.
- **Rota `POST …/spy-view` chamada pelo front** (versão anterior desta spec): a auditoria dependia
  de o cliente colaborar; leitura por `GET` ou API não deixava rastro. Substituída pela §2.3.

## 4. Riscos
| Risco | Mitigação |
|---|---|
| Badge do titular nunca zera se ele estiver com a conversa aberta e o `assigned_to_user_id` divergir do `auth.uid()` | Medido na §1.6: dono IA tem `assigned_to_user_id` nulo (CHECK da migration 0032), então só o titular humano casa. CA-2 trava o caso feliz |
| Conversa na fila deixa de zerar ao ser aberta por `agent` (mudança perceptível) | É a Q2; a spec propõe e o review decide |
| Volume de `spy_viewed` | Dedupe por (org, conversa, ator) em 30 min (§2.3); fire-and-forget; só grava com titular humano ≠ ator |
| Redis fora do ar anula o dedupe | Falha aberta: audita mesmo assim. Aceito — falta de rastro é pior que excesso |
| Usuário zera contador alheio direto pelo PostgREST | Limitação declarada (§2.5, RNF-4); issue própria de endurecimento |
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
| Mapa vivo | **[A decidir no review]** se a peça (auditoria de leitura em `listMessagesHandler`) merece nó em `docs/architecture/`; exige ≥2 arestas (rota de mensagens/MCP → handler → audit) |
| `.changes/` | 1 fragmento, `capacidade_nova` (o operador passa a ver o toggle e o contador deixa de ser zerado por terceiros) |
| Schema / RLS / API | Schema: nenhum. RLS: nenhuma. API: RF-1 muda comportamento do `mark-read`; `GET …/messages` passa a auditar; **nenhuma rota nova** |
