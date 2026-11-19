# PRD-04 · Modo espião: supervisão sem zerar o não lido do titular

**Issue:** #70 — https://github.com/itConesul/CRMPI/issues/70
**Estado:** `rascunho`  <!-- rascunho | em-revisao | aprovada | implementando | concluida | substituida -->
**Autor:** cMoreiraSul (com Claude)
**Medido em:** `365a670` (develop, 2026-11-19)

## Resumo
Hoje **qualquer pessoa que abra uma conversa zera o contador de não lidas do titular**: o handler
de `mark-read` filtra só por `id` e organização. Esta spec propõe (1) que só o titular zere o
próprio contador, no servidor; (2) um toggle opcional "Modo Espião" para `manager`/`admin` no
cabeçalho do chat; (3) auditoria `conversation.spy_viewed` em `api_audit_log`. **Sem migration.**

## Documentos
| Arquivo | Conteúdo |
|---|---|
| [`01-requisitos.md`](01-requisitos.md) | O quê, rastreado à issue, e as perguntas em aberto |
| [`02-design.md`](02-design.md) | Como: o que existe (medido), decisão, riscos, Living System |
| [`03-testes.md`](03-testes.md) | Critério → prova |
| [`04-tarefas.md`](04-tarefas.md) | Ordem de implementação |
| [`05-revisao.md`](05-revisao.md) | Review, decisões e aprovação |

## O que o projeto já responde, e o que vai para o review
Antes de abrir perguntas, o projeto foi varrido (grep em `docs/`, `lib/`, `app/`, `supabase/baseline.sql`).
Resultado, com a medição em [`02-design.md`](02-design.md) §1:

| Questão | O projeto define? | Destino |
|---|---|---|
| "Modo espião" / `spy` já existe? | **Não.** Zero ocorrência fora de nomes de mock em testes | Novo, esta spec |
| O contador pertence ao titular? | **Sim, pelo nome e pelo desenho:** coluna `unread_count_for_assignee`; `fn_conversation_assign` o zera quando o dono muda; a ingestão o incrementa | RF-1 propõe o conserto; **decisão Q1 no review** (a issue diz "a decidir") |
| Há confirmação de leitura enviada ao provedor? | **Não** em `app/`, `lib/`, `workers/` (grep por `markAsRead`/`sendSeen`/`mark_as_read` etc. vazio) | "Ticks cinzas" **não é provável** com o código de hoje → **Q3** |
| Quem vê conversa sem dono? | **Sim:** `fn_can_view_conversation` (baseline 5522) — `manager`/`admin`/`viewer` veem tudo; `agent` vê as suas e as sem dono (default `own_and_unassigned`) | Quem **zera** a sem dono: **não definido → Q2** |
| Como se audita ação de conversa? | **Sim:** `audit()` + vocabulário `AUDIT_ACTIONS` em TS; a coluna `action` não tem CHECK | RF-5 segue o padrão; **granularidade e gatilho → Q4** |
| Resposta também zera o contador? | **Sim, e a issue não menciona:** `messages/_handler.ts` e `fn_mark_conversation_message` (outbound) zeram | Fora do texto da issue → **Q5 (alerta de escopo)** |
| Onde mora o toggle / persiste? | **Não definido** | **Q6** |

## Checklist de aprovação
- [ ] Cada requisito rastreia para um trecho da issue
- [ ] Toda afirmação sobre o código existente cita arquivo e foi verificada
- [ ] Todo critério de aceite tem dono de prova em `03-testes.md`
- [ ] Fora de escopo está explícito
- [ ] Impacto em schema, RLS, API e `.changes/` declarado
- [ ] Living System Checklist respondido em `02-design.md`
- [ ] Perguntas Q1–Q6 decididas e registradas em `05-revisao.md`
- [ ] Revisor registrou a aprovação em `05-revisao.md`
