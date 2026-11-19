# 01 — Requisitos

## Problema
Issue [#69](https://github.com/itConesul/CRMPI/issues/69): notas internas na timeline, invisíveis
ao cliente, com menção `@usuário` que notifica em tempo real. O texto da issue pede um editor
TipTap; a verificação em `develop` mostrou que quase tudo já existe e que o que falta é o
**autocomplete do `@`** (hoje a menção é texto parseado no servidor, e quem escreve a nota tem de
saber de cor como o parser casa o nome). Ver [`02-design.md` §1](02-design.md).

## Requisitos
Cada requisito aponta para o trecho da issue (ou da decisão registrada em
[`05-revisao.md`](05-revisao.md)) que o originou.

| ID | Requisito | Origem na issue |
|---|---|---|
| RF-1 | No modo **Nota interna** do composer, digitar `@` abre uma lista de membros da organização para seleção. No modo **Mensagem ao cliente** a lista **nunca** abre. | "Melhorias propostas" item 2 — "popover com membros ativos" |
| RF-2 | A lista mostra os membros ativos que podem ser mencionados (a fonte é `GET /api/v1/team/assignable`) e filtra conforme o atendente digita depois do `@`. | item 2 |
| RF-3 | Selecionar um membro (clique ou Enter) troca o trecho `@consulta` por um token de menção seguido de espaço, sem alterar o resto do texto. | item 2 |
| RF-4 | O token inserido por RF-3 **atinge o membro selecionado e nenhum outro**, segundo o parser que já existe (`mencaoAtingeUsuario`). | "ambiguidade" — decisão do dono, 2026-11-19, ver `05-revisao.md` (D-2) |
| RF-5 | O modelo de dados e o contrato de API ficam como estão: a nota continua em `conversation_notes`, via `POST /api/v1/conversations/[id]/notes`; o parser e o evento `user.mentioned` não mudam de comportamento. | item 1 — "Não mexer no modelo" |
| RF-6 | O aviso de menção, ao ser clicado, abre a conversa citada. | item 3 — "Conferir e, se faltar, garantir" |
| RNF-1 | **Acessibilidade e teclado:** a lista é um `listbox`; ↑/↓ movem o item ativo; Enter seleciona **sem enviar a nota**; Esc fecha sem apagar o texto. | (acréscimo da spec — padrão do `TemplateMenu` já em uso) |
| RNF-2 | **Sem dependência nova** (`package.json` e lockfile inalterados). | "`@tiptap/*` não está nas dependências, e `build-and-size` é gate obrigatório" |
| RNF-3 | **i18n:** todo texto novo passa por `useT`. | (acréscimo da spec — convenção do `Composer`) |

## Critérios de aceite
Os dois primeiros são os da issue, **verbatim**. A prova de cada um fica em
[`03-testes.md`](03-testes.md).

| ID | Critério | Cobre |
|---|---|---|
| CA-1 | **Aceite do texto (1):** nota interna não dispara requisição ao WhatsApp/Meta. | RF-5 |
| CA-2 | **Aceite do texto (2):** o mencionado recebe aviso em tempo real e o clique abre a conversa. | RF-6 |
| CA-3 | Em modo nota, digitar `@` abre a lista; em modo mensagem, digitar `@` não abre nada. | RF-1 |
| CA-4 | A lista contém os membros devolvidos por `team/assignable` e, ao digitar após o `@`, mostra só os cujo nome contém o texto, sem diferenciar maiúsculas. | RF-2 |
| CA-5 | Selecionar um membro por clique ou por Enter substitui apenas o trecho `@consulta` pelo token + um espaço, e o cursor fica logo depois dele. | RF-3 |
| CA-6 | Para cada membro de um conjunto de teste — com nome simples, nome composto, nome com apóstrofo, nome com parênteses e nome vazio — o token inserido atinge **esse** membro e **nenhum dos outros** do conjunto. | RF-4 |
| CA-7 | Com a lista aberta: ↑/↓ mudam o item ativo, Enter seleciona e **não** chama `createNote`, Esc fecha e o texto fica intacto. | RNF-1 |
| CA-8 | O diff da implementação não toca `supabase/`, `app/api/` nem `lib/database.types.ts`. | RF-5 |
| CA-9 | O diff da implementação não altera `package.json` nem o lockfile. | RNF-2 |
| CA-10 | O `href` do aviso de menção (push) resolve numa rota que abre a conversa com o `id` citado. | RF-6 |
| CA-11 | Todo texto novo da interface tem tradução no dicionário, e o guarda de i18n do repo (`tests/unit/i18n-espanhol-cobre-a-tela.test.ts`) continua verde. | RNF-3 |

## Fora de escopo
Como a issue declara:
- Editor rico / `@tiptap/extension-mention`.
- Mudar o modelo: `messages.is_internal_note`, `status='internal'`, `mentioned_user_ids`.
- Canal `notifications:tenant_id` (o caminho real é `user.mentioned` + kind `mention`).

Acréscimos da spec (a issue deixou implícitos):
- **Destacar o `@` renderizado no `NoteCard`** — hoje o corpo é texto puro; a issue não pede.
- **Mudar o parser** (`lib/notifications/mentions.ts`): o autocomplete se adapta a ele, não o contrário.
  Menção digitada à mão (`@Ana`) continua atingindo **todo** membro de primeiro nome `Ana`; o que
  muda é que o caminho **selecionado** é inequívoco.
- Unificar os dois formatos de `href` dos avisos (`/app/inbox/<id>` no push, `/app/inbox?id=<id>` no
  in-app). Os dois funcionam (CA-10 prova); unificar é refatoração sem pedido.
- Avisar o **autor** de quem foi de fato notificado.

## Perguntas em aberto
**Decididas em 2026-11-19 por cMoreiraSul, conforme a proposta; confirmação do dono do produto pendente no PR #89** — ver [`05-revisao.md`](05-revisao.md).
O texto abaixo é mantido como o registro da pergunta.

| # | Pergunta | Proposta da spec |
|---|---|---|
| Q1 | Membro **sem `full_name`**, ou com nome que o token não consegue representar (apóstrofo, parênteses): o token vira o `user_id` (`@<uuid>`, feio no texto, mas é o único que o parser casa de forma inequívoca). Aceitável? | Sim: é preferível a um `@nome` que **não notifica** (silêncio) ou que notifica a pessoa errada. Ver `02-design.md` §2 e §7 (R1). |
| Q2 | A lista inclui **o próprio autor**? (o servidor e o aviso in-app já ignoram auto-menção) | Não incluir. |
| Q3 | O filtro ignora acentos (`jose` acha `José`)? | Não: segue o `TemplateMenu` (só ignora maiúsculas), que é o padrão do projeto. Se a resposta for sim, CA-4 ganha "e acentos". |
| Q4 | Destacar `@menção` no `NoteCard` entra? | Não (fora de escopo acima). |
