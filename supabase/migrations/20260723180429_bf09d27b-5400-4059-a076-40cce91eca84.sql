CREATE OR REPLACE FUNCTION public.apply_etapa2_migration(p_user_ids uuid[])
RETURNS TABLE(processed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users SET banned_until=NULL, encrypted_password=crypt('Lumma2@102030', gen_salt('bf')), updated_at=now()
    WHERE id = ANY(p_user_ids);

  UPDATE public.profiles SET must_change_password=true, updated_at=now()
    WHERE id = ANY(p_user_ids);

  INSERT INTO public.subscriptions (user_id, plan_type, status, current_period_end, unlimited_credits)
  SELECT uid, 'legado_500'::plan_type, 'active'::subscription_status, '2027-07-23 23:59:59+00'::timestamptz, false
  FROM unnest(p_user_ids) uid
  ON CONFLICT (user_id) DO UPDATE SET
    plan_type='legado_500'::plan_type,
    status='active'::subscription_status,
    current_period_end='2027-07-23 23:59:59+00'::timestamptz,
    unlimited_credits=false,
    updated_at=now();

  INSERT INTO public.user_credits (user_id, balance, monthly_quota)
  SELECT uid, 500, 500 FROM unnest(p_user_ids) uid
  ON CONFLICT (user_id) DO UPDATE SET balance=500, monthly_quota=500, updated_at=now();

  INSERT INTO public.profile_tags (profile_id, tag_id)
  SELECT uid, '90766bce-98af-4dde-89d9-53c846726353'::uuid FROM unnest(p_user_ids) uid
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profile_tags (profile_id, tag_id)
  SELECT uid, '828a8849-3db5-4cca-b586-3a082cb84753'::uuid FROM unnest(p_user_ids) uid
  ON CONFLICT DO NOTHING;

  RETURN QUERY SELECT array_length(p_user_ids,1);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_etapa2_migration(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_etapa2_migration(uuid[]) TO service_role;