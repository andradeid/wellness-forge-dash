CREATE OR REPLACE FUNCTION public.disable_unlimited_on_purchase(p_user_id uuid, p_source text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  PERFORM set_config('app.unlimited_source', COALESCE(p_source,'compra'), true);
  PERFORM set_config('app.unlimited_reason', 'Desligado automaticamente: conta comprou plano pago', true);
  UPDATE public.subscriptions SET unlimited_credits = false
   WHERE user_id = p_user_id AND unlimited_credits = true;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END $$;
REVOKE ALL ON FUNCTION public.disable_unlimited_on_purchase(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disable_unlimited_on_purchase(uuid, text) TO service_role;