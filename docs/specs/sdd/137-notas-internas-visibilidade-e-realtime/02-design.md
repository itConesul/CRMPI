# 02 — Design

**Verificado em:** `4cd5d10` · **Comando:** `git rev-parse --short HEAD`

## 1. O que existe hoje (verificado)

| Peça | Onde | Observação |
|---|---|---|
| Tabela e políticas | `supabase/baseline.sql`, bloco "notas internas de conversa (migration 0063)" | `conversation_notes_select`: só organização. `conversation_notes_write`: `for all`, organização e `agent`+ |
| Políticas restritivas | catálogo do banco | `support_write_insert/update/delete` (sessão de suporte somente leitura) |
| Grants de `authenticated` | catálogo | `SELECT, INSERT, UPDATE, DELETE, TRUNCATE` |
| Publicação | catálogo | `conversation_notes` **não** está em `supabase_realtime`; `replica identity` padrão (chave primária) |
| Visibilidade da conversa | `conversations_select` → `fn_can_view_conversation` | `messages_select` reaproveita com `exists` |
| Assinaturas | `hooks/inbox/useConversationNotes.ts` (`*`, por conversa) e `hooks/notifications/useCrmAlerts.ts` (`INSERT`, por organização) | Já prontas; não recebem nada |
| Leitura e escrita pela sessão | `app/api/v1/conversations/[id]/notes/route.ts` e `[noteId]/route.ts` | `requireRole("agent")`; confere a conversa antes; `insert ... select` |
| Leitura para a retomada | `lib/escalacao/continuidade.ts` | Client de quem chama: sessão (retomada pela tela) ou admin (MCP) |
| Dívida declarada | `tests/unit/realtime-assinatura-tem-publicacao.test.ts` | `conversation_notes` em `DIVIDA_CONHECIDA` |
| Prova bloqueada | `tests/e2e/nota-mencao.spec.ts` | `test.fixme` do CA-2 da #69 |

Nenhuma rota atualiza nota (a busca por `conversation_notes` em `app`, `components`, `hooks`, `lib` e
`workers` não acha `update`).

### Medição
Postgres `pgvector/pgvector:pg15` descartável, prelúdio de `scripts/test-db.sh` mais `baseline.sql`,
`set role authenticated` com JWT simulado, tudo desfeito. Conversa atribuída ao agente B.

| Quem | Vê a conversa | Hoje: lê a nota | Hoje: insere | Com a proposta da issue: lê | insere sem `RETURNING` | insere com `RETURNING` |
|---|---|---|---|---|---|---|
| dono (B) | sim | sim | aceito | sim | aceito | aceito |
| outro agente (A) | **não** | **sim** | **aceito** | não | **aceito** | recusado |
| `viewer` | sim | sim | recusado | não | recusado | recusado |
| `manager` | sim | sim | aceito | sim | aceito | aceito |

**NÃO VERIFICADO**
- Se um projeto Supabase da nuvem passa a entregar eventos da tabela recém-publicada sem reiniciar o
  Realtime. A issue mediu local; o `update.sh` não trata Realtime.
- Se o evento de **exclusão** respeita a política e o filtro por conversa. Pela documentação do
  Supabase não respeita, e leva só a chave primária; não foi medido aqui. Se confirmar, nota apagada
  não some ao vivo da tela de quem a vê.
- Nesta spec não foram medidos outra organização (a issue mediu: não lê), `visibility_mode` `all` e
  `none`, nem sessão de suporte.
- O `delete` sem filtro com a proposta da issue: é regra do Postgres, não foi executado aqui.
- Invariantes existentes que dependam das políticas atuais.
- Custo do Realtime com `exists` avaliado por assinante.

## 2. Decisão de design
A opção B da issue, com duas correções, nesta ordem dentro da migration:

