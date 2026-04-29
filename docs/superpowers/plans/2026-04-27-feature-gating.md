# Feature Gating (Básico vs Completo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate WhatsApp features and Kanban Realtime behind the Completo plan; add a `/plano` page showing subscription status; add trial banner in AppLayout; add nav item for Plano; enforce gating in WhatsApp-related Edge Functions.

**Architecture:** The `useAssinatura()` hook (from Plan 2) drives all frontend gates. `podUsarWhatsapp` controls both the WhatsApp config section and Realtime subscription in Kanban. No new tables or hooks needed. Edge functions check `assinaturas` directly via the service role client.

**Tech Stack:** React/TypeScript, TailwindCSS, `lucide-react`, Supabase Edge Functions (Deno).

> **PREREQUISITE:** Plans 1 and 2 must be applied first. `useAssinatura` hook must exist. `assinaturas` table must exist.

---

## File Structure

**New files:**
- `src/pages/PlanoPage.tsx` — subscription status page with plan cards

**Modified files:**
- `src/pages/ConfiguracoesPage.tsx:461` — gate WhatsApp section with `podUsarWhatsapp`
- `src/pages/KanbanPage.tsx` — add Realtime subscription, gated by `podUsarWhatsapp`
- `src/components/layout/AppLayout.tsx` — add trial and inadimplente banners
- `src/components/layout/Sidebar.tsx` — add `/plano` nav item
- `src/components/layout/BottomNav.tsx` — add `/plano` nav item
- `src/router.tsx` — add `/plano` route
- `supabase/functions/send-lembrete/index.ts` — add plan check (403 for non-Completo)
- `supabase/functions/whatsapp-setup/index.ts` — add plan check (403 for non-Completo)
- `supabase/functions/cron-lembretes/index.ts` — already filters by WhatsApp-active configs; no extra change needed (configs with `automacao_whatsapp_ativa=false` are skipped; gating via UI prevents activation for Básico users)

---

## Task 1: Gate WhatsApp section in ConfiguracoesPage

**Files:**
- Modify: `src/pages/ConfiguracoesPage.tsx`

- [ ] **Step 1: Import useAssinatura and Link**

Add to the imports at the top of `src/pages/ConfiguracoesPage.tsx`:

```typescript
import { Link } from 'react-router-dom'
import { useAssinatura } from '@/hooks/useAssinatura'
```

- [ ] **Step 2: Destructure podUsarWhatsapp inside the component**

Add after the existing hooks (around line 18, after `useConfigPsicologo`):

```typescript
const { podUsarWhatsapp } = useAssinatura()
```

- [ ] **Step 3: Wrap the WhatsApp section**

The WhatsApp section starts at line 461 (`{/* WhatsApp */}`). The entire `<div className="bg-surface border border-border rounded-card p-6">` block (lines 462–end of section) should be replaced with this conditional:

```tsx
{/* WhatsApp */}
{podUsarWhatsapp ? (
  <div className="bg-surface border border-border rounded-card p-6">
    <h2 className="font-display text-lg font-semibold text-[#1C1C1C] mb-4">Automação WhatsApp</h2>
    {/* ...all existing WhatsApp states A/B/C unchanged... */}
  </div>
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

Keep all existing WhatsApp state/handler code (iniciarConexao, verificarConexao, reconectar, etc.) untouched — it's still used when `podUsarWhatsapp` is true.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ConfiguracoesPage.tsx
git commit -m "feat(configuracoes): gate WhatsApp section behind Completo plan"
```

---

## Task 2: Add Realtime to KanbanPage, gated by plan

**Files:**
- Modify: `src/pages/KanbanPage.tsx`

- [ ] **Step 1: Import useAssinatura and supabase**

Add to imports in `src/pages/KanbanPage.tsx`:

```typescript
import { useAssinatura } from '@/hooks/useAssinatura'
import { supabase } from '@/lib/supabase'
```

- [ ] **Step 2: Destructure podUsarWhatsapp**

Inside `KanbanPage()`, after existing hook calls (after `useSemana`, `useConfigPsicologo` calls):

```typescript
const { podUsarWhatsapp } = useAssinatura()
```

- [ ] **Step 3: Add Realtime subscription effect**

