# 05 — Revisão e aprovação

## Decisões
Em 2026-11-16 o autor da spec (cMoreiraSul) **adotou as recomendações** abaixo. A issue #67 exige a
aprovação do **dono do produto**, registrada na coluna "Confirmado pelo dono do produto":

- **2026-11-13** — [decisão de produto](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6860649540):
  confirmou Q1 e Q7.
- **2026-11-17** — [resposta do dono do produto](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6951928040)
  à proposta de schema: aprovou Q2, Q3, Q4, Q5, Q8 e Q9, deixou a Q6 fora com risco aceito, decidiu
  N1 a N4 e **aprovou o schema de forma condicionada** (ver "Condições" abaixo).

Os comentários da #67 são postados pela conta do `Sciuba`, que relata a decisão do dono do produto.

| Data | Pergunta | Decisão adotada | Efeito no design | Confirmado pelo dono do produto |
|---|---|---|---|---|
| 2026-11-16 | Q1: bloqueio total ou só da ação? | **Só a ação.** A leitura fica liberada | O `agent` fora do expediente lê, mas não assume, responde, transfere, anota, solta, adia nem encerra. Faixa na tela em vez de redirecionamento. RF-4 e RF-5 reescritos | ✅ 2026-11-13 |
| 2026-11-16 | Q2: onde mora o expediente? | `organizations.settings.business_hours` | Sem coluna nova; reusa `localMoment` e `isWithinSchedule` | ✅ 2026-11-17 |
| 2026-11-16 | Q3: departamento | Tabela `departments` nova | `channel_routing_*` fica como está (por número) | ✅ 2026-11-17 |
| 2026-11-16 | Q4: operador em quantos setores? | Vários | Tabela de vínculo `department_members` (N:N) | ✅ 2026-11-17 |
| 2026-11-16 | Q5: dono vê a conversa de outro setor? | Sim | A regra de dono vem antes da de setor em `fn_can_view_conversation` | ✅ 2026-11-17 |
| 2026-11-16 | Q6: leads e contatos no isolamento? | Não neste PRD | Fora de escopo. **Risco aceito:** timeline, atividades e o 360 do contato podem mostrar conteúdo de conversa de outro setor. Mapeado na [#80](https://github.com/itConesul/CRMPI/issues/80) | ✅ 2026-11-17 (com risco aceito) |
| 2026-11-16 | Q7: conversa com todos barrados | Fica sem dono até a abertura; o aviso ao cliente é do PRD-07 | Virou RF-11 | ✅ 2026-11-13 |
| 2026-11-16 | Q8: granularidade do expediente | Por dia da semana, sem feriado | `windows` com `dow`, como no horário por atendente | ✅ 2026-11-17 |
| 2026-11-17 | Q9: expediente da organização ou de cada setor? | **Por organização agora** | Evolução prevista, **fora desta spec**: `departments.business_hours jsonb` nullable com fallback para o da organização (aditivo, sem backfill, não quebra o `update.sh`) | ✅ 2026-11-17 |
| 2026-11-17 | **N1** — apagar um setor com conversas | **Bloqueado** enquanto houver conversas; exige reatribuição explícita. Não volta a "sem setor" em silêncio | `conversations.department_id` sem `on delete set null`; 409 `department_not_empty`; rota de reatribuição (RF-13) | ✅ 2026-11-17 |
| 2026-11-17 | **N2** — escrita | A regra de setor vale também para UPDATE/DELETE de conversa e INSERT em `messages`, com a mesma função (`using` + `with check`) | §4.3 (RF-14) | ✅ 2026-11-17 |
| 2026-11-17 | **N3** — virada de dia | **Aceitar `end < start`** (ex.: 22:00–06:00). A janela pertence ao `dow` em que começa | Schema e `isWithinSchedule` ganham a virada; testes de borda (RF-3) | ✅ 2026-11-17 |
| 2026-11-17 | **N4** — tentativa barrada | **Não** grava uma linha de audit por tentativa | Só se conta, em contador agregado (RNF-5) | ✅ 2026-11-17 |

## Condições da aprovação do schema (2026-11-17)
A aprovação do §4 de `02-design.md` é **condicionada** a estes seis ajustes entrarem na spec antes de
qualquer migration. Todos foram incorporados em 2026-11-17; o `Sciuba` registra a aprovação final
abaixo quando conferir.

| # | Condição | Onde ficou |
|---|---|---|
| 1 | FK composta `(department_id, organization_id)` em `department_members` + `unique (id, organization_id)` em `departments`, e checagem de que o usuário pertence à organização | §4.2 |
| 2 | Inventário de todos os chamadores de `fn_can_view_conversation`, com teste de isolamento por chamador, ou substituição da assinatura antiga | §1, §4.3 (5 chamadores; todos migrados; a antiga é removida) |
| 3 | N1 e N2 | §4.2, §4.3, §3 |
| 4 | T3 (rotas com client admin) é **pré-requisito** de ativar a RLS | `04-tarefas.md` (T3 antes de T4b) |
| 5 | Gate de expediente **fail-closed**: todo não-GET de `agent` é barrado por padrão, com lista de exceções justificadas | §2.1 |
| 6 | Registrar o comportamento do Realtime (DELETE não passa pela RLS; transferência para setor alheio não notifica quem perdeu o acesso), com teste e2e, e um `explain` da listagem com volume | §1, §8, `03-testes.md` |

## Comentários de review
| Data | Revisor | Comentário | Resolução |
|---|---|---|---|
| 2026-11-13 | Sciuba (decisão do dono do produto) | Expediente bloqueia ações, não a leitura; `admin`/`manager` com bypass **com auditoria**; mensagem do cliente entra na fila; servidor recusa e a UI mostra o motivo | **RF-10**, **RF-11**, **RF-12**, T2b; Q1 e Q7 confirmadas |
| 2026-11-17 | Sciuba, `02-design.md` §4.2 — excluir setor expõe conversas | `set null` devolve a conversa a "visível a todos" | **Procede.** N1: FK `no action` + 409 + reatribuição explícita (§4.2). `no action` e não `restrict` porque a checagem ocorre no fim do comando e não depende da ordem do cascade quando a organização inteira é apagada (medido: ambos passam no ordenamento testado; o apagamento só do setor é bloqueado) |
| 2026-11-17 | Sciuba, §4.3 — função antiga de 2 argumentos | Só `conversations_select` é repontada | **Procede.** Inventário no catálogo: além da policy, `fn_appointment_stamp`, `fn_meet_action`, `tenant_isolation_ai_reply_drafts_all` e `fn_reply_action`. Todos migram para a assinatura nova e a antiga é removida (§4.3) |
| 2026-11-17 | Sciuba, §4.3 — escrita sem escopo de setor | UPDATE/DELETE de conversa e INSERT em `messages` abertos a qualquer `agent` | **Em parte, e a parte que procede é maior do que o comentário.** Medido num banco com a baseline: `UPDATE`/`DELETE` com `WHERE` **já** respeitam o SELECT (0 linhas), então conhecer o id não basta. Mas um `INSERT` em `messages` de uma conversa que o agente **não enxerga** passou (`INSERT 0 1`), hoje, sem setor nenhum. N2 adotado (§4.3), mais uma guarda do `department_id` |
| 2026-11-17 | Sciuba, §4.2 — `department_members` sem FK composta | Um INSERT errado cruza tenants | **Procede.** FK composta nas três tabelas que apontam para setor/usuário (§4.2). Medido: o Postgres aceita a FK `(organization_id, user_id)` para `user_organizations`, que tem a unique em outra ordem |
| 2026-11-17 | Sciuba, §2.1 — gate opt-in e varredura só em `conversations/**` | `/messages`, leads, tarefas ficam abertos às 22h | **Procede, e é o mais grave.** São 165 rotas com método de escrita e só 15 em `conversations/**`; 34 das de fora exigem só `agent`. Fail-closed (§2.1). O `requireRole` não conhece o método HTTP, então o mecanismo é decisão da T0 |
| 2026-11-17 | Sciuba, §3 — meia-noite | `22:00–06:00` é rejeitado | **Procede.** N3. Correção ao argumento: duas janelas em `dow` seguidos já cobrem a noite, exceto o minuto 23:59 (`end` é exclusivo e `24:00` não passa na regex). `end = 00:00` passa a significar meia-noite |
| 2026-11-17 | Sciuba, §7 — auditoria da tentativa barrada | Cada 403 escreve uma linha | **Procede.** N4: nenhuma linha de audit por tentativa; contador agregado por organização e dia |
| 2026-11-17 | Sciuba, §2 — duas SHAs | `eb8bd68` e `59c76a3` | Corrigido por Sciuba em `12700bb` |
| 2026-11-17 | Sciuba, `05-revisao.md` e README | Linha em branco quebrava a tabela; README divergia | Corrigido por Sciuba em `1152305` e `250b2a1`. Este arquivo foi reescrito em 2026-11-17 com todas as decisões |
| 2026-11-17 | Sciuba, `03-testes.md` — e2e depende do relógio | "Fora" e "dentro" usam o dia de hoje | **Procede.** A janela do e2e é construída em torno do `agora` que o **servidor** devolve, e a virada de dia (N3) torna isso imune à meia-noite; as bordas vão para teste unitário com relógio injetado |
| 2026-11-17 | Sciuba, comentário geral — Realtime, desempenho, Q6, `updated_at` | Realtime sem RLS no DELETE; função por linha; risco da Q6; trigger de `updated_at` | Realtime e `explain`: §1, §8, T0, T4b. Q6: risco aceito (#80). `updated_at`: o repo tem `fn_set_updated_at` (`baseline.sql`), usado nos triggers de `departments` |

## Aprovação
Aprovação condicionada registrada em 2026-11-17 (comentário na #67). As caixas abaixo são do **dono
do produto / revisor** e só são marcadas por ele:

- [ ] **Proposta de schema (`02-design.md` §4) aprovada por:** <nome> em <AAAA-MM-DD> — migration liberada
- [ ] **Spec aprovada por:** <nome> em <AAAA-MM-DD> — implementação liberada
