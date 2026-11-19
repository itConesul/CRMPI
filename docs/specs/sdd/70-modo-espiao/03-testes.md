# 03 — Testes e provas

Nenhum teste é escrito nesta fase. A tabela diz **o que** vigiará cada critério quando a
implementação começar (TDD: teste vermelho antes do código, nome do teste contém o ID do CA).

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | `markConversationReadHandler` com ator ≠ titular devolve a conversa e o `update` **não** é emitido; contador segue 3 | unit | `app/api/v1/conversations/mark-read-titular.test.ts` | — |
| CA-1 | Contra banco real: gestor chama a rota, `select unread_count_for_assignee` continua 3 | integração (RLS) | `tests/invariants/mark-read-so-do-titular.test.ts` (`pnpm test:db`) | — |
| CA-2 | Titular chama a rota e o contador vira 0 | unit + integração | os mesmos arquivos | — |
| CA-3 | Com o modo ativo, `useMarkAsRead` não chama `apiClient.post` depois de 1,5 s (timers falsos); sem o modo, chama | unit (hook) | `hooks/inbox/useMarkAsRead.test.tsx` | — |
| CA-3 | Pela tela: gestor abre conversa alheia com 3 não lidas no modo espião; o badge do titular segue `3` (medido por `getComputedStyle`/texto, evidência em `.superpowers/evidence/`) | e2e | `tests/e2e/modo-espiao.spec.ts` | — |
| CA-4 | O handler e a rota não importam nem invocam `lib/channels/**` (varredura de AST/import) e um adaptador-espião injetado em teste não é chamado | unit | `tests/unit/mark-read-nao-fala-com-o-provedor.test.ts` | — |
| CA-5 | Toggle ausente para `agent`, presente para `manager`/`admin` em conversa alheia, ausente em conversa própria | unit (componente) + e2e | `components/inbox/*.test.tsx` + `tests/e2e/modo-espiao.spec.ts` | — |
| CA-6 | `spy-view` por gestor em conversa alheia grava 1 linha `conversation.spy_viewed`; titular na própria, 0 linhas; `agent` recebe 403 | unit | `app/api/v1/conversations/spy-view.test.ts` | — |
| CA-6 | A ação existe em `AUDIT_ACTIONS` e o painel de auditoria a lista | unit | `tests/unit/audit-lista-do-painel-e-derivada.test.tsx` (estender) | — |
| CA-7 | Conversa sem dono: `mark-read` por qualquer papel mantém 3 (sujeito a Q2) | unit + integração | os mesmos de CA-1 | — |
| CA-8 | `pnpm lint:channels`, `pnpm gov:verify`; `git diff --name-only origin/develop...HEAD` sem `supabase/` | comando | ver coluna | — |
| RNF-3 | Falha no `audit()` não altera a resposta da rota | unit | `app/api/v1/conversations/spy-view.test.ts` | — |

## Critérios que não podem ser testados automaticamente
- **"Os ticks do cliente continuam cinzas"** (texto da issue): depende do aparelho do cliente e do
  WhatsApp. Sinalizado **antes** de implementar, como exige o fluxo: é falha da spec, e a Q3 pede
  decisão (reescrever o aceite para CA-4, ou medir manualmente com uma sessão WAHA real).

## Comandos de conferência
```bash
pnpm test:unit > /tmp/vt.log 2>&1; grep -aE "Test Files|Tests " /tmp/vt.log | tail -2
pnpm test:db          # obrigatório: toca RLS/atribuição (CLAUDE.md, "Testes")
pnpm lint:channels && pnpm typecheck && pnpm lint
```

## Rastreabilidade (RF → CA)
| Requisito | Critérios |
|---|---|
| RF-1 | CA-1, CA-2 |
| RF-2 | CA-5 |
| RF-3 | CA-3 |
| RF-4 | CA-4 |
| RF-5 | CA-6 |
| RF-6 | CA-7 |
| RNF-1 | CA-8 |
| RNF-2 | CA-8 |
| RNF-3 | CA-6 |

Todo RF/RNF tem ≥1 CA e todo CA aponta para ≥1 requisito. Não há órfão.
