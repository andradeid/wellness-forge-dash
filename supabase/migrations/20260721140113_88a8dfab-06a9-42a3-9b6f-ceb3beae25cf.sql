
-- 1) Ajusta staging para receber expires_at
ALTER TABLE public.import_nutri_staging
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2) Cria etiqueta ILIMITADO se não existir
INSERT INTO public.user_tags (label, color)
SELECT 'ILIMITADO', '#e8a04c'
WHERE NOT EXISTS (SELECT 1 FROM public.user_tags WHERE label = 'ILIMITADO');

-- 3) Cron diário 03:00 BRT (= 06:00 UTC): expira assinaturas vencidas
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('expire-subscriptions-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-subscriptions-daily');

SELECT cron.schedule(
  'expire-subscriptions-daily',
  '0 6 * * *',
  $$
    UPDATE public.subscriptions
       SET status = 'expired',
           unlimited_credits = false,
           updated_at = now()
     WHERE current_period_end IS NOT NULL
       AND current_period_end < now()
       AND status <> 'expired';
  $$
);
