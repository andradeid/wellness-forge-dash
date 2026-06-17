
-- 1. AGENT COSTS
CREATE TABLE IF NOT EXISTS public.agent_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  cost_credits INTEGER NOT NULL CHECK (cost_credits >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_costs TO authenticated;
GRANT ALL ON public.agent_costs TO service_role;
ALTER TABLE public.agent_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view agent costs"
  ON public.agent_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage agent costs"
  ON public.agent_costs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_agent_costs_updated_at
  BEFORE UPDATE ON public.agent_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. USER CREDITS
CREATE TABLE IF NOT EXISTS public.user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  monthly_quota INTEGER NOT NULL DEFAULT 0,
  quota_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_credits TO authenticated;
GRANT ALL ON public.user_credits TO service_role;
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own credits"
  ON public.user_credits FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER trg_user_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. CREDIT TRANSACTIONS (ledger)
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_key TEXT,
  agent_label TEXT,
  type TEXT NOT NULL CHECK (type IN ('debit','credit','refund','grant')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  balance_after INTEGER NOT NULL,
  message_preview TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_transactions TO authenticated;
GRANT ALL ON public.credit_transactions TO service_role;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own transactions"
  ON public.credit_transactions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_ct_user_created ON public.credit_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ct_admin_created ON public.credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ct_agent_created ON public.credit_transactions(agent_key, created_at DESC);

-- 4. FUNÇÃO ATÔMICA
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id UUID,
  p_agent_key TEXT,
  p_message_preview TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost INTEGER;
  v_label TEXT;
  v_current_balance INTEGER;
BEGIN
  SELECT cost_credits, display_name INTO v_cost, v_label
  FROM public.agent_costs
  WHERE agent_key = p_agent_key AND is_active = true;

  IF v_cost IS NULL OR v_cost = 0 THEN
    RETURN TRUE;
  END IF;

  SELECT balance INTO v_current_balance
  FROM public.user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_current_balance IS NULL OR v_current_balance < v_cost THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_credits
  SET balance = balance - v_cost, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id, agent_key, agent_label, type, amount, balance_after, message_preview
  ) VALUES (
    p_user_id, p_agent_key, v_label, 'debit', v_cost, (v_current_balance - v_cost), p_message_preview
  );

  RETURN TRUE;
END;
$$;
