# 02 — Design

**Verificado em:** `365a670` · **Comando:** `git rev-parse --short HEAD` (worktree `CRMPI-sdd-69`, base `origin/develop`)

## 1. O que existe hoje (verificado)
| Peça | Onde | Observação |
|---|---|---|
| Tabela de notas com RLS | `supabase/migrations/20260723120000_0063_conversation_notes.sql` | `body`, `created_by_user_id`, `created_by_name`; escrita exige `agent+`. Tabela **separada** de `messages`. |
| Criar/listar nota, com auditoria | `app/api/v1/conversations/[id]/notes/route.ts` | `requireRole("agent")`; `audit` `conversation.note_added`; corpo validado em `lib/schemas/notes.ts` (1–4096 caracteres). |
| Menção → evento | mesma rota, `emitirMencoesDaNota` | Se o corpo tem `@token`, percorre os membros ativos, chama `auth.admin.getUserById` **por membro** e emite `user.mentioned` para quem `mencaoAtingeUsuario` casa. Ignora o autor. |
| Parser | `lib/notifications/mentions.ts` | Token = `@[\p{L}\p{N}._-]+`. Casa por: `user_id`, e-mail, parte local do e-mail, **primeiro nome**, **nome sem espaços**. Teste: `lib/notifications/mentions.test.ts` (2 casos). |
| Aviso push | `lib/notifications/push.handler.ts` | `user.mentioned` → `href: /app/inbox/<id>`. **Sem teste do `href`** (`grep href` em `push.handler.test.ts` devolve vazio). |
| Aviso in-app | `hooks/notifications/useCrmAlerts.ts` (`onNote`) | Realtime `postgres_changes` `INSERT` em `conversation_notes`; refaz `mencaoAtingeUsuario` no cliente; `href: /app/inbox?id=<id>`. |
| Rota do clique | `app/app/inbox/[id]/page.tsx` | `redirect("/app/inbox?id=<id>")`. Os dois `href` acima chegam à mesma conversa. |
| Composer / modo nota | `components/inbox/Composer.tsx` (`mode: "reply" \| "note"`) | Modo nota chama `useCreateNote`, nunca `useSendMessage`. Teste: `tests/unit/composer-note-mode.test.tsx`. |
| Menu de `/` | `components/inbox/composer/TemplateMenu.tsx` + `Composer.tsx:179-189` | Popover posicionado no composer; `resolveSlash` puro; gatilho e filtro (`includes`, sem diferenciar caixa). **Só de mouse:** itens são `<button>`, sem `role="option"`, **sem ↑/↓ e sem seleção por Enter**. O Enter com o menu aberto apenas faz `return` depois de `preventDefault` (não envia); Esc liga `menuDismissed`. **É o padrão para posição, gatilho puro e filtro — o teclado do `MentionMenu` é novo** (RNF-1). |
| Card da nota | `components/inbox/NoteCard.tsx` | Corpo como texto puro; não destaca `@`. |
| Lista de membros para o composer | `app/api/v1/team/assignable/route.ts` + `hooks/inbox/useAssignableMembers.ts` | `requireRole("agent")` (o mesmo piso de quem escreve nota); devolve `user_id`, `role`, `full_name`; exclui `viewer` (`.neq("role","viewer")`); **sem e-mail por decisão de PII** (cabeçalho do arquivo). **Caminho degradado** (`route.ts:48-51`): sem service role, ou sem memberships, devolve **todos** com `full_name: null`. Já usado em 5 lugares. |
| `GET /api/v1/team` | `app/api/v1/team/route.ts` | `manager+`. **Não serve** a um `agent`. |
| `@tiptap/*` | `package.json` | Ausente; só há `@radix-ui/react-popover`. |

### Medição do parser (feita para esta spec)
Cópia literal de `lib/notifications/mentions.ts @ 365a670` (sem os tipos TS) executada em Node
`v22`, num script descartável **não versionado**; a saída está abaixo e o CA-6 a torna
reproduzível como teste do repo. O token testado é "`@` + nome sem espaços", a opção
natural dado que `team/assignable` não devolve e-mail:

```
token inserido | membro avaliado | atinge?
@AnaSilva        Ana Silva         true
@AnaSilva        Ana Souza         false
@AnaSilva        Ana Silvana       false
@MariadaSilva    Maria da Silva    true
@JoãoD'Ávila     João D'Ávila      false   ← o apóstrofo corta o token: vira "joãod"; o nome nunca é atingido
@José(Zé)Lima    José (Zé) Lima    true    ← mas só por acidente: o token vira "josé", que é o PRIMEIRO NOME
@Ana (à mão) atinge Ana Silva: true | Ana Souza: true
full_name null, token qualquer de nome: false
full_name null, token = user_id: true
```

