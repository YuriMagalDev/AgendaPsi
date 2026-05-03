# Psicologo — Management Platform for Psychologists

## What is this project

Web application for a psychologist to manage scheduling, session confirmations, and financials in one single place. Designed for personal use (a single user). Built for the web today, with future migration to mobile via Capacitor.

The complete design spec is at: `docs/superpowers/specs/2026-04-14-psicologo-design.md`

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + TailwindCSS |
| Mobile (future) | Capacitor |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| WhatsApp Automation | Evolution API (self-hosted on own VPS) |

---

## Main Modules

1. **Authentication** — email/password login via Supabase Auth
2. **Patients** — registration focused on scheduling and billing (no clinical records)
3. **Schedule** — two views: Kanban by status and daily Agenda
4. **Standalone Sessions (Avulsos)** — sessions without a registered patient, convertible into a patient
5. **End of Day Checklist** — batch status update of the day's sessions
6. **WhatsApp (optional)** — D-1 reminders with yes/no button via Evolution API
7. **Financials** — monthly revenue, by patient, revenue sharing, defaults, and projection
8. **Settings** — modalities, schedules, WhatsApp connection

---

## Architecture Decisions

- Frontend talks directly to Supabase via `supabase-js` for all CRUD
- Evolution API is accessed exclusively via Edge Functions (credentials never in the frontend)
- Upon account creation, Edge Function automatically provisions an Evolution API instance — the psychologist just scans the QR Code
- Supabase Realtime keeps the Kanban updated in real-time when WhatsApp confirmation arrives
- WhatsApp Automation is **optional** — the app works completely without it

---

## Data Model (summary)

- `pacientes` — basic registration (name, phone, email, date of birth)
- `modalidades` — customizable (In-person, Online + custom)
- `contratos` — billing method per patient: per session, package, or monthly
- `sessoes` — each appointment; supports registered or standalone patients; statuses: agendada (scheduled) / confirmada (confirmed) / concluida (completed) / faltou (missed) / cancelada (canceled) / remarcada (rescheduled)
- `regras_repasse` — global revenue sharing rules (e.g. "20% to clinic"); fixed or percentage
- `repasses` — records generated per session based on the rules; tracks if it was paid
- `confirmacoes_whatsapp` — log of reminders sent and replies received
- `config_psicologo` — global account settings

---

## App Routes

```
/login
/onboarding

/agenda           (default)
/kanban
/checklist

/pacientes
/pacientes/novo
/pacientes/:id

/financeiro
/financeiro/paciente/:id

/configuracoes
```

---

## Out of Scope

- Clinical records (session notes, diagnoses, medications)
- Multi-user / multi-clinic / SaaS
- Patient portal (patient does not access the app)
- Health insurance integration

---

## Design System

### Concept
*"Digital office"* — warm, organized, human. Aesthetic of a well-kept office: lacking clinical coldness, without excess corporate color.

### Color Palette (CSS variables)
```css
--bg:            #F7F5F2   /* main background — warm off-white */
--surface:       #FFFFFF   /* cards, modals, panels */
--primary:       #2D6A6A   /* dark teal — buttons, active icons */
--primary-light: #E8F4F4   /* badges, highlights */
--accent:        #C17F59   /* earthy amber — alerts, missed session status */
--text:          #1C1C1C   /* main text */
--muted:         #7A7A7A   /* secondary text, labels */
--border:        #E4E0DA   /* borders, dividers */
```

### Session Status (Kanban card colors)
| Status | Left border color |
|---|---|
| `agendada` | grey `#9CA3AF` |
| `confirmada` | teal `#2D6A6A` |
| `concluida` | green `#4CAF82` |
| `faltou` | amber `#C17F59` |
| `cancelada` | soft red `#E07070` |
| `remarcada` | soft purple `#9B7EC8` |

### Typography
- **Display / headings:** Fraunces (serif with personality, conveys trust)
- **Body / UI:** DM Sans (humanist, legible, modern)
- **Financial numbers / code:** DM Mono

### Base Components
- Cards: `border-radius: 12px`, subtle shadow, status indicator on the left border
- Bottom navigation (mobile): icons + label, active tab with pill indicator
- Forms: labels above field, no placeholders acting as label substitutes

