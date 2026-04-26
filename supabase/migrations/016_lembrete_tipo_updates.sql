-- supabase/migrations/016_lembrete_tipo_updates.sql

-- 1. Add notification-type column to confirmacoes_whatsapp
--    Nullable — only set when there is an actual notification to show in the bell.
--    Sent-but-unanswered reminder rows keep tipo = NULL and stay hidden from the bell.
alter table confirmacoes_whatsapp
  add column if not exists tipo text
    check (tipo in (
      'confirmacao',
      'cancelamento',
      'cancelamento_pos_confirmacao',
      'alerta_sem_resposta'
    ));

-- 2. Update tipo_lembrete check constraint to include new window names
--    Drop old constraint first (Postgres 15+ ALTER TABLE DROP CONSTRAINT IF EXISTS)
alter table confirmacoes_whatsapp
  drop constraint if exists confirmacoes_whatsapp_tipo_lembrete_check;

alter table confirmacoes_whatsapp
  add constraint confirmacoes_whatsapp_tipo_lembrete_check
    check (tipo_lembrete in ('48h', '24h', '2h', 'lembrete_noite', 'lembrete_manha'));

-- 3. Add reminder schedule columns to config_psicologo
alter table config_psicologo
  add column if not exists horario_lembrete_1 time not null default '18:00',
  add column if not exists horario_lembrete_2 time not null default '07:00';

-- 4. Unique constraint: one alerta_sem_resposta per session per day
--    Uses partial index — only one NULL-tipo_lembrete row allowed per session with tipo='alerta_sem_resposta'
create unique index if not exists idx_confirmacoes_alerta_sem_resposta
  on confirmacoes_whatsapp (sessao_id)
  where tipo = 'alerta_sem_resposta';