Add this `useEffect` after the existing hook declarations (before the `return` statement):

```typescript
useEffect(() => {
  if (!podUsarWhatsapp) return

  const channel = supabase
    .channel('sessoes-kanban-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sessoes' }, () => {
      refetch()
    })
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [podUsarWhatsapp])
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/KanbanPage.tsx
git commit -m "feat(kanban): add Realtime subscription gated by Completo plan"
```

---

## Task 3: Create PlanoPage

**Files:**
- Create: `src/pages/PlanoPage.tsx`

- [ ] **Step 1: Write failing test**

Create `src/pages/__tests__/PlanoPage.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { PlanoPage } from '../PlanoPage'

vi.mock('@/hooks/useAssinatura', () => ({ useAssinatura: vi.fn() }))
import { useAssinatura } from '@/hooks/useAssinatura'

function renderPage() {
  return render(
    <MemoryRouter>
      <PlanoPage />
    </MemoryRouter>
  )
}

describe('PlanoPage', () => {
  it('shows trial state with days remaining', () => {
    ;(useAssinatura as any).mockReturnValue({
      assinatura: { plano: 'completo', status: 'trial', trial_fim: '2026-05-07', stripe_customer_id: null, stripe_subscription_id: null },
      loading: false,
      isTrialAtivo: true,
      diasRestantesTrial: 10,
      podUsarWhatsapp: true,
      assinaturaAtiva: true,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText(/Trial Ativo/i)).toBeInTheDocument()
    expect(screen.getByText(/10 dias restantes/i)).toBeInTheDocument()
  })

  it('shows active plan state', () => {
    ;(useAssinatura as any).mockReturnValue({
      assinatura: { plano: 'completo', status: 'ativo', trial_fim: '2026-01-01', stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub_x' },
      loading: false,
      isTrialAtivo: false,
      diasRestantesTrial: 0,
      podUsarWhatsapp: true,
      assinaturaAtiva: true,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText(/Plano Ativo/i)).toBeInTheDocument()
    expect(screen.getByText(/Gerenciar pagamento/i)).toBeInTheDocument()
  })

  it('shows inadimplente warning', () => {
    ;(useAssinatura as any).mockReturnValue({
      assinatura: { plano: 'completo', status: 'inadimplente', trial_fim: '2026-01-01', stripe_customer_id: null, stripe_subscription_id: null },
      loading: false,
      isTrialAtivo: false,
      diasRestantesTrial: 0,
      podUsarWhatsapp: false,
      assinaturaAtiva: false,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText(/Pagamento pendente/i)).toBeInTheDocument()
    expect(screen.getByText(/Atualizar pagamento/i)).toBeInTheDocument()
  })

  it('shows both plan cards when not active', () => {
    ;(useAssinatura as any).mockReturnValue({
      assinatura: { plano: 'completo', status: 'trial', trial_fim: '2026-05-07', stripe_customer_id: null, stripe_subscription_id: null },
      loading: false,
      isTrialAtivo: true,
      diasRestantesTrial: 10,
      podUsarWhatsapp: true,
      assinaturaAtiva: true,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Básico')).toBeInTheDocument()
    expect(screen.getByText('Completo')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/pages/__tests__/PlanoPage.test.tsx
```

Expected: FAIL — `PlanoPage` module not found.

- [ ] **Step 3: Create PlanoPage**

Create `src/pages/PlanoPage.tsx`:

