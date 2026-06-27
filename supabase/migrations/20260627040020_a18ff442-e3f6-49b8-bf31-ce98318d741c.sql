
CREATE TABLE IF NOT EXISTS public.import_nutri_staging (
  email text PRIMARY KEY,
  full_name text,
  phone text,
  plan_type text,
  tag_label text
);
GRANT ALL ON public.import_nutri_staging TO service_role;
ALTER TABLE public.import_nutri_staging ENABLE ROW LEVEL SECURITY;
