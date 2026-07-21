
-- 1) Tabela
CREATE TABLE public.usage_hourly_stats (
  hour_bucket TIMESTAMPTZ PRIMARY KEY,
  active_users INTEGER NOT NULL DEFAULT 0,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  exams_processed INTEGER NOT NULL DEFAULT 0,
  credits_consumed INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_hourly_stats_hour ON public.usage_hourly_stats (hour_bucket DESC);

GRANT SELECT ON public.usage_hourly_stats TO authenticated;
GRANT ALL ON public.usage_hourly_stats TO service_role;

ALTER TABLE public.usage_hourly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read usage stats"
  ON public.usage_hourly_stats
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 2) Função que recomputa uma hora específica
CREATE OR REPLACE FUNCTION public.aggregate_usage_hour(p_hour TIMESTAMPTZ)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hour TIMESTAMPTZ := date_trunc('hour', p_hour);
  v_next TIMESTAMPTZ := v_hour + interval '1 hour';
  v_active_users INT;
  v_messages INT;
  v_exams INT;
  v_credits INT;
BEGIN
  -- Mensagens do usuário (role='user' considera "ativo")
  SELECT COUNT(*)::int, COUNT(DISTINCT created_by)::int
    INTO v_messages, v_active_users
  FROM public.chat_messages
  WHERE created_at >= v_hour AND created_at < v_next;

  -- Exames processados
  SELECT COUNT(*)::int
    INTO v_exams
  FROM public.patient_exams
  WHERE created_at >= v_hour AND created_at < v_next;

  -- Créditos consumidos (debit)
  SELECT COALESCE(SUM(amount), 0)::int
    INTO v_credits
  FROM public.credit_transactions
  WHERE created_at >= v_hour AND created_at < v_next
    AND type = 'debit';

  INSERT INTO public.usage_hourly_stats (
    hour_bucket, active_users, messages_sent, exams_processed, credits_consumed, updated_at
  ) VALUES (
    v_hour, COALESCE(v_active_users, 0), COALESCE(v_messages, 0),
    COALESCE(v_exams, 0), COALESCE(v_credits, 0), now()
  )
  ON CONFLICT (hour_bucket) DO UPDATE SET
    active_users = EXCLUDED.active_users,
    messages_sent = EXCLUDED.messages_sent,
    exams_processed = EXCLUDED.exams_processed,
    credits_consumed = EXCLUDED.credits_consumed,
    updated_at = now();
END;
$$;

-- 3) Função chamada pelo cron: reagrega hora anterior + hora atual (para pegar dados em curso)
CREATE OR REPLACE FUNCTION public.refresh_recent_usage_stats()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.aggregate_usage_hour(date_trunc('hour', now()) - interval '1 hour');
  PERFORM public.aggregate_usage_hour(date_trunc('hour', now()));
END;
$$;

-- 4) Backfill dos últimos 90 dias
DO $$
DECLARE
  v_h TIMESTAMPTZ := date_trunc('hour', now() - interval '90 days');
  v_end TIMESTAMPTZ := date_trunc('hour', now());
BEGIN
  WHILE v_h <= v_end LOOP
    PERFORM public.aggregate_usage_hour(v_h);
    v_h := v_h + interval '1 hour';
  END LOOP;
END $$;

-- 5) Agenda cron horário (5 minutos após a virada da hora)
SELECT cron.schedule(
  'refresh-usage-hourly-stats',
  '5 * * * *',
  $$ SELECT public.refresh_recent_usage_stats(); $$
);
