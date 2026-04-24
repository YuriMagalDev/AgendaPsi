-- 012_whatsapp_activation.sql
-- Enable Realtime publication on tables used by useKanban and useNotificacoes

alter publication supabase_realtime add table sessoes;
alter publication supabase_realtime add table confirmacoes_whatsapp;
