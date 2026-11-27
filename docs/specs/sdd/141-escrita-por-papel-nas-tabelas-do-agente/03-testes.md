# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | `viewer` tenta `insert`, `update` e `delete`; tudo recusado ou sem linha afetada. Visto vermelho antes da migration | invariante | `tests/invariants/escrita-por-papel-tabelas-do-agente.test.ts` | |
| CA-2 | `agent` zera `next_action`; `viewer` não; outra coluna de `lead_state` é recusada | invariante | o mesmo arquivo | |
| CA-3 | `agent` faz os três `insert` permitidos; `viewer` não; `kind` fora da lista é recusado | invariante | o mesmo arquivo | |
| CA-4 | install e update | invariante | `pnpm test:db` | |
| CA-5 | A lista de tabelas é lida do laço no `baseline.sql`; nenhuma tem privilégio de escrita além das exceções declaradas | invariante | o mesmo arquivo | |

Sabotagem de controle: retirar um `revoke` e uma policy restritiva e ver o teste ficar vermelho; e
inverter a ordem `revoke`/`grant update (next_action)`, que precisa reprovar o CA-2.

**Todas as tabelas, por execução.** O CA-1 e o CA-5 tentam a escrita em **cada** tabela do laço; o
catálogo de privilégios sozinho não basta.

**Escritores além da busca textual.** Conferir também SQL com nome de tabela dinâmico e trigger sem
`security definer` que escreva nessas tabelas.

## Prova pela tela
Sem mudança de tela. O que se prova é que os fluxos seguem: os specs e2e do CI que exercitam quadro,
próxima ação, reativação e devolução ao agente. **Antes da migration** (T1), nomear aqui o spec de
cada um dos quatro caminhos; se algum não tiver e2e, registrar em `05-revisao.md` como ele será
provado.

## Gates antes do PR
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test:unit` (suíte inteira, rodapé conferido)
- [ ] `pnpm test:db`
- [ ] `pnpm release:conferir`
