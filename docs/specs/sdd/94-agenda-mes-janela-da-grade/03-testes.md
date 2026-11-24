# 03 — Testes e provas

## Matriz de aceite
Estado medido em 2026-11-24, depois da implementação (PR #97, `4223785`).

| Critério | Prova | Tipo | Arquivo / comando | Parte | Evidência | Status |
|---|---|---|---|---|---|---|
| CA-1 | Para cada âncora fixa (22/11, 23/11, 29/11, 30/11 e 1/12/2026, 1/1/2027, fev/2026, mês de 5 e de 6 linhas), os 42 dias de `inicioDaGradeDoMes` estão em `[de, ate)` de `janelaDaGrade("mes", âncora)`; para 29/11 e 30/11, 2/12/2026 está na janela | unit | `lib/agenda/janela-da-grade.test.ts::CA-1` | T1, T2 | PR #97; vermelho com a fórmula antiga (14 de 17 casos, relato do #97); `verify` verde no CI | **cumprido** |
| CA-2 | `differenceInCalendarDays(ate, de)` = 42 e ≤ `MAXIMO_DE_DIAS`; âncora com mudança de horário de verão (1/3/2026 em `America/New_York`), fuso fixado no teste | unit | `lib/agenda/janela-da-grade.test.ts::CA-2` | T1, T2 | PR #97, mesmo arquivo | **cumprido** |
| CA-3 | `VisaoDeMes` e `_client.tsx` importam a função; varredura reprova `startOfWeek(startOfMonth` nos dois arquivos, e o teste declara que o `PainelDeMarcacao` é exceção deliberada (P1) | unit (varredura) | `tests/unit/agenda-recorte-unico.test.ts::CA-3` | T2 | PR #97; `verify` verde | **cumprido** |
| CA-4 | No Mês, célula `celula-mes-*` do mês seguinte e do anterior mostra o `chip-mes-*`. Para o anterior, avança até 12 meses até a grade ter dia esmaecido do mês anterior; sem nenhum, falha com mensagem clara | e2e (pela tela) | `tests/e2e/agenda-mes-dias-de-outro-mes.spec.ts::CA-4` | T3 | run [45249310139](https://github.com/itConesul/CRMPI/actions/runs/45249310139), `e2e-parte (3)` verde, 2026-11-23 | **cumprido** |
| CA-5 | O e2e existente, sem alteração, passa como regressão; a data da execução fica registrada (o cenário de 22/23 é do CA-1) | e2e | `pnpm exec playwright test tests/e2e/agenda-ocupacao-do-google-na-grade.spec.ts` | T3 | mesmo run: `:218` passa (2,6 s). Reconfirmado no #95: run [45257353378](https://github.com/itConesul/CRMPI/actions/runs/45257353378) (3,1 s). Data: 2026-11-23 | **cumprido** |
| CA-6 | Semana e Dia devolvem os valores de antes, com datas fixas | unit | `lib/agenda/janela-da-grade.test.ts::CA-6` | T1, T2 | PR #97; são os 3 casos que passam também com a fórmula antiga (relato do #97) | **cumprido** |
| CA-7 | O diff não toca `supabase/`, `app/api/` nem tipos de contrato | medição | `git diff --name-only 4223785^1 4223785 \| grep -E '^(supabase/\|app/api/\|lib/database.types)'` | T4 | medido em 2026-11-24: vazio. O diff tem 9 arquivos, entre eles `.github/workflows/e2e.yml` (registro da spec nova em `SPECS_PARTE_*`) | **cumprido** |
| CA-8 | Gates verdes e fragmento aceito | gate | `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm release:conferir` | T4 | `verify` verde no CI do #97; fragmento `.changes/fix-agenda-mes-busca-a-janela-que-desenha.md` (`nada_mudou`); `release:conferir` aceito segundo o #97 | **cumprido** |

Tipos: `unit` (`pnpm test:unit`, sem caminho) · `e2e` (Playwright, pela tela) · `medição` (comando).
Os nomes de arquivo eram propostos; os da tabela são os que o PR #97 criou (existem em `f6de4a9`).

**Limite desta tabela:** a coluna Evidência vem do CI e do relato do #97. Os testes não foram
reexecutados ao atualizar a spec. Para conferir agora: `pnpm test:unit` (sem caminho) e o `gh run
view` dos runs acima.

## Prova pela tela
O CA-4 dirige o frontend em ambiente fresco estilo VPS (`docs/testing/user-journey-map.md`), com os
envs opcionais ausentes. Evidência: os runs do CI acima. A cobertura entrou no mapa de jornadas
como **J15.7** (`PASS`).

## Gates antes do PR (PR #97)
- [x] `pnpm typecheck` limpo
- [x] `pnpm lint` sem erros novos (3 avisos que já existiam na `develop`)
- [x] `pnpm test:unit` (suíte inteira): 5 arquivos vermelhos **só na máquina local**, os mesmos de antes da mudança; todos verdes no `verify` do CI
- [x] `pnpm release:conferir` (fragmento em `.changes/`)
- `pnpm test:db`: não se aplica (sem schema).
