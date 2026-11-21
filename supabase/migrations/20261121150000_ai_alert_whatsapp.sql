-- Alertas da trava de IA também por WhatsApp (número do suporte no SIVA)
-- e reconhecimento de falta de cobrança do Gemini/Google.
-- Chave da API do SIVA: integrations.siva_alert_api_key (inserida à parte, não versionada).
alter table public.system_settings add column if not exists alert_whatsapp text;
comment on column public.system_settings.alert_whatsapp is 'WhatsApp (um por linha, com DDD) que recebem os alertas da trava de IA pelo número do suporte (SIVA).';

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
  since timestamptz;
begin
  select greatest(now() - interval '10 minutes', coalesce(max(maintenance_auto_released_at), '-infinity'))
    into since from public.system_settings;

  select count(*), count(distinct user_id) into n, u
  from public.dify_error_logs
  where created_at > since
    and coalesce(agent_type, '') <> 'research'
    and raw_error ~* '(insufficient_quota|credit_balance_exhausted|no credits remaining|credit balance is too low|billing_disabled|billing to be enabled|billing account)';

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

  return case when changed > 0 then reason else null end;
end;
$$;

revoke all on function public.trip_ai_maintenance_if_needed() from public, anon, authenticated;
grant execute on function public.trip_ai_maintenance_if_needed() to service_role;
