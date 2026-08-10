-- 1) Coluna de origem
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS origin TEXT;
COMMENT ON COLUMN public.subscriptions.origin IS 'stripe | kiwify | migracao_lumma1 | interno | manual';

-- 2) Tabela de log de vencimentos (somente observacional)
CREATE TABLE IF NOT EXISTS public.subscription_expiry_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT,
  plano TEXT,
  current_period_end TIMESTAMPTZ,
  dias_vencida INTEGER NOT NULL DEFAULT 0,
  tem_gateway BOOLEAN NOT NULL DEFAULT false,
  tem_pagamento BOOLEAN NOT NULL DEFAULT false,
  origem TEXT,
  detectado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_expiry_log
  ADD COLUMN IF NOT EXISTS detectado_dia DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_expiry_log_user_day_uq
  ON public.subscription_expiry_log (user_id, detectado_dia);
CREATE INDEX IF NOT EXISTS subscription_expiry_log_detectado_idx
  ON public.subscription_expiry_log (detectado_em DESC);

GRANT SELECT ON public.subscription_expiry_log TO authenticated;
GRANT ALL ON public.subscription_expiry_log TO service_role;

ALTER TABLE public.subscription_expiry_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins leem log de vencimentos"
ON public.subscription_expiry_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role));

-- 3) Rotina diária: apenas registra, nao altera status
CREATE OR REPLACE FUNCTION public.log_subscription_expiries()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO public.subscription_expiry_log (
    user_id, email, plano, current_period_end, dias_vencida,
    tem_gateway, tem_pagamento, origem, detectado_em, detectado_dia
  )
  SELECT
    s.user_id,
    p.email,
    s.plan_type::text,
    s.current_period_end,
    GREATEST(0, (now()::date - s.current_period_end::date))::int,
    (s.stripe_customer_id IS NOT NULL OR s.stripe_subscription_id IS NOT NULL),
    EXISTS (SELECT 1 FROM public.payment_history ph WHERE ph.user_id = s.user_id),
    s.origin,
    now(),
    (now() AT TIME ZONE 'UTC')::date
  FROM public.subscriptions s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE s.current_period_end IS NOT NULL
    AND s.current_period_end < now()
    AND s.status IN ('active'::subscription_status, 'trial'::subscription_status)
  ON CONFLICT (user_id, detectado_dia) DO UPDATE SET
    dias_vencida = EXCLUDED.dias_vencida,
    detectado_em = EXCLUDED.detectado_em,
    plano = EXCLUDED.plano,
    current_period_end = EXCLUDED.current_period_end,
    tem_gateway = EXCLUDED.tem_gateway,
    tem_pagamento = EXCLUDED.tem_pagamento,
    origem = EXCLUDED.origem;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 4) Panorama para o card do dashboard admin
CREATE OR REPLACE FUNCTION public.admin_subscription_expiry_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin'::app_role) OR public.has_role(v_uid,'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT
      s.user_id,
      p.email,
      p.full_name,
      s.plan_type::text AS plano,
      s.status::text AS situacao,
      s.current_period_end,
      COALESCE(s.origin,'manual') AS origem,
      (s.current_period_end::date - v_now::date)::int AS dias_restantes,
      (v_now::date - s.current_period_end::date)::int AS dias_vencida,
      (SELECT max(x.last) FROM (
         SELECT max(c.created_at) AS last FROM public.patient_chats c WHERE c.created_by = s.user_id
         UNION ALL SELECT max(e.created_at) FROM public.patient_exams e WHERE e.uploaded_by = s.user_id
         UNION ALL SELECT max(t.created_at) FROM public.credit_transactions t WHERE t.user_id = s.user_id
      ) x) AS ultimo_uso
    FROM public.subscriptions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.current_period_end IS NOT NULL
      AND s.status IN ('active'::subscription_status,'trial'::subscription_status)
  ),
  venc7 AS (SELECT * FROM base WHERE current_period_end >= v_now AND current_period_end < v_now + interval '7 days'),
  venc30 AS (SELECT * FROM base WHERE current_period_end >= v_now AND current_period_end < v_now + interval '30 days'),
  vencidas AS (SELECT * FROM base WHERE current_period_end < v_now),
  vencidas_uso AS (SELECT * FROM vencidas WHERE ultimo_uso >= v_now - interval '7 days'),
  job AS (
    SELECT d.status, d.start_time, d.return_message
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = 'expire-subscriptions-daily'
    ORDER BY d.start_time DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'counts', jsonb_build_object(
      'venc7', (SELECT count(*) FROM venc7),
      'venc30', (SELECT count(*) FROM venc30),
      'vencidas', (SELECT count(*) FROM vencidas),
      'vencidasComUso', (SELECT count(*) FROM vencidas_uso)
    ),
    'listas', jsonb_build_object(
      'venc7', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.current_period_end) FROM venc7 v),'[]'::jsonb),
      'venc30', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.current_period_end) FROM venc30 v),'[]'::jsonb),
      'vencidas', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.current_period_end) FROM vencidas v),'[]'::jsonb),
      'vencidasComUso', COALESCE((SELECT jsonb_agg(to_jsonb(v) ORDER BY v.ultimo_uso DESC) FROM vencidas_uso v),'[]'::jsonb)
    ),
    'job', COALESCE((SELECT to_jsonb(j) FROM job j), 'null'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;