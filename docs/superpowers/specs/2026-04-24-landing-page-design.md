# Design Spec — Landing Page & Public Routes

**Date:** 2026-04-24
**Status:** Approved
**Project:** AgendaPsi
**Depends on:** Spec 1 (Multi-Tenant), Spec 2 (Subscriptions)

---

## 1. Overview

Create a public-facing landing page at `/` for marketing and user acquisition. Restructure the router to separate public routes (landing, login, signup) from authenticated routes (moved under `/app/*`). Add a public signup page with email/password registration.

### Goals
- Build a compelling landing page that converts visitors into trial signups
- Add a signup page with email/password registration (currently only login exists)
- Move all authenticated routes under `/app/*` prefix for clean separation
- Maintain the existing design system (warm off-white, teal, amber palette)

### Out of scope
- SEO optimization beyond basic meta tags (future)
- Blog / content marketing (future)
- Customer testimonials (future, need real users first)
- A/B testing (future)

---

## 2. Data Model

No data model changes. Signup uses Supabase Auth's `signUp()` method, which triggers the `handle_new_user` function (Spec 1) to provision config, modalidades, and assinatura.

---

## 3. Routes

### New route structure

```
/                        → LandingPage (public)
/login                   → LoginPage (public)
/signup                  → SignupPage (public, NEW)
/onboarding              → OnboardingPage (authenticated, first-time)

/app/agenda              → AgendaPage (authenticated)
/app/kanban              → KanbanPage
/app/checklist           → ChecklistPage
/app/pacientes           → PacientesPage
/app/pacientes/novo      → NovoPacientePage
/app/pacientes/:id       → PacienteDetalhePage
/app/pacientes/:id/editar → EditarPacientePage
/app/financeiro          → FinanceiroPage
/app/financeiro/paciente/:id → FinanceiroPacientePage
/app/configuracoes       → ConfiguracoesPage
/app/plano               → PlanoPage (NEW, from Spec 3)
```

### Router changes in `src/router.tsx`

```tsx
export const router = createBrowserRouter([
  // Public routes
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/signup', element: <SignupPage /> },
  { path: '/onboarding', element: <OnboardingPage /> },

  // Authenticated routes
  {
    path: '/app',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/app/agenda" replace /> },
          { path: 'agenda', element: <AgendaPage /> },
          { path: 'kanban', element: <KanbanPage /> },
          { path: 'checklist', element: <ChecklistPage /> },
          { path: 'pacientes', element: <PacientesPage /> },
          { path: 'pacientes/novo', element: <NovoPacientePage /> },
          { path: 'pacientes/:id', element: <PacienteDetalhePage /> },
          { path: 'pacientes/:id/editar', element: <EditarPacientePage /> },
          { path: 'financeiro', element: <FinanceiroPage /> },
          { path: 'financeiro/paciente/:id', element: <FinanceiroPacientePage /> },
          { path: 'configuracoes', element: <ConfiguracoesPage /> },
          { path: 'plano', element: <PlanoPage /> },
        ],
      },
    ],
  },
])
```

**Impact:** All internal `<Link>` components and `useNavigate()` calls must be updated to use `/app/` prefix. This is a global find-and-replace.

---

## 4. UI — Landing Page

### 4.1 [NEW] `src/pages/LandingPage.tsx`

Single-page layout with the following sections, using the existing design tokens (bg, surface, primary, accent, text, muted).

#### Hero Section

```
┌──────────────────────────────────────────────┐
│                                              │
│  🧠 AgendaPsi                                │
│                                              │
│  Seu consultório organizado.                 │
│  Agenda, pacientes e financeiro              │
│  em um só lugar.                             │
│                                              │
│  [Teste grátis por 14 dias]  [Já tenho conta]│
│                                              │
│  ✓ Sem cartão de crédito   ✓ Cancele quando  │
│                               quiser         │
└──────────────────────────────────────────────┘
```

Font: Fraunces for headings, DM Sans for body (matching existing design system).

#### Features Section

Six feature cards in a 2x3 grid (mobile: single column):

1. 📅 **Agenda Inteligente** — Visualização diária e semanal dos seus atendimentos.
2. 📊 **Kanban por Status** — Organize sessões por status com atualizações em tempo real.
3. 👤 **Gestão de Pacientes** — Cadastro focado em agendamento e cobrança.
4. 💰 **Controle Financeiro** — Receita mensal, repasses, inadimplência e projeção.
5. 💬 **WhatsApp Automático** — Lembretes D-1 com confirmação sim/não do paciente.
6. ✅ **Checklist de Fim de Dia** — Atualize o status das sessões em lote.

Each card: icon + title + one-line description. White bg, subtle border, rounded-card.

#### Plans Section

Side-by-side plan comparison (matching the PlanoPage layout from Spec 3):

```
┌─────────────────┐  ┌──────────────────┐
│ Básico           │  │ Completo ⭐       │
│ R$ 30/mês        │  │ R$ 50/mês        │
│                  │  │                  │
│ ✅ Agenda        │  │ ✅ Tudo do Básico │
│ ✅ Pacientes     │  │ ✅ WhatsApp Auto  │
│ ✅ Financeiro    │  │ ✅ Kanban Realtime│
│ ✅ Checklist     │  │                  │
│ ❌ WhatsApp      │  │                  │
│                  │  │                  │
│ [Começar grátis] │  │ [Começar grátis] │
└─────────────────┘  └──────────────────┘
         ↑ Both link to /signup
```

#### FAQ Section

Accordion-style (collapsible) with common questions:

