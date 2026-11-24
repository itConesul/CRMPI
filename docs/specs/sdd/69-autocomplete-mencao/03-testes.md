# 03 — Testes e provas

## Matriz de aceite
| Critério | Prova | Tipo | Arquivo / comando | Evidência |
|---|---|---|---|---|
| CA-1 | Em modo nota, com um `@` selecionado, enviar chama `createNote` e **nunca** `useSendMessage`. Pela tela: ao salvar a nota, o navegador não faz nenhuma requisição ao caminho de envio de mensagem. | unit + e2e | `tests/unit/composer-note-mode.test.tsx` (estende) · `tests/e2e/nota-mencao.spec.ts` (`page.on("request")`) | _preencher ao concluir_ |
| CA-2 | Dois usuários: A cita B numa nota; B recebe o aviso `mention` sem recarregar a página, e clicar nele abre a conversa citada. | e2e | `tests/e2e/nota-mencao.spec.ts` (duas sessões) | _preencher ao concluir_ |
| CA-3 | Texto `@` em modo nota abre `role="listbox"`; o mesmo texto em modo mensagem não renderiza a lista; `ana@x.com` (sem espaço antes do `@`) não abre. | unit | `tests/unit/mention-menu.test.tsx` · `tests/unit/resolver-mencao.test.ts` | _preencher ao concluir_ |
| CA-4 | Com `team/assignable` simulado (3 membros), a lista mostra os 3; digitar `an` deixa só os que contêm `an`, em qualquer caixa. | unit | `tests/unit/mention-menu.test.tsx` | _preencher ao concluir_ |
| CA-5 | Texto `oi @an tudo` com cursor após `@an` e seleção de "Ana Silva": só `@an` é trocado pelo token + um espaço, `tudo` fica intacto e o cursor termina depois do espaço inserido. Vale para clique e para Enter. | unit | `tests/unit/resolver-mencao.test.ts` · `tests/unit/mention-menu.test.tsx` | _preencher ao concluir_ |
| CA-6 | Conjunto: `Ana Silva`, `Ana Souza`, `Ana Silvana`, `Maria da Silva`, `João D'Ávila`, `José (Zé) Lima`, membro sem nome e **`Ana` (uma palavra, primeiro nome das três Anas)**, mais `Carla`. Para cada `m`, com `t = tokenDeMencao(m, conjunto)` e e-mail marcador `<user_id>@marcador.invalid`: `mencaoAtingeUsuario("oi @" + t, …m)` é `true` e é `false` para todos os outros do conjunto. Resultado esperado para `Ana`: `@<user_id>`; para `João D'Ávila`, `José (Zé) Lima` e o sem nome: `@<user_id>`. **Inclui** a asserção `mencaoAtingeUsuario("@AnaSilva", {…email: ""…}) === false` (a armadilha). Reprodução prévia em `02-design.md` §1 (segunda medição, 0 falhas; o controle sem verificação falha em "Ana"). | unit | `lib/notifications/mentions.test.ts` (estende) | _preencher ao concluir_ |
| CA-7 | Lista aberta **com resultados**: `ArrowDown`/`ArrowUp` movem `aria-selected`; `Enter` seleciona e `createNote` **não** é chamado; `Escape` fecha e o texto não muda. (O teclado é novo — o `TemplateMenu` não o tem.) | unit | `tests/unit/mention-menu.test.tsx` | _preencher ao concluir_ |
| CA-8 | O diff não toca `supabase/`, `app/api/` nem `lib/database.types.ts`. | medição | `git diff --name-only origin/develop...HEAD \| grep -E "^(supabase/\|app/api/\|lib/database.types.ts)"` → saída vazia | _preencher ao concluir_ |
| CA-9 | O diff não altera `package.json` nem o lockfile. | medição | `git diff --name-only origin/develop...HEAD \| grep -E "^(package.json\|pnpm-lock.yaml)"` → saída vazia | _preencher ao concluir_ |
| CA-10 | O `href` que `push.handler.ts` monta para `user.mentioned` aponta para uma rota que existe e redireciona para `/app/inbox?id=<id>`. **Se a asserção falhar**, o PR de código **não** corrige o handler (RF-5 e o escopo aprovado): a saída vermelha vai para uma issue própria, o CA-10 e o RF-6 ficam declarados **não atendidos** no PR de código e a decisão volta ao dono do produto (ver `04-tarefas.md`, T5). | unit | `lib/notifications/push.handler.test.ts` (estende com asserção de `href`) | _preencher ao concluir_ |
| CA-11 | Strings novas do `MentionMenu` e dos estados vazio/erro (inclui "Membro sem nome" e "Nenhum membro encontrado") estão em `lib/i18n/dicionario.ts`; o guarda de i18n do repo não acusa texto cru nem chave faltando. | unit | `pnpm test:unit` (inclui `tests/unit/i18n-espanhol-cobre-a-tela.test.ts`) | _preencher ao concluir_ |
| CA-12 | Com `team/assignable` simulado devolvendo (i) um membro com `full_name: null` entre outros nomeados e (ii) **todos** com `full_name: null`: cada nulo aparece como `Membro sem nome · <8 primeiros do user_id>`; digitar um pedaço do id filtra; selecionar insere `@<user_id>` e `mencaoAtingeUsuario` o atinge e a nenhum outro. | unit | `tests/unit/mention-menu.test.tsx` · `lib/notifications/mentions.test.ts` | _preencher ao concluir_ |
| CA-13 | Lista aberta com `@zzz` (sem resultado): aparece "Nenhum membro encontrado"; `Enter` não chama `createNote` e o texto não muda; após `Escape` (ou um espaço), `Enter` chama `createNote` com o texto como está. | unit | `tests/unit/mention-menu.test.tsx` · `tests/unit/composer-note-mode.test.tsx` (estende) | _preencher ao concluir_ |

Tipos: `unit` (`pnpm test:unit`, sem caminho) · `invariante` (`pnpm test:db`) ·
`e2e` (Playwright, pela tela) · `medição` (comando com saída esperada).

## Prova pela tela (a #69 toca UI)
Ambiente fresco estilo VPS (`docs/testing/user-journey-map.md`), com envs opcionais **ausentes**.
Percurso: duas contas `agent` na mesma organização → A abre uma conversa, troca para "Nota interna",
digita `@`, escolhe B na lista, salva → B vê o aviso sem recarregar → B clica e cai na conversa.
Medidas de posição do popover por `getBoundingClientRect` (não a olho). Evidência em
`.superpowers/evidence/`. Atualizar `docs/testing/user-journey-map.md` com a jornada nova.

Esta prova **sobe servidor e banco**: pede aprovação própria antes de rodar (ver `04-tarefas.md`).

## Gates antes do PR de código
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test:unit` (suíte inteira, rodapé conferido — não `vitest run tests/unit`)
- [ ] `pnpm test:db` — **não se aplica** (sem schema/RLS); declarado aqui para não parecer esquecimento
- [ ] `pnpm release:conferir` (fragmento `capacidade_nova` em `.changes/`)
