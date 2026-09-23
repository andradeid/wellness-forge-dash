ALTER TABLE public.user_credits ADD COLUMN IF NOT EXISTS pack_balance integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.refill_monthly_credits()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_count integer := 0;
  v_next timestamptz;
  v_unlimited boolean;
  v_last_refill timestamptz;
  v_new_packs integer;
  v_pack_left integer;
BEGIN
  BEGIN
    FOR r IN
      SELECT uc.user_id, uc.balance, uc.monthly_quota, uc.quota_reset_at, uc.pack_balance
      FROM public.user_credits uc
      WHERE uc.monthly_quota > 0
        AND uc.quota_reset_at IS NOT NULL
        AND uc.quota_reset_at <= now()
        AND public.subscription_is_active(uc.user_id)
      FOR UPDATE
    LOOP
      v_next := r.quota_reset_at;
      WHILE v_next <= now() LOOP
        v_next := v_next + interval '1 month';
      END LOOP;

      SELECT COALESCE(bool_or(s.unlimited_credits), false) INTO v_unlimited
        FROM public.subscriptions s WHERE s.user_id = r.user_id;

      IF v_unlimited THEN
        UPDATE public.user_credits SET quota_reset_at = v_next, updated_at = now()
         WHERE user_id = r.user_id;
        CONTINUE;
      END IF;

      -- Pacotes comprados desde a última reposição (plano é consumido primeiro)
      SELECT max(created_at) INTO v_last_refill FROM public.credit_transactions
       WHERE user_id = r.user_id AND type = 'grant'
         AND metadata->>'source' IN ('monthly_refill_job','manual_refill_suporte');
      SELECT COALESCE(sum(amount),0) INTO v_new_packs FROM public.credit_transactions
       WHERE user_id = r.user_id AND type = 'credit' AND agent_label LIKE 'pack:%'
         AND created_at > COALESCE(v_last_refill, '-infinity'::timestamptz);
      v_pack_left := GREATEST(0, LEAST(r.balance, r.pack_balance + v_new_packs));

      UPDATE public.user_credits
         SET balance = r.monthly_quota + v_pack_left,
             pack_balance = v_pack_left,
             quota_reset_at = v_next,
             updated_at = now()
       WHERE user_id = r.user_id;

      INSERT INTO public.credit_transactions (
        user_id, type, amount, balance_after, agent_key, agent_label, message_preview, metadata
      ) VALUES (
        r.user_id, 'grant', r.monthly_quota, r.monthly_quota + v_pack_left, NULL,
        'Reposição mensal do plano', '[Reposição mensal] Créditos do plano renovados',
        jsonb_build_object('source','monthly_refill_job','balance_before',r.balance,
          'pack_preserved',v_pack_left,'previous_reset_at',r.quota_reset_at,'next_reset_at',v_next)
      );
      v_count := v_count + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.integration_logs (source, event, status, message, payload)
    VALUES ('cron','refill_monthly_credits','error', left(SQLERRM, 500),
            jsonb_build_object('sqlstate', SQLSTATE));
    RETURN -1;
  END;

  INSERT INTO public.integration_logs (source, event, status, message, payload)
  VALUES ('cron','refill_monthly_credits','success',
          format('%s usuário(s) com créditos repostos', v_count),
          jsonb_build_object('count', v_count));
  RETURN v_count;
END;
$function$;