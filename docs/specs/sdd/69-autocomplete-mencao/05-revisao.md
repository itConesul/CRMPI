# 05 — Revisão e aprovação

## Decisões
| Data | Pergunta / mudança | Decisão | Quem |
|---|---|---|---|
| 2026-11-19 | D-1 · Como conduzir a issue (base, formato, branch) | Seguir o que o projeto já tem: base `develop`, pasta SDD de 6 arquivos, branch `docs/sdd-69-...`. | cMoreiraSul (autor da spec, no chat) |
| 2026-11-19 | D-2 · Ambiguidade de menção | O autocomplete **lista os membros para o usuário selecionar** (origem de RF-2 e RF-4). A medição em `02-design.md` §1 mostrou que o token por nome falha para alguns nomes; a spec responde com a queda para `@<user_id>` (Q1, decidida abaixo). | cMoreiraSul (autor da spec, no chat) |
| 2026-11-19 | Q1 · token `@<user_id>` para quem não tem token por nome | **Sim**, como proposto. | cMoreiraSul (chat: "aprovado com as propostas") — **confirmada pelo Sciuba (dono do produto) no review do PR #89, 2026-11-23** |
| 2026-11-19 | Q2 · listar o próprio autor | **Não**, como proposto. | cMoreiraSul (idem) — **confirmada pelo Sciuba no review do PR #89** |
| 2026-11-19 | Q3 · filtro ignora acentos | **Não**, como proposto (igual ao `TemplateMenu`; CA-4 permanece só com maiúsculas). | cMoreiraSul (idem) — **confirmada pelo Sciuba no review do PR #89** |
| 2026-11-19 | Q4 · destacar `@` no `NoteCard` | **Fora de escopo**, como proposto. | cMoreiraSul (idem) — **confirmada pelo Sciuba no review do PR #89** |

