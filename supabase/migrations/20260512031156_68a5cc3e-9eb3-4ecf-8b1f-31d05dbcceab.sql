
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pronoun text,
  ADD COLUMN IF NOT EXISTS clinic_name text,
  ADD COLUMN IF NOT EXISTS clinic_logo_url text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('professional-logos', 'professional-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Logos are publicly viewable" ON storage.objects;
CREATE POLICY "Logos are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'professional-logos');

DROP POLICY IF EXISTS "Nutri uploads own logo" ON storage.objects;
CREATE POLICY "Nutri uploads own logo"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'professional-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Nutri updates own logo" ON storage.objects;
CREATE POLICY "Nutri updates own logo"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'professional-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Nutri deletes own logo" ON storage.objects;
CREATE POLICY "Nutri deletes own logo"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'professional-logos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
