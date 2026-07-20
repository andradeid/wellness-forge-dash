CREATE TABLE public.stripe_webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB
);
GRANT ALL ON public.stripe_webhook_events TO service_role;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.stripe_webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);