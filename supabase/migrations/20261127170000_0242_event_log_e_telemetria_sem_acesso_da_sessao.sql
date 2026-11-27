-- 0242 — `event_log` e duas telemetrias internas deixam de ser alcançáveis pelo PostgREST
-- (PRD-01 / #67, T3.1; continuação da 0241).
--
-- `event_log.payload` guarda um TRECHO DO CORPO de cada mensagem (`body_preview`, os 280
-- primeiros caracteres, gravado por `fn_emit_message_event`), e a policy `event_log_select`
-- é só por organização: qualquer membro, `viewer` inclusive, lia esse trecho pelo PostgREST
-- sem enxergar a conversa e sem depender de setor. `ai_router_decisions` e
-- `lead_state_transitions` são telemetria interna do agente, com a mesma policy.
-- Decisão do dono em 2026-11-27 (#67, F6): o que não é lido pela tela com a sessão perde o
-- acesso de `authenticated`; só o servidor lê.
--
-- POR QUE SÓ AGORA, E NÃO NA 0241: as três eram lidas por SESSÃO — `event_log` por
-- `ai/operator-metrics`, `ai/usage` e `automation-rules/runs/[runId]/resend`; as outras duas
-- (e `event_log`) pela rota `ai/evolution`. Esta migration viaja JUNTO com a troca dessas
-- quatro rotas para o client admin, com o filtro de `organization_id` na mão. Revogar antes
-- quebraria a tela Evolução e a reexecução de webhook.
--
-- O que NÃO quebra, medido: as funções SQL que leem `event_log` são `security definer`
-- (`fn_service_event_origin`, `fn_appointment_recover`, o gatilho de provisionamento) e
-- rodam como dono; os escritores (`fn_log_event`, o drain, o roteamento) usam `pg` direto ou
-- o client admin; `event_log` não está na publicação do Realtime; `authenticated` já não
-- tinha INSERT nela.
--
-- A policy é MANTIDA, como segundo degrau para o dia em que alguém devolver o grant.
-- Idempotente: revogar privilégio que já não existe não erra, então o update.sh reaplica.
revoke all on table public.event_log from anon, authenticated;
revoke all on table public.ai_router_decisions from anon, authenticated;
revoke all on table public.lead_state_transitions from anon, authenticated;
