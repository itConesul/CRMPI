# 01 — Requisitos

## Problema
Issue #70 (origem: PRD-04 da Fase 1 "substituição do ChatGuru"): gestores precisam acompanhar
atendimentos em tempo real **sem** enviar confirmação de leitura ao cliente e **sem** zerar o
contador de não lidas do atendente titular. A issue achou que o defeito existe **mesmo sem modo
espião**: `markConversationReadHandler` zera o contador sem comparar com o titular
(`app/api/v1/conversations/_handler.ts:505-514`).

Os requisitos abaixo marcados **(Q#)** dependem de decisão em [`05-revisao.md`](05-revisao.md).
A issue lista as melhorias 1–4 como "a decidir"; esta spec as escreve como **proposta** e não
como fato decidido.

## Requisitos

| ID | Requisito | Origem na issue |
|---|---|---|
| RF-1 | `POST /api/v1/conversations/[id]/mark-read` só zera `unread_count_for_assignee` quando o ator é o titular (`assigned_to_user_id = ator`). Em qualquer outro caso responde 200 com a conversa **sem escrever** **(Q1)** | Melhoria 1; "Achado que muda o desenho" |
| RF-2 | O cabeçalho do chat exibe o toggle "Modo Espião" **somente** para papel ≥ `manager`, e **somente** em conversa cujo titular não é o usuário **(Q6)** | Texto: toggle só para `admin`/`manager`; melhoria 2 |
| RF-3 | Com o modo ativo, o cliente **não** dispara `mark-read` (o hook `useMarkAsRead` fica inerte). O servidor continua protegido por RF-1 mesmo que o cliente dispare | Texto: "não executar `unread_count = 0`" |
| RF-4 | Abrir conversa, com ou sem modo espião, **não** gera chamada de confirmação de leitura ao provedor | Texto: "não chamar `mark_as_read`"; ressalva da issue (**Q3**) |
| RF-5 | Quando `manager`/`admin` lê as **mensagens** de conversa cujo titular humano é **outra pessoa**, o **servidor** grava 1 linha em `api_audit_log` (`action = conversation.spy_viewed`, `resource_type = conversation`, `resource_id`, `metadata.assigned_to_user_id`), **com dedupe** de 1 linha por (org, conversa, ator) a cada 30 min. Independe de o cliente chamar rota alguma **(Q4)** | Texto: registrar `SPY_VIEW_LEAD`; melhoria 3; review Sciuba pts 1 e 5 |
| RF-6 | Conversa **sem dono**: a regra de quem zera é a decidida em Q2; a proposta é que **ninguém zera** até alguém assumir (o `claim` já zera via `fn_conversation_assign`) **(Q2)** | Melhoria 4 |
| RNF-1 | Nenhuma string de provedor fora de `lib/channels` (`pnpm lint:channels` verde) | "Divergências": nomes de provedor |
| RNF-2 | **Nenhuma migration, nenhum apêndice de `baseline.sql`, nenhuma coluna ou tabela nova.** A ação nova entra só em `AUDIT_ACTIONS` (TS) | "Banco: não altera" |
| RNF-3 | A auditoria do RF-5 é fire-and-forget e não bloqueia a leitura da conversa (doutrina de audit) | CLAUDE.md, "Audit log" |
| RNF-4 | **Limitação conhecida:** a regra do RF-1 vale para a rota, não para o dado. `conversations_agent_update` deixa qualquer `agent`+ dar `UPDATE` direto pelo PostgREST. Endurecer exige migration (proibida pelo RNF-2) e vai para **issue própria** | Review Sciuba pt 2; `02-design.md` §2.5 |
| RNF-5 | **Limitação conhecida:** a auditoria cobre leitura **pelo produto** (rota de mensagens e, se a T0(f) confirmar, o MCP). Não cobre o Realtime nem leitura direta pelo PostgREST com JWT de gestor | Review Sciuba pt 1; `02-design.md` §2.3 |

## Critérios de aceite
O critério da issue, **verbatim**: *"gestor abre conversa com 3 não lidas em modo espião → os ticks
do cliente continuam cinzas e o badge `3` do titular segue intacto."*

Ele tem duas metades de naturezas diferentes, e a spec as separa:
- **"o badge `3` do titular segue intacto"** → verificável (CA-1, CA-2).
- **"os ticks do cliente continuam cinzas"** → **não verificável hoje**: nenhum código envia
  confirmação de leitura (`02-design.md` §1.3). O que a spec consegue provar é CA-4 (nenhuma chamada
  ao provedor). Os ticks no aparelho do cliente dependem do WhatsApp/WAHA e ficam como pergunta Q3.

| ID | Critério | Cobre |
|---|---|---|
| CA-1 | **Dado** conversa com `unread_count_for_assignee = 3` e titular A, **quando** o gestor G (≠ A) chama `mark-read`, **então** a resposta é 200 e o contador no banco continua `3` | RF-1 |
| CA-2 | **Dado** a mesma conversa, **quando** o titular A chama `mark-read`, **então** o contador vira `0` (o comportamento de hoje para o titular não regride) | RF-1 |
| CA-3 | **Dado** gestor G com o modo espião ativo numa conversa de A com 3 não lidas, **quando** a conversa fica em foco por mais que 1,5 s, **então** nenhuma requisição `mark-read` é feita e o badge do titular segue `3` | RF-3 |
| CA-4 | **Quando** `mark-read` é executado por qualquer papel, **então** nenhum adaptador de canal é invocado (nenhuma chamada ao provedor) | RF-4 |
| CA-5 | **Dado** papel `agent`, **então** o toggle não existe no DOM; **dado** `manager`/`admin` em conversa alheia, **então** existe; em conversa própria, não | RF-2 |
| CA-6 | **Quando** gestor G lê as mensagens da conversa de A (**por `GET` direto, sem passar pela tela**), **então** existe exatamente 1 linha `conversation.spy_viewed` com o `resource_id` e o ator G. **Quando** G repete a leitura dentro de 30 min (ex.: próxima página), **então** continua 1 linha. Titular lendo a própria, e conversa sem titular, **não** geram linha | RF-5, RNF-3 |
| CA-7 | **Dado** conversa sem dono e 3 não lidas, **quando** qualquer papel chama `mark-read`, **então** o contador continua `3` (proposta; sujeito a Q2) | RF-6 |
| CA-8 | `pnpm lint:channels` e `pnpm gov:verify` verdes; `git diff --name-only` não contém `supabase/` | RNF-1, RNF-2 |

## Fora de escopo
Da issue: tabela ou coluna nova; migration.
Acréscimos da spec:
- Alterar quem zera o contador **ao responder** (`messages/_handler.ts`, `fn_mark_conversation_message`):
  vai para Q5, não é implementado aqui sem decisão.
- Alterar `fn_conversation_assign` (zera ao mudar de dono, correto) e a ingestão (incrementa).
- Enviar ou suprimir confirmação de leitura **no aparelho do cliente** (WAHA/Meta).
- Visibilidade de conversa (`fn_can_view_conversation`, RLS) — o espião só opera sobre o que o
  gestor **já** enxerga.
- Papel `viewer` (a rota exige `agent`; ele não marca nada hoje) e sessão de suporte
  (`support_readonly` já não marca — `hooks/inbox/useMarkAsRead.ts`).

## Perguntas em aberto
Detalhadas em [`05-revisao.md`](05-revisao.md); cada uma tem a medição e uma recomendação.

| # | Pergunta | Bloqueia |
|---|---|---|
| Q1 | A regra "só o titular zera" (RF-1) vale para todos os papéis? Ela **substitui** a necessidade do toggle ou convive com ele? | RF-1, RF-2, RF-3 |
| Q2 | Conversa sem dono: quem zera? | RF-6, CA-7 |
| Q3 | Reescrever o aceite "ticks cinzas"? Alguém precisa medir se o WAHA/Meta marca como lido sozinho | RF-4 |
| Q4 | ~~Auditar toda abertura ou só com o modo ativo~~ **Reformulada pelo review:** auditar no servidor, na leitura, com dedupe de 30 min (`02-design.md` §2.3). Pergunta ao dono: a janela de 30 min serve? | RF-5 |
| Q5 | Responder uma conversa alheia zera o contador do titular — mudar? | escopo |
| Q6 | O toggle persiste (por usuário? por sessão?) e é padrão ligado em conversa alheia? Só vale se a Q7 mantiver o toggle | RF-2 |
| Q7 | **O toggle fica ou sai?** O RF-1 já impede o gestor de zerar o contador alheio com ou sem toggle (review Sciuba pt 3). Se sair, caem RF-2, RF-3, CA-3, CA-5, Q6 e a T4 | RF-2, RF-3 |
