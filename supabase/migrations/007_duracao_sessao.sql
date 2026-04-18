alter table sessoes
  add column if not exists duracao_minutos integer not null default 50;
