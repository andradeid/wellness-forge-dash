-- Liberação automática da trava de IA: enquanto a manutenção estiver ligada
-- PELA TRAVA (maintenance_auto_reason preenchido), o pg_cron chama a cada 3 min
-- /api/public/ai-healthcheck, que faz uma chamada mínima ao app
-- "Lumma Healthcheck IA (NÃO APAGAR)" do Dify (gpt-5.4-nano, ~US$ 0,00001).
-- Se responder, desliga a manutenção e avisa a equipe por e-mail.
-- Manutenção ligada à mão (sem auto_reason) nunca é desligada pelo teste.

alter table public.system_settings
  add column if not exists maintenance_auto_released_at timestamptz;

-- Depois de uma liberação, só contam falhas novas (evita religar com as antigas).
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

  return case when changed > 0 then reason else null end;
end;
$$;

revoke all on function public.trip_ai_maintenance_if_needed() from public, anon, authenticated;
grant execute on function public.trip_ai_maintenance_if_needed() to service_role;

-- Job: só dispara a chamada HTTP quando a trava está ligada.
-- (o cabeçalho apikey é a mesma chave pública usada pelo job de e-mails de vencimento)
select cron.schedule(
  'ai-maintenance-probe',
  '*/3 * * * *',
  $job$
  select net.http_post(
    url := 'https://lumma.ia.br/api/public/ai-healthcheck',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', '<CHAVE_PUBLICA_ANON>'),
    body := '{}'::jsonb
  )
  where exists (
    select 1 from public.system_settings
    where maintenance_enabled and maintenance_auto_reason is not null
  );
  $job$
);
