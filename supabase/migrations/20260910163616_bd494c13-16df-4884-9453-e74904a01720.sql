CREATE TABLE public.dify_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID,
  chat_id UUID,
  conversation_id TEXT,
  patient_id UUID,
  patient_profile TEXT,
  selected_task TEXT,
  agent_type TEXT,
  error_kind TEXT NOT NULL DEFAULT 'unknown',
  http_status INTEGER,
  raw_error TEXT,
  duration_ms INTEGER,
  had_attachment BOOLEAN NOT NULL DEFAULT false,
  attachment_count INTEGER NOT NULL DEFAULT 0,
  attachment_name TEXT,
  attachment_mime TEXT,
  was_retry BOOLEAN NOT NULL DEFAULT false,
  billed BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'server',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_dify_error_logs_created_at ON public.dify_error_logs (created_at DESC);
CREATE INDEX idx_dify_error_logs_kind ON public.dify_error_logs (error_kind);
CREATE INDEX idx_dify_error_logs_task ON public.dify_error_logs (selected_task);
CREATE INDEX idx_dify_error_logs_user ON public.dify_error_logs (user_id);

GRANT SELECT ON public.dify_error_logs TO authenticated;
GRANT ALL ON public.dify_error_logs TO service_role;

ALTER TABLE public.dify_error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin le registros de erro da IA"
ON public.dify_error_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));