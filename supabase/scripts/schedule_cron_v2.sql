-- supabase/scripts/schedule_cron_v2.sql
-- Run against Supabase SQL editor.
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with real values.

-- Remove old single cron if it exists
select cron.unschedule('whatsapp-lembretes');

-- Lembrete cron: every 30 minutes (handles both noite and manhã windows)
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

-- Checklist trigger: runs at 21:30 UTC daily (= 18:30 BRT = horario_checklist default + 30min)
select cron.schedule(
  'checklist-trigger',
  '30 21 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/checklist-trigger',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
