ALTER TABLE public.curation_requests ADD COLUMN IF NOT EXISTS image_url TEXT;

CREATE POLICY "curation attachments insert own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'curation-attachments'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'curator'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE POLICY "curation attachments select own or admin"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'curation-attachments'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE POLICY "curation attachments update own or admin"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'curation-attachments'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'super_admin'::app_role))
)
WITH CHECK (
  bucket_id = 'curation-attachments'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'super_admin'::app_role))
);

CREATE POLICY "curation attachments delete own or admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'curation-attachments'
  AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'super_admin'::app_role))
);