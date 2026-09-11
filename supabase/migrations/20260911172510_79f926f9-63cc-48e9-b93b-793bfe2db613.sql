ALTER TABLE public.dify_error_logs ADD COLUMN IF NOT EXISTS message_id text;
CREATE INDEX IF NOT EXISTS dify_error_logs_message_id_idx ON public.dify_error_logs (message_id);
UPDATE public.dify_error_logs
SET message_id = metadata->>'message_id'
WHERE message_id IS NULL AND metadata->>'message_id' IS NOT NULL;