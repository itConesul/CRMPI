# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | Para **toda** combinação (papel × `visibility_mode` × dono × setor da conversa × pertence ao setor × interruptor), o SQL (JWT de gente de verdade) e `podeVerConversa` concordam. Os dois lados rodam a mesma matriz | invariante (`pnpm test:db`) | `tests/invariants/visibilidade-ts-igual-sql.test.ts` (a criar) | a preencher |
| CA-2 | Tabela de casos da regra pura: `agent` de outro setor não vê; o dono vê (Q5); `viewer` vê sem setor e os seus (Q10, decisão C); `manager`/`admin` veem tudo; papel ausente não vê; com o interruptor **desligado**, o resultado é o do banco de hoje | unit | `lib/visibilidade/regra.test.ts` (a criar) | a preencher |
| CA-3 | Os três renderizadores selecionam **o mesmo conjunto** num conjunto semeado: o predicado em memória, o fragmento SQL num Postgres real. O filtro PostgREST é verificado **estruturalmente** (a string gerada) e, **se a sonda da T0 passar** (R-5), contra a sintaxe sondada. **NÃO PROVADO** de ponta a ponta nesta tarefa: um PostgREST de verdade só entra em jogo na T3.5, com uma rota real | invariante (SQL) + unit (PostgREST) | `tests/invariants/visibilidade-ts-igual-sql.test.ts`, `lib/visibilidade/filtros.test.ts` (a criar) | a preencher |
| CA-4 | Uma listagem com `limit` e cursor devolve `total` e `has_more` **só do que o ator vê**; uma versão com pós-filtro **reprova** o mesmo teste | unit com cliente falso + invariante (SQL) | `lib/visibilidade/paginacao.test.ts` (a criar) | a preencher |
| CA-5 | `carregarAtor` que falha **lança**; ator `sistema` sem motivo não compila e, forçado, é recusado em tempo de execução; regra "nada" nunca vira "sem filtro" | unit + `pnpm typecheck` | `lib/visibilidade/carregar.test.ts` (a criar) | a preencher |
| CA-6 | Fontes sintéticas: sem a função e sem exceção **reprova**; com um renderizador na cadeia **passa**; com ator `sistema` e motivo **passa**; com `.from` de client de sessão **passa**; SQL em `pg` com tabela protegida e sem fragmento **reprova** | unit (AST) | `tests/unit/visibilidade-varredura.test.ts` (a criar) | a preencher |
| CA-7 | A lista de exceções: toda entrada tem categoria e motivo; `sistema` e `plataforma` são globs; `pessoa`, `mcp` e `indeterminado` são por arquivo; a contagem **não passa do teto nem fica abaixo dele** | unit | `tests/unit/visibilidade-varredura.test.ts` | a preencher |
| CA-8 | O diff do PR de código **não toca** `app/api/**` (rotas), `components/**`, `supabase/**` nem `.github/**` | revisão (e `git diff --stat`) | descrito no PR | a preencher |

Tipos: `unit` (`pnpm test:unit`, **sem caminho**) · `invariante` (`pnpm test:db`) · `revisão`.

## Sabotagem (o teste vigia?)
Cada teste é visto **vermelho pelo motivo certo** antes do código, e **sabotado** depois:
- **CA-1/CA-2:** inverter a ordem "dono vem antes do setor" no TypeScript → o invariante falha só nas células de `agent`
  dono em setor alheio. Trocar `own_and_unassigned` por `own` → falham as células de `agent` sem dono.
- **CA-3:** o fragmento SQL esquece o ramo "sem setor" do `viewer` → o conjunto selecionado perde linhas.
- **CA-4:** pós-filtrar no teste → `total` vaza e o teste reprova (é o controle do próprio teste).
- **CA-6:** remover a regra "client admin" do analisador → o arquivo violador passa, e o teste reprova. Mesmo arquivo com a
  função, ou com exceção, passa.
- **CA-7:** acrescentar uma exceção `pessoa` sem subir o teto → reprova; remover uma sem descer o teto → reprova.

## Prova do alvo (medição, não teste)
Rodar o analisador sobre a árvore real e registrar **quantas chamadas reais** (por chamada, não por arquivo) ele acusa,
por categoria. É o número que a §1 de `02-design.md` só pôde dar como limite superior por arquivo. Entra em
`05-revisao.md` quando existir.

## Gates antes do PR de código
- [ ] `pnpm typecheck`
- [ ] `pnpm lint` e `pnpm lint:channels` e `pnpm lint:role-rank`
- [ ] `pnpm test:unit` (suíte inteira, **rodapé conferido** contra `grep FAIL`, ver `CLAUDE.md`)
- [ ] `pnpm test:db` (**completo**: o invariante de paridade é novo e roda o baseline)
- [ ] `pnpm release:conferir` (esta tarefa **não** traz fragmento: nenhum efeito visível ao operador)
