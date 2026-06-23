
-- =====================================================
-- 1) Audit log dedicado (não polui credit_transactions)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.credit_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('adjust_balance','unlimited_on','unlimited_off')),
  delta INTEGER,
  balance_before INTEGER,
  balance_after INTEGER,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_audit_log_user_created
  ON public.credit_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_audit_log_admin_created
  ON public.credit_audit_log(admin_id, created_at DESC);

GRANT SELECT ON public.credit_audit_log TO authenticated;
GRANT ALL ON public.credit_audit_log TO service_role;

ALTER TABLE public.credit_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read credit audit log"
  ON public.credit_audit_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- =====================================================
-- 2) Ajuste atômico de saldo (lock de linha + log)
-- =====================================================
CREATE OR REPLACE FUNCTION public.adjust_user_balance(
  p_user_id UUID,
  p_delta INTEGER,
  p_admin_id UUID,
  p_reason TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before INTEGER;
  v_after INTEGER;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'delta inválido';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'motivo obrigatório';
  END IF;
  IF NOT (
    public.has_role(p_admin_id, 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  -- garante linha e bloqueia
  INSERT INTO public.user_credits (user_id, balance)
    VALUES (p_user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_before
    FROM public.user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;

  v_after := v_before + p_delta;
  IF v_after < 0 THEN
    RAISE EXCEPTION 'saldo ficaria negativo (atual=%, delta=%)', v_before, p_delta;
  END IF;

  UPDATE public.user_credits
     SET balance = v_after, updated_at = now()
   WHERE user_id = p_user_id;

  -- transação financeira "real" (mantém compatibilidade com extratos)
  INSERT INTO public.credit_transactions (
    user_id, type, amount, balance_after, message_preview, metadata
  ) VALUES (
    p_user_id,
    CASE WHEN p_delta > 0 THEN 'grant' ELSE 'debit' END,
    abs(p_delta),
    v_after,
    '[Ajuste manual] ' || p_reason,
    jsonb_build_object('manual', true, 'by', p_admin_id, 'reason', p_reason)
  );

  -- auditoria dedicada
  INSERT INTO public.credit_audit_log (
    user_id, admin_id, action, delta, balance_before, balance_after, reason
  ) VALUES (
    p_user_id, p_admin_id, 'adjust_balance', p_delta, v_before, v_after, p_reason
  );

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_user_balance(UUID,INTEGER,UUID,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.adjust_user_balance(UUID,INTEGER,UUID,TEXT) TO authenticated;

-- =====================================================
-- 3) Toggle ilimitado atômico + log (sem hack na constraint)
-- =====================================================
CREATE OR REPLACE FUNCTION public.toggle_unlimited_credits(
  p_user_id UUID,
  p_unlimited BOOLEAN,
  p_admin_id UUID,
  p_reason TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INTEGER;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'motivo obrigatório';
  END IF;
  IF NOT public.has_role(p_admin_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  INSERT INTO public.subscriptions (user_id, status, plan_type, unlimited_credits)
    VALUES (p_user_id, 'active', 'free', p_unlimited)
    ON CONFLICT (user_id) DO UPDATE SET unlimited_credits = EXCLUDED.unlimited_credits;

  SELECT COALESCE(balance, 0) INTO v_current
    FROM public.user_credits WHERE user_id = p_user_id;

  INSERT INTO public.credit_audit_log (
    user_id, admin_id, action, balance_before, balance_after, reason, metadata
  ) VALUES (
    p_user_id, p_admin_id,
    CASE WHEN p_unlimited THEN 'unlimited_on' ELSE 'unlimited_off' END,
    v_current, v_current, p_reason,
    jsonb_build_object('new_value', p_unlimited)
  );

  RETURN p_unlimited;
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_unlimited_credits(UUID,BOOLEAN,UUID,TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.toggle_unlimited_credits(UUID,BOOLEAN,UUID,TEXT) TO authenticated;

-- =====================================================
-- 4) Índices de FK que faltavam
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_general_chat_messages_chat
  ON public.general_chat_messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_general_chats_created_by
  ON public.general_chats(created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_exams_chat
  ON public.patient_exams(chat_id);
