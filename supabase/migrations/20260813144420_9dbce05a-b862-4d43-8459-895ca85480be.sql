CREATE OR REPLACE FUNCTION public.admin_auth_block_status(p_ids uuid[])
RETURNS TABLE (user_id uuid, auth_banned boolean, banned_until timestamptz, last_sign_in_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (
    public.has_role(v_uid, 'super_admin'::app_role)
    OR public.has_role(v_uid, 'admin'::app_role)
    OR public.has_role(v_uid, 'support'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT u.id,
         (u.banned_until IS NOT NULL AND u.banned_until > now()) AS auth_banned,
         u.banned_until,
         u.last_sign_in_at
  FROM auth.users u
  WHERE u.id = ANY(p_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_auth_block_status(uuid[]) TO authenticated;