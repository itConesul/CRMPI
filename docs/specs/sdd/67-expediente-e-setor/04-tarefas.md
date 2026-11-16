# 04 — Tarefas

Só começam depois que o estado do `README.md` for `aprovada`. As marcadas **🔒** tocam o banco e
**exigem a aprovação da proposta de schema** registrada na issue #67 e em `05-revisao.md`. As demais
não tocam schema e podem ser adiantadas, como a issue permite.

| # | Tarefa | Cobre | Prova | 🔒 | Feito |
|---|---|---|---|---|---|
| T0 | **Medir os NÃO VERIFICADOS** de `02-design.md` §1: `loadAuthUser` carrega `settings`? há canal de broadcast para conversas? comportamento do Realtime quando a linha sai do escopo? lista das rotas que leem `conversations` com client admin | RF-9, RNF-2 | resultado colado em `02-design.md` | | [ ] |
| T1 | Função pura `dentroDoExpediente` + `expedienteBarra` em `lib/` (reusa `isWithinSchedule`/`localMoment`), schema Zod `expedienteConfigSchema` | RF-3, RF-4, RF-6 | `tests/unit/expediente.test.ts` | | [ ] |
| T2 | Erro `OUT_OF_WORK_HOURS` em `lib/api/errors.ts`; gate dentro de `requireRole` com isenções; varredura de AST das rotas `cron/*` e `webhooks/*` | RF-4, RNF-1 | `tests/unit/expediente-isencoes.test.ts` | | [ ] |
| T3 | **Auditar as rotas com client admin** que listam conversas e aplicar a regra de setor na consulta (`organization_id` do cookie) | CA-2, RNF-2 | teste por rota | 🔒 | [ ] |
| T4 | Migration `departments`, `department_members`, `conversations.department_id`, função `fn_can_view_conversation(uuid,uuid,uuid)` + nova `conversations_select`; apêndice idempotente no `baseline.sql`; linha no `MANIFEST.md`; regenerar `lib/database.types.ts` | RF-1, RF-2, RF-7 a RF-9 | `tests/invariants/visibilidade-por-setor.test.ts`, `pnpm test:db` (install + update) | 🔒 | [ ] |
| T5 | Rotas `/settings/expediente` e `/departments*` com audit e `Idempotency-Key` | RF-1 a RF-3 | unit por rota | 🔒 | [ ] |
| T6 | Tela: seções Expediente e Departamentos em Configurações › Atendimento; contador de barrados | RF-1 a RF-3 | e2e | 🔒 | [ ] |
| T7 | Tela `/fora-de-expediente` + `layout` de servidor de `app/app/` + allowlist de navegação com justificativa | RF-5 | e2e + `navegacao-completude` | | [ ] |
| T8 | Spec e2e `tests/e2e/expediente-e-setor.spec.ts` (CA-1, CA-2, Realtime, instalação fresca); registrar em `SPECS_PARTE_*`; jornada em `docs/testing/user-journey-map.md`; evidência em `.superpowers/evidence/` | CA-1, CA-2 | `e2e-cobertura-completa.test.ts` verde | 🔒 | [ ] |
| T9 | Mapa vivo `docs/architecture/expediente-e-setor.architecture.json` + atualização de `organizacoes-e-acesso`; atualizar `docs/index.md` se houver doc novo | Sistema Vivo | teste de mapas de arquitetura | | [ ] |
| T10 | Fragmento em `.changes/` (`capacidade_nova`); conferir com `pnpm release:conferir`; procurar afirmações de estado sobre visibilidade/horário nos docs de autoridade (DoD 16) | DoD 16, 17 | `pnpm release:conferir` | | [ ] |

**Ordem:** T0 → T1 → T2 → T7 (nada disso toca o banco) → **aprovação** → T4 → T3 → T5 → T6 → T8 → T9 → T10.

T0 vem primeiro porque três perguntas de design dependem do que ele mede (custo do gate, Realtime e
quantas rotas precisam do filtro manual).
