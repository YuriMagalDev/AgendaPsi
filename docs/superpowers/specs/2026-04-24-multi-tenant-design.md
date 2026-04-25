# Design Spec — Multi-Tenant Isolation

**Date:** 2026-04-24
**Status:** Approved
**Project:** AgendaPsi

---

## 1. Overview

Transform the current single-user app into a multi-tenant SaaS where every psychologist shares a single Supabase project but sees only their own data. Isolation is enforced at the database level via Row-Level Security (RLS) policies keyed on `auth.uid()`.

### Goals
- Add `user_id` to every tenant-scoped table and enforce NOT NULL for new rows
- Rewrite all RLS policies from `using (true)` to `using (auth.uid() = user_id)`
- Create a trigger that auto-fills `user_id` on every INSERT (frontend code never sends it)
- Create a signup trigger that provisions `config_psicologo`, default `modalidades_sessao`, and default `meios_atendimento` for every new user
- Adapt all 4 Edge Functions to work in a multi-tenant context
- Zero changes to existing frontend hooks (RLS is transparent)

### Out of scope
- Billing / subscription management (Spec 2)
- Feature gating between plans (Spec 3)
- Stripe integration (Spec 4)
- Landing page / public routes (Spec 5)
- Multi-clinic / team management (permanently out of scope)

---

## 2. Data Model Changes

### Migration `supabase/migrations/014_multi_tenant.sql`

Executes in this order:

#### 2.1 Add `user_id` column to all tenant-scoped tables

```sql
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE sessoes ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE contratos ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE regras_repasse ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE repasses ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE confirmacoes_whatsapp ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE convenios ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE despesas ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE slots_semanais ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE modalidades_sessao ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
ALTER TABLE meios_atendimento ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
```

`config_psicologo` already has `user_id` — no ALTER needed.

#### 2.2 Drop all existing "open" RLS policies

```sql
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
-- slots_semanais may have a different policy name; drop by name if exists
DROP POLICY IF EXISTS "auth users full access" ON slots_semanais;
DROP POLICY IF EXISTS "Authenticated users can manage their slots" ON slots_semanais;
```

#### 2.3 Create tenant-isolation RLS policies

One policy per table, all following the same pattern:

```sql
CREATE POLICY "tenant_isolation" ON pacientes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON contratos
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON sessoes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON regras_repasse
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON repasses
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON confirmacoes_whatsapp
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON config_psicologo
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON convenios
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON despesas
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON slots_semanais
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON modalidades_sessao
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_isolation" ON meios_atendimento
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

#### 2.4 Auto-fill `user_id` trigger

A single function applied to all tables. The frontend never sends `user_id` — it is always injected server-side from the authenticated session.

```sql
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_set_user_id_pacientes BEFORE INSERT ON pacientes
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_sessoes BEFORE INSERT ON sessoes
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_contratos BEFORE INSERT ON contratos
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_regras_repasse BEFORE INSERT ON regras_repasse
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_repasses BEFORE INSERT ON repasses
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_confirmacoes BEFORE INSERT ON confirmacoes_whatsapp
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_convenios BEFORE INSERT ON convenios
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_despesas BEFORE INSERT ON despesas
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_slots BEFORE INSERT ON slots_semanais
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_modalidades_sessao BEFORE INSERT ON modalidades_sessao
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
CREATE TRIGGER trg_set_user_id_meios_atendimento BEFORE INSERT ON meios_atendimento
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id();
```

#### 2.5 Signup trigger — provision defaults for new users

When a user signs up via Supabase Auth, automatically create their `config_psicologo` row and clone the default modalidades/meios into their tenant.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Create default config
  INSERT INTO public.config_psicologo (user_id)
  VALUES (NEW.id);

  -- Clone default modalidades de sessão
  INSERT INTO public.modalidades_sessao (nome, emoji, user_id) VALUES
    ('Individual',      '👤', NEW.id),
    ('Casal',           '👥', NEW.id),
    ('Família',         '👨‍👩‍👧', NEW.id),
    ('Neurodivergente', '🧩', NEW.id);

  -- Clone default meios de atendimento
  INSERT INTO public.meios_atendimento (nome, emoji, user_id) VALUES
    ('Presencial', '🏥', NEW.id),
    ('Online',     '💻', NEW.id),
    ('Domicílio',  '🏠', NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

#### 2.6 Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_pacientes_user_id ON pacientes(user_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_user_id ON sessoes(user_id);
CREATE INDEX IF NOT EXISTS idx_contratos_user_id ON contratos(user_id);
CREATE INDEX IF NOT EXISTS idx_config_user_id ON config_psicologo(user_id);
CREATE INDEX IF NOT EXISTS idx_convenios_user_id ON convenios(user_id);
CREATE INDEX IF NOT EXISTS idx_despesas_user_id ON despesas(user_id);
CREATE INDEX IF NOT EXISTS idx_slots_user_id ON slots_semanais(user_id);
CREATE INDEX IF NOT EXISTS idx_modalidades_sessao_user_id ON modalidades_sessao(user_id);
CREATE INDEX IF NOT EXISTS idx_meios_atendimento_user_id ON meios_atendimento(user_id);
```

