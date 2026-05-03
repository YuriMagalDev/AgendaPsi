-- 018_subscriptions.sql

CREATE TABLE assinaturas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  plano                    text NOT NULL DEFAULT 'completo'
                           CHECK (plano IN ('basico', 'completo')),
  status                   text NOT NULL DEFAULT 'trial'
                           CHECK (status IN ('trial', 'ativo', 'cancelado', 'inadimplente')),
  trial_fim                date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  stripe_customer_id       text,
  stripe_subscription_id   text,
  criado_em                timestamptz NOT NULL DEFAULT now(),
  atualizado_em            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE assinaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON assinaturas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_assinaturas_status ON assinaturas(status);

-- Extend handle_new_user to provision a trial subscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.config_psicologo (user_id)
  VALUES (NEW.id);

  INSERT INTO public.modalidades_sessao (nome, emoji, user_id) VALUES
    ('Individual',      '👤', NEW.id),
    ('Casal',           '👥', NEW.id),
    ('Família',         '👨‍👩‍👧', NEW.id),
    ('Neurodivergente', '🧩', NEW.id);

  INSERT INTO public.meios_atendimento (nome, emoji, user_id) VALUES
    ('Presencial', '🏥', NEW.id),
    ('Online',     '💻', NEW.id),
    ('Domicílio',  '🏠', NEW.id);

  -- Trial subscription: full plan, 14 days
  INSERT INTO public.assinaturas (user_id, plano, status)
  VALUES (NEW.id, 'completo', 'trial');

  INSERT INTO public.regras_cobranca (user_id, etapa, dias_apos, template_mensagem, ativo) VALUES
    (NEW.id, 1, 1, 'Olá {{nome}}! 😊' || chr(10) || 'Passando para lembrar que a sessão do dia {{data_sessao}} no valor de {{valor}} ainda está pendente.' || chr(10) || 'Chave PIX: {{chave_pix}}' || chr(10) || 'Qualquer dúvida, estou à disposição! 🙏', true),
    (NEW.id, 2, 3, 'Oi {{nome}}, tudo bem?' || chr(10) || 'Notei que o pagamento da sessão do dia {{data_sessao}} ({{valor}}) ainda não foi identificado.' || chr(10) || 'Chave PIX: {{chave_pix}}' || chr(10) || 'Se já pagou, pode desconsiderar esta mensagem! 😊', true),
    (NEW.id, 3, 7, '{{nome}}, boa tarde!' || chr(10) || 'Gostaria de verificar sobre o pagamento da sessão do dia {{data_sessao}} no valor de {{valor}}.' || chr(10) || 'Chave PIX: {{chave_pix}}' || chr(10) || 'Podemos conversar sobre isso? Fico no aguardo. 🙏', true);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.assinaturas_set_atualizado_em()
RETURNS trigger AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assinaturas_atualizado_em
  BEFORE UPDATE ON assinaturas
  FOR EACH ROW EXECUTE FUNCTION public.assinaturas_set_atualizado_em();