```tsx
import { useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAssinatura } from '@/hooks/useAssinatura'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function PlanoPage() {
  const { assinatura, loading, isTrialAtivo, diasRestantesTrial, assinaturaAtiva, refetch } = useAssinatura()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'sucesso') {
      toast.success('Assinatura ativada com sucesso!')
      refetch()
    } else if (status === 'cancelado') {
      toast.info('Pagamento cancelado.')
    }
  }, [])

  async function handleAssinar(plano: 'basico' | 'completo') {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { plano } })
    if (error || !data?.url) {
      toast.error('Erro ao iniciar pagamento. Tente novamente.')
      return
    }
    window.location.href = data.url
  }

  async function handlePortal() {
    const { data, error } = await supabase.functions.invoke('stripe-portal')
    if (error || !data?.url) {
      toast.error('Erro ao abrir portal de pagamento.')
      return
    }
    window.location.href = data.url
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const trialFimFormatted = assinatura?.trial_fim
    ? format(new Date(assinatura.trial_fim + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })
    : null

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Seu Plano</h1>

      {/* Status card */}
      <div className="bg-surface rounded-card border border-border p-5">
        {isTrialAtivo && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4CAF82]" />
              <span className="font-medium text-[#1C1C1C]">Trial Ativo</span>
            </div>
            <p className="text-sm text-muted">Plano Completo</p>
            <p className="text-sm text-muted">{diasRestantesTrial} dias restantes</p>
            {trialFimFormatted && (
              <p className="text-sm text-muted">Expira em {trialFimFormatted}</p>
            )}
          </div>
        )}

        {assinatura?.status === 'ativo' && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4CAF82]" />
              <span className="font-medium text-[#1C1C1C]">Plano Ativo</span>
            </div>
            <p className="text-sm text-muted capitalize">{assinatura.plano}</p>
          </div>
        )}

        {assinatura?.status === 'inadimplente' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C17F59]" />
              <span className="font-medium text-[#C17F59]">Pagamento pendente</span>
            </div>
            <p className="text-sm text-muted">Seu acesso ao plano Completo foi suspenso.</p>
            <button
              onClick={handlePortal}
              className="self-start h-9 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Atualizar pagamento
            </button>
          </div>
        )}

        {assinatura?.status === 'cancelado' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#9CA3AF]" />
              <span className="font-medium text-[#1C1C1C]">Assinatura cancelada</span>
            </div>
            <p className="text-sm text-muted">Você pode reativar a qualquer momento.</p>
          </div>
        )}
      </div>

      {/* Plan cards — shown when not active or when trial/cancelled */}
      {(!assinaturaAtiva || assinatura?.status === 'trial' || assinatura?.status === 'cancelado') && (
        <div className="grid grid-cols-2 gap-4">
          {/* Básico */}
          <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-3">
            <div>
              <h3 className="font-display font-semibold text-[#1C1C1C]">Básico</h3>
              <p className="text-lg font-bold text-primary mt-1">R$ 30<span className="text-sm font-normal text-muted">/mês</span></p>
            </div>
            <ul className="text-sm text-muted flex flex-col gap-1 flex-1">
              <li>✅ Agenda e Kanban</li>
              <li>✅ Gestão de Pacientes</li>
              <li>✅ Financeiro</li>
              <li>✅ Convênios e Repasses</li>
              <li className="text-[#9CA3AF]">❌ WhatsApp Automático</li>
              <li className="text-[#9CA3AF]">❌ Kanban Realtime</li>
            </ul>
            <button
              onClick={() => handleAssinar('basico')}
              className="h-9 px-4 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary-light transition-colors"
            >
              Assinar
            </button>
          </div>

          {/* Completo */}
          <div className="bg-primary-light rounded-card border border-primary/30 p-5 flex flex-col gap-3">
            <div>
              <h3 className="font-display font-semibold text-primary">Completo ⭐</h3>
              <p className="text-lg font-bold text-primary mt-1">R$ 50<span className="text-sm font-normal text-muted">/mês</span></p>
            </div>
            <ul className="text-sm text-muted flex flex-col gap-1 flex-1">
              <li>✅ Tudo do Básico</li>
              <li>✅ WhatsApp Automático</li>
              <li>✅ Kanban Realtime</li>
            </ul>
            <button
              onClick={() => handleAssinar('completo')}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Assinar
            </button>
          </div>
        </div>
      )}

      {/* Manage payment — shown when active subscription exists */}
      {assinatura?.stripe_subscription_id && (
        <button
          onClick={handlePortal}
          className="text-sm text-primary hover:underline self-start"
        >
          Gerenciar pagamento →
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/pages/__tests__/PlanoPage.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PlanoPage.tsx src/pages/__tests__/PlanoPage.test.tsx
git commit -m "feat(plano): add PlanoPage with subscription status and plan cards"
```

---

## Task 4: Add trial/inadimplente banners to AppLayout

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Import useAssinatura and Link**

