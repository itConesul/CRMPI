# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | `viewer` tenta `insert`, `update` e `delete`; tudo recusado ou sem linha afetada. Visto vermelho antes da migration | invariante | `tests/invariants/escrita-por-papel-tabelas-do-agente.test.ts` | |
| CA-2 | `agent` zera `next_action`; `viewer` não; outra coluna de `lead_state` é recusada | invariante | o mesmo arquivo | |
| CA-3 | `agent` faz os três `insert` permitidos; `viewer` não; `kind` fora da lista é recusado | invariante | o mesmo arquivo | |
| CA-4 | install e update | invariante | `pnpm test:db` | |
| CA-5 | A lista de tabelas é lida do laço no `baseline.sql`; nenhuma tem privilégio de escrita além das exceções declaradas | invariante | o mesmo arquivo | |

Sabotagem de controle: retirar um `revoke` e uma policy restritiva e ver o teste ficar vermelho.

## Prova pela tela
Sem mudança de tela. O que se prova é que os fluxos seguem: os specs e2e do CI que exercitam quadro,
próxima ação, reativação e devolução ao agente. **A confirmar na implementação** quais existem; se
algum dos quatro caminhos não tiver e2e, registrar em `05-revisao.md`.

## Gates antes do PR
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test:unit` (suíte inteira, rodapé conferido)
- [ ] `pnpm test:db`
- [ ] `pnpm release:conferir`
