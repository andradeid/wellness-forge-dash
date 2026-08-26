REVOKE EXECUTE ON FUNCTION public.subscription_is_active(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_credits(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, text, text) TO authenticated, service_role;