# Multi-Tenant Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `user_id` to all tenant-scoped tables, enforce RLS isolation per user, provision defaults on signup, and update edge functions to filter by tenant.

**Architecture:** Single Supabase project shared by all users; isolation enforced at DB level via RLS policies keyed on `auth.uid() = user_id`. A BEFORE INSERT trigger auto-fills `user_id` so frontend code never sends it. An AFTER INSERT trigger on `auth.users` provisions defaults for new users. Edge functions use SERVICE_ROLE_KEY (bypasses RLS) and must filter by `user_id` explicitly.

**Tech Stack:** PostgreSQL RLS + triggers, Supabase Edge Functions (Deno), React/TypeScript frontend.

> **IMPORTANT — Migration numbers:** The spec references migrations 014 and 015, but those numbers are already taken in this project (`014_slot_duration.sql`, `015_patient_notes.sql`). Use **017** for this migration.

---

## File Structure

**New files:**
- `supabase/migrations/017_multi_tenant.sql` — all DB changes: user_id columns, RLS policies, triggers, indexes

**Modified files:**
- `src/lib/types.ts` — add `user_id?: string` to all tenant interfaces
- `src/pages/OnboardingPage.tsx` — change `insert` to `update` for config_psicologo
- `src/components/ProtectedRoute.tsx` — check `data[0]?.nome` for onboarding redirect
- `src/pages/LoginPage.tsx` — add "Criar conta" signup form/link
- `supabase/functions/send-lembrete/index.ts` — fetch config by session's user_id
- `supabase/functions/cron-lembretes/index.ts` — iterate tenants, filter sessions per tenant
- `supabase/functions/whatsapp-webhook/index.ts` — identify tenant by evolution_instance_name
- `supabase/functions/whatsapp-setup/index.ts` — authenticate user via JWT, fetch config by user_id

---

## Task 1: Migration — Add user_id columns and RLS

**Files:**
- Create: `supabase/migrations/017_multi_tenant.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 017_multi_tenant.sql

-- 1. Add user_id column to all tenant-scoped tables
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
-- config_psicologo already has user_id

-- 2. Drop all existing open RLS policies
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

-- 3. Create tenant-isolation RLS policies
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

-- 4. Auto-fill user_id trigger function
CREATE OR REPLACE FUNCTION public.set_user_id()
RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    NEW.user_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to every tenant-scoped table
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

-- 5. Signup trigger — provision defaults for new users
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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Indexes
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

- [ ] **Step 2: Apply migration via Supabase SQL Editor (or `supabase db push`)**

In Supabase Dashboard → SQL Editor, paste and run the migration. Verify in Table Editor that `user_id` column exists in `pacientes`, `sessoes`, etc.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/017_multi_tenant.sql
git commit -m "feat(db): add user_id, RLS tenant isolation, signup trigger"
```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add `user_id?: string` to all tenant interfaces**

Open `src/lib/types.ts` and add `user_id?: string` to: `ModalidadeSessao`, `MeioAtendimento`, `Paciente`, `Contrato`, `Sessao`, `RegraRepasse` (find it below), `Repasse`, `ConfirmacaoWhatsapp`, `ConfigPsicologo`, `Convenio`, `Despesa`, `SlotSemanal`.

The full updated file (add `user_id?: string` as the last field before closing brace of each interface):

```typescript
export interface ModalidadeSessao {
  id: string
  nome: string
  emoji: string
  ativo: boolean
  user_id?: string
}

export interface MeioAtendimento {
  id: string
  nome: string
  emoji: string
  ativo: boolean
  user_id?: string
}

export interface Paciente {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  data_nascimento: string | null
  notas: string | null
  ativo: boolean
  tipo: 'particular' | 'convenio'
  convenio_id: string | null
  modalidade_sessao_id: string | null
  meio_atendimento_id: string | null
  criado_em: string
  user_id?: string
}

export interface Contrato {
  id: string
  paciente_id: string
  tipo: ContratoTipo
  valor: number
  qtd_sessoes: number | null
  dia_vencimento: number | null
  ativo: boolean
  criado_em: string
  user_id?: string
}

export interface Sessao {
  id: string
  paciente_id: string | null
  avulso_nome: string | null
  avulso_telefone: string | null
  modalidade_sessao_id: string
  meio_atendimento_id: string
  data_hora: string
  status: SessaoStatus
  valor_cobrado: number | null
  pago: boolean
  forma_pagamento: string | null
  data_pagamento: string | null
  sessao_origem_id: string | null
  duracao_minutos: number
  notas_checklist: string | null
  criado_em: string
  user_id?: string
}
```

