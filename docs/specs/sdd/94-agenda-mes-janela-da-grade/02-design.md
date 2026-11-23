# 02 — Design

**Verificado em:** `365a670` · **Comando:** `git rev-parse --short HEAD`

## 1. O que existe hoje (verificado)
| Peça | Onde | Observação |
|---|---|---|
| Desenha a grade do Mês | `components/agenda/GradeDaAgenda.tsx:639` (`VisaoDeMes`) | `startOfWeek(startOfMonth(ancora), { weekStartsOn: 0 })` e 6 semanas × 7 dias |
| Busca os agendamentos | `app/app/agenda/_client.tsx:204-214` (`recorteDaGrade`) | Mês: `startOfMonth(ancora)` até `addDays(endOfMonth(ancora), 1)`. Semana: `startOfWeek` + 7. Dia: `startOfDay` + 1 |
| Quem consome o recorte | `_client.tsx:234` (`useAgendamentos`) e `:819` (prop `recorte` de `AgendaInterativa`, usada em `AgendaInterativa.tsx:100` na consulta de horários livres) | O mesmo valor serve às duas. **Muda para o Mês** |
| Teto da API | `lib/agenda/consulta.ts:50` | `MAXIMO_DE_DIAS = 62`; 42 cabe |
| Segundo cálculo de início de grade | `components/agenda/PainelDeMarcacao.tsx:187` | Mini-calendário do painel; ver P1 |
| Teste que expôs o defeito | `tests/e2e/agenda-ocupacao-do-google-na-grade.spec.ts:218` | Depende de "hoje + 7 dias" |

Reproduza as medições: `grep -rn "startOfWeek(startOfMonth" app components lib` e
`grep -n "MAXIMO_DE_DIAS" lib/agenda/consulta.ts`.

**NÃO VERIFICADO:** o comportamento em navegador (a causa vem de leitura de código e da simulação
de datas da issue); o defeito no mês anterior (P2: o CA-4 prova); se o mapa vivo
(`docs/architecture/`) lista `lib/agenda/*` (a T0 confere).

**Efeito do recorte maior em horários livres (verificado por leitura, review do Sciuba):** a rota
aceita até 62 dias (`app/api/v1/agenda/horarios-livres/route.ts:86`, `MAXIMO_DE_DIAS`) e
`horariosLivres` já descarta o que vem antes de `agora + avisoMinimo`
(`lib/agenda/horarios-livres.ts:296`). 42 dias não gera 422; o custo é calcular slots a mais.

**Limite de 200 linhas:** a listagem ordena por `starts_at` crescente com `limit`
(`lib/agenda/consulta.ts:491-492`), então o corte remove a cauda da janela, os dias do mês seguinte.
Risco aceito pelo dono (P4, `05-revisao.md`); a issue própria #96 trata o corte.

## 2. Decisão de design
Extrair para `lib/agenda/janela-da-grade.ts` funções puras, sem I/O e sem relógio (a âncora é
argumento):
1. `inicioDaGradeDoMes(ancora)` → `startOfWeek(startOfMonth(ancora), { weekStartsOn: 0 })`.
2. `janelaDaGrade(visao, ancora)` → `{ de, ate }` em ISO. Mês: `de = inicioDaGradeDoMes(ancora)`, `ate = de + 42 dias`. Semana e Dia: as fórmulas atuais, sem alteração.

`VisaoDeMes` passa a obter `primeiro` de `inicioDaGradeDoMes`, e `_client.tsx` troca o corpo do
`useMemo` por `janelaDaGrade(visao, ancora)`. O número 42 vem de uma constante exportada
(`DIAS_DA_GRADE_DO_MES`) que `VisaoDeMes` também usa para gerar as 6 semanas, para que desenho e
busca não divirjam de novo.

**Nome:** a função é `janelaDaGrade`, e não `recorteDaGrade`, porque `_client.tsx` já tem
`const recorteDaGrade = React.useMemo(...)`. Importar uma função com o mesmo nome e chamá-la dentro
desse `useMemo` sombrearia o import (review do Sciuba, ponto 2). O `const` mantém o nome; só o corpo
passa a chamar `janelaDaGrade`.

### Alternativas recusadas
| Alternativa | Por que não |
|---|---|
| Buscar três meses (anterior, atual, seguinte) | Janela maior que o necessário e continua sendo um segundo cálculo, que diverge se a grade mudar |
| Remover da grade os dias de outro mês | Muda o produto; a issue pede que a célula mostre o dia |
| Corrigir só o `+1 dia` do `endOfMonth` | Cobre o mês seguinte parcialmente e deixa o anterior sem dado |

## 3. Contratos
```ts
export const DIAS_DA_GRADE_DO_MES = 42; // 6 semanas × 7 dias
export function inicioDaGradeDoMes(ancora: Date): Date;
export function janelaDaGrade(
  visao: "dia" | "semana" | "mes",
  ancora: Date,
): { de: string; ate: string };
```
O tipo de `visao` é o que `_client.tsx` já usa; a implementação o reaproveita em vez de redefini-lo.

## 4. Dados
Nenhuma mudança de schema, RLS, API ou contrato. Sem migration, sem `baseline.sql`, sem MANIFEST.

## 5. Rastreabilidade
| Requisito | Onde é atendido neste design |
|---|---|
| RF-1 | §2 (`janelaDaGrade`, Mês) |
| RF-2 | §2 (uso nos dois pontos) |
| RF-3 | §2 + prova e2e em `03-testes.md` |
| RF-4 | §2 (Semana e Dia inalterados) |
| RF-5 | §3, §4 |

## 6. Living System Checklist
(`docs/doctrine/sistema-vivo.md`)
- Entrada e saída: entrada = âncora e visão da tela; saída = janela `de`/`ate` de `useAgendamentos` e da consulta de horários.
- Emite atividade/log: nenhuma mutação nova; a leitura continua sem auditoria, como hoje.
- Aparece na tela: as células esmaecidas da visão Mês passam a mostrar os compromissos (`chip-mes-*`).
- Porta na navegação: nenhuma tela nova.
- Mecanismo anti-morte: o teste CA-3 impede que o cálculo volte a duplicar.
- Laço de retorno: se o recorte errar de novo, o unitário CA-1 reprova antes do e2e.
- Mapa vivo (`docs/architecture/`): sem peça nova com aresta; função pura dentro de `lib/agenda/` (ver NÃO VERIFICADO).

## 7. Riscos
| Risco | Mitigação |
|---|---|
| A janela maior (42 dias) torna mais provável o truncamento do limite de 200 linhas, e o corte cai na cauda (mês seguinte): em agenda cheia o defeito reaparece sem aviso, só nos últimos dias | **Risco aceito pelo dono (P4, 2026-11-23)**; fora desta spec, com a issue própria #96 para o corte (aviso na tela ou paginação) |
| `recorte` também alimenta horários livres e a janela do Mês cresce | Verificado por leitura (§1): sem 422, custo de slots a mais. CA-6 garante Semana e Dia intactos |
| Soma de 42 dias atravessando horário de verão | `addDays` do date-fns soma dias de calendário; CA-2 mede com `differenceInCalendarDays` e inclui âncora com mudança de horário, fuso do teste fixado |
