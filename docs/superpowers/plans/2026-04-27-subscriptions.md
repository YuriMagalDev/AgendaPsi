# Subscriptions & Billing Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `assinaturas` table, provision a 14-day trial for every new signup, and expose subscription data to the frontend via a `useAssinatura` hook.

**Architecture:** New `assinaturas` table (one row per user, UNIQUE on user_id). The existing `handle_new_user` trigger from Plan 1 is extended to insert the trial subscription row. A frontend hook reads the row and exposes computed values (`isTrialAtivo`, `diasRestantesTrial`, `podUsarWhatsapp`, `assinaturaAtiva`). No UI in this plan — that's Plan 3.

**Tech Stack:** PostgreSQL, Supabase RLS, React/TypeScript hooks.

> **PREREQUISITE:** Plan 1 (Multi-Tenant) must be applied first. The `handle_new_user` trigger must exist.

> **IMPORTANT — Migration numbers:** The spec references migration 015, but that number is taken (`015_patient_notes.sql`). Use **018** for this migration.

---

## File Structure

**New files:**
- `supabase/migrations/018_subscriptions.sql` — `assinaturas` table + RLS + extend `handle_new_user`
- `src/hooks/useAssinatura.ts` — hook to read and expose subscription state

**Modified files:**
- `src/lib/types.ts` — add `Plano`, `StatusAssinatura`, `Assinatura` types

---

## Task 1: Migration — assinaturas table

**Files:**
- Create: `supabase/migrations/018_subscriptions.sql`

- [ ] **Step 1: Write migration file**

```sql
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
```

Note: `CREATE OR REPLACE FUNCTION` on `handle_new_user` replaces the function body from Plan 1. The trigger `on_auth_user_created` already exists from migration 017 — do NOT re-create it.

- [ ] **Step 2: Apply migration via Supabase SQL Editor**

Paste and run. Verify:
- `assinaturas` table exists in Table Editor
- RLS is enabled on `assinaturas`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/018_subscriptions.sql
git commit -m "feat(db): add assinaturas table, provision trial on signup"
```

---

## Task 2: Add Subscription types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Append new types to end of types.ts**

```typescript
export type Plano = 'basico' | 'completo'
export type StatusAssinatura = 'trial' | 'ativo' | 'cancelado' | 'inadimplente'

export interface Assinatura {
  id: string
  user_id: string
  plano: Plano
  status: StatusAssinatura
  trial_fim: string        // ISO date string yyyy-MM-dd
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  criado_em: string
  atualizado_em: string
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add Plano, StatusAssinatura, Assinatura"
```

---

## Task 3: Create useAssinatura hook

**Files:**
- Create: `src/hooks/useAssinatura.ts`

- [ ] **Step 1: Write failing test**

Create `src/hooks/__tests__/useAssinatura.test.ts`:

```typescript
import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAssinatura } from '../useAssinatura'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

function mockSupabase(data: unknown, error: unknown = null) {
  ;(supabase.from as any).mockReturnValue({
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  })
}

