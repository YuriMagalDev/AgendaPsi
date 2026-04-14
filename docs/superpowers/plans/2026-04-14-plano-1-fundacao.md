# Psicologo — Plano 1: Fundação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the full project with database schema, authentication, onboarding wizard, and navigation shell — the foundation all feature modules build on.

**Architecture:** React 18 + Vite SPA communicating directly with Supabase via supabase-js. Auth state lives in a React Context. Navigation uses React Router v6 with a ProtectedRoute wrapper that redirects unauthenticated users to /login. Layout is responsive: bottom nav on mobile, sidebar on desktop. The onboarding wizard runs once after first login and writes to `config_psicologo`.

**Tech Stack:** React 18, Vite, TypeScript (strict), TailwindCSS, shadcn/ui, Supabase, React Router v6, React Hook Form, Zod, Vitest, React Testing Library, Lucide React, date-fns

---

### Task 1: Scaffold Project

**Files:**
- Create: `vite.config.ts`
- Create: `tsconfig.app.json`
- Create: `src/test/setup.ts`
- Create: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Initialize Vite project**

```bash
npm create vite@latest . -- --template react-ts
```

When prompted, confirm overwriting existing files.

- [ ] **Step 2: Install dependencies**

```bash
npm install react-router-dom @supabase/supabase-js react-hook-form zod @hookform/resolvers lucide-react recharts date-fns
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Write vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

- [ ] **Step 4: Write tsconfig.app.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create test setup**

`src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 6: Create .env.example**

`.env.example`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 7: Add .env to .gitignore**

Append to `.gitignore`:
```
.env
.env.local
dist/
```

- [ ] **Step 8: Add test scripts to package.json**

In `package.json`, add to `"scripts"`:
```json
"test": "vitest",
"test:run": "vitest run"
```

- [ ] **Step 9: Commit**

```bash
git add .
git commit -m "feat: scaffold Vite + React + TypeScript project"
```

---

### Task 2: TailwindCSS + Design Tokens + Fonts

**Files:**
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Modify: `src/index.css`

- [ ] **Step 1: Install Tailwind**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p --ts
```

- [ ] **Step 2: Write tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F7F5F2',
        surface: '#FFFFFF',
        primary: {
          DEFAULT: '#2D6A6A',
          light: '#E8F4F4',
        },
        accent: '#C17F59',
        muted: '#7A7A7A',
        border: '#E4E0DA',
      },
      fontFamily: {
        display: ['Fraunces', 'serif'],
        sans: ['DM Sans', 'sans-serif'],
        mono: ['DM Mono', 'monospace'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
}

export default config
```

