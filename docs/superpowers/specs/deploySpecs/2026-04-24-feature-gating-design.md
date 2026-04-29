# Design Spec — Feature Gating (Básico vs Completo)

**Date:** 2026-04-24
**Status:** Approved
**Project:** AgendaPsi
**Depends on:** Spec 1 (Multi-Tenant), Spec 2 (Subscriptions)

---

## 1. Overview

Use the `useAssinatura` hook to control access to premium features in the frontend. Enforce the same rules server-side in Edge Functions. Users on the Básico plan (or with an expired trial) lose access to WhatsApp automation and Kanban Realtime but retain full access to scheduling, patients, and financials.

### Goals
- Gate WhatsApp features (setup, send, webhook) behind `plano === 'completo'`
- Gate Kanban Realtime behind `plano === 'completo'`
- Show upgrade prompts instead of hidden features (never break the UI)
- Add a "Plano" page for users to see their subscription status
- Add trial banner showing days remaining
- Enforce gating in Edge Functions (server-side, not just UI)

### Out of scope
- Payment processing (Spec 4)
- Landing page (Spec 5)

---

## 2. Data Model

No new tables. This spec only reads from `assinaturas` (created in Spec 2).

---

## 3. Types

No new types. Uses `Assinatura`, `Plano`, `StatusAssinatura` from Spec 2.

---

## 4. Hooks

Uses `useAssinatura()` from Spec 2. No new hooks.

---

## 5. UI Changes

### 5.1 ConfiguracoesPage.tsx — WhatsApp Section

**Current:** The WhatsApp configuration section (QR code, test send, connection status) is always visible.

**Change:** Wrap the WhatsApp section in a conditional. If `!podUsarWhatsapp`, show an upgrade card instead.

```tsx
const { podUsarWhatsapp, isTrialAtivo, diasRestantesTrial } = useAssinatura()

{podUsarWhatsapp ? (
  // Existing WhatsApp config UI (QR code, test, status)
) : (
  <div className="bg-primary-light rounded-card p-6 border border-primary/20 text-center">
    <h3 className="font-display text-lg font-semibold text-primary mb-2">
      WhatsApp Automático
    </h3>
    <p className="text-muted text-sm mb-4">
      Envie lembretes automáticos e receba confirmações direto no Kanban.
      Disponível no plano Completo.
    </p>
    <Link
      to="/plano"
      className="inline-block bg-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
    >
      Fazer upgrade — R$ 50/mês
    </Link>
  </div>
)}
```

### 5.2 KanbanPage.tsx — Realtime Subscription

**Current:** The Kanban subscribes to Supabase Realtime for live updates when WhatsApp confirmations arrive.

**Change:** Only subscribe to Realtime if `podUsarWhatsapp`. Otherwise, the Kanban works as a static list that updates on manual refresh.

```tsx
const { podUsarWhatsapp } = useAssinatura()

useEffect(() => {
  if (!podUsarWhatsapp) return  // No realtime for Básico plan

  const channel = supabase
    .channel('sessoes-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sessoes' }, () => {
      refetch()
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [podUsarWhatsapp])
```

### 5.3 [NEW] PlanoPage.tsx — `/plano`

New page showing subscription status and plan management.

**Layout:**

```
┌──────────────────────────────────────┐
│  Seu Plano                           │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ 🟢 Trial Ativo                │  │
│  │ Plano Completo                │  │
│  │ 12 dias restantes             │  │
│  │ Expira em 08/05/2026          │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌─────────────┐ ┌──────────────┐   │
│  │ Básico      │ │ Completo ⭐  │   │
│  │ R$ 30/mês   │ │ R$ 50/mês   │   │
│  │             │ │              │   │
│  │ ✅ Agenda   │ │ ✅ Tudo do   │   │
│  │ ✅ Pacientes│ │   Básico    │   │
│  │ ✅ Financ.  │ │ ✅ WhatsApp │   │
│  │ ❌ WhatsApp │ │ ✅ Realtime │   │
│  │             │ │              │   │
│  │ [Assinar]   │ │ [Assinar]   │   │
│  └─────────────┘ └──────────────┘   │
│                                      │
│  Gerenciar pagamento →               │
└──────────────────────────────────────┘
```

**States:**
- **Trial ativo:** Show both plan cards with "Assinar" buttons. Show days remaining.
- **Ativo:** Show current plan highlighted. Show "Gerenciar pagamento" link (Stripe Portal).
- **Inadimplente:** Show warning banner. Show "Atualizar pagamento" button.
- **Cancelado:** Show "Reativar assinatura" button.

### 5.4 AppLayout — Trial Banner

