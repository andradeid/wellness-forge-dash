CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(p_since timestamptz, p_prev_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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

  WITH nutri AS (
    SELECT user_id FROM public.user_roles WHERE role = 'nutri'::app_role
  ),
  act AS (
    SELECT created_by AS uid, created_at FROM public.patient_chats WHERE created_at >= p_since
    UNION ALL
    SELECT uploaded_by, created_at FROM public.patient_exams WHERE created_at >= p_since
    UNION ALL
    SELECT user_id, created_at FROM public.credit_transactions WHERE created_at >= p_since AND type = 'debit'
  ),
  last_act AS (
    SELECT uid, max(created_at) AS last FROM (
      SELECT created_by AS uid, created_at FROM public.patient_chats
      UNION ALL SELECT uploaded_by, created_at FROM public.patient_exams
      UNION ALL SELECT user_id, created_at FROM public.credit_transactions
    ) x GROUP BY uid
  ),
  per_user AS (
    SELECT n.user_id AS uid,
      (SELECT count(*) FROM public.credit_transactions t WHERE t.user_id = n.user_id AND t.type='debit' AND t.created_at >= p_since) AS analyses,
      (SELECT count(*) FROM public.patient_exams e WHERE e.uploaded_by = n.user_id AND e.created_at >= p_since) AS exams,
      (SELECT count(*) FROM public.patient_chats c WHERE c.created_by = n.user_id AND c.created_at >= p_since) AS chats
    FROM nutri n
  ),
  weekly AS (
    SELECT to_char(g.wk,'DD/MM') AS label,
      (SELECT count(*) FROM public.credit_transactions t
        WHERE t.type='debit' AND t.created_at >= g.wk AND t.created_at < g.wk + interval '7 days') AS v,
      g.wk
    FROM generate_series(date_trunc('week', v_now) - interval '7 weeks', date_trunc('week', v_now), interval '1 week') AS g(wk)
  ),
  growth AS (
    SELECT to_char(g.ms,'TMMon') AS label,
      (SELECT count(*) FROM public.profiles p WHERE p.created_at >= g.ms AND p.created_at < g.ms + interval '1 month') AS v,
      g.ms
    FROM generate_series(date_trunc('month', v_now) - interval '5 months', date_trunc('month', v_now), interval '1 month') AS g(ms)
  )
  SELECT jsonb_build_object(
    'activeNutris', (SELECT count(DISTINCT uid) FROM act),
    'activeSubs', (SELECT count(*) FROM public.subscriptions WHERE status='active'),
    'trialSubs', (SELECT count(*) FROM public.subscriptions WHERE status='trial'),
    'periodAnalyses', (SELECT count(*) FROM public.credit_transactions WHERE type='debit' AND created_at >= p_since),
    'prevAnalyses', (SELECT count(*) FROM public.credit_transactions WHERE type='debit' AND created_at >= p_prev_since AND created_at < p_since),
    'periodExams', (SELECT count(*) FROM public.patient_exams WHERE created_at >= p_since),
    'periodChats', (SELECT count(*) FROM public.patient_chats WHERE created_at >= p_since),
    'creditsConsumed', (SELECT COALESCE(sum(amount),0) FROM public.credit_transactions WHERE type='debit' AND created_at >= p_since),
    'creditsAvailable', (SELECT COALESCE(sum(COALESCE(balance,0) + COALESCE(monthly_quota,0)),0) FROM public.user_credits),
    'totalNutris', (SELECT count(*) FROM nutri),
    'trialExpiring', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT s.user_id, s.plan_type, s.current_period_end, p.full_name, p.email
        FROM public.subscriptions s LEFT JOIN public.profiles p ON p.id = s.user_id
        WHERE s.status='trial' AND s.current_period_end >= v_now AND s.current_period_end <= v_now + interval '7 days'
        ORDER BY s.current_period_end LIMIT 6
      ) x), '[]'::jsonb),
    'inactive', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT p.id, p.full_name, p.email, la.last
        FROM nutri n
        JOIN public.profiles p ON p.id = n.user_id
        LEFT JOIN last_act la ON la.uid = n.user_id
        WHERE la.last IS NULL OR la.last < v_now - interval '15 days'
        ORDER BY la.last ASC NULLS FIRST LIMIT 5
      ) x), '[]'::jsonb),
    'inactiveCount', (
      SELECT count(*) FROM nutri n LEFT JOIN last_act la ON la.uid = n.user_id
      WHERE la.last IS NULL OR la.last < v_now - interval '15 days'),
    'topNutris', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT p.id, p.full_name, p.email, pu.analyses, pu.exams, pu.chats, la.last
        FROM per_user pu
        JOIN public.profiles p ON p.id = pu.uid
        LEFT JOIN last_act la ON la.uid = pu.uid
        WHERE pu.analyses + pu.exams + pu.chats > 0
        ORDER BY pu.analyses DESC, pu.exams DESC, pu.chats DESC LIMIT 8
      ) x), '[]'::jsonb),
    'weekly', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'v', v) ORDER BY wk) FROM weekly), '[]'::jsonb),
    'growth', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'v', v) ORDER BY ms) FROM growth), '[]'::jsonb),
    'planDist', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', COALESCE(plan_type,'—'), 'v', c)) FROM (
        SELECT plan_type, count(*) AS c FROM public.subscriptions GROUP BY plan_type ORDER BY count(*) DESC
      ) y), '[]'::jsonb),
    'funcRank', jsonb_build_array(
      jsonb_build_object('name','Análise IA','v',(SELECT count(*) FROM public.credit_transactions WHERE type='debit' AND created_at >= p_since)),
      jsonb_build_object('name','Conversas','v',(SELECT count(*) FROM public.patient_chats WHERE created_at >= p_since)),
      jsonb_build_object('name','Exames','v',(SELECT count(*) FROM public.patient_exams WHERE created_at >= p_since))
    ),
    'logs', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT id, created_at, event, status, message FROM public.integration_logs
        ORDER BY created_at DESC LIMIT 8
      ) x), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard_stats(timestamptz, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(timestamptz, timestamptz) TO service_role;