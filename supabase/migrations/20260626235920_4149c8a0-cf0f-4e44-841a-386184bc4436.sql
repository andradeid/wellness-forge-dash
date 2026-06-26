INSERT INTO public.user_tags (label, color, created_by)
SELECT label, color, (SELECT user_id FROM public.user_roles WHERE role = 'super_admin' LIMIT 1)
FROM (VALUES
  ('migrado-lumma-1', '#8b5cf6'),
  ('ex-black', '#1f2937'),
  ('ex-premium', '#e8a04c'),
  ('ex-free', '#94a3b8')
) AS t(label, color)
WHERE NOT EXISTS (SELECT 1 FROM public.user_tags ut WHERE ut.label = t.label);

CREATE TABLE IF NOT EXISTS public.import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch TEXT NOT NULL,
  row_number INTEGER,
  email TEXT,
  payload JSONB,
  error_message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

GRANT SELECT, INSERT ON public.import_errors TO authenticated;
GRANT ALL ON public.import_errors TO service_role;

ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin manages import_errors"
ON public.import_errors FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE INDEX IF NOT EXISTS idx_import_errors_batch ON public.import_errors(import_batch, created_at DESC);