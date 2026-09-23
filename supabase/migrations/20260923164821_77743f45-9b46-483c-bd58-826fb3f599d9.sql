CREATE TABLE public.unlimited_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_value boolean,
  new_value boolean NOT NULL,
  changed_by uuid,
  db_role text NOT NULL,
  source text NOT NULL,
  reason text,
  subscription_status text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_unlimited_change_log_user ON public.unlimited_change_log(user_id, created_at DESC);
GRANT SELECT ON public.unlimited_change_log TO authenticated;
GRANT ALL ON public.unlimited_change_log TO service_role;
ALTER TABLE public.unlimited_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin lê mudanças de ilimitado" ON public.unlimited_change_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 1) Cancelamento desliga o ilimitado
CREATE OR REPLACE FUNCTION public.subscriptions_cancel_disables_unlimited()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status = 'canceled'::subscription_status AND NEW.unlimited_credits THEN
    NEW.unlimited_credits := false;
    PERFORM set_config('app.unlimited_reason', 'Desligado automaticamente: assinatura cancelada/reembolsada', true);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_subscriptions_cancel_disables_unlimited
  BEFORE INSERT OR UPDATE OF status, unlimited_credits ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_cancel_disables_unlimited();

-- 2) Registro de toda mudança
CREATE OR REPLACE FUNCTION public.log_unlimited_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old boolean := CASE WHEN TG_OP = 'UPDATE' THEN OLD.unlimited_credits ELSE NULL END;
  v_uid uuid := auth.uid();
  v_src text := NULLIF(current_setting('app.unlimited_source', true), '');
  v_reason text := NULLIF(current_setting('app.unlimited_reason', true), '');
  v_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF TG_OP = 'INSERT' AND NOT NEW.unlimited_credits THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.unlimited_credits IS NOT DISTINCT FROM NEW.unlimited_credits THEN RETURN NEW; END IF;
  v_role := COALESCE(NULLIF(v_role,''), session_user::text);
  IF v_src IS NULL THEN
    v_src := CASE
      WHEN v_uid IS NOT NULL THEN 'painel'
      WHEN v_role = 'service_role' THEN 'servidor (importação/webhook/rotina)'
      ELSE 'banco direto / rotina interna'
    END;
  END IF;
  INSERT INTO public.unlimited_change_log (user_id, old_value, new_value, changed_by, db_role, source, reason, subscription_status)
  VALUES (NEW.user_id, v_old, NEW.unlimited_credits, v_uid, v_role, v_src, v_reason, NEW.status::text);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_unlimited_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_log_unlimited_change
  AFTER INSERT OR UPDATE OF unlimited_credits ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.log_unlimited_change();

-- Painel passa o motivo digitado para o registro
CREATE OR REPLACE FUNCTION public.toggle_unlimited_credits(p_user_id uuid, p_unlimited boolean, p_admin_id uuid, p_reason text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_current INTEGER;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'motivo obrigatório'; END IF;
  IF NOT public.has_role(p_admin_id, 'super_admin'::app_role) THEN RAISE EXCEPTION 'forbidden: super_admin only'; END IF;
  PERFORM set_config('app.unlimited_source', 'painel', true);
  PERFORM set_config('app.unlimited_reason', p_reason, true);
  INSERT INTO public.subscriptions (user_id, status, plan_type, unlimited_credits)
    VALUES (p_user_id, 'active', 'free', p_unlimited)
    ON CONFLICT (user_id) DO UPDATE SET unlimited_credits = EXCLUDED.unlimited_credits;
  SELECT COALESCE(balance, 0) INTO v_current FROM public.user_credits WHERE user_id = p_user_id;
  INSERT INTO public.credit_audit_log (user_id, admin_id, action, balance_before, balance_after, reason, metadata)
  VALUES (p_user_id, p_admin_id, CASE WHEN p_unlimited THEN 'unlimited_on' ELSE 'unlimited_off' END,
    v_current, v_current, p_reason, jsonb_build_object('new_value', p_unlimited));
  RETURN p_unlimited;
END;
$function$;

-- Vencimento: identifica a origem no registro
CREATE OR REPLACE FUNCTION public.log_subscription_expiries()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count INTEGER := 0;
BEGIN
  WITH vencidas AS (
    SELECT s.user_id, s.plan_type, s.current_period_end, s.origin, s.stripe_customer_id, s.stripe_subscription_id, s.unlimited_credits
    FROM public.subscriptions s
    WHERE s.current_period_end IS NOT NULL AND s.current_period_end < now()
      AND s.status IN ('active'::subscription_status, 'trial'::subscription_status)
  )
  INSERT INTO public.subscription_expiry_log (user_id, email, plano, current_period_end, dias_vencida, tem_gateway, tem_pagamento, origem, detectado_em, detectado_dia, unlimited_desligado)
  SELECT v.user_id, p.email, v.plan_type::text, v.current_period_end,
    GREATEST(0, (now()::date - v.current_period_end::date))::int,
    (v.stripe_customer_id IS NOT NULL OR v.stripe_subscription_id IS NOT NULL),
    EXISTS (SELECT 1 FROM public.payment_history ph WHERE ph.user_id = v.user_id),
    v.origin, now(), (now() AT TIME ZONE 'UTC')::date, v.unlimited_credits
  FROM vencidas v LEFT JOIN public.profiles p ON p.id = v.user_id
  ON CONFLICT (user_id, detectado_dia) DO UPDATE SET
    dias_vencida = EXCLUDED.dias_vencida, detectado_em = EXCLUDED.detectado_em, plano = EXCLUDED.plano,
    current_period_end = EXCLUDED.current_period_end, tem_gateway = EXCLUDED.tem_gateway,
    tem_pagamento = EXCLUDED.tem_pagamento, origem = EXCLUDED.origem,
    unlimited_desligado = public.subscription_expiry_log.unlimited_desligado OR EXCLUDED.unlimited_desligado;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM set_config('app.unlimited_source', 'rotina de vencimento', true);
  PERFORM set_config('app.unlimited_reason', 'Desligado automaticamente: assinatura vencida', true);
  UPDATE public.subscriptions s SET unlimited_credits = false
   WHERE s.current_period_end IS NOT NULL AND s.current_period_end < now()
     AND s.status IN ('active'::subscription_status, 'trial'::subscription_status)
     AND s.unlimited_credits = true;
  RETURN v_count;
END;
$function$;