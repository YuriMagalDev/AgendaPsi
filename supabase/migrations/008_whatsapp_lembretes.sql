-- Add reminder-type tracking and reschedule flag
alter table confirmacoes_whatsapp
  add column if not exists tipo_lembrete text
    check (tipo_lembrete in ('48h', '24h', '2h')),
  add column if not exists remarcacao_solicitada boolean not null default false;

-- Unique constraint: one record per (session × reminder type) — prevents double-sends
create unique index if not exists idx_confirmacoes_sessao_tipo
  on confirmacoes_whatsapp (sessao_id, tipo_lembrete)
  where tipo_lembrete is not null;
