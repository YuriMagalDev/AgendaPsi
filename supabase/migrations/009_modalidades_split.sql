-- 009_modalidades_split.sql

-- 1. Create new tables
create table modalidades_sessao (
  id        uuid primary key default uuid_generate_v4(),
  nome      text not null,
  emoji     text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table meios_atendimento (
  id        uuid primary key default uuid_generate_v4(),
  nome      text not null,
  emoji     text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- 2. Seed defaults
insert into modalidades_sessao (nome, emoji) values
  ('Individual',      '👤'),
  ('Casal',           '👥'),
  ('Família',         '👨‍👩‍👧'),
  ('Neurodivergente', '🧩');

insert into meios_atendimento (nome, emoji) values
  ('Presencial', '🏥'),
  ('Online',     '💻'),
  ('Domicílio',  '🏠');

-- 3. Add nullable columns to pacientes and sessoes
alter table pacientes
  add column modalidade_sessao_id uuid references modalidades_sessao(id),
  add column meio_atendimento_id  uuid references meios_atendimento(id);

alter table sessoes
  add column modalidade_sessao_id uuid references modalidades_sessao(id),
  add column meio_atendimento_id  uuid references meios_atendimento(id);

alter table slots_semanais
  add column modalidade_sessao_id uuid references modalidades_sessao(id),
  add column meio_atendimento_id  uuid references meios_atendimento(id);

-- 4. Backfill all existing rows with Individual + Presencial
update pacientes
  set modalidade_sessao_id = (select id from modalidades_sessao where nome = 'Individual'),
      meio_atendimento_id  = (select id from meios_atendimento  where nome = 'Presencial');

update sessoes
  set modalidade_sessao_id = (select id from modalidades_sessao where nome = 'Individual'),
      meio_atendimento_id  = (select id from meios_atendimento  where nome = 'Presencial');

update slots_semanais
  set modalidade_sessao_id = (select id from modalidades_sessao where nome = 'Individual'),
      meio_atendimento_id  = (select id from meios_atendimento  where nome = 'Presencial');

-- 5. Enforce NOT NULL
alter table pacientes
  alter column modalidade_sessao_id set not null,
  alter column meio_atendimento_id  set not null;

alter table sessoes
  alter column modalidade_sessao_id set not null,
  alter column meio_atendimento_id  set not null;

alter table slots_semanais
  alter column modalidade_sessao_id set not null,
  alter column meio_atendimento_id  set not null;

-- 6. Drop old infrastructure
drop index if exists idx_sessoes_modalidade_id;
alter table sessoes        drop column modalidade_id;
alter table slots_semanais drop column modalidade_id;
drop table modalidades;

-- 7. Add indexes
create index idx_sessoes_modalidade_sessao_id   on sessoes(modalidade_sessao_id);
create index idx_sessoes_meio_atendimento_id    on sessoes(meio_atendimento_id);
create index idx_pacientes_modalidade_sessao_id on pacientes(modalidade_sessao_id);
create index idx_pacientes_meio_atendimento_id  on pacientes(meio_atendimento_id);

-- 8. RLS
alter table modalidades_sessao enable row level security;
alter table meios_atendimento  enable row level security;

create policy "auth users full access" on modalidades_sessao
  for all to authenticated using (true) with check (true);

create policy "auth users full access" on meios_atendimento
  for all to authenticated using (true) with check (true);
