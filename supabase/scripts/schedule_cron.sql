-- supabase/scripts/schedule_cron.sql
-- DO NOT commit with real values substituted.
-- Before running: replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with real values.
-- Find PROJECT_REF: Supabase dashboard → Settings → General → Reference ID
-- Find SERVICE_ROLE_KEY: Supabase dashboard → Settings → API → service_role key

select cron.schedule(
  'whatsapp-lembretes',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-lembretes',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
