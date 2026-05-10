DROP POLICY IF EXISTS "Nutri uploads photos for own patients" ON storage.objects;
DROP POLICY IF EXISTS "Nutri updates photos for own patients" ON storage.objects;
DROP POLICY IF EXISTS "Nutri deletes photos for own patients" ON storage.objects;

CREATE POLICY "Nutri uploads photos for own patients"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'patient-photos'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
      AND p.created_by = auth.uid()
  )
);

CREATE POLICY "Nutri updates photos for own patients"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'patient-photos'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
      AND p.created_by = auth.uid()
  )
);

CREATE POLICY "Nutri deletes photos for own patients"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'patient-photos'
  AND EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
      AND p.created_by = auth.uid()
  )
);