### UI Libraries
1. **shadcn/ui** — base: Dialog, Select, Calendar, Table, Toast, Drawer
2. **21st.dev** — dashboard cards, Kanban, section components
3. **Recharts** — financial module charts

---

## Language

**All user-facing text must be in Portuguese (pt-BR).** This includes:
- Labels, buttons, headings, placeholders, error messages
- Empty states, confirmation dialogs, loading text
- Status labels and any other UI copy

This applies to all pages, components, and subagent implementations. If a plan or spec shows code examples with English strings, **translate them to Portuguese** — the project language always wins over the example language.

---

## Development Conventions

- Strict TypeScript throughout the project
- Functional React components with hooks
- Supabase as the single source of truth — no complex global state (Zustand/Redux)
- Edge Functions in TypeScript (Supabase Deno runtime)
- TailwindCSS for styles — no CSS modules or styled-components
- File names: kebab-case for components and pages
- Environment variables: never commit `.env` — use `.env.example` as a reference

---

## Pending Deployment Plans

There are 4 implementation plans queued for execution (in order):

1. `docs/superpowers/plans/2026-04-27-multi-tenant.md` — RLS isolation, user_id columns, signup trigger, edge function updates
2. `docs/superpowers/plans/2026-04-27-subscriptions.md` — assinaturas table, useAssinatura hook
3. `docs/superpowers/plans/2026-04-27-feature-gating.md` — PlanoPage, trial banner, WhatsApp/Realtime gating
4. `docs/superpowers/plans/2026-04-27-stripe.md` — Stripe Checkout, Webhook, Portal edge functions

Master reference: `docs/superpowers/plans/EXECUCAO.md`

**IMPORTANT:** If any work touches files listed below, alert the user that the relevant plan(s) may need updating before execution:

| File / Area | Affects Plan |
|---|---|
| `supabase/migrations/*.sql` (any new migration) | Plan 1 (migration number 017 may shift) |
| `supabase/functions/send-lembrete/index.ts` | Plans 1 and 3 |
| `supabase/functions/cron-lembretes/index.ts` | Plan 1 |
| `supabase/functions/whatsapp-webhook/index.ts` | Plan 1 |
| `supabase/functions/whatsapp-setup/index.ts` | Plans 1 and 3 |
| `src/pages/OnboardingPage.tsx` | Plan 1 |
| `src/components/ProtectedRoute.tsx` | Plan 1 |
| `src/pages/LoginPage.tsx` | Plan 1 |
| `src/lib/types.ts` | Plans 1 and 2 |
| `src/pages/ConfiguracoesPage.tsx` | Plan 3 |
| `src/pages/KanbanPage.tsx` | Plan 3 |
| `src/components/layout/AppLayout.tsx` | Plan 3 |
| `src/components/layout/Sidebar.tsx` | Plan 3 |
| `src/components/layout/BottomNav.tsx` | Plan 3 |
| `src/router.tsx` | Plan 3 |
| `src/hooks/useAssinatura.ts` (new file) | Plan 2 |
| `src/pages/PlanoPage.tsx` (new file) | Plans 3 and 4 |
| `supabase/migrations/019_regua_cobranca.sql` (tables `regras_cobranca`, `cobracas_enviadas`) | Plan 1 (needs user_id + RLS when multi-tenant runs) |
| `src/hooks/useReguaCobranca.ts` (`salvarRegra` onConflict) | Plan 1 (change `onConflict: 'etapa'` → `'user_id,etapa'` after migration 017 runs) |
| `supabase/migrations/020_google_calendar_sync.sql` (tables `google_oauth_tokens`, `sessions_sync_map`, `sessions_external_busy`) | Plan 1 (RLS currently `auth.role() = 'authenticated'`; must tighten to `auth.uid() = user_id` + add user_id columns when multi-tenant runs) |
| `src/hooks/useGoogleCalendarSync.ts` | Plan 1 (single-user only; multi-tenant needs user scoping in edge function calls) |
| Any new Supabase table | Plan 1 (may need user_id + RLS added to that table too) |