```typescript
import { Link } from 'react-router-dom'
import { useAssinatura } from '@/hooks/useAssinatura'
```

- [ ] **Step 2: Add banners above main content**

Replace the current `AppLayout` component:

```tsx
export function AppLayout() {
  const { assinatura, isTrialAtivo, diasRestantesTrial } = useAssinatura()

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        {isTrialAtivo && (
          <div className="bg-primary/10 text-primary text-sm text-center py-2 px-4">
            Teste grátis — {diasRestantesTrial} dias restantes.{' '}
            <Link to="/plano" className="font-medium underline">Escolher plano</Link>
          </div>
        )}
        {assinatura?.status === 'inadimplente' && (
          <div className="bg-accent/10 text-accent text-sm text-center py-2 px-4">
            Seu período de teste expirou.{' '}
            <Link to="/plano" className="font-medium underline">Assinar agora</Link>
          </div>
        )}
        <TopBar />
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppLayout.tsx
git commit -m "feat(app-layout): add trial and inadimplente banners"
```

---

## Task 5: Add /plano to Sidebar and BottomNav

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/BottomNav.tsx`

- [ ] **Step 1: Add Crown import and /plano to Sidebar**

In `src/components/layout/Sidebar.tsx`, replace the import line with:

```typescript
import { Calendar, Kanban, Users, BarChart2, Settings, LogOut, ClipboardList, Crown } from 'lucide-react'
import { useAssinatura } from '@/hooks/useAssinatura'
```

Add `/plano` to `navItems` array (after `configuracoes`):

```typescript
const navItems = [
  { to: '/agenda',        icon: Calendar,      label: 'Agenda'        },
  { to: '/kanban',        icon: Kanban,         label: 'Kanban'        },
  { to: '/checklist',     icon: ClipboardList,  label: 'Checklist'     },
  { to: '/pacientes',     icon: Users,          label: 'Pacientes'     },
  { to: '/financeiro',    icon: BarChart2,       label: 'Financeiro'    },
  { to: '/configuracoes', icon: Settings,        label: 'Configurações' },
  { to: '/plano',         icon: Crown,           label: 'Plano'         },
] as const
```

Inside `Sidebar()`, add:

```typescript
const { isTrialAtivo } = useAssinatura()
```

Then in the NavLink render, add a badge for `/plano`:

```tsx
<div className="relative">
  <Icon size={18} />
  {to === '/checklist' && hasPending && (
    <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#E07070] rounded-full" />
  )}
  {to === '/plano' && isTrialAtivo && (
    <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
  )}
</div>
```

- [ ] **Step 2: Add Crown and /plano to BottomNav**

In `src/components/layout/BottomNav.tsx`, update imports:

```typescript
import { Calendar, Kanban, Users, Settings, ClipboardList, Crown } from 'lucide-react'
import { useAssinatura } from '@/hooks/useAssinatura'
```

Add to `staticNavItems`:

```typescript
const staticNavItems = [
  { to: '/agenda',        icon: Calendar,       label: 'Agenda'     },
  { to: '/kanban',        icon: Kanban,          label: 'Kanban'     },
  { to: '/checklist',     icon: ClipboardList,   label: 'Checklist'  },
  { to: '/pacientes',     icon: Users,           label: 'Pacientes'  },
  { to: '/configuracoes', icon: Settings,        label: 'Config.'    },
  { to: '/plano',         icon: Crown,           label: 'Plano'      },
] as const
```

Inside `BottomNav()`, add `const { isTrialAtivo } = useAssinatura()` and a dot badge for `/plano` (same pattern as the checklist badge in the existing code).

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/BottomNav.tsx
git commit -m "feat(nav): add /plano nav item with trial badge"
```

---

## Task 6: Add /plano route to router

**Files:**
- Modify: `src/router.tsx`

- [ ] **Step 1: Import PlanoPage and add route**

Add import:

```typescript
import { PlanoPage } from '@/pages/PlanoPage'
```

Add route inside the `AppLayout` children array (after `configuracoes`):

```typescript
{ path: '/plano', element: <PlanoPage /> },
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/router.tsx
git commit -m "feat(router): add /plano route"
```

---

