---
type: execucao-de-testes
project: DeskcommCRM
data: 2026-11-19
branch_de_origem: spec/70-modo-espiao (só docs sobre develop @ 365a670)
ambiente: Windows 11, Node 22.23.5, pnpm 9.15.9, Supabase local 2.122.0 em Docker
codigo_alterado: nenhum
---

# Bateria de testes — 2026-11-19 (Windows, ambiente local)

> **Isto é um registro de execução, não um estado vivo.** Descreve UMA rodada, medida contra a `develop` em `365a670`. Serve de linha de base: quem corrigir algo daqui reexecuta o item e marca a caixa na seção 7.
> Nada foi alterado no código para fazer esta bateria passar ou falhar.

## 1. Resumo

| Teste | Resultado | Observação |
|---|---|---|
| `pnpm typecheck` | ✅ passou | |
| `pnpm lint` | ✅ passou | |
| `pnpm lint:channels` | ✅ passou | |
| `pnpm lint:role-rank` | ✅ passou | |
| `pnpm release:conferir` | ⚠️ código 1 | esperado: não há fragmento em `.changes/` numa branch só de docs |
| `pnpm test:unit` | ❌ 8096 ✅ / 6 ❌ | 758 arquivos, 4 com falha. Rodapé do vitest e `grep FAIL` bateram (6 = 6) |
| `pnpm test:db` | ✅ passou | 188 arquivos, 1483 testes, 1 expected-fail, 1 skipped (524 s) |
| `pnpm test:shell` | ❌ 1 prova | 6 scripts; a falha é do NTFS (ver seção 4) |
| `pnpm e2e:build` | ✅ passou | o host de produção não aparece no bundle do browser; controle positivo ok |
| E2E Playwright | ❌ 133 ✅ / 15 ❌ / 8 skipped / 13 did not run | 50 de 101 specs, 38,2 min. As outras 51 **não rodaram** (seção 6) |

Prova o quê: tipagem, lint, unitários, baseline do banco (install e update), isolamento RLS entre organizações, kit de instalação e uma parte do frontend. **Não prova**: a instalação fresca (`vps-fresh-onboarding`, a P0), nem as 51 specs da seção 6.

### 1.1 Matriz do que foi testado

**Por camada** — o que cada comando exercita e o que ficou de fora.

| Camada | Comando | Exercita | Executado | ✅ | ❌ | Não coberto nesta rodada |
|---|---|---|---|---|---|---|
| Tipagem | `pnpm typecheck` | TypeScript estrito | sim | passou | — | — |
| Estilo e regras | `pnpm lint`, `lint:channels`, `lint:role-rank` | ESLint, restrição de canal, ordem dos papéis | sim | 3 de 3 | — | — |
| Release | `pnpm release:conferir` | forma dos fragmentos `.changes/` | sim | — | — | código 1 esperado (branch só de docs) |
| Unitário | `pnpm test:unit` | 758 arquivos, 8103 casos (1 expected fail) | sim, integral | 8096 | 6 | só no Windows; o CI Linux não foi consultado |
| Banco | `pnpm test:db` | baseline install e update, RLS entre 2 organizações, varredura de `security definer` | sim, integral | 1483 | 0 | — |
| Kit de instalação | `pnpm test:shell` | `update.sh`, entrypoint do scheduler, validadores | sim (6 scripts, um a um) | 5 de 6 scripts | 1 prova | — |
| Build | `pnpm e2e:build` | build de produção com o Supabase local; host de produção fora do bundle | sim | passou | — | — |
| E2E (frontend) | `playwright test` | jornadas pela tela | **parcial: 50 de 101 specs** | 133 | 15 | 51 specs não carregaram (`npx` no Windows) |
| Instalação fresca | `vps-fresh-onboarding` (P0) | onboarding do dono num banco novo | **não** | — | — | precisa de banco recém-instalado; `FORA_DO_CI` |

**Por área do E2E** — agrupado pelo prefixo do nome da spec.

| Área | Specs | Rodaram | Não rodaram | ✅ | ❌ | ⏭️ |
|---|---|---|---|---|---|---|
| agenda | 18 | 11 | 7 | 44 | 2 | 2 |
| followup | 8 | 2 | 6 | 2 | 0 | 0 |
| inbox | 5 | 4 | 1 | 5 | 0 | 2 |
| agente | 4 | 1 | 3 | 4 | 1 | 0 |
| central | 3 | 3 | 0 | 6 | 2 | 0 |
| j20 | 3 | 0 | 3 | 0 | 0 | 0 |
| qa | 3 | 1 | 2 | 1 | 0 | 0 |
| gatilho | 2 | 0 | 2 | 0 | 0 | 0 |
| vps | 2 | 1 | 1 | 0 | 1 | 11 |
| acervo | 1 | 1 | 0 | 2 | 0 | 4 |
| auth | 1 | 1 | 0 | 4 | 0 | 0 |
| automacao | 1 | 0 | 1 | 0 | 0 | 0 |
| autonomia | 1 | 1 | 0 | 0 | 1 | 0 |
| cadastro | 1 | 1 | 0 | 0 | 1 | 1 |
| capacidades | 1 | 0 | 1 | 0 | 0 | 0 |
| confirmar | 1 | 0 | 1 | 0 | 0 | 0 |
| contato | 1 | 0 | 1 | 0 | 0 | 0 |
| conversa | 1 | 0 | 1 | 0 | 0 | 0 |
| credenciais | 1 | 1 | 0 | 1 | 0 | 0 |
| degradacao | 1 | 0 | 1 | 0 | 0 | 0 |
| distribuicao | 1 | 0 | 1 | 0 | 0 | 0 |
| encerramento | 1 | 1 | 0 | 2 | 0 | 0 |
| error | 1 | 1 | 0 | 7 | 0 | 0 |
| escalacao | 1 | 0 | 1 | 0 | 0 | 0 |
| escopo | 1 | 0 | 1 | 0 | 0 | 0 |
| historico | 1 | 0 | 1 | 0 | 0 | 0 |
| i18n | 1 | 1 | 0 | 0 | 1 | 0 |
| icone | 1 | 1 | 0 | 3 | 0 | 0 |
| importar | 1 | 0 | 1 | 0 | 0 | 0 |
| interface | 1 | 1 | 0 | 1 | 0 | 0 |
| invite | 1 | 0 | 1 | 0 | 0 | 0 |
| juntar | 1 | 0 | 1 | 0 | 0 | 0 |
| kanban | 1 | 0 | 1 | 0 | 0 | 0 |
| lote | 1 | 0 | 1 | 0 | 0 | 0 |
| marca | 1 | 0 | 1 | 0 | 0 | 0 |
| mfa | 1 | 1 | 0 | 4 | 0 | 0 |
| moeda | 1 | 1 | 0 | 1 | 1 | 0 |
| navegacao | 1 | 1 | 0 | 12 | 0 | 0 |
| notificacoes | 1 | 1 | 0 | 2 | 0 | 0 |
| olhar | 1 | 1 | 0 | 1 | 0 | 0 |
| organizacoes | 1 | 1 | 0 | 1 | 0 | 0 |
| password | 1 | 1 | 0 | 1 | 0 | 0 |
| pipelines | 1 | 0 | 1 | 0 | 0 | 0 |
| pre | 1 | 1 | 0 | 0 | 1 | 0 |
| primeiro | 1 | 1 | 0 | 6 | 0 | 0 |
| prova | 1 | 1 | 0 | 5 | 3 | 0 |
| queue | 1 | 0 | 1 | 0 | 0 | 0 |
| rbac | 1 | 0 | 1 | 0 | 0 | 0 |
| relatorio | 1 | 0 | 1 | 0 | 0 | 0 |
| relogio | 1 | 1 | 0 | 0 | 1 | 1 |
| reset | 1 | 1 | 0 | 1 | 0 | 0 |
| retorno | 1 | 0 | 1 | 0 | 0 | 0 |
| risk | 1 | 0 | 1 | 0 | 0 | 0 |
| roteamento | 1 | 1 | 0 | 1 | 0 | 0 |
| signup | 1 | 1 | 0 | 1 | 0 | 0 |
| smoke | 1 | 1 | 0 | 1 | 0 | 0 |
| suporte | 1 | 1 | 0 | 1 | 0 | 0 |
| system | 1 | 0 | 1 | 0 | 0 | 0 |
| troca | 1 | 0 | 1 | 0 | 0 | 0 |
| webhooks | 1 | 0 | 1 | 0 | 0 | 0 |
| wizard | 1 | 1 | 0 | 13 | 0 | 0 |
| zona | 1 | 0 | 1 | 0 | 0 | 0 |
| **Total** | **101** | **50** | **51** | **133** | **15** | **21** |