## Comentários de review
| Data | Revisor | Comentário | Resolução |
|---|---|---|---|
| 2026-11-23 | Sciuba (`CHANGES_REQUESTED`, review sobre `ec878e0`) | **Ajuste 1** — o CA-6 não garante "atinge o selecionado e nenhum outro": o parser também casa primeiro nome e parte local do e-mail. Pede `tokenDeMencao(membro, todos)` caindo para `@<user_id>` quando o token atingir outro membro, o caso de nome de uma palavra no CA-6 e o R4 declarando a colisão por e-mail. | Aplicado: RF-4 reescrito; `02-design.md` §2.4 (verificação contra `todos` pelo próprio parser), §1 (segunda medição: 0 falhas; controle sem verificação falha em "Ana"), R4 (a/b/c) e R7; CA-6 com "Ana" e a asserção do e-mail vazio; T1. **Achado novo:** `mencaoAtingeUsuario` devolve `false` com `email: ""` antes das regras de nome (`mentions.ts:14`) — o helper usa e-mail marcador. Commit: `16d632b` |
| 2026-11-23 | Sciuba | **Ajuste 2** — o que a lista mostra para quem não tem `full_name` (caminho degradado devolve `null` para todos); definir rótulo e acrescentar CA. | Aplicado: RF-7, `02-design.md` §2.6, R6, CA-12 (`03-testes.md`), T1/T3. Rótulo `Membro sem nome · <8 primeiros do user_id>`; aparece e é filtrável; token `@<user_id>`. Commit: `16d632b` |
| 2026-11-23 | Sciuba | **Ajuste 3** — README em `aprovada` com checklist vazio; Enter com lista aberta e sem resultado; o que fazer se a asserção do `href` do T5 falhar. | Aplicado: README `em-revisao`; RNF-1 e CA-13 (Enter sem resultado não envia nem insere; Esc/espaço fecham); T5 e CA-10 (não corrigir o handler; issue própria; RF-6 declarado não atendido). **Correção de passagem:** a spec dizia que o `TemplateMenu` tem ↑/↓/Enter-seleciona — não tem (é só de mouse); o teclado do `MentionMenu` é novo (`02-design.md` §1). Commit: `16d632b` |
| 2026-11-23 | Sciuba (`APPROVED`, 15:17Z, sobre `eaa57bf`) | "Conferi os 3 ajustes em `16d632b` contra o código" (`tokenDeMencao(membro, todos)`, rótulo e CA-12 do item sem `full_name`, README de volta a `em-revisao`); o achado do e-mail vazio (R7) "confere com `mentions.ts`". **Q1 a Q4 confirmadas como dono do produto.** Pede: ao implementar, mudar o README e seguir a ordem de `04-tarefas.md`; o possível vazamento do `body_preview` a um `viewer` (`emitirMencoesDaNota` não filtra por papel) **fica fora e vira issue própria**. | Aplicado: README em `implementando` (a spec está aprovada; o PR de código está aberto). O vazamento do `body_preview` está na [#120](https://github.com/itConesul/CRMPI/issues/120), aberta, e o código de `emitirMencoesDaNota` segue sem filtro por papel. PR #89 mergeado em `9defd7b`, 2026-11-23 20:49Z |

## Desvios registrados na implementação
A regra do `README` (passo 5 do fluxo) é: se a implementação descobrir que a spec está errada, corrigir a spec e seguir — spec e código não divergem em silêncio. Os pontos abaixo estão **corrigidos em `02-design.md` §3 e `01-requisitos.md`** e entram no review do PR de código.

| # | Desvio | Por quê |
|---|---|---|
| D-3 | `rotuloDoMembro(m, semNome?)` ganhou o 2º parâmetro opcional, e há `filtrarMembros(membros, consulta, semNome?)`. | Uma função pura em `lib/` não chama `useT`; o componente passa `t("Membro sem nome")`. Chamada com 1 argumento segue válida. |
| D-4 | O teclado é a função pura `teclaNoMenu(key, ativo, total)`, chamada pelo `Composer`; não é tratado dentro do `MentionMenu`. Também `inserirMencao(texto, trecho, token)` (a "troca de `[inicio, fim)`" da T2). | O foco fica no `<textarea>`: quem recebe as teclas é o `Composer`. O menu só mostra a lista e reage ao mouse. |
| D-5 | `MentionMenu` ganhou a prop opcional `estado?: "carregando" \| "erro"`. | A T4 pede "estado de erro/vazio"; sem a prop o menu diria "Nenhum membro encontrado" enquanto a busca corre. |
| D-6 | O `Composer` ganhou a prop opcional `autorId?`, que o `InboxLayout` preenche com `user.id`; a lista oferece todos **menos o autor** (Q2), e o token continua conferido contra a lista **inteira**. | A Q2 estava decidida mas sem RF/CA; a T3/T4 não a aplicaram e foi corrigida em `bf4533b`. `useAuth` lança fora do provider e o `Composer` é montado sem ele em vários testes. |
| D-7 | Com a busca de membros carregando ou com falha, o Enter **segue para o envio** da nota; só a consulta sem resultado com a busca concluída o consome (CA-13). | RNF-1 e o Living System: a lista nunca prende a nota. |
| D-8 | O seletor de emoji atualiza o cursor rastreado pelo `Composer`. | Sem isso o gatilho do `@` olharia o cursor antigo. |
| D-9 | **CA-2 e RF-6 não atendidos.** O RF-6 está provado só pelo caminho do push (CA-10); o aviso in-app (toast) não tem link, e o clique existe na `Notification` do navegador. O CA-2 depende de `conversation_notes` estar na publicação `supabase_realtime`, o que não está: dívida conhecida (`DIVIDA_CONHECIDA` de `realtime-assinatura-tem-publicacao.test.ts`). | Consertar é schema + RLS, que esta spec proíbe (`02-design.md` §4). Detalhado e com a proposta medida na [#137](https://github.com/itConesul/CRMPI/issues/137). `nota-mencao.spec.ts` guarda o caso em `test.fixme`. |

## Aprovação
- [x] **Aprovada por:** cMoreiraSul, em 2026-11-19, no chat, com as propostas Q1–Q4 — implementação liberada após o merge do PR #89
- [x] **Confirmação do dono do produto (Sciuba):** `APPROVED` no review do PR #89, 2026-11-23 15:17Z (sobre `eaa57bf`), com Q1 a Q4 confirmadas. PR #89 mergeado em `9defd7b`.
- **Estado do README:** `implementando` — a spec está aprovada e o PR de código está aberto (o `04-tarefas.md` pode começar, e começou).
- **Os desvios D-3 a D-9 acima** são do autor da implementação. **Revisão do Sciuba no #138, 2026-11-26** (relatada pelo cMoreiraSul; ainda não consta como review no GitHub): **aceitos D-3 a D-8**; **D-9 fica registrado** — CA-2 e RF-6 não são atendidos (aviso in-app sem link; `conversation_notes` fora da publicação Realtime) e o merge do #138 não resolve isso: quem resolve é a [#137](https://github.com/itConesul/CRMPI/issues/137). Confirmação de D-3 a D-9 pelo cMoreiraSul: **pendente**.
