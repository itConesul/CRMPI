# 05 — Revisão e aprovação

## Decisões
| Data | Pergunta / mudança | Decisão | Quem |
|---|---|---|---|
| 2026-11-23 | P1: o mini-calendário do `PainelDeMarcacao` entra? | **Fora.** Os dias de outro mês ali são desabilitados de propósito e a janela dele vem de `useHorariosLivres`, não do `recorteDaGrade` de `_client.tsx` | dono do produto |
| 2026-11-23 | P2: o defeito do mês anterior é coberto? | **Sim.** O CA-4 prova uma célula do mês anterior e uma do seguinte | dono do produto |
| 2026-11-23 | P3: como provar o CA-5? | ~~Rodar hoje~~ (não executável, review ponto 1). **Decidido:** âncoras 22/11, 23/11 e 29/11/2026 no CA-1; e2e existente como regressão, na data da execução registrada, sem dia exigido. Registro: [comentário na #94](https://github.com/itConesul/CRMPI/issues/94) | dono do produto |
| 2026-11-23 | P4: limite de 200 linhas | **Fora desta spec.** Risco de corte da cauda do mês seguinte em agenda cheia **aceito**; issue própria para tratar o corte (aviso na tela ou paginação), número a registrar quando existir | dono do produto |

## Comentários de review
| Data | Revisor | Comentário | Resolução |
|---|---|---|---|
| 2026-11-23 | Sciuba | 1. CA-5/P3 não executável | Aplicado conforme a decisão do dono: âncoras 22/11, 23/11 e 29/11/2026 no CA-1, mais 30/11 (o "hoje + 7" de 23/11, só amplia a cobertura); e2e existente como regressão, data registrada, sem dia exigido. CA-5, P3 e este arquivo reescritos |
| 2026-11-23 | Sciuba | 2. Colisão de nome `recorteDaGrade` em `_client.tsx` | Aplicado: função renomeada `janelaDaGrade`, arquivo `lib/agenda/janela-da-grade.ts`. Ajustados RF-2, §2, §3, CA-3 e `03-testes.md`. Conferido: o `const recorteDaGrade` existe em `_client.tsx:204` |
| 2026-11-23 | Sciuba | 3. CA-4 sem garantia de célula do mês anterior | Aplicado: método no CA-4 (avançar até 12 meses; falhar com mensagem clara). Conferido: 1/11/2026 é domingo, a grade de novembro não tem dia do mês anterior |
| 2026-11-23 | Sciuba | 4. Limite de 200: decisão explícita | Aplicado conforme a decisão do dono: fora de escopo, risco de corte da cauda **aceito**, issue própria (número a registrar quando existir). §7 e `01-requisitos.md` ajustados. Conferido: ordena por `starts_at` crescente (`lib/agenda/consulta.ts:491-492`) |
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
- [ ] **Aprovada por:** <nome> em <AAAA-MM-DD> — implementação liberada
