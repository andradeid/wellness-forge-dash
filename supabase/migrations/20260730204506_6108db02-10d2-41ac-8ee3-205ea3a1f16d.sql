-- Log de auditoria da reconciliação
CREATE TABLE IF NOT EXISTS public.block_reconciliation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  email TEXT,
  plan_type TEXT,
  subscription_status TEXT,
  current_period_end TIMESTAMPTZ,
  was_auth_banned BOOLEAN NOT NULL DEFAULT false,
  was_profile_blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.block_reconciliation_log TO authenticated;
GRANT ALL ON public.block_reconciliation_log TO service_role;

ALTER TABLE public.block_reconciliation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin le log de reconciliacao" ON public.block_reconciliation_log;
CREATE POLICY "super_admin le log de reconciliacao"
ON public.block_reconciliation_log
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_block_reconciliation_log_user
  ON public.block_reconciliation_log(user_id, created_at DESC);

-- Rotina de reconciliação: assinatura ativa => conta nunca bloqueada
CREATE OR REPLACE FUNCTION public.reconcile_subscription_blocks()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  WITH alvo AS (
    SELECT
      s.user_id,
      u.email,
      s.plan_type::text AS plan_type,
      s.status::text AS status,
      s.current_period_end,
      (u.banned_until IS NOT NULL AND u.banned_until > now()) AS auth_banned,
      COALESCE(p.is_blocked, false) AS profile_blocked
    FROM public.subscriptions s
    JOIN auth.users u ON u.id = s.user_id
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE s.status = 'active'
      AND s.current_period_end > now()
      AND (
        (u.banned_until IS NOT NULL AND u.banned_until > now())
        OR COALESCE(p.is_blocked, false) = true
      )
  ),
  log_ins AS (
    INSERT INTO public.block_reconciliation_log
      (user_id, email, plan_type, subscription_status, current_period_end,
       was_auth_banned, was_profile_blocked)
    SELECT user_id, email, plan_type, status, current_period_end,
           auth_banned, profile_blocked
    FROM alvo
    RETURNING user_id
  ),
  unban AS (
    UPDATE auth.users u
       SET banned_until = NULL
      FROM alvo a
     WHERE u.id = a.user_id AND a.auth_banned
    RETURNING u.id
  ),
  unblock AS (
    UPDATE public.profiles p
       SET is_blocked = false
      FROM alvo a
     WHERE p.id = a.user_id AND a.profile_blocked
    RETURNING p.id
  )
  SELECT count(*) INTO v_count FROM log_ins;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_subscription_blocks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_subscription_blocks() TO service_role;

-- Agendamento a cada 15 minutos
DO $$
BEGIN
  PERFORM cron.unschedule('reconcile-subscription-blocks');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'reconcile-subscription-blocks',
  '*/15 * * * *',
  $$ SELECT public.reconcile_subscription_blocks(); $$
);

-- Execução imediata
SELECT public.reconcile_subscription_blocks();