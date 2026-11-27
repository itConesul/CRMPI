# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | `viewer` tenta `insert`, `update` e `delete`; tudo recusado ou sem linha afetada. Visto vermelho antes da migration | invariante | `tests/invariants/escrita-por-papel-tabelas-do-agente.test.ts` || Vermelho antes da `0243`, verde depois |
| CA-2 | `agent` zera `next_action`; `viewer` não; outra coluna de `lead_state` é recusada | invariante | o mesmo arquivo || Verde; com `revoke`/`grant` invertidos, reprova |
| CA-3 | `agent` faz os três `insert` permitidos; `viewer` não; `kind` fora da lista é recusado | invariante | o mesmo arquivo || Verde; sem a policy de `cron_jobs`, reprova |
| CA-4 | install e update | invariante | `pnpm test:db` || 192 arquivos: 191 verdes e 1 estouro de tempo, verde sozinho |
| CA-5 | A lista de tabelas é lida do laço no `baseline.sql`; nenhuma tem privilégio de escrita além das exceções declaradas | invariante | o mesmo arquivo || Verde; sem o `revoke` de uma tabela, reprova |

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
- [x] `pnpm typecheck`
- [x] `pnpm lint` (0 erros)
- [ ] `pnpm test:unit` (suíte inteira, rodapé conferido): local no Windows, antes do merge da `develop`,
  19 falhas em 8675; 17 repetem na `develop` limpa e 2 são estouro de tempo, verdes sozinhos. Vale o `verify` do CI
- [x] `pnpm test:db`: completo antes do merge da `develop` (1591 verdes, 1 estouro de tempo, verde
  sozinho); depois dele, só os quatro arquivos afetados (128 verdes). O resultado inteiro é o `invariants` do CI
- [x] `pnpm release:conferir`