Leituras: (a) o nome sem espaços resolve a ambiguidade entre pessoas de nome diferente
(`@AnaSilva` não atinge Ana Souza); (b) **falha em silêncio** para nomes com caractere fora de
`[\p{L}\p{N}._-]` (o mencionado simplesmente não é avisado) ou o promove a "primeiro nome" (avisa todo
José); (c) quem não tem nome só é alcançável pelo `user_id`.

### Segunda medição (revisão do Sciuba, ajuste 1)
O parser casa **cinco** regras, não só o nome sem espaços: `user_id`, e-mail, parte local do e-mail,
**primeiro nome** e nome sem espaços (`mentions.ts:12-21`). Cópia literal do parser @ `ec878e0` mais o
`tokenDeMencao(m, todos)` desta spec, executada em Node `v22.23.5`, num script descartável **não
versionado**. Conjunto: `Ana Silva`, `Ana Souza`, `Ana Silvana`, `Maria da Silva`, `João D'Ávila`,
`José (Zé) Lima`, membro sem nome, **`Ana`**, `Carla`:

```
membro           token inserido        atinge ele   atinge outros
Ana Silva        @AnaSilva             true         nenhum
Ana Souza        @AnaSouza             true         nenhum
Ana Silvana      @AnaSilvana           true         nenhum
Maria da Silva   @MariadaSilva         true         nenhum
João D'Ávila     @<user_id>            true         nenhum
José (Zé) Lima   @<user_id>            true         nenhum
(sem nome)       @<user_id>            true         nenhum
Ana              @<user_id>            true         nenhum     ← "@Ana" atingiria as 3 Anas (primeiro nome)
Carla            @Carla                true         nenhum
falhas: 0

CONTROLE (versão sem verificar os outros, só "nome sem espaços ou id"):
  Ana -> @Ana atinge também: Ana Silva, Ana Souza, Ana Silvana

e-mail vazio no parser:           mencaoAtingeUsuario("@AnaSilva", {email:""...})            = false
e-mail marcador (`<id>@marcador.invalid`): mesma chamada                                      = true
viewer "Ana Viewer" (fora de team/assignable) atingido por @Ana:                              true
e-mail anasilva@x.com atingido por @AnaSilva (membro "Beto"):                                 true
```

Leituras: (a) o controle prova o ponto do Sciuba — **sem** verificar contra os outros, o membro
"Ana" insere `@Ana` e avisa três pessoas; (b) a **armadilha**: o parser devolve `false` com
`email: ""` **antes** de olhar o nome (`mentions.ts:14`), e o cliente não tem e-mail — o helper e o
teste precisam de um e-mail marcador, senão todo token por nome "falha" e tudo cai para `@<user_id>`
em silêncio; (c) as duas últimas linhas são **colisões que o cliente não enxerga** (R4).

**NÃO VERIFICADO:**
- Acessibilidade real do popover com leitor de tela (só é provável por teste de papéis/ARIA, não por uso).
- Se `docs/architecture/` exige atualização: `grep -rln "Composer\|conversation_notes\|NoteCard" docs/architecture`
  devolve apenas `escalacao-ciclo-humano.architecture.json`; **não li** esse arquivo para saber se
  o componente novo precisa de aresta. Verificar na implementação.

## 2. Decisão de design
Reusar o padrão do `TemplateMenu` para o `@`, sobre o `<textarea>` atual, **só em modo nota**.

1. **Gatilho puro** `resolverMencao(texto, cursor)` → `{ aberto, consulta, inicio, fim }`: o `@`
   precisa estar no começo do texto ou depois de espaço/quebra de linha (para não abrir dentro de
   `ana@clinica.com`), e a consulta não contém espaço.
2. **Fonte** `useAssignableMembers(mode === "note")` — só busca quando o atendente entra no modo nota.
3. **Lista** `MentionMenu` (`listbox`, itens com `role="option"`, ↑/↓/Enter/Esc — **teclado novo**, o
   `TemplateMenu` não o tem), filtrando o **rótulo** do item por "contém", sem diferenciar maiúsculas.
   O rótulo é o `full_name`, ou `Membro sem nome · <8 primeiros do user_id>` quando é nulo (item 6).
   Sem resultado: mostra "Nenhum membro encontrado"; Enter **não** envia e **não** insere; Esc ou um
   espaço fecham (RNF-1, CA-13).
