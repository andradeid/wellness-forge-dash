ALTER TABLE public.patient_exam_results
ADD COLUMN IF NOT EXISTS agent_type TEXT;

-- Concede as mesmas permissões que as colunas existentes para os papéis relevantes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_exam_results TO authenticated;
GRANT ALL ON public.patient_exam_results TO service_role;