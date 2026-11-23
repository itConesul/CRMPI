# 04 — Tarefas

Só começam depois que o estado do `README.md` for `aprovada`. Cada tarefa tem commit de teste
primeiro e de código depois, ambos citando `#94` e os IDs.

| # | Tarefa | Cobre | Prova | Feito |
|---|---|---|---|---|
| T0 | Medir os NÃO VERIFICADOS de `02-design.md` §1 (efeito do recorte maior em `AgendaInterativa`; mapa vivo); P1, P2 e P3 já decididas | RF-1 | — | [ ] |
| T1 | Teste unitário vermelho pelo motivo certo (função ainda ausente) | RF-1, RF-4 | CA-1, CA-2, CA-6 | [ ] |
| T2 | `lib/agenda/recorte-da-grade.ts` e uso em `VisaoDeMes` e `_client.tsx`; unitário verde, suíte inteira | RF-1, RF-2, RF-4 | CA-1, CA-2, CA-3, CA-6 | [ ] |
| T3 | E2e novo pela tela, em célula esmaecida; roda também o e2e existente | RF-3 | CA-4, CA-5 | [ ] |
| T4 | Fragmento em `.changes/`, gates, matriz preenchida, mapa de jornadas, PR de implementação | RNF-2, RF-5 | CA-7, CA-8 | [ ] |

Aprovações previstas: rodar o e2e (sobe Supabase local, passa de 2 min) e abrir o PR de
implementação.
