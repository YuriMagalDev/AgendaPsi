-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Modalidades (personalizáveis pelo psicólogo)
create table modalidades (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  ativo boolean not null default true
);

-- Pacientes
create table pacientes (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  telefone text,
  email text,
  data_nascimento date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Contratos de cobrança
create type contrato_tipo as enum ('por_sessao', 'pacote', 'mensal');

create table contratos (
  id uuid primary key default uuid_generate_v4(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tipo contrato_tipo not null,
  valor numeric(10,2) not null,
  qtd_sessoes int,
  dia_vencimento int check (dia_vencimento between 1 and 31),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Sessões
create type sessao_status as enum (
  'agendada', 'confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada'
);

create table sessoes (
  id uuid primary key default uuid_generate_v4(),
  paciente_id uuid references pacientes(id) on delete set null,
  avulso_nome text,
  avulso_telefone text,
  modalidade_id uuid not null references modalidades(id),
  data_hora timestamptz not null,
  status sessao_status not null default 'agendada',
  valor_cobrado numeric(10,2),
  pago boolean not null default false,
  data_pagamento date,
  remarcada_para timestamptz,
  sessao_origem_id uuid references sessoes(id),
  criado_em timestamptz not null default now(),
  constraint sessao_must_have_paciente_or_avulso
    check (paciente_id is not null or avulso_nome is not null)
);

-- Regras globais de repasse
create type repasse_tipo_valor as enum ('percentual', 'fixo');

create table regras_repasse (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  tipo_valor repasse_tipo_valor not null,
  valor numeric(10,2) not null,
  ativo boolean not null default true
);

-- Repasses por sessão (gerados a partir das regras)
create table repasses (
  id uuid primary key default uuid_generate_v4(),
  regra_repasse_id uuid not null references regras_repasse(id),
  sessao_id uuid not null references sessoes(id) on delete cascade,
  valor_calculado numeric(10,2) not null,
  pago boolean not null default false,
  data_pagamento date
);

-- Log de confirmações WhatsApp
create table confirmacoes_whatsapp (
  id uuid primary key default uuid_generate_v4(),
  sessao_id uuid not null references sessoes(id) on delete cascade,
  mensagem_enviada_em timestamptz,
  resposta text,
  confirmado boolean
);

-- Configurações do psicólogo (uma linha por conta)
create table config_psicologo (
  id uuid primary key default uuid_generate_v4(),
  nome text,
  horario_inicio time,
  horario_fim time,
  horario_checklist time default '18:00',
  automacao_whatsapp_ativa boolean not null default false,
  evolution_instance_name text,
  evolution_token text,
  whatsapp_conectado boolean not null default false
);

-- Modalidades padrão
insert into modalidades (nome) values ('Presencial'), ('Online');

-- Row Level Security (habilitar em todas as tabelas)
alter table modalidades enable row level security;
alter table pacientes enable row level security;
alter table contratos enable row level security;
alter table sessoes enable row level security;
alter table regras_repasse enable row level security;
alter table repasses enable row level security;
alter table confirmacoes_whatsapp enable row level security;
alter table config_psicologo enable row level security;

-- RLS policies: allow all operations for authenticated users
-- (single-user app — no multi-tenancy needed)
create policy "auth users full access" on modalidades for all to authenticated using (true) with check (true);
create policy "auth users full access" on pacientes for all to authenticated using (true) with check (true);
create policy "auth users full access" on contratos for all to authenticated using (true) with check (true);
create policy "auth users full access" on sessoes for all to authenticated using (true) with check (true);
create policy "auth users full access" on regras_repasse for all to authenticated using (true) with check (true);
create policy "auth users full access" on repasses for all to authenticated using (true) with check (true);
create policy "auth users full access" on confirmacoes_whatsapp for all to authenticated using (true) with check (true);
create policy "auth users full access" on config_psicologo for all to authenticated using (true) with check (true);
