-- =============================================================
-- MOCK DATA — Psicologo app
-- Run AFTER all migrations (001–006) have been applied.
-- Safe to re-run: on conflict do nothing.
-- UUID prefix key: aa=pacientes, bb=contratos, cc=convenios,
--   dd=despesas, ee=regras_repasse, ff=repasses
--   10..70=sessoes (por paciente), 80=avulso
-- =============================================================

-- -------------------------
-- Config
-- -------------------------
insert into config_psicologo (nome, horario_inicio, horario_fim, horario_checklist, automacao_whatsapp_ativa)
select 'Dra. Mariana Costa', '08:00', '20:00', '18:00', false
where not exists (select 1 from config_psicologo);

-- -------------------------
-- Modalidades extras
-- -------------------------
insert into modalidades (nome, ativo)
select v.nome, v.ativo from (values
  ('Casal',    true),
  ('Família',  true)
) as v(nome, ativo)
where not exists (select 1 from modalidades where nome = v.nome);

-- -------------------------
-- Convênios
-- -------------------------
insert into convenios (id, nome, valor_sessao, ativo) values
  ('cc000000-0000-0000-0000-000000000001', 'Unimed',         120.00, true),
  ('cc000000-0000-0000-0000-000000000002', 'Bradesco Saúde',  95.00, true),
  ('cc000000-0000-0000-0000-000000000003', 'Amil',           105.00, true)
on conflict (id) do nothing;

