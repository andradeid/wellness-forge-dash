CREATE TABLE public.hubla_pending_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  invoice_id text NOT NULL UNIQUE,
  offer_id text,
  offer_name text,
  amount_cents integer,
  sale_date timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  resolved_user_id uuid,
  resolved_by uuid,
  resolved_at timestamptz
);
GRANT SELECT ON public.hubla_pending_payments TO authenticated;
GRANT ALL ON public.hubla_pending_payments TO service_role;
ALTER TABLE public.hubla_pending_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin lê pendências Hubla" ON public.hubla_pending_payments
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX idx_hubla_pending_unresolved ON public.hubla_pending_payments(resolved, received_at DESC);
CREATE INDEX idx_hubla_pending_email ON public.hubla_pending_payments(lower(email));
COMMENT ON COLUMN public.subscriptions.origin IS 'stripe | kiwify | hubla | migracao_lumma1 | interno | manual';