# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | `viewer`, `agent` (titular e da fila), `manager`, `admin` tentam `DELETE` em `conversations`: `permission denied`. `service_role` apaga 1 linha (PAR). `has_table_privilege('authenticated'/'anon', …, 'delete')` é falso | invariante | `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts` | Invariante: 24/24 com a migration (`00b3aa8`); **sem o apêndice do baseline, os mesmos 12 casos de proteção falham e os 12 pares passam** (T1 `7dcbae0`: 12 falham, 12 passam). `test:db` completo em 2026-11-27: 191 arquivos / 1547 testes verdes; CI `invariants` verde em `a41a5f8` |
| CA-2 | `viewer` lê a mensagem mas edita/apaga 0 linhas. `agent`, `manager`, `admin` seguem editando e apagando em conversa visível (PAR). `agent` não toca em mensagem de conversa que não enxerga. Titular edita a própria (PAR) | invariante | mesmo arquivo | Mesmo invariante e mesma sabotagem do CA-1 (as duas famílias de casos estão no mesmo arquivo) |
| CA-3 | Cliente falso devolve `23503` no `delete` de `contacts` (causa: conversa): 409 `state_conflict`, mensagem com "administrador", **só** `contacts` foi tocado, `audit` não chamado | unit | `tests/unit/contato-delete.test.ts` | `tests/unit/contato-delete.test.ts` verde; **sabotado:** com o handler antigo, 4 dos 5 casos reprovam (`7d9df4d`) |
| CA-3b | **Contato só com compromisso:** o cliente falso devolve `23503` com `calendar_appointments_contact_id_fkey` na mensagem do erro: **mesmo** 409 e **mesma** mensagem, sem `delete` de histórico, sem auditoria. **No banco real:** contato com compromisso e sem conversa, `DELETE` falha pela FK e o contato permanece; contato sem nada é apagado (PAR) | unit + invariante | `tests/unit/contato-delete.test.ts`; `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts` (semear `calendar_appointments`: `organization_id`, `title`, `starts_at`, `ends_at`) | Unit (cliente falso) em `contato-delete.test.ts` + no banco real, no invariante (causa `calendar_appointments_contact_id_fkey` e causa conversa, as duas com o contato permanecendo) |
| CA-4 | Sem FK: apaga só `contacts`, audita `contact.deleted`. Contato inexistente: 404 | unit | `tests/unit/contato-delete.test.ts` | `contato-delete.test.ts` verde (apaga só `contacts`, audita `contact.deleted`; inexistente dá 404) |
| CA-5 | Rota com `agent` → 403 `forbidden_role` e handler **não** chamado; com `manager` → 204 | unit (rota) | `tests/unit/contato-delete-rota-so-manager.test.ts` (padrão de `tests/unit/ai-cases-routes.test.ts`) | `tests/unit/contato-delete-rota-so-manager.test.ts` verde; **sabotado:** com `requireRole("agent")` o teste reprova (`c5ec3a3`) |
| CA-6 | Botão "Excluir contato" ausente para `agent`/`viewer`, presente para `manager`/`admin`, **pela tela** | e2e | `tests/e2e/contato-excluir-so-manager.spec.ts`, registrada em `SPECS_PARTE_*` | e2e pela tela em banco fresco: **6/6 com a correção, 6/6 falham com o build antigo da `develop`** (`668640c`); CI `e2e-parte (3)` verde em `a41a5f8`. **Sabotado:** piso baixado para `agent` (5 falhas) e tabela sem o predicado (1 falha) (`f0edf06`). Capturas locais em `.superpowers/evidence/99-*.png` (ignoradas pelo git) |
| CA-7 | O texto do diálogo não contém "conversa associada"; a chave do 409 existe com `es` | unit | `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` (existente) + varredura do texto antigo | Diálogo coberto no e2e (6/6, CA-6) e a chave nova com `es` em `tests/unit/i18n-espanhol-cobre-a-tela.test.ts`, verde na suíte completa |
| CA-8 | Baseline em install e update com `ON_ERROR_STOP=1`; migration aplicada 2× sem erro | invariante | `pnpm test:db` (o próprio gate faz install + update) | `test:db` faz install e update com `ON_ERROR_STOP=1`: verde (191 arquivos); CI `invariants` verde em `a41a5f8` |
| CA-9 | Cascade de LGPD continua: `lgpd-cascata-alcanca-quem-guarda-pessoa.test.ts` e os demais `lgpd-*` verdes | invariante | `pnpm test:db` completo | Os 5 arquivos `tests/invariants/lgpd-*` estão verdes dentro do `test:db` completo |
| CA-10 | **Fluxo de envio como `agent`:** inserir mensagem, marcar `failed`, reenviar (`sent`), inserir e apagar o eco `external_device`, cada passo com 1 linha. **Como sessão de suporte `full`** (simulada com `platform_admins`, `auth.sessions` e `platform_support_sessions`; papel efetivo `admin`): insert, `failed`, `sent`. Controle: `viewer` edita 0 | invariante | `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts` | Casos do `CA-10` em `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts` (agent e sessão de suporte `full`: inserir, `failed`, reenviar, eco `external_device`), verdes |
| CA-11 | **Acrescentado pelo review do #140 (D-10; não consta em `01-requisitos.md`).** `viewer` e `agent` apagam 0 linhas de contato livre pelo PostgREST; `manager`, `admin`, suporte `full` e `service_role` apagam 1 (PAR); `manager` de outra organização apaga 0; `manager` com contato que tem conversa esbarra na FK; leitura, criação e edição de `contacts` inalteradas; não resta policy `FOR ALL` | invariante | `tests/invariants/conversa-nao-se-apaga-pela-api.test.ts` (bloco `CA-11`) | **34/34** em install e update do baseline. **Vermelho antes** da correção: 3 casos (`578dccf`). **Sabotado:** reinserir a `FOR ALL` ao lado da nova reabre o `DELETE` e os mesmos 3 falham; afrouxar o limite para `agent` faz o caso do `agent` falhar (`db58ca8`). CI `invariants` verde |

