DO $$
DECLARE r record; v_grant int;
BEGIN
  FOR r IN
    SELECT s.user_id, c.balance, c.pack_balance, c.monthly_quota
    FROM subscriptions s JOIN user_credits c ON c.user_id = s.user_id
    WHERE s.origin='kiwify' AND s.status='active' AND s.current_period_end > now()
      AND s.created_at < now() - interval '30 days'
      AND NOT EXISTS (SELECT 1 FROM credit_transactions t WHERE t.user_id=s.user_id
        AND t.created_at > s.created_at + interval '20 days'
        AND (t.agent_label ILIKE '%reposi%' OR t.metadata->>'source' IN ('monthly_refill_job','manual_refill_suporte')))
  LOOP
    v_grant := r.monthly_quota - (r.balance - r.pack_balance);
    IF v_grant > 0 THEN
      UPDATE user_credits SET balance = balance + v_grant, quota_reset_at = COALESCE(quota_reset_at, now() + interval '1 month'), updated_at = now() WHERE user_id = r.user_id;
      INSERT INTO credit_transactions(user_id, type, amount, balance_after, agent_label, message_preview, metadata)
      VALUES (r.user_id, 'grant', v_grant, r.balance + v_grant, 'Reposição mensal do plano',
        '[Reposição pulada] Completado até a cota',
        jsonb_build_object('source','manual_refill_suporte','reason','Reposição do 1º mês pulada (Kiwify)','authorized_by','marcos@setupdigital.com.br'));
    END IF;
  END LOOP;

  -- Natanna: pagou em 23/09 a fatura em atraso; reativa por 30 dias a partir do pagamento.
  UPDATE subscriptions SET status='active', cancelled_at=NULL, current_period_end='2026-10-23 18:35:46+00', updated_at=now()
  WHERE user_id = (SELECT id FROM profiles WHERE email='natannawerneque@hotmail.com');
END $$;