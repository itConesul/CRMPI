# 05 — Revisão e aprovação

## Decisões
| Data | Pergunta / mudança | Decisão | Quem |
|---|---|---|---|
| 2026-11-19 | D-1 · Como conduzir a issue (base, formato, branch) | Seguir o que o projeto já tem: base `develop`, pasta SDD de 6 arquivos, branch `docs/sdd-69-...`. | cMoreiraSul (autor da spec, no chat) |
| 2026-11-19 | D-2 · Ambiguidade de menção | O autocomplete **lista os membros para o usuário selecionar** (origem de RF-2 e RF-4). A medição em `02-design.md` §1 mostrou que o token por nome falha para alguns nomes; a spec responde com a queda para `@<user_id>` (Q1, decidida abaixo). | cMoreiraSul (autor da spec, no chat) |
| 2026-11-19 | Q1 · token `@<user_id>` para quem não tem token por nome | **Sim**, como proposto. | cMoreiraSul (chat: "aprovado com as propostas") · **confirmada pelo Sciuba (dono do produto) em 2026-11-23, no review do PR #89** |
| 2026-11-19 | Q2 · listar o próprio autor | **Não**, como proposto. | cMoreiraSul (idem) · confirmada pelo Sciuba em 2026-11-23 |
| 2026-11-19 | Q3 · filtro ignora acentos | **Não**, como proposto (igual ao `TemplateMenu`; CA-4 permanece só com maiúsculas). | cMoreiraSul (idem) · confirmada pelo Sciuba em 2026-11-23 |
| 2026-11-19 | Q4 · destacar `@` no `NoteCard` | **Fora de escopo**, como proposto. | cMoreiraSul (idem) · confirmada pelo Sciuba em 2026-11-23 |

## Comentários de review
| Data | Revisor | Comentário | Resolução |
|---|---|---|---|
| 2026-11-23 | Sciuba (`CHANGES_REQUESTED`, review sobre `ec878e0`) | **Ajuste 1** — o CA-6 não garante "atinge o selecionado e nenhum outro": o parser também casa primeiro nome e parte local do e-mail. Pede `tokenDeMencao(membro, todos)` caindo para `@<user_id>` quando o token atingir outro membro, o caso de nome de uma palavra no CA-6 e o R4 declarando a colisão por e-mail. | Aplicado: RF-4 reescrito; `02-design.md` §2.4 (verificação contra `todos` pelo próprio parser), §1 (segunda medição: 0 falhas; controle sem verificação falha em "Ana"), R4 (a/b/c) e R7; CA-6 com "Ana" e a asserção do e-mail vazio; T1. **Achado novo:** `mencaoAtingeUsuario` devolve `false` com `email: ""` antes das regras de nome (`mentions.ts:14`) — o helper usa e-mail marcador. Commit: `16d632b` |
| 2026-11-23 | Sciuba | **Ajuste 2** — o que a lista mostra para quem não tem `full_name` (caminho degradado devolve `null` para todos); definir rótulo e acrescentar CA. | Aplicado: RF-7, `02-design.md` §2.6, R6, CA-12 (`03-testes.md`), T1/T3. Rótulo `Membro sem nome · <8 primeiros do user_id>`; aparece e é filtrável; token `@<user_id>`. Commit: `16d632b` |
| 2026-11-23 | Sciuba | **Ajuste 3** — README em `aprovada` com checklist vazio; Enter com lista aberta e sem resultado; o que fazer se a asserção do `href` do T5 falhar. | Aplicado: README `em-revisao`; RNF-1 e CA-13 (Enter sem resultado não envia nem insere; Esc/espaço fecham); T5 e CA-10 (não corrigir o handler; issue própria; RF-6 declarado não atendido). **Correção de passagem:** a spec dizia que o `TemplateMenu` tem ↑/↓/Enter-seleciona — não tem (é só de mouse); o teclado do `MentionMenu` é novo (`02-design.md` §1). Commit: `16d632b` |

## Aprovação
- [x] **Aprovada por:** cMoreiraSul, em 2026-11-19, no chat, com as propostas Q1–Q4 — implementação liberada após o merge do PR #89
- [x] **Confirmação do dono do produto (Sciuba):** `APPROVED` em 2026-11-23 no PR #89, sobre `eaa57bf`. Ele conferiu os três ajustes (`16d632b`) contra o código e confirmou Q1–Q4.
- [x] **Merge:** PR #89 mergeado na `develop` em 2026-11-23 20:49 UTC, merge commit `9defd7b`. Os 6 arquivos desta pasta estão na `develop`.
- **Estado do README:** `aprovada`. O `04-tarefas.md` pode começar. Ao entrar na implementação o estado passa a `implementando`.

## Pendências registradas na aprovação
- **Fora deste PR — issue própria (ainda não aberta):** o possível vazamento do `body_preview` da nota a um `viewer` (`emitirMencoesDaNota` não filtra por papel). Segundo o Sciuba, **não está confirmado**. Tem a mesma raiz de R4(c) em `02-design.md` §7.
