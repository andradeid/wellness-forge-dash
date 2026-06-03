ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS is_pregnant BOOLEAN DEFAULT FALSE;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS gestational_weeks INTEGER;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS pregnancy_type TEXT;

-- Grant permissions again just in case, though the table already exists
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patients TO authenticated;
GRANT ALL ON public.patients TO service_role;