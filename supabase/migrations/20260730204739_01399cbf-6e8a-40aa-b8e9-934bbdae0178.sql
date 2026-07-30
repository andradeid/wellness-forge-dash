SELECT cron.unschedule('reconcile-subscription-blocks');
SELECT cron.schedule(
  'reconcile-subscription-blocks',
  '0 */12 * * *',
  $$
  SELECT public.reconcile_subscription_blocks();
  $$
);