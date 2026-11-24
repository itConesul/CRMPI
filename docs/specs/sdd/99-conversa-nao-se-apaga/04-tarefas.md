# 04 — Tarefas

Pequenas, na ordem em que serão implementadas; cada uma deixa o repo verde. Só começa depois que o estado
do `README.md` for `aprovada`.

| # | Tarefa | Cobre | Prova | Feito |
|---|---|---|---|---|
| T0a | **Provar no banco** o `viewer` e a sessão de suporte (item 2 da medição) | RF-2 | `02-design.md` §1.2 | [x] |
| T0b | **Medir** como `requireRole("manager")` trata `platform admin` e sessão de suporte, e escolher o predicado único de rota e UI. Resultado em `02-design.md` §1.3: predicado da tela = **só** `ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager`, sem `is_platform_admin` | RF-5, RF-6 | `02-design.md` §1.3 | [x] |
| T1 | Escrever o invariante **vermelho** (sem a migration) e provar a sabotagem | RF-1, RF-2 | CA-1, CA-2 | [ ] |
| T2 | Migration `0239` + apêndice no `baseline.sql` + linha no `MANIFEST`. Invariante verde; `test:db` completo | RF-1, RF-2, RNF-1 | CA-1, CA-2, CA-8, CA-9 | [ ] |
| T3 | `deleteContactHandler`: sai o `delete` de `messages` e `conversations`; `23503` vira 409 com a mensagem do administrador. Teste vermelho antes | RF-3, RF-4 | CA-3, CA-4 | [ ] |
| T4 | Rota: `requireRole("manager")`; teste de 403 para `agent`/`viewer` e 204 para `manager` | RF-5 | CA-5 | [ ] |
| T5 | `ContactsTable`: botão só para `manager`+ (predicado da T0b); texto do diálogo; chaves `es` | RF-6, RF-7 | CA-6, CA-7 | [ ] |
| T6 | E2E **pela tela** em ambiente fresco; registrar em `SPECS_PARTE_*` (`e2e-cobertura-completa.test.ts`) e em `docs/testing/user-journey-map.md`; evidência em `.superpowers/evidence/` | CA-6 | `tests/e2e/contato-excluir-so-manager.spec.ts` | [ ] |
| T7 | Fragmento em `.changes/`. **Proposta: `exige_acao`** (a régua trata "algo que existia mudou de forma" como `exige_acao`), com "Requer atenção" avisando a equipe. **O revisor confirma ou rebaixa a classificação**. DoD 16: procurar afirmações sobre "excluir contato apaga a conversa" nos docs de autoridade | DoD 16, 17 | `pnpm release:conferir` | [ ] |
| T8 | Abrir as **duas issues de seguimento**: exclusão lógica (D) e RPC do contador / `UPDATE` direto de `conversations` (C). Linkar em `05-revisao.md` e na #99 | fora de escopo | links | [ ] |

**Ordem:** T0b → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. T1 e T2 já fecham o buraco do banco, antes de
qualquer mudança de produto.

Um **protótipo local, não publicado**, de T1, T2 e T3 foi usado só para medir e provar a sabotagem. Ele
não substitui o ciclo desta spec: o PR de código nasce depois da aprovação e segue a ordem acima.
