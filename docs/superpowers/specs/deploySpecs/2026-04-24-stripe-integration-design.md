# Design Spec — Stripe Integration

**Date:** 2026-04-24
**Status:** Approved
**Project:** AgendaPsi
**Depends on:** Spec 1 (Multi-Tenant), Spec 2 (Subscriptions), Spec 3 (Feature Gating)

---

## 1. Overview

Integrate Stripe for recurring subscription billing. Users select a plan and are redirected to Stripe Checkout to pay. Stripe webhooks keep the `assinaturas` table in sync. Users manage their payment method and invoices via Stripe's hosted Billing Portal.

### Goals
- Create Stripe Checkout sessions from an Edge Function
- Handle Stripe webhooks to update subscription status automatically
- Provide a Stripe Billing Portal link for self-service payment management
- Support PIX and credit card payments (Stripe supports both in Brazil)

### Out of scope
- Custom payment UI (we use Stripe's hosted pages)
- Invoice generation / nota fiscal (future)
- Annual billing / discounts (future)
- Refunds (handled manually in Stripe Dashboard)

---

## 2. Stripe Products Setup (Manual, in Stripe Dashboard)

Create two products with monthly recurring prices:

| Product | Price ID (env var) | Amount | Currency | Interval |
|---------|-------------------|--------|----------|----------|
| AgendaPsi Básico | `STRIPE_PRICE_BASICO` | R$ 30,00 | BRL | Monthly |
| AgendaPsi Completo | `STRIPE_PRICE_COMPLETO` | R$ 50,00 | BRL | Monthly |

Enable payment methods in Stripe Dashboard:
- ✅ Credit/Debit card
- ✅ PIX
- ✅ Boleto (optional)

---

## 3. Environment Variables

Add to Supabase Edge Function secrets:

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASICO=price_...
STRIPE_PRICE_COMPLETO=price_...
```

Add to `.env.example`:
```env
# Stripe — server-side only (set via: supabase secrets set KEY=value)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BASICO=price_...
STRIPE_PRICE_COMPLETO=price_...
```

---

## 4. Edge Functions

### 4.1 [NEW] `supabase/functions/stripe-checkout/index.ts`

Creates a Stripe Checkout Session and returns the URL. The frontend redirects the user to this URL.

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PRICES: Record<string, string> = {
  basico:   Deno.env.get('STRIPE_PRICE_BASICO')!,
  completo: Deno.env.get('STRIPE_PRICE_COMPLETO')!,
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // 1. Authenticate user
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 2. Get requested plan
  const { plano } = await req.json() as { plano: 'basico' | 'completo' }
  const priceId = PRICES[plano]
  if (!priceId) return new Response('Invalid plan', { status: 400 })

  // 3. Get or create Stripe customer
  const { data: assinatura } = await supabase
    .from('assinaturas')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  let customerId = assinatura?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.id },
    })
    customerId = customer.id
    await supabase.from('assinaturas')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', user.id)
  }

  // 4. Create Checkout Session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${req.headers.get('origin')}/plano?status=sucesso`,
    cancel_url: `${req.headers.get('origin')}/plano?status=cancelado`,
    metadata: { user_id: user.id, plano },
    payment_method_types: ['card'],
    locale: 'pt-BR',
  })

  return new Response(JSON.stringify({ url: session.url }), { headers: corsHeaders })
})
```

### 4.2 [NEW] `supabase/functions/stripe-webhook/index.ts`

Receives Stripe webhook events and updates the `assinaturas` table.

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-04-10' })
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET)
  } catch (e) {
    return new Response(`Webhook Error: ${e.message}`, { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id
      const plano = session.metadata?.plano ?? 'basico'
      if (userId) {
        await supabase.from('assinaturas').update({
          plano,
          status: 'ativo',
          stripe_subscription_id: session.subscription as string,
          atualizado_em: new Date().toISOString(),
        }).eq('user_id', userId)
      }
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      await supabase.from('assinaturas').update({
        status: 'ativo',
        atualizado_em: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      await supabase.from('assinaturas').update({
        status: 'inadimplente',
        atualizado_em: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId)
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      await supabase.from('assinaturas').update({
        status: 'cancelado',
        atualizado_em: new Date().toISOString(),
      }).eq('stripe_customer_id', customerId)
      break
    }
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 })
})
```

