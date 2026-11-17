# PRD-01 · Expediente da empresa e isolamento por setor

**Issue:** #67 — https://github.com/itConesul/CRMPI/issues/67
**Estado:** `rascunho` — **schema com aprovação condicionada; ajustes incorporados, aguardando o registro da aprovação final**
**Autor:** cMoreiraSul (com Claude)
**Medido em:** `eb8bd68` (develop; afirmações sobre o código re-conferidas em 2026-11-17)

## Resumo
Hoje nada impede um atendente humano de operar de madrugada (o horário que existe vale para o agente
de IA e para a elegibilidade do roteamento), e a única restrição de leitura entre atendentes é por
**dono da conversa** (`visibility_mode`), não por **setor**. Esta spec propõe: (1) um expediente da
organização aplicado ao papel `agent` no servidor; (2) departamentos e a visibilidade de conversas
por setor, inclusive no Realtime.

## 🔒 Regra da issue: banco antes do código
A issue #67 proíbe migration, apêndice do `baseline.sql`, linha de `MANIFEST.md` e mudança em
`database.types.ts` **antes** de (1) proposta de schema postada na issue e (2) aprovação explícita
do dono do produto. Esta spec **é** o item 1 — o §4 de [`02-design.md`](02-design.md) é a proposta.
Enquanto o item 2 não estiver registrado em [`05-revisao.md`](05-revisao.md), as tarefas de
[`04-tarefas.md`](04-tarefas.md) marcadas **🔒** não começam.

## Documentos
| Arquivo | Conteúdo |
|---|---|
| [`01-requisitos.md`](01-requisitos.md) | O quê, rastreado à issue, e as perguntas em aberto |
| [`02-design.md`](02-design.md) | Como: o que existe, decisão, **proposta de schema (§4)**, riscos |
| [`03-testes.md`](03-testes.md) | Critério → prova |
| [`04-tarefas.md`](04-tarefas.md) | Ordem de implementação, com o que está travado pela aprovação |
| [`05-revisao.md`](05-revisao.md) | Decisões e aprovação |

## Decisões (Q1–Q9)
Estado de cada uma — a fonte é a tabela de [`05-revisao.md`](05-revisao.md), que prevalece se divergir:

| Estado | Perguntas |
|---|---|
| **Confirmadas pelo dono do produto** (comentário na #67 de 2026-11-13) | Q1, Q7 |
| **Aprovadas pelo dono do produto** (comentário na #67 de 2026-11-17) | Q2, Q3, Q4, Q5, Q8, Q9 (por organização agora; por setor é evolução prevista) |
| **Fora do escopo, com risco aceito** (2026-11-17; mapeado na #80) | Q6 |
| **Decisões novas** (2026-11-17) | N1 (bloquear apagar setor com conversas), N2 (regra de setor também na escrita), N3 (virada de dia **só no expediente**, confirmada), N4 (sem audit por tentativa); gate: isenções fixas, CRM interno barrado por padrão, fora do gate (Bearer, MCP, IA, webhooks, cron, ingestão); trigger do `department_id` aceito; `NOT VALID` + `VALIDATE` |
| **Abertas** | nenhuma |

A **proposta de schema** (§4 de [`02-design.md`](02-design.md)) tem **aprovação condicionada** (2026-11-17)
a seis ajustes, **todos incorporados**; a **segunda rodada** (9 itens, em `05-revisao.md`) também foi incorporada; falta o revisor reler e registrar a aprovação final em
[`05-revisao.md`](05-revisao.md), que libera as tarefas 🔒. Aprovar as perguntas **não** libera nada
sozinho.
As quatro que mais pesam no schema:
1. **Q1 — só a ação é bloqueada** (assumir, responder, transferir…); a leitura fica liberada. O texto
   pedia bloqueio total, então RF-4 e RF-5 foram adaptados.
2. **Q2 — expediente em** `organizations.settings.business_hours`.
3. **Q3 — departamento em tabela nova**, sem reaproveitar `channel_routing_*`.
4. **Q4 — operador em vários setores** (vínculo N:N).

## Sequência de implementação (depois da aprovação)
Este PR é só de spec. A implementação vai em **PRs separados para a `develop`**: (1) gate sem schema,
(2) auditoria T0(d)+T3, (3) T4a, (4) T4b — só depois da T3. Nenhum PR traz migration, apêndice de
`baseline.sql` ou `MANIFEST.md` antes da aprovação final. Detalhe em [`04-tarefas.md`](04-tarefas.md).

## Checklist de aprovação
- [x] Cada requisito rastreia para um trecho da issue
- [x] Toda afirmação sobre o código existente cita arquivo; o que não foi medido está em "NÃO VERIFICADO"
- [x] Todo critério de aceite tem dono de prova em `03-testes.md`
- [x] Fora de escopo está explícito
- [x] Impacto em schema, RLS, API e `.changes/` declarado em `02-design.md` §4 e §8
- [x] Living System Checklist respondido em `02-design.md` §7
- [ ] **Dono do produto aprovou a proposta de schema** (registrar em `05-revisao.md` e na issue)
