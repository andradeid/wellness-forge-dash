CREATE OR REPLACE FUNCTION public.admin_auth_banned_ids()
RETURNS TABLE (user_id uuid)
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
  SELECT u.id FROM auth.users u
  WHERE u.banned_until IS NOT NULL AND u.banned_until > now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_auth_banned_ids() TO authenticated;