-- -------------------------
-- Pacientes
-- -------------------------
insert into pacientes (id, nome, telefone, email, data_nascimento, ativo, tipo, convenio_id) values
  ('aa000000-0000-0000-0000-000000000001', 'Ana Lima',       '11991110001', 'ana@email.com',   '1990-03-15', true, 'particular', null),
  ('aa000000-0000-0000-0000-000000000002', 'Bruno Melo',     '11991110002', 'bruno@email.com', '1985-07-22', true, 'particular', null),
  ('aa000000-0000-0000-0000-000000000003', 'Carla Dias',     '11991110003', 'carla@email.com', '1992-11-08', true, 'particular', null),
  ('aa000000-0000-0000-0000-000000000004', 'Daniel Rocha',   '11991110004', null,              '1978-01-30', true, 'particular', null),
  ('aa000000-0000-0000-0000-000000000005', 'Elisa Martins',  '11991110005', 'elisa@email.com', '1995-06-12', true, 'convenio',   'cc000000-0000-0000-0000-000000000001'),
  ('aa000000-0000-0000-0000-000000000006', 'Felipe Souza',   '11991110006', null,              '1988-09-25', true, 'convenio',   'cc000000-0000-0000-0000-000000000002'),
  ('aa000000-0000-0000-0000-000000000007', 'Gabriela Nunes', '11991110007', 'gabi@email.com',  '2000-04-03', true, 'convenio',   'cc000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- -------------------------
-- Contratos (particulares)
-- -------------------------
insert into contratos (id, paciente_id, tipo, valor, ativo) values
  ('bb000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', 'por_sessao', 200.00, true),
  ('bb000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', 'por_sessao', 180.00, true),
  ('bb000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000003', 'por_sessao', 200.00, true),
  ('bb000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000004', 'mensal',     800.00, true)
on conflict (id) do nothing;

-- -------------------------
-- Regras de repasse
-- -------------------------
insert into regras_repasse (id, nome, tipo_valor, valor, ativo) values
  ('ee000000-0000-0000-0000-000000000001', 'Clínica Centro (20%)', 'percentual', 20.00, true),
  ('ee000000-0000-0000-0000-000000000002', 'Supervisão (fixo)',    'fixo',       400.00, true)
on conflict (id) do nothing;

-- -------------------------
-- Sessões — Abril 2026
-- -------------------------
do $$
declare
  mid_pres uuid := (select id from modalidades where nome = 'Presencial' limit 1);
  mid_onl  uuid := (select id from modalidades where nome = 'Online'     limit 1);
begin

-- Ana Lima — 5 concluídas (4 pagas + 1 pendente) + 1 agendada
insert into sessoes (id, paciente_id, modalidade_id, data_hora, status, valor_cobrado, pago, data_pagamento) values
  ('10000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', mid_pres, '2026-04-01 09:00:00-03', 'concluida', 200, true,  '2026-04-01'),
  ('10000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000001', mid_pres, '2026-04-08 09:00:00-03', 'concluida', 200, true,  '2026-04-08'),
  ('10000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000001', mid_pres, '2026-04-15 09:00:00-03', 'concluida', 200, true,  '2026-04-15'),
  ('10000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000001', mid_pres, '2026-04-22 09:00:00-03', 'concluida', 200, true,  '2026-04-22'),
  ('10000000-0000-0000-0000-000000000005', 'aa000000-0000-0000-0000-000000000001', mid_pres, '2026-04-29 09:00:00-03', 'concluida', 200, false, null),
  ('10000000-0000-0000-0000-000000000006', 'aa000000-0000-0000-0000-000000000001', mid_pres, '2026-05-06 09:00:00-03', 'agendada',  200, false, null)
on conflict (id) do nothing;

-- Bruno Melo — 3 concluídas + 1 faltou + 1 agendada
insert into sessoes (id, paciente_id, modalidade_id, data_hora, status, valor_cobrado, pago, data_pagamento) values
  ('20000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000002', mid_onl,  '2026-04-02 14:00:00-03', 'concluida', 180, true,  '2026-04-02'),
  ('20000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000002', mid_onl,  '2026-04-09 14:00:00-03', 'concluida', 180, true,  '2026-04-09'),
  ('20000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000002', mid_onl,  '2026-04-16 14:00:00-03', 'faltou',    180, false, null),
  ('20000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000002', mid_onl,  '2026-04-23 14:00:00-03', 'concluida', 180, true,  '2026-04-23'),
  ('20000000-0000-0000-0000-000000000005', 'aa000000-0000-0000-0000-000000000002', mid_onl,  '2026-04-30 14:00:00-03', 'agendada',  180, false, null)
on conflict (id) do nothing;

-- Carla Dias — 3 concluídas + 1 cancelada + 1 confirmada
insert into sessoes (id, paciente_id, modalidade_id, data_hora, status, valor_cobrado, pago, data_pagamento) values
  ('30000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000003', mid_pres, '2026-04-03 10:00:00-03', 'concluida', 200, true,  '2026-04-03'),
  ('30000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000003', mid_pres, '2026-04-10 10:00:00-03', 'concluida', 200, true,  '2026-04-10'),
  ('30000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000003', mid_pres, '2026-04-17 10:00:00-03', 'cancelada', 200, false, null),
  ('30000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000003', mid_pres, '2026-04-24 10:00:00-03', 'concluida', 200, true,  '2026-04-24'),
  ('30000000-0000-0000-0000-000000000005', 'aa000000-0000-0000-0000-000000000003', mid_pres, '2026-05-01 10:00:00-03', 'confirmada',200, false, null)
on conflict (id) do nothing;

-- Daniel Rocha — 2 concluídas + 1 agendada
insert into sessoes (id, paciente_id, modalidade_id, data_hora, status, valor_cobrado, pago, data_pagamento) values
  ('40000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000004', mid_pres, '2026-04-04 16:00:00-03', 'concluida', 200, true,  '2026-04-04'),
  ('40000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000004', mid_pres, '2026-04-11 16:00:00-03', 'concluida', 200, true,  '2026-04-11'),
  ('40000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000004', mid_pres, '2026-04-25 16:00:00-03', 'agendada',  200, false, null)
on conflict (id) do nothing;

-- Elisa Martins (Unimed R$120) — 2 concluídas + 1 pendente + 1 agendada
insert into sessoes (id, paciente_id, modalidade_id, data_hora, status, valor_cobrado, pago, data_pagamento) values
  ('50000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000005', mid_pres, '2026-04-05 11:00:00-03', 'concluida', 120, true,  '2026-04-05'),
  ('50000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000005', mid_pres, '2026-04-12 11:00:00-03', 'concluida', 120, true,  '2026-04-12'),
  ('50000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000005', mid_pres, '2026-04-19 11:00:00-03', 'concluida', 120, false, null),
  ('50000000-0000-0000-0000-000000000004', 'aa000000-0000-0000-0000-000000000005', mid_pres, '2026-04-26 11:00:00-03', 'agendada',  120, false, null)
on conflict (id) do nothing;

-- Felipe Souza (Bradesco R$95) — 1 concluída + 1 faltou + 1 agendada
insert into sessoes (id, paciente_id, modalidade_id, data_hora, status, valor_cobrado, pago, data_pagamento) values
  ('60000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000006', mid_onl,  '2026-04-07 13:00:00-03', 'concluida',  95, true,  '2026-04-07'),
  ('60000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000006', mid_onl,  '2026-04-14 13:00:00-03', 'faltou',     95, false, null),
  ('60000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000006', mid_onl,  '2026-04-28 13:00:00-03', 'agendada',   95, false, null)
on conflict (id) do nothing;

-- Gabriela Nunes (Unimed R$120) — 2 concluídas + 1 confirmada
insert into sessoes (id, paciente_id, modalidade_id, data_hora, status, valor_cobrado, pago, data_pagamento) values
  ('70000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000007', mid_pres, '2026-04-08 15:00:00-03', 'concluida', 120, true,  '2026-04-08'),
  ('70000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000007', mid_pres, '2026-04-15 15:00:00-03', 'concluida', 120, true,  '2026-04-15'),
  ('70000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000007', mid_pres, '2026-04-29 15:00:00-03', 'confirmada',120, false, null)
on conflict (id) do nothing;

-- Sessão avulsa
insert into sessoes (id, paciente_id, avulso_nome, avulso_telefone, modalidade_id, data_hora, status, valor_cobrado, pago) values
  ('80000000-0000-0000-0000-000000000001', null, 'João (Avulso)', '11999990099', mid_pres, '2026-04-18 17:00:00-03', 'concluida', 200, true)
on conflict (id) do nothing;

end $$;

-- -------------------------
-- Despesas — Abril 2026
-- -------------------------
insert into despesas (id, mes, descricao, valor) values
  ('dd000000-0000-0000-0000-000000000001', '2026-04-01', 'Aluguel da sala',              850.00),
  ('dd000000-0000-0000-0000-000000000002', '2026-04-01', 'Espaço compartilhado (tarde)', 300.00),
  ('dd000000-0000-0000-0000-000000000003', '2026-04-01', 'Material de escritório',        85.00)
on conflict (id) do nothing;

-- Despesas — Março 2026
insert into despesas (id, mes, descricao, valor) values
  ('dd000000-0000-0000-0000-000000000004', '2026-03-01', 'Aluguel da sala',              850.00),
  ('dd000000-0000-0000-0000-000000000005', '2026-03-01', 'Espaço compartilhado (tarde)', 300.00)
on conflict (id) do nothing;

-- -------------------------
-- Repasses mensais
-- Recebido abril: 800(Ana)+540(Bruno)+600(Carla)+400(Daniel)+240(Elisa)+95(Felipe)+240(Gabriela)+200(Avulso) = 3.115
-- 20% de 3.115 = 623,00
-- -------------------------
insert into repasses (id, regra_repasse_id, sessao_id, mes, valor_calculado, pago, data_pagamento) values
  ('ff000000-0000-0000-0000-000000000001', 'ee000000-0000-0000-0000-000000000001', null, '2026-04-01', 623.00, false, null),
  ('ff000000-0000-0000-0000-000000000002', 'ee000000-0000-0000-0000-000000000002', null, '2026-04-01', 400.00, true,  '2026-04-05')
on conflict (id) do nothing;

-- Repasses — Março 2026 (ambos pagos)
insert into repasses (id, regra_repasse_id, sessao_id, mes, valor_calculado, pago, data_pagamento) values
  ('ff000000-0000-0000-0000-000000000003', 'ee000000-0000-0000-0000-000000000001', null, '2026-03-01', 580.00, true, '2026-03-31'),
  ('ff000000-0000-0000-0000-000000000004', 'ee000000-0000-0000-0000-000000000002', null, '2026-03-01', 400.00, true, '2026-03-05')
on conflict (id) do nothing;
