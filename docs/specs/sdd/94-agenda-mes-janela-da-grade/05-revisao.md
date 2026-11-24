# 05 — Revisão e aprovação

## Decisões
| Data | Pergunta / mudança | Decisão | Quem |
|---|---|---|---|
| 2026-11-23 | P1: o mini-calendário do `PainelDeMarcacao` entra? | **Fora.** Os dias de outro mês ali são desabilitados de propósito e a janela dele vem de `useHorariosLivres`, não do `recorteDaGrade` de `_client.tsx` | dono do produto |
| 2026-11-23 | P2: o defeito do mês anterior é coberto? | **Sim.** O CA-4 prova uma célula do mês anterior e uma do seguinte | dono do produto |
| 2026-11-23 | P3: como provar o CA-5? | ~~Rodar hoje~~ (não executável, review ponto 1). **Decidido:** âncoras 22/11, 23/11 e 29/11/2026 no CA-1; e2e existente como regressão, na data da execução registrada, sem dia exigido. Registro: [comentário na #94](https://github.com/itConesul/CRMPI/issues/94) | dono do produto |
| 2026-11-23 | P4: limite de 200 linhas | **Fora desta spec.** Risco de corte da cauda do mês seguinte em agenda cheia **aceito**; issue própria **#96** para tratar o corte (aviso na tela ou paginação) | dono do produto |

## Comentários de review
| Data | Revisor | Comentário | Resolução |
|---|---|---|---|
| 2026-11-23 | Sciuba | 1. CA-5/P3 não executável | Aplicado conforme a decisão do dono: âncoras 22/11, 23/11 e 29/11/2026 no CA-1, mais 30/11 (o "hoje + 7" de 23/11, só amplia a cobertura); e2e existente como regressão, data registrada, sem dia exigido. CA-5, P3 e este arquivo reescritos |
| 2026-11-23 | Sciuba | 2. Colisão de nome `recorteDaGrade` em `_client.tsx` | Aplicado: função renomeada `janelaDaGrade`, arquivo `lib/agenda/janela-da-grade.ts`. Ajustados RF-2, §2, §3, CA-3 e `03-testes.md`. Conferido: o `const recorteDaGrade` existe em `_client.tsx:204` |
| 2026-11-23 | Sciuba | 3. CA-4 sem garantia de célula do mês anterior | Aplicado: método no CA-4 (avançar até 12 meses; falhar com mensagem clara). Conferido: 1/11/2026 é domingo, a grade de novembro não tem dia do mês anterior |
| 2026-11-23 | Sciuba | 4. Limite de 200: decisão explícita | Aplicado conforme a decisão do dono: fora de escopo, risco de corte da cauda **aceito**, issue própria **#96**. §7 e `01-requisitos.md` ajustados. Conferido: ordena por `starts_at` crescente (`lib/agenda/consulta.ts:491-492`) |
| 2026-11-23 | Sciuba | CA-2: dias de calendário, não milissegundos | Aplicado: `differenceInCalendarDays`, âncora com horário de verão, fuso fixado |
| 2026-11-23 | Sciuba | T0: efeito em horários livres responde-se por leitura | Aplicado: movido para `02-design.md` §1 como verificado (`route.ts:86`, `horarios-livres.ts:296`); T0 ficou só com o mapa vivo |
| 2026-11-23 | Sciuba | CA-3: o teste diz que o `PainelDeMarcacao` é exceção (P1) | Aplicado no CA-3 |

## Evidência do CI (PR #95, tentativa 1 e rerun)
Run [45225358189](https://github.com/itConesul/CRMPI/actions/runs/45225358189), medido em 2026-11-23.

| Job | Tentativa 1 | Rerun (tentativa 2) |
|---|---|---|
| `verify`, `invariants`, `build-and-size`, `imagens-ok` | passam | — |
| `e2e-parte (1)` | passou | passou |
| `e2e-parte (3)` | **falhou**: `supabase start` sem baixar imagens (`Rate exceeded` no `public.ecr.aws`); nenhum teste rodou | **passou** |
| `e2e-parte (2)` | **falhou**: `agenda-ocupacao-do-google-na-grade.spec.ts:218` (`chip-mes-*` não encontrado em 20 s); 94 passaram, 6 puladas | **falhou** no mesmo teste |

A parte 3 era infraestrutura e se recuperou no rerun. A parte 2 é o defeito da #94, previsto na
tabela da issue para seg 23/11. O PR só altera `docs/`. Logs brutos guardados fora do repositório.

## Aprovação
- [x] **Aprovada por:** Sciuba (review APPROVED no PR #95) em 2026-11-23 — implementação liberada. A implementação já entrou pelo PR #97 (ver a evidência abaixo)

## Evidência do e2e depois da correção (registro pedido no review de 2026-11-23)
O `e2e-parte (2)` vermelho era o defeito que esta spec descreve. Com a implementação no PR #97 (mergeado em `develop`, `4223785`), o teste passa:

| Onde | Run | Resultado |
|---|---|---|
| PR #97, `f4437c9` | [45249310139](https://github.com/itConesul/CRMPI/actions/runs/45249310139) | `agenda-ocupacao-do-google-na-grade.spec.ts:218` passa (2,6 s). O e2e novo `agenda-mes-dias-de-outro-mes.spec.ts` (CA-4) passa na parte 3. Partes 1, 2 e 3 verdes |
| PR #95, `9401cc0` (com a `develop` atualizada) | [45257353378](https://github.com/itConesul/CRMPI/actions/runs/45257353378) | linha 218 passa (3,1 s); parte 2 com 95 passed e 6 skipped; `e2e` verde |

Data da execução (CA-5, regressão sem dia exigido): 2026-11-23. O cenário de 22 e 23 de novembro é provado pelo CA-1 (unitário, âncoras fixas).

## Fechamento da spec (2026-11-24)
Com a implementação já na `develop` (#97), a spec foi posta em dia, sem mudar nenhum requisito, critério ou decisão:
- `README.md`: estado `concluida`; `Medido em` ganhou a reconferência em `f6de4a9`; #96 listada como pendência externa.
- `02-design.md`: §1 virou "o que existia antes" (diagnóstico preservado), com nota das referências atuais; T0 medido (sem entrada nova no mapa vivo).
- `03-testes.md`: CA-1 a CA-8 com evidência e `cumprido`; CA-7 medido de novo sobre o diff do #97; gates registrados.
- `04-tarefas.md`: T0 a T4 marcadas, com o registro de que o #97 entrou antes da aprovação do #95.

O que **não** foi reexecutado nesta atualização: os testes e o e2e. O estado deles vem do CI do #97 e do relato do próprio PR.

## Correção depois da aprovação (review do Sciuba, 2026-11-23)
O CA-4 dizia "sempre há ao menos 11 células" do mês seguinte, o que está errado: um mês de 31 dias que começa no sábado deixa 5 (6 + 31 = 37 de 42). Corrigido para "ao menos 5" (intervalo medido: 5 a 14, para meses de 28 a 31 dias). A prova do CA-4 não muda.
