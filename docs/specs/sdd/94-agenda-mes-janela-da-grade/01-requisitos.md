# 01 — Requisitos

## Problema
Fonte: issue #94. Na Agenda, a visão Mês desenha 6 semanas fixas, inclusive os dias esmaecidos do
mês anterior e do seguinte, mas só busca os agendamentos do mês corrente. Essas células aparecem
vazias, sem aviso, mesmo com compromisso ou ocupação do Google. O defeito é de produto; apareceu
como falha de e2e (`agenda-ocupacao-do-google-na-grade.spec.ts`) em dias de virada de mês e
derrubou o CI de várias branches. Quem opera a agenda perde de vista compromissos reais.

## Requisitos
| ID | Requisito | Origem na issue |
|---|---|---|
| RF-1 | Na visão Mês, a janela buscada cobre todo dia que a grade desenha: do primeiro dia da grade (`startOfWeek(startOfMonth(âncora))`, domingo) até esse dia + 42 dias | "Solução proposta" 1 |
| RF-2 | O início da grade e o recorte vêm de **uma única função pura** em `lib/agenda/`; `VisaoDeMes` e `recorteDaGrade` a usam, sem cálculo duplicado do início da grade | "Solução proposta" 1; critério 4 |
| RF-3 | Um compromisso (ou ocupação do Google) num dia esmaecido de outro mês aparece na célula desse dia | "Esperado"; "Solução proposta" 3 |
| RF-4 | Semana e Dia mantêm exatamente a janela de hoje | "Solução proposta" 1; critério 5 |
| RF-5 | Sem mudança de banco, API ou contrato: a janela de 42 dias cabe em `MAXIMO_DE_DIAS` | "Solução proposta" 4 |
| RNF-1 | As provas novas não dependem do relógio ("hoje"): datas fixas no unitário; o e2e escolhe a célula pela tela | "Solução proposta" 2 e 3 |
| RNF-2 | Gates verdes (`pnpm typecheck`, `pnpm lint`, `pnpm test:unit` inteiro, sem caminho) e fragmento em `.changes/` | Critério 6 |

## Critérios de aceite
Os da issue, reescritos com ID. A prova de cada um fica em [`03-testes.md`](03-testes.md).

| ID | Critério | Cobre |
|---|---|---|
| CA-1 | Para âncoras de teste (30/11/2026, 1/12/2026, 1/1/2027, fevereiro de 2026, um mês de 5 linhas, um mês de 6 linhas), todo dia desenhado pela visão Mês está dentro do recorte buscado. Vermelho antes do conserto, verde depois | RF-1 |
| CA-2 | O recorte do Mês tem exatamente 42 dias e é menor ou igual a `MAXIMO_DE_DIAS` | RF-1, RF-5 |
| CA-3 | `VisaoDeMes` e `recorteDaGrade` importam a função compartilhada; nenhum deles calcula o início da grade por conta própria | RF-2 |
| CA-4 | E2e pela tela: no Mês, um compromisso numa célula `celula-mes-*` de outro mês aparece nela, independente da data de execução | RF-3, RNF-1 |
| CA-5 | `agenda-ocupacao-do-google-na-grade.spec.ts` passa em dom 22/11 e seg 23/11/2026 (execução real em 23/11, decisão P3) e em qualquer outro dia | RF-3 |
| CA-6 | Semana e Dia devolvem o mesmo recorte que devolviam antes (teste de valor, com datas fixas) | RF-4 |
| CA-7 | O diff da implementação não contém migration, `baseline.sql`, rota de API nem tipo de contrato | RF-5 |
| CA-8 | `pnpm typecheck`, `pnpm lint` e `pnpm test:unit` verdes; `pnpm release:conferir` aceita o fragmento | RNF-2 |

## Fora de escopo
Como a issue declara:
- **Limite de 200 linhas** da listagem (`app/api/v1/agenda/agendamentos/route.ts:179`): risco anterior a este bug, registrado em `02-design.md` §7.
- **Primeira pintura do servidor** (`app/app/agenda/page.tsx`): usa só a semana corrente e não é afetada.
- **Falhas de e2e no celular** (`scrollWidth > clientWidth`, vistas só na branch `feat/identidade-visual-cone-sul`): outra causa, issue própria.
- **Plano de evolução do Google Agenda** (seção "Plano" da issue, em aberto).

Acréscimo da spec: o teste atual `agenda-ocupacao-do-google-na-grade.spec.ts` não é alterado.

## Perguntas em aberto
Nenhuma. P1, P2 e P3 foram decididas em 2026-11-23 e estão em [`05-revisao.md`](05-revisao.md); o texto original fica abaixo como histórico.
- **P1 (decidida: fora).** `components/agenda/PainelDeMarcacao.tsx:187` tem outro `startOfWeek(startOfMonth(mes))`, no mini-calendário do painel. Fica fora desta spec (a issue cita só `VisaoDeMes` e `recorteDaGrade`), ou passa a usar a função compartilhada? Incluí-lo é crescer o escopo. [NÃO ANALISADO por dentro]
- **P2 (decidida: sim, o e2e prova também o mês anterior).** O defeito nos dias do mês **anterior** decorre do mesmo cálculo, mas a issue diz que não foi observado em execução. A spec o trata como coberto por CA-1, e o e2e (CA-4) deve provar também uma célula do mês anterior. Confirma?
- **P3 (decidida: rodar hoje).** CA-5: simular a data no Playwright só mexe no relógio do navegador, e o teste calcula o alvo no Node. Hoje é 23/11/2026, então basta rodar o teste hoje, antes de 24/11. Basta isso, ou exige-se simulação?
