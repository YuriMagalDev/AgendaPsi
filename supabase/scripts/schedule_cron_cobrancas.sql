-- Schedule cron-cobrancas to run every hour.
-- Run in Supabase SQL Editor after deploying the edge function.
-- Replace the service_role key with your actual key.

select cron.unschedule('cron-cobrancas-hourly')
  from cron.job
 where jobname = 'cron-cobrancas-hourly';

select cron.schedule(
  'cron-cobrancas-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://lipfjcdoppnqlcnoatcg.supabase.co/functions/v1/cron-cobrancas',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body    := '{}'::jsonb
  ) as request_id;
  $$
);
