# 04 — Tarefas

Pequenas, na ordem em que serão implementadas; cada uma deixa o repo verde. **Só começam depois que o estado do
`README.md` for `aprovada`.** Nenhuma toca schema, RLS, API ou tela.

| # | Tarefa | Cobre | Prova | Feito |
|---|---|---|---|---|
| T0 | **Sondar** o filtro PostgREST por recurso embutido (`conversations!inner`) a partir de uma tabela protegida e medir o desempenho com volume. **Sonda descartável**, não commitada; o resultado entra em `02-design.md` §1. **Se a sonda falhar, o renderizador PostgREST sai desta tarefa** (R-5) | RF-2 | resultado registrado em `05-revisao.md` | [ ] |
| T1 | Escrever o invariante de **paridade vermelho** e as tabelas de casos da regra pura, **vermelhos**, antes de qualquer código de produção | RF-1, RF-6, RF-7 | CA-1, CA-2 | [ ] |
| T2 | `lib/visibilidade/regra.ts`: `podeVerConversa` e `regraEfetiva`, puros. Verde em CA-2; sabotagem | RF-1, RF-4, RF-5, RF-6 | CA-2, CA-5 | [ ] |
| T3 | `lib/visibilidade/carregar.ts`: `carregarContexto`, `carregarAtor`, `carregarAtores` (lote), com falha fechada | RF-5, RNF-1, RNF-2 | CA-5 | [ ] |
| T4 | `lib/visibilidade/filtros.ts`: `fragmentoSql` e, **se a T0 passar**, `filtroPostgrest`. Verde em CA-3 e CA-1 | RF-2, RF-3 | CA-1, CA-3, CA-4 | [ ] |
| T5 | A **varredura de AST** (as quatro formas de leitura, §2.7) e a lista de exceções por categoria, com o teto, **incluindo `crm_lead_activities`**. Primeiro vermelha (árvore real), depois verde com a lista completa e justificada. **Registrar quantas chamadas reais acusou** | RF-8, RF-9 | CA-6, CA-7 | [ ] |
| T6 | Mapa vivo: nó "visibilidade no servidor" com ≥2 arestas em `docs/architecture/` (DoD 13); `docs/index.md` se houver doc novo | DoD 13 | `tests/unit/mapas-de-arquitetura.test.ts` | [ ] |
| T7 | Bookkeeping da spec (caixas e "Evidência" de `03-testes.md`), em PR próprio **depois do merge** | — | — | [ ] |

**Ordem:** T0 → T1 → T2 → T3 → T4 → T5 → T6 → T7. A T1 vem antes de qualquer código: o invariante vermelho é o que prova
que a regra é a do banco.

**Depois desta spec** (ordem decidida pelo dono em 2026-11-27, Q-5): **primeiro a correção do push de `message.received`**, em
tarefa própria e com prioridade (ela usa `carregarAtores` + `podeVerConversa` desta spec); depois T3.5 (aplicar nas rotas de
pessoa, uma rota por commit) e T3.6 (MCP, com spec própria). A T3.5 **só começa** depois do PR de medição da T3.2 estar
resolvido, porque o inventário dela cresceu (`02-design.md` §1).

**Fora das tarefas, por decisão:** nenhuma rota é migrada aqui, e o push de `message.received` **não** é corrigido aqui: o dono
decidiu (Q-5) que a correção é tarefa própria, com prioridade, e vem antes da T3.5.
