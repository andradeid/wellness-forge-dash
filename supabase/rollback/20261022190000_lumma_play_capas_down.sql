-- Desfaz 20261022190000_lumma_play_capas.sql (apague antes os arquivos do bucket pelo painel do Supabase).
DROP POLICY IF EXISTS lumma_play_capas_insert ON storage.objects;
DROP POLICY IF EXISTS lumma_play_capas_update ON storage.objects;
DROP POLICY IF EXISTS lumma_play_capas_delete ON storage.objects;
DELETE FROM storage.buckets WHERE id = 'lumma-play';
