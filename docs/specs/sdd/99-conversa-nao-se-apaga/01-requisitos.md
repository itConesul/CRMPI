# 01 — Requisitos

## Problema
A #99 (T7 da spec da #70) registra que a policy `conversations_agent_update` deixa `agent`+ escrever
em `conversations` direto pelo PostgREST. A medição em banco (comentário de 2026-11-24:
https://github.com/itConesul/CRMPI/issues/99#issuecomment-7131640809) achou algo pior que o contador:
- `conversations_agent_delete` permite `agent`+ **apagar** a conversa, e o cascade apaga o histórico;
- `messages_update` e `messages_delete` exigem só pertencer à organização, então um `viewer` **edita e
  apaga** mensagens.

O dono do produto quer manter o log das conversas. As decisões estão nos comentários da #99:
[decisões 1 e 2](https://github.com/itConesul/CRMPI/issues/99#issuecomment-7132870076) e
[pedido da spec, com a regra nova](https://github.com/itConesul/CRMPI/issues/99#issuecomment-7133157545).

## Requisitos

| ID | Requisito | Origem |
|---|---|---|
| RF-1 | `authenticated` e `anon` **não têm** `DELETE` em `public.conversations`, e a policy `conversations_agent_delete` não existe. O `service_role` continua apagando (cron, workers, cascade de LGPD) | Decisão 2 (B+), 1º item |
| RF-2 | `messages_update` e `messages_delete` exigem `fn_role_at_least(organization_id, 'agent')` **e** conversa visível ao usuário (a mesma regra que `messages_select` já aplica). `fn_is_platform_admin()` segue passando | Decisão 2 (B+), 2º item |
| RF-3 | `deleteContactHandler` **não apaga** `messages` nem `conversations`. Tenta apagar o contato e, se o banco recusar por FK (`23503`), responde **409** `state_conflict` com mensagem que manda **pedir a um administrador para anonimizar** | Decisão 1 (b); comentário 13:39, itens 2 e "Verificado" |
| RF-4 | Contato **sem** conversa continua podendo ser apagado, com a auditoria `contact.deleted` de hoje | Decisão 1 (b) |
| RF-5 | **Só `manager` ou `admin` apagam contato.** `DELETE /api/v1/contacts/[id]` exige `manager`; `agent` e `viewer` recebem 403 `forbidden_role` | Comentário 13:39, item 3 |
| RF-6 | O botão "Excluir contato" (`ContactsTable.tsx`) **só aparece** para `manager`+, pela mesma regra da rota | Comentário 13:39, item 3 |
| RF-7 | O diálogo "Excluir contato?" deixa de prometer apagar "a conversa associada" e diz que contato com conversas não se exclui, orientando a anonimizar. Em pt-BR e es | Consequência do RF-3 |
| RNF-1 | Toda mudança de schema sai como migration versionada + apêndice idempotente no `baseline.sql` + linha no `MANIFEST.md` + invariante no `test:db` | Doutrina de migrations; comentário 13:39 |
| RNF-2 | **Nenhuma função nova**, coluna nova ou tabela nova. Logo não há `EXECUTE` a revogar (as duas origens, item 9 da doutrina, **não se aplicam**) | Comentário 13:39 |
| RNF-3 | O 409 não é mutação e **não** audita; o 403 já é auditado por `requireRole` (`authz.denied`) | CLAUDE.md, "Audit log" |

## Critérios de aceite
| ID | Critério | Cobre |
|---|---|---|
| CA-1 | **Dado** conversa de qualquer tipo (do titular, da fila), **quando** `viewer`, `agent`, `manager` ou `admin` tenta `DELETE`, **então** o banco nega (`permission denied`). **E** o `service_role` apaga 1 linha | RF-1 |
| CA-2 | `viewer` **não** edita nem apaga mensagem de conversa que enxerga (0 linhas), embora a leia. `agent`, `manager` e `admin` **continuam** editando e apagando mensagem de conversa visível. `agent` **não** edita nem apaga mensagem de conversa que não enxerga | RF-2 |
| CA-3 | `deleteContactHandler`, com contato que tem conversa: responde 409 `state_conflict`, mensagem contendo "administrador", **não** chama `delete` em `messages` nem em `conversations`, **não** audita | RF-3, RNF-3 |
| CA-4 | `deleteContactHandler`, com contato sem conversa: apaga **só** `contacts` e audita `contact.deleted`. Contato inexistente: 404 | RF-4 |
| CA-5 | `DELETE /api/v1/contacts/[id]` como `agent` → **403** `forbidden_role`, sem chamar o handler. Como `manager` → 204 | RF-5 |
| CA-6 | Na lista de contatos, o botão "Excluir contato" **não existe** no DOM para `agent` e `viewer`, e existe para `manager` e `admin`. Um `platform admin` **sem** membership na org **não** o vê (a rota o negaria; `02-design.md` §1.3) | RF-6 |
| CA-7 | O diálogo não contém "conversa associada"; a mensagem do 409 existe em `pt-BR` e `es` | RF-7 |
| CA-8 | `supabase/baseline.sql` aplica em modo install **e** update (`ON_ERROR_STOP=1`) sem erro, e re-aplicar a migration não muda nada | RNF-1 |
| CA-9 | O cascade de LGPD continua funcionando: anonimizar um contato com conversa funciona e **não** depende do `DELETE` do usuário | RF-1 |

## Fora de escopo
Da decisão do dono (#99):
- **Exclusão lógica (opção D)** — a conversa apagada some para quem apagou e continua para
  `manager`/`admin`. É funcionalidade nova, com colunas e mudança em `fn_can_view_conversation`. **Issue
  própria, ligada à #99.**
- **RPC do contador (opção C)** — fica de fora; a T1 da #70 continua como aprovada ("mudar o handler").

Acréscimos da spec, declarados porque o título da #99 sugere o contrário:
- **O `UPDATE` direto em `conversations` continua aberto.** `conversations_agent_update` não muda. Um
  `manager` ainda zera `unread_count_for_assignee` do titular direto no banco, e um `agent` ainda toma a
  conversa do titular em `visibility_mode=all`. Medido (comentário de 2026-11-24). **A #99 não fecha com
  esta spec**: o que sobra vai para C/D.
- `INSERT` em `conversations` e em `messages`.
- Anonimizar: a rota, a função `fn_lgpd_anonymize_contact` e o MFA **não mudam**.
- Modo `none` de visibilidade e sessão de suporte além do que foi medido (ver `02-design.md` §1.2).
- Apagar contato em lote: não existe hoje (`useDeleteContact` só é usado em `ContactsTable.tsx`).