<details>
<summary><b>Por spec</b> — as 101 specs de `tests/e2e/`, com a situação de cada uma</summary>

| Spec | Situação | ✅ | ❌ | ⏭️ |
|---|---|---|---|---|
| `acervo-de-conhecimento.spec.ts` | ⚠️ passou com skipped | 2 | 0 | 4 |
| `agenda-caminho-ate-os-horarios.spec.ts` | ✅ passou | 2 | 0 | 0 |
| `agenda-conectar-google.spec.ts` | ⚠️ passou com skipped | 1 | 0 | 1 |
| `agenda-escopo-da-organizacao.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `agenda-google-meet.spec.ts` | ✅ passou | 2 | 0 | 0 |
| `agenda-google-sync.spec.ts` | ✅ passou | 2 | 0 | 0 |
| `agenda-google-volta-do-consentimento.spec.ts` | ⚠️ passou com skipped | 2 | 0 | 1 |
| `agenda-google-volta-nao-desloga.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `agenda-grade-interativa.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `agenda-kit-visual.spec.ts` | ✅ passou | 20 | 0 | 0 |
| `agenda-marcar-pela-tela.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `agenda-ocupacao-do-google-na-grade.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `agenda-ocupacao-do-google-no-historico.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `agenda-painel-cabe-na-tela.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `agenda-presenca-recuperacao.spec.ts` | ❌ falhou | 6 | 1 | 0 |
| `agenda-remarcar-e-cancelar.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `agenda-tela-do-produto.spec.ts` | ✅ passou | 7 | 0 | 0 |
| `agenda-tipos-de-agendamento.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `agenda-ver-na-agenda.spec.ts` | ❌ falhou | 0 | 1 | 0 |
| `agente-marca-consulta.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `agente-novo-e-uso.spec.ts` | ❌ falhou | 4 | 1 | 0 |
| `agente-organiza-operacao.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `agente-papeis-operador.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `auth.spec.ts` | ✅ passou | 4 | 0 | 0 |
| `automacao-diz-a-verdade.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `autonomia-assistida.spec.ts` | ❌ falhou | 0 | 1 | 0 |
| `cadastro-sem-confirmacao-de-email.spec.ts` | ❌ falhou | 0 | 1 | 1 |
| `capacidades-do-agente.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `central-avisos-destino.spec.ts` | ✅ passou | 4 | 0 | 0 |
| `central-avisos-resolver-em-lote.spec.ts` | ✅ passou | 2 | 0 | 0 |
| `central-de-avisos-capacidades.spec.ts` | ❌ falhou | 0 | 2 | 0 |
| `confirmar-dado-do-contato.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `contato-salva-email.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `conversa-vira-lead.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `credenciais-de-ia.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `degradacao-silenciosa.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `distribuicao-atendimento.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `encerramento-atendimento.spec.ts` | ✅ passou | 2 | 0 | 0 |
| `error-pages.spec.ts` | ✅ passou | 7 | 0 | 0 |
| `escalacao-ciclo.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `escopo-de-funil-do-agente.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `followup-builder.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `followup-dossie.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `followup-journey.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `followup-linguagem.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `followup-publicado-abre-no-construtor.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `followup-queue.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `followup-ramos.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `followup-tempo-adaptativo.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `gatilho-de-caso.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `gatilho-de-etapa.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `historico-de-captacao.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `i18n-espanhol-na-tela.spec.ts` | ❌ falhou | 0 | 1 | 0 |
| `icone-da-marca.spec.ts` | ✅ passou | 3 | 0 | 0 |
| `importar-leads-planilha.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `inbox-abas-espelham-o-comando.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `inbox-quem-manda.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `inbox-responder-citando.spec.ts` | ⏭️ só skipped | 0 | 0 | 2 |
| `inbox-scope.spec.ts` | ✅ passou | 3 | 0 | 0 |
| `inbox-tempo-real.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `interface-por-vinculo.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `invite-lifecycle.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `j20-elegibilidade-atendimento-manual.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `j20-elegibilidade-followup.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `j20-elegibilidade-respondi.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `juntar-contatos-duplicados.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `kanban-owner-filter.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `lote-no-quadro-do-funil.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `marca-logo.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `mfa-opcional.spec.ts` | ✅ passou | 4 | 0 | 0 |
| `moeda-da-organizacao.spec.ts` | ❌ falhou | 1 | 1 | 0 |
| `navegacao.spec.ts` | ✅ passou | 12 | 0 | 0 |
| `notificacoes-diz-o-que-falta.spec.ts` | ✅ passou | 2 | 0 | 0 |
| `olhar-telas-do-epico.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `organizacoes-criacao-convite-e-cache.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `password-recovery.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `pipelines-gestao.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `pre-go-live-whatsapp.spec.ts` | ❌ falhou | 0 | 1 | 0 |
| `primeiro-acesso-sem-organizacao.spec.ts` | ✅ passou | 6 | 0 | 0 |
| `prova-painel-provedores.spec.ts` | ❌ falhou | 5 | 3 | 0 |
| `qa-agente-usa-as-maos.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `qa-selo-no-funil-usado.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `qa-telas-descobertas-w4.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `queue-assign.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `rbac-roles.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `relatorio-de-atividades.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `relogio-http-cron-externo.spec.ts` | ❌ falhou | 0 | 1 | 1 |
| `reset-password-mfa.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `retorno-anti-morte.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `risk-radar.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `roteamento-por-canal.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `signup-journey.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `smoke.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `suporte-temporario.spec.ts` | ✅ passou | 1 | 0 | 0 |
| `system-update.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `troca-de-organizacao-tem-volta.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `vps-fresh-onboarding.spec.ts` | ❌ falhou | 0 | 1 | 11 |
| `vps-webhook-outbound-ssrf.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `webhooks.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |
| `wizard-do-funcionario.spec.ts` | ✅ passou | 13 | 0 | 0 |
| `zona-de-perigo-apaga-dados-de-teste.spec.ts` | 🚫 não carregou (`npx` no Windows) | | | |

</details>

Legenda: ✅ passou · ❌ falhou · ⏭️ skipped ou não rodou · 🚫 a spec não chegou a carregar.

## 2. Ambiente desta rodada (o que NÃO estava de pé)

- Sem WAHA e sem Redis: o limite de requisições caiu para o contador em memória (`redis incr failed; falling back to in-memory` no log do servidor).
- Sem chave de IA (`AI_GATEWAY_API_KEY`/`ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY`) e sem `OPENAI_API_KEY`.
- Banco local **com dados** (organização "E2E Test Org" e 11 usuários), não um banco recém-instalado.
- `SENTRY_DSN=off`.

Isto importa na triagem: parte das falhas da seção 5 pode ser ambiente e não defeito. **Nenhuma causa foi investigada** nesta rodada.

## 3. Falhas do `test:unit` (6 casos, 4 arquivos)

Já eram conhecidas como exclusivas do Windows (reproduzem na `develop` limpa; a CI Linux `verify` é quem decide). Não confirmado nesta rodada.

| Arquivo | Caso |
|---|---|
| `tests/unit/lgpd-pdf-meet.test.ts` | PDF efetivamente entregue contém registros, datas, estados e controlador sem material privado |
| `tests/unit/lgpd-pdf-meet.test.ts` | arrays vazios ou ausentes em payload legado não criam seções nem quebram o PDF |
| `tests/unit/lgpd-pdf-meet.test.ts` | quebra de páginas conserva todos os avisos e o controlador nas páginas seguintes |
| `tests/unit/lgpd-pdf-replies.test.ts` | PDF entregue inclui revisão pessoal e omite contexto privado |
| `tests/unit/rascunho-superado-nao-e-regravado.test.ts` | a sonda enxerga alguma coisa (controle positivo) |
| `tests/unit/suporte-cobertura-de-efeitos.test.ts` | Server Actions que resolvem tenant declaram efeito ou uma exceção pessoal/transição |

Causas registradas antes (não remedidas aqui): `pdfjs ... trailing slash` nos três de PDF; separador de barra invertida no caminho nos dois últimos.

## 4. `test:shell`

| Script | Resultado |
|---|---|
| `tests/shell/update-guard.test.sh` | ❌ 1 prova: `.env continua 600 (só o dono lê)` |
| `tests/shell/dono-do-projeto.test.sh` | ✅ 17 |
| `tests/shell/scheduler-entrypoint.test.sh` | ✅ 9 |
| `tests/shell/owner-id-por-email.test.sh` | ✅ 12 |
| `tests/shell/token-do-repo.test.sh` | ✅ 16 |
| `setup-kit/test-validators.sh` | ✅ 255 |

Causa da falha medida: neste disco `chmod 600` não persiste (`stat` devolve `644`), logo NTFS. Atenção: `pnpm test:shell` encadeia com `&&` e **para no primeiro erro** — os cinco últimos só rodaram porque foram chamados um a um.

## 5. E2E — falhas (15)

Cada uma precisa de reexecução isolada e leitura do trace antes de ser tratada como defeito.

| # | Spec:linha | Teste |
|---|---|---|
| 1 | `agenda-ver-na-agenda.spec.ts:64` | marcar, clicar em 'Ver na agenda', e ENCONTRAR o compromisso na grade |
| 2 | `agente-novo-e-uso.spec.ts:189` | Olhar o consumo de IA › um período sem nenhum dado é explicado, não fica em branco |
| 3 | `cadastro-sem-confirmacao-de-email.spec.ts:98` | ⭐ o cadastro não manda esperar um e-mail que não vai chegar |
| 4 | `central-de-avisos-capacidades.spec.ts:57` | Central de avisos — o atendimento que saiu sem as ferramentas › o aviso aparece, em português de gente, com o motivo técnico junto |
| 5 | `central-de-avisos-capacidades.spec.ts:100` | Central de avisos — o atendimento que saiu sem as ferramentas › o aviso é acionável: dá para resolver e ele sai da lista de abertos |
| 6 | `i18n-espanhol-na-tela.spec.ts:282` | o idioma escolhido chega à tela › espanhol cobre a interface, e o português volta byte a byte |
| 7 | `moeda-da-organizacao.spec.ts:87` | moeda da organização › produto em peso mexicano mostra o preço na convenção do México |
| 8 | `pre-go-live-whatsapp.spec.ts:9` | admin configura testes, remove número, confirma abertura e volta a restringir |
| 9 | `prova-painel-provedores.spec.ts:104` | F3 — a OpenRouter é oferecida e seus modelos estão no seletor |
| 10 | `prova-painel-provedores.spec.ts:122` | F1 — trocar o modelo GRAVA, e a tela passa a mostrar o novo |
| 11 | `prova-painel-provedores.spec.ts:188` | instalação sem agente publicado: os dois pontos principais são EDITÁVEIS |
| 12 | `relogio-http-cron-externo.spec.ts:238` | Relógio HTTP — a batida de um cron externo faz o follow-up andar › segredo errado é recusado — e o relógio NÃO anda |
| 13 | `vps-fresh-onboarding.spec.ts:142` | J1 — onboarding do dono numa instalação fresca › J1.2 senha errada → mensagem clara, sem stack |
| 14 | `agenda-presenca-recuperacao.spec.ts:634` | receiver reconcilia inline/daemon, barra claim antigo e protege agenda além de mil linhas |
| 15 | `autonomia-assistida.spec.ts:252` | testa sem enviar, pausa preserva publicação e duas aprovações entregam texto revisado sem silenciar assistência |

## 6. E2E — specs que NÃO rodaram (51 de 101)

Abortaram no carregamento com `Error: spawnSync npx ENOENT`: chamam `execFileSync("npx", ...)` sem shell, e no Windows o executável é `npx.cmd`. **Não é resultado do produto.** Rodam normalmente no CI Linux. Ficam sem cobertura nesta rodada: convite, webhooks, RBAC, follow-up, a maior parte da Agenda e outras.

- `agenda-escopo-da-organizacao.spec.ts`
- `agenda-grade-interativa.spec.ts`
- `agenda-marcar-pela-tela.spec.ts`
- `agenda-ocupacao-do-google-na-grade.spec.ts`
- `agenda-painel-cabe-na-tela.spec.ts`
- `agenda-remarcar-e-cancelar.spec.ts`
- `agenda-tipos-de-agendamento.spec.ts`
- `agente-marca-consulta.spec.ts`
- `agente-organiza-operacao.spec.ts`
- `agente-papeis-operador.spec.ts`
- `automacao-diz-a-verdade.spec.ts`
- `capacidades-do-agente.spec.ts`
- `confirmar-dado-do-contato.spec.ts`
- `contato-salva-email.spec.ts`
- `conversa-vira-lead.spec.ts`
- `degradacao-silenciosa.spec.ts`
- `distribuicao-atendimento.spec.ts`
- `escalacao-ciclo.spec.ts`
- `escopo-de-funil-do-agente.spec.ts`
- `followup-builder.spec.ts`
- `followup-dossie.spec.ts`
- `followup-journey.spec.ts`
- `followup-queue.spec.ts`
- `followup-ramos.spec.ts`
- `followup-tempo-adaptativo.spec.ts`
- `gatilho-de-caso.spec.ts`
- `gatilho-de-etapa.spec.ts`
- `historico-de-captacao.spec.ts`
- `importar-leads-planilha.spec.ts`
- `inbox-quem-manda.spec.ts`
- `invite-lifecycle.spec.ts`
- `j20-elegibilidade-atendimento-manual.spec.ts`
- `j20-elegibilidade-followup.spec.ts`
- `j20-elegibilidade-respondi.spec.ts`
- `juntar-contatos-duplicados.spec.ts`
- `kanban-owner-filter.spec.ts`
- `lote-no-quadro-do-funil.spec.ts`
- `marca-logo.spec.ts`
- `pipelines-gestao.spec.ts`
- `qa-agente-usa-as-maos.spec.ts`
- `qa-telas-descobertas-w4.spec.ts`
- `queue-assign.spec.ts`
- `rbac-roles.spec.ts`
- `relatorio-de-atividades.spec.ts`
- `retorno-anti-morte.spec.ts`
- `risk-radar.spec.ts`
- `system-update.spec.ts`
- `troca-de-organizacao-tem-volta.spec.ts`
- `vps-webhook-outbound-ssrf.spec.ts`
- `webhooks.spec.ts`
- `zona-de-perigo-apaga-dados-de-teste.spec.ts`

## 7. Acompanhamento das falhas do E2E

Marque ao reexecutar (comando abaixo) e anote a causa (ambiente ou defeito) e o PR da correção.

- [ ] `agenda-ver-na-agenda.spec.ts:64` — marcar, clicar em 'Ver na agenda', e ENCONTRAR o compromisso na grade — causa: _?_ — PR: _?_
- [ ] `agente-novo-e-uso.spec.ts:189` — Olhar o consumo de IA › um período sem nenhum dado é explicado, não fica em branco — causa: _?_ — PR: _?_
- [ ] `cadastro-sem-confirmacao-de-email.spec.ts:98` — ⭐ o cadastro não manda esperar um e-mail que não vai chegar — causa: _?_ — PR: _?_
- [ ] `central-de-avisos-capacidades.spec.ts:57` — Central de avisos — o atendimento que saiu sem as ferramentas › o aviso aparece, em português de gente, com o motivo técnico junto — causa: _?_ — PR: _?_
- [ ] `central-de-avisos-capacidades.spec.ts:100` — Central de avisos — o atendimento que saiu sem as ferramentas › o aviso é acionável: dá para resolver e ele sai da lista de abertos — causa: _?_ — PR: _?_
- [ ] `i18n-espanhol-na-tela.spec.ts:282` — o idioma escolhido chega à tela › espanhol cobre a interface, e o português volta byte a byte — causa: _?_ — PR: _?_
- [ ] `moeda-da-organizacao.spec.ts:87` — moeda da organização › produto em peso mexicano mostra o preço na convenção do México — causa: _?_ — PR: _?_
- [ ] `pre-go-live-whatsapp.spec.ts:9` — admin configura testes, remove número, confirma abertura e volta a restringir — causa: _?_ — PR: _?_
- [ ] `prova-painel-provedores.spec.ts:104` — F3 — a OpenRouter é oferecida e seus modelos estão no seletor — causa: _?_ — PR: _?_
- [ ] `prova-painel-provedores.spec.ts:122` — F1 — trocar o modelo GRAVA, e a tela passa a mostrar o novo — causa: _?_ — PR: _?_
- [ ] `prova-painel-provedores.spec.ts:188` — instalação sem agente publicado: os dois pontos principais são EDITÁVEIS — causa: _?_ — PR: _?_
- [ ] `relogio-http-cron-externo.spec.ts:238` — Relógio HTTP — a batida de um cron externo faz o follow-up andar › segredo errado é recusado — e o relógio NÃO anda — causa: _?_ — PR: _?_
- [ ] `vps-fresh-onboarding.spec.ts:142` — J1 — onboarding do dono numa instalação fresca › J1.2 senha errada → mensagem clara, sem stack — causa: _?_ — PR: _?_
- [ ] `agenda-presenca-recuperacao.spec.ts:634` — receiver reconcilia inline/daemon, barra claim antigo e protege agenda além de mil linhas — causa: _?_ — PR: _?_
- [ ] `autonomia-assistida.spec.ts:252` — testa sem enviar, pausa preserva publicação e duas aprovações entregam texto revisado sem silenciar assistência — causa: _?_ — PR: _?_

Reexecutar uma spec: `pnpm e2e:build` (se o código mudou) e `pnpm exec playwright test tests/e2e/<spec>.spec.ts --workers=1 --reporter=list`.

## 7.1 Possíveis soluções por falha

> **São propostas, não correções.** Nada foi implementado nem reexecutado depois da leitura do erro. A coluna **Base** diz o que sustenta cada proposta: *medido* = está no erro do log ou no código lido; *hipótese* = plausível, ainda sem prova. Antes de aplicar qualquer uma, reexecute a spec isolada.
>
> Classes: **L** limitação do Windows · **P** precondição de ambiente ou de dado que esta rodada não montou · **D** dependência de ordem (seed que outra spec faz) · **?** causa ainda desconhecida · **B?** candidato a defeito de produto.

### E2E (15)