For `RegraRepasse`, `Repasse`, and any other interfaces in `types.ts` that map to tenant-scoped tables, add `user_id?: string` the same way.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors related to the new field (it's optional so nothing breaks).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add optional user_id to all tenant interfaces"
```

---

## Task 3: Update OnboardingPage — insert → update

**Files:**
- Modify: `src/pages/OnboardingPage.tsx:19-32`

The signup trigger now creates a `config_psicologo` row on user creation. The onboarding must `update` the existing row instead of `insert`.

- [ ] **Step 1: Update the `finalize` function**

In `src/pages/OnboardingPage.tsx`, replace lines 19–32:

```typescript
async function finalize(whatsappOpcao: 'agora' | 'depois' | 'nao') {
  if (!dadosStep1) return
  setErroFinal(null)

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    setErroFinal('Sessão expirada. Faça login novamente.')
    return
  }

  const { error } = await supabase.from('config_psicologo').update({
    nome: dadosStep1.nome,
    horario_inicio: dadosStep1.horario_inicio,
    horario_fim: dadosStep1.horario_fim,
    horario_checklist: dadosStep1.horario_checklist,
    automacao_whatsapp_ativa: false,
  }).eq('user_id', user.id)

  if (error) {
    setErroFinal('Erro ao salvar configurações. Tente novamente.')
    return
  }

  if (convenios.length > 0) {
    await supabase.from('convenios').insert(
      convenios.map(c => ({ nome: c.nome, valor_sessao: c.valor_sessao, ativo: true }))
    )
  }

  navigate(whatsappOpcao === 'agora' ? '/configuracoes?setup=whatsapp' : '/agenda')
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/OnboardingPage.tsx
git commit -m "feat(onboarding): update config instead of insert (trigger creates row)"
```

---

## Task 4: Update ProtectedRoute — check for nome field

**Files:**
- Modify: `src/components/ProtectedRoute.tsx:13-16`

The signup trigger creates a `config_psicologo` row with `nome = null`. The current check `data.length > 0` now returns true even for un-onboarded users. Must also check `!!data[0]?.nome`.

- [ ] **Step 1: Update the onboarding check**

In `src/components/ProtectedRoute.tsx`, replace lines 13–16:

```typescript
supabase
  .from('config_psicologo')
  .select('id, nome')
  .limit(1)
  .then(({ data }) => setOnboardingDone(!!data && data.length > 0 && !!data[0]?.nome))
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/components/__tests__/ProtectedRoute.test.tsx
```

Expected: existing tests pass. The test file mocks Supabase — update the mock to return `{ id: '1', nome: 'Test' }` for the "onboarding done" case and `{ id: '1', nome: null }` for "not done".

- [ ] **Step 3: Commit**

```bash
git add src/components/ProtectedRoute.tsx
git commit -m "fix(protected-route): check nome field for onboarding detection"
```

---

## Task 5: Update LoginPage — add signup

**Files:**
- Modify: `src/pages/LoginPage.tsx`

- [ ] **Step 1: Add signup state and handler**

In `src/pages/LoginPage.tsx`, add after the existing state declarations (around line 19):

```typescript
const [isSignup, setIsSignup] = useState(false)
```

Add a `signUp` handler after `onSubmit`:

```typescript
async function onSignup(data: FormData) {
  setServerError(null)
  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
  })
  if (error) {
    setServerError(error.message)
    return
  }
  navigate('/onboarding')
}
```

- [ ] **Step 2: Update the JSX to toggle between login and signup**

Replace the `<Button>` and the form's `onSubmit` to switch based on `isSignup`:

```tsx
<form onSubmit={handleSubmit(isSignup ? onSignup : onSubmit)} className="flex flex-col gap-4">
  {/* ...existing email + password fields unchanged... */}

  {serverError && (
    <p className="text-xs text-[#E07070] text-center">{serverError}</p>
  )}

  <Button
    type="submit"
    disabled={isSubmitting}
    className="w-full bg-primary hover:bg-primary/90 text-white mt-2"
  >
    {isSubmitting
      ? (isSignup ? 'Criando conta...' : 'Entrando...')
      : (isSignup ? 'Criar conta' : 'Entrar')}
  </Button>

  <button
    type="button"
    onClick={() => { setIsSignup(s => !s); setServerError(null) }}
    className="text-sm text-muted text-center hover:text-primary transition-colors"
  >
    {isSignup ? 'Já tenho conta — fazer login' : 'Não tenho conta — criar agora'}
  </button>
