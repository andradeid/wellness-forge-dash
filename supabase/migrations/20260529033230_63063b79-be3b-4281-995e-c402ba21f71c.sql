ALTER TABLE public.patient_exam_results ADD COLUMN IF NOT EXISTS category text;

-- Since the table already exists and we are adding a column, we should ensure the grants are still correct if they were somehow missing, 
-- but usually they are preserved. For safety and consistency with instructions:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_exam_results TO authenticated;
GRANT ALL ON public.patient_exam_results TO service_role;
