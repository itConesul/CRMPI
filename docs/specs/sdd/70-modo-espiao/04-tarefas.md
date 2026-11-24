# 04 — Tarefas

Só começam com o estado `aprovada` no `README.md` e **a spec mergeada na `develop`**. Cada tarefa é
TDD (teste vermelho → código mínimo → verde) e cita os IDs no commit.

| # | Tarefa | Cobre | Prova | Feito |
|---|---|---|---|---|
| T0 | **Medir os NÃO VERIFICADOS restantes** de `02-design.md`: (a) componente do cabeçalho do chat; (c) o que o painel de auditoria exige para a ação nova; (d) helper de rate limit; (f) se `listMessagesHandler` recebe o ator; (g) helper de papel simulado em `tests/invariants/`. **(b) e (e) já medidos** em `02-design.md` §1.6 | RF-1, RF-2, RF-5 | saída colada em `02-design.md` | [~] |
| T1 | `markConversationReadHandler` só escreve para o titular (e a sem dono não escreve), com o ator vindo de `ctx.actor` | RF-1, RF-6 | `mark-read-titular.test.ts`, `mark-read-so-do-titular.test.ts` (`pnpm test:db`) | [ ] |
| T2 | Trava RF-4: varredura que o caminho de `mark-read` não toca `lib/channels` | RF-4 | `mark-read-nao-fala-com-o-provedor.test.ts` | [ ] |
| T3 | `conversation.spy_viewed` em `AUDIT_ACTIONS` + auditoria **no servidor** em `listMessagesHandler` (ator + titular + papel) com dedupe de 30 min (`JANELA_SPY_VIEW_MIN`), falha aberta e fire-and-forget. **Sem rota nova** | RF-5, RNF-3 | `espiao-auditoria.test.ts`, painel de auditoria | [ ] |
| T4 | Selo "Conversa de <titular>" no cabeçalho (`manager`+, titular humano ≠ usuário, sem controle) + `useMarkAsRead` inerte enquanto o selo aparece, pela **mesma condição**. **Não chama nada para auditar** (a auditoria é do servidor) | RF-2, RF-3, CA-9 | `useMarkAsRead.test.tsx`, componente | [ ] |
| T7 | Abrir **issue própria** de endurecimento da RLS de `conversations` (`conversations_agent_update`) e linkar aqui. Não é desta spec | RNF-4 | issue #99 (https://github.com/itConesul/CRMPI/issues/99) | [x] |
| T5 | E2E pela tela em ambiente fresco (DoD 12): gestor × titular, badge `3` intacto; registrar em `SPECS_PARTE_*` (`e2e-cobertura-completa.test.ts`) e em `docs/testing/user-journey-map.md`; evidência em `.superpowers/evidence/` | CA-3, CA-5, CA-9 | `tests/e2e/modo-espiao.spec.ts` | [ ] |
| T6 | Fragmento em `.changes/` (`capacidade_nova`), `pnpm release:conferir`; mapa vivo se Q aprovar; procurar afirmações de estado sobre "marcar como lida" nos docs de autoridade (DoD 16) | DoD 16, 17 | `pnpm release:conferir` | [ ] |

**Ordem:** T0 → T1 → T2 → T3 → T4 → T5 → T6. T1 e T2 já entregam o PRD para todos os papéis, antes
de qualquer UI. **Sem migration em nenhuma tarefa** (RNF-2); se alguma precisar, parar e alinhar.
