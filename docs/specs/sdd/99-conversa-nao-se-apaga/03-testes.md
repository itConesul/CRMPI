# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | `viewer`, `agent` (titular e da fila), `manager`, `admin` tentam `DELETE` em `conversations`: `permission denied`. `service_role` apaga 1 linha (PAR). `has_table_privilege('authenticated'/'anon', …, 'delete')` é falso | invariante | `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts` | a preencher ao concluir |
| CA-2 | `viewer` lê a mensagem mas edita/apaga 0 linhas. `agent`, `manager`, `admin` seguem editando e apagando em conversa visível (PAR). `agent` não toca em mensagem de conversa que não enxerga. Titular edita a própria (PAR) | invariante | mesmo arquivo | a preencher |
| CA-3 | Cliente falso devolve `23503` no `delete` de `contacts` (causa: conversa): 409 `state_conflict`, mensagem com "administrador", **só** `contacts` foi tocado, `audit` não chamado | unit | `tests/unit/contato-delete.test.ts` | a preencher |
| CA-3b | **Contato só com compromisso:** o cliente falso devolve `23503` com `calendar_appointments_contact_id_fkey` na mensagem do erro: **mesmo** 409 e **mesma** mensagem, sem `delete` de histórico, sem auditoria. **No banco real:** contato com compromisso e sem conversa, `DELETE` falha pela FK e o contato permanece; contato sem nada é apagado (PAR) | unit + invariante | `tests/unit/contato-delete.test.ts`; `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts` (semear `calendar_appointments`: `organization_id`, `title`, `starts_at`, `ends_at`) | a preencher |
| CA-4 | Sem FK: apaga só `contacts`, audita `contact.deleted`. Contato inexistente: 404 | unit | `tests/unit/contato-delete.test.ts` | a preencher |
| CA-5 | Rota com `agent` → 403 `forbidden_role` e handler **não** chamado; com `manager` → 204 | unit (rota) | `tests/unit/contato-delete-rota-so-manager.test.ts` (padrão de `tests/unit/ai-cases-routes.test.ts`) | a preencher |
| CA-6 | Botão "Excluir contato" ausente para `agent`/`viewer`, presente para `manager`/`admin`, **pela tela** | e2e | `tests/e2e/contato-excluir-so-manager.spec.ts`, registrada em `SPECS_PARTE_*` | a preencher |
| CA-7 | O texto do diálogo não contém "conversa associada"; a chave do 409 existe com `es` | unit | `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` (existente) + varredura do texto antigo | a preencher |
| CA-8 | Baseline em install e update com `ON_ERROR_STOP=1`; migration aplicada 2× sem erro | invariante | `pnpm test:db` (o próprio gate faz install + update) | a preencher |
| CA-9 | Cascade de LGPD continua: `lgpd-cascata-alcanca-quem-guarda-pessoa.test.ts` e os demais `lgpd-*` verdes | invariante | `pnpm test:db` completo | a preencher |
| CA-10 | **Fluxo de envio como `agent`:** inserir mensagem, marcar `failed`, reenviar (`sent`), inserir e apagar o eco `external_device`, cada passo com 1 linha. **Como sessão de suporte `full`** (simulada com `platform_admins`, `auth.sessions` e `platform_support_sessions`; papel efetivo `admin`): insert, `failed`, `sent`. Controle: `viewer` edita 0 | invariante | `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts` | medido manualmente em `02-design.md` §1.4; a preencher no teste |

Tipos: `unit` (`pnpm test:unit`, **sem caminho**) · `invariante` (`pnpm test:db`) · `e2e` (Playwright,
pela tela) · `medição` (`getBoundingClientRect`/`getComputedStyle`).

## Sabotagem (o teste vigia?)
Para CA-1 e CA-2: remover o apêndice do baseline e rodar o invariante. **Esperado:** falham exatamente os
casos de proteção e passam os PAR. Já feita no protótipo local (9 falham, 9 passam); repetir sobre o código
final e colar a contagem na evidência.

## Prova pela tela (DoD 12)
Ambiente fresco estilo VPS (`docs/testing/user-journey-map.md`), `envs` opcionais ausentes: logar como
`agent`, `manager` e `viewer`; abrir a lista de contatos; ver o botão; como `manager`, excluir contato **com
conversa** e ver o 409 em toast e o diálogo; excluir contato **sem conversa** e ver a lista atualizar.
Evidência em `.superpowers/evidence/`. `curl` não conta.

## Gates antes do PR de código
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm lint:channels` e `pnpm lint:role-rank`
- [ ] `pnpm test:unit` (suíte inteira, **rodapé conferido** contra `grep FAIL`, ver CLAUDE.md)
- [ ] `pnpm test:db` (**completo**, não só o arquivo novo: tocou schema e RLS)
- [ ] `pnpm release:conferir` (fragmento em `.changes/`)
