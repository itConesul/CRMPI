# 04 — Tarefas

Só começam depois que o estado do `README.md` for `aprovada` — **e é**: a spec e a proposta de schema foram aprovadas em 2026-11-17 (ver `05-revisao.md`). A ordem dos PRs abaixo vale. As marcadas **🔒** tocam o banco e
**exigem a aprovação da proposta de schema** registrada na issue #67 e em `05-revisao.md`. As demais
não tocam schema e podem ser adiantadas, como a issue permite.

| # | Tarefa | Cobre | Prova | 🔒 | Feito |
|---|---|---|---|---|---|
| T0 | **Medir os NÃO VERIFICADOS** de `02-design.md` §1: (a) `loadAuthUser` carrega `settings`? (b) algum canal de **broadcast** carrega dado de conversa? (c) o que o Realtime faz quando a linha sai do escopo por transferência (2 usuários) e no `DELETE`? (d) lista das rotas que leem `conversations` com client admin; (e) **como o gate fail-closed conhece o método HTTP** (o `requireRole` não o recebe): cabeçalho carimbado pelo `proxy.ts` e lido por `headers()`, ou outra via — decidir e registrar em `02-design.md` §2.1; (f) inventário em `app/api/v1/**` das rotas não-GET que um `agent` alcança, **gerado por script**: confirma as isenções fixas decididas (leitura, login/logout, troca de organização, perfil, preferências, MFA, notificação lida, presença, `attendants/availability`) e propõe, para o CRM interno (leads, contatos, tarefas, agenda), **uma liberação por rota com o motivo escrito e o critério "dispara mensagem ao cliente?"** (hoje, nenhuma); decide também se um `agent` alcança as 17 rotas de escrita que não passam por `requireRole` | RF-4, RF-9, RNF-2 | resultado colado em `02-design.md` | | [ ] |
| T1 | **Janela com virada de dia (N3), só no expediente:** schema próprio `expedienteConfigSchema` (aceita `end < start`, rejeita `start == end`); a função de janela compartilhada `janelaContem`/`isWithinSchedule` ganha a opção `viradaDeDia` **desligada por padrão** (a janela pertence ao `dow` em que começa; Sábado→Domingo incluso). **O schema do atendente NÃO muda** (a agenda descarta janela com `end < start`). Funções puras `dentroDoExpediente`, `proximaAbertura` e `expedienteBarra` em `lib/expediente/`. **Regressão:** os testes de roteamento e agenda existentes seguem verdes sem mudança | RF-3, RF-4, RF-6, RF-10 | `lib/expediente/expediente.test.ts`, `lib/routing/eligibility.test.ts` | | [ ] |
| T2 | Erro `OUT_OF_WORK_HOURS` em `lib/api/errors.ts`; **gate fail-closed** (mecanismo da T0): todo não-GET de `agent` é barrado fora do expediente, e a rota só escapa declarando `expediente: { isenta: "<motivo>" }`; **sem linha de audit por tentativa** (N4) e contador agregado; varredura de AST de **`app/api/v1/**`** que reprova isenção sem motivo e rota `cron/*`/`webhooks/*` com o gate | RF-4, RNF-1, RNF-5 | `tests/unit/expediente-isencoes.test.ts`, `tests/unit/expediente-rotas-de-acao.test.ts` | | [ ] |
| T2b | **Distribuição respeita o expediente (RF-12):** parâmetro opcional `expediente` em `lib/routing/eligibility.ts` e `decide.ts` (`undefined` = sem restrição); quem monta a entrada do roteamento passa `organizations.settings.business_hours`. **Medir antes** quais chamadores montam essa entrada (`lib/routing/eligibles.ts` e os workers) | RF-11, RF-12 | `lib/routing/eligibility.test.ts`, `lib/routing/decide.test.ts` (+ os existentes sem mudança) | | [ ] |
| T3 | **Auditar as rotas com client admin** que listam conversas e aplicar a regra de setor na consulta (`organization_id` do cookie). **Pré-requisito de T4b** (condição 4 da aprovação): a RLS nova só é ativada depois que nenhuma rota a contorna. Inclui, para cada chamador de `fn_can_view_conversation` que não é policy (`fn_appointment_stamp`, `fn_meet_action`, `fn_reply_action`), decidir de onde vem o setor | CA-2, RNF-2 | teste por rota | 🔒 | [ ] |
| T4a | Migration **de estrutura**: `departments` (com `unique (id, organization_id)` e `updated_at`), `department_members` (FKs compostas), `conversations.department_id` (FK composta, **`no action`**); RLS das tabelas novas; apêndice idempotente no `baseline.sql`; linha no `MANIFEST.md`; regenerar `lib/database.types.ts`. **Não troca nenhuma policy existente** | RF-1, RF-2 | `tests/invariants/departamentos-estrutura.test.ts`, `pnpm test:db` (install + update) | 🔒 | [ ] |
| T4b | Migration **da regra** (depois de T3; inclui a policy de `INSERT` em `conversations`, o trigger do `department_id` **aceito**, o `VALIDATE` da FK `NOT VALID` e o caso do **`INSERT` manual por `agent` com `visibility_mode = own`**: negado sem dono, passa com `assigned_to_user_id = auth.uid()`, e a rota `open-with-contact` (client admin) não é afetada): `fn_can_view_conversation(uuid,uuid,uuid)`, **todos** os chamadores migrados e a assinatura antiga removida; `conversations_select/update/delete` e `messages_insert/update/delete` com a regra de setor (N2); guarda do `department_id`; `explain` da listagem com volume | RF-7 a RF-9, RF-14, RNF-2 | `tests/invariants/visibilidade-por-setor.test.ts`, `tests/invariants/fn-can-view-conversation-chamadores.test.ts`, `pnpm test:db` | 🔒 | [ ] |
| T5 | Rotas `/settings/expediente`, `/departments*` e `POST /departments/[id]/reassign` com audit e `Idempotency-Key`; `DELETE` com 409 `department_not_empty` | RF-1 a RF-3, RF-13 | unit por rota | 🔒 | [ ] |
| T6 | Tela: seções Expediente e Departamentos em Configurações › Atendimento; contador de barrados (do contador agregado, `—` quando o Redis não responde) | RF-1 a RF-3, RNF-5 | e2e | 🔒 | [ ] |
| T7 | Faixa de aviso no shell do app com os controles de ação desabilitados + página informativa `/app/fora-de-expediente` + allowlist de navegação com justificativa | RF-5 | e2e + `navegacao-completude` | | [ ] |
| T8 | Spec e2e `tests/e2e/expediente-e-setor.spec.ts` (CA-1, CA-2, **Realtime com transferência entre setores**, instalação fresca); registrar em `SPECS_PARTE_*`; jornada em `docs/testing/user-journey-map.md`; evidência em `.superpowers/evidence/` | CA-1, CA-2 | `e2e-cobertura-completa.test.ts` verde | 🔒 | [ ] |
| T9 | Mapa vivo `docs/architecture/expediente-e-setor.architecture.json` + atualização de `organizacoes-e-acesso`; atualizar `docs/index.md` se houver doc novo | Sistema Vivo | teste de mapas de arquitetura | | [ ] |
| T10 | Fragmento em `.changes/` (`capacidade_nova`); conferir com `pnpm release:conferir`; procurar afirmações de estado sobre visibilidade/horário nos docs de autoridade (DoD 16) | DoD 16, 17 | `pnpm release:conferir` | | [ ] |