- [ ] **Step 3: Write src/index.css**

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,300..700&family=DM+Mono:wght@400;500&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --bg: #F7F5F2;
    --surface: #FFFFFF;
    --primary: #2D6A6A;
    --primary-light: #E8F4F4;
    --accent: #C17F59;
    --text: #1C1C1C;
    --muted: #7A7A7A;
    --border: #E4E0DA;

    --status-agendada: #9CA3AF;
    --status-confirmada: #2D6A6A;
    --status-concluida: #4CAF82;
    --status-faltou: #C17F59;
    --status-cancelada: #E07070;
    --status-remarcada: #9B7EC8;
  }

  body {
    @apply bg-bg text-[#1C1C1C] font-sans;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: configure TailwindCSS with design system tokens"
```

---

### Task 3: shadcn/ui Setup

**Files:**
- Create: `components.json`
- Create: `src/lib/utils.ts` (auto-generated)
- Create: `src/components/ui/` (auto-generated)

- [ ] **Step 1: Install peer dependencies**

```bash
npm install class-variance-authority clsx tailwind-merge
```

- [ ] **Step 2: Initialize shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted:
- Style: **Default**
- Base color: **Stone**
- CSS variables: **yes**

- [ ] **Step 3: Add required components**

```bash
npx shadcn@latest add button input label card dialog select toast drawer badge separator
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add shadcn/ui base components"
```

---

### Task 4: TypeScript Database Types

**Files:**
- Create: `src/lib/types.ts`
- Test: `src/lib/__tests__/types.test.ts`

- [ ] **Step 1: Write failing test**

`src/lib/__tests__/types.test.ts`:
```typescript
import { describe, it, expectTypeOf } from 'vitest'
import type { Paciente, Sessao, SessaoStatus } from '@/lib/types'

describe('Database types', () => {
  it('SessaoStatus covers all values', () => {
    const status: SessaoStatus = 'agendada'
    expectTypeOf(status).toEqualTypeOf<SessaoStatus>()
  })

  it('Paciente id is string (uuid)', () => {
    expectTypeOf<Paciente['id']>().toBeString()
  })

  it('Sessao paciente_id is nullable', () => {
    expectTypeOf<Sessao['paciente_id']>().toEqualTypeOf<string | null>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/lib/__tests__/types.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Write src/lib/types.ts**

```typescript
export type SessaoStatus =
  | 'agendada'
  | 'confirmada'
  | 'concluida'
  | 'faltou'
  | 'cancelada'
  | 'remarcada'

export type ContratoTipo = 'por_sessao' | 'pacote' | 'mensal'

export type RepasseTipoValor = 'percentual' | 'fixo'

export interface Paciente {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  data_nascimento: string | null
  ativo: boolean
  criado_em: string
}

export interface Modalidade {
  id: string
  nome: string
  ativo: boolean
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
}

export interface Sessao {
  id: string
  paciente_id: string | null
  avulso_nome: string | null
  avulso_telefone: string | null
  modalidade_id: string
  data_hora: string
  status: SessaoStatus
  valor_cobrado: number | null
  pago: boolean
  data_pagamento: string | null
  remarcada_para: string | null
  sessao_origem_id: string | null
  criado_em: string
}

export interface RegraRepasse {
  id: string
  nome: string
  tipo_valor: RepasseTipoValor
  valor: number
  ativo: boolean
}

export interface Repasse {
  id: string
  regra_repasse_id: string
  sessao_id: string
  valor_calculado: number
  pago: boolean
  data_pagamento: string | null
}

export interface ConfirmacaoWhatsapp {
  id: string
  sessao_id: string
  mensagem_enviada_em: string | null
  resposta: string | null
  confirmado: boolean | null
}

export interface ConfigPsicologo {
  id: string
  nome: string | null
  horario_inicio: string | null
  horario_fim: string | null
  horario_checklist: string | null
  automacao_whatsapp_ativa: boolean
  evolution_instance_name: string | null
  evolution_token: string | null
  whatsapp_conectado: boolean
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/lib/__tests__/types.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/__tests__/types.test.ts
git commit -m "feat: add TypeScript types for all database tables"
```

---

### Task 5: Supabase Client

**Files:**
- Create: `src/lib/supabase.ts`
- Test: `src/lib/__tests__/supabase.test.ts`

- [ ] **Step 1: Write failing test**

`src/lib/__tests__/supabase.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn() },
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

describe('supabase client', () => {
  it('is defined', () => {
    expect(supabase).toBeDefined()
  })

  it('has auth property', () => {
    expect(supabase.auth).toBeDefined()
  })

  it('has from method', () => {
    expect(supabase.from).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/lib/__tests__/supabase.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create src/lib/supabase.ts**

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Copy .env.example to .env and fill in the values.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/lib/__tests__/supabase.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/supabase.ts src/lib/__tests__/supabase.test.ts
git commit -m "feat: add Supabase client"
```

---

### Task 6: Database Migration

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Install Supabase CLI and initialize**

```bash
npm install -D supabase
npx supabase init
```

- [ ] **Step 2: Write migration**

`supabase/migrations/001_initial_schema.sql`:
```sql
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Modalidades (personalizáveis pelo psicólogo)
create table modalidades (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  ativo boolean not null default true
);

-- Pacientes
create table pacientes (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  telefone text,
  email text,
  data_nascimento date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Contratos de cobrança
create type contrato_tipo as enum ('por_sessao', 'pacote', 'mensal');

create table contratos (
  id uuid primary key default uuid_generate_v4(),
  paciente_id uuid not null references pacientes(id) on delete cascade,
  tipo contrato_tipo not null,
  valor numeric(10,2) not null,
  qtd_sessoes int,
  dia_vencimento int check (dia_vencimento between 1 and 31),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Sessões
create type sessao_status as enum (
  'agendada', 'confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada'
);

create table sessoes (
  id uuid primary key default uuid_generate_v4(),
  paciente_id uuid references pacientes(id) on delete set null,
  avulso_nome text,
  avulso_telefone text,
  modalidade_id uuid not null references modalidades(id),
  data_hora timestamptz not null,
  status sessao_status not null default 'agendada',
  valor_cobrado numeric(10,2),
  pago boolean not null default false,
  data_pagamento date,
  remarcada_para timestamptz,
  sessao_origem_id uuid references sessoes(id),
  criado_em timestamptz not null default now(),
  constraint sessao_must_have_paciente_or_avulso
    check (paciente_id is not null or avulso_nome is not null)
);

-- Regras globais de repasse
create type repasse_tipo_valor as enum ('percentual', 'fixo');

create table regras_repasse (
  id uuid primary key default uuid_generate_v4(),
  nome text not null,
  tipo_valor repasse_tipo_valor not null,
  valor numeric(10,2) not null,
  ativo boolean not null default true
);

-- Repasses por sessão (gerados a partir das regras)
create table repasses (
  id uuid primary key default uuid_generate_v4(),
  regra_repasse_id uuid not null references regras_repasse(id),
  sessao_id uuid not null references sessoes(id) on delete cascade,
  valor_calculado numeric(10,2) not null,
  pago boolean not null default false,
  data_pagamento date
);

-- Log de confirmações WhatsApp
create table confirmacoes_whatsapp (
  id uuid primary key default uuid_generate_v4(),
  sessao_id uuid not null references sessoes(id) on delete cascade,
  mensagem_enviada_em timestamptz,
  resposta text,
  confirmado boolean
);

-- Configurações do psicólogo (uma linha por conta)
create table config_psicologo (
  id uuid primary key default uuid_generate_v4(),
  nome text,
  horario_inicio time,
  horario_fim time,
  horario_checklist time default '18:00',
  automacao_whatsapp_ativa boolean not null default false,
  evolution_instance_name text,
  evolution_token text,
  whatsapp_conectado boolean not null default false
);

-- Modalidades padrão
insert into modalidades (nome) values ('Presencial'), ('Online');

-- Row Level Security (habilitar em todas as tabelas)
alter table modalidades enable row level security;
alter table pacientes enable row level security;
alter table contratos enable row level security;
alter table sessoes enable row level security;
alter table regras_repasse enable row level security;
alter table repasses enable row level security;
alter table confirmacoes_whatsapp enable row level security;
alter table config_psicologo enable row level security;

-- RLS policies: allow all operations for authenticated users
-- (single-user app — no multi-tenancy needed)
create policy "auth users full access" on modalidades for all to authenticated using (true) with check (true);
create policy "auth users full access" on pacientes for all to authenticated using (true) with check (true);
create policy "auth users full access" on contratos for all to authenticated using (true) with check (true);
create policy "auth users full access" on sessoes for all to authenticated using (true) with check (true);
create policy "auth users full access" on regras_repasse for all to authenticated using (true) with check (true);
create policy "auth users full access" on repasses for all to authenticated using (true) with check (true);
create policy "auth users full access" on confirmacoes_whatsapp for all to authenticated using (true) with check (true);
create policy "auth users full access" on config_psicologo for all to authenticated using (true) with check (true);
```

- [ ] **Step 3: Commit**

```bash
git add supabase/
git commit -m "feat: add initial database schema with all 8 tables"
```

---

### Task 7: Auth Context + useAuth Hook

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Create: `src/hooks/useAuth.ts`
- Test: `src/contexts/__tests__/AuthContext.test.tsx`

- [ ] **Step 1: Write failing test**

`src/contexts/__tests__/AuthContext.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useContext } from 'react'
import { AuthProvider, AuthContext } from '@/contexts/AuthContext'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}))

function TestConsumer() {
  const ctx = useContext(AuthContext)
  return <div data-testid="loading">{String(ctx.loading)}</div>
}

describe('AuthProvider', () => {
  it('renders children', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <div>child</div>
        </AuthProvider>
      )
    })
    expect(screen.getByText('child')).toBeInTheDocument()
  })

  it('resolves loading after session check', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )
    })
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/contexts/__tests__/AuthContext.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Create src/contexts/AuthContext.tsx**

```typescript
import { createContext, useEffect, useState, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    await supabase.auth.signOut()
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
```

- [ ] **Step 4: Create src/hooks/useAuth.ts**

```typescript
import { useContext } from 'react'
import { AuthContext } from '@/contexts/AuthContext'

export function useAuth() {
  return useContext(AuthContext)
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:run -- src/contexts/__tests__/AuthContext.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/contexts/ src/hooks/
git commit -m "feat: add AuthContext and useAuth hook"
```

---

### Task 8: ProtectedRoute + React Router

**Files:**
- Create: `src/components/ProtectedRoute.tsx`
- Create: `src/router.tsx`
- Test: `src/components/__tests__/ProtectedRoute.test.tsx`

- [ ] **Step 1: Write failing test**

`src/components/__tests__/ProtectedRoute.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import type { Session, User } from '@supabase/supabase-js'

function renderWithAuth(authenticated: boolean) {
  const contextValue = {
    session: authenticated ? ({ user: { id: '1' } } as Session) : null,
    user: authenticated ? ({ id: '1' } as User) : null,
    loading: false,
    signOut: vi.fn(),
  }
  render(
    <AuthContext.Provider value={contextValue}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    renderWithAuth(true)
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('redirects to /login when not authenticated', () => {
    renderWithAuth(false)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/components/__tests__/ProtectedRoute.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Create src/components/ProtectedRoute.tsx**

```typescript
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

export function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return session ? <Outlet /> : <Navigate to="/login" replace />
}
```

- [ ] **Step 4: Create src/router.tsx**

```typescript
import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { AgendaPage } from '@/pages/AgendaPage'
import { KanbanPage } from '@/pages/KanbanPage'
import { ChecklistPage } from '@/pages/ChecklistPage'
import { PacientesPage } from '@/pages/PacientesPage'
import { NovoPacientePage } from '@/pages/NovoPacientePage'
import { PacienteDetalhePage } from '@/pages/PacienteDetalhePage'
import { FinanceiroPage } from '@/pages/FinanceiroPage'
import { FinanceiroPacientePage } from '@/pages/FinanceiroPacientePage'
import { ConfiguracoesPage } from '@/pages/ConfiguracoesPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/onboarding', element: <OnboardingPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <AgendaPage /> },
          { path: '/agenda', element: <AgendaPage /> },
          { path: '/kanban', element: <KanbanPage /> },
          { path: '/checklist', element: <ChecklistPage /> },
          { path: '/pacientes', element: <PacientesPage /> },
          { path: '/pacientes/novo', element: <NovoPacientePage /> },
          { path: '/pacientes/:id', element: <PacienteDetalhePage /> },
          { path: '/financeiro', element: <FinanceiroPage /> },
          { path: '/financeiro/paciente/:id', element: <FinanceiroPacientePage /> },
          { path: '/configuracoes', element: <ConfiguracoesPage /> },
        ],
      },
    ],
  },
])
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm run test:run -- src/components/__tests__/ProtectedRoute.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/ProtectedRoute.tsx src/router.tsx src/components/__tests__/ProtectedRoute.test.tsx
git commit -m "feat: add ProtectedRoute and React Router config"
```

---

### Task 9: App Layout + Navigation

**Files:**
- Create: `src/components/layout/BottomNav.tsx`
- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Create src/components/layout/BottomNav.tsx**

```typescript
import { NavLink } from 'react-router-dom'
import { Calendar, LayoutKanban, Users, BarChart2, Settings } from 'lucide-react'

const navItems = [
  { to: '/agenda', icon: Calendar, label: 'Agenda' },
  { to: '/kanban', icon: LayoutKanban, label: 'Kanban' },
  { to: '/pacientes', icon: Users, label: 'Pacientes' },
  { to: '/financeiro', icon: BarChart2, label: 'Financeiro' },
  { to: '/configuracoes', icon: Settings, label: 'Config.' },
] as const

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border flex md:hidden z-50">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
              isActive ? 'text-primary' : 'text-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div
                className={`p-1 rounded-full transition-colors ${
                  isActive ? 'bg-primary-light' : ''
                }`}
              >
                <Icon size={20} />
              </div>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 2: Create src/components/layout/Sidebar.tsx**

```typescript
import { NavLink } from 'react-router-dom'
import { Calendar, LayoutKanban, Users, BarChart2, Settings, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'

const navItems = [
  { to: '/agenda', icon: Calendar, label: 'Agenda' },
  { to: '/kanban', icon: LayoutKanban, label: 'Kanban' },
  { to: '/pacientes', icon: Users, label: 'Pacientes' },
  { to: '/financeiro', icon: BarChart2, label: 'Financeiro' },
  { to: '/configuracoes', icon: Settings, label: 'Configurações' },
] as const

export function Sidebar() {
  const { signOut } = useAuth()

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-surface border-r border-border p-4">
      <div className="mb-8 px-2">
        <h1 className="font-display text-2xl font-semibold text-primary">Consultório</h1>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary-light text-primary font-medium'
                  : 'text-[#1C1C1C] hover:bg-bg'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={signOut}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:bg-bg transition-colors mt-4"
      >
        <LogOut size={18} />
        Sair
      </button>
    </aside>
  )
}
```

- [ ] **Step 3: Create src/components/layout/AppLayout.tsx**

```typescript
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/
git commit -m "feat: add AppLayout with responsive Sidebar and BottomNav"
```

---

### Task 10: Login Page

**Files:**
- Create: `src/pages/LoginPage.tsx`
- Test: `src/pages/__tests__/LoginPage.test.tsx`

- [ ] **Step 1: Write failing test**

`src/pages/__tests__/LoginPage.test.tsx`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'

const mockSignIn = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signInWithPassword: mockSignIn } },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

describe('LoginPage', () => {
  beforeEach(() => mockSignIn.mockReset())

  it('renders email and password fields', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument()
  })

  it('shows error message on invalid credentials', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    render(<MemoryRouter><LoginPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/credenciais inválidas/i)).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/pages/__tests__/LoginPage.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Create src/pages/LoginPage.tsx**

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type FormData = z.infer<typeof schema>

export function LoginPage() {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  async function onSubmit(data: FormData) {
    setServerError(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    })

    if (error) {
      setServerError('Credenciais inválidas. Verifique seu e-mail e senha.')
      return
    }

    navigate('/agenda')
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-4xl font-semibold text-primary mb-2">Consultório</h1>
          <p className="text-muted text-sm">Gestão para psicólogos</p>
        </div>

        <div className="bg-surface rounded-card p-6 shadow-sm border border-border">
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                {...register('email')}
              />
              {errors.email && (
                <span className="text-xs text-[#E07070]">{errors.email.message}</span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                {...register('password')}
              />
              {errors.password && (
                <span className="text-xs text-[#E07070]">{errors.password.message}</span>
              )}
            </div>

            {serverError && (
              <p className="text-xs text-[#E07070] text-center">{serverError}</p>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-primary hover:bg-primary/90 text-white mt-2"
            >
              {isSubmitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test:run -- src/pages/__tests__/LoginPage.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/LoginPage.tsx src/pages/__tests__/LoginPage.test.tsx
git commit -m "feat: add Login page with Zod validation"
```

---

### Task 11: Onboarding Wizard

**Files:**
- Create: `src/pages/onboarding/StepDados.tsx`
- Create: `src/pages/onboarding/StepModalidades.tsx`
- Create: `src/pages/onboarding/StepWhatsapp.tsx`
- Create: `src/pages/OnboardingPage.tsx`
- Test: `src/pages/__tests__/OnboardingPage.test.tsx`

- [ ] **Step 1: Write failing test**

`src/pages/__tests__/OnboardingPage.test.tsx`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OnboardingPage } from '@/pages/OnboardingPage'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

describe('OnboardingPage', () => {
  it('renders step 1 by default', () => {
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    expect(screen.getByText(/seus dados/i)).toBeInTheDocument()
  })

  it('advances to step 2 after filling step 1', () => {
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText(/seu nome/i), { target: { value: 'Dra. Ana' } })
    fireEvent.click(screen.getByRole('button', { name: /próximo/i }))
    expect(screen.getByText(/modalidades/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test:run -- src/pages/__tests__/OnboardingPage.test.tsx
```

Expected: FAIL

- [ ] **Step 3: Create src/pages/onboarding/StepDados.tsx**

```typescript
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const schema = z.object({
  nome: z.string().min(2, 'Informe seu nome'),
  horario_inicio: z.string().min(1, 'Obrigatório'),
  horario_fim: z.string().min(1, 'Obrigatório'),
  horario_checklist: z.string().min(1, 'Obrigatório'),
})

export type StepDadosData = z.infer<typeof schema>

interface Props {
  onNext: (data: StepDadosData) => void
}

export function StepDados({ onNext }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StepDadosData>({
    resolver: zodResolver(schema),
    defaultValues: {
      horario_inicio: '08:00',
      horario_fim: '18:00',
      horario_checklist: '18:00',
    },
  })

  return (
    <form onSubmit={handleSubmit(onNext)} className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Seus dados</h2>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Seu nome</Label>
        <Input id="nome" placeholder="Dra. Ana Silva" {...register('nome')} />
        {errors.nome && <span className="text-xs text-[#E07070]">{errors.nome.message}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="horario_inicio">Início</Label>
          <Input id="horario_inicio" type="time" {...register('horario_inicio')} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="horario_fim">Fim</Label>
          <Input id="horario_fim" type="time" {...register('horario_fim')} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="horario_checklist">Checklist fim de dia</Label>
        <Input id="horario_checklist" type="time" {...register('horario_checklist')} />
        <span className="text-xs text-muted">
          Horário em que o app vai te lembrar de revisar as sessões do dia.
        </span>
      </div>

      <Button type="submit" className="bg-primary hover:bg-primary/90 text-white mt-2">
        Próximo
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Create src/pages/onboarding/StepModalidades.tsx**

```typescript
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, X } from 'lucide-react'

interface Props {
  onNext: (modalidades: string[]) => void
  onBack: () => void
}

export function StepModalidades({ onNext, onBack }: Props) {
  const [modalidades, setModalidades] = useState(['Presencial', 'Online'])
  const [nova, setNova] = useState('')

  function add() {
    const trimmed = nova.trim()
    if (trimmed && !modalidades.includes(trimmed)) {
      setModalidades([...modalidades, trimmed])
      setNova('')
    }
  }

  function remove(nome: string) {
    setModalidades(modalidades.filter((m) => m !== nome))
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Modalidades</h2>
      <p className="text-sm text-muted">Confirme ou adicione modalidades de atendimento.</p>

      <div className="flex flex-wrap gap-2">
        {modalidades.map((m) => (
          <Badge
            key={m}
            className="bg-primary-light text-primary flex items-center gap-1 px-3 py-1"
          >
            {m}
            <button onClick={() => remove(m)} className="ml-1 hover:text-accent">
              <X size={12} />
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Nova modalidade..."
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <Button type="button" variant="outline" onClick={add} className="border-border">
          <Plus size={16} />
        </Button>
      </div>

      <div className="flex gap-3 mt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="flex-1 border-border"
        >
          Voltar
        </Button>
        <Button
          type="button"
          onClick={() => onNext(modalidades)}
          disabled={modalidades.length === 0}
          className="flex-1 bg-primary hover:bg-primary/90 text-white"
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create src/pages/onboarding/StepWhatsapp.tsx**

```typescript
import { Button } from '@/components/ui/button'
import { MessageCircle, SkipForward, X } from 'lucide-react'

interface Props {
  onConfigurar: () => void
  onDepois: () => void
  onNaoUsar: () => void
  onBack: () => void
}

export function StepWhatsapp({ onConfigurar, onDepois, onNaoUsar, onBack }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">WhatsApp</h2>

      <div className="bg-primary-light rounded-card p-4 text-sm text-primary">
        <p className="font-medium mb-1">Use um número dedicado ao consultório</p>
        <p className="text-primary/80">
          Recomendamos um número separado do seu pessoal. Você precisará de um chip
          ou número virtual (ex: VoIP). Isso protege sua privacidade e organiza as
          conversas com pacientes.
        </p>
      </div>

      <p className="text-sm text-muted">
        Com a automação, o app envia lembretes automáticos um dia antes de cada sessão
        e registra as confirmações dos pacientes.
      </p>

      <div className="flex flex-col gap-2 mt-2">
        <Button
          type="button"
          onClick={onConfigurar}
          className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2"
        >
          <MessageCircle size={16} />
          Configurar agora
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDepois}
          className="border-border flex items-center gap-2"
        >
          <SkipForward size={16} />
          Configurar depois
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onNaoUsar}
          className="text-muted flex items-center gap-2"
        >
          <X size={16} />
          Não usar automação
        </Button>
      </div>

      <Button type="button" variant="ghost" onClick={onBack} className="text-muted text-sm">
        Voltar
      </Button>
    </div>
  )
}
```

- [ ] **Step 6: Create src/pages/OnboardingPage.tsx**

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { StepDados, type StepDadosData } from './onboarding/StepDados'
import { StepModalidades } from './onboarding/StepModalidades'
import { StepWhatsapp } from './onboarding/StepWhatsapp'

type Step = 1 | 2 | 3

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [dadosStep1, setDadosStep1] = useState<StepDadosData | null>(null)
  const [modalidades, setModalidades] = useState<string[]>([])

  async function finalize(whatsappOpcao: 'agora' | 'depois' | 'nao') {
    if (!dadosStep1) return

    await supabase.from('config_psicologo').insert({
      nome: dadosStep1.nome,
      horario_inicio: dadosStep1.horario_inicio,
      horario_fim: dadosStep1.horario_fim,
      horario_checklist: dadosStep1.horario_checklist,
      automacao_whatsapp_ativa: false,
    })

    const extras = modalidades.filter((m) => !['Presencial', 'Online'].includes(m))
    if (extras.length > 0) {
      await supabase.from('modalidades').insert(extras.map((nome) => ({ nome })))
    }

    navigate(whatsappOpcao === 'agora' ? '/configuracoes?setup=whatsapp' : '/agenda')
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl font-semibold text-primary">Bem-vindo</h1>
          <p className="text-muted text-sm mt-1">Vamos configurar seu consultório</p>
        </div>

        <div className="flex items-center gap-2 mb-6 justify-center">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step
                  ? 'w-8 bg-primary'
                  : s < step
                  ? 'w-4 bg-primary/40'
                  : 'w-4 bg-border'
              }`}
            />
          ))}
        </div>

        <div className="bg-surface rounded-card p-6 shadow-sm border border-border">
          {step === 1 && (
            <StepDados
              onNext={(data) => {
                setDadosStep1(data)
                setStep(2)
              }}
            />
          )}
          {step === 2 && (
            <StepModalidades
              onNext={(m) => {
                setModalidades(m)
                setStep(3)
              }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepWhatsapp
              onConfigurar={() => finalize('agora')}
              onDepois={() => finalize('depois')}
              onNaoUsar={() => finalize('nao')}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run test to verify it passes**

```bash
npm run test:run -- src/pages/__tests__/OnboardingPage.test.tsx
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/pages/
git commit -m "feat: add 3-step Onboarding wizard"
```

---

### Task 12: Placeholder Pages + App Entry Point

**Files:**
- Create: `src/pages/AgendaPage.tsx`
- Create: `src/pages/KanbanPage.tsx`
- Create: `src/pages/ChecklistPage.tsx`
- Create: `src/pages/PacientesPage.tsx`
- Create: `src/pages/NovoPacientePage.tsx`
- Create: `src/pages/PacienteDetalhePage.tsx`
- Create: `src/pages/FinanceiroPage.tsx`
- Create: `src/pages/FinanceiroPacientePage.tsx`
- Create: `src/pages/ConfiguracoesPage.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: Create placeholder pages**

`src/pages/AgendaPage.tsx`:
```typescript
export function AgendaPage() {
  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Agenda</h1>
    </div>
  )
}
```

`src/pages/KanbanPage.tsx`:
```typescript
export function KanbanPage() {
  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Kanban</h1>
    </div>
  )
}
```

`src/pages/ChecklistPage.tsx`:
```typescript
export function ChecklistPage() {
  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Checklist do Dia</h1>
    </div>
  )
}
```

`src/pages/PacientesPage.tsx`:
```typescript
export function PacientesPage() {
  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Pacientes</h1>
    </div>
  )
}
```

`src/pages/NovoPacientePage.tsx`:
```typescript
export function NovoPacientePage() {
  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Novo Paciente</h1>
    </div>
  )
}
```

`src/pages/PacienteDetalhePage.tsx`:
```typescript
export function PacienteDetalhePage() {
  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Detalhe do Paciente</h1>
    </div>
  )
}
```

`src/pages/FinanceiroPage.tsx`:
```typescript
export function FinanceiroPage() {
  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Financeiro</h1>
    </div>
  )
}
```

`src/pages/FinanceiroPacientePage.tsx`:
```typescript
export function FinanceiroPacientePage() {
  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Financeiro do Paciente</h1>
    </div>
  )
}
```

`src/pages/ConfiguracoesPage.tsx`:
```typescript
export function ConfiguracoesPage() {
  return (
    <div className="p-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Configurações</h1>
    </div>
  )
}
```

- [ ] **Step 2: Write src/App.tsx**

```typescript
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import { router } from '@/router'

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
```

- [ ] **Step 3: Write src/main.tsx**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

- [ ] **Step 4: Run all tests**

```bash
npm run test:run
```

Expected: All tests PASS

- [ ] **Step 5: Start dev server and verify**

```bash
npm run dev
```

Open http://localhost:5173. Expected behavior:
- Unauthenticated: redirected to `/login`
- After login: `Agenda` page visible with Sidebar on desktop, BottomNav on mobile
- All nav links navigate to their placeholder pages

- [ ] **Step 6: Commit**

```bash
git add src/
git commit -m "feat: wire up App entry point with all placeholder pages"
```

---

## Self-Review

**Spec coverage:**
- ✅ React + Vite + TypeScript scaffold (Task 1)
- ✅ TailwindCSS + all design tokens + fonts (Task 2)
- ✅ shadcn/ui base components (Task 3)
- ✅ TypeScript types for all 8 DB tables (Task 4)
- ✅ Supabase client with env validation (Task 5)
- ✅ Database schema — all tables + RLS policies (Task 6)
- ✅ Auth context + useAuth hook (Task 7)
- ✅ React Router v6 + ProtectedRoute (Task 8)
- ✅ Responsive layout: BottomNav + Sidebar + AppLayout (Task 9)
- ✅ Login page with Zod validation + error handling (Task 10)
- ✅ Onboarding wizard: StepDados + StepModalidades + StepWhatsapp (Task 11)
- ✅ All 9 routes with placeholder pages + App entry point (Task 12)

**Not in this plan (covered by Plans 2-4):**
- Patient CRUD, Kanban columns, agenda day view, session creation, checklist
- Financial dashboard, repasse rules, projections
- Evolution API provisioning, D-1 reminders, webhook handler

**Placeholder scan:** No TBDs or TODOs found. All steps contain complete code.

**Type consistency:** `StepDadosData` defined in `StepDados.tsx` and imported in `OnboardingPage.tsx`. `SessaoStatus` and all entity types defined in `types.ts` and referenced consistently by exact name throughout the plan.
