# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | <o que é exercitado e o que se espera> | unit / invariante / e2e / medição | `tests/unit/….test.ts` | <preencher ao concluir> |

Tipos: `unit` (`pnpm test:unit`, sem caminho) · `invariante` (`pnpm test:db`) ·
`e2e` (Playwright, pela tela) · `medição` (`getBoundingClientRect`/`getComputedStyle`, nunca a olho).

## Prova pela tela (se tocou UI)
Ambiente fresco estilo VPS (`docs/testing/user-journey-map.md`), envs opcionais ausentes.
Evidência em `.superpowers/evidence/`.

## Gates antes do PR
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test:unit` (suíte inteira, rodapé conferido)
- [ ] `pnpm test:db` (se tocou schema/RLS)
- [ ] `pnpm release:conferir` (fragmento em `.changes/`)
