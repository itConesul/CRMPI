# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | `dentroDoExpediente` com expediente 08–18 e `agora` = 22h no fuso da org devolve `false`; 12h devolve `true`; dia fora das `windows` devolve `false` | unit | `tests/unit/expediente.test.ts` | — |
| CA-1 | `requireRole("agent")` fora do expediente devolve 403 `OUT_OF_WORK_HOURS` com `details.opens_at`; dentro, passa | unit | `lib/auth/require-role.test.ts` (acrescentar) | — |
| CA-1 | `agent` barrado abre `/app/...` e cai em `/fora-de-expediente`, que mostra a janela da empresa e o botão de sair; sem laço | e2e (pela tela) | `tests/e2e/expediente-e-setor.spec.ts` | — |
| CA-1 | Para não depender do relógio do servidor, o spec configura o expediente com `windows` **só em dias que não são hoje** (fora do expediente garantido) e depois com a janela de hoje (dentro) | e2e | idem | — |
| RF-6 / RNF-1 | `manager`, `admin`, platform admin e sessão de suporte **nunca** são barrados, mesmo fora do expediente | unit | `tests/unit/expediente.test.ts` | — |
| RNF-1 | Nenhuma rota de `app/api/v1/cron/` ou `webhooks/` chama `requireRole` com gate de expediente (varredura de AST, como `cron-audita-so-quando-ha-efeito.test.ts`) | unit | `tests/unit/expediente-isencoes.test.ts` | — |
| Falha aberta | Config ausente, fuso inválido, `windows` torto → `dentroDoExpediente` devolve `true` | unit | `tests/unit/expediente.test.ts` | — |
| Rota de saída | `/fora-de-expediente`, logout e troca de organização não são barrados | unit + e2e | `tests/unit/expediente-isencoes.test.ts` | — |
| CA-2 | Com 2 setores e 1 `agent` em Suporte, `select` em `conversations` não devolve a de Comercial; devolve a de Suporte e as **sem setor** | invariante | `tests/invariants/visibilidade-por-setor.test.ts` | — |
| CA-2 | `messages` da conversa de Comercial também não aparecem ao operador de Suporte (herda por `exists`) | invariante | idem | — |
| CA-2 | `viewer`/`manager`/`admin` veem as duas | invariante | idem | — |
| RF-7 / Q5 | O dono vê a conversa mesmo em outro setor | invariante | idem | — |
| RNF-2 | **2 organizações**: operador da org A não vê nada da org B, com e sem setor; as tabelas novas têm RLS ligada e `organization_id` coerente com o do departamento | invariante | `tests/invariants/visibilidade-por-setor.test.ts` + o teste de isolamento existente | — |
| RNF-2 | A função nova revoga `EXECUTE` de `PUBLIC` e de `anon` | invariante | `tests/invariants/hardening-definer-varredura.test.ts` (já varre todas as `security definer`) | — |
| CA-2 (Realtime) | Dois navegadores logados (Suporte e Comercial): nova mensagem na conversa de Comercial **não chega** ao de Suporte; chega ao de Comercial | e2e (pela tela) | `tests/e2e/expediente-e-setor.spec.ts` | — |
| CA-2 (API admin) | Para cada rota que lista conversas com client admin: a resposta a um `agent` de Suporte não contém conversa de Comercial | unit/integração por rota | resultado da tarefa T3 | — |
| RNF-3 | Baseline aplica em **install** (`ON_ERROR_STOP=1`) e **update** (re-aplicação) sem erro; clone com conversas existentes continua vendo tudo | invariante | `pnpm test:db` | — |
| Navegação | `/fora-de-expediente` na allowlist com justificativa | unit | `tests/unit/navegacao-completude.test.ts` | — |

Tipos: `unit` (`pnpm test:unit`, **sem caminho**) · `invariante` (`pnpm test:db`) ·
`e2e` (Playwright, pela tela) · `medição` (`getBoundingClientRect`/`getComputedStyle`, nunca a olho).

## Prova pela tela (toca UI)
Ambiente fresco estilo VPS (`docs/testing/user-journey-map.md`): Postgres do `baseline.sql`,
`bootstrap-owner.ts`, `next build` + `next start`, **envs opcionais ausentes**. Jornadas, em ordem de
prioridade:
1. **[P0]** Admin recém-instalado abre Configurações › Atendimento: a seção Expediente aparece
   **sem restrição** e nada o barra (instalação fresca não pode nascer trancada).
2. Admin cria 2 departamentos, vincula 2 operadores, define expediente.
3. `agent` fora do expediente → `/fora-de-expediente` → sai.
4. `agent` de Suporte não vê a conversa de Comercial; o de Comercial vê.

Evidência (screenshot/trace) em `.superpowers/evidence/`; jornadas registradas em
`docs/testing/user-journey-map.md`; spec registrado em `SPECS_PARTE_*` de
`.github/workflows/e2e.yml` (senão `e2e-cobertura-completa.test.ts` reprova).

## Gates antes do PR
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test:unit` (suíte inteira, sem caminho; rodapé conferido contra o `grep FAIL`)
- [ ] `pnpm test:db` (toca schema e RLS — obrigatório)
- [ ] `pnpm test:e2e` (toca UI)
- [ ] `pnpm release:conferir` (fragmento em `.changes/`: `capacidade_nova`)
