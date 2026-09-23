CREATE OR REPLACE FUNCTION public.apply_plan_renewal(p_user_id uuid, p_quota integer, p_reason text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance integer;
  v_pack integer;
  v_last timestamptz;
  v_new_packs integer;
  v_pack_left integer;
  v_after integer;
BEGIN
  INSERT INTO public.user_credits (user_id, balance) VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT balance, pack_balance INTO v_balance, v_pack
    FROM public.user_credits WHERE user_id = p_user_id FOR UPDATE;

  SELECT max(created_at) INTO v_last FROM public.credit_transactions
   WHERE user_id = p_user_id AND type IN ('grant','credit')
     AND metadata->>'source' IN ('monthly_refill_job','manual_refill_suporte','stripe_invoice');
  SELECT COALESCE(sum(amount),0) INTO v_new_packs FROM public.credit_transactions
   WHERE user_id = p_user_id AND type = 'credit' AND agent_label LIKE 'pack:%'
     AND created_at > COALESCE(v_last, '-infinity'::timestamptz);
  v_pack_left := GREATEST(0, LEAST(v_balance, v_pack + v_new_packs));
  v_after := p_quota + v_pack_left;

  UPDATE public.user_credits
     SET balance = v_after, pack_balance = v_pack_left, updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, agent_label, message_preview, metadata)
  VALUES (p_user_id, 'credit', p_quota, v_after, p_reason, '[Renovação] Créditos do plano renovados',
    COALESCE(p_metadata,'{}'::jsonb) || jsonb_build_object('balance_before', v_balance, 'pack_preserved', v_pack_left));
  RETURN v_after;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.apply_plan_renewal(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_plan_renewal(uuid, integer, text, jsonb) TO service_role;

-- Reposição mensal também considera a última renovação Stripe como marco
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
      WHERE uc.monthly_quota > 0 AND uc.quota_reset_at IS NOT NULL
        AND uc.quota_reset_at <= now() AND public.subscription_is_active(uc.user_id)
      FOR UPDATE
    LOOP
      v_next := r.quota_reset_at;
      WHILE v_next <= now() LOOP v_next := v_next + interval '1 month'; END LOOP;

      SELECT COALESCE(bool_or(s.unlimited_credits), false) INTO v_unlimited
        FROM public.subscriptions s WHERE s.user_id = r.user_id;
      IF v_unlimited THEN
        UPDATE public.user_credits SET quota_reset_at = v_next, updated_at = now() WHERE user_id = r.user_id;
        CONTINUE;
      END IF;

      SELECT max(created_at) INTO v_last_refill FROM public.credit_transactions
       WHERE user_id = r.user_id AND type IN ('grant','credit')
         AND metadata->>'source' IN ('monthly_refill_job','manual_refill_suporte','stripe_invoice');
      SELECT COALESCE(sum(amount),0) INTO v_new_packs FROM public.credit_transactions
       WHERE user_id = r.user_id AND type = 'credit' AND agent_label LIKE 'pack:%'
         AND created_at > COALESCE(v_last_refill, '-infinity'::timestamptz);
      v_pack_left := GREATEST(0, LEAST(r.balance, r.pack_balance + v_new_packs));

      UPDATE public.user_credits
         SET balance = r.monthly_quota + v_pack_left, pack_balance = v_pack_left,
             quota_reset_at = v_next, updated_at = now()
       WHERE user_id = r.user_id;

      INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, agent_key, agent_label, message_preview, metadata)
      VALUES (r.user_id, 'grant', r.monthly_quota, r.monthly_quota + v_pack_left, NULL,
        'Reposição mensal do plano', '[Reposição mensal] Créditos do plano renovados',
        jsonb_build_object('source','monthly_refill_job','balance_before',r.balance,
          'pack_preserved',v_pack_left,'previous_reset_at',r.quota_reset_at,'next_reset_at',v_next));
      v_count := v_count + 1;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.integration_logs (source, event, status, message, payload)
    VALUES ('cron','refill_monthly_credits','error', left(SQLERRM, 500), jsonb_build_object('sqlstate', SQLSTATE));
    RETURN -1;
  END;

  INSERT INTO public.integration_logs (source, event, status, message, payload)
  VALUES ('cron','refill_monthly_credits','success', format('%s usuário(s) com créditos repostos', v_count), jsonb_build_object('count', v_count));
  RETURN v_count;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.refill_monthly_credits() FROM PUBLIC, anon, authenticated;