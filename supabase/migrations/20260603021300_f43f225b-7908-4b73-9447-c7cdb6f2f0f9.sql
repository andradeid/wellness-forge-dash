ALTER TABLE public.patient_chats 
ADD COLUMN IF NOT EXISTS exam_context jsonb;