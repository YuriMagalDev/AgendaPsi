-- 021_pacientes_em_risco.sql

-- ── 1. risco_config ──────────────────────────────────────────
create table risco_config (
  id                              uuid primary key default uuid_generate_v4(),
  user_id                         uuid not null references auth.users(id) on delete cascade,
  min_cancelamentos_seguidos      int  not null default 2
    check (min_cancelamentos_seguidos >= 2 and min_cancelamentos_seguidos <= 10),
  dias_sem_sessao                 int  not null default 30
    check (dias_sem_sessao >= 7 and dias_sem_sessao <= 180),
  dias_apos_falta_sem_agendamento int  not null default 7
    check (dias_apos_falta_sem_agendamento >= 1 and dias_apos_falta_sem_agendamento <= 30),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint risco_config_user_unique unique (user_id)
);

alter table risco_config enable row level security;
create policy "tenant_isolation" on risco_config
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index idx_risco_config_user_id on risco_config(user_id);
-- NOTE: set_user_id() triggers omitted — will be added by migration 017 (multi-tenant plan).
-- RLS with check (user_id = auth.uid()) enforces isolation for now.

-- ── 2. risco_templates ───────────────────────────────────────
create table risco_templates (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nome          text not null,
  corpo         text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint risco_templates_nome_unico unique (user_id, nome)
);

alter table risco_templates enable row level security;
create policy "tenant_isolation" on risco_templates
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index idx_risco_templates_user_id on risco_templates(user_id);
-- NOTE: set_user_id() trigger omitted — same rationale as risco_config above.

-- ── 3. risco_followups ───────────────────────────────────────
create table risco_followups (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  paciente_id          uuid not null references pacientes(id) on delete cascade,
  template_id          uuid references risco_templates(id) on delete set null,
  mensagem_completa    text not null,
  mensagem_enviada_em  timestamptz not null default now(),
  resposta_whatsapp    text,
  resposta_em          timestamptz,
  resultado            text default 'enviada'
    check (resultado in ('enviada','respondida_sim','respondida_nao','reconectado')),
  sessao_agendada_apos uuid references sessoes(id) on delete set null,
  reconectado_em       timestamptz
);

alter table risco_followups enable row level security;
create policy "tenant_isolation" on risco_followups
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index idx_risco_followups_user_id    on risco_followups(user_id);
create index idx_risco_followups_paciente   on risco_followups(paciente_id);
create index idx_risco_followups_enviado_em on risco_followups(mensagem_enviada_em);
create index idx_risco_followups_resultado  on risco_followups(resultado);
-- NOTE: set_user_id() trigger omitted — same rationale as risco_config above.

-- ── 4. RPC get_pacientes_em_risco ────────────────────────────
create or replace function get_pacientes_em_risco(
  p_user_id            uuid,
  p_min_cancelamentos  int default 2,
  p_dias_sem_sessao    int default 30,
  p_dias_apos_falta    int default 7
)
returns table (
  id                      uuid,
  nome                    text,
  telefone                text,
  ultima_sessao_data_hora timestamptz,
  risk_level              text,
  cancelamentos_seguidos  int,
  dias_sem_sessao         int,
  dias_apos_falta         int,
  triggers                jsonb
)
language plpgsql stable
as $$
declare
  v_now                timestamptz := now();
  v_cutoff_inatividade timestamptz := v_now - (p_dias_sem_sessao || ' days')::interval;
begin
  return query
  with
  pacientes_user as (
    select id, nome, telefone
    from pacientes
    where user_id = p_user_id and ativo = true
  ),
  ultima_sessao_pp as (
    select paciente_id, max(data_hora) as data_hora
    from sessoes where user_id = p_user_id
    group by paciente_id
  ),
  trig_cancelamentos as (
    -- Patients with >= p_min_cancelamentos cancelled/rescheduled sessions in past 90 days.
    select paciente_id
    from sessoes
    where user_id = p_user_id
      and status in ('cancelada', 'remarcada')
      and data_hora >= now() - interval '90 days'
    group by paciente_id
    having count(*) >= p_min_cancelamentos
  ),
  trig_inatividade as (
    select pu.id as paciente_id
    from pacientes_user pu
    left join ultima_sessao_pp usp on pu.id = usp.paciente_id
    where usp.data_hora is null or usp.data_hora < v_cutoff_inatividade
  ),
  trig_falta as (
    -- Most recent 'faltou' session (within 90 days) with no follow-up booked within the threshold.
    select distinct s1.paciente_id
    from sessoes s1
    left join sessoes s2
      on s1.paciente_id = s2.paciente_id
      and s2.user_id = p_user_id
      and s2.data_hora > s1.data_hora
      and s2.data_hora <= s1.data_hora + (p_dias_apos_falta || ' days')::interval
    where s1.user_id = p_user_id
      and s1.status = 'faltou'
      and s1.data_hora >= now() - interval '90 days'
      and s2.id is null
  ),
  all_triggers as (
    select paciente_id, 'cancelamentos' as ttype from trig_cancelamentos union all
    select paciente_id, 'inatividade'   from trig_inatividade             union all
    select paciente_id, 'falta'         from trig_falta
  ),
  agg as (
    select
      pu.id, pu.nome, pu.telefone,
      usp.data_hora,
      count(at.ttype)       as num_triggers,
      array_agg(at.ttype)   as tlist
    from pacientes_user pu
    join all_triggers at on pu.id = at.paciente_id
    left join ultima_sessao_pp usp on pu.id = usp.paciente_id
    group by pu.id, pu.nome, pu.telefone, usp.data_hora
  )
  select
    a.id,
    a.nome,
    a.telefone,
    a.data_hora,
    case when a.num_triggers >= 2 then 'Alto' else 'Médio' end,
    (select count(*) from trig_cancelamentos tc where tc.paciente_id = a.id)::int,
    case
      when a.data_hora is null then (p_dias_sem_sessao + 30)::int
      else (extract(epoch from (v_now - a.data_hora)) / 86400)::int
    end,
    null::int,
    (
      select jsonb_agg(obj) from (
        select jsonb_build_object('tipo','cancelamentos_seguidos','motivo', p_min_cancelamentos || '+ cancelamentos nos últimos 90 dias') as obj
          where 'cancelamentos' = any(a.tlist)
        union all
        select jsonb_build_object('tipo','inatividade','motivo', p_dias_sem_sessao || ' dias sem sessão')
          where 'inatividade' = any(a.tlist)
        union all
        select jsonb_build_object('tipo','falta_sem_agendamento','motivo','Faltou sem reagendar')
          where 'falta' = any(a.tlist)
      ) sub
    )
  from agg a
  order by a.num_triggers desc, a.data_hora asc nulls last;
end;
$$;