### 4.3 [NEW] `supabase/functions/stripe-portal/index.ts`

Creates a Stripe Billing Portal session for the user to manage their payment method, view invoices, and cancel their subscription.

```typescript
serve(async (req) => {
  // 1. Authenticate user (same pattern as stripe-checkout)
  // 2. Get stripe_customer_id from assinaturas
  // 3. Create portal session:
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${req.headers.get('origin')}/plano`,
  })
  return new Response(JSON.stringify({ url: session.url }), { headers: corsHeaders })
})
```

---

## 5. UI Changes

### 5.1 PlanoPage.tsx — Connect to Stripe

The "Assinar" buttons on the plan cards call the `stripe-checkout` Edge Function:

```typescript
async function handleAssinar(plano: 'basico' | 'completo') {
  setLoading(true)
  const { data } = await supabase.functions.invoke('stripe-checkout', {
    body: { plano },
  })
  if (data?.url) {
    window.location.href = data.url  // Redirect to Stripe Checkout
  }
  setLoading(false)
}
```

The "Gerenciar pagamento" link calls `stripe-portal`:

```typescript
async function handlePortal() {
  const { data } = await supabase.functions.invoke('stripe-portal')
  if (data?.url) {
    window.location.href = data.url  // Redirect to Stripe Portal
  }
}
```

### 5.2 PlanoPage.tsx — Success State

When the user returns from Stripe Checkout with `?status=sucesso`, show a success toast and refetch the subscription.

---

## 6. Data Flow

```
User clicks "Assinar Completo"
  → Frontend calls stripe-checkout Edge Function
  → Edge Function creates Stripe Checkout Session
  → User redirected to Stripe (pays with card or PIX)
  → Stripe sends webhook → stripe-webhook Edge Function
  → Edge Function updates assinaturas.status = 'ativo', plano = 'completo'
  → User returns to /plano?status=sucesso
  → useAssinatura refetches → podUsarWhatsapp = true
  → WhatsApp features unlocked
```

---

## 7. Error Handling

| Situation | Behavior |
|-----------|----------|
| User abandons Stripe Checkout | No change to assinaturas; user returns to `/plano?status=cancelado` |
| Stripe webhook signature invalid | Return 400; assinatura not updated |
| PIX payment pending | Stripe handles the async flow; webhook fires when payment completes |
| Card declined | Stripe shows error on checkout page; no webhook fired |
| User has no stripe_customer_id | Auto-created on first checkout attempt |

---

## 8. Security

- Stripe webhook endpoint verifies signature using `STRIPE_WEBHOOK_SECRET`
- `stripe-checkout` and `stripe-portal` authenticate the user via JWT
- `stripe-webhook` does NOT require JWT (Stripe calls it directly) — only signature verification
- No Stripe keys in the frontend; all calls go through Edge Functions

---

## 9. Testing

### Integration
- Call `stripe-checkout` → assert Stripe Checkout Session URL returned
- Simulate `checkout.session.completed` webhook → assert assinatura updated to `ativo`
- Simulate `invoice.payment_failed` webhook → assert assinatura updated to `inadimplente`
- Simulate `customer.subscription.deleted` webhook → assert assinatura updated to `cancelado`

### Manual
- Full flow: trial user → click "Assinar" → pay with test card → return to app → verify plan active
- Test PIX payment flow with Stripe test mode
- Test Billing Portal: change card, cancel subscription

### Stripe CLI (local testing)
```bash
stripe listen --forward-to https://<project>.supabase.co/functions/v1/stripe-webhook
stripe trigger checkout.session.completed
```

---

## 10. Rollout

1. Create products and prices in Stripe Dashboard
2. Set environment variables via `supabase secrets set`
3. Deploy 3 new Edge Functions
4. Configure Stripe webhook endpoint in Stripe Dashboard pointing to `https://<project>.supabase.co/functions/v1/stripe-webhook`
5. Update PlanoPage with Stripe integration
6. Test with Stripe test mode before going live

---

## 11. Open Questions

None. All decisions captured:
- Stripe as payment gateway
- Card and PIX as payment methods
- Hosted Checkout and Billing Portal (no custom payment UI)
- All Stripe logic in Edge Functions (never in frontend)