describe('useAssinatura', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trial ativo: isTrialAtivo=true, diasRestantesTrial>0, podUsarWhatsapp=true', async () => {
    const trialFim = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'trial', trial_fim: trialFim, stripe_customer_id: null, stripe_subscription_id: null, criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isTrialAtivo).toBe(true)
    expect(result.current.diasRestantesTrial).toBeGreaterThan(0)
    expect(result.current.podUsarWhatsapp).toBe(true)
    expect(result.current.assinaturaAtiva).toBe(true)
  })

  it('trial expirado: isTrialAtivo=false, podUsarWhatsapp=false', async () => {
    const trialFim = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10)
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'trial', trial_fim: trialFim, stripe_customer_id: null, stripe_subscription_id: null, criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isTrialAtivo).toBe(false)
    expect(result.current.diasRestantesTrial).toBe(0)
    expect(result.current.podUsarWhatsapp).toBe(false)
    expect(result.current.assinaturaAtiva).toBe(false)
  })

  it('ativo completo: assinaturaAtiva=true, podUsarWhatsapp=true', async () => {
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'ativo', trial_fim: '2026-01-01', stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub_x', criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinaturaAtiva).toBe(true)
    expect(result.current.podUsarWhatsapp).toBe(true)
    expect(result.current.isTrialAtivo).toBe(false)
  })

  it('ativo basico: assinaturaAtiva=true, podUsarWhatsapp=false', async () => {
    mockSupabase({ id: '1', user_id: 'u1', plano: 'basico', status: 'ativo', trial_fim: '2026-01-01', stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub_x', criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinaturaAtiva).toBe(true)
    expect(result.current.podUsarWhatsapp).toBe(false)
  })

  it('inadimplente: assinaturaAtiva=false, podUsarWhatsapp=false', async () => {
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'inadimplente', trial_fim: '2026-01-01', stripe_customer_id: null, stripe_subscription_id: null, criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinaturaAtiva).toBe(false)
    expect(result.current.podUsarWhatsapp).toBe(false)
  })

  it('cancelado: assinaturaAtiva=false', async () => {
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'cancelado', trial_fim: '2026-01-01', stripe_customer_id: null, stripe_subscription_id: null, criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinaturaAtiva).toBe(false)
  })

  it('null assinatura: treats as inadimplente', async () => {
    mockSupabase(null)
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinatura).toBeNull()
    expect(result.current.assinaturaAtiva).toBe(false)
    expect(result.current.podUsarWhatsapp).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/__tests__/useAssinatura.test.ts
```

Expected: FAIL — `useAssinatura` module not found.

- [ ] **Step 3: Create the hook**

Create `src/hooks/useAssinatura.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Assinatura } from '@/lib/types'

export function useAssinatura() {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchAssinatura() {
    const { data } = await supabase
      .from('assinaturas')
      .select('*')
      .limit(1)
      .single()
    setAssinatura(data as Assinatura | null)
    setLoading(false)
  }

  useEffect(() => { fetchAssinatura() }, [])

  const hoje = new Date()
  const trialFim = assinatura?.trial_fim ? new Date(assinatura.trial_fim) : null

  const isTrialAtivo =
    assinatura?.status === 'trial' &&
    trialFim !== null &&
    trialFim >= hoje

  const diasRestantesTrial = isTrialAtivo && trialFim
    ? Math.max(0, Math.ceil((trialFim.getTime() - hoje.getTime()) / 86_400_000))
    : 0

  const podUsarWhatsapp =
    assinatura?.plano === 'completo' &&
    (assinatura?.status === 'ativo' || isTrialAtivo)

  const assinaturaAtiva =
    assinatura?.status === 'ativo' || isTrialAtivo

  return {
    assinatura,
    loading,
    isTrialAtivo,
    diasRestantesTrial,
    podUsarWhatsapp,
    assinaturaAtiva,
    refetch: fetchAssinatura,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/useAssinatura.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useAssinatura.ts src/hooks/__tests__/useAssinatura.test.ts
git commit -m "feat(useAssinatura): subscription hook with trial, plan, and WhatsApp access logic"
```

---

## Task 4: Integration verification

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all existing tests pass + 7 new `useAssinatura` tests pass.

- [ ] **Step 2: Manual integration test**

1. Sign up a new account (requires Plan 1 deployed)
2. In Supabase Dashboard → Table Editor → assinaturas: verify row exists with `plano=completo`, `status=trial`, `trial_fim = today + 14 days`
3. In browser console, verify `useAssinatura()` returns the correct data after onboarding

---

## Self-Review Checklist

- [x] Spec section 2 (Data Model): `assinaturas` table with all fields
- [x] Spec section 2 (handle_new_user): trigger extended with assinatura insert
- [x] Migration number corrected: 018 (not 015 from spec — spec numbers are taken)
- [x] Spec section 3 (Types): `Plano`, `StatusAssinatura`, `Assinatura` added
- [x] Spec section 4 (useAssinatura hook): all computed values implemented
- [x] Tests cover: trial active, trial expired, ativo completo, ativo basico, inadimplente, cancelado, null
- [x] Note: `CREATE OR REPLACE FUNCTION handle_new_user()` replaces Plan 1's version — do NOT re-create the trigger
