-- 006_despesas.sql

create table despesas (
  id          uuid primary key default uuid_generate_v4(),
  mes         date not null,
  descricao   text not null,
  valor       numeric(10,2) not null,
  criado_em   timestamptz not null default now()
);

alter table despesas enable row level security;
create policy "auth users full access" on despesas
  for all to authenticated using (true) with check (true);

create index idx_despesas_mes on despesas(mes);
