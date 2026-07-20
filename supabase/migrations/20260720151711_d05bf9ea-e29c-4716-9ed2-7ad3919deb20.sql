INSERT INTO public.payment_history (user_id, stripe_payment_intent_id, stripe_session_id, kind, description, amount_cents, currency, status, credits_added, metadata, created_at)
SELECT
  ct.user_id,
  ct.metadata->>'stripe_payment_intent',
  ct.metadata->>'stripe_session_id',
  'pack',
  CASE ct.metadata->>'pack_slug'
    WHEN 'avulso-150' THEN 'Avulso 150 créditos'
    WHEN 'avulso-600' THEN 'Avulso 600 créditos'
    WHEN 'avulso-2000' THEN 'Avulso 2000 créditos'
    WHEN 'avulso-30' THEN 'Avulso 150 créditos'
    ELSE 'Pacote de créditos'
  END,
  CASE ct.metadata->>'pack_slug'
    WHEN 'avulso-150' THEN 2990
    WHEN 'avulso-600' THEN 5990
    WHEN 'avulso-2000' THEN 11990
    WHEN 'avulso-30' THEN 2990
    ELSE 0
  END,
  'BRL',
  'paid',
  ct.amount,
  jsonb_build_object('backfill', true, 'pack_slug', ct.metadata->>'pack_slug'),
  ct.created_at
FROM public.credit_transactions ct
WHERE ct.type = 'credit'
  AND ct.metadata->>'source' IN ('stripe_pack','stripe_pack_backfill')
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_history ph
    WHERE ph.stripe_session_id = ct.metadata->>'stripe_session_id'
  );