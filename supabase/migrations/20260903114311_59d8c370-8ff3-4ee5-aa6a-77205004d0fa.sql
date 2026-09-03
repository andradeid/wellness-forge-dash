CREATE OR REPLACE FUNCTION public.refill_monthly_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_next timestamptz;
  v_unlimited boolean;
BEGIN
  FOR r IN
    SELECT uc.user_id, uc.balance, uc.monthly_quota, uc.quota_reset_at
    FROM public.user_credits uc
    WHERE uc.monthly_quota > 0
      AND uc.quota_reset_at IS NOT NULL
      AND uc.quota_reset_at <= now()
      AND public.subscription_is_active(uc.user_id)
    FOR UPDATE
  LOOP
    -- próxima data: avança de mês em mês até ficar no futuro
    v_next := r.quota_reset_at;
    WHILE v_next <= now() LOOP
      v_next := v_next + interval '1 month';
    END LOOP;

    SELECT COALESCE(bool_or(s.unlimited_credits), false) INTO v_unlimited
      FROM public.subscriptions s WHERE s.user_id = r.user_id;

    IF v_unlimited THEN
      UPDATE public.user_credits
         SET quota_reset_at = v_next, updated_at = now()
       WHERE user_id = r.user_id;
      CONTINUE;
    END IF;

    UPDATE public.user_credits
       SET balance = r.monthly_quota,
           quota_reset_at = v_next,
           updated_at = now()
     WHERE user_id = r.user_id;

    INSERT INTO public.credit_transactions (
      user_id, type, amount, balance_after, agent_key, agent_label, message_preview, metadata
    ) VALUES (
      r.user_id, 'grant', r.monthly_quota, r.monthly_quota, NULL,
      'Reposição mensal do plano', '[Reposição mensal] Créditos do plano renovados',
      jsonb_build_object(
        'source', 'monthly_refill_job',
        'balance_before', r.balance,
        'previous_reset_at', r.quota_reset_at,
        'next_reset_at', v_next
      )
    );

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.integration_logs (source, event, status, message, payload)
  VALUES ('cron', 'refill_monthly_credits', 'success',
          format('%s usuário(s) com créditos repostos', v_count),
          jsonb_build_object('count', v_count));

  RETURN v_count;
END;
$$;

SELECT cron.schedule(
  'refill-monthly-credits-daily',
  '10 5 * * *',
  $$SELECT public.refill_monthly_credits();$$
);