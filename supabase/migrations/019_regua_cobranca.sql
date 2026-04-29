-- 019_regua_cobranca.sql
-- NOTE: user_id columns, set_user_id() triggers, and per-user RLS policies are
-- intentionally omitted here. They will be added by migration 017 (multi-tenant
-- plan), which retrofits user_id + RLS across ALL tables uniformly.
-- For now, we follow the existing single-user pattern: RLS enabled with
-- "auth users full access" policy.

-- ============================================================
-- Table 1: regras_cobranca
-- ============================================================
create table if not exists regras_cobranca (
  id                uuid        primary key default gen_random_uuid(),
  etapa             smallint    not null check (etapa in (1, 2, 3)),
  dias_apos         smallint    not null check (dias_apos >= 0),
  template_mensagem text        not null,
  ativo             boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (etapa)
) tablespace pg_default;

create or replace function regras_cobranca_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_regras_cobranca_updated_at on regras_cobranca;
create trigger trg_regras_cobranca_updated_at
  before update on regras_cobranca
  for each row execute function regras_cobranca_set_updated_at();

alter table regras_cobranca enable row level security;

create policy "auth users full access" on regras_cobranca
  for all using (auth.role() = 'authenticated');

-- ============================================================
-- Table 2: cobracas_enviadas
-- ============================================================
create table if not exists cobracas_enviadas (
  id              uuid        primary key default gen_random_uuid(),
  sessao_id       uuid        not null references sessoes(id) on delete cascade,
  etapa           smallint    not null check (etapa in (1, 2, 3)),
  status          text        not null default 'pendente'
                              check (status in ('pendente','agendado','enviado','falha','cancelado')),
  mensagem_texto  text        not null,
  data_agendado   timestamptz not null default now(),
  data_enviado    timestamptz,
  erro_detalhes   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
) tablespace pg_default;

create index if not exists idx_cobracas_enviadas_sessao_id    on cobracas_enviadas(sessao_id);
create index if not exists idx_cobracas_enviadas_status       on cobracas_enviadas(status);
create index if not exists idx_cobracas_enviadas_data_agendado on cobracas_enviadas(data_agendado);

alter table cobracas_enviadas
  add constraint uq_cobracas_sessao_etapa unique (sessao_id, etapa);

create or replace function cobracas_enviadas_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cobracas_enviadas_updated_at on cobracas_enviadas;
create trigger trg_cobracas_enviadas_updated_at
  before update on cobracas_enviadas
  for each row execute function cobracas_enviadas_set_updated_at();

alter table cobracas_enviadas enable row level security;

create policy "auth users full access" on cobracas_enviadas
  for all using (auth.role() = 'authenticated');

-- ============================================================
-- Table 3: extend config_psicologo
-- ============================================================
alter table config_psicologo
  add column if not exists chave_pix             text,
  add column if not exists regua_cobranca_ativa  boolean not null default false,
  add column if not exists regua_cobranca_modo   text    not null default 'manual'
    check (regua_cobranca_modo in ('auto', 'manual'));

comment on column config_psicologo.chave_pix            is 'Chave PIX do psicólogo para inclusão nas mensagens de cobrança';
comment on column config_psicologo.regua_cobranca_ativa is 'Ativa a régua de cobrança automática via WhatsApp';
comment on column config_psicologo.regua_cobranca_modo  is 'auto = disparo automático; manual = fila de aprovação';
