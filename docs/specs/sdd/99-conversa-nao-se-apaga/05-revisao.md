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

## Perguntas ao revisor
| # | Pergunta | Recomendação do autor |
|---|---|---|
| P1 | O fragmento é `exige_acao` (a régua trata "algo que existia mudou de forma" assim) ou `nada_mudou`/`alterado`? O primeiro implica um release **major** | Seguir a letra da régua: `exige_acao`, com "Requer atenção". É o dono do release quem decide. **Versão em vigor: v1.23.7**; pela régua, `exige_acao` levaria a `2.0.0` |
| P2 | `manager`+ inclui `platform admin` e sessão de suporte na tela? | **Medido (T0b, `02-design.md` §1.3):** sessão de suporte `full` conta como `admin` e passa; suporte só leitura e `platform admin` sem membership **não** passam. A tela espelha a rota e **não** soma `is_platform_admin`. Confirme que é isso que se quer |
| P3 | Quer que o título da #99 mude? Ela nasceu como "`agent`+ faz `UPDATE` direto", e o `UPDATE` **segue aberto** neste escopo | Retitular ou deixar a #99 aberta até C/D, para não fechar por engano |

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
  escopo; anotado em `01-requisitos.md` para a issue da D.

## Aprovação
- [ ] **Aprovada por:** <nome> em <AAAA-MM-DD> — implementação liberada
