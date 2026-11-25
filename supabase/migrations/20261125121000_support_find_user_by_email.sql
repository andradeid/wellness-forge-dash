-- Acha a conta pelo e-mail de LOGIN (auth.users), o mesmo do "Esqueceu a senha ou é seu primeiro acesso?".
-- Usado só pela consulta de conta do suporte (/api/public/support-lookup), com a chave de serviço.
create or replace function public.support_find_user_by_email(p_email text)
returns table(user_id uuid, last_sign_in_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, u.last_sign_in_at
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1
$$;

revoke all on function public.support_find_user_by_email(text) from public, anon, authenticated;
grant execute on function public.support_find_user_by_email(text) to service_role;
