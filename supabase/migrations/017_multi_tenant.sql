-- ============================================================
-- Migration 017: Multi-tenant isolation
-- Adds user_id to all tables, backfills existing data,
-- tightens RLS to auth.uid() = user_id, adds signup trigger
-- ============================================================

-- ============================================================
-- STEP 1: Add user_id columns (nullable uuid FK to auth.users)
-- ============================================================
-- NOTE: config_psicologo did NOT have user_id in production — adding it here
ALTER TABLE config_psicologo      ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE pacientes             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE sessoes               ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE contratos             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE regras_repasse        ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE repasses              ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE confirmacoes_whatsapp ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE convenios             ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE despesas              ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE slots_semanais        ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE modalidades_sessao    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE meios_atendimento     ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE regras_cobranca       ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE cobracas_enviadas     ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
-- google_oauth_tokens, sessions_sync_map, sessions_external_busy already have user_id NOT NULL — skip
-- risco_config, risco_templates, risco_followups already have user_id NOT NULL — skip

-- ============================================================
-- STEP 2: Backfill existing data
-- ============================================================
DO $$
DECLARE v_uid uuid;
BEGIN
  v_uid := 'd6666453-dc8f-46e1-8be4-d05b02691346';
  UPDATE config_psicologo      SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE pacientes             SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE sessoes               SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE contratos             SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE regras_repasse        SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE repasses              SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE confirmacoes_whatsapp SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE convenios             SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE despesas              SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE slots_semanais        SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE modalidades_sessao    SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE meios_atendimento     SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE regras_cobranca       SET user_id = v_uid WHERE user_id IS NULL;
  UPDATE cobracas_enviadas     SET user_id = v_uid WHERE user_id IS NULL;
END $$;

-- ============================================================
-- STEP 3: Drop old open RLS policies
-- ============================================================
DROP POLICY IF EXISTS "auth users full access" ON pacientes;
DROP POLICY IF EXISTS "auth users full access" ON contratos;
DROP POLICY IF EXISTS "auth users full access" ON sessoes;
DROP POLICY IF EXISTS "auth users full access" ON regras_repasse;
DROP POLICY IF EXISTS "auth users full access" ON repasses;
DROP POLICY IF EXISTS "auth users full access" ON confirmacoes_whatsapp;
DROP POLICY IF EXISTS "auth users full access" ON config_psicologo;
DROP POLICY IF EXISTS "auth users full access" ON convenios;
DROP POLICY IF EXISTS "auth users full access" ON despesas;
DROP POLICY IF EXISTS "auth users full access" ON modalidades_sessao;
DROP POLICY IF EXISTS "auth users full access" ON meios_atendimento;
DROP POLICY IF EXISTS "auth users full access" ON slots_semanais;
DROP POLICY IF EXISTS "Authenticated users can manage their slots" ON slots_semanais;
DROP POLICY IF EXISTS "auth users full access" ON regras_cobranca;
DROP POLICY IF EXISTS "auth users full access" ON cobracas_enviadas;
-- Google Calendar tables (weak auth.role() policies from migration 020)
DROP POLICY IF EXISTS "auth users full access" ON google_oauth_tokens;
DROP POLICY IF EXISTS "auth users full access" ON sessions_sync_map;
DROP POLICY IF EXISTS "auth users full access" ON sessions_external_busy;

-- ============================================================
-- STEP 4: Create tenant_isolation RLS policies
-- ============================================================
CREATE POLICY "tenant_isolation" ON pacientes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON contratos
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON sessoes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON regras_repasse
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON repasses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON confirmacoes_whatsapp
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON config_psicologo
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON convenios
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON despesas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON slots_semanais
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON modalidades_sessao
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON meios_atendimento
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON regras_cobranca
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON cobracas_enviadas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Google Calendar tables
CREATE POLICY "tenant_isolation" ON google_oauth_tokens
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON sessions_sync_map
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON sessions_external_busy
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- risco_* tables already have tenant_isolation policy from migration 021 — skip

