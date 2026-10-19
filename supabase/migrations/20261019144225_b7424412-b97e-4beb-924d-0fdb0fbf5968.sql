BEGIN;
WITH candidates AS (
  SELECT s.user_id
  FROM public.subscriptions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.origin IS NULL
    AND p.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = s.user_id AND r.role IN ('super_admin', 'admin', 'support')
    )
), evidence AS (
  SELECT c.user_id, COALESCE(
    (
      SELECT COALESCE(NULLIF(btrim(ph.metadata->>'provider'), ''), 'stripe')
      FROM public.payment_history ph
      WHERE ph.user_id = c.user_id AND ph.status IN ('paid', 'succeeded')
      ORDER BY ph.created_at, ph.id
      LIMIT 1
    ),
    CASE WHEN EXISTS (
      SELECT 1 FROM public.credit_transactions t
      WHERE t.user_id = c.user_id AND t.type = 'grant'
        AND t.metadata->>'source' = 'sorteio_3meses_starter'
    ) THEN 'sorteio' END,
    CASE WHEN EXISTS (
      SELECT 1 FROM public.integration_logs l
      WHERE l.source = 'admin-users' AND l.event = 'manual_user_creation'
        AND l.status = 'success' AND l.payload->>'created_user_id' = c.user_id::text
    ) OR EXISTS (
      SELECT 1 FROM public.credit_transactions t
      WHERE t.user_id = c.user_id AND t.type = 'grant'
        AND t.metadata->>'source' IN ('admin_create_user', 'admin_edit_user')
    ) THEN 'manual' END
  ) AS proposed_origin
  FROM candidates c
)
UPDATE public.subscriptions s
SET origin = e.proposed_origin
FROM evidence e
WHERE s.user_id = e.user_id AND s.origin IS NULL AND e.proposed_origin IS NOT NULL;
COMMIT;