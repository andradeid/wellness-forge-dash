ALTER TABLE public.general_chats ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMP WITH TIME ZONE;

-- Garantir permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.general_chats TO authenticated;
GRANT ALL ON public.general_chats TO service_role;