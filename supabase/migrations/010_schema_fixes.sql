-- 010_schema_fixes.sql
-- Atomic migration: all-or-nothing. Must run in order.

-- ─────────────────────────────────────────────
-- 1. Create repasses_mensais (split from repasses hybrid table)
-- ─────────────────────────────────────────────
create table repasses_mensais (
  id               uuid primary key default uuid_generate_v4(),
  regra_repasse_id uuid not null references regras_repasse(id),
  mes              date not null,
  valor_calculado  numeric(10,2) not null,
  pago             boolean not null default false,
  data_pagamento   date,
  constraint chk_repasses_mensais_mes_primeiro_dia check (extract(day from mes) = 1),
  unique (regra_repasse_id, mes)
);

alter table repasses_mensais enable row level security;
create policy "auth users full access" on repasses_mensais
  for all to authenticated using (true) with check (true);

create index idx_repasses_mensais_mes on repasses_mensais(mes);
create index idx_repasses_mensais_regra_mes on repasses_mensais(regra_repasse_id, mes);

-- ─────────────────────────────────────────────
-- 2. Migrate existing monthly rows to repasses_mensais
-- ─────────────────────────────────────────────
insert into repasses_mensais (regra_repasse_id, mes, valor_calculado, pago, data_pagamento)
select regra_repasse_id, mes, valor_calculado, pago, data_pagamento
from repasses
where mes is not null;

delete from repasses where mes is not null;

-- ─────────────────────────────────────────────
-- 3. Clean up repasses (remove hybrid columns)
-- ─────────────────────────────────────────────
drop index if exists idx_repasses_regra_mes;
alter table repasses alter column sessao_id set not null;
alter table repasses drop column mes;

create index idx_repasses_sessao_pago on repasses(sessao_id, pago);

-- ─────────────────────────────────────────────
-- 4. pacientes: enforce tipo ↔ convenio_id consistency
-- ─────────────────────────────────────────────
alter table pacientes add constraint chk_convenio_consistente
  check (
    (tipo = 'particular' and convenio_id is null) or
    (tipo = 'convenio'   and convenio_id is not null)
  );

create index idx_pacientes_convenio_id on pacientes(convenio_id);

-- ─────────────────────────────────────────────
-- 5. contratos: max 1 active per patient
-- ─────────────────────────────────────────────
create unique index idx_contratos_unico_ativo
  on contratos(paciente_id) where ativo = true;

-- ─────────────────────────────────────────────
-- 6. despesas: enforce mes = first day of month
-- ─────────────────────────────────────────────
alter table despesas add constraint chk_despesas_mes_primeiro_dia
  check (extract(day from mes) = 1);

-- ─────────────────────────────────────────────
-- 7. config_psicologo: add user_id FK
-- ─────────────────────────────────────────────
alter table config_psicologo
  add column user_id uuid references auth.users(id) on delete cascade;

-- ─────────────────────────────────────────────
-- 8. slots_semanais: add optional end date
-- ─────────────────────────────────────────────
alter table slots_semanais add column data_fim date;

-- ─────────────────────────────────────────────
-- 9. sessoes: drop redundant remarcada_para
--    Source of truth: sessoes WHERE sessao_origem_id = id AND status = 'agendada'
-- ─────────────────────────────────────────────
alter table sessoes drop column remarcada_para;
