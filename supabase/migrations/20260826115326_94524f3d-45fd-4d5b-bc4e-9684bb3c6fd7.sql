CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('subscription-expiry-emails-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'subscription-expiry-emails-daily');

SELECT cron.schedule(
  'subscription-expiry-emails-daily',
  '10 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--5ec30347-6e8c-4c9f-9f04-021ca71170ed.lovable.app/api/public/subscription-expiry-emails',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZGFya3RwZ3l0aXpkZ21tcXJnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzNDg2NzgsImV4cCI6MjA5MzkyNDY3OH0.l4vRyyKIfSozA6-3WkbrkEO1mvDHMjme71w8_XZWjNg"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb
  );
  $$
);