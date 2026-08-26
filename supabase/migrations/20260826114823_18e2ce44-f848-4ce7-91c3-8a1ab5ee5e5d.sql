-- 1) Função: assinatura vigente?
CREATE OR REPLACE FUNCTION public.subscription_is_active(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_end timestamptz;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  -- Papéis internos nunca são bloqueados por vencimento
  IF public.has_role(_user_id, 'super_admin'::app_role)
     OR public.has_role(_user_id, 'admin'::app_role)
     OR public.has_role(_user_id, 'support'::app_role)
     OR public.has_role(_user_id, 'curator'::app_role) THEN
    RETURN true;
  END IF;

  SELECT s.status::text, s.current_period_end
    INTO v_status, v_end
  FROM public.subscriptions s
  WHERE s.user_id = _user_id
  ORDER BY s.current_period_end DESC NULLS LAST
  LIMIT 1;

  -- Sem assinatura registrada: não bloqueia (fallback permissivo)
  IF v_status IS NULL THEN
    RETURN true;
  END IF;

  IF v_status NOT IN ('active', 'trial') THEN
    RETURN false;
  END IF;

  IF v_end IS NULL THEN
    RETURN true;
  END IF;

  RETURN v_end >= now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.subscription_is_active(uuid) TO authenticated, service_role;

-- 2) consume_credits agora devolve jsonb { ok, reason, cost, balance_after }
DROP FUNCTION IF EXISTS public.consume_credits(uuid, text, text);

CREATE OR REPLACE FUNCTION public.consume_credits(p_user_id uuid, p_agent_key text, p_message_preview text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cost INTEGER;
  v_label TEXT;
  v_current_balance INTEGER;
  v_unlimited BOOLEAN;
BEGIN
  SELECT cost_credits, display_name INTO v_cost, v_label
  FROM public.agent_costs
  WHERE agent_key = p_agent_key AND is_active = true;

  IF v_cost IS NULL OR v_cost = 0 THEN
    RETURN jsonb_build_object('ok', true, 'reason', null, 'cost', 0);
  END IF;

  -- Assinatura vencida: somente leitura, nada é debitado
  IF NOT public.subscription_is_active(p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired', 'cost', v_cost);
  END IF;

  SELECT COALESCE(bool_or(unlimited_credits), false) INTO v_unlimited
  FROM public.subscriptions
  WHERE user_id = p_user_id;

  SELECT balance INTO v_current_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_unlimited THEN
    INSERT INTO public.credit_transactions (
      user_id, agent_key, agent_label, type, amount, balance_after, message_preview, metadata
    ) VALUES (
      p_user_id, p_agent_key, v_label, 'debit', v_cost,
      COALESCE(v_current_balance, 0), p_message_preview,
      jsonb_build_object('unlimited', true)
    );
    RETURN jsonb_build_object('ok', true, 'reason', null, 'cost', v_cost,
                              'balance_after', COALESCE(v_current_balance, 0));
  END IF;

  IF v_current_balance IS NULL OR v_current_balance < v_cost THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient', 'cost', v_cost,
                              'balance_after', COALESCE(v_current_balance, 0));
  END IF;

  UPDATE public.user_credits
  SET balance = balance - v_cost, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id, agent_key, agent_label, type, amount, balance_after, message_preview
  ) VALUES (
    p_user_id, p_agent_key, v_label, 'debit', v_cost, (v_current_balance - v_cost), p_message_preview
  );

  RETURN jsonb_build_object('ok', true, 'reason', null, 'cost', v_cost,
                            'balance_after', (v_current_balance - v_cost));
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_credits(uuid, text, text) TO authenticated, service_role;

-- 3) Controle de envio do e-mail de vencimento
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS expiry_email_sent_at timestamptz;

ALTER TABLE public.subscription_expiry_log
  ADD COLUMN IF NOT EXISTS unlimited_desligado boolean NOT NULL DEFAULT false;

