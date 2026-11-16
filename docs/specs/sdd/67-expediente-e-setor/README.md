# PRD-01 · Expediente da empresa e isolamento por setor

**Issue:** #67 — https://github.com/itConesul/CRMPI/issues/67
**Estado:** `rascunho` — **proposta de schema aguardando aprovação do dono do produto**
**Autor:** cMoreiraSul (com Claude)
**Medido em:** `59c76a3` (develop)

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

## Decisões que precisam do dono do produto
1. **Bloqueio total (403 em tudo) ou só da ação** (assumir, responder, receber distribuição)? O texto
   pede total; a issue sugere ação. (Q1)
2. **Onde mora o expediente**: `organizations.settings.business_hours` (proposta) ou reaproveitar
   `attendant_availability.schedule`? (Q2)
3. **Departamento**: tabela nova (proposta) ou reaproveitar `channel_routing_*`? (Q3)
4. **Um operador em um setor ou em vários?** (Q4)

## Checklist de aprovação
- [x] Cada requisito rastreia para um trecho da issue
- [x] Toda afirmação sobre o código existente cita arquivo; o que não foi medido está em "NÃO VERIFICADO"
- [x] Todo critério de aceite tem dono de prova em `03-testes.md`
- [x] Fora de escopo está explícito
- [x] Impacto em schema, RLS, API e `.changes/` declarado em `02-design.md` §4 e §8
- [x] Living System Checklist respondido em `02-design.md` §7
- [ ] **Dono do produto aprovou a proposta de schema** (registrar em `05-revisao.md` e na issue)
