# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Parte | Evidência | Status |
|---|---|---|---|---|---|---|
| CA-1 | Para cada âncora fixa, os 42 dias de `inicioDaGradeDoMes` estão em `[de, ate)` de `recorteDaGrade("mes", âncora)` | unit | `lib/agenda/recorte-da-grade.test.ts::CA-1` | T1, T2 | — | pendente |
| CA-2 | `ate − de` = 42 dias e ≤ `MAXIMO_DE_DIAS` | unit | `lib/agenda/recorte-da-grade.test.ts::CA-2` | T1, T2 | — | pendente |
| CA-3 | `VisaoDeMes` e `_client.tsx` importam a função; varredura reprova `startOfWeek(startOfMonth` nos dois arquivos | unit (varredura) | `tests/unit/agenda-recorte-unico.test.ts::CA-3` | T2 | — | pendente |
| CA-4 | No Mês, célula `celula-mes-*` de outro mês (anterior e seguinte) mostra o `chip-mes-*` do compromisso | e2e (pela tela) | `tests/e2e/agenda-mes-dias-de-outro-mes.spec.ts::CA-4` | T3 | — | pendente |
| CA-5 | O e2e existente passa em 22 e 23/11/2026 e em outro dia | e2e | `pnpm exec playwright test tests/e2e/agenda-ocupacao-do-google-na-grade.spec.ts` | T3 | — | pendente |
| CA-6 | Semana e Dia devolvem os valores de antes, com datas fixas | unit | `lib/agenda/recorte-da-grade.test.ts::CA-6` | T1, T2 | — | pendente |
| CA-7 | O diff não toca `supabase/`, `app/api/` nem tipos de contrato | medição | `git diff --name-only origin/develop...HEAD` | T4 | — | pendente |
| CA-8 | Gates verdes e fragmento aceito | gate | `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm release:conferir` | T4 | — | pendente |

Tipos: `unit` (`pnpm test:unit`, sem caminho) · `e2e` (Playwright, pela tela) · `medição` (comando).
Os nomes de arquivo são propostos; a implementação os ajusta e atualiza esta tabela.

## Prova pela tela
O CA-4 dirige o frontend em ambiente fresco estilo VPS (`docs/testing/user-journey-map.md`), com os
envs opcionais ausentes. Evidência em `.superpowers/evidence/`. A cobertura nova entra no mapa de
jornadas na T4.

## Gates antes do PR
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test:unit` (suíte inteira, rodapé conferido contra `grep FAIL`)
- [ ] `pnpm release:conferir` (fragmento em `.changes/`)
- `pnpm test:db`: não se aplica (sem schema).
