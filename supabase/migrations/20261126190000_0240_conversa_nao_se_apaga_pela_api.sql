-- 0240 — Conversa não se apaga pela API (Ref. #99; spec docs/specs/sdd/99-conversa-nao-se-apaga)
--
-- O log das conversas é registro, e hoje é perdível e adulterável por quem não devia:
--  * `conversations_agent_delete` deixa `agent`+ apagar a conversa direto pelo PostgREST, e o
--    cascade leva junto `messages`, `conversation_notes`, `agent_cases` e outras;
--  * `messages_update` e `messages_delete` exigiam só pertencer à organização, então um `viewer`
--    editava e apagava mensagem de conversa que enxergava.
--
-- O que esta migration faz (e só isto — nenhuma coluna, tabela ou função nova; 3 itens, o 3 veio do review do #140):
--  1. tira a policy `conversations_agent_delete` E revoga o privilégio de DELETE de `authenticated`
--     e `anon` em `conversations`. As duas travas juntas de propósito: sob RLS, sem policy
--     permissiva o DELETE já é negado, mas o privilégio revogado continua valendo se uma policy
--     permissiva de DELETE voltar por engano. O `service_role` (cron, workers, cascade de LGPD)
--     segue apagando: ele nunca dependeu desta policy;
--  2. recria `messages_update` e `messages_delete` exigindo papel `agent`+ E conversa visível ao
--     usuário (a mesma regra que `messages_select` já aplica: a RLS de `conversations` vale dentro
--     do `exists`). `fn_is_platform_admin()` segue passando, como nas demais policies.
--
-- Não muda: INSERT em `conversations` e `messages`, a leitura/criação/edição de `contacts`, nem o UPDATE direto em `conversations`
-- (`conversations_agent_update` — a #99 segue aberta por causa dele; ver o "Fora de escopo" da spec).
--
-- Sem função nova: não há EXECUTE a revogar (item 9 da doutrina de migrations não se aplica).
-- Idempotente: `drop policy if exists`, `revoke` (sem efeito se já revogado) e `create` depois do `drop`.

drop policy if exists "conversations_agent_delete" on public.conversations;
revoke delete on public.conversations from authenticated, anon;

drop policy if exists "messages_update" on public.messages;
drop policy if exists "messages_delete" on public.messages;

create policy "messages_update" on public.messages
  for update using (
    public.fn_is_platform_admin()
    or (public.fn_role_at_least(organization_id, 'agent')
        and exists (select 1 from public.conversations c where c.id = messages.conversation_id))
  ) with check (
    public.fn_is_platform_admin()
    or (public.fn_role_at_least(organization_id, 'agent')
        and exists (select 1 from public.conversations c where c.id = messages.conversation_id))
  );

create policy "messages_delete" on public.messages
  for delete using (
    public.fn_is_platform_admin()
    or (public.fn_role_at_least(organization_id, 'agent')
        and exists (select 1 from public.conversations c where c.id = messages.conversation_id))
  );

-- 3. `contacts`: só `manager`+ apaga, TAMBÉM pelo banco (pedido do revisor no #140). Antes,
--    `tenant_isolation_contacts_all` era `FOR ALL` só por organização e `authenticated` tem `GRANT ALL`:
--    um `agent` ou `viewer` apagava contato sem conversa e sem compromisso direto pelo PostgREST (e a
--    cascata leva notas, demandas e follow-ups), mesmo com a rota e o botão exigindo `manager`.
--    A policy `FOR ALL` é separada POR COMANDO: `select`, `insert` e `update` ficam com a MESMA regra de
--    antes (membro da organização, ou administrador de plataforma); só o `delete` muda. Policies
--    permissivas somam por OU, então a `FOR ALL` TEM de sair — manter as duas deixaria o `delete` aberto.
--    `fn_is_platform_admin()` segue passando, como em todas as policies do schema (suporte); a sessão de
--    suporte `full` já chega aqui como papel efetivo `admin`. O nome `tenant_isolation_<t>_all` deixa de
--    valer para esta tabela, de propósito: ela deixou de ser `all`.
drop policy if exists "tenant_isolation_contacts_all" on public.contacts;
drop policy if exists "tenant_isolation_contacts_select" on public.contacts;
drop policy if exists "tenant_isolation_contacts_insert" on public.contacts;
drop policy if exists "tenant_isolation_contacts_update" on public.contacts;
drop policy if exists "contacts_delete_manager" on public.contacts;

create policy "tenant_isolation_contacts_select" on public.contacts
  for select using (
    organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin()
  );

create policy "tenant_isolation_contacts_insert" on public.contacts
  for insert with check (
    organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin()
  );

create policy "tenant_isolation_contacts_update" on public.contacts
  for update using (
    organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin()
  ) with check (
    organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin()
  );

create policy "contacts_delete_manager" on public.contacts
  for delete using (
    public.fn_is_platform_admin() or public.fn_role_at_least(organization_id, 'manager')
  );