-- ============================================================
-- STEP 5: Create set_user_id() trigger function and apply triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- config_psicologo
DROP TRIGGER IF EXISTS trg_set_user_id_config_psicologo ON config_psicologo;
CREATE TRIGGER trg_set_user_id_config_psicologo
  BEFORE INSERT ON config_psicologo
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- pacientes
DROP TRIGGER IF EXISTS trg_set_user_id_pacientes ON pacientes;
CREATE TRIGGER trg_set_user_id_pacientes
  BEFORE INSERT ON pacientes
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- sessoes
DROP TRIGGER IF EXISTS trg_set_user_id_sessoes ON sessoes;
CREATE TRIGGER trg_set_user_id_sessoes
  BEFORE INSERT ON sessoes
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- contratos
DROP TRIGGER IF EXISTS trg_set_user_id_contratos ON contratos;
CREATE TRIGGER trg_set_user_id_contratos
  BEFORE INSERT ON contratos
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- regras_repasse
DROP TRIGGER IF EXISTS trg_set_user_id_regras_repasse ON regras_repasse;
CREATE TRIGGER trg_set_user_id_regras_repasse
  BEFORE INSERT ON regras_repasse
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- repasses
DROP TRIGGER IF EXISTS trg_set_user_id_repasses ON repasses;
CREATE TRIGGER trg_set_user_id_repasses
  BEFORE INSERT ON repasses
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- confirmacoes_whatsapp
DROP TRIGGER IF EXISTS trg_set_user_id_confirmacoes_whatsapp ON confirmacoes_whatsapp;
CREATE TRIGGER trg_set_user_id_confirmacoes_whatsapp
  BEFORE INSERT ON confirmacoes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- convenios
DROP TRIGGER IF EXISTS trg_set_user_id_convenios ON convenios;
CREATE TRIGGER trg_set_user_id_convenios
  BEFORE INSERT ON convenios
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- despesas
DROP TRIGGER IF EXISTS trg_set_user_id_despesas ON despesas;
CREATE TRIGGER trg_set_user_id_despesas
  BEFORE INSERT ON despesas
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- slots_semanais
DROP TRIGGER IF EXISTS trg_set_user_id_slots_semanais ON slots_semanais;
CREATE TRIGGER trg_set_user_id_slots_semanais
  BEFORE INSERT ON slots_semanais
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- modalidades_sessao
DROP TRIGGER IF EXISTS trg_set_user_id_modalidades_sessao ON modalidades_sessao;
CREATE TRIGGER trg_set_user_id_modalidades_sessao
  BEFORE INSERT ON modalidades_sessao
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- meios_atendimento
DROP TRIGGER IF EXISTS trg_set_user_id_meios_atendimento ON meios_atendimento;
CREATE TRIGGER trg_set_user_id_meios_atendimento
  BEFORE INSERT ON meios_atendimento
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- regras_cobranca
DROP TRIGGER IF EXISTS trg_set_user_id_regras_cobranca ON regras_cobranca;
CREATE TRIGGER trg_set_user_id_regras_cobranca
  BEFORE INSERT ON regras_cobranca
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- cobracas_enviadas
DROP TRIGGER IF EXISTS trg_set_user_id_cobracas_enviadas ON cobracas_enviadas;
CREATE TRIGGER trg_set_user_id_cobracas_enviadas
  BEFORE INSERT ON cobracas_enviadas
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- risco_config (trigger omitted in migration 021)
DROP TRIGGER IF EXISTS trg_set_user_id_risco_config ON risco_config;
CREATE TRIGGER trg_set_user_id_risco_config
  BEFORE INSERT ON risco_config
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- risco_templates (trigger omitted in migration 021)
DROP TRIGGER IF EXISTS trg_set_user_id_risco_templates ON risco_templates;
CREATE TRIGGER trg_set_user_id_risco_templates
  BEFORE INSERT ON risco_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- risco_followups (trigger omitted in migration 021)
DROP TRIGGER IF EXISTS trg_set_user_id_risco_followups ON risco_followups;
CREATE TRIGGER trg_set_user_id_risco_followups
  BEFORE INSERT ON risco_followups
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- google_oauth_tokens
DROP TRIGGER IF EXISTS trg_set_user_id_google_oauth_tokens ON google_oauth_tokens;
CREATE TRIGGER trg_set_user_id_google_oauth_tokens
  BEFORE INSERT ON google_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- sessions_sync_map
DROP TRIGGER IF EXISTS trg_set_user_id_sessions_sync_map ON sessions_sync_map;
CREATE TRIGGER trg_set_user_id_sessions_sync_map
  BEFORE INSERT ON sessions_sync_map
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- sessions_external_busy
DROP TRIGGER IF EXISTS trg_set_user_id_sessions_external_busy ON sessions_external_busy;
CREATE TRIGGER trg_set_user_id_sessions_external_busy
  BEFORE INSERT ON sessions_external_busy
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();

