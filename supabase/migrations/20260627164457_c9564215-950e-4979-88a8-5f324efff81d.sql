ALTER TABLE public.patient_chats
ADD COLUMN IF NOT EXISTS dify_conversations jsonb NOT NULL DEFAULT '{}'::jsonb;