4. **Token inserido** — função pura `tokenDeMencao(membro, todos)`, onde `todos` é a lista inteira
   que `team/assignable` devolveu:
   1. candidato = `full_name` sem espaços (mesma normalização do parser: `trim` + remover `\s+`);
      só vale se cabe inteiro no token (`/^[\p{L}\p{N}._-]+$/u`);
   2. o candidato **é aceito somente se** atinge o selecionado **e não atinge nenhum outro membro
      de `todos`**, avaliado com o **próprio** `mencaoAtingeUsuario` — isto é, por **todas** as
      regras (primeiro nome e nome sem espaços inclusive), sem reimplementá-las;
   3. senão (sem nome, apóstrofo, parênteses, **ou colisão** com outro membro, como "Ana" ao lado de
      "Ana Silva"), insere `@<user_id>` — o único token que o parser casa sem ambiguidade (Q1).

   **Armadilha:** o cliente não tem e-mail, e `mencaoAtingeUsuario` devolve `false` com `email: ""`
   **antes** das regras de nome (`mentions.ts:14`). A avaliação usa um **e-mail marcador derivado do
   `user_id`** (`<user_id>@marcador.invalid`), que não casa com nenhum token por nome. O teste do
   CA-6 prova também esse comportamento (a chamada com `email: ""` devolve `false`), para que
   ninguém "simplifique" tirando o marcador. As duas funções existentes do parser **não mudam**.
5. **Seleção** troca `[inicio, fim)` por `token + " "`, devolve o foco e põe o cursor depois do espaço.
6. **Membro sem `full_name`** (RF-7): aparece na lista como `Membro sem nome · <8 primeiros do
   user_id>`, é filtrável por esse rótulo, e seleciona `@<user_id>` (item 4.3). No caminho degradado
   da rota (**todos** com `full_name: null`) a lista fica inteira nesse formato — feia, mas
   **utilizável**: nenhum membro some e nenhum token deixa de funcionar. Esse caminho quase não
   ocorre em produção (`SUPABASE_SERVICE_ROLE_KEY` é `requiredAlways`, `lib/env.ts:71`); o caso comum
   é **um** membro sem `full_name` no metadata.

O servidor, o parser e o `NoteCard` não mudam. A ambiguidade **do que se digita à mão** continua
(`@Ana` atinge todas as Anas) — o que muda é que o caminho selecionado deixa de depender dela.

### Alternativas recusadas
| Alternativa | Por que não |
|---|---|
| TipTap + `@tiptap/extension-mention` (o texto da issue) | Dependência grande num gate de tamanho obrigatório (`build-and-size`); a issue própria a recusa (item 2). |
| Inserir sempre `@<user_id>` | Funciona para todos, mas ilegível no card para quem lê a nota. Fica só como queda para quem não tem token por nome (Q1). |
| Corrigir o parser para aceitar apóstrofo/parênteses | Muda um parser testado que o servidor e o cliente compartilham; a issue pede preservá-lo. |
| `mentioned_user_ids` enviado pelo cliente | Muda contrato da rota e modelo (item 1 da issue). |
| Usar `GET /api/v1/team` | Exige `manager+`; um `agent` receberia 403. |

## 3. Contratos
```ts
// lib/notifications/mentions.ts (acrescenta; as duas funções existentes não mudam)
export interface MembroMencionavel { user_id: string; full_name: string | null }
// `todos` = a lista inteira de team/assignable (inclui `m`). Sem o "@" no retorno.
export function tokenDeMencao(m: MembroMencionavel, todos: MembroMencionavel[]): string;
export function rotuloDoMembro(m: MembroMencionavel): string; // full_name ou "Membro sem nome · xxxxxxxx" (via useT no componente)

// components/inbox/composer/MentionMenu.tsx
export function resolverMencao(texto: string, cursor: number):
  { aberto: boolean; consulta: string; inicio: number; fim: number };
export function MentionMenu(props: {
  open: boolean; consulta: string; membros: MembroMencionavel[];
  ativo: number; onAtivo: (i: number) => void;
  onPick: (m: MembroMencionavel) => void;
}): JSX.Element | null;
```
Rota, payload, Zod e evento: **sem mudança**.

## 4. Dados
**Nenhuma mudança de schema.** Sem migration, sem apêndice no `baseline.sql`, sem linha no
`MANIFEST.md`, sem mudança em `database.types.ts`. Se a implementação concluir que precisa, a regra
da issue vale: parar e alinhar o schema antes de escrever migration.

Impacto declarado: **schema** nenhum · **RLS** nenhum · **API** nenhum · **`.changes/`**
`capacidade_nova` (o diretório está vazio hoje: `ls .changes` não lista nada).

