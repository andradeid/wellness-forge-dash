ALTER TABLE public.patient_chats
  ADD COLUMN IF NOT EXISTS agent_type text,
  ADD COLUMN IF NOT EXISTS selected_task text;