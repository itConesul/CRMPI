# 05 — Revisão e aprovação

## Decisões
| Data | Pergunta / mudança | Decisão | Quem |
|---|---|---|---|
| 2026-11-19 | D-1 · Como conduzir a issue (base, formato, branch) | Seguir o que o projeto já tem: base `develop`, pasta SDD de 6 arquivos, branch `docs/sdd-69-...`. | cMoreiraSul (autor da spec, no chat) |
| 2026-11-19 | D-2 · Ambiguidade de menção | O autocomplete **lista os membros para o usuário selecionar** (origem de RF-2 e RF-4). A medição em `02-design.md` §1 mostrou que o token por nome falha para alguns nomes; a spec responde com a queda para `@<user_id>` (Q1, decidida abaixo). | cMoreiraSul (autor da spec, no chat) |
| 2026-11-19 | Q1 · token `@<user_id>` para quem não tem token por nome | **Sim**, como proposto. | cMoreiraSul (chat: "aprovado com as propostas") — **confirmação do dono do produto pendente no PR #89** |
| 2026-11-19 | Q2 · listar o próprio autor | **Não**, como proposto. | cMoreiraSul (idem) — confirmação do dono do produto pendente |
| 2026-11-19 | Q3 · filtro ignora acentos | **Não**, como proposto (igual ao `TemplateMenu`; CA-4 permanece só com maiúsculas). | cMoreiraSul (idem) — confirmação do dono do produto pendente |
| 2026-11-19 | Q4 · destacar `@` no `NoteCard` | **Fora de escopo**, como proposto. | cMoreiraSul (idem) — confirmação do dono do produto pendente |

## Comentários de review
| Data | Revisor | Comentário | Resolução |
|---|---|---|---|

## Aprovação
- [x] **Aprovada por:** cMoreiraSul, em 2026-11-19, no chat, com as propostas Q1–Q4 — implementação liberada após o merge do PR #89
- [ ] **Confirmação do dono do produto (Sciuba):** pendente no review do PR #89 (Q1–Q4 e os pontos de atenção do comentário)
