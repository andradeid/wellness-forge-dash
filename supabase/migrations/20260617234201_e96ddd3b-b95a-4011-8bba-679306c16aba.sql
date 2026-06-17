GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO service_role;