Tipos: `unit` (`pnpm test:unit`, **sem caminho**) · `invariante` (`pnpm test:db`) · `e2e` (Playwright,
pela tela) · `medição` (`getBoundingClientRect`/`getComputedStyle`).

## Sabotagem (o teste vigia?)
Para CA-1 e CA-2: remover o apêndice do baseline e rodar o invariante. **Esperado:** falham exatamente os
casos de proteção e passam os PAR. **Feita sobre o código final** (ver a coluna Evidência): sem o apêndice, os 12 casos de proteção falham e os 12 pares passam
(`00b3aa8`), e o bloco `CA-11` tem as suas duas sabotagens (`db58ca8`). O número do protótipo (9/9) não vale mais.

## Prova pela tela (DoD 12)
Ambiente fresco estilo VPS (`docs/testing/user-journey-map.md`), `envs` opcionais ausentes: logar como
`agent`, `manager` e `viewer`; abrir a lista de contatos; ver o botão; como `manager`, excluir contato **com
conversa** e ver o 409 em toast e o diálogo; excluir contato **sem conversa** e ver a lista atualizar.
Evidência em `.superpowers/evidence/`. `curl` não conta.

## Gates antes do PR de código
- [x] `pnpm typecheck` (verde no HEAD da `develop` `81c516c`, 2026-11-27)
- [x] `pnpm lint` (0 erros; 344 avisos, os mesmos de antes)
- [x] `pnpm lint:channels` e `pnpm lint:role-rank` (verdes)
- [x] `pnpm test:unit` (suíte inteira, **rodapé conferido** contra `grep FAIL`): 8660 verdes e **11 falhas só de ambiente**, as mesmas nas duas rodadas (6 só do Windows e 5 de `rate-limit.test.ts`, que passam 5/5 sem o `UPSTASH_*` do `.env.local`); o CI `verify` (Linux) passou
- [x] `pnpm test:db` (**completo**): 191 arquivos / 1547 testes verdes, saída 0. A 1ª rodada (no commit T2) teve um arquivo que não iniciou o worker (D-8); a final não
- [x] `pnpm release:conferir` (fragmento em `.changes/`: 1.25.0 + major = 2.0.0)
