-- Desfaz o Lumma Play (migração 20261022180000_lumma_play.sql).
-- Apaga SÓ os objetos criados por ela. Nenhuma tabela antiga é tocada.
DROP TABLE IF EXISTS public.lumma_play_progress;
DROP TABLE IF EXISTS public.lumma_play_episodes;
DROP TABLE IF EXISTS public.lumma_play_tracks;
DROP TABLE IF EXISTS public.lumma_play_access;
DROP TABLE IF EXISTS public.lumma_play_settings;
DROP FUNCTION IF EXISTS public.lumma_play_can_view();
