-- Trava de segurança: coloca a Lumma em manutenção quando o provedor de IA
-- (OpenAI/Anthropic) fica sem crédito. Caso real: 20/11/2026, 19h — OpenAI sem
-- crédito, 423 falhas em 72 nutricionistas em 14h sem ninguém perceber.
--
-- Regra: 3+ falhas de "sem crédito" em 10 minutos, de 2+ nutricionistas,
-- fora do agente de Pesquisa (que já teve falta de crédito isolada antes).
-- Só liga; quem desliga é o admin (Sistema → Manutenção), depois de recarregar.

alter table public.system_settings
  add column if not exists maintenance_auto_reason text,
  add column if not exists maintenance_auto_at timestamptz;

create or replace function public.trip_ai_maintenance_if_needed()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  u int;
  reason text;
  changed int;
begin
  select count(*), count(distinct user_id) into n, u
  from public.dify_error_logs
  where created_at > now() - interval '10 minutes'
    and coalesce(agent_type, '') <> 'research'
    and raw_error ~* '(insufficient_quota|credit_balance_exhausted|no credits remaining|credit balance is too low)';

  if n < 3 or u < 2 then
    return null;
  end if;

  reason := format('IA sem crédito no provedor: %s falhas de %s nutricionistas em 10 min', n, u);

  update public.system_settings
     set maintenance_enabled = true,
         maintenance_auto_reason = reason,
         maintenance_auto_at = now(),
         updated_at = now(),
         updated_by = null
   where maintenance_enabled = false;
  get diagnostics changed = row_count;

  -- Devolve o motivo só quando acabou de ligar (para mandar o alerta uma vez).
  return case when changed > 0 then reason else null end;
end;
$$;

revoke all on function public.trip_ai_maintenance_if_needed() from public, anon, authenticated;
grant execute on function public.trip_ai_maintenance_if_needed() to service_role;
