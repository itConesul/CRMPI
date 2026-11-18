# 05 — Revisão e aprovação

## Decisões
Em 2026-11-16 o autor da spec (cMoreiraSul) **adotou as recomendações** abaixo. A issue #67 exige a
aprovação do **dono do produto**, registrada na coluna "Confirmado pelo dono do produto":

- **2026-11-13** — [decisão de produto](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6860649540):
  confirmou Q1 e Q7.
- **2026-11-17** — [resposta do dono do produto](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6951928040)
  à proposta de schema: aprovou Q2, Q3, Q4, Q5, Q8 e Q9, deixou a Q6 fora com risco aceito, decidiu
  N1 a N4 e **aprovou o schema de forma condicionada** (ver "Condições" abaixo).

- **2026-11-17 (20:14 e 20:20)** — o dono do produto confirmou o N3 só no expediente
  ([thread do PR](https://github.com/itConesul/CRMPI/pull/75#discussion_r4605180992)) e registrou as [decisões da fase de spec](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6959852236): gate, o que fica fora
  dele, trigger do `department_id`, policy de `INSERT`, `NOT VALID` + `VALIDATE` e SQL por extenso.

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
| 2026-11-17 | **N3** — virada de dia | **Aceitar `end < start`** (ex.: 22:00–06:00). A janela pertence ao `dow` em que começa | A virada existe **só no expediente**, em schema próprio (o do atendente NÃO muda); `isWithinSchedule` ganha a opção `viradaDeDia`, desligada por padrão; testes de borda e de `opens_at` (RF-3). **Mecanismo revisto em 2026-11-17** após o comentário das 19:43 (a agenda descarta janela com `end < start`). **Confirmado pelo dono do produto às 20:14:** schema próprio do expediente, `viradaDeDia` ligada só ali, o horário por atendente continua rejeitando `end < start`, e aceita-se o schema duplicado desde que a regra de pertencer a uma janela siga em `janelaContem`, uma função só | ✅ 2026-11-17 (decisão e mecanismo) |
| 2026-11-17 | **N4** — tentativa barrada | **Não** grava uma linha de audit por tentativa | Só se conta, em contador agregado (RNF-5) | ✅ 2026-11-17 |
| 2026-11-17 | **Gate: isenções fixas** | Leitura, login/logout, troca de organização, perfil, preferências, **cadastro e verificação de MFA**, marcar notificação como lida, presença e `attendants/availability` | §2.1; T0(f) confirma rota a rota | ✅ 2026-11-17 |
| 2026-11-17 | **Gate: CRM interno** | Leads, contatos, tarefas e agenda: **barrados por padrão**, liberados **rota a rota** com motivo escrito e o critério "dispara mensagem ao cliente?" (se dispara, continua barrada) | §2.1; lista vazia até a T0(f) | ✅ 2026-11-17 |
| 2026-11-17 | **Fora do gate** | Token Bearer, MCP, agente de IA, webhooks, cron e ingestão de mensagens — por escrito e com teste de varredura | §2.1, RNF-1, `03-testes.md` | ✅ 2026-11-17 |
| 2026-11-17 | **Trigger do `department_id`** | **Aceito.** `agent` não muda nem zera o setor; `manager`+, platform admin e `service_role` podem; `fn_conversation_assign` segue `security definer` | §4.3 (deixa de ser "proposta do autor"), T4b | ✅ 2026-11-17 |
| 2026-11-17 | **Policy de `INSERT` em `conversations`** | Com a mesma regra de visibilidade | §4.3 | ✅ 2026-11-17 |
| 2026-11-17 | **`conversations_department_fk` `NOT VALID` + `VALIDATE`** | Para o `update.sh` não travar tabela com tráfego ao vivo | §4.2, §4.4 | ✅ 2026-11-17 |
| 2026-11-17 | **SQL por extenso** | Predicado `A` e `messages_update/delete` escritos antes da migration | §4.3 | ✅ 2026-11-17 |
| 2026-11-17 | **Sequência de implementação** | PRs separados para a `develop`: (1) gate sem schema, (2) auditoria T0(d)+T3, (3) T4a, (4) T4b só depois da T3. A branch `feat/67-expediente-gate` só vira PR depois da aprovação; nenhum PR traz migration, apêndice de `baseline.sql` ou `MANIFEST.md` antes dela | `04-tarefas.md` | ✅ 2026-11-17 |

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

### Segunda rodada — os 9 itens que o revisor pediu para registrar a aprovação final (20:20)
Todos incorporados em 2026-11-17 e **aprovados pelo revisor às 20:44**.

| # | Item | Onde ficou |
|---|---|---|
| 1 | Isenções do gate fixas; CRM interno barrado por padrão e liberado por rota com o critério "dispara mensagem ao cliente?" | §2.1, T0(f), `03-testes.md` |
| 2 | Fora do gate (Bearer, MCP, IA, webhooks, cron, ingestão) por escrito e coberto pelo teste de varredura | §2.1, RNF-1, `03-testes.md` |
| 3 | Trigger do `department_id` aceito (deixa de ser "proposta do autor") | §4.3, T4b |
| 4 | Policy de `INSERT` em `conversations` com a regra de visibilidade | §4.3 |
| 5 | `conversations_department_fk` com `NOT VALID` + `VALIDATE` | §4.2, §4.4 |
| 6 | SQL por extenso (predicado `A` e `messages_update/delete`) | §4.3 |
| 7 | Linha do N3 confirmada pelo dono do produto | tabela de decisões acima |
| 8 | Corrida do e2e na virada do dia | `03-testes.md` (não lê o `agora` a menos de 30 s da fronteira; relê depois) |
| 9 | `update.sh` e `drop function`: o dump recria a antiga a cada reaplicação e o apêndice a remove; teste de `update` com banco povoado | §4.3, `03-testes.md` (RNF-3) |

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
| 2026-11-17 19:43 | Sciuba, `02-design.md` §2.1 (N3) — não é retrocompatível com a agenda | Estender `scheduleWindowSchema` faria o roteamento aceitar `22:00–06:00` e a agenda descartá-la (`horarios-livres.ts`, linhas 53–55); cita 5 consumidores; pede inventário, **uma** saída e `opens_at`/faixa nas bordas da T1 | **Procede, e eu já o tinha encontrado ao implementar a T1.** (1) Inventário dos 5 consumidores no §2.1 (jornada `safeParse`; agenda descarta; os 3 outros usam `.parse`). (2) Saída adotada: a virada vale **só para o expediente** (schema próprio), o editor do atendente continua rejeitando, a função de janela é uma só com a virada desligada por padrão. (3) Bordas de `opens_at` testadas (terça 06:00, domingo 06:00, dentro da madrugada, `end = 00:00`); a faixa da T7 deve exibi-las. **Confirmado pelo dono do produto às 20:14** ([thread](https://github.com/itConesul/CRMPI/pull/75#discussion_r4605180992)); thread resolvida |
| 2026-11-17 19:43 | Sciuba, review geral — pontos "para a T0/T1/T4b" | Autoatendimento (perfil, MFA, preferências, notificação lida) é escrita de `agent`; chamadores não humanos (Bearer, MCP); `INSERT` em `conversations`; trigger do `department_id`; SQL por extenso; `NOT VALID`; `drop function` no `update.sh`; corrida do e2e | Todos tratados em 2026-11-17 (ver a "Segunda rodada" acima). **Medido:** perfil, idioma e MFA são Server Actions sem `requireRole`, então o gate não as alcança; MCP e Bearer autenticam por `lib/mcp/auth.ts` e nunca chamam `requireRole` |
| 2026-11-17 20:20 | Sciuba, comentário geral — 9 itens para registrar a aprovação final | Ver "Segunda rodada" | Todos incorporados; as 8 threads que o commit `02ee709` cobria foram resolvidas pelo revisor. **Aprovado por ele às 20:44** ([review](https://github.com/itConesul/CRMPI/pull/75#pullrequestreview-5946320660)); a aprovação final está registrada abaixo |
| 2026-11-17 20:44 | Sciuba, aviso de aprovação na #67 — 3 ajustes de texto antes do merge | (1) corrigir a frase sobre Server Actions ("duas chamam `requireRole`, ambas de admin"); (2) marcar os checkboxes de aprovação; (3) registrar na T4b o `INSERT` manual por `agent` com `visibility_mode = own` | **(1) Parcialmente atendido, de propósito.** A frase não foi trocada, porque seria falsa: re-medido, **nenhuma** Server Action chama nem importa `requireRole` (o `grep -l` casa `updateBranding.ts` e `updateMarcaDaOrganizacao.ts` só por **comentário**, e o próprio código diz que não o usa; cada uma faz gate próprio). O que o pedido quer — que ninguém leia errado — foi atendido: a spec agora explica as duas leituras e dá o comando que as separa, **testado** (devolve vazio nas Server Actions e encontra a chamada numa rota; uma primeira versão do comando casava dois comentários e foi corrigida antes de publicar) (§2.1). **(2) Feito** (abaixo). **(3) Feito:** §4.3, `03-testes.md` e T4b; a rota de produto `open-with-contact` usa o client admin e não é afetada |

## Decisões pós-aprovação (T0(f), 2026-11-18)
A conferência rota a rota das isenções fixas (`02-design.md` §2.1) achou dois pontos que a aprovação de
2026-11-17 não cobria. O dono do produto decidiu os dois em 2026-11-18, relatados pelo `Sciuba` na
[#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6980072775).

| # | Ponto | Decisão do dono do produto (2026-11-18) | Dono da implementação e prazo |
|---|---|---|---|
| P1 | `POST conversations/[id]/mark-read` é barrada fora do expediente, e o inbox a dispara sozinho ao abrir a conversa: o `agent` que só lê leva 403 a cada abertura e o contador de não lidas não zera | **Isentar**, com o motivo escrito "ação automática da UI, sem efeito para o cliente". **Bloqueia o merge do PR do gate** | cMoreiraSul, **no próprio PR do gate**: a isenção, o ajuste de `ISENCOES_ESPERADAS` em `expediente-rotas-de-acao.test.ts` e o e2e `agent` abre a conversa fora do expediente, lê, sem 403, com o Composer travado. Sem isso o PR do gate não é mergeado |
| P2 | `notifications/push` está isenta no código e estava fora da lista aprovada | **Ratificada**: entra na lista fixa (inscrição do próprio navegador, sem efeito sobre o cliente) | Nada a implementar; já está no código e no teste |

**Critério geral para as rotas de conversa** (decidido junto com a P1): além do *"dispara mensagem ao
cliente?"* do CRM interno, vale *"ação automática da UI, sem efeito para o cliente"*. As próximas rotas
que o inbox disparar sozinho seguem o critério em vez de virar exceção caso a caso. Registrado em
`02-design.md` §2.1.

**O que fica por decidir** (não é da conferência da T0(f)): se o aviso ao lead e a ferramenta MCP de
escalação respeitarem o expediente entram na spec (RF-12) ou saem do PR do gate para o #73. Está
perguntado na #67.

## Aprovação
**Aprovada em 2026-11-17.** O dono do produto aprovou a spec e a proposta de schema (§4 de
`02-design.md`) no [review do PR #75](https://github.com/itConesul/CRMPI/pull/75#pullrequestreview-5946320660), registrado por `Sciuba` e anunciado na
[#67](https://github.com/itConesul/CRMPI/issues/67#issuecomment-6960494942). As caixas abaixo foram marcadas pelo **autor da spec** (cMoreiraSul), a pedido do
revisor, **registrando uma aprovação dada no review** — a aprovação em si é a do review, não a desta marcação.

- [x] **Proposta de schema (`02-design.md` §4) aprovada por:** dono do produto, registrado por Sciuba, em 2026-11-17 — migration liberada, **na ordem de PRs de `04-tarefas.md`** (T3 antes da T4b; nenhum PR de schema antes disso)
- [x] **Spec aprovada por:** dono do produto, registrado por Sciuba, em 2026-11-17 — implementação liberada, em **PRs novos para a `develop`** (o primeiro é o gate, sem schema)
