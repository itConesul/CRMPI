# Conversa não se apaga pela API (endurecer a RLS de `conversations` e `messages`)

**Issue:** #99 — https://github.com/itConesul/CRMPI/issues/99
**Estado:** `em-revisao`  <!-- rascunho | em-revisao | aprovada | implementando | concluida | substituida -->
**Autor:** cMoreiraSul (com Claude)
**Medido em:** `a673ace`; reconferido em `3be7195` (develop, após a v1.23.7, 2026-11-24) — ver `02-design.md`
**Origem:** T7 da spec da #70 (`docs/specs/sdd/70-modo-espiao/`, RNF-4)

## Resumo
Um `agent`+ apaga conversa direto pelo PostgREST, e o cascade leva junto `messages`,
`conversation_notes`, `agent_cases` e outras. Um `viewer` edita e apaga mensagens de conversa que
enxerga. O log das conversas é registro e hoje é perdível e adulterável por quem não devia. Esta spec:
(1) tira o `DELETE` de `conversations` do usuário; (2) restringe `UPDATE`/`DELETE` de `messages` a
`agent`+ em conversa visível; (3) faz `DELETE /contacts/[id]` recusar com **409** o contato que tem
conversa, em vez de apagar o histórico; (4) restringe **apagar contato** a `manager`+, na rota e na
tela. Uma migration, **sem função nova** e sem coluna nova.

## O que esta spec NÃO resolve
A issue nasceu como "`agent`+ faz `UPDATE` direto em `conversations`". **Este escopo (B+) não fecha o
`UPDATE`**: o `manager` ainda zera o contador do titular direto no banco, e o `agent` ainda toma
conversa em `visibility_mode=all`. Isso fica para a RPC do contador (opção C) e para a exclusão lógica
(opção D), ambas fora, por decisão do dono. Ver "Fora de escopo" em `01-requisitos.md`.

## Documentos
| Arquivo | Conteúdo |
|---|---|
| [`01-requisitos.md`](01-requisitos.md) | O quê: requisitos, aceite, fora de escopo |
| [`02-design.md`](02-design.md) | Como: o que existe (medido), a prova T0, decisão, riscos |
| [`03-testes.md`](03-testes.md) | Critério → prova |
| [`04-tarefas.md`](04-tarefas.md) | Ordem de implementação |
| [`05-revisao.md`](05-revisao.md) | Decisões do dono e aprovação |

## Checklist de aprovação
- [ ] Cada requisito rastreia para um trecho da issue ou de uma decisão do dono
- [ ] Toda afirmação sobre o código existente cita arquivo e foi verificada
- [ ] Todo critério de aceite tem dono de prova em `03-testes.md`
- [ ] Fora de escopo está explícito (inclusive o que a #99 deixa aberto)
- [ ] Impacto em schema, RLS, API e `.changes/` declarado
- [ ] Living System Checklist respondido em `02-design.md`
- [ ] Revisor registrou a aprovação em `05-revisao.md`