**Ordem:** T0 → T1 → T2 → T2b → T7 (nada disso toca o banco) → **aprovação** → T4a → **T3** → T4b → T5 →
T6 → T8 → T9 → T10.

T0 vem primeiro porque o mecanismo do gate (e), o custo do gate (a), o Realtime (c) e a quantidade de
rotas com filtro manual (d, f) dependem do que ele mede. T3 vem **antes** de T4b por decisão do dono
do produto: ativar a RLS de setor com uma rota admin ainda aberta é o vazamento que ela deveria impedir.

## Sequência de implementação (decisão do dono do produto, 2026-11-17)
Esta spec é **só de spec**. Depois da aprovação final registrada em `05-revisao.md`, a implementação vai
em **PRs separados, todos para a `develop`**, nesta ordem:

1. **Gate de expediente, sem schema** (T0, T1, T2, T2b, T7 e a rota de configuração). A branch
   `feat/67-expediente-gate` já existe, mas **o PR só abre depois da aprovação da spec**.
2. **Auditoria T0(d) + T3:** as rotas que leem conversas com client admin passam a repetir a regra de setor.
3. **T4a:** tabelas e FKs aditivas.
4. **T4b:** liga a RLS e as policies de escrita, **só depois da T3**, com `pnpm test:db` (`install` e
   `update` com banco povoado), `explain` com volume e e2e de transferência entre setores.

