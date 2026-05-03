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

CREATE INDEX idx_assinaturas_user_id ON assinaturas(user_id);
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
