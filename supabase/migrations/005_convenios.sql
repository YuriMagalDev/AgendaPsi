-- 005_convenios.sql

-- New table for health insurance plans
create table convenios (
  id           uuid primary key default uuid_generate_v4(),
  nome         text not null,
  valor_sessao numeric(10,2),
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

alter table convenios enable row level security;
create policy "auth users full access" on convenios
  for all to authenticated using (true) with check (true);

-- Add tipo and convenio_id to pacientes
alter table pacientes
  add column if not exists tipo        text not null default 'particular'
                                        check (tipo in ('particular', 'convenio')),
  add column if not exists convenio_id uuid references convenios(id) on delete set null;

-- Extend repasses to support monthly aggregate records
alter table repasses
  add column if not exists mes date;

alter table repasses
  alter column sessao_id drop not null;

-- Unique constraint so we can upsert one record per (rule, month)
create unique index if not exists idx_repasses_regra_mes
  on repasses (regra_repasse_id, mes)
  where mes is not null;
