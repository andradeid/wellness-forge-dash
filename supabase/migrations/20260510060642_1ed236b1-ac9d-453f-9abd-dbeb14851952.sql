-- Add new patient fields
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Create storage bucket for patient photos (public read for avatar URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-photos', 'patient-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: files are stored under {patient_id}/...
-- A nutritionist can manage a file only if they created the patient referenced by the first folder segment.

CREATE POLICY "Patient photos are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'patient-photos');

CREATE POLICY "Nutri uploads photos for own patients"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'patient-photos'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND p.created_by = auth.uid()
  )
);

CREATE POLICY "Nutri updates photos for own patients"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'patient-photos'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND p.created_by = auth.uid()
  )
);

CREATE POLICY "Nutri deletes photos for own patients"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'patient-photos'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id::text = (storage.foldername(name))[1]
      AND p.created_by = auth.uid()
  )
);