---

## 3. Types

Update `src/lib/types.ts` — add `user_id` as optional field to every interface that maps to a tenant-scoped table. The field is optional in TypeScript because the frontend never sends it (the trigger fills it).

Affected interfaces: `Paciente`, `Contrato`, `Sessao`, `RegraRepasse`, `Repasse`, `ConfirmacaoWhatsapp`, `ConfigPsicologo`, `Convenio`, `Despesa`, `SlotSemanal`, `ModalidadeSessao`, `MeioAtendimento`.

Pattern:
```ts
export interface Paciente {
  // ...existing fields
  user_id?: string  // auto-filled by DB trigger, never sent by frontend
}
```

---

## 4. Hooks

**No hook changes required.** All hooks query via `supabase.from('table').select(...)` and the RLS policies automatically filter by `auth.uid() = user_id`. The `set_user_id` trigger fills the column on INSERT. The frontend is completely unaware of multi-tenancy.

---

## 5. UI Changes

### 5.1 OnboardingPage.tsx

**Current behavior:** `finalize()` does `supabase.from('config_psicologo').insert({...})`.

**New behavior:** The signup trigger (`handle_new_user`) already creates `config_psicologo` with defaults. The onboarding should UPDATE the existing row instead of inserting a new one.

```tsx
// BEFORE:
const { error } = await supabase.from('config_psicologo').insert({
  nome: dadosStep1.nome,
  horario_inicio: dadosStep1.horario_inicio,
  // ...
})

// AFTER:
const { error } = await supabase.from('config_psicologo').update({
  nome: dadosStep1.nome,
  horario_inicio: dadosStep1.horario_inicio,
  // ...
}).eq('user_id', user.id)
```

The `user.id` comes from the existing `useAuth()` hook.

### 5.2 ProtectedRoute.tsx

**No change needed.** The query `.from('config_psicologo').select('id').limit(1)` already works because RLS filters to the current user's row. If the `nome` field is null (signup trigger creates config without nome), redirect to onboarding.

Adjust the check:
```tsx
// BEFORE:
.then(({ data }) => setOnboardingDone(!!data && data.length > 0))

// AFTER:
.then(({ data }) => setOnboardingDone(!!data && data.length > 0 && !!data[0]?.nome))
```

### 5.3 LoginPage.tsx

**Add signup link.** Currently the login page only has email/password. Add a "Criar conta" link below the login button that calls `supabase.auth.signUp()`.

### 5.4 StepAtendimento.tsx (onboarding)

**Current behavior:** Fetches modalidades_sessao and meios_atendimento and lets the user toggle them on/off. This still works because RLS returns only the user's rows (cloned by the signup trigger).

**No change needed.**

---

## 6. Edge Functions

All Edge Functions use `SERVICE_ROLE_KEY` which bypasses RLS. They must filter by `user_id` explicitly.

### 6.1 `send-lembrete/index.ts`

**Current:** Fetches config via `.limit(1).single()` (assumes single user).

**Change:** Fetch the session first to get `user_id`, then fetch config by that user_id.

