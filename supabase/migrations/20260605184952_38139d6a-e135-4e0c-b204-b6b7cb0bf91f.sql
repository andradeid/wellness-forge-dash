ALTER TABLE public.general_chats
ADD COLUMN IF NOT EXISTS dify_conversation_id TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.general_chats TO authenticated;
GRANT ALL ON public.general_chats TO service_role;