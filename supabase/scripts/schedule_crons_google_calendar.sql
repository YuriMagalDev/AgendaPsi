-- supabase/scripts/schedule_crons_google_calendar.sql
-- Run in Supabase SQL Editor after enabling pg_cron extension
-- Replace YOUR_SERVICE_ROLE_KEY with the actual service role key

select cron.schedule(
  'google-calendar-bidirectional-sync',
  '*/5 10-23 * * 1-5',
  $$
  select
    net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/google-calendar-bidirectional-sync',
      body    := json_build_object('user_id', user_id)::text,
      headers := json_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      )::text
    )
  from config_psicologo
  where google_calendar_bidirectional = true;
  $$
);
