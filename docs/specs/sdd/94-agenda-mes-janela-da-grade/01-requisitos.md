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
| RF-2 | O início da grade e o recorte vêm de **uma única função pura** em `lib/agenda/`; `VisaoDeMes` e o `useMemo` `recorteDaGrade` de `_client.tsx` a usam, sem cálculo duplicado do início da grade. A função se chama `janelaDaGrade`, para não colidir com o `const recorteDaGrade` que já existe em `_client.tsx` | "Solução proposta" 1; critério 4; review do Sciuba (ponto 2) |
| RF-3 | Um compromisso (ou ocupação do Google) num dia esmaecido de outro mês aparece na célula desse dia | "Esperado"; "Solução proposta" 3 |
| RF-4 | Semana e Dia mantêm exatamente a janela de hoje | "Solução proposta" 1; critério 5 |
| RF-5 | Sem mudança de banco, API ou contrato: a janela de 42 dias cabe em `MAXIMO_DE_DIAS` | "Solução proposta" 4 |
| RNF-1 | As provas novas não dependem do relógio ("hoje"): datas fixas no unitário; o e2e escolhe a célula pela tela | "Solução proposta" 2 e 3 |
| RNF-2 | Gates verdes (`pnpm typecheck`, `pnpm lint`, `pnpm test:unit` inteiro, sem caminho) e fragmento em `.changes/` | Critério 6 |

## Critérios de aceite
Os da issue, reescritos com ID. A prova de cada um fica em [`03-testes.md`](03-testes.md).

| ID | Critério | Cobre |
|---|---|---|
| CA-1 | Para âncoras de teste, todo dia desenhado pela visão Mês está dentro da janela buscada. Âncoras (decisão do dono, 2026-11-23): **22/11, 23/11 e 29/11/2026**, mais **30/11/2026** (o "hoje + 7" de seg 23/11, a âncora real da falha de hoje; o acréscimo só amplia a cobertura). Para 29/11 e 30/11, afirma-se explicitamente que **2/12/2026 está na janela**. Mais 1/12/2026, 1/1/2027, fevereiro de 2026, um mês de 5 linhas e um mês de 6 linhas. Vermelho antes do conserto, verde depois | RF-1 |
| CA-2 | A janela do Mês tem 42 dias **de calendário** (`differenceInCalendarDays`, nunca milissegundos) e é menor ou igual a `MAXIMO_DE_DIAS`. Inclui uma âncora cuja janela atravessa mudança de horário de verão, com o fuso do teste fixado | RF-1, RF-5 |
| CA-3 | `VisaoDeMes` e `_client.tsx` importam a função compartilhada; nenhum dos dois calcula o início da grade por conta própria. O `PainelDeMarcacao` é exceção deliberada (P1) e o teste diz isso | RF-2 |
| CA-4 | E2e pela tela: no Mês, um compromisso numa célula `celula-mes-*` de outro mês aparece nela. **Método:** a prova cobre o mês seguinte (sempre há ao menos 11 células dele) e o mês anterior; para este, o teste avança mês a mês (no máximo 12) até a primeira linha da grade ter dias do mês anterior, e **falha com mensagem clara** se nenhuma tiver célula esmaecida. Não depende da data de execução | RF-3, RNF-1 |
| CA-5 | `agenda-ocupacao-do-google-na-grade.spec.ts` é mantido como **regressão**, sem alteração, e a **data de execução fica registrada** na evidência, **sem exigir dia específico**. O cenário de 22/23 de novembro é provado pelo CA-1, não pelo relógio | RF-3 |
| CA-6 | Semana e Dia devolvem o mesmo recorte que devolviam antes (teste de valor, com datas fixas) | RF-4 |
| CA-7 | O diff da implementação não contém migration, `baseline.sql`, rota de API nem tipo de contrato | RF-5 |
| CA-8 | `pnpm typecheck`, `pnpm lint` e `pnpm test:unit` verdes; `pnpm release:conferir` aceita o fragmento | RNF-2 |

## Fora de escopo
Como a issue declara:
- **Limite de 200 linhas** da listagem (`app/api/v1/agenda/agendamentos/route.ts:179`): risco anterior a este bug, registrado em `02-design.md` §7. A listagem ordena por `starts_at` crescente (`lib/agenda/consulta.ts:491-492`), então o corte tira a **cauda** da janela, justamente os dias do mês seguinte que esta spec passa a buscar. **O dono aceitou esse risco (P4)**: segue fora desta spec e não a segura. Há issue própria para tratar o corte, com aviso na tela ou paginação (número a registrar quando a issue existir).
- **Primeira pintura do servidor** (`app/app/agenda/page.tsx`): usa só a semana corrente e não é afetada.
- **Falhas de e2e no celular** (`scrollWidth > clientWidth`, vistas só na branch `feat/identidade-visual-cone-sul`): outra causa, issue própria.
- **Plano de evolução do Google Agenda** (seção "Plano" da issue, em aberto).

Acréscimo da spec: o teste atual `agenda-ocupacao-do-google-na-grade.spec.ts` não é alterado.

## Perguntas em aberto
Nenhuma. P1 a P4 decididas em 2026-11-23 ([`05-revisao.md`](05-revisao.md); P3 e P4 após o review do Sciuba). O texto original fica abaixo como histórico.
- **P1 (decidida: fora).** `components/agenda/PainelDeMarcacao.tsx:187` tem outro `startOfWeek(startOfMonth(mes))`, no mini-calendário do painel. Fica fora desta spec (a issue cita só `VisaoDeMes` e `recorteDaGrade`), ou passa a usar a função compartilhada? Incluí-lo é crescer o escopo. [NÃO ANALISADO por dentro]
- **P2 (decidida: sim, o e2e prova também o mês anterior).** O defeito nos dias do mês **anterior** decorre do mesmo cálculo, mas a issue diz que não foi observado em execução. A spec o trata como coberto por CA-1, e o e2e (CA-4) deve provar também uma célula do mês anterior. Confirma?
- **P3 (decidida, revisada).** A decisão inicial ("rodar hoje") não era executável: o 23/11 só serve se o código corrigido já existir hoje. **Decisão do dono (23/11):** prova por âncoras fixas no CA-1 e o e2e existente como regressão, na data da execução registrada, sem dia exigido.
- **P4 (decidida).** Limite de 200 linhas: **fora desta spec**; o dono aceitou o risco de corte da cauda do mês seguinte em agenda cheia, e uma issue própria trata do corte (aviso na tela ou paginação).
