CREATE TABLE public.general_chats (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT,
  agent_type  TEXT NOT NULL DEFAULT 'research',
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.general_chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id    UUID REFERENCES public.general_chats(id) 
             ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT,
  agent_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: usuário vê só as próprias conversas
ALTER TABLE public.general_chats 
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_chat_messages 
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own general_chats"
  ON public.general_chats FOR ALL
  USING (created_by = auth.uid());

CREATE POLICY "users own general_chat_messages"
  ON public.general_chat_messages FOR ALL
  USING (
    chat_id IN (
      SELECT id FROM public.general_chats 
      WHERE created_by = auth.uid()
    )
  );

GRANT ALL ON public.general_chats TO authenticated;
GRANT ALL ON public.general_chats TO service_role;
GRANT ALL ON public.general_chat_messages TO authenticated;
GRANT ALL ON public.general_chat_messages TO service_role;