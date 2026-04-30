-- 020_google_calendar_sync.sql
-- NOTE: These new tables include user_id from creation.
-- When Plan 1 (multi-tenant) runs, set_user_id triggers and updated RLS will be added.

-- ============================================================
-- 1. New table: google_oauth_tokens
-- ============================================================
create table if not exists google_oauth_tokens (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  google_user_id          text not null,
  refresh_token_encrypted text not null,
  access_token_expiry     bigint not null,
  calendario_id           text not null default 'primary',
  sync_enabled            boolean not null default true,
  bidirectional_enabled   boolean not null default false,
  calendario_nome         text,
  ultimo_sync_em          timestamptz,
  criado_em               timestamptz not null default now(),
  constraint unique_user_google_oauth unique (user_id, google_user_id)
) tablespace pg_default;

create index if not exists idx_google_oauth_tokens_user_id on google_oauth_tokens(user_id);

-- ============================================================
-- 2. New table: sessions_sync_map
-- ============================================================
create table if not exists sessions_sync_map (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  sessao_id           uuid not null references sessoes(id) on delete cascade,
  google_event_id     text not null,
  status_ultima_sync  text not null,
  sincronizado_em     timestamptz not null default now(),
  constraint unique_user_sessao_google unique (user_id, sessao_id),
  constraint unique_user_google_event  unique (user_id, google_event_id)
) tablespace pg_default;

create index if not exists idx_sessions_sync_map_user_id         on sessions_sync_map(user_id);
create index if not exists idx_sessions_sync_map_sessao_id       on sessions_sync_map(sessao_id);
create index if not exists idx_sessions_sync_map_google_event_id on sessions_sync_map(google_event_id);

-- ============================================================
-- 3. New table: sessions_external_busy
-- ============================================================
create table if not exists sessions_external_busy (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  google_event_id     text not null,
  titulo              text not null,
  data_hora_inicio    timestamptz not null,
  data_hora_fim       timestamptz not null,
  descricao           text,
  atualizacao_em      timestamptz,
  sincronizado_em     timestamptz not null default now(),
  constraint unique_user_google_external unique (user_id, google_event_id)
) tablespace pg_default;

create index if not exists idx_sessions_external_busy_user_id   on sessions_external_busy(user_id);
create index if not exists idx_sessions_external_busy_intervalo on sessions_external_busy(user_id, data_hora_inicio, data_hora_fim);

-- ============================================================
-- 4. Extend sessoes table
-- ============================================================
alter table sessoes add column if not exists google_calendar_event_id  text;
alter table sessoes add column if not exists google_calendar_synced_at timestamptz;

create index if not exists idx_sessoes_google_calendar_event_id on sessoes(google_calendar_event_id);

-- ============================================================
-- 5. Extend config_psicologo
-- ============================================================
alter table config_psicologo add column if not exists google_calendar_sync_enabled boolean not null default false;
alter table config_psicologo add column if not exists google_calendar_bidirectional boolean not null default false;
alter table config_psicologo add column if not exists ical_token text unique;

-- ============================================================
-- 6. RLS on all three new tables (single-user pattern)
-- ============================================================
alter table google_oauth_tokens    enable row level security;
alter table sessions_sync_map      enable row level security;
alter table sessions_external_busy enable row level security;

create policy "auth users full access" on google_oauth_tokens
  for all using (auth.role() = 'authenticated');

create policy "auth users full access" on sessions_sync_map
  for all using (auth.role() = 'authenticated');

create policy "auth users full access" on sessions_external_busy
  for all using (auth.role() = 'authenticated');

-- ============================================================
-- 7. Notify-on-delete trigger for sync cleanup
--    NOTE: sessoes.user_id does not exist yet (added in Plan 1/multi-tenant).
--    Sending only sessao_id; edge function handles the rest.
-- ============================================================
create or replace function notify_google_calendar_delete()
returns trigger as $$
begin
  perform pg_notify(
    'google_calendar_delete',
    json_build_object('sessao_id', OLD.id)::text
  );
  return OLD;
end;
$$ language plpgsql security definer;

create trigger trg_notify_google_calendar_delete
  after delete on sessoes
  for each row
  execute function notify_google_calendar_delete();