-- 4) Job diário: loga E desliga o ilimitado das vencidas
CREATE OR REPLACE FUNCTION public.log_subscription_expiries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  WITH vencidas AS (
    SELECT s.user_id, s.plan_type, s.current_period_end, s.origin,
           s.stripe_customer_id, s.stripe_subscription_id, s.unlimited_credits
    FROM public.subscriptions s
    WHERE s.current_period_end IS NOT NULL
      AND s.current_period_end < now()
      AND s.status IN ('active'::subscription_status, 'trial'::subscription_status)
  )
  INSERT INTO public.subscription_expiry_log (
    user_id, email, plano, current_period_end, dias_vencida,
    tem_gateway, tem_pagamento, origem, detectado_em, detectado_dia, unlimited_desligado
  )
  SELECT
    v.user_id,
    p.email,
    v.plan_type::text,
    v.current_period_end,
    GREATEST(0, (now()::date - v.current_period_end::date))::int,
    (v.stripe_customer_id IS NOT NULL OR v.stripe_subscription_id IS NOT NULL),
    EXISTS (SELECT 1 FROM public.payment_history ph WHERE ph.user_id = v.user_id),
    v.origin,
    now(),
    (now() AT TIME ZONE 'UTC')::date,
    v.unlimited_credits
  FROM vencidas v
  LEFT JOIN public.profiles p ON p.id = v.user_id
  ON CONFLICT (user_id, detectado_dia) DO UPDATE SET
    dias_vencida = EXCLUDED.dias_vencida,
    detectado_em = EXCLUDED.detectado_em,
    plano = EXCLUDED.plano,
    current_period_end = EXCLUDED.current_period_end,
    tem_gateway = EXCLUDED.tem_gateway,
    tem_pagamento = EXCLUDED.tem_pagamento,
    origem = EXCLUDED.origem,
    unlimited_desligado = public.subscription_expiry_log.unlimited_desligado OR EXCLUDED.unlimited_desligado;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Desliga créditos ilimitados de quem venceu
  UPDATE public.subscriptions s
     SET unlimited_credits = false
   WHERE s.current_period_end IS NOT NULL
     AND s.current_period_end < now()
     AND s.status IN ('active'::subscription_status, 'trial'::subscription_status)
     AND s.unlimited_credits = true;

  RETURN v_count;
END;
$$;

-- 5) Template de e-mail de assinatura vencida
INSERT INTO public.email_templates (key, category, name, description, subject, html, variables, is_active)
VALUES (
  'subscription_expired',
  'transactional',
  'Assinatura vencida',
  'Aviso enviado quando a assinatura vence e o consumo de agentes é suspenso.',
  'Sua assinatura da Lumma venceu — renove para continuar',
  '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f7f6f4;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <div style="height:6px;border-radius:99px;background:linear-gradient(90deg,#e8a04c,#e89bcf);margin-bottom:24px"></div>
    <h1 style="font-size:20px;color:#1f2937;margin:0 0 16px">Sua assinatura venceu{{first_name_comma}}</h1>
    <p style="color:#4b5563;line-height:1.6;margin:0 0 12px">
      Sua assinatura <strong>{{plan_name}}</strong> venceu em <strong>{{expired_at}}</strong>.
      Seu acesso continua ativo para consultar pacientes, conversas e relatórios já realizados,
      mas as análises com os agentes da Lumma ficam suspensas até a renovação.
    </p>
    <p style="color:#4b5563;line-height:1.6;margin:0 0 24px">
      Para voltar a usar todas as análises, é só renovar seu plano.
    </p>
    <p style="margin:0 0 24px">
      <a href="{{renew_url}}" style="display:inline-block;background:linear-gradient(90deg,#e8a04c,#e89bcf);color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:99px;font-weight:600">Renovar meu plano</a>
    </p>
    <p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 8px">
      Precisa de ajuda ou quer outra forma de pagamento?
    </p>
    <p style="margin:0 0 24px">
      <a href="{{support_url}}" style="display:inline-block;border:1px solid #e5e7eb;color:#374151;text-decoration:none;padding:10px 20px;border-radius:99px;font-size:14px">Falar com o suporte no WhatsApp</a>
    </p>
    <p style="color:#9ca3af;font-size:12px;margin:0">Equipe Lumma</p>
  </div>
</div>',
  '["first_name_comma","plan_name","expired_at","renew_url","support_url"]'::jsonb,
  true
)
ON CONFLICT (key) DO NOTHING;