```typescript
// 1. Fetch session (includes user_id now)
const { data: sessao } = await supabase
  .from('sessoes')
  .select('id, data_hora, user_id, avulso_nome, avulso_telefone, paciente_id, pacientes(nome, telefone)')
  .eq('id', sessao_id)
  .in('status', ['agendada', 'confirmada'])
  .single()

// 2. Fetch config for that specific tenant
const { data: config } = await supabase
  .from('config_psicologo')
  .select('automacao_whatsapp_ativa, whatsapp_conectado, evolution_instance_name, evolution_token, nome')
  .eq('user_id', sessao.user_id)
  .single()
```

### 6.2 `cron-lembretes/index.ts`

**Current:** Fetches all sessions globally.

**Change:** Iterate over active tenants, then fetch sessions per tenant.

```typescript
// 1. Get all tenants with WhatsApp active
const { data: configs } = await supabase
  .from('config_psicologo')
  .select('user_id')
  .eq('automacao_whatsapp_ativa', true)
  .eq('whatsapp_conectado', true)

// 2. For each tenant, find sessions in reminder windows
for (const cfg of configs ?? []) {
  // ... existing window logic, but add .eq('user_id', cfg.user_id) to session query
}
```

### 6.3 `whatsapp-webhook/index.ts`

**Current:** Fetches config via `.limit(1).single()`.

**Change:** The webhook payload from Evolution API includes the instance name. Use it to identify the tenant.

```typescript
const instanceName = payload.instance ?? payload.data?.instance ?? ''

const { data: config } = await supabase
  .from('config_psicologo')
  .select('user_id, evolution_instance_name')
  .eq('evolution_instance_name', instanceName)
  .single()

// Then filter confirmacoes_whatsapp by config.user_id
```

### 6.4 `whatsapp-setup/index.ts`

**Current:** Fetches config via `.limit(1).single()`.

**Change:** Extract the user_id from the JWT in the Authorization header, then fetch config by user_id.

```typescript
const authHeader = req.headers.get('Authorization') ?? ''
const token = authHeader.replace('Bearer ', '')
const { data: { user } } = await supabase.auth.getUser(token)

const { data: config } = await supabase
  .from('config_psicologo')
  .select('id, evolution_instance_name, evolution_token')
  .eq('user_id', user.id)
  .single()
```

---

## 7. Error Handling

| Situation | Behavior |
|-----------|----------|
| Signup fails mid-trigger | Entire transaction rolls back — no orphaned config rows |
| User queries another tenant's data | RLS returns 0 rows — no error, just empty |
| Edge Function called with invalid sessao_id | Returns 404 as before |
| Webhook arrives for unknown instance | Logs warning, returns `ok` (no crash) |
| Existing data without user_id (legacy) | Not visible to any user via RLS. Must be backfilled manually if migrating existing production data. |

---

## 8. Testing

### Unit / Integration
- Create 2 test users via Supabase Auth
- User A inserts a paciente → query as User B → assert 0 rows returned
- Insert without user_id → assert trigger fills it with auth.uid()
- Signup new user → assert config_psicologo row exists with that user_id
- Signup new user → assert 4 modalidades_sessao rows + 3 meios_atendimento rows created

### Edge Function tests
- Call `send-lembrete` with a sessao belonging to User A → assert it fetches User A's config
- Call `cron-lembretes` → assert it only processes tenants with active WhatsApp

### Manual
- Sign up two accounts, create data in each, verify complete isolation
- Verify onboarding flow works with new update (not insert) pattern

---

## 9. Rollout

1. Apply migration `014_multi_tenant.sql` on Supabase (via SQL Editor or `supabase db push`)
2. Deploy updated Edge Functions (`send-lembrete`, `cron-lembretes`, `whatsapp-webhook`, `whatsapp-setup`)
3. Deploy frontend changes (OnboardingPage update → insert to update, ProtectedRoute check, LoginPage signup link)
4. Enable public signup on Supabase Auth dashboard
5. Test full flow: signup → onboarding → create patient → schedule session → checklist → financials

---

## 10. Open Questions

None. All decisions are captured:
- Modalidades/meios are per-tenant with cloned defaults on signup
- No multi-clinic support
- Frontend hooks unchanged (RLS handles filtering)
- Edge Functions explicitly filter by user_id since they use service role key
