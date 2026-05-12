CREATE OR REPLACE FUNCTION public.reset_all_dify_conversations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reset_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.patient_chats
  SET dify_conversation_id = NULL,
      updated_at = now()
  WHERE dify_conversation_id IS NOT NULL;

  GET DIAGNOSTICS reset_count = ROW_COUNT;
  RETURN reset_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_all_dify_conversations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_all_dify_conversations() TO authenticated;