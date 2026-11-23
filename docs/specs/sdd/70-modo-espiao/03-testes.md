# 03 — Testes e provas

Nenhum teste é escrito nesta fase. A tabela diz **o que** vigiará cada critério quando a
implementação começar (TDD: teste vermelho antes do código, nome do teste contém o ID do CA).

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | `markConversationReadHandler` com ator ≠ titular devolve a conversa e o `update` **não** é emitido; contador segue 3 | unit | `app/api/v1/conversations/mark-read-titular.test.ts` | — |
| CA-1 | Contra banco real, **pela rota HTTP** (login do gestor, `POST mark-read`, depois `select unread_count_for_assignee` com service role): continua 3. Não vai em `tests/invariants/`: aquela suíte só fala SQL com `psql` e **não chama rota** (review do Sciuba, ponto 6) | e2e de API (Playwright `request`) | `tests/e2e/modo-espiao.spec.ts` (CA-1/CA-2/CA-7) | — |
| CA-1 | O **predicado** que o handler emite (`UPDATE … WHERE assigned_to_user_id = :ator`) afeta 0 linhas para não titular e 1 para o titular, sob a RLS real | invariante SQL (`pnpm test:db`) | `tests/invariants/mark-read-so-do-titular.test.ts` — simula papel pelo mesmo helper de `gov-5d-queue-assign-unread.test.ts` (**T0 confirma** o helper) | — |
| CA-2 | Titular chama a rota e o contador vira 0 | unit + integração | os mesmos arquivos | — |
| CA-3 | Com o selo visível, `useMarkAsRead` não chama `apiClient.post` depois de 1,5 s (timers falsos); sem o selo (titular, ou `agent`), chama | unit (hook) | `hooks/inbox/useMarkAsRead.test.tsx` | — |
| CA-3 | Pela tela: gestor abre conversa alheia com 3 não lidas, **sem tocar em controle algum**; o badge do titular segue `3` (medido por `getComputedStyle`/texto, evidência em `.superpowers/evidence/`) | e2e | `tests/e2e/modo-espiao.spec.ts` | — |
| CA-4 | O handler e a rota não importam nem invocam `lib/channels/**` (varredura de AST/import) e um adaptador-espião injetado em teste não é chamado | unit | `tests/unit/mark-read-nao-fala-com-o-provedor.test.ts` | — |
| CA-5 | Selo ausente para `agent`; presente para `manager`/`admin` em conversa de outro titular, com o texto exato "Conversa de <titular>" e **sem** a palavra "espiando"; ausente em conversa própria e em conversa sem titular | unit (componente) + e2e | `components/inbox/*.test.tsx` + `tests/e2e/modo-espiao.spec.ts` | — |
| CA-9 | **Gestor vira titular:** por `claim` e por `transfer` o selo some; com nova mensagem recebida e o gestor abrindo a conversa, o `mark-read` zera para ele (contador 0 no banco) | unit (componente) + e2e | `components/inbox/*.test.tsx` + `tests/e2e/modo-espiao.spec.ts` | — |
| CA-6 | `listMessagesHandler` com ator `manager` e titular ≠ ator grava 1 linha; 2ª chamada na janela, 0 novas; titular na própria e conversa sem titular, 0; `agent` lendo conversa própria, 0 | unit | `app/api/v1/messages/espiao-auditoria.test.ts` | — |
| CA-6 | **Sem depender da tela:** gestor chama `GET …/messages` direto e a linha existe em `api_audit_log` (prova que não depende do cliente) | e2e de API | `tests/e2e/modo-espiao.spec.ts` | — |
| CA-6 | Dedupe falha aberta: com o contador de dedupe indisponível, a leitura ainda audita e responde 200 | unit | `app/api/v1/messages/espiao-auditoria.test.ts` | — |
| CA-6 | A ação existe em `AUDIT_ACTIONS` e o painel de auditoria a lista | unit | `tests/unit/audit-lista-do-painel-e-derivada.test.tsx` (estender) | — |
| CA-7 | Conversa sem dono: `mark-read` por qualquer papel mantém 3 (sujeito a Q2) | unit + integração | os mesmos de CA-1 | — |
| CA-8 | `pnpm lint:channels`, `pnpm gov:verify`; `git diff --name-only origin/develop...HEAD` sem `supabase/` | comando | ver coluna | — |
| RNF-3 | Falha no `audit()` não altera a resposta da leitura | unit | `app/api/v1/messages/espiao-auditoria.test.ts` | — |
| RNF-4 | **Teste de caracterização** (não de aprovação): `agent` consegue `UPDATE` direto em `conversations` sob a RLS de hoje. Documenta a limitação e **vira vermelho de propósito** quando a issue de endurecimento entrar, forçando a atualização da spec | invariante SQL | `tests/invariants/mark-read-so-do-titular.test.ts` | — |

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
| RF-2 | CA-5, CA-9 |
| RF-3 | CA-3, CA-9 |
| RF-4 | CA-4 |
| RF-5 | CA-6 |
| RF-6 | CA-7 |
| RNF-1 | CA-8 |
| RNF-2 | CA-8 |
| RNF-3 | CA-6 |
| RNF-4 | caracterização da RLS (linha RNF-4 da matriz); não há CA — é limitação declarada |
| RNF-5 | nenhum — é limitação declarada, sem prova que a feche |

Todo RF e RNF-1 a RNF-3 tem ≥1 CA, e todo CA aponta para ≥1 requisito. RNF-4 e RNF-5 são
**limitações declaradas**, não requisitos a cumprir: não têm CA de propósito.
