-- 0243 — Escrita por papel nas tabelas do agente (Ref. #141; spec
-- docs/specs/sdd/141-escrita-por-papel-nas-tabelas-do-agente)
--
-- As tabelas do laço de policies do motor do agente têm `tenant_isolation_<t>_all` (`for all`, só
-- organização) e revogavam apenas `anon`. `authenticated` ficava com INSERT, UPDATE, DELETE e
-- TRUNCATE: qualquer membro ativo, `viewer` inclusive, escrevia direto pelo PostgREST na fila de
-- jobs, nos agendamentos, no ledger de envio e nas tabelas de proteção.
--
-- Regra nova: fechado por padrão, aberto só o que o app escreve com a sessão do usuário, e com papel
-- `agent`+. O motor (conexão direta) e as rotas com client admin não mudam.
--
-- Sem dado alterado. Idempotente.

do $$
declare
  t text;
begin
  foreach t in array array[
    'agent_inbox_items', 'job_queue', 'send_ledger',
    'playbook_versions', 'playbook_pointers',
    'channel_session_health', 'llm_calls',
    'lead_checkpoints', 'lead_state', 'lead_state_transitions',
    'metrics', 'channel_knobs', 'pacing_ledger', 'outbound_copies',
    'cron_jobs',
    'reentry_template_versions', 'reentry_template_pointers',
    'lead_notes', 'skill_versions', 'skill_pointers',
    'promise_table_versions', 'promise_table_pointers',
    'disclosure_template_versions', 'disclosure_template_pointers',
    'before_send_traces',
    'flywheel_judge_verdicts', 'flywheel_distiller_proposals',
    'judge_alignment_pool',
    'reentry_knob_versions', 'reentry_knob_pointers'
  ]
  loop
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
  end loop;
end
$$;

-- As quatro exceções. A ORDEM IMPORTA: o `revoke` de tabela acima também apaga os privilégios por
-- coluna, então todo `grant` vem DEPOIS dele.
--
-- As policies são RESTRITIVAS: somam por E à permissiva do laço (que continua cuidando da
-- organização). O laço só derruba e recria `tenant_isolation_*`, então elas sobrevivem à reaplicação.

-- 1. Decisão da próxima ação (`leads/[id]/next-action`): só a coluna `next_action`.
grant update (next_action) on public.lead_state to authenticated;
drop policy if exists "lead_state_update_agent" on public.lead_state;
create policy "lead_state_update_agent" on public.lead_state
  as restrictive for update to authenticated
  using (public.fn_role_at_least(organization_id, 'agent'))
  with check (public.fn_role_at_least(organization_id, 'agent'));

-- 2. Checkpoint de retomada (`conversations/[id]/reactivate-bot`): nasce de uma pessoa, não de um job.
grant insert on public.lead_checkpoints to authenticated;
drop policy if exists "lead_checkpoints_insert_agent" on public.lead_checkpoints;
create policy "lead_checkpoints_insert_agent" on public.lead_checkpoints
  as restrictive for insert to authenticated
  with check (public.fn_role_at_least(organization_id, 'agent') and job_id is null);

-- 3. Follow-up da reativação aceita (`leads/[id]/reactivation`).
grant insert on public.cron_jobs to authenticated;
drop policy if exists "cron_jobs_insert_agent" on public.cron_jobs;
create policy "cron_jobs_insert_agent" on public.cron_jobs
  as restrictive for insert to authenticated
  with check (
    public.fn_role_at_least(organization_id, 'agent')
    and kind = 'at'
    and job_kind = 'followup_turn'
  );

-- 4. Aviso de proposta ambígua (`pipelines/[id]/board`).
grant insert on public.agent_inbox_items to authenticated;
drop policy if exists "agent_inbox_items_insert_agent" on public.agent_inbox_items;
create policy "agent_inbox_items_insert_agent" on public.agent_inbox_items
  as restrictive for insert to authenticated
  with check (
    public.fn_role_at_least(organization_id, 'agent')
    and kind = 'next_action_ambiguous'
  );
