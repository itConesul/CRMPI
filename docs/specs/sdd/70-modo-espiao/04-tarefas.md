# 04 — Tarefas

Só começam com o estado `aprovada` no `README.md` e **a spec mergeada na `develop`**. Cada tarefa é
TDD (teste vermelho → código mínimo → verde) e cita os IDs no commit.

| # | Tarefa | Cobre | Prova | Feito |
|---|---|---|---|---|
| T0 | **Medir os NÃO VERIFICADOS** de `02-design.md`: (a) componente do cabeçalho do chat; (b) `assignee_kind` — só `user` entra na comparação?; (c) o que o painel de auditoria exige para a ação nova; (d) helper de rate limit das rotas de conversa; (e) algum outro chamador do `mark-read` além do hook | RF-1, RF-2, RF-5 | saída colada em `02-design.md` | [ ] |
| T1 | `markConversationReadHandler` só escreve para o titular (e a sem dono não escreve), com o ator vindo de `ctx.actor` | RF-1, RF-6 | `mark-read-titular.test.ts`, `mark-read-so-do-titular.test.ts` (`pnpm test:db`) | [ ] |
| T2 | Trava RF-4: varredura que o caminho de `mark-read` não toca `lib/channels` | RF-4 | `mark-read-nao-fala-com-o-provedor.test.ts` | [ ] |
| T3 | `conversation.spy_viewed` em `AUDIT_ACTIONS` + rota `spy-view` (forma final conforme Q4) | RF-5, RNF-3 | `spy-view.test.ts`, painel de auditoria | [ ] |
| T4 | Toggle no cabeçalho + `useMarkAsRead` inerte com o modo ativo + chamada de `spy-view` ao abrir | RF-2, RF-3, RF-5 | `useMarkAsRead.test.tsx`, componente | [ ] |
| T5 | E2E pela tela em ambiente fresco (DoD 12): gestor × titular, badge `3` intacto; registrar em `SPECS_PARTE_*` (`e2e-cobertura-completa.test.ts`) e em `docs/testing/user-journey-map.md`; evidência em `.superpowers/evidence/` | CA-3, CA-5 | `tests/e2e/modo-espiao.spec.ts` | [ ] |
| T6 | Fragmento em `.changes/` (`capacidade_nova`), `pnpm release:conferir`; mapa vivo se Q aprovar; procurar afirmações de estado sobre "marcar como lida" nos docs de autoridade (DoD 16) | DoD 16, 17 | `pnpm release:conferir` | [ ] |

**Ordem:** T0 → T1 → T2 → T3 → T4 → T5 → T6. T1 e T2 já entregam o PRD para todos os papéis, antes
de qualquer UI. **Sem migration em nenhuma tarefa** (RNF-2); se alguma precisar, parar e alinhar.
