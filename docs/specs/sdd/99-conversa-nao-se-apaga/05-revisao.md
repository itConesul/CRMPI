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

## Aprovação
- [x] **Aprovada por:** Sciuba em 2026-11-24 — implementação liberada. `APPROVED` sobre `d949618` no PR #105
  (mergeado em `6149baa`). Condições do revisor para o PR de código: **seguir a spec à risca**, rodar
  **`pnpm test:db` completo** e **provar pela tela** que `agent` e `viewer` não veem o botão "Excluir contato".
  O PR de código cita "Ref. #99", nunca "Closes".