1. **Leitura:** `fn_is_platform_admin() or (fn_role_at_least(org,'agent') and exists(conversa))`.
2. **Escrita separada por comando** (a `for all` sai):
   - `insert`, `update` e `delete`: organização, `agent`+ **e `exists(conversa)`** (RF-5, P2), como
     `messages_update` e `messages_delete` (#99). Só a política de leitura não bastaria: um `delete`
     sem filtro não passa por ela.
3. **Publicação**, por último e idempotente, no padrão da `0237`.

**Correção 1 (idempotência):** o SQL da issue cria `_insert`, `_update` e `_delete` sem `drop policy if
exists` antes. A segunda aplicação do `baseline.sql` (todo `update.sh`) erraria.
**Correção 2:** o `exists` na escrita (a tabela acima mostra por quê no `insert`).

`exists (select 1 from public.conversations c where c.id = conversation_notes.conversation_id)` roda sob
a RLS de quem consulta, como em `messages_select`. A regra não é copiada.

### Alternativas recusadas
| Alternativa | Por que não |
|---|---|
| Só publicar a tabela | Medido na issue: o agente sem acesso recebe o texto da nota |
| Só apertar `conversation_notes_select` | A `for all` também concede leitura, e permissivas somam por OU |
| Editar o bloco da `0063` no `baseline.sql` | O padrão do repo é acrescentar ao apêndice |
| Broadcast pelo servidor em vez de `postgres_changes` | Código novo para o que a RLS já resolve |

## 3. Contratos
Nenhuma rota, payload ou função nova. Nenhuma mudança em hooks.

## 4. Dados
Sem tabela nem coluna nova, e nenhum dado alterado. Migration
`<ts>_<NNNN>_notas_internas_visibilidade_e_realtime.sql`, apêndice no `baseline.sql` e linha no
`MANIFEST.md`. `NNNN` é o próximo número livre quando o PR de código abrir (hoje, `0244`). Sem função
nova, então não há `execute` a revogar.

## 5. Rastreabilidade
| Requisito | Onde |
|---|---|
| RF-1, RF-2 | §2, passos 1 e 2 |
| RF-3, RNF-2 | §2, passo 3 |
| RF-4 | §2, passo 2; `03-testes.md` CA-3 |
| RF-5 | §2, passo 2 |
| RNF-1 | §2, correção 1; §4 |

## 6. Living System Checklist
- Entrada e saída: entra pela rota de notas; sai para `useConversationNotes` e `useCrmAlerts`.
- Emite atividade/log: inalterado (`conversation.note_added`, `conversation.note_deleted`,
  `user.mentioned`).
- Aparece na tela: sim, a nota ao vivo na conversa e o aviso "Você foi mencionado".
- Porta na navegação: não há tela nova.
- Mecanismo anti-morte: o gate de publicação passa a cobrar a tabela (sai da dívida) e o e2e deixa de
  ser `fixme`.
- Laço de retorno: se a regra barrar quem devia ler, a tela mostra a lista sem a nota e o invariante de
  CA-1 ganha o caso. Se o Realtime não entregar, o comportamento volta ao de hoje (aparece ao
  recarregar), sem erro visível: por isso a verificação na nuvem em `03-testes.md`.
- Mapa vivo: sem peça nova.

## 7. Riscos
| Risco | Mitigação |
|---|---|
| Durante cada `update.sh`, o bloco da `0063` recria as políticas antigas antes de o apêndice substituí-las; com a tabela já publicada, há uma janela de segundos com a regra frouxa | Aceito e registrado: é o padrão do `baseline.sql`. Se a revisão não aceitar, a alternativa é editar o bloco original no mesmo PR |
| Realtime da nuvem não entregar sem reinício | Medir num projeto real antes de declarar o CA-2 da #69 atendido |
| Integração externa que lê notas com login de `viewer` | P1; constar no fragmento |
| `agent` sem acesso deixa de gravar nota por algum caminho legítimo | As rotas já devolvem 404 antes; CA-3 e o e2e cobrem o caminho do dono |
| `TRUNCATE` continua concedido a `authenticated` | Não é alcançável pela API REST; fora desta issue |
