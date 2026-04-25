# Design Spec — Subscriptions & Billing Model

**Date:** 2026-04-24
**Status:** Approved
**Project:** AgendaPsi
**Depends on:** Spec 1 (Multi-Tenant Isolation)

---

## 1. Overview

Create a subscription system to track each psychologist's plan, trial status, and payment gateway identifiers. Every new signup starts with a 14-day free trial with full access (Completo plan features). After the trial, the user must choose and pay for a plan to continue using premium features.

### Goals
- Track plan type (Básico / Completo) and status (trial / ativo / cancelado / inadimplente) per user
- Auto-provision a trial subscription on signup (extends the `handle_new_user` trigger from Spec 1)
- Expose subscription data to the frontend via a new hook
- Calculate trial expiration and surface it in the UI

### Out of scope
- Stripe integration / payment processing (Spec 4)
- UI for feature gating (Spec 3)
- Annual billing / discounts (future)
- Coupon codes (future)

---

## 2. Data Model

### Migration `supabase/migrations/015_subscriptions.sql`

```sql
-- 015_subscriptions.sql

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
```

### Extend `handle_new_user` trigger (from Spec 1)

Add one line to the existing trigger function:

```sql
-- Inside handle_new_user(), after creating config and modalidades:
INSERT INTO public.assinaturas (user_id, plano, status)
VALUES (NEW.id, 'completo', 'trial');
```

New users start on plan `completo` with status `trial`. This gives them 14 days of full access (including WhatsApp) to experience the product before paying.

### Plan definitions

| | Básico (R$ 30/mês) | Completo (R$ 50/mês) |
|---|---|---|
| Agenda + Kanban + Checklist | ✅ | ✅ |
| Gestão de Pacientes | ✅ | ✅ |
| Dashboard Financeiro | ✅ | ✅ |
| Convênios e Repasses | ✅ | ✅ |
| Importação/Exportação CSV | ✅ | ✅ |
| Slots Semanais (grade fixa) | ✅ | ✅ |
| WhatsApp Automático (lembretes D-1) | ❌ | ✅ |
| Kanban Realtime (via Supabase Realtime) | ❌ | ✅ |

### Status lifecycle

```
signup → trial (14 days, plano=completo)
         ├─ pays for Completo → ativo (plano=completo)
         ├─ pays for Básico   → ativo (plano=basico)
         └─ does nothing      → inadimplente (degrades to Básico features)

ativo    ├─ payment fails     → inadimplente
         └─ user cancels      → cancelado (active until end of billing period)

inadimplente → pays again     → ativo
cancelado    → resubscribes   → ativo
```

---

## 3. Types

Add to `src/lib/types.ts`:

```typescript
export type Plano = 'basico' | 'completo'
export type StatusAssinatura = 'trial' | 'ativo' | 'cancelado' | 'inadimplente'

export interface Assinatura {
  id: string
  user_id: string
  plano: Plano
  status: StatusAssinatura
  trial_fim: string        // ISO date string (yyyy-MM-dd)
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  criado_em: string
  atualizado_em: string
}
```

---

## 4. Hooks

### [NEW] `src/hooks/useAssinatura.ts`

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

  const isTrialAtivo = assinatura?.status === 'trial' && trialFim !== null && trialFim >= hoje

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

Key computed values:
- `isTrialAtivo` — true if status is `trial` and `trial_fim >= today`
- `diasRestantesTrial` — number of days left in trial (0 if expired)
- `podUsarWhatsapp` — true if plan is `completo` AND (status is `ativo` OR trial is active)
- `assinaturaAtiva` — true if status is `ativo` or trial is active (used to check general app access)

---

## 5. UI Changes

### 5.1 No UI in this spec

UI for displaying plan info, upgrade buttons, and feature gating is covered in Spec 3 (Feature Gating). This spec only creates the data layer and hook.

---

## 6. Error Handling

| Situation | Behavior |
|-----------|----------|
| Signup trigger fails to create assinatura | Entire signup transaction rolls back |
| User has no assinatura row (impossible after trigger, but defensive) | `useAssinatura` returns `null`; app treats as `inadimplente` |
| Trial expired but user hasn't paid | `isTrialAtivo = false`, `podUsarWhatsapp = false`; app still works in Básico mode |
| Stripe webhook updates status to `inadimplente` | Next page load picks up new status via `useAssinatura` |

---

## 7. Testing

### Unit
- `useAssinatura` hook: mock Supabase response with trial (active), trial (expired), ativo, cancelado, inadimplente
- Assert correct values for `isTrialAtivo`, `diasRestantesTrial`, `podUsarWhatsapp`

### Integration
- Sign up new user → assert `assinaturas` row created with `plano=completo`, `status=trial`, `trial_fim = today + 14 days`

---

## 8. Rollout

1. Apply migration `015_subscriptions.sql`
2. Update `handle_new_user` trigger to include assinatura creation
3. Deploy `useAssinatura` hook and types
4. No UI changes in this spec — those come in Spec 3

---

## 9. Open Questions

None. All decisions captured:
- Trial starts on `completo` plan (user experiences full product)
- Trial lasts 14 days
- Only two plans: Básico (R$ 30) and Completo (R$ 50)
- No annual billing in v1
