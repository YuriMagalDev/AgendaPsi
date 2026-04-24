-- slots_semanais: modality/attendance now optional (inherited from patient)
-- and recurrence interval replaces fixed weekly assumption

alter table slots_semanais
  alter column modalidade_sessao_id drop not null,
  alter column meio_atendimento_id  drop not null,
  add column intervalo_semanas int not null default 1
    check (intervalo_semanas >= 1);

-- pacientes: make modality/attendance nullable so CSV-imported patients
-- can be created without these fields

alter table pacientes
  alter column modalidade_sessao_id drop not null,
  alter column meio_atendimento_id  drop not null;
