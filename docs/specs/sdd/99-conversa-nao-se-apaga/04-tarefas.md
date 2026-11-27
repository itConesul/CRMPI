# 04 — Tarefas

Pequenas, na ordem em que serão implementadas; cada uma deixa o repo verde. Só começa depois que o estado
do `README.md` for `aprovada`.

| # | Tarefa | Cobre | Prova | Feito |
|---|---|---|---|---|
| T0a | **Provar no banco** o `viewer` e a sessão de suporte (item 2 da medição) | RF-2 | `02-design.md` §1.2 | [x] |
| T0b | **Medir** como `requireRole("manager")` trata `platform admin` e sessão de suporte, e escolher o predicado único de rota e UI. Resultado em `02-design.md` §1.3: predicado da tela = **só** `ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager`, sem `is_platform_admin` | RF-5, RF-6 | `02-design.md` §1.3 | [x] |
| T0c | **Enumerar** quem escreve em `messages` com o cliente do usuário e provar o fluxo de envio antes e depois, inclusive sessão de suporte `full`. Resultado em `02-design.md` §1.4. Só a importação de histórico do aparelho ficou **NÃO VERIFICADA** quanto ao cliente (é handler de worker) | RF-2b | `02-design.md` §1.4 | [x] |
| T1 | Escrever o invariante **vermelho** (sem a migration) e provar a sabotagem. **Inclui** os passos do fluxo de envio (CA-10) e o caso do contato só com compromisso (CA-3b) | RF-1, RF-2, RF-2b, RF-4b | CA-1, CA-2, CA-3b, CA-10 | [x] |
| T2 | Migration `0240` (era `0239`; ver `05-revisao.md`) + apêndice no `baseline.sql` + linha no `MANIFEST`. Invariante verde; `test:db` completo | RF-1, RF-2, RNF-1 | CA-1, CA-2, CA-8, CA-9 | [x] |
| T3 | `deleteContactHandler`: sai o `delete` de `messages` e `conversations`; `23503` vira 409 com o **texto único** (conversas **ou compromissos**) mandando pedir a um administrador. Teste vermelho antes, com o caso do compromisso. Corrigir o **comentário** do baseline que diz "as duas únicas FKs RESTRICT" (só texto; revisor decide se entra) | RF-3, RF-4, RF-4b | CA-3, CA-3b, CA-4 | [x] |
| T4 | Rota: `requireRole("manager")`; teste de 403 para `agent`/`viewer` e 204 para `manager` | RF-5 | CA-5 | [x] |
| T5 | `ContactsTable`: botão só para `manager`+ (predicado da T0b); texto do diálogo; chaves `es` | RF-6, RF-7 | CA-6, CA-7 | [x] |
| T6 | E2E **pela tela** em ambiente fresco; registrar em `SPECS_PARTE_*` (`e2e-cobertura-completa.test.ts`) e em `docs/testing/user-journey-map.md`; evidência em `.superpowers/evidence/` | CA-6 | `tests/e2e/contato-excluir-so-manager.spec.ts` | [x] |
| T7 | Fragmento em `.changes/` com **`impacto: exige_acao`** (**decidido pelo dono**: release **major**: a versão seguinte é `2.0.0` a partir de qualquer `1.x`; para a versão em vigor, rode `gh release list --limit 1`), com "Requer atenção" avisando que `agent` e `viewer` perdem o botão e que apagar contato com conversa ou compromisso passa a ser recusado. `secao: alterado`. DoD 16: procurar afirmações sobre "excluir contato apaga a conversa" nos docs de autoridade | DoD 16, 17 | `pnpm release:conferir` | [x] |
| T8 | Abrir as **duas issues de seguimento**: exclusão lógica (D) e RPC do contador / `UPDATE` direto de `conversations` (C). Linkar em `05-revisao.md` e na #99. **Feita em 2026-11-24:** a **D é a [#116](https://github.com/itConesul/CRMPI/issues/116)** (cita "Ref. #99", então o vínculo aparece na própria #99). A **C / `UPDATE` direto não ganhou issue nova**: é a **própria #99**, que o Sciuba retitulou (P3) para dizer que o `UPDATE` direto segue aberto | fora de escopo | [#116](https://github.com/itConesul/CRMPI/issues/116) e #99 | [x] |

**Implementada e mergeada em 2026-11-27:** [#140](https://github.com/itConesul/CRMPI/pull/140) (merge `81c516c`), um commit por tarefa (T1 `7dcbae0`, T2 `00b3aa8`, T3 `7d9df4d`, T4 `c5ec3a3`, T5 `f0edf06`, T6 `668640c`, T7 `a8cc41f`). As caixas acima só foram marcadas depois do merge, em PR próprio. Os desvios D-1 a D-10 estão em `05-revisao.md`; o D-10 (a policy de `contacts` também no banco) veio do review do Sciuba e **ampliou a T2** depois de a tarefa já estar feita.

**Referência à issue:** o PR de código e os commits citam **"Ref. #99"**, **nunca** "Closes"/"Fixes": a
#99 fica aberta, porque o `UPDATE` direto em `conversations` segue aberto (decisão P3).

**Ordem:** T0b e T0c (feitas) → T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8. T1 e T2 já fecham o buraco do banco, antes de
qualquer mudança de produto.

Um **protótipo local, não publicado**, de T1, T2 e T3 foi usado só para medir e provar a sabotagem. Ele
não substitui o ciclo desta spec: o PR de código nasce depois da aprovação e segue a ordem acima.
