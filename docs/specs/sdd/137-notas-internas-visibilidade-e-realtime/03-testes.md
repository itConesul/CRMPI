# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | Os quatro papéis da medição, mais outra organização, lendo a nota. Visto vermelho antes da migration | invariante | `tests/invariants/notas-internas-visibilidade-e-realtime.test.ts` | [#156](https://github.com/itConesul/CRMPI/pull/156): vermelho antes da migration, verde depois (job `invariants`) |
| CA-2 | Tabela na publicação e `relrowsecurity` ligada | invariante | o mesmo arquivo | [#156](https://github.com/itConesul/CRMPI/pull/156): vermelho antes da migration, verde depois (job `invariants`) |
| CA-3 | Dono insere com `RETURNING` e apaga; `viewer` não insere nem apaga | invariante | o mesmo arquivo | [#156](https://github.com/itConesul/CRMPI/pull/156): vermelho antes da migration, verde depois (job `invariants`) |
| CA-4 | Agente sem acesso: `insert` recusado com e sem `RETURNING`; `update` e `delete`, com e sem filtro, não afetam linha | invariante | o mesmo arquivo | [#156](https://github.com/itConesul/CRMPI/pull/156): vermelho antes da migration, verde depois (job `invariants`) |
| CA-5 | `test.fixme` vira `test`; cenário novo "sem acesso não recebe, gerente recebe" | e2e | `tests/e2e/nota-mencao.spec.ts` | #156, job `e2e` verde: os cenários do CA-2 da #69 e do sem acesso passam |
| CA-6 | install e update; reverter cada política e a publicação faz o invariante falhar | invariante | `pnpm test:db` | install e update verdes; tirar o `exists` de cada política, ou a publicação, reprova o invariante (5 de 5, local) |

Também: `visibility_mode` `all` e `none` e a sessão de suporte no invariante (não medidos até aqui).

## Prova pela tela
Duas sessões abertas na mesma conversa: a nota escrita numa aparece na outra sem recarregar; o
mencionado recebe o aviso e o clique abre a conversa. Evidência em `.superpowers/evidence/`.

**Nuvem:** repetir num projeto Supabase real (o simulador usa um), aplicando o `baseline.sql` sobre a
base existente, como o `update.sh` faz. Registrar em `05-revisao.md` se foi preciso reiniciar o
Realtime e o que acontece com a nota apagada.

## Gates antes do PR
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test:unit` (suíte inteira, rodapé conferido)
- [ ] `pnpm test:db`
- [ ] `pnpm release:conferir`
