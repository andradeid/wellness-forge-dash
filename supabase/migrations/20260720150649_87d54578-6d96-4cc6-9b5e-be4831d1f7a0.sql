-- Tabela de histórico de pagamentos
CREATE TABLE public.payment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('subscription', 'pack')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'brl',
  status TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'refunded', 'pending')),
  credits_added INTEGER,
  stripe_event_id TEXT,
  stripe_invoice_id TEXT,
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  hosted_invoice_url TEXT,
  receipt_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_history_user_created ON public.payment_history (user_id, created_at DESC);
CREATE UNIQUE INDEX idx_payment_history_event ON public.payment_history (stripe_event_id) WHERE stripe_event_id IS NOT NULL;

GRANT SELECT ON public.payment_history TO authenticated;
GRANT ALL ON public.payment_history TO service_role;

ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payment history"
  ON public.payment_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Super admin can view all payment history"
  ON public.payment_history FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));