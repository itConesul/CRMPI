-- 0244 — notas internas: lê só quem vê a conversa, e chegam ao navegador em tempo real (#137).
--
-- Spec: docs/specs/sdd/137-notas-internas-visibilidade-e-realtime/.
--
-- `conversation_notes_select` só exigia ser da organização, e `conversation_notes_write` era `for all`
-- (concedia leitura também). Quem não via a conversa lia, escrevia e apagava as notas dela. E a tabela
-- não estava na publicação do Realtime, então o aviso de menção e a nota ao vivo não funcionavam.
--
-- A ordem importa: primeiro as políticas, depois a publicação. Publicar com a regra frouxa empurraria
-- o texto da nota ao navegador de quem não pode vê-la.
--
-- O `exists` em `conversations` roda sob a RLS de quem consulta, como em `messages_select`. A escrita
-- exige o mesmo porque um `update`/`delete` sem filtro não passa pela política de leitura.
drop policy if exists "conversation_notes_select" on public.conversation_notes;
create policy "conversation_notes_select" on public.conversation_notes
  for select using (
    public.fn_is_platform_admin()
    or (public.fn_role_at_least(organization_id, 'agent')
        and exists (select 1 from public.conversations c where c.id = conversation_notes.conversation_id))
  );

drop policy if exists "conversation_notes_write" on public.conversation_notes;

drop policy if exists "conversation_notes_insert" on public.conversation_notes;
create policy "conversation_notes_insert" on public.conversation_notes
  for insert with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.conversations c where c.id = conversation_notes.conversation_id)
  );

drop policy if exists "conversation_notes_update" on public.conversation_notes;
create policy "conversation_notes_update" on public.conversation_notes
  for update using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.conversations c where c.id = conversation_notes.conversation_id)
  ) with check (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.conversations c where c.id = conversation_notes.conversation_id)
  );

drop policy if exists "conversation_notes_delete" on public.conversation_notes;
create policy "conversation_notes_delete" on public.conversation_notes
  for delete using (
    organization_id in (select public.fn_user_org_ids())
    and public.fn_role_at_least(organization_id, 'agent')
    and exists (select 1 from public.conversations c where c.id = conversation_notes.conversation_id)
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_notes'
  ) then
    alter publication supabase_realtime add table public.conversation_notes;
  end if;
end $$;
