
DO $$
DECLARE
  v_user uuid := 'a5334d49-6702-4a03-9f60-ef4d1f7b9ee1';
  v_before int;
  v_after int;
BEGIN
  SELECT balance INTO v_before FROM public.user_credits WHERE user_id = v_user FOR UPDATE;
  v_after := v_before + 150;

  UPDATE public.user_credits SET balance = v_after, updated_at = now() WHERE user_id = v_user;

  INSERT INTO public.credit_transactions (user_id, type, amount, balance_after, agent_label, metadata)
  VALUES (v_user, 'credit', 150, v_after, 'pack:avulso-30',
          jsonb_build_object('stripe_session_id','cs_test_b1surqa3lL1rOFEvHXvi6ee46ae84SfmmUi0Xv3eDdn8LZnrs2Ynw1gzAj',
                             'pack_slug','avulso-30','source','stripe_pack_backfill'));

  INSERT INTO public.credit_audit_log (user_id, admin_id, action, delta, balance_before, balance_after, reason, metadata)
  VALUES (v_user, v_user, 'adjust_balance', 150, v_before, v_after, 'pack:avulso-30 (backfill webhook)',
          jsonb_build_object('stripe_session_id','cs_test_b1surqa3lL1rOFEvHXvi6ee46ae84SfmmUi0Xv3eDdn8LZnrs2Ynw1gzAj'));
END $$;
