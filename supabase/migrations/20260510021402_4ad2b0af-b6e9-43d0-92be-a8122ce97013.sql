
-- patient_chats
CREATE TABLE public.patient_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  dify_conversation_id TEXT,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_chats_patient ON public.patient_chats(patient_id);
CREATE INDEX idx_patient_chats_created_by ON public.patient_chats(created_by);

ALTER TABLE public.patient_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutri selects own chats" ON public.patient_chats
  FOR SELECT USING (auth.uid() = created_by OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Nutri inserts own chats" ON public.patient_chats
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Nutri updates own chats" ON public.patient_chats
  FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Nutri deletes own chats" ON public.patient_chats
  FOR DELETE USING (auth.uid() = created_by);

CREATE TRIGGER trg_patient_chats_updated_at
  BEFORE UPDATE ON public.patient_chats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- chat_messages
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id UUID NOT NULL REFERENCES public.patient_chats(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL DEFAULT '',
  structured_data JSONB,
  attachments JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_chat ON public.chat_messages(chat_id, created_at);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutri selects own messages" ON public.chat_messages
  FOR SELECT USING (
    auth.uid() = created_by OR has_role(auth.uid(), 'super_admin'::app_role)
  );
CREATE POLICY "Nutri inserts own messages" ON public.chat_messages
  FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Nutri updates own messages" ON public.chat_messages
  FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Nutri deletes own messages" ON public.chat_messages
  FOR DELETE USING (auth.uid() = created_by);

-- patient_exams
CREATE TABLE public.patient_exams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  chat_id UUID REFERENCES public.patient_chats(id) ON DELETE SET NULL,
  uploaded_by UUID NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  dify_file_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_patient_exams_patient ON public.patient_exams(patient_id, created_at DESC);

ALTER TABLE public.patient_exams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Nutri selects own exams" ON public.patient_exams
  FOR SELECT USING (auth.uid() = uploaded_by OR has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Nutri inserts own exams" ON public.patient_exams
  FOR INSERT WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Nutri updates own exams" ON public.patient_exams
  FOR UPDATE USING (auth.uid() = uploaded_by);
CREATE POLICY "Nutri deletes own exams" ON public.patient_exams
  FOR DELETE USING (auth.uid() = uploaded_by);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('exams', 'exams', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: path layout = {auth.uid()}/{patient_id}/{filename}
CREATE POLICY "Nutri reads own exam files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'exams'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'super_admin'::app_role))
  );

CREATE POLICY "Nutri uploads own exam files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'exams'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Nutri updates own exam files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'exams'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Nutri deletes own exam files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'exams'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