-- ============================================================
-- STEP 6: Create handle_new_user() signup trigger
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.config_psicologo (user_id) VALUES (NEW.id);
  INSERT INTO public.modalidades_sessao (nome, emoji, user_id) VALUES
    ('Individual', '👤', NEW.id), ('Casal', '👥', NEW.id),
    ('Família', '👨‍👩‍👧', NEW.id), ('Neurodivergente', '🧩', NEW.id);
  INSERT INTO public.meios_atendimento (nome, emoji, user_id) VALUES
    ('Presencial', '🏥', NEW.id), ('Online', '💻', NEW.id), ('Domicílio', '🏠', NEW.id);
  INSERT INTO public.regras_cobranca (user_id, etapa, dias_apos, template_mensagem, ativo) VALUES
    (NEW.id, 1, 1, 'Olá {{nome}}! 😊' || chr(10) || 'Passando para lembrar que a sessão do dia {{data_sessao}} no valor de {{valor}} ainda está pendente.' || chr(10) || 'Chave PIX: {{chave_pix}}' || chr(10) || 'Qualquer dúvida, estou à disposição! 🙏', true),
    (NEW.id, 2, 3, 'Oi {{nome}}, tudo bem?' || chr(10) || 'Notei que o pagamento da sessão do dia {{data_sessao}} ({{valor}}) ainda não foi identificado.' || chr(10) || 'Chave PIX: {{chave_pix}}' || chr(10) || 'Se já pagou, pode desconsiderar esta mensagem! 😊', true),
    (NEW.id, 3, 7, '{{nome}}, boa tarde!' || chr(10) || 'Gostaria de verificar sobre o pagamento da sessão do dia {{data_sessao}} no valor de {{valor}}.' || chr(10) || 'Chave PIX: {{chave_pix}}' || chr(10) || 'Podemos conversar sobre isso? Fico no aguardo. 🙏', true);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STEP 7: Fix regras_cobranca unique constraint
-- ============================================================
ALTER TABLE regras_cobranca DROP CONSTRAINT IF EXISTS regras_cobranca_etapa_key;
ALTER TABLE regras_cobranca ADD CONSTRAINT regras_cobranca_user_etapa_key UNIQUE (user_id, etapa);

