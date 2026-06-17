REVOKE EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(UUID, TEXT, TEXT) TO service_role;