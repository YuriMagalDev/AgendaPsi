-- Add payment method to sessions
alter table sessoes add column if not exists forma_pagamento text;

-- Update slots_semanais: add name and package flag, remove value
alter table slots_semanais add column if not exists nome text;
alter table slots_semanais add column if not exists is_pacote boolean not null default false;
alter table slots_semanais drop column if exists valor_cobrado;
