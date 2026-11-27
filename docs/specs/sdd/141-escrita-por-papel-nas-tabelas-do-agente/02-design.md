# 02 — Design

**Verificado em:** `23df681` · **Comando:** `git rev-parse --short HEAD`

## 1. O que existe hoje (verificado)

| Peça | Onde | Observação |
|---|---|---|
| Laço de policies | `supabase/baseline.sql`, o `foreach t in array` que contém `'lead_state'` | Cria `tenant_isolation_<tabela>_all` (`for all`, só organização) e revoga apenas `anon` |
| Lista das tabelas | o mesmo laço | `grep -n -A14 "'agent_inbox_items', 'job_queue'" supabase/baseline.sql` |
| Grants de `authenticated` | catálogo do banco | `INSERT`, `UPDATE`, `DELETE` e `TRUNCATE` em todas as do laço |
| Policies restritivas já presentes | catálogo | `support_write_*` (sessão de suporte somente leitura). Não restringem o papel do membro |
| Helper de papel | `public.fn_role_at_least(org, papel)` | já usado em `departments` e `conversation_notes` |
| Funções sem `security definer` que escrevem nelas | catálogo (`pg_proc.prosrc`) | nenhuma encontrada pela busca textual |

### Execução como `viewer`
Postgres `pgvector/pgvector:pg15` descartável, prelúdio de `scripts/test-db.sh` mais `baseline.sql`,
`set role authenticated` com o JWT de um `viewer`, em transação desfeita.

| Operação | Resultado |
|---|---|
| `update` e `delete` em `lead_state`, `lead_state_transitions`, `outbound_copies` | **aceitos** |
| `insert` em `job_queue` (`inbound_turn`, `operator_turn`, `transactional_delivery`, `approved_reply`, `watchdog`, `flywheel`) | **aceito** |
| `insert` em `job_queue` (`followup_turn`) | recusado pelo trigger `fn_followup_generation_write` |
| `insert` em `cron_jobs` (`followup_turn`), `promise_table_versions` e `_pointers`, `channel_knobs`, `llm_calls` | **aceito** |

As demais tabelas do laço têm os mesmos grants e a mesma policy permissiva; não foram executadas
uma a uma.

### Escritores que usam a sessão do usuário
Levantados em `app`, `components`, `hooks`, `lib` e `workers`. São os que uma restrição para
`authenticated` alcança.

| Tabela | Operação | Onde | Piso hoje |
|---|---|---|---|
| `lead_state` | `update next_action` | `app/api/v1/leads/[id]/next-action/route.ts` | `requireRole("agent")` |
| `lead_checkpoints` | `insert` | `lib/escalacao/retomada.ts`, chamado por `conversations/[id]/reactivate-bot` | `requireRole("agent")` |
| `cron_jobs` | `insert` | `app/api/v1/leads/[id]/reactivation/route.ts` | `requireRole("agent")` |
| `agent_inbox_items` | `insert` | `app/api/v1/pipelines/[id]/board/route.ts` (`avisaAmbiguas`) | só sessão válida: **inclui `viewer`**; o erro é ignorado |

Os outros escritores encontrados usam client admin ou a conexão direta do motor
(`SUPABASE_DB_URL`). `lib/escalacao/retomada.ts` também é chamado por `lib/mcp/tools/escalacao.ts`,
com o client do contexto MCP, que é o **client admin** nos pontos conferidos (`lib/mcp/server.ts`,
`lib/ai/runtime/agent.ts`).

**NÃO VERIFICADO**
- Se um job inserido por um `viewer` chega a gerar **envio** pelo worker. Medido só o `insert`.
- Quais invariantes existentes escrevem nessas tabelas como `authenticated`.
- Se alguma instalação tem script externo que escreve nelas com login de usuário.

## 2. Decisão de design
**Fechar por padrão e abrir o que o app usa.** Duas camadas:

1. **Privilégio:** `revoke insert, update, delete, truncate ... from authenticated` em todas as
   tabelas do laço.
2. **Exceções**, com `grant` do mínimo e uma policy **restritiva** que exige papel:

| Tabela | Devolve | Policy restritiva |
|---|---|---|
| `lead_state` | `update (next_action)`, só a coluna | `update`: `fn_role_at_least(organization_id,'agent')` |
| `lead_checkpoints` | `insert` | `agent`+ e `job_id is null` |
| `cron_jobs` | `insert` | `agent`+, `kind = 'at'` e `job_kind = 'followup_turn'` |
| `agent_inbox_items` | `insert` | `agent`+ e `kind = 'next_action_ambiguous'` |

A policy permissiva do laço fica como está. O laço só derruba e recria `tenant_isolation_*`, então
as restritivas sobrevivem à reaplicação do `baseline.sql`. Os `revoke` ficam **no apêndice, depois
do laço**, e são idempotentes.

Nenhuma mudança de código de aplicação.

### Alternativas recusadas
| Alternativa | Por que não |
|---|---|
| Só trocar a policy `for all` por uma que exija `agent`+ | Deixa o `agent` alterar fila, ledger de envio e tabelas de proteção, que o app não escreve com a sessão dele |
| Mover os quatro escritores para client admin e revogar tudo | Troca uma garantia do banco por filtro manual de `organization_id` e mexe em quatro rotas |
| Editar o laço original | O padrão do repo é acrescentar ao apêndice |

## 3. Contratos
Nenhuma rota, payload ou função nova.

## 4. Dados
Sem tabela nem coluna nova. Migration `<ts>_0241_escrita_por_papel_nas_tabelas_do_agente.sql`,
apêndice no `baseline.sql` e linha no `MANIFEST.md`. A `0240` é do PR #140; **conferir o número no
momento de abrir o PR de código**. Nenhum dado é alterado.

## 5. Rastreabilidade
| Requisito | Onde |
|---|---|
| RF-1, RF-4 | §2, camada 1 |
| RF-2, RF-3 | §2, tabela de exceções |
| RNF-1 | §4 |
| RNF-2 | §1 (escritores) e §2: nada muda para `service_role` nem para a conexão direta |

## 6. Living System Checklist
- Entrada e saída: não há peça nova; mudam privilégios de tabelas existentes.
- Emite atividade/log: nenhum evento novo. A recusa aparece como erro do Postgres a quem chamou.
- Aparece na tela: não.
- Porta na navegação: não se aplica.
- Mecanismo anti-morte: o invariante de CA-5 lê a lista do laço e reprova tabela sem restrição.
- Laço de retorno: se um caminho legítimo for barrado, a rota devolve erro e o invariante de CA-3
  ganha o caso. Exceção silenciosa conhecida: o aviso do quadro ignora o erro do `insert`.
- Mapa vivo: sem peça nova em `docs/architecture/`.

## 7. Riscos
| Risco | Mitigação |
|---|---|
| Escritor não mapeado quebra | `pnpm test:db` completo e e2e do CI |
| App escreve em `lead_state` uma coluna além de `next_action` | O grant é por coluna; CA-2 executa o `update` real |
| `update.sh` aplica o banco antes de trocar a imagem | Os caminhos do app antigo seguem permitidos; só o aviso do quadro para `viewer` deixa de nascer |
| `agent` ainda insere follow-up em `cron_jobs` | Aceito: é o que a reativação faz, e o `agent` já envia mensagem |
| `agent` ainda insere direto em `agent_inbox_items` um aviso `next_action_ambiguous` com título e corpo próprios | Aceito: é o `insert` que o quadro faz com a sessão dele; a policy limita o `kind`, não o texto |
