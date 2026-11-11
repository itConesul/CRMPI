-- 0238 — fn_conta_existe_por_email: "este e-mail já tem conta confirmada?"
--
-- Para a tela do convite decidir o caminho do convidado (entrar ou criar conta)
-- em vez de pedir que a pessoa escolha. `auth` não é exposto pela REST, então a
-- pergunta precisa de uma função. Ela só LÊ e devolve um booleano.
--
-- Conta não confirmada NÃO conta como conta: quem se cadastrou e nunca clicou
-- no link não consegue entrar, e o caminho certo para ela é o cadastro (que
-- reenvia a confirmação), não o login.
--
-- Só o service_role chama (o servidor da aplicação, depois de validar o token do
-- convite). anon e authenticated não: seria um oráculo de "este e-mail tem
-- cadastro" aberto a qualquer um com a chave pública.
create or replace function public.fn_conta_existe_por_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
      from auth.users u
     where lower(u.email) = lower(btrim(p_email))
       and u.email_confirmed_at is not null
       and u.deleted_at is null
  );
$$;

revoke execute on function public.fn_conta_existe_por_email(text) from public, anon, authenticated;
grant  execute on function public.fn_conta_existe_por_email(text) to service_role;