- "Preciso de cartão de crédito para testar?" → Não, o trial de 14 dias é totalmente gratuito.
- "Meus dados ficam seguros?" → Sim, usamos Supabase com criptografia e RLS.
- "Posso usar sem o WhatsApp?" → Sim! O plano Básico não inclui WhatsApp e funciona perfeitamente.
- "Posso cancelar a qualquer momento?" → Sim, sem multa. Seus dados ficam guardados por 90 dias.
- "Funciona no celular?" → Sim, o app é responsivo e funciona em qualquer navegador.

#### Footer

```
AgendaPsi · Feito com 💚 para psicólogos
Contato: contato@agendapsi.com.br
```

---

## 5. UI — Signup Page

### 5.1 [NEW] `src/pages/SignupPage.tsx`

Matches the visual style of the existing `LoginPage.tsx`. Fields:

- Email (required)
- Senha (required, min 8 characters)
- Confirmar senha (required, must match)
- Checkbox: "Li e aceito os termos de uso" (required)
- Button: "Criar conta grátis"
- Link: "Já tem conta? Entrar"

On submit:
```typescript
const { error } = await supabase.auth.signUp({
  email,
  password,
})
if (!error) {
  navigate('/onboarding')
}
```

The `handle_new_user` trigger (Spec 1) automatically creates `config_psicologo`, `modalidades_sessao`, `meios_atendimento`, and `assinaturas`.

---

## 6. UI — LoginPage Updates

### 6.1 Add signup link

Below the login button:
```tsx
<p className="text-center text-sm text-muted mt-4">
  Não tem conta?{' '}
  <Link to="/signup" className="text-primary font-medium hover:underline">
    Criar conta grátis
  </Link>
</p>
```

### 6.2 Update redirect

After successful login, redirect to `/app/agenda` instead of `/agenda`.

---

## 7. Navigation Updates

### 7.1 All internal links

Global find-and-replace for all `<Link>` and `navigate()` calls:

| Old path | New path |
|----------|----------|
| `/agenda` | `/app/agenda` |
| `/kanban` | `/app/kanban` |
| `/checklist` | `/app/checklist` |
| `/pacientes` | `/app/pacientes` |
| `/pacientes/novo` | `/app/pacientes/novo` |
| `/pacientes/:id` | `/app/pacientes/:id` |
| `/pacientes/:id/editar` | `/app/pacientes/:id/editar` |
| `/financeiro` | `/app/financeiro` |
| `/financeiro/paciente/:id` | `/app/financeiro/paciente/:id` |
| `/configuracoes` | `/app/configuracoes` |

Files to update:
- `src/router.tsx`
- `src/components/layout/Sidebar.tsx` (or equivalent)
- `src/components/layout/BottomNav.tsx` (or equivalent)
- `src/components/ProtectedRoute.tsx` (redirect targets)
- `src/pages/OnboardingPage.tsx` (redirect after finalize)
- `src/pages/LoginPage.tsx` (redirect after login)
- `src/pages/PacientesPage.tsx` (links to /pacientes/novo, /pacientes/:id)
- `src/pages/PacienteDetalhePage.tsx` (links)
- `src/pages/FinanceiroPage.tsx` (links)
- `src/pages/ConfiguracoesPage.tsx` (links)
- Any component with `<Link>` or `useNavigate()` pointing to old paths

### 7.2 Onboarding redirect

After onboarding `finalize()`, redirect to `/app/agenda` or `/app/configuracoes?setup=whatsapp`.

---

## 8. Design

The landing page uses the existing design system:
- Background: `--bg` (#F7F5F2)
- Cards: `--surface` (#FFFFFF) with `--border` (#E4E0DA)
- Primary CTA: `--primary` (#2D6A6A)
- Accent highlights: `--accent` (#C17F59)
- Headings: Fraunces font
- Body: DM Sans font

No new design tokens needed. The landing page should feel like a natural extension of the app's aesthetic — warm, inviting, professional.

---

## 9. Error Handling

| Situation | Behavior |
|-----------|----------|
| Email already registered | Show error: "Este email já está cadastrado. Tente fazer login." |
| Password too short | Zod validation: "Senha deve ter no mínimo 8 caracteres" |
| Passwords don't match | Zod validation: "As senhas não coincidem" |
| Supabase signup error | Show toast with error message |
| User visits `/app/*` without auth | Redirected to `/login` |
| User visits `/login` while authenticated | Redirected to `/app/agenda` |

---

## 10. Testing

### Unit
- LandingPage renders hero, features, plans, FAQ sections
- SignupPage validates form fields (email, password match, terms checkbox)
- Router correctly separates public and authenticated routes

### Integration
- Submit signup form → assert user created → assert redirected to `/onboarding`
- Visit `/app/agenda` without auth → assert redirected to `/login`
- Visit `/login` while authenticated → assert redirected to `/app/agenda`

### Manual
- Navigate landing page on mobile and desktop — verify responsiveness
- Full signup flow: landing → signup → onboarding → app
- Verify all internal links use `/app/` prefix

---

## 11. Rollout

1. Create LandingPage and SignupPage components
2. Update router with new structure
3. Global find-and-replace for path updates
4. Update LoginPage with signup link
5. Update all internal navigation
6. Deploy and verify all routes work

---

## 12. Open Questions

None. All decisions captured:
- Landing page is a single-page design with hero, features, plans, FAQ, footer
- Authenticated routes move to `/app/*` prefix
- Signup uses email/password via Supabase Auth
- Design matches existing warm/professional aesthetic
- No separate terms of service page in v1 (just a checkbox)
