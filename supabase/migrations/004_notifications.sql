-- Track which WhatsApp confirmation notifications the psychologist has already seen
alter table confirmacoes_whatsapp add column if not exists lida boolean not null default false;
