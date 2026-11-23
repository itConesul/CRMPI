# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Parte | Evidência | Status |
|---|---|---|---|---|---|---|
| CA-1 | Para cada âncora fixa (22/11, 23/11, 29/11, 30/11 e 1/12/2026, 1/1/2027, fev/2026, mês de 5 e de 6 linhas), os 42 dias de `inicioDaGradeDoMes` estão em `[de, ate)` de `janelaDaGrade("mes", âncora)`; para 29/11 e 30/11, 2/12/2026 está na janela | unit | `lib/agenda/janela-da-grade.test.ts::CA-1` | T1, T2 | — | pendente |
| CA-2 | `differenceInCalendarDays(ate, de)` = 42 e ≤ `MAXIMO_DE_DIAS`; âncora com mudança de horário de verão (ex.: 1/3/2026 em `America/New_York`), fuso fixado no teste. [NÃO VERIFICADO] se o vitest respeita `TZ` definido em runtime; a T1 mede | unit | `lib/agenda/janela-da-grade.test.ts::CA-2` | T1, T2 | — | pendente |
| CA-3 | `VisaoDeMes` e `_client.tsx` importam a função; varredura reprova `startOfWeek(startOfMonth` nos dois arquivos, e o teste declara que o `PainelDeMarcacao` é exceção deliberada (P1) | unit (varredura) | `tests/unit/agenda-recorte-unico.test.ts::CA-3` | T2 | — | pendente |
| CA-4 | No Mês, célula `celula-mes-*` do mês seguinte e do anterior mostra o `chip-mes-*`. Para o anterior, avança até 12 meses até a grade ter dia esmaecido do mês anterior; sem nenhum, falha com mensagem clara | e2e (pela tela) | `tests/e2e/agenda-mes-dias-de-outro-mes.spec.ts::CA-4` | T3 | — | pendente |
| CA-5 | O e2e existente, sem alteração, passa como regressão; a data da execução fica registrada na evidência (o cenário de 22/23 é do CA-1) | e2e | `pnpm exec playwright test tests/e2e/agenda-ocupacao-do-google-na-grade.spec.ts` | T3 | — | pendente |
| CA-6 | Semana e Dia devolvem os valores de antes, com datas fixas | unit | `lib/agenda/janela-da-grade.test.ts::CA-6` | T1, T2 | — | pendente |
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
