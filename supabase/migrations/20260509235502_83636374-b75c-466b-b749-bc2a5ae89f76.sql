-- integrations: key/value config store
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  value text,
  is_secret boolean NOT NULL DEFAULT false,
  label text,
  category text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin manages integrations" ON public.integrations;
CREATE POLICY "Super admin manages integrations"
ON public.integrations FOR ALL
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON public.integrations;
CREATE TRIGGER trg_integrations_updated_at
BEFORE UPDATE ON public.integrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- integration_logs: events log
CREATE TABLE IF NOT EXISTS public.integration_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,            -- 'hubla' | 'dify' | 'uazapi' | 'supabase' ...
  event text NOT NULL,             -- 'webhook.payment' | 'api.call' | 'health_check' ...
  status text NOT NULL,            -- 'success' | 'error' | 'warning'
  message text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_created_at
  ON public.integration_logs (created_at DESC);

ALTER TABLE public.integration_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admin reads logs" ON public.integration_logs;
CREATE POLICY "Super admin reads logs"
ON public.integration_logs FOR SELECT
USING (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "Super admin inserts logs" ON public.integration_logs;
CREATE POLICY "Super admin inserts logs"
ON public.integration_logs FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Seed default keys (idempotent, empty values)
INSERT INTO public.integrations (key, label, category, is_secret, description) VALUES
  ('dify_endpoint',     'Dify API Endpoint',  'ai',       false, 'URL base da sua instância Dify (VPS).'),
  ('dify_api_key',      'Dify API Key',       'ai',       true,  'Chave da API do workflow principal.'),
  ('openai_api_key',    'OpenAI API Key',     'ai',       true,  'Usada para chamadas diretas à OpenAI.'),
  ('gemini_api_key',    'Gemini API Key',     'ai',       true,  'Usada para chamadas diretas ao Gemini.'),
  ('hubla_webhook_url', 'Webhook URL',        'payments', false, 'Cole esta URL nas configurações da Hubla.'),
  ('hubla_webhook_secret','Webhook Secret',   'payments', true,  'Segredo usado para validar assinatura do webhook.'),
  ('uazapi_endpoint',   'Uazapi Endpoint',    'whatsapp', false, 'Endpoint do servidor Uazapi.'),
  ('uazapi_token',      'Uazapi Token',       'whatsapp', true,  'Token de acesso à API.'),
  ('uazapi_instance',   'Instance ID',        'whatsapp', false, 'Identificador da instância de WhatsApp.')
ON CONFLICT (key) DO NOTHING;
