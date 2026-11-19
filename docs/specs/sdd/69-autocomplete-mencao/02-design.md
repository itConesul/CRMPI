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
| Menu de `/` | `components/inbox/composer/TemplateMenu.tsx` | Popover posicionado no composer; `resolveSlash` puro; Enter com menu aberto não envia; Esc fecha. **É o padrão a seguir.** |
| Card da nota | `components/inbox/NoteCard.tsx` | Corpo como texto puro; não destaca `@`. |
| Lista de membros para o composer | `app/api/v1/team/assignable/route.ts` + `hooks/inbox/useAssignableMembers.ts` | `requireRole("agent")` (o mesmo piso de quem escreve nota); devolve `user_id`, `role`, `full_name`; exclui `viewer`; **sem e-mail por decisão de PII** (cabeçalho do arquivo). Já usado em 5 lugares. |
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
3. **Lista** `MentionMenu` (`listbox`, itens com `role="option"`, ↑/↓/Enter/Esc), filtrando
   `full_name` por "contém", sem diferenciar maiúsculas.
4. **Token inserido** — função pura `tokenDeMencao(membro)`:
   - se o nome sem espaços cabe inteiro no token (`/^[\p{L}\p{N}._-]+$/u`), insere `@<nome sem espaços>`;
   - senão (sem nome, apóstrofo, parênteses…), insere `@<user_id>` — o único que o parser casa
     sem ambiguidade (Q1);
   - em ambos os casos o resultado **é testado contra `mencaoAtingeUsuario`** (CA-6): atinge o
     selecionado e nenhum outro do conjunto.
5. **Seleção** troca `[inicio, fim)` por `token + " "`, devolve o foco e põe o cursor depois do espaço.

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
export function tokenDeMencao(m: MembroMencionavel): string; // sem o "@"

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
| RF-4 | §2 item 4 e a medição de §1 |
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
- **Mecanismo anti-morte:** se `team/assignable` falhar ou vier vazio, a lista mostra uma mensagem e o atendente **continua podendo digitar a menção à mão** (o parser já atende); a lista nunca bloqueia o envio da nota.
- **Laço de retorno (o que muda no sistema quando ela erra):** erro de token = o mencionado **não é avisado** e ninguém fica sabendo (R1). CA-6 prova que isso não ocorre pelo caminho selecionado. Retorno ao **autor** sobre quem foi avisado é uma lacuna reconhecida e **fora de escopo** (declarado em `01-requisitos.md`).
- **Mapa vivo (`docs/architecture/`):** ver "NÃO VERIFICADO" em §1.

## 7. Riscos
| Risco | Mitigação |
|---|---|
| **R1** Nome com caractere fora do token (apóstrofo, parênteses…): `@nome` não notifica ou notifica a pessoa errada (medido em §1). | `tokenDeMencao` cai para `@<user_id>`; CA-6 exercita esses nomes. |
| **R2** `@` digitado à mão continua ambíguo (`@Ana` avisa todas as Anas). | Fora de escopo (parser intocado). A lista é o caminho recomendado; o placeholder do modo nota pode lembrar de `@`. |
| **R3** `team/assignable` faz `getUserById` por membro; abrir o modo nota dispara essa chamada. | `staleTime` de 60 s do hook já existente; só busca em modo nota. |
| **R4** Dois membros com **nome completo idêntico** continuam colidindo (`@AnaSilva` atinge as duas). | Aceito e declarado. Para eliminar seria preciso `user_id` sempre ou um parser novo (recusados acima). |
| **R5** `viewer` não aparece na lista. | Correto: `viewer` não lê notas (`inbox.notes.view` = `agent`, `hooks/auth/AuthProvider.tsx:129`). |
