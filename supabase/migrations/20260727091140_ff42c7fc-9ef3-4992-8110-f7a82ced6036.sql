
-- Cleanup de slots de streaming órfãos a cada minuto
-- Complementa o cleanup oportunista em try_acquire_stream_slot,
-- garantindo que slots presos sejam liberados mesmo sem novo acquire.
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-stale-active-streams');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'cleanup-stale-active-streams',
  '* * * * *',
  $$
  DELETE FROM public.active_streams WHERE started_at < now() - interval '3 minutes';
  DELETE FROM public.rate_limit_hits WHERE hit_at < now() - interval '5 minutes';
  $$
);