**Nenhum PR traz migration, apêndice de `baseline.sql` ou linha de `MANIFEST.md` antes da aprovação final.**

## Andamento (atualizado em 2026-11-18)
A parte desta lista que **não toca o banco** está implementada na branch `feat/67-expediente-gate` (a partir da `develop`), em PR separado deste, que foi só de spec. A spec foi aprovada e mergeada (PR #75); o PR do gate **ainda não foi aberto**. A tabela descreve o que a branch contém, não o que já está na `develop`:

| Tarefa | Estado na branch | Evidência |
|---|---|---|
| T0 | **Parcial.** (a), (e) medidas e (f) inventariada — resultados em `02-design.md` §2.1. **Abertas:** (c) Realtime com transferência e (d) rotas com client admin | §2.1 |
| T1 | **Feita** (regra pura, virada de dia só no expediente, `opens_at`) | `lib/expediente/expediente.test.ts`, `formatar.test.ts`, `descrever.test.ts` |
| T2 | **Parcial.** Gate fail-closed e `403 OUT_OF_WORK_HOURS` prontos; isenções declaradas em código: `attendants/availability/[user_id]` e `notifications/push`. **Falta:** o contador agregado de barrados (RNF-5, alimenta a T6), o repasse do `foraDoExpediente` ao audit das mutações de `admin`/`manager` (RF-10) a decisão sobre as 2 pontas soltas abaixo. **Conferência das 9 isenções fixas (2026-11-18, medida no código):** 7 escapam do gate **por construção**, porque não passam por `requireRole` — login/logout (`app/actions/auth/signOut.ts`, Supabase Auth), troca de organização (Server Action `setActiveOrg`), perfil, preferências e MFA (Server Actions, ver §2.1), e "marcar notificação como lida" (não há rota em `app/api/v1/notifications/`, só `push`); presença e `attendants/availability` escapam por **isenção declarada**. **Pontas soltas, para o dono do produto decidir:** (1) `POST conversations/[id]/mark-read` (zera o contador de não lidas) **é barrada hoje** e é disparada pelo inbox sozinho 1,5 s depois de abrir a conversa (`hooks/inbox/useMarkAsRead.ts`) — fora do expediente o `agent` abre a conversa para ler, como a Q1 permite, e a chamada devolve 403 a cada abertura; não dispara mensagem ao cliente, então cai no critério de liberação, mas a lista de isenções é fixa e acrescentar exige decisão visível (o teste `expediente-rotas-de-acao` a fixa); (2) `notifications/push` está isenta no código e **não consta** da lista aprovada — o motivo escrito ("inscrição de push do próprio navegador") é do mesmo tipo de perfil/preferências, mas é isenção a mais do que o dono aprovou. Das 57 rotas com método de escrita cujo `requireRole` tem piso `viewer`/`agent`, só 2 declaram isenção (3 declarações: o `push` tem duas); as outras 55 são barradas, como o fail-closed manda (a contagem inclui `settings/expediente`, cujo `PATCH` é de `admin`) | `lib/expediente/gate.test.ts`, `tests/unit/expediente-rotas-de-acao.test.ts` |
| T2b | **Feita** (distribuição, aviso ao lead e ferramenta MCP de escalação respeitam o expediente) | `lib/routing/eligibility.test.ts`, `decide.test.ts` |
| T5 | **Só a rota `GET/PATCH /api/v1/settings/expediente`**, que não exige migration (`business_hours` já mora em `organizations.settings`) e audita `expediente.config_changed`. `/departments*` e `reassign` seguem 🔒 | `app/api/v1/settings/expediente/route.test.ts` |
| T7 | **Feita:** faixa no shell (`FaixaDeExpediente`), página `/app/fora-de-expediente` com porta em `navegacao-completude`, Composer e cabeçalho da conversa travados fora do horário | `tests/unit/expediente-ui-trava-as-acoes.test.tsx`, `tests/e2e/expediente-na-tela.spec.ts` |
| T10 | **Parcial:** fragmento `.changes/expediente-gate-e-distribuicao-dormentes.md` (`capacidade_nova`). Falta procurar afirmações de estado nos docs de autoridade (DoD 16) | `pnpm release:conferir` |

**Ainda bloqueadas (🔒, dependem de migration):** T3, T4a, T4b, T6 e T8 — cada uma em PR próprio, na ordem desta spec.
**Sem início:** T9 (mapa vivo `expediente-e-setor`).

Esta spec só marca as caixas da coluna "Feito" quando o PR do gate for mergeado na `develop`.
