-- Lumma Play: bucket público para as capas dos episódios (só imagens; só super admin envia/troca/apaga).
-- Só cria objetos novos. Para desfazer: supabase/rollback/20261022190000_lumma_play_capas_down.sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lumma-play', 'lumma-play', true, 3145728, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DO $pol$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'lumma_play_capas_insert') THEN RETURN; END IF;
  CREATE POLICY lumma_play_capas_insert ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'lumma-play' AND public.has_role(auth.uid(), 'super_admin'));
  CREATE POLICY lumma_play_capas_update ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'lumma-play' AND public.has_role(auth.uid(), 'super_admin'))
    WITH CHECK (bucket_id = 'lumma-play' AND public.has_role(auth.uid(), 'super_admin'));
  CREATE POLICY lumma_play_capas_delete ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'lumma-play' AND public.has_role(auth.uid(), 'super_admin'));
END $pol$;