| # | Spec | Classe | O que o erro mostra | Possível solução | Base |
|---|---|---|---|---|---|
| 1 | `agenda-presenca-recuperacao:634` | ? | `enviarTextoFixoPendente(...)` devolveu `0`, esperado `1` (linha 817) | Reexecutar isolada, com banco limpo; abrir o `trace.zip` e conferir se o receiver chegou a ser chamado antes da linha 817. Se persistir sozinha, depurar a fixture montada nas linhas ~800–816 | hipótese |
| 2 | `agenda-ver-na-agenda:64` | D | `.e2e-creds.json sem o bloco 'agenda' — rode scripts/seed-e2e-agenda.ts` | Rodar `pnpm exec tsx scripts/seed-e2e-agenda.ts` antes. As specs que fariam esse seed usam `npx` e não rodaram no Windows. Melhoria possível na spec: semear sozinha, em vez de depender de outra | medido |
| 3 | `agente-novo-e-uso:189` | ? | Timeout de 267 s no `beforeEach`, preso em `esperarProximaJanelaTotp` no login do admin; "browser has been closed". O arquivo levou 12,1 min | Conferir se o relógio do Windows está sincronizado (o TOTP depende dele); reexecutar sozinha; se a espera do TOTP continuar estourando, o teto de tempo da spec precisa cobrir a espera (o PR #86 já mexeu nisso) | hipótese |
| 4 | `autonomia-assistida:252` | P | `process.env.INTERNAL_AGENT_RUN_STUB` esperado `"true"`, veio `"false"` | Exportar `INTERNAL_AGENT_RUN_STUB=true` ao rodar. O CI já faz isso (`e2e.yml:276`). Melhoria de tooling: `gerar-env-e2e.sh` poderia gravar a variável no `.env.e2e` local | medido |
| 5 | `cadastro-sem-confirmacao-de-email:98` | P | "o provedor local ainda exige confirmação de e-mail (`GOTRUE_MAILER_AUTOCONFIRM=false`)" | Subir o Supabase local com `GOTRUE_MAILER_AUTOCONFIRM=true` e rodar **só** este arquivo, como o cabeçalho da spec manda. A spec está em `FORA_DO_CI` de propósito: na suíte inteira ela sempre falha localmente. Não é defeito | medido |
| 6 | `central-de-avisos-capacidades:57` | D | O texto "Um atendimento saiu sem as ferramentas que você ligou" não apareceu em 30 s | O cabeçalho da spec lista o pré-requisito `scripts/seed-e2e-capacidades-ausentes.ts` (emissor real do aviso), que esta rodada não executou. Rodar o seed e reexecutar | medido (pré-requisito) / hipótese (que é só isso) |
| 7 | `central-de-avisos-capacidades:100` | D | Mesma ausência do aviso, no teste de "resolver" | Mesma solução do item 6; os dois dependem do mesmo seed | idem |
| 8 | `i18n-espanhol-na-tela:282` | **B?** | Com a interface em espanhol, `/app/metrics` mostrou em português `"Novo"`, `"Em andamento"` e `"Ganho"` | `app/app/metrics/_components/MetricsClient.tsx:105` renderiza `{s.stage_name}` sem passar por `t()`, enquanto o rótulo `Ganhos` na linha 135 passa. Provável correção: traduzir o nome da etapa quando ele for um dos nomes padrão do dicionário. Reproduzir isolada antes, porque pode ser decisão de produto (nome de etapa é dado do usuário) | medido (linha) / hipótese (causa) |
| 9 | `moeda-da-organizacao:87` | ? | Após salvar a moeda MXN, "organização atualizada" não apareceu em 10 s; o log traz `Protocol error ... Internal server error, session closed`. O arquivo levou 5,2 min | O navegador de teste caiu no meio. Reexecutar isolada, com a máquina ociosa; se passar, é instabilidade de recurso. Se repetir, abrir o trace | hipótese |
| 10 | `pre-go-live-whatsapp:9` | L | `spawnSync pnpm ENOENT` ao chamar `pnpm exec tsx scripts/bootstrap-owner.ts` | No Windows o executável é `pnpm.cmd`. Rodar no WSL/Linux ou no CI. Correção de código possível: `execFileSync` com `shell: true` (mexe na spec) | medido |
| 11 | `prova-painel-provedores:104` | P? | O seletor de modelos da OpenRouter veio sem nenhuma `option` (esperado > 50) | A spec espera o catálogo sincronizado da OpenRouter. Verificar de onde o catálogo vem (job de sincronização) e se precisa de rede ou `OPENROUTER_API_KEY`, ausente neste ambiente. Sincronizar e reexecutar | hipótese |
| 12 | `prova-painel-provedores:122` | P? | Esperando a opção `Llama 3.3 70B Instruct` por 90 s | Mesma causa do item 11: sem catálogo não há modelo para escolher | hipótese |
| 13 | `prova-painel-provedores:188` | P | `agent_turn` veio `mandadoPeloAgente: true`, esperado `false` ("instalação sem agente publicado") | O banco local **tem** agente publicado (`default_agent_id` nas creds), então a resposta `true` é a esperada para esse estado. Rodar num banco sem agente publicado (instalação fresca), ou despublicar antes. Só viraria defeito se `true` aparecesse numa instalação sem publicação | medido (estado do banco) / hipótese (conclusão) |
| 14 | `relogio-http-cron-externo:238` | L | `curl ... -o /dev/null` → `curl: (23) client returned ERROR on write` | `/dev/null` não existe no `curl.exe` do Windows. Rodar no WSL/Linux ou no CI. Correção de código possível: `-o NUL` condicional por plataforma. O 2º teste do arquivo ficou skipped em consequência | medido (erro 23 = falha de escrita) |
| 15 | `vps-fresh-onboarding:142` | P | "não achou o dono (`dono@qa.local`)" — a spec se recusa a agir em outra organização | Montar a instalação fresca de verdade: baseline limpo + `OWNER_EMAIL=dono@qa.local ... scripts/bootstrap-owner.ts`, com WAHA e Redis de pé. É a **P0** da doutrina e está em `FORA_DO_CI`. A recusa da spec é correta: protege dados de uma instalação real | medido |

**Skipped e did not run:** os de `vps-fresh-onboarding` e `relogio-http-cron-externo` acompanham a falha anterior do mesmo arquivo (itens 14 e 15). Os de `acervo-de-conhecimento`, `agenda-*-google`, `cadastro-sem-confirmacao-de-email` e `inbox-responder-citando` não foram investigados — provavelmente são skips declarados nas próprias specs (hipótese). A distribuição por spec está na matriz da seção 1.1.

### `test:unit` (6 casos)

| Arquivo | Classe | Possível solução | Base |
|---|---|---|---|
| `lgpd-pdf-meet` (3), `lgpd-pdf-replies` (1) | L | Registrado como `pdfjs ... trailing slash`: caminho de fontes com barra no Windows. Rodar no WSL/Linux ou no CI; ou ajustar o caminho nos testes | registro anterior, **não remedido** |
| `rascunho-superado-nao-e-regravado` (1), `suporte-cobertura-de-efeitos` (1) | L | Registrado como separador `\` de caminho: a varredura compara caminhos com `/`. Normalizar o separador nos testes ou rodar no Linux | registro anterior, **não remedido** |

Os 4 arquivos falham de forma idêntica na `develop` limpa, segundo as anotações do ambiente; a confirmação definitiva é o job `verify` do CI Linux.

### `test:shell` (1 prova)

| Prova | Classe | Possível solução | Base |
|---|---|---|---|
| `.env continua 600 (só o dono lê)` | L | NTFS não guarda permissão POSIX (`chmod 600` → `stat` devolve `644`). Rodar no WSL/Linux ou no CI. Não é defeito do kit | medido |

### Leitura do conjunto

Das 15 falhas do E2E, por classe: **2 limitação do Windows** (10, 14) · **4 precondição de ambiente ou de dado** (4, 5, 13, 15) · **3 dependência de ordem** (2, 6, 7) · **2 provável precondição ainda não provada** (11, 12) · **3 causa desconhecida** (1, 3, 9) · **1 candidato direto a defeito de produto** (8). Somam 15.

Além dessas, **51 specs nem carregaram** no Windows por causa do `npx` (seção 6). Reexecutar nas condições do CI — Linux, `INTERNAL_AGENT_RUN_STUB=true`, seeds rodados, banco fresco para a `vps-fresh-onboarding` — é o passo que separa ambiente de defeito. Só depois dele a lista de defeitos reais fica confiável.

## 8. E2E — todos os testes executados (169)

Legenda: ✅ passou · ❌ falhou · ⏭️ skipped ou não rodou (o relatório do Playwright junta os dois com `-`; o resumo disse 8 skipped e 13 did not run).

### `acervo-de-conhecimento.spec.ts` — 2 ✅ 0 ❌ 4 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 163 | acervo de conhecimento › sem chave de embedding, a tela DIZ — e oferece o conserto ali mesmo | 781ms |
| ✅ | 179 | acervo de conhecimento › cadastrar material sem chave: ele fica ESPERANDO, e a tela não mente | 6.4s |
| ⏭️ | 227 | acervo de conhecimento › com a chave cadastrada pela tela, perguntas e respostas viram trecho buscável |  |
| ⏭️ | 259 | acervo de conhecimento › documento enviado como arquivo também vira trecho — não só pergunta e resposta |  |
| ⏭️ | 286 | acervo de conhecimento › o assistente ESCOLHE o que lê, e a escolha é dele — não do primeiro da organização |  |
| ⏭️ | 314 | acervo de conhecimento › acervo que nenhum assistente lê é DITO — dinheiro gasto sem efeito era invisível |  |

### `agenda-caminho-ate-os-horarios.spec.ts` — 2 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 62 | o endereço da aba de Atendimento abre nela, e ela se anuncia como o lugar dos horários | 2.3s |
| ✅ | 92 | um endereço de aba desconhecido cai na aba padrão, não numa tela vazia | 2.1s |

### `agenda-conectar-google.spec.ts` — 1 ✅ 0 ❌ 1 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 91 | conectar a agenda do Google › sem chave do Google, a Agenda abre e explica o que falta | 1.0s |
| ⏭️ | 126 | conectar a agenda do Google › conectar a agenda do Google pela tela e ver a faixa mudar |  |

### `agenda-google-volta-do-consentimento.spec.ts` — 2 ✅ 0 ❌ 1 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 75 | a volta do consentimento do Google chega ao sistema › o callback não é mais barrado pelo proxy antes de existir | 68ms |
| ⏭️ | 98 | a volta do consentimento do Google chega ao sistema › a ida emite o vínculo, e a volta com ele é reconhecida |  |
| ✅ | 155 | a volta do consentimento do Google chega ao sistema › volta SEM o vínculo é recusada — a proteção não sumiu junto com o 401 | 24ms |

### `agenda-google-volta-nao-desloga.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 97 | voltar do consentimento não manda a pessoa para o /login | 1.8s |

### `agenda-kit-visual.spec.ts` — 20 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 159 | kit visual da Agenda › a grade troca de visão pelo clique, e cada visão desenha o que promete | 1.0s |
| ✅ | 180 | kit visual da Agenda › a régua do agora cai no minuto certo, medida em pixels | 408ms |
| ✅ | 190 | kit visual da Agenda › a coluna de horários NÃO está lá, e entra quando o dia é escolhido | 835ms |
| ✅ | 242 | kit visual da Agenda › quem pediu para não receber mensagem: marca igual, mas a tela avisa ANTES | 857ms |
| ✅ | 272 | kit visual da Agenda › e quem aceita mensagem NÃO vê o aviso | 684ms |
| ✅ | 283 | kit visual da Agenda › dia sem horário nasce apagado e não aceita clique | 489ms |
| ✅ | 292 | kit visual da Agenda › filtrar por pessoa isola a agenda dela — e só a dela | 451ms |
| ✅ | 316 | kit visual da Agenda › dois agendamentos no mesmo horário dividem a largura — nenhum some atrás do outro | 444ms |
| ✅ | 352 | kit visual da Agenda › ocupação vinda do Google é ocupação, não agendamento: não abre | 378ms |
| ✅ | 380 | kit visual da Agenda › as oito trilhas passam em contraste e são distinguíveis — nos DOIS temas | 457ms |
| ✅ | 418 | kit visual da Agenda › controle que promete ação ou FAZ, ou está desabilitado com o motivo | 1.1s |
| ✅ | 450 | kit visual da Agenda › o NÚMERO que a tela afirma é o número que a tela mede | 707ms |
| ✅ | 492 | kit visual da Agenda › a data em pt-br não maiúscula a preposição | 542ms |
| ✅ | 507 | kit visual da Agenda › o histórico separa as quatro abas, e cancelado NÃO aparece em próximos | 2.6s |
| ✅ | 535 | kit visual da Agenda › o histórico não oferece ação que não pode cumprir | 522ms |
| ✅ | 551 | kit visual da Agenda › o passado registra o desfecho — senão `realizado` e `faltou` ficam sem escritor | 534ms |
| ✅ | 575 | kit visual da Agenda › a tela distingue “não publiquei horário” de “não tenho vaga” | 414ms |
| ✅ | 603 | kit visual da Agenda › o dia apagado diz POR QUÊ, e não só que está apagado | 380ms |
| ✅ | 638 | kit visual da Agenda › o que a API conta além dos slots chega à tela | 367ms |
| ✅ | 653 | kit visual da Agenda › evidência visual: claro, escuro e celular | 2.9s |

### `agenda-ocupacao-do-google-no-historico.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 86 | a ocupação do Google não oferece Remarcar nem Cancelar no histórico | 2.7s |

### `agenda-tela-do-produto.spec.ts` — 7 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 38 | a Agenda como o dono do produto a usa › chego na Agenda CLICANDO no menu, não digitando a URL | 3.0s |
| ✅ | 57 | a Agenda como o dono do produto a usa › as pessoas da equipe são REAIS — o filtro deixou de ser invisível | 839ms |
| ✅ | 120 | a Agenda como o dono do produto a usa › o histórico está NA TELA DO PRODUTO, com as quatro abas | 80ms |
| ✅ | 130 | a Agenda como o dono do produto a usa › a tela declara de onde veio o que ela mostra — e nunca de mentira | 17ms |
| ✅ | 157 | a Agenda como o dono do produto a usa › as três visões desenham, e a régua do agora existe — NO PRODUTO | 375ms |
| ✅ | 189 | a Agenda como o dono do produto a usa › o filtro por pessoa ISOLA de verdade — clicando, no produto | 305ms |
| ✅ | 216 | a Agenda como o dono do produto a usa › evidência visual da tela do produto | 656ms |

### `agenda-ver-na-agenda.spec.ts` — 0 ✅ 1 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ❌ | 64 | marcar, clicar em 'Ver na agenda', e ENCONTRAR o compromisso na grade | 126ms |

### `agente-novo-e-uso.spec.ts` — 4 ✅ 1 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 44 | Criar um agente pela tela › o formulário abre e diz o que falta antes de deixar criar | 3.8s |
| ✅ | 69 | Criar um agente pela tela › preencho como uma pessoa faria e o agente nasce, com as capacidades que liguei | 23.2s |
| ✅ | 132 | Criar um agente pela tela › a tela oferece caminho para o que ela exige, sem exigir que o usuário adivinhe | 27.7s |
| ✅ | 164 | Olhar o consumo de IA › a tela mostra os números do período e nomeia o que eles são | 30.6s |
| ❌ | 189 | Olhar o consumo de IA › um período sem nenhum dado é explicado, não fica em branco | 10.7m |

### `auth.spec.ts` — 4 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 5 | auth flow › anon GET /app/inbox redirects to /login | 815ms |
| ✅ | 12 | auth flow › invalid login shows error | 2.2s |
| ✅ | 22 | auth flow › login form is keyboard navigable in tab order | 527ms |
| ✅ | 34 | auth flow › login page has no serious or critical a11y violations | 869ms |

### `cadastro-sem-confirmacao-de-email.spec.ts` — 0 ✅ 1 ❌ 1 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ❌ | 98 | ⭐ o cadastro não manda esperar um e-mail que não vai chegar | 0ms |
| ⏭️ | 141 | ⭐ quem se cadastra POR UM CONVITE vai aceitá-lo, não abrir empresa própria |  |

### `central-avisos-resolver-em-lote.spec.ts` — 2 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 111 | um clique fecha os abertos da minha organização e não encosta na vizinha | 2.6s |
| ✅ | 141 | em espanhol, o título do aviso continua o que foi gravado (issue #603) | 2.3s |

### `central-de-avisos-capacidades.spec.ts` — 0 ✅ 2 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ❌ | 57 | Central de avisos — o atendimento que saiu sem as ferramentas › o aviso aparece, em português de gente, com o motivo técnico junto | 31.4s |
| ❌ | 100 | Central de avisos — o atendimento que saiu sem as ferramentas › o aviso é acionável: dá para resolver e ele sai da lista de abertos | 31.4s |

### `credenciais-de-ia.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 12 | Chaves de acesso à IA › [P0] chave inválida vira frase legível, e a tela diz onde pegar outra | 4.5s |

### `error-pages.spec.ts` — 7 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 4 | error pages › /404 renders PT-BR copy | 338ms |
| ✅ | 11 | error pages › /403 renders sem permissão | 321ms |
| ✅ | 16 | error pages › /500 renders erro interno | 308ms |
| ✅ | 21 | error pages › /503 renders manutenção | 310ms |
| ✅ | 38 | documentos legais › /legal/terms abre SEM sessão — é o que o aceite do onboarding linka | 329ms |
| ✅ | 46 | documentos legais › /legal/privacy abre SEM sessão e nomeia o responsável | 322ms |
| ✅ | 56 | documentos legais › o vizinho de /legal continua fechado — a liberação é dos dois, não do prefixo | 358ms |

### `followup-linguagem.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 84 | construtor de follow-up — a tela não fala em código (W2-LINGUAGEM) › nenhum valor de wire e nenhum UUID aparecem no painel de nenhum tipo de nó | 5.0s |

### `followup-publicado-abre-no-construtor.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 77 | o fluxo publicado por fora do construtor abre com os nós que estão no ar | 1.8s |

### `i18n-espanhol-na-tela.spec.ts` — 0 ✅ 1 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ❌ | 282 | o idioma escolhido chega à tela › espanhol cobre a interface, e o português volta byte a byte | 45.0s |

### `icone-da-marca.spec.ts` — 3 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 20 | o ícone e o título carregam a marca da instalação › GET /icon responde imagem para quem não entrou | 536ms |
| ✅ | 38 | o ícone e o título carregam a marca da instalação › o <head> do login declara o ícone — é o que mata o pedido a /favicon.ico | 463ms |
| ✅ | 51 | o ícone e o título carregam a marca da instalação › o título da aba herda a marca resolvida, e é a MESMA que a tela mostra | 426ms |

### `inbox-abas-espelham-o-comando.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 146 | Inbox: as abas perguntam quem manda › Fila mostra só quem espera uma PESSOA; Automático mostra o que o robô conduz | 4.3s |

### `inbox-responder-citando.spec.ts` — 0 ✅ 0 ❌ 2 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ⏭️ | 73 | responder citando › o botão de responder revela a faixa, e o × a desfaz |  |
| ⏭️ | 99 | responder citando › trocar de conversa LIMPA a citação |  |

### `inbox-scope.spec.ts` — 3 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 32 | G4-02 — inbox com escopo › agent em modo own*: vê Minhas e Fila, NÃO vê Todas | 1.3s |
| ✅ | 41 | G4-02 — inbox com escopo › manager: vê a visão Todas | 1.4s |
| ✅ | 48 | G4-02 — inbox com escopo › deep-link para conversa fora do escopo → estado vazio claro (sem stack trace) | 2.6s |

### `inbox-tempo-real.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 164 | inbox em tempo real › mensagem que chega aparece na conversa aberta, sem recarregar | 5.6s |

### `interface-por-vinculo.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 33 | interface por membro atualiza ao vivo, preserva formulário e convite aplica seleção | 17.9s |

### `mfa-opcional.spec.ts` — 4 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 88 | a verificação em duas etapas é escolha, não imposição › admin entra no sistema sem ser parado | 888ms |
| ✅ | 94 | a verificação em duas etapas é escolha, não imposição › e a tela de Segurança oferece LIGAR — antes isso era inalcançável | 1.2s |
| ✅ | 115 | a verificação em duas etapas é escolha, não imposição › o admin pode EXIGIR da equipe — e a exigência pega de verdade | 2.2s |
| ✅ | 140 | a verificação em duas etapas é escolha, não imposição › desligar a exigência devolve o acesso | 816ms |

### `moeda-da-organizacao.spec.ts` — 1 ✅ 1 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 59 | moeda da organização › mudar para peso mexicano persiste depois de recarregar | 3.5s |
| ❌ | 87 | moeda da organização › produto em peso mexicano mostra o preço na convenção do México | 5.2m |

### `navegacao.spec.ts` — 12 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 85 | navegação agrupada › o sidebar tem hierarquia: grupos na ordem de uso | 2.6s |
| ✅ | 105 | navegação agrupada › chega nas Etapas do funil pelo CRM, sem passar por Configurações | 9.6s |
| ✅ | 134 | navegação agrupada › e Produtos, que saiu do menu, continua alcançável pelo mesmo hub | 29.2s |
| ✅ | 148 | navegação agrupada › e a lista de funis é o item vizinho, com nome próprio | 30.1s |
| ✅ | 155 | navegação agrupada › chega em Conhecimento, que só existia atrás das abas de IA | 30.5s |
| ✅ | 177 | navegação agrupada › chega ao canal oficial pelo grupo Canais, não por Configurações | 29.5s |
| ✅ | 185 | navegação agrupada › o ⌘K acha o canal oficial por nome, mesmo sem tela própria | 28.7s |
| ✅ | 195 | navegação agrupada › ⌘K abre, filtra e navega | 30.5s |
| ✅ | 220 | navegação agrupada › nenhum grupo fica fora da dobra, e em 900px o menu não rola | 29.5s |
| ✅ | 284 | navegação agrupada › mobile › em 390px, o sidebar vira gaveta e não cria overflow horizontal | 30.6s |
| ✅ | 310 | navegação agrupada › Configurações fica fixo no rodapé, fora da área que rola | 29.1s |
| ✅ | 327 | navegação agrupada › um agent não vê o cabeçalho de um grupo que a permissão esvaziou | 1.2s |

### `notificacoes-diz-o-que-falta.spec.ts` — 2 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 103 | Notificações — a tela conta a verdade sobre esta instalação › sem o par VAPID, a tela diz o que falta e o que fazer — e não fica muda | 2.3s |
| ✅ | 144 | Notificações — a tela conta a verdade sobre esta instalação › sem VAPID a tela mantém o controle de Push e explica por que ele está travado | 1.8s |

### `olhar-telas-do-epico.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 65 | as telas do épico abrem para uma pessoa › cada tela abre, tem conteúdo e não cospe erro no console | 47.3s |

### `organizacoes-criacao-convite-e-cache.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 32 | org única oferece criação, responsável aceita e A→B→A não mistura inbox | 21.4s |

### `password-recovery.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 65 | recuperar senha: forgot → e-mail → nova senha → login com a nova | 2.6s |

### `pre-go-live-whatsapp.spec.ts` — 0 ✅ 1 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ❌ | 9 | admin configura testes, remove número, confirma abertura e volta a restringir | 183ms |

### `primeiro-acesso-sem-organizacao.spec.ts` — 6 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 126 | conta confirmada e sem organização › ⭐ a porta do onboarding leva à saída, e não de volta ao login | 1.1s |
| ✅ | 135 | conta confirmada e sem organização › ⭐ a porta do welcome (o layout) leva ao mesmo lugar | 1.2s |
| ✅ | 143 | conta confirmada e sem organização › ⭐ /app/inbox sem organização leva direto à saída, sem mostrar um app vazio | 1.5s |
| ✅ | 153 | conta confirmada e sem organização › ⭐ a recuperação CONCLUI: informa o nome e sai para o onboarding | 1.5s |
| ✅ | 188 | CONTROLE — quem já tem organização não é mandado para a saída › ⭐ digitar /get-started com organização ativa devolve ao app | 1.9s |
| ✅ | 198 | CONTROLE — quem já tem organização não é mandado para a saída › o onboarding de quem tem organização NÃO cai no /get-started | 1.8s |

### `prova-painel-provedores.spec.ts` — 5 ✅ 3 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 60 | F0/F1 — o painel abre agrupado, explica os pontos e diz a origem | 3.1s |
| ✅ | 92 | F1 — ponto fixo mostra a RAZÃO, não um cadeado mudo | 30.1s |
| ❌ | 104 | F3 — a OpenRouter é oferecida e seus modelos estão no seletor | 36.0s |
| ❌ | 122 | F1 — trocar o modelo GRAVA, e a tela passa a mostrar o novo | 1.5m |
| ✅ | 153 | F1/F3 — a catraca RECUSA modelo sem ferramentas no ponto que cria o lead | 4.2s |
| ✅ | 166 | F2 — a tela de execuções abre e responde 'está tudo bem?' | 15.3s |
| ✅ | 176 | as duas telas têm porta na navegação — pelo hub de IA | 29.6s |
| ❌ | 188 | instalação sem agente publicado: os dois pontos principais são EDITÁVEIS | 30.7s |

### `qa-selo-no-funil-usado.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 52 | QA — o selo de autoria com o funil já vivido › quantos selos o dono vê depois de algumas semanas de uso | 3.9s |

### `relogio-http-cron-externo.spec.ts` — 0 ✅ 1 ❌ 1 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ❌ | 238 | Relógio HTTP — a batida de um cron externo faz o follow-up andar › segredo errado é recusado — e o relógio NÃO anda | 71ms |
| ⏭️ | 256 | Relógio HTTP — a batida de um cron externo faz o follow-up andar › ⭐ com o segredo certo, as batidas movem o enrollment até o fim |  |

### `reset-password-mfa.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 50 | reset de senha com MFA pede o código TOTP e conclui | 1.3s |

### `signup-journey.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 17 | criar conta: signup → e-mail de confirmação → onboarding → re-login | 1.9s |

### `smoke.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 3 | home returns 200 and no console errors | 519ms |

### `suporte-temporario.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 23 | suporte mantém identidade, opera B e encerra sem misturar A; readonly/expiração/revogação são reais | 43.9s |

### `vps-fresh-onboarding.spec.ts` — 0 ✅ 1 ❌ 11 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ❌ | 142 | J1 — onboarding do dono numa instalação fresca › J1.2 senha errada → mensagem clara, sem stack | 0ms |
| ⏭️ | 150 | J1 — onboarding do dono numa instalação fresca › J1.1 login do bootstrap cai no wizard (org sem onboarded_at) |  |
| ⏭️ | 159 | J1 — onboarding do dono numa instalação fresca › J1.12 /app/inbox antes de concluir → volta pro onboarding |  |
| ⏭️ | 166 | J1 — onboarding do dono numa instalação fresca › J1.3 + J1.4 welcome: termos obrigatórios; salva nome/timezone e avança |  |
| ⏭️ | 188 | J1 — onboarding do dono numa instalação fresca › J1.5 WAHA ativo → QR code aparece de verdade |  |
| ⏭️ | 214 | J1 — onboarding do dono numa instalação fresca › J1.11 + J1.6 abandona e volta → retoma no step pendente; pular WhatsApp avança |  |
| ⏭️ | 227 | J1 — onboarding do dono numa instalação fresca › J1.7 setup IA: cria agente default e avança |  |
| ⏭️ | 291 | J1 — onboarding do dono numa instalação fresca › J1.24 ver ele atender: o wizard não termina sem mostrar o funcionário |  |
| ⏭️ | 313 | J1 — onboarding do dono numa instalação fresca › J1.8 convite SEM Resend: a UI não pode mentir que enviou email |  |
| ⏭️ | 340 | J1 — onboarding do dono numa instalação fresca › J1.9 done → onboarded_at setado e cai no inbox |  |
| ⏭️ | 352 | J1 — onboarding do dono numa instalação fresca › J1.10 verificação em duas etapas: ativa pela tela e VÊ os códigos de recuperação |  |
| ⏭️ | 427 | J1 — onboarding do dono numa instalação fresca › J1.13 wizard não reabre depois de concluído |  |

### `wizard-do-funcionario.spec.ts` — 13 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 94 | o wizard monta um funcionário › abre mostrando o que a instalação já trouxe, e não pede o nome de novo | 1.0s |
| ✅ | 109 | o wizard monta um funcionário › o aceite de termos leva a documentos que EXISTEM | 152ms |
| ✅ | 117 | o wizard monta um funcionário › o nome do negócio chega ao cabeçalho do passo seguinte | 1.4s |
| ✅ | 136 | o wizard monta um funcionário › o passo do telefone pergunta COMO se conecta antes de assumir o código | 1.4s |
| ✅ | 169 | o wizard monta um funcionário › o passo do telefone não expõe identificador interno nem enum | 1.8s |
| ✅ | 185 | o wizard monta um funcionário › treinar mostra o cérebro dele — e sem chave não é um beco | 1.1s |
| ✅ | 216 | o wizard monta um funcionário › treinar: pede as regras da casa e mostra o que ele já sabe fazer | 1.7s |
| ✅ | 260 | o wizard monta um funcionário › o quadro chega montado, venha da IA ou de um modelo pronto | 1.2s |
| ✅ | 295 | o wizard monta um funcionário › dá para trocar por um modelo pronto sem depender de IA nenhuma | 1.3s |
| ✅ | 309 | o wizard monta um funcionário › coluna sem nome barra o salvar, em vez de sumir calada | 1.9s |
| ✅ | 330 | o wizard monta um funcionário › salvar troca o funil de e-commerce e ENSINA o destino de cada coluna | 1.5s |
| ✅ | 370 | o wizard monta um funcionário › as regras da casa viraram memória da organização, não prompt do agente | 29ms |
| ✅ | 415 | o wizard monta um funcionário › o wizard termina apresentando o sistema, e o resumo não acusa passo inexistente | 2.2s |

### `agenda-google-meet.spec.ts` — 2 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 398 | marca Meet, copia link, autoriza em atendimento humano e entrega novamente após reabrir mesmo UUID | 26.6s |
| ✅ | 534 | falha chega à Central, navegação conserva aviso e retry humano mantém identidade do evento | 13.0s |

### `agenda-google-sync.spec.ts` — 2 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 229 | fontes e destino entre duas contas, somente leitura e ocupação imediatamente removida | 11.0s |
| ✅ | 339 | retry pela tela usa filtro PostgREST real; conflito exige escolha e conserva identidade antiga | 11.8s |

### `agenda-presenca-recuperacao.spec.ts` — 6 ✅ 1 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 278 | Inbox marca cliente/conversa; detalhe antigo confirma presença com evidência e snooze | 17.3s |
| ✅ | 360 | datas do compromisso seguem idioma e fuso próprios › PT e ES preservam a virada de dia e o instante da presença | 8.0s |
| ✅ | 467 | gestão configura prazos e gatilho; falta inicia uma vez e resposta interrompe | 15.8s |
| ✅ | 592 | falta sem configuração e contato ocupado deixam impedimento terminal visível | 10.4s |
| ❌ | 634 | receiver reconcilia inline/daemon, barra claim antigo e protege agenda além de mil linhas | 8.3s |
| ✅ | 912 | Radar recorta demandas pela RLS real, além do pool frio, e preserva gestão/suporte | 27.4s |
| ✅ | 1071 | duas sessões: remarcação não reautoriza cancelamento em rascunho | 9.0s |

### `autonomia-assistida.spec.ts` — 0 ✅ 1 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ❌ | 252 | testa sem enviar, pausa preserva publicação e duas aprovações entregam texto revisado sem silenciar assistência | 136ms |

### `central-avisos-destino.spec.ts` — 4 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 87 | agent abre contexto, volta ainda aberto, resolve e reabre; RLS e menu oculto | 14.5s |
| ✅ | 142 | manager: destinos conforme papel efetivo | 3.9s |
| ✅ | 142 | admin: destinos conforme papel efetivo | 6.4s |
| ✅ | 163 | viewer continua sem acesso à API Central e bearer não autentica | 1.7s |

### `encerramento-atendimento.spec.ts` — 2 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 20 | fechar canal preserva demanda, desfecho explícito e nova entrada volta à fila | 30.4s |
| ✅ | 245 | silêncio consulta proveniência real pelo PostgREST: legado e reabertura não viram nova autorização | 230ms |

### `roteamento-por-canal.spec.ts` — 1 ✅ 0 ❌ 0 ⏭️

| | Linha | Teste | Duração |
|---|---|---|---|
| ✅ | 105 | configura responsáveis por canal e o cron distribui sem misturar números | 12.5s |