When the user is on trial, show a non-intrusive banner at the top of the layout:

```tsx
{isTrialAtivo && (
  <div className="bg-primary/10 text-primary text-sm text-center py-2 px-4">
    Teste grátis — {diasRestantesTrial} dias restantes.{' '}
    <Link to="/plano" className="font-medium underline">Escolher plano</Link>
  </div>
)}
```

When trial is expired and status is `inadimplente`:

```tsx
{assinatura?.status === 'inadimplente' && (
  <div className="bg-accent/10 text-accent text-sm text-center py-2 px-4">
    Seu período de teste expirou.{' '}
    <Link to="/plano" className="font-medium underline">Assinar agora</Link>
  </div>
)}
```

### 5.5 Sidebar / BottomNav — Plano Item

Add a "Plano" navigation item with contextual badge:

```tsx
{ path: '/plano', icon: Crown, label: 'Plano', badge: isTrialAtivo ? 'Trial' : undefined }
```

### 5.6 Router

Add the new route:

```tsx
{ path: '/plano', element: <PlanoPage /> }
```

---

## 6. Edge Functions — Server-Side Enforcement

### 6.1 `send-lembrete/index.ts`

After fetching the session's tenant config, also check the subscription:

```typescript
const { data: assinatura } = await supabase
  .from('assinaturas')
  .select('plano, status, trial_fim')
  .eq('user_id', sessao.user_id)
  .single()

const hoje = new Date().toISOString().slice(0, 10)
const podUsarWhatsapp =
  assinatura?.plano === 'completo' &&
  (assinatura?.status === 'ativo' || (assinatura?.status === 'trial' && assinatura?.trial_fim >= hoje))

if (!podUsarWhatsapp) {
  return new Response(JSON.stringify({ error: 'plano não permite WhatsApp' }), { status: 403, headers: corsHeaders })
}
```

### 6.2 `cron-lembretes/index.ts`

Filter tenants by plan when querying configs:

```typescript
const { data: configs } = await supabase
  .from('config_psicologo')
  .select('user_id, assinaturas!inner(plano, status, trial_fim)')
  .eq('automacao_whatsapp_ativa', true)
  .eq('whatsapp_conectado', true)

// Then filter in code:
const eligible = configs?.filter(c => {
  const a = c.assinaturas
  return a.plano === 'completo' && (a.status === 'ativo' || (a.status === 'trial' && a.trial_fim >= hoje))
})
```

### 6.3 `whatsapp-setup/index.ts`

Check subscription before creating/connecting an Evolution API instance:

```typescript
const { data: assinatura } = await supabase
  .from('assinaturas')
  .select('plano, status, trial_fim')
  .eq('user_id', user.id)
  .single()

if (!podUsarWhatsapp(assinatura)) {
  return new Response(JSON.stringify({ error: 'Faça upgrade para o plano Completo para usar o WhatsApp' }), { status: 403, headers: corsHeaders })
}
```

---

## 7. Error Handling

| Situation | Behavior |
|-----------|----------|
| User on Básico tries to access WhatsApp config | UI shows upgrade card, no error |
| Edge Function receives request from Básico user | Returns 403 with friendly message |
| Trial expires mid-session | No immediate disruption; features gate on next page load |
| User with Completo plan downgrades | WhatsApp stays connected until end of billing cycle; then gated |

---

## 8. Testing

### Unit
- `PlanoPage` renders correctly for each status: trial, ativo, cancelado, inadimplente
- ConfiguracoesPage shows WhatsApp section when `podUsarWhatsapp=true`, upgrade card when `false`
- Trial banner appears when `isTrialAtivo=true`, disappears when `false`

### Integration
- Create user → verify trial → assert WhatsApp config accessible
- Set `trial_fim` to yesterday → assert WhatsApp config shows upgrade card
- Set `plano=basico`, `status=ativo` → assert WhatsApp gated, rest of app works

### Edge Function
- Call `send-lembrete` with Básico user → assert 403
- Call `whatsapp-setup` with Básico user → assert 403

---

## 9. Rollout

1. Deploy `PlanoPage` and router change
2. Update `ConfiguracoesPage` with WhatsApp gating
3. Update `KanbanPage` with Realtime gating
4. Update `AppLayout` with trial/inadimplente banners
5. Update Sidebar/BottomNav with Plano item
6. Deploy updated Edge Functions with plan checks

---

## 10. Open Questions

None. All decisions captured:
- WhatsApp and Realtime are the only gated features
- Trial users get full Completo access for 14 days
- Expired trial degrades gracefully to Básico (no data loss, no lockout)
- Server-side enforcement in all WhatsApp-related Edge Functions