</form>
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/LoginPage.tsx
git commit -m "feat(login): add signup toggle"
```

---

## Task 6: Update send-lembrete edge function

**Files:**
- Modify: `supabase/functions/send-lembrete/index.ts`

Currently fetches config with `.limit(1).single()` (single-user assumption). Must fetch session first to get `user_id`, then fetch config by that user_id.

- [ ] **Step 1: Reorder fetch — session first, then config by user_id**

Replace the existing block (lines 27–44, from `// 1. Load config` through `// 2. Fetch session`):

```typescript
// 1. Fetch session (includes user_id)
const { data: sessao } = await supabase
  .from('sessoes')
  .select('id, data_hora, user_id, avulso_nome, avulso_telefone, paciente_id, pacientes(nome, telefone)')
  .eq('id', sessao_id)
  .in('status', ['agendada', 'confirmada'])
  .single()

if (!sessao) {
  return new Response(JSON.stringify({ error: 'Sessão não encontrada ou status inválido' }), { status: 404, headers: corsHeaders })
}

// 2. Fetch config for this specific tenant
const { data: config } = await supabase
  .from('config_psicologo')
  .select('automacao_whatsapp_ativa, whatsapp_conectado, evolution_instance_name, evolution_token, nome')
  .eq('user_id', sessao.user_id)
  .single()

if (!config?.whatsapp_conectado || !config?.evolution_instance_name) {
  return new Response(JSON.stringify({ error: 'WhatsApp não conectado' }), { status: 412, headers: corsHeaders })
}
if (!test && !config.automacao_whatsapp_ativa) {
  return new Response(JSON.stringify({ skipped: 'automação inativa' }), { headers: corsHeaders })
}
```

Remove the old `// 2. Fetch session + patient phone` block that came after config fetch (since session is now fetched first). Keep the rest of the function intact — phone extraction and Evolution API call are unchanged.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-lembrete/index.ts
git commit -m "feat(send-lembrete): fetch config by session user_id for multi-tenant"
```

---

## Task 7: Update cron-lembretes edge function

**Files:**
- Modify: `supabase/functions/cron-lembretes/index.ts`

Currently fetches config globally with `.limit(1).single()` — single user assumption. Must iterate all WhatsApp-active tenants and fetch sessions per tenant.

- [ ] **Step 1: Wrap existing session queries per tenant**

In `supabase/functions/cron-lembretes/index.ts`, replace the block starting at `// Fetch reminder schedule config` (line 14) through the end of the function with:

```typescript
// 1. Get all tenants with WhatsApp active and connected
const { data: configs, error: configsError } = await supabase
  .from('config_psicologo')
  .select('user_id, horario_lembrete_1, horario_lembrete_2, horario_inicio')
  .eq('automacao_whatsapp_ativa', true)
  .eq('whatsapp_conectado', true)

if (configsError) console.error('cron-lembretes: configs fetch error', JSON.stringify(configsError))

const allResults: Array<{ sessao_id: string; tipo: string; result: string }> = []

for (const config of configs ?? []) {
  const horarioLembrete1 = config.horario_lembrete_1 ?? '18:00'
  const horarioLembrete2 = config.horario_lembrete_2 ?? '07:00'
  const horarioInicio    = config.horario_inicio ?? '07:00'

  function todayAt(hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number)
    const d = new Date(now)
    d.setUTCHours(h + 3, m, 0, 0)
    return d
  }

  const lembrete1Time    = todayAt(horarioLembrete1)
  const lembrete2Time    = todayAt(horarioLembrete2)
  const inicioTime       = todayAt(horarioInicio)
  const earlyThresholdMs = inicioTime.getTime() + 2 * 3600_000
  const isNearLembrete1  = Math.abs(nowMs - lembrete1Time.getTime()) <= 15 * 60_000
  const isNearLembrete2  = Math.abs(nowMs - lembrete2Time.getTime()) <= 15 * 60_000

  // WINDOW A: lembrete_noite
  if (isNearLembrete1) {
    const noiteFrom = new Date(nowMs + 17.5 * 3600_000).toISOString()
    const noiteTo   = new Date(nowMs + 24   * 3600_000).toISOString()

    const { data: sessoesNoite } = await supabase
      .from('sessoes')
      .select('id, confirmacoes_whatsapp!left(tipo_lembrete)')
      .eq('user_id', config.user_id)
      .gte('data_hora', noiteFrom)
      .lte('data_hora', noiteTo)
      .in('status', ['agendada', 'confirmada'])

    for (const s of sessoesNoite ?? []) {
      const jaEnviado = (s.confirmacoes_whatsapp as any[])?.some((c: any) => c.tipo_lembrete === 'lembrete_noite')
      if (jaEnviado) continue
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-lembrete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ sessao_id: s.id, tipo: 'lembrete_noite' }),
      })
      const body = await resp.json()
      allResults.push({ sessao_id: s.id, tipo: 'lembrete_noite', result: body.ok ? 'sent' : (body.skipped ?? 'error') })
    }
  }

  // WINDOW B: lembrete_manha
  const manhaEarlyFrom = new Date(nowMs + 1.5 * 3600_000).toISOString()
  const manhaEarlyTo   = new Date(nowMs + 2.5 * 3600_000).toISOString()
  const manhaTodayFrom = now.toISOString()
  const manhaTodayTo   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 3, 0)).toISOString()

  const fromTime = isNearLembrete2 ? manhaTodayFrom : manhaEarlyFrom
  const toTime   = isNearLembrete2 ? manhaTodayTo   : manhaEarlyTo

  const { data: sessoesManha } = await supabase
    .from('sessoes')
    .select('id, data_hora, confirmacoes_whatsapp!left(tipo_lembrete, confirmado)')
    .eq('user_id', config.user_id)
    .gte('data_hora', fromTime)
    .lte('data_hora', toTime)
    .in('status', ['agendada', 'confirmada'])

  for (const s of sessoesManha ?? []) {
    const confs = s.confirmacoes_whatsapp as any[]
    if (confs?.some((c: any) => c.tipo_lembrete === 'lembrete_manha')) continue
    if (confs?.some((c: any) => c.confirmado !== null)) continue

    const sessaoMs = new Date(s.data_hora).getTime()
    const isEarly  = sessaoMs < earlyThresholdMs
    if (isEarly) {
      const twoHourBefore = sessaoMs - 2 * 3600_000
      if (Math.abs(nowMs - twoHourBefore) > 15 * 60_000) continue
    } else {
      if (!isNearLembrete2) continue
    }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-lembrete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ sessao_id: s.id, tipo: 'lembrete_manha' }),
    })
    const body = await resp.json()
    allResults.push({ sessao_id: s.id, tipo: 'lembrete_manha', result: body.ok ? 'sent' : (body.skipped ?? 'error') })
  }
}

return new Response(JSON.stringify({ processed: allResults.length, results: allResults }), { status: 200 })
```

Keep the existing `const now = new Date()` and `const nowMs = now.getTime()` at the top of `serve()`.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/cron-lembretes/index.ts
git commit -m "feat(cron-lembretes): iterate tenants for multi-tenant WhatsApp reminders"
```

---

## Task 8: Update whatsapp-webhook edge function

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

Currently identifies the single user implicitly. The webhook payload from Evolution API contains the instance name — use it to look up which tenant owns that instance.

- [ ] **Step 1: Add tenant lookup by instance name**

In `supabase/functions/whatsapp-webhook/index.ts`, after the line `const phone = normalizePhone(...)` (around line 42) and before the Supabase client creation, add a tenant-lookup step. But first, the instance name must be extracted from the payload early in the function.

Add this block immediately after `const payload = await req.json()` (around line 18):

```typescript
const instanceName: string = payload.instance ?? payload.data?.instance ?? ''
```

Then, after `const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)` (line 43), add:

```typescript
// Identify tenant by instance name
const { data: tenantConfig, error: tenantError } = await supabase
  .from('config_psicologo')
  .select('user_id, evolution_instance_name')
  .eq('evolution_instance_name', instanceName)
  .single()