## Task 7: Edge Function — plan gate in send-lembrete

**Files:**
- Modify: `supabase/functions/send-lembrete/index.ts`

After the config fetch (Task 6 of Plan 1 already added `user_id`-based config fetch), add a subscription check:

- [ ] **Step 1: Add subscription check after config fetch**

After the block that fetches `config` by `sessao.user_id`, add:

```typescript
// Check subscription allows WhatsApp
const { data: assinatura } = await supabase
  .from('assinaturas')
  .select('plano, status, trial_fim')
  .eq('user_id', sessao.user_id)
  .single()

const hoje = new Date().toISOString().slice(0, 10)
const podUsarWhatsapp =
  assinatura?.plano === 'completo' &&
  (assinatura?.status === 'ativo' ||
    (assinatura?.status === 'trial' && (assinatura?.trial_fim ?? '') >= hoje))

if (!podUsarWhatsapp) {
  return new Response(
    JSON.stringify({ error: 'Plano não permite WhatsApp. Faça upgrade para o plano Completo.' }),
    { status: 403, headers: corsHeaders }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/send-lembrete/index.ts
git commit -m "feat(send-lembrete): enforce Completo plan gate"
```

---

## Task 8: Edge Function — plan gate in whatsapp-setup

**Files:**
- Modify: `supabase/functions/whatsapp-setup/index.ts`

After the user auth and config fetch (added in Plan 1 Task 9), add subscription check:

- [ ] **Step 1: Add subscription check before action handling**

After `if (!config)` block, add:

```typescript
// Check subscription allows WhatsApp setup
const { data: assinatura } = await supabase
  .from('assinaturas')
  .select('plano, status, trial_fim')
  .eq('user_id', user.id)
  .single()

const hoje = new Date().toISOString().slice(0, 10)
const podUsarWhatsapp =
  assinatura?.plano === 'completo' &&
  (assinatura?.status === 'ativo' ||
    (assinatura?.status === 'trial' && (assinatura?.trial_fim ?? '') >= hoje))

if (!podUsarWhatsapp) {
  return new Response(
    JSON.stringify({ error: 'Faça upgrade para o plano Completo para usar o WhatsApp.' }),
    { status: 403, headers: corsHeaders }
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/whatsapp-setup/index.ts
git commit -m "feat(whatsapp-setup): enforce Completo plan gate"
```

---

## Task 9: Deploy and verify

- [ ] **Step 1: Deploy edge functions**

```bash
supabase functions deploy send-lembrete
supabase functions deploy whatsapp-setup
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Manual integration test**

1. Log in with a trial user — verify trial banner appears in AppLayout
2. Verify `/plano` shows "Trial Ativo" with days remaining
3. Verify both plan cards are visible
4. Set `trial_fim` to yesterday in Supabase Dashboard → verify banner changes to "expirou" and WhatsApp section in Configurações shows upgrade card
5. Navigate to `/configuracoes` with `plano=basico` → verify upgrade card appears instead of WhatsApp section
6. Navigate to Kanban — verify no errors (Realtime silently skipped for Básico)

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: feature gating complete — plan page, banners, nav, edge function gates"
```

---

## Self-Review Checklist

- [x] Spec section 5.1 (ConfiguracoesPage): WhatsApp gated with upgrade card
- [x] Spec section 5.2 (KanbanPage): Realtime subscription gated
- [x] Spec section 5.3 (PlanoPage): trial/ativo/inadimplente/cancelado states rendered
- [x] Spec section 5.4 (AppLayout): trial and inadimplente banners
- [x] Spec section 5.5 (Sidebar/BottomNav): Crown icon + trial badge
- [x] Spec section 5.6 (Router): /plano route added
- [x] Spec section 6.1 (send-lembrete): 403 for non-Completo
- [x] Spec section 6.3 (whatsapp-setup): 403 for non-Completo
- [x] Spec note on cron-lembretes: already filters by `automacao_whatsapp_ativa=true`; Básico users won't have that active because the UI prevents enabling it
- [x] PlanoPage wires up `stripe-checkout` and `stripe-portal` edge functions (these come in Plan 4 — PlanoPage shows errors if those functions don't exist yet, which is acceptable behavior during staged rollout)