-- ============================================================
-- STEP 8: Update get_pacientes_em_risco RPC — restore user_id filters
-- ============================================================
CREATE OR REPLACE FUNCTION get_pacientes_em_risco(
  p_user_id            uuid,
  p_min_cancelamentos  int default 2,
  p_dias_sem_sessao    int default 30,
  p_dias_apos_falta    int default 7
)
RETURNS TABLE (
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
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_now                timestamptz := now();
  v_cutoff_inatividade timestamptz := v_now - (p_dias_sem_sessao || ' days')::interval;
BEGIN
  RETURN QUERY
  WITH
  pacientes_user AS (
    SELECT p.id, p.nome, p.telefone
    FROM pacientes p
    WHERE p.user_id = p_user_id AND p.ativo = true
  ),
  ultima_sessao_pp AS (
    SELECT s.paciente_id, max(s.data_hora) AS data_hora
    FROM sessoes s
    WHERE s.paciente_id IN (SELECT pu.id FROM pacientes_user pu)
      AND s.user_id = p_user_id
    GROUP BY s.paciente_id
  ),
  trig_cancelamentos AS (
    SELECT s.paciente_id
    FROM sessoes s
    WHERE s.paciente_id IN (SELECT pu.id FROM pacientes_user pu)
      AND s.user_id = p_user_id
      AND s.status IN ('cancelada', 'remarcada')
      AND s.data_hora >= now() - INTERVAL '90 days'
    GROUP BY s.paciente_id
    HAVING count(*) >= p_min_cancelamentos
  ),
  cancelamentos_count AS (
    SELECT s.paciente_id, count(*)::int AS cnt
    FROM sessoes s
    WHERE s.paciente_id IN (SELECT pu.id FROM pacientes_user pu)
      AND s.user_id = p_user_id
      AND s.status IN ('cancelada', 'remarcada')
      AND s.data_hora >= now() - INTERVAL '90 days'
    GROUP BY s.paciente_id
  ),
  trig_inatividade AS (
    SELECT pu.id AS paciente_id
    FROM pacientes_user pu
    LEFT JOIN ultima_sessao_pp usp ON pu.id = usp.paciente_id
    WHERE usp.data_hora IS NULL OR usp.data_hora < v_cutoff_inatividade
  ),
  trig_falta AS (
    SELECT DISTINCT s1.paciente_id
    FROM sessoes s1
    LEFT JOIN sessoes s2
      ON s1.paciente_id = s2.paciente_id
      AND s2.data_hora > s1.data_hora
      AND s2.data_hora <= s1.data_hora + (p_dias_apos_falta || ' days')::interval
      AND s2.status IN ('agendada', 'confirmada', 'concluida')
    WHERE s1.paciente_id IN (SELECT pu.id FROM pacientes_user pu)
      AND s1.user_id = p_user_id
      AND s1.status = 'faltou'
      AND s1.data_hora >= now() - INTERVAL '90 days'
      AND s1.data_hora = (
        SELECT max(s3.data_hora)
        FROM sessoes s3
        WHERE s3.paciente_id = s1.paciente_id
          AND s3.user_id = p_user_id
          AND s3.status = 'faltou'
          AND s3.data_hora >= now() - INTERVAL '90 days'
      )
      AND s2.id IS NULL
  ),
  ultima_falta_pp AS (
    SELECT s.paciente_id, max(s.data_hora) AS data_hora
    FROM sessoes s
    WHERE s.paciente_id IN (SELECT pu.id FROM pacientes_user pu)
      AND s.user_id = p_user_id
      AND s.status = 'faltou'
      AND s.data_hora >= now() - INTERVAL '90 days'
    GROUP BY s.paciente_id
  ),
  all_triggers AS (
    SELECT paciente_id, 'cancelamentos' AS ttype FROM trig_cancelamentos UNION ALL
    SELECT paciente_id, 'inatividade'   FROM trig_inatividade             UNION ALL
    SELECT paciente_id, 'falta'         FROM trig_falta
  ),
  agg AS (
    SELECT
      pu.id, pu.nome, pu.telefone,
      usp.data_hora,
      count(at.ttype)       AS num_triggers,
      array_agg(at.ttype)   AS tlist
    FROM pacientes_user pu
    JOIN all_triggers at ON pu.id = at.paciente_id
    LEFT JOIN ultima_sessao_pp usp ON pu.id = usp.paciente_id
    GROUP BY pu.id, pu.nome, pu.telefone, usp.data_hora
  )
  SELECT
    a.id, a.nome, a.telefone, a.data_hora,
    CASE WHEN a.num_triggers >= 2 THEN 'Alto' ELSE 'Médio' END,
    COALESCE((SELECT cc.cnt FROM cancelamentos_count cc WHERE cc.paciente_id = a.id), 0),
    CASE
      WHEN a.data_hora IS NULL THEN (p_dias_sem_sessao + 30)::int
      ELSE (extract(epoch FROM (v_now - a.data_hora)) / 86400)::int
    END,
    CASE
      WHEN 'falta' = ANY(a.tlist)
      THEN (SELECT (extract(epoch FROM (v_now - ufp.data_hora)) / 86400)::int
            FROM ultima_falta_pp ufp WHERE ufp.paciente_id = a.id)
      ELSE NULL
    END,
    (
      SELECT jsonb_agg(obj) FROM (
        SELECT jsonb_build_object('tipo','cancelamentos_seguidos','motivo', p_min_cancelamentos || '+ cancelamentos nos últimos 90 dias') AS obj
          WHERE 'cancelamentos' = ANY(a.tlist)
        UNION ALL
        SELECT jsonb_build_object('tipo','inatividade','motivo', p_dias_sem_sessao || ' dias sem sessão')
          WHERE 'inatividade' = ANY(a.tlist)
        UNION ALL
        SELECT jsonb_build_object('tipo','falta_sem_agendamento','motivo','Faltou sem reagendar')
          WHERE 'falta' = ANY(a.tlist)
      ) sub
    )
  FROM agg a
  ORDER BY a.num_triggers DESC, a.data_hora ASC NULLS LAST;
END;
$$;

-- ============================================================
-- STEP 9: Add indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pacientes_user_id          ON pacientes(user_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_user_id            ON sessoes(user_id);
CREATE INDEX IF NOT EXISTS idx_contratos_user_id          ON contratos(user_id);
CREATE INDEX IF NOT EXISTS idx_convenios_user_id          ON convenios(user_id);
CREATE INDEX IF NOT EXISTS idx_despesas_user_id           ON despesas(user_id);
CREATE INDEX IF NOT EXISTS idx_slots_user_id              ON slots_semanais(user_id);
CREATE INDEX IF NOT EXISTS idx_modalidades_sessao_user_id ON modalidades_sessao(user_id);
CREATE INDEX IF NOT EXISTS idx_meios_atendimento_user_id  ON meios_atendimento(user_id);
CREATE INDEX IF NOT EXISTS idx_repasses_user_id           ON repasses(user_id);
CREATE INDEX IF NOT EXISTS idx_regras_repasse_user_id     ON regras_repasse(user_id);
CREATE INDEX IF NOT EXISTS idx_confirmacoes_user_id       ON confirmacoes_whatsapp(user_id);
