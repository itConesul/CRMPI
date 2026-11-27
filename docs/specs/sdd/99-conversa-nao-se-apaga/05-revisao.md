# 05 — Revisão e aprovação

## Decisões
Tomadas pelo dono do produto em 2026-11-24 e registradas na #99 pelo Sciuba:

| Data | Pergunta / mudança | Decisão | Onde |
|---|---|---|---|
| 2026-11-24 | Apagar contato com conversa (opções a/b/c) | **(b)**: 409 orientando a anonimizar. Contato sem conversa continua apagável | [#99, decisões](https://github.com/itConesul/CRMPI/issues/99#issuecomment-7132870076) |
| 2026-11-24 | Escopo da #99 (A, B+, C, D) | **B+**; exclusão lógica (D) em issue separada; RPC do contador (C) fora | idem |
| 2026-11-24 | Quem apaga contato | **Só `manager` ou `admin`.** Rota a `manager`, botão some para `agent`/`viewer`, teste de 403 | [#99, pedido da spec](https://github.com/itConesul/CRMPI/issues/99#issuecomment-7133157545) |
| 2026-11-24 | Mensagem do 409 | Orienta **pedir a um administrador**, não "anonimize": anonimizar exige `admin` (+ MFA) | idem |
| 2026-11-24 | Processo | A #99 ganha spec SDD própria, em PR de spec, **antes** de qualquer migration; T0 = prova do `viewer` e da sessão de suporte | idem |
| 2026-11-24 | **P1** — classificação do fragmento | **`impacto: exige_acao`**, que pela régua (`BUMP_DO_IMPACTO`) leva a um release **major** (hoje v1.23.7, viraria **2.0.0**; **a v1.24.0 saiu depois, em 2026-11-24 19:06, e o major continua sendo `2.0.0`**). Motivo: algo que existia sumiu, o direito de `agent` excluir contato. O fragmento traz "Requer atenção" avisando que `agent` e `viewer` perdem o botão e que apagar contato com conversa passa a ser recusado. O release major é decisão **já tomada** | [#99, P1 a P3](https://github.com/itConesul/CRMPI/issues/99#issuecomment-7135555771) |
| 2026-11-24 | **P2** — quem passa em "manager ou admin" | **Como medido na T0b** (`02-design.md` §1.3): membro `manager`/`admin` e sessão de suporte `full` (conta como `admin`) passam; suporte somente leitura e `platform admin` sem membership **não**, na rota e na tela. A tela espelha a rota e **não** soma `is_platform_admin` | idem |
| 2026-11-24 | **P3** — a #99 | **Fica aberta e é retitulada pelo Sciuba**, para dizer o que falta (o `UPDATE` direto em `conversations`). A spec e o PR de código citam **"Ref. #99"**, **nunca** "Closes" | idem |
| 2026-11-24 | **RF-4b** — contato com compromisso | **Confirmado.** Contato com compromisso e sem conversa continua **recusado**, como já é hoje; só a mensagem explica | [#105, confirmação](https://github.com/itConesul/CRMPI/pull/105#issuecomment-7135869227) |
| 2026-11-24 | Texto do 409 | **Único**: "conversas ou compromissos… peça a um administrador para anonimizá-lo" (não um texto por causa) | idem |
| 2026-11-24 | Comentário do baseline (`baseline.sql:15206-15207`) | **Corrigir só o texto**, na T3, **no PR de código** | idem |

## Perguntas ao revisor (todas decididas em 2026-11-24)
O enunciado original fica como histórico; a decisão está na tabela acima.

| # | Pergunta | Recomendação do autor | Decisão |
|---|---|---|---|
| P1 | O fragmento é `exige_acao` ou outro? **Correção registrada:** a pergunta original oferecia "`nada_mudou`/`alterado`", mas **`alterado` não é um `impacto`**: é uma **seção** do changelog. O enum é `nada_mudou \| capacidade_nova \| exige_acao` (`lib/release/fragmento.ts:26`). Não reutilizar a opção "alterado/minor" | `exige_acao` | ✅ **`exige_acao`** (major, 2.0.0) |
| P2 | `manager`+ inclui `platform admin` e sessão de suporte na tela? | Medido na T0b: suporte `full` passa; suporte só leitura e `platform admin` sem membership não. A tela espelha a rota | ✅ **como medido** |
| P3 | Quer que o título da #99 mude? | Retitular, para não fechar por engano | ✅ **a #99 fica aberta** e o Sciuba a retitula; "Ref. #99", nunca "Closes" |

## Comentários de review
Review do Sciuba em 2026-11-24 15:00, sobre `79b722f` (`CHANGES_REQUESTED`). **As threads não foram
resolvidas**: quem resolve é o revisor. Cada ponto aponta o commit que o cobre.

| Data | Revisor | Comentário | Resolução | Commit |
|---|---|---|---|---|
| 2026-11-24 | Sciuba | **1. "As duas únicas FKs `RESTRICT` para `contacts`" é falso**: `calendar_appointments.contact_id` é `RESTRICT`; contato **sem conversa e com compromisso** também recebe `23503`, e o 409 "tem conversas" seria falso | **Acatado e verificado.** Procedência do erro: meu `grep` casava só a forma com aspas do dump, não o apêndice. A lista agora sai do **catálogo** (3 FKs bloqueiam: `calendar_appointments`, `conversations`, `messages`). Provado no banco: contato só com compromisso é bloqueado pela FK; contato sem nada é apagado. §1.1 corrigida; **texto único** do 409 cobrindo conversa **ou** compromisso (RF-3); RF-4 passa a "sem conversa **e sem compromisso**"; **RF-4b** registra a regra proposta para o compromisso (**aguarda a sua confirmação**); CA-3b novo | `2b3de8e` |
| 2026-11-24 | Sciuba | **2. Quem escreve em `messages` com o cliente do usuário não foi enumerado**; pede T0c e teste de enviar, falhar e reenviar, inclusive sessão de suporte `full` | **Acatado.** T0c feita (`02-design.md` §1.4): só `POST /api/v1/messages` e o `deleteContactHandler` usam o cliente do usuário; o resto é admin/service role. **Fluxo de envio medido antes e depois** como `agent` e como suporte `full` (papel efetivo `admin`): tudo continua passando; `viewer` edita 0. RF-2b e CA-10 novos; o invariante (T1) incorpora os passos. Fica **NÃO VERIFICADO** apenas o cliente da importação de histórico (handler de worker) | `2b3de8e` |
| 2026-11-24 | Sciuba | Menor: §1.1 sobre as FKs, e CA-3/CA-4 com o caso do compromisso | **Acatado** (ver ponto 1) | `2b3de8e` |

Itens que **eu** achei ao responder, fora do que foi pedido:
- O comentário do baseline (`baseline.sql:15206-15207`, "as duas únicas FKs RESTRICT do schema") repete a
  frase falsa. Proposta na T3: corrigir só o texto. **Decisão do revisor.**
- Apagar contato **sem** conversa também leva em cascata 12 tabelas (notas, demandas, follow-ups…). Fora de
  escopo; anotado em `01-requisitos.md` e levado para a issue da D, a **[#116](https://github.com/itConesul/CRMPI/issues/116)**
  (aberta em 2026-11-24, T8). A segunda issue de seguimento (C / `UPDATE` direto) é a **própria #99**.

## Desvios registrados na implementação
Onde a implementação difere do que a spec dizia, corrigido em `02-design.md`/`04-tarefas.md` e listado aqui
(a spec e o código não divergem em silêncio). Nada abaixo muda o contrato aprovado: RF-1 a RF-7 e CA-1 a CA-10
seguem como estavam.

| # | Desvio | Por quê |
|---|---|---|
| D-1 | **Migration `0240`, não `0239`** (arquivo `20261126190000_0240_…`). | A `0239` foi tomada pelo #131 (T4a da #67, mergeado em `f9a79cf`). A spec já dizia "o próximo livre; confirmar na implementação". Corrigido em `02-design.md` §4 e `04-tarefas.md` T2 |
| D-2 | O predicado de papel mora num módulo compartilhado, `lib/contacts/pode-excluir-contato.ts` (`PAPEL_MINIMO_PARA_EXCLUIR_CONTATO` e `podeExcluirContato`), usado pela rota e pela tela. A spec dizia só "o mesmo predicado, via `useActiveOrg()` e `ROLE_RANK`, como `ChatThread`" | Dois lugares com a mesma regra é exatamente o risco "UI e rota divergirem de novo" (§7). Uma constante só, e o teste `contato-excluir-predicado.test.ts` prova que os dois a usam |
| D-3 | O e2e (T6) cobre `manager`, `agent` e `viewer`; **`admin` fica de fora** | O login do `admin` das credenciais de teste pede TOTP e não completa em sonda simples. O `admin` tem a regra do `manager` (`podeExcluirContato`), provada em unit. **NÃO provado pela tela** |
| D-4 | O e2e semeia contato, conversa e mensagem pelo cliente `service role` do supabase-js | Nada de nome de container fixo no spec. Não afeta o contrato |
| D-5 | **Texto do diálogo** ("Isso remove {nome}. Contato com conversas ou compromissos vinculados não pode ser excluído, para preservar o histórico: peça a um administrador para anonimizá-lo. Esta ação não pode ser desfeita.") e do 409 definidos e traduzidos para `es`; a chave antiga ("…conversa associada…") saiu do dicionário | A spec fixava o 409 e pedia "o diálogo deixa de dizer 'conversa associada'", sem o texto novo do diálogo |
| D-6 | O comentário do baseline ("as duas únicas FKs RESTRICT") foi corrigido **neste PR**, como a decisão de 2026-11-24 registrada acima; a migration `0177`, histórica, não foi editada | Cumpre a decisão. `apendice-do-baseline-nao-diverge-da-cadeia` segue verde |
| D-7 | **Risco novo:** a janela do `update.sh` com app antigo e banco novo derruba "Excluir contato" | Medido na T6; ver `02-design.md` §7 e o "Requer atenção" do fragmento |
| D-8 | A 1ª rodada do `test:db` (no commit T2) rodou 190 arquivos verdes e **um (`operador-le-o-turno-certo`) não iniciou o worker** ("Timeout waiting for worker"); passou sozinho (4 testes). **Rodada nova em `c45fcd9` (2026-11-27): 191 arquivos / 1537 testes verdes, saída 0, sem timeout.** `pnpm test:unit` completo no mesmo HEAD: 11 falhas em 5 arquivos, todas de ambiente da máquina e não de código (6 só do Windows: `lgpd-pdf-meet` 3, `lgpd-pdf-replies` 1, `rascunho-superado-nao-e-regravado` 1, `suporte-cobertura-de-efeitos` 1; 5 de `rate-limit.test.ts`, que passam 5/5 sem o `UPSTASH_*` do `.env.local`) | Falha de infraestrutura da máquina, não de código. A rodada nova é a que vale; a antiga fica registrada como estava |
| D-9 | **`abrirLista` do e2e (T6) passa a esperar a RESPOSTA da busca filtrada, e os dois casos que clicam em "Excluir" confirmam o diálogo aberto antes.** Acrescentado depois do 1º CI do #140. (Uma 1ª tentativa, um helper que reclicava até o diálogo abrir, foi **desfeita**: tratava a causa errada e falhava 1 de 8 numa sonda.) | No CI o caso do 409 falhou uma vez. **Mecanismo provado:** a busca da tela tem debounce de 250 ms e, ao mudar o termo, `isLoading` desmonta a tabela (`app/app/contacts/_client.tsx`, `isLoading ? <Skeleton/> : <ContactsTable/>`), e o estado do diálogo vive nela. O contato novo já aparece na lista sem filtro, então "esperar a linha" deixava o clique cair antes da troca. Evidência: (a) trace do CI, snapshot do instante do clique = 1 linha, snapshot logo depois = 0 linhas e Skeleton, sem diálogo; a busca filtrada começa ~92 ms **depois** do clique; (b) sonda local: clicar logo após preencher perde o diálogo 6/6, esperar a resposta filtrada o mantém 6/6. **Não provado:** que o spec original falhe localmente (48/48 passaram, também com CPU 8× mais lenta); a ligação com o CI é o trace, não uma reprodução. Versão nova: 48/48 (6 casos × 8). **Fora do #99, fica a observação de produto:** quem clica na lixeira nos primeiros ~250 ms depois de digitar a busca perde o diálogo |
| D-10 | **`contacts` também ganha a regra no banco (pedido do revisor no review do #140, 2026-11-27): a policy `tenant_isolation_contacts_all` (`FOR ALL`, só por organização) sai, `select`/`insert`/`update` ficam com a MESMA regra de antes e o `DELETE` passa a exigir `manager`+ (`contacts_delete_manager`).** Na mesma migration `0240` e no mesmo apêndice do baseline; a spec aprovada só tratava `conversations` e `messages` no banco e `contacts` só na rota. | O Sciuba mediu pelo texto do schema que "só gerente exclui contato" valia só na rota: `authenticated` tem `GRANT ALL` em `contacts`, então `agent` e `viewer` apagavam, pelo PostgREST, contato sem conversa e sem compromisso (com cascata de notas, demandas e follow-ups). **Reproduzido antes de corrigir** (CA-11: 3 casos vermelhos; `agent` apagou 1 linha onde se esperava 0) e **provado depois** (34/34 em install e update do baseline). Sabotagens: reinserir a `FOR ALL` ao lado da nova reabre o `DELETE` (policies permissivas somam por OU) e os mesmos 3 casos falham; afrouxar o limite para `agent` faz o caso do `agent` falhar. `fn_is_platform_admin()` segue passando, como em todas as policies do schema; a sessão de suporte `full` entra como `admin` (caso próprio). O nome `tenant_isolation_<t>_all` deixa de valer para esta tabela, de propósito. O fragmento `.changes/` também mudou (título e texto, 2º pedido do mesmo review) |

### Observações para o revisor (não são desvios; o comportamento é o da spec aprovada)
- **Texto único do 409.** Qualquer `23503` no `DELETE` de contato mostra "tem conversas ou compromissos vinculados" (`_handler.ts`, `throwOnDbError`). A spec escolheu o texto único porque a saída é a mesma (anonimizar). Se um dia surgir outra FK `RESTRICT` em `contacts`, a mensagem passa a descrever mal a causa.
- **Administrador de plataforma.** As policies `messages_update`/`messages_delete` e a nova `contacts_delete_manager` deixam `fn_is_platform_admin()` passar, como as demais policies do schema. A rota `DELETE /contacts/[id]` e o botão usam só o papel na organização ativa, então o platform admin sem membership recebe 403 ali. O banco é mais permissivo que a rota; a spec não pediu alinhar.
- **Não quebra outros fluxos (medido por leitura do código em 2026-11-27):** nada no app apaga `conversations` com o client do usuário; o único `update`/`delete` de `messages` com o client do usuário (`app/api/v1/messages/_handler.ts`) está na rota de envio, que já exige `agent` e conversa visível; workers, cron e ingest usam client admin; `messages.conversation_id` é `NOT NULL`.

## Aprovação
- [x] **Aprovada por:** Sciuba em 2026-11-24 — implementação liberada. `APPROVED` sobre `d949618` no PR #105
  (mergeado em `6149baa`). Condições do revisor para o PR de código: **seguir a spec à risca**, rodar
  **`pnpm test:db` completo** e **provar pela tela** que `agent` e `viewer` não veem o botão "Excluir contato".
  O PR de código cita "Ref. #99", nunca "Closes".
