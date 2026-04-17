create table slots_semanais (
  id            uuid primary key default uuid_generate_v4(),
  paciente_id   uuid not null references pacientes(id) on delete cascade,
  dia_semana    int  not null check (dia_semana between 0 and 6),
  horario       time not null,
  modalidade_id uuid not null references modalidades(id),
  valor_cobrado numeric(10,2),
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

alter table slots_semanais enable row level security;
create policy "auth users full access"
  on slots_semanais for all to authenticated
  using (true) with check (true);

create index idx_slots_semanais_paciente_id on slots_semanais(paciente_id);