if (tenantError || !tenantConfig) {
  console.warn(`whatsapp-webhook: unknown instance "${instanceName}"`)
  return new Response('ok') // Don't crash — just ignore
}
const tenantUserId = tenantConfig.user_id
```

Then add `.eq('user_id', tenantUserId)` to the `confirmacoes_whatsapp` query (the existing query on line 48 that finds pending confirmações). This ensures we only match confirmações belonging to this tenant:

```typescript
const { data: rows, error: rowsError } = await supabase
  .from('confirmacoes_whatsapp')
  .select(`id, sessao_id, mensagem_enviada_em, sessoes!inner(data_hora, status, paciente_id, avulso_telefone, pacientes(telefone))`)
  .is('confirmado', null)
  .gt('mensagem_enviada_em', new Date(Date.now() - 24 * 3600_000).toISOString())
  .eq('user_id', tenantUserId)  // ADD THIS LINE
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "feat(whatsapp-webhook): identify tenant by evolution instance name"
```

---

## Task 9: Update whatsapp-setup edge function

**Files:**
- Modify: `supabase/functions/whatsapp-setup/index.ts`

Currently fetches config with `.limit(1).single()`. Must authenticate the user from the JWT in the Authorization header, then fetch config by that user's id.

- [ ] **Step 1: Add user authentication and filter config by user_id**

In `supabase/functions/whatsapp-setup/index.ts`, replace lines 20–28 (the `serve` handler body, from `const { action }` through `if (!config)`):

```typescript
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { action } = await req.json() as { action: 'create' | 'qr' | 'status' }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Authenticate caller
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: corsHeaders })
  }

  const { data: config } = await supabase
    .from('config_psicologo')
    .select('id, evolution_instance_name, evolution_token')
    .eq('user_id', user.id)
    .single()

  if (!config) {
    return new Response(JSON.stringify({ error: 'Config não encontrada' }), { status: 404, headers: corsHeaders })
  }

  // ... rest of function unchanged (action === 'create', 'qr', 'status' branches)
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-setup/index.ts
git commit -m "feat(whatsapp-setup): authenticate user via JWT, fetch config by user_id"
```

---

## Task 10: Deploy and verify

- [ ] **Step 1: Deploy all 4 edge functions**

```bash
supabase functions deploy send-lembrete
supabase functions deploy cron-lembretes
supabase functions deploy whatsapp-webhook
supabase functions deploy whatsapp-setup
```

- [ ] **Step 2: Enable public signup in Supabase Dashboard**

In Supabase Dashboard → Authentication → Settings → Enable email signups = ON.

- [ ] **Step 3: Manual integration test**

1. Sign up two new accounts (Account A and Account B)
2. Each should be redirected to `/onboarding` (config_psicologo exists but `nome` is null)
3. Complete onboarding for both
4. In Account A: create a patient, schedule a session
5. Log in as Account B: verify the patient and session from Account A are NOT visible
6. Verify the WhatsApp section in Configurações works (connects to Account A's instance only)

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: multi-tenant isolation complete — RLS, triggers, edge functions, UI"
```

---

## Self-Review Checklist

- [x] Spec section 2 (Data Model): migration 017 covers all tables
- [x] Spec section 3 (Types): `user_id?: string` added to all interfaces
- [x] Spec section 4 (Hooks): no hook changes needed (RLS transparent)
- [x] Spec section 5.1 (OnboardingPage): insert → update with user.id
- [x] Spec section 5.2 (ProtectedRoute): nome check added
- [x] Spec section 5.3 (LoginPage): signup link added
- [x] Spec section 5.4 (StepAtendimento): no change needed
- [x] Spec section 6.1 (send-lembrete): fetches session first, then config by user_id
- [x] Spec section 6.2 (cron-lembretes): iterates tenants
- [x] Spec section 6.3 (whatsapp-webhook): identifies tenant by instance name
- [x] Spec section 6.4 (whatsapp-setup): authenticates user via JWT
- [x] Migration numbers corrected: 017 (not 014 from spec — spec numbers are taken)
