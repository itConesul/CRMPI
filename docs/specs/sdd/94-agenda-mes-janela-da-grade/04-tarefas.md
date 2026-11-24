# 04 — Tarefas

Pela regra original, só começariam depois que o estado do `README.md` fosse `aprovada`. Cada
tarefa tem commit de teste primeiro e de código depois, ambos citando `#94` e os IDs.

**Registro de processo:** a implementação (PR #97) foi mergeada em `develop` **antes** de este PR
(#95) ser aprovado e mergeado, porque a falha do e2e derrubava o CI de várias branches. A
aprovação do Sciuba no #95 veio depois e cobre o desenho que o #97 já implementava. As tarefas
abaixo foram todas executadas no #97.

| # | Tarefa | Cobre | Prova | Feito |
|---|---|---|---|---|
| T0 | Medir os NÃO VERIFICADOS de `02-design.md` §1 (só o mapa vivo; o efeito em `AgendaInterativa` já foi verificado por leitura, ver §1) | RF-1 | `02-design.md` §1 | [x] sem peça nova no mapa |
| T1 | Teste unitário vermelho pelo motivo certo (função ainda ausente) | RF-1, RF-4 | CA-1, CA-2, CA-6 | [x] commit `ebb6a06` |
| T2 | `lib/agenda/janela-da-grade.ts` e uso em `VisaoDeMes` e `_client.tsx`; unitário verde, suíte inteira | RF-1, RF-2, RF-4 | CA-1, CA-2, CA-3, CA-6 | [x] commit `f912d24` |
| T3 | E2e novo pela tela, em célula esmaecida; roda também o e2e existente | RF-3 | CA-4, CA-5 | [x] run `45249310139` |
| T4 | Fragmento em `.changes/`, gates, matriz preenchida, mapa de jornadas, PR de implementação | RNF-2, RF-5 | CA-7, CA-8 | [x] PR #97; mapa de jornadas J15.7 |

Pontos que o #97 fez além do previsto, sem mudar o desenho: registrou `agenda-mes-dias-de-outro-mes.spec.ts`
em `.github/workflows/e2e.yml` (a doutrina reprova spec fora de `SPECS_PARTE_*`) e preencheu a
J15.7 do `docs/testing/user-journey-map.md`.