## 5. Rastreabilidade
| Requisito | Onde é atendido neste design |
|---|---|
| RF-1 | §2 itens 1–3 (gatilho puro + `useAssignableMembers(mode === "note")`) |
| RF-2 | §2 itens 2–3 |
| RF-3 | §2 item 5 |
| RF-4 | §2 item 4 e as duas medições de §1 |
| RF-7 | §2 itens 3 e 6 |
| RF-5 | §4 |
| RF-6 | §1 (`push.handler.ts`, `page.tsx`); o design **não muda** o aviso, só o prova (CA-10) |
| RNF-1 | §2 item 3 |
| RNF-2 | §2 (nenhuma dependência) e §2 "Alternativas" |
| RNF-3 | §3 (`useT` em todo texto novo) + entrada em `lib/i18n/dicionario.ts`; vigiado por `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` |

## 6. Living System Checklist
(`docs/doctrine/sistema-vivo.md`) — cada resposta **nomeia o artefato concreto**.
- **Entrada e saída:** entrada é a digitação no `<textarea>` do `Composer.tsx` em modo nota; saída é o mesmo `POST /api/v1/conversations/[id]/notes` que já existe, agora com um token que casa.
- **Emite atividade/log:** nada novo; segue valendo `conversation.note_added` (rota) e o evento `user.mentioned` (`emit_event`).
- **Aparece na tela:** `MentionMenu` dentro do composer da conversa, em `/app/inbox`.
- **Porta na navegação (`lib/navigation/registry.ts`):** não há tela nova; N/A por construção.
- **Mecanismo anti-morte:** se `team/assignable` falhar ou vier vazio, a lista mostra uma mensagem e o atendente **continua podendo digitar a menção à mão** (o parser já atende); a lista nunca bloqueia o envio da nota. Com a consulta sem resultado o Enter não envia, mas **Esc ou um espaço** fecham a lista e devolvem o Enter ao envio (RNF-1, CA-13) — a nota nunca fica presa. Membro sem nome continua selecionável (RF-7).
- **Laço de retorno (o que muda no sistema quando ela erra):** erro de token = o mencionado **não é avisado** e ninguém fica sabendo (R1). CA-6 prova que isso não ocorre pelo caminho selecionado. Retorno ao **autor** sobre quem foi avisado é uma lacuna reconhecida e **fora de escopo** (declarado em `01-requisitos.md`).
- **Mapa vivo (`docs/architecture/`):** ver "NÃO VERIFICADO" em §1.

## 7. Riscos
| Risco | Mitigação |
|---|---|
| **R1** Nome com caractere fora do token (apóstrofo, parênteses…): `@nome` não notifica ou notifica a pessoa errada (medido em §1). | `tokenDeMencao` cai para `@<user_id>`; CA-6 exercita esses nomes. |
| **R2** `@` digitado à mão continua ambíguo (`@Ana` avisa todas as Anas). | Fora de escopo (parser intocado). A lista é o caminho recomendado; o placeholder do modo nota pode lembrar de `@`. |
| **R3** `team/assignable` faz `getUserById` por membro; abrir o modo nota dispara essa chamada. | `staleTime` de 60 s do hook já existente; só busca em modo nota. |
| **R4** O token só é verificado contra **os membros da lista**. Ficam fora do alcance do cliente: **(a)** dois membros com **nome completo idêntico** (`@AnaSilva` atinge as duas — a verificação do item 4 os vê e cai para `@<user_id>`, mas só enquanto ambos estiverem na lista); **(b)** a **parte local do e-mail** e o e-mail — `team/assignable` não devolve e-mail (PII), e o servidor avalia com e-mail (`getUserById`): quem tem `anasilva@…` é atingido por `@AnaSilva` (medido, §1); **(c)** membros fora da lista, **`viewer`** — o servidor varre todo membro ativo (`notes/route.ts:123-127`, sem filtro de papel), então um `viewer` de primeiro nome "Ana" é atingido por `@Ana`. | **Aceito e declarado: não é verificável no cliente.** Eliminar exigiria `@<user_id>` sempre, e-mail na rota (recusado por PII) ou parser novo — todos recusados acima. O caso (c) tem a mesma raiz de um ponto à parte do #69 (o servidor não filtra papel ao emitir `user.mentioned`); fica **fora de escopo** aqui e é levado como observação ao review. |
| **R5** `viewer` não aparece na lista. | Correto: `viewer` não lê notas (`inbox.notes.view` = `agent`, `hooks/auth/AuthProvider.tsx:129`). A colisão com `viewer` **digitado à mão ou por primeiro nome** é o R4(c). |
| **R6** Caminho degradado de `team/assignable` (todos `full_name: null`). | RF-7 / CA-12: a lista fica utilizável com rótulos por id; nenhum token deixa de funcionar. |
| **R7** O helper chama `mencaoAtingeUsuario` com e-mail marcador; quem mudar o parser para exigir e-mail real quebra o token por nome em silêncio. | O CA-6 inclui a asserção do e-mail vazio e roda o conjunto inteiro: se o parser mudar, o teste fica vermelho. |
