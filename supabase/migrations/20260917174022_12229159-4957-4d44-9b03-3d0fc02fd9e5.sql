DO $$
DECLARE v_uid uuid := '451c2053-9145-4c62-a95d-e8852f76a68a';
BEGIN
  UPDATE public.subscriptions
     SET plan_type = 'starter', status = 'active', billing_cycle = 'monthly', origin = 'stripe'
   WHERE user_id = v_uid;

  IF NOT EXISTS (
    SELECT 1 FROM public.credit_transactions
     WHERE user_id = v_uid AND metadata->>'source' = 'fix_stripe_nova_oferta'
  ) THEN
    INSERT INTO public.user_credits (user_id, balance, monthly_quota, quota_reset_at)
    VALUES (v_uid, 1000, 1000, '2026-10-16 15:50:51+00')
    ON CONFLICT (user_id) DO UPDATE
      SET balance = GREATEST(public.user_credits.balance, 1000),
          monthly_quota = GREATEST(public.user_credits.monthly_quota, 1000),
          quota_reset_at = COALESCE(public.user_credits.quota_reset_at, EXCLUDED.quota_reset_at),
          updated_at = now();

    INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, agent_label, message_preview, metadata)
    VALUES (v_uid, 'grant', 1000, 1000, 'Plano Starter',
            '[Correção] Créditos do plano Starter (compra Stripe nova oferta)',
            jsonb_build_object('source','fix_stripe_nova_oferta','plan_slug','starter'));
  END IF;
END $$;