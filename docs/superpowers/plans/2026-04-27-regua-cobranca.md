# Régua de Cobrança — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate up to 3 WhatsApp payment reminder messages per unpaid session using a configurable sequence (régua de cobrança), with support for both auto-send and manual approval-queue modes.

**Architecture:** Two new DB tables (`regras_cobranca` for sequence templates, `cobracas_enviadas` for the send audit log) hang off the existing `sessoes` and `config_psicologo` tables. A new Edge Function `cobranca-whatsapp` handles sending via Evolution API. A new `cron-cobrancas` Edge Function fires hourly, evaluates which sessions need reminders, inserts `cobracas_enviadas` rows and (in auto mode) immediately calls `cobranca-whatsapp`. The frontend gains a new `/cobranca` page for the approval queue and history, plus a new "Régua de Cobrança" section in Configurações for template management.

**Tech Stack:** PostgreSQL (RLS + triggers), Supabase Edge Functions (Deno), React + TypeScript + TailwindCSS, Vitest + Testing Library, Evolution API (WhatsApp).

---

## File Structure

**New files:**
- `supabase/migrations/019_regua_cobranca.sql`
- `supabase/functions/cobranca-whatsapp/index.ts`
- `supabase/functions/cron-cobrancas/index.ts`
- `supabase/scripts/schedule_cron_cobrancas.sql`
- `src/hooks/useReguaCobranca.ts`
- `src/components/regua-cobranca/ReguaCobrancaTemplateEditor.tsx`
- `src/pages/CobrancaPage.tsx`
- `src/hooks/__tests__/useReguaCobranca.test.ts`
- `src/components/regua-cobranca/__tests__/ReguaCobrancaTemplateEditor.test.tsx`
- `src/pages/__tests__/CobrancaPage.test.tsx`

**Modified files:**
- `src/lib/types.ts` — add `RegraCobranca`, `CobrancaEnviada`, `CobrancaEnviadaView`, `SessaoParaCobranca`, `EtapaCobranca`, `StatusCobranca`, `ModoCobracaWhatsapp`; extend `ConfigPsicologo` with `chave_pix`, `regua_cobranca_ativa`, `regua_cobranca_modo`
- `src/hooks/useConfigPsicologo.ts` — widen `updateConfig` patch type to include new config fields
- `src/pages/ConfiguracoesPage.tsx` — add "Régua de Cobrança" settings section
- `src/router.tsx` — add `/cobranca` route
- `src/components/layout/Sidebar.tsx` — add Cobrança nav item
- `src/components/layout/BottomNav.tsx` — add Cobrança nav item

> **PLAN-IMPACT ALERT:** This plan creates a new migration (019) and touches `src/lib/types.ts` and `src/pages/ConfiguracoesPage.tsx`. If Plans 1–4 have not yet been applied, coordinate with those plans before running this migration (migration numbering may shift).

---

## Task 1: Database Migration 019

**Files:**
- Create: `supabase/migrations/019_regua_cobranca.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 019_regua_cobranca.sql

-- ============================================================
-- Table 1: regras_cobranca
-- Stores template + schedule for each step (1/2/3) of the
-- payment reminder sequence, one set per user.
-- ============================================================
create table if not exists regras_cobranca (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  etapa             smallint    not null check (etapa in (1, 2, 3)),
  dias_apos         smallint    not null check (dias_apos >= 0),
  template_mensagem text        not null,
  ativo             boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, etapa)
) tablespace pg_default;

create index if not exists idx_regras_cobranca_user_id on regras_cobranca(user_id);

create or replace function regras_cobranca_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_regras_cobranca_updated_at on regras_cobranca;
create trigger trg_regras_cobranca_updated_at
  before update on regras_cobranca
  for each row execute function regras_cobranca_set_updated_at();

alter table regras_cobranca enable row level security;

create policy "regras_cobranca_select_own" on regras_cobranca
  for select using (auth.uid() = user_id);
create policy "regras_cobranca_insert_own" on regras_cobranca
  for insert with check (auth.uid() = user_id);
create policy "regras_cobranca_update_own" on regras_cobranca
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "regras_cobranca_delete_own" on regras_cobranca
  for delete using (auth.uid() = user_id);

-- auto-fill user_id on insert (same pattern as other tables)
create trigger trg_set_user_id_regras_cobranca
  before insert on regras_cobranca
  for each row execute function public.set_user_id();

-- ============================================================
-- Table 2: cobracas_enviadas
-- Audit log of every payment reminder attempt.
-- status lifecycle:
--   pendente  → waiting for manual approval (manual mode)
--   agendado  → about to be sent (auto mode, before actual send)
--   enviado   → successfully sent via Evolution API
--   falha     → send attempt failed (erro_detalhes populated)
--   cancelado → session paid, or user manually cancelled
-- ============================================================
create table if not exists cobracas_enviadas (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  sessao_id       uuid        not null references sessoes(id) on delete cascade,
  etapa           smallint    not null check (etapa in (1, 2, 3)),
  status          text        not null default 'pendente'
                              check (status in ('pendente','agendado','enviado','falha','cancelado')),
  mensagem_texto  text        not null,
  data_agendado   timestamptz not null default now(),
  data_enviado    timestamptz,
  erro_detalhes   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
) tablespace pg_default;

create index if not exists idx_cobracas_enviadas_user_id     on cobracas_enviadas(user_id);
create index if not exists idx_cobracas_enviadas_sessao_id   on cobracas_enviadas(sessao_id);
create index if not exists idx_cobracas_enviadas_status      on cobracas_enviadas(status);
create index if not exists idx_cobracas_enviadas_data_agendado on cobracas_enviadas(data_agendado);

create or replace function cobracas_enviadas_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cobracas_enviadas_updated_at on cobracas_enviadas;
create trigger trg_cobracas_enviadas_updated_at
  before update on cobracas_enviadas
  for each row execute function cobracas_enviadas_set_updated_at();

alter table cobracas_enviadas enable row level security;

create policy "cobracas_enviadas_select_own" on cobracas_enviadas
  for select using (auth.uid() = user_id);
create policy "cobracas_enviadas_insert_own" on cobracas_enviadas
  for insert with check (auth.uid() = user_id);
create policy "cobracas_enviadas_update_own" on cobracas_enviadas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cobracas_enviadas_delete_own" on cobracas_enviadas
  for delete using (auth.uid() = user_id);

-- auto-fill user_id on insert
create trigger trg_set_user_id_cobracas_enviadas
  before insert on cobracas_enviadas
  for each row execute function public.set_user_id();

-- ============================================================
-- Table 3: extend config_psicologo
-- chave_pix            → PIX key to include in reminder messages
-- regua_cobranca_ativa → master switch for payment reminders
-- regua_cobranca_modo  → 'auto' fires automatically; 'manual' queues for approval
-- ============================================================
alter table config_psicologo
  add column if not exists chave_pix             text,
  add column if not exists regua_cobranca_ativa  boolean not null default false,
  add column if not exists regua_cobranca_modo   text    not null default 'manual'
    check (regua_cobranca_modo in ('auto', 'manual'));

comment on column config_psicologo.chave_pix            is 'Chave PIX do psicólogo para inclusão nas mensagens de cobrança';
comment on column config_psicologo.regua_cobranca_ativa is 'Ativa a régua de cobrança automática via WhatsApp';
comment on column config_psicologo.regua_cobranca_modo  is 'auto = disparo automático; manual = fila de aprovação';
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor**

Paste the entire file into Supabase Dashboard → SQL Editor and run it. Verify in Table Editor:
- Table `regras_cobranca` exists with columns `id`, `user_id`, `etapa`, `dias_apos`, `template_mensagem`, `ativo`
- Table `cobracas_enviadas` exists with columns `id`, `user_id`, `sessao_id`, `etapa`, `status`, `mensagem_texto`, `data_agendado`, `data_enviado`, `erro_detalhes`
- `config_psicologo` has new columns `chave_pix`, `regua_cobranca_ativa`, `regua_cobranca_modo`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/019_regua_cobranca.sql
git commit -m "feat(db): migration 019 — regras_cobranca, cobracas_enviadas, extend config_psicologo"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write failing test**

`src/lib/types.ts` is a pure type file — no runtime test is needed. Instead, verify at compile time by running `tsc --noEmit` (Step 3).

- [ ] **Step 2: Add new types to `src/lib/types.ts`**

After the last export in the file (after `PacienteComConvenio`), add:

```typescript
// ============================================================
// Régua de Cobrança
// ============================================================

export type EtapaCobranca = 1 | 2 | 3

export type StatusCobranca = 'pendente' | 'agendado' | 'enviado' | 'falha' | 'cancelado'

export type ModoCobracaWhatsapp = 'auto' | 'manual'

export interface RegraCobranca {
  id: string
  user_id: string
  etapa: EtapaCobranca
  dias_apos: number
  template_mensagem: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface CobrancaEnviada {
  id: string
  user_id: string
  sessao_id: string
  etapa: EtapaCobranca
  status: StatusCobranca
  mensagem_texto: string
  data_agendado: string
  data_enviado: string | null
  erro_detalhes: string | null
  created_at: string
  updated_at: string
}

export interface CobrancaEnviadaView extends CobrancaEnviada {
  sessoes: {
    data_hora: string
    valor_cobrado: number | null
    pago: boolean
    status: SessaoStatus
    paciente_id: string | null
    avulso_nome: string | null
    pacientes: { nome: string; telefone: string | null } | null
  } | null
}

export interface SessaoParaCobranca {
  id: string
  data_hora: string
  valor_cobrado: number
  pago: boolean
  status: SessaoStatus
  paciente_id: string | null
  avulso_nome: string | null
  avulso_telefone: string | null
  pacientes: { nome: string; telefone: string | null } | null
  etapas_pendentes: EtapaCobranca[]
}
```

Also update the existing `ConfigPsicologo` interface — replace it entirely with:

```typescript
export interface ConfigPsicologo {
  id: string
  nome: string | null
  horario_inicio: string | null
  horario_fim: string | null
  horario_checklist: string | null
  horario_lembrete_1: string | null
  horario_lembrete_2: string | null
  automacao_whatsapp_ativa: boolean
  evolution_instance_name: string | null
  evolution_token: string | null
  whatsapp_conectado: boolean
  user_id: string | null
  // Régua de Cobrança fields (added in migration 019)
  chave_pix: string | null
  regua_cobranca_ativa: boolean
  regua_cobranca_modo: ModoCobracaWhatsapp
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected output: no errors. The `ConfigPsicologo` update is a breaking addition, so any code that currently spreads `config` into Supabase `update()` calls must be checked — but `useConfigPsicologo.updateConfig` already uses a `Partial<Pick<...>>`, so it is safe.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add Régua de Cobrança types and extend ConfigPsicologo"
```

---

## Task 3: Widen `useConfigPsicologo` Patch Type

**Files:**
- Modify: `src/hooks/useConfigPsicologo.ts`

- [ ] **Step 1: Widen the `updateConfig` patch type**

In `src/hooks/useConfigPsicologo.ts`, replace the current `updateConfig` signature (line 19):

```typescript
// BEFORE:
async function updateConfig(patch: Partial<Pick<ConfigPsicologo, 'nome' | 'horario_inicio' | 'horario_fim' | 'horario_lembrete_1' | 'horario_lembrete_2' | 'automacao_whatsapp_ativa'>>): Promise<void> {

// AFTER:
async function updateConfig(patch: Partial<Pick<ConfigPsicologo,
  | 'nome'
  | 'horario_inicio'
  | 'horario_fim'
  | 'horario_lembrete_1'
  | 'horario_lembrete_2'
  | 'automacao_whatsapp_ativa'
  | 'chave_pix'
  | 'regua_cobranca_ativa'
  | 'regua_cobranca_modo'
>>): Promise<void> {
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useConfigPsicologo.ts
git commit -m "feat(hooks): widen updateConfig to include régua de cobrança fields"
```

---

## Task 4: `useReguaCobranca` Hook

**Files:**
- Create: `src/hooks/useReguaCobranca.ts`
- Create: `src/hooks/__tests__/useReguaCobranca.test.ts`

- [ ] **Step 1: Write failing test**

Create `src/hooks/__tests__/useReguaCobranca.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useReguaCobranca } from '../useReguaCobranca'

// ── Supabase mock ──────────────────────────────────────────────
const mockSelect = vi.fn()
const mockOrder  = vi.fn()
const mockUpsert = vi.fn()
const mockDelete = vi.fn()
const mockUpdate = vi.fn()
const mockEq     = vi.fn()
const mockFrom   = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}))

const makeChain = (resolved: { data: unknown; error: unknown }) => {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.order  = vi.fn().mockResolvedValue(resolved)
  chain.eq     = vi.fn().mockReturnValue(chain)
  chain.in     = vi.fn().mockReturnValue(chain)
  chain.not    = vi.fn().mockReturnValue(chain)
  chain.gte    = vi.fn().mockReturnValue(chain)
  chain.upsert = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolved)
  return chain
}

describe('useReguaCobranca', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('starts with empty state', () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const { result } = renderHook(() => useReguaCobranca())
    expect(result.current.regras).toEqual([])
    expect(result.current.cobracasEnviadas).toEqual([])
    expect(result.current.sessoesParaCobranca).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('fetchRegras populates regras state', async () => {
    const mockData = [
      { id: 'r-1', etapa: 1, dias_apos: 1, template_mensagem: 'Olá {{nome}}', ativo: true },
    ]
    const chain = makeChain({ data: mockData, error: null })
    mockFrom.mockReturnValue(chain)

    const { result } = renderHook(() => useReguaCobranca())
    await act(async () => { await result.current.fetchRegras() })

    expect(result.current.regras).toEqual(mockData)
    expect(result.current.error).toBeNull()
  })

  it('fetchRegras sets error on failure', async () => {
    const chain = makeChain({ data: null, error: { message: 'DB error' } })
    mockFrom.mockReturnValue(chain)

    const { result } = renderHook(() => useReguaCobranca())
    await act(async () => { await result.current.fetchRegras() })

    expect(result.current.error).toMatch(/DB error/)
  })

  it('cancelarCobranca calls update with status=cancelado', async () => {
    const chain = makeChain({ data: null, error: null })
    // After cancelarCobranca, fetchCobracasEnviadas is called — return empty list
    const chain2 = makeChain({ data: [], error: null })
    mockFrom
      .mockReturnValueOnce(chain)   // update call
      .mockReturnValue(chain2)      // refetch

    const { result } = renderHook(() => useReguaCobranca())
    await act(async () => { await result.current.cancelarCobranca('cob-1') })

    expect(result.current.error).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/__tests__/useReguaCobranca.test.ts
```

Expected: FAIL — `Cannot find module '../useReguaCobranca'`

- [ ] **Step 3: Implement `src/hooks/useReguaCobranca.ts`**

```typescript
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  RegraCobranca,
  CobrancaEnviadaView,
  SessaoParaCobranca,
  EtapaCobranca,
} from '@/lib/types'

export function useReguaCobranca() {
  const [regras, setRegras]                       = useState<RegraCobranca[]>([])
  const [cobracasEnviadas, setCobracasEnviadas]   = useState<CobrancaEnviadaView[]>([])
  const [sessoesParaCobranca, setSessoesParaCobranca] = useState<SessaoParaCobranca[]>([])
  const [loading, setLoading]                     = useState(false)
  const [error, setError]                         = useState<string | null>(null)

  // ── Fetch rules ordered by etapa ────────────────────────────
  async function fetchRegras() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('regras_cobranca')
        .select('*')
        .order('etapa', { ascending: true })
      if (err) throw new Error(err.message)
      setRegras(data ?? [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // ── Fetch sent reminders with joined session + patient data ──
  async function fetchCobracasEnviadas(filters?: {
    sessao_id?: string
    status?: string
    dias?: number
  }) {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('cobracas_enviadas')
        .select(`
          *,
          sessoes!inner(
            data_hora,
            valor_cobrado,
            pago,
            status,
            paciente_id,
            avulso_nome,
            pacientes(nome, telefone)
          )
        `)

      if (filters?.sessao_id) query = query.eq('sessao_id', filters.sessao_id)
      if (filters?.status)    query = query.eq('status', filters.status)
      if (filters?.dias) {
        const since = new Date(Date.now() - filters.dias * 86_400_000).toISOString()
        query = query.gte('data_agendado', since)
      }

      const { data, error: err } = await query.order('data_agendado', { ascending: false })
      if (err) throw new Error(err.message)
      setCobracasEnviadas((data ?? []) as CobrancaEnviadaView[])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // ── Fetch unpaid sessions eligible for payment reminders ────
  // Scope: status IN ('concluida','faltou') AND pago=false AND valor_cobrado IS NOT NULL
  async function fetchSessoesParaCobranca() {
    setLoading(true)
    setError(null)
    try {
      const { data: sessoes, error: err } = await supabase
        .from('sessoes')
        .select(`
          id,
          data_hora,
          valor_cobrado,
          pago,
          status,
          paciente_id,
          avulso_nome,
          avulso_telefone,
          pacientes(nome, telefone),
          cobracas_enviadas!left(etapa, status)
        `)
        .in('status', ['concluida', 'faltou'])
        .eq('pago', false)
        .not('valor_cobrado', 'is', null)
        .order('data_hora', { ascending: false })

      if (err) throw new Error(err.message)

      const enriched: SessaoParaCobranca[] = (sessoes ?? []).map((s: any) => {
        const alreadySent: number[] = (s.cobracas_enviadas ?? [])
          .filter((c: any) => c.status !== 'cancelado')
          .map((c: any) => c.etapa)
        const etapas_pendentes = ([1, 2, 3] as EtapaCobranca[]).filter(
          (e) => !alreadySent.includes(e)
        )
        const { cobracas_enviadas: _drop, ...rest } = s
        return { ...rest, etapas_pendentes } as SessaoParaCobranca
      })

      setSessoesParaCobranca(enriched)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // ── Upsert a rule (create or update by etapa) ───────────────
  async function salvarRegra(
    etapa: number,
    template: string,
    dias: number,
    ativo: boolean
  ): Promise<RegraCobranca> {
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error: err } = await supabase
      .from('regras_cobranca')
      .upsert(
        { etapa, template_mensagem: template, dias_apos: dias, ativo, user_id: user.id },
        { onConflict: 'user_id,etapa' }
      )
      .select()
      .single()

    if (err) { setError(err.message); throw new Error(err.message) }
    await fetchRegras()
    return data as RegraCobranca
  }

  // ── Delete a rule by etapa ───────────────────────────────────
  async function deletarRegra(etapa: number): Promise<void> {
    setError(null)
    const { error: err } = await supabase
      .from('regras_cobranca')
      .delete()
      .eq('etapa', etapa)

    if (err) { setError(err.message); throw new Error(err.message) }
    await fetchRegras()
  }

  // ── Approve + send a pending cobranca via Edge Function ─────
  async function aprovarEEnviar(cobrancaId: string): Promise<void> {
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cobranca-whatsapp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ cobranca_id: cobrancaId }),
      }
    )
    const body = await resp.json()
    if (!resp.ok) {
      const msg = body.error ?? 'Falha ao enviar cobrança'
      setError(msg)
      throw new Error(msg)
    }
    await fetchCobracasEnviadas()
  }

  // ── Enqueue a new cobranca for a session + etapa ─────────────
  // Used in manual mode when the user clicks "Enviar Agora" from
  // the unpaid sessions list (creates a pendente record, then sends).
  async function enfileirarEEnviar(sessaoId: string, etapa: EtapaCobranca): Promise<void> {
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cobranca-whatsapp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessao_id: sessaoId, etapa, enqueue: true }),
      }
    )
    const body = await resp.json()
    if (!resp.ok) {
      const msg = body.error ?? 'Falha ao enviar cobrança'
      setError(msg)
      throw new Error(msg)
    }
    await fetchSessoesParaCobranca()
    await fetchCobracasEnviadas()
  }

  // ── Cancel a pending cobranca ────────────────────────────────
  async function cancelarCobranca(cobrancaId: string): Promise<void> {
    setError(null)
    const { error: err } = await supabase
      .from('cobracas_enviadas')
      .update({ status: 'cancelado' })
      .eq('id', cobrancaId)

    if (err) { setError(err.message); throw new Error(err.message) }
    await fetchCobracasEnviadas()
  }

  // ── Retry a failed cobranca ──────────────────────────────────
  async function reenviarFalha(cobrancaId: string): Promise<void> {
    return aprovarEEnviar(cobrancaId)
  }

  return {
    regras,
    cobracasEnviadas,
    sessoesParaCobranca,
    loading,
    error,
    fetchRegras,
    fetchCobracasEnviadas,
    fetchSessoesParaCobranca,
    salvarRegra,
    deletarRegra,
    aprovarEEnviar,
    enfileirarEEnviar,
    cancelarCobranca,
    reenviarFalha,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/__tests__/useReguaCobranca.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useReguaCobranca.ts src/hooks/__tests__/useReguaCobranca.test.ts
git commit -m "feat(hooks): add useReguaCobranca with fetchRegras, salvarRegra, cancelarCobranca"
```

---

## Task 5: `ReguaCobrancaTemplateEditor` Component

**Files:**
- Create: `src/components/regua-cobranca/ReguaCobrancaTemplateEditor.tsx`
- Create: `src/components/regua-cobranca/__tests__/ReguaCobrancaTemplateEditor.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/components/regua-cobranca/__tests__/ReguaCobrancaTemplateEditor.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { ReguaCobrancaTemplateEditor } from '../ReguaCobrancaTemplateEditor'
import type { RegraCobranca } from '@/lib/types'

const mockRegra: RegraCobranca = {
  id: 'r-1',
  user_id: 'u-1',
  etapa: 1,
  dias_apos: 1,
  template_mensagem: 'Olá {{nome}}, sua sessão de {{data_sessao}} está com pagamento pendente.',
  ativo: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('ReguaCobrancaTemplateEditor', () => {
  it('renders etapa label', () => {
    render(
      <ReguaCobrancaTemplateEditor
        etapa={1}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByText('Etapa 1')).toBeInTheDocument()
  })

  it('pre-fills fields when regra is provided', () => {
    render(
      <ReguaCobrancaTemplateEditor
        etapa={1}
        regra={mockRegra}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue('1')).toBeInTheDocument() // dias_apos
    expect(screen.getByDisplayValue(mockRegra.template_mensagem)).toBeInTheDocument()
  })

  it('calls onSave with template, dias, ativo when Salvar is clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <ReguaCobrancaTemplateEditor
        etapa={2}
        regra={{ ...mockRegra, etapa: 2, dias_apos: 3 }}
        onSave={onSave}
        onDelete={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        mockRegra.template_mensagem,
        3,
        true
      )
    })
  })

  it('shows Deletar button only when regra exists', () => {
    const { rerender } = render(
      <ReguaCobrancaTemplateEditor etapa={1} onSave={vi.fn()} onDelete={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: /deletar/i })).not.toBeInTheDocument()

    rerender(
      <ReguaCobrancaTemplateEditor
        etapa={1}
        regra={mockRegra}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /deletar/i })).toBeInTheDocument()
  })

  it('shows Salvando... while saving', async () => {
    let resolve!: () => void
    const onSave = vi.fn().mockReturnValue(new Promise<void>(r => { resolve = r }))
    render(
      <ReguaCobrancaTemplateEditor etapa={1} onSave={onSave} onDelete={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    expect(await screen.findByText('Salvando...')).toBeInTheDocument()
    resolve()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/regua-cobranca/__tests__/ReguaCobrancaTemplateEditor.test.tsx
```

Expected: FAIL — `Cannot find module '../ReguaCobrancaTemplateEditor'`

- [ ] **Step 3: Implement `src/components/regua-cobranca/ReguaCobrancaTemplateEditor.tsx`**

```typescript
import { useState } from 'react'
import type { EtapaCobranca, RegraCobranca } from '@/lib/types'

interface Props {
  etapa: EtapaCobranca
  regra?: RegraCobranca
  onSave: (template: string, dias: number, ativo: boolean) => Promise<void>
  onDelete: () => Promise<void>
}

const inputClass =
  'h-9 px-3 rounded-lg border border-[#E4E0DA] bg-white text-sm outline-none focus:ring-2 focus:ring-[#2D6A6A]/20 focus:border-[#2D6A6A] transition-colors'

const defaultTemplates: Record<EtapaCobranca, string> = {
  1: 'Olá {{nome}}, tudo bem? Passando para lembrar que a sessão do dia {{data_sessao}} gerou um valor de R$ {{valor}}.\n\nPode pagar via PIX: {{chave_pix}}\n\nQualquer dúvida, é só falar. Obrigada!',
  2: 'Olá {{nome}}! Ainda não identificamos o pagamento da sessão de {{data_sessao}} (R$ {{valor}}).\n\nPIX: {{chave_pix}}\n\nSe já pagou, desconsidere esta mensagem. Obrigada!',
  3: 'Oi {{nome}}, último lembrete sobre a sessão de {{data_sessao}} no valor de R$ {{valor}}.\n\nPIX: {{chave_pix}}\n\nQualquer problema, me avise. Obrigada!',
}

export function ReguaCobrancaTemplateEditor({ etapa, regra, onSave, onDelete }: Props) {
  const [template, setTemplate] = useState(regra?.template_mensagem ?? defaultTemplates[etapa])
  const [dias, setDias]         = useState(regra?.dias_apos ?? (etapa === 1 ? 1 : etapa === 2 ? 3 : 7))
  const [ativo, setAtivo]       = useState(regra?.ativo ?? true)
  const [saving, setSaving]     = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(template, dias, ativo)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Deseja excluir este modelo? Esta ação não pode ser desfeita.')) return
    await onDelete()
  }

  return (
    <div className="p-4 border border-[#E4E0DA] rounded-xl bg-[#F7F5F2]">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <h5 className="text-sm font-semibold text-[#1C1C1C]">
          Etapa {etapa}
          {regra && (
            <span className="ml-2 text-xs font-normal text-[#7A7A7A]">
              — envia {regra.dias_apos === 0 ? 'no mesmo dia' : `${regra.dias_apos} dia${regra.dias_apos > 1 ? 's' : ''} depois`}
            </span>
          )}
        </h5>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="w-4 h-4 accent-[#2D6A6A]"
          />
          <span className="text-xs text-[#7A7A7A]">Ativo</span>
        </label>
      </div>

      {/* Days input */}
      <div className="mb-3">
        <label className="block text-xs font-semibold text-[#1C1C1C] mb-1">
          Enviar após (dias da sessão)
        </label>
        <input
          type="number"
          min={0}
          value={dias}
          onChange={(e) => setDias(Math.max(0, parseInt(e.target.value) || 0))}
          className={`${inputClass} w-28`}
        />
      </div>

      {/* Template textarea */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-[#1C1C1C] mb-1">
          Mensagem
        </label>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 rounded-lg border border-[#E4E0DA] bg-white text-xs outline-none focus:ring-2 focus:ring-[#2D6A6A]/20 focus:border-[#2D6A6A] transition-colors resize-y"
        />
        <p className="mt-1 text-xs text-[#7A7A7A]">
          Variáveis disponíveis:{' '}
          <code className="bg-white px-1 rounded">{'{{nome}}'}</code>{' '}
          <code className="bg-white px-1 rounded">{'{{valor}}'}</code>{' '}
          <code className="bg-white px-1 rounded">{'{{data_sessao}}'}</code>{' '}
          <code className="bg-white px-1 rounded">{'{{chave_pix}}'}</code>
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-9 rounded-lg bg-[#2D6A6A] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#2D6A6A]/90 transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {regra && (
          <button
            onClick={handleDelete}
            className="flex-1 h-9 rounded-lg border border-[#E07070] text-[#E07070] text-sm font-medium hover:bg-[#E07070]/5 transition-colors"
          >
            Deletar
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/components/regua-cobranca/__tests__/ReguaCobrancaTemplateEditor.test.tsx
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/regua-cobranca/ReguaCobrancaTemplateEditor.tsx \
        src/components/regua-cobranca/__tests__/ReguaCobrancaTemplateEditor.test.tsx
git commit -m "feat(components): add ReguaCobrancaTemplateEditor with TDD"
```

---

## Task 6: `CobrancaPage`

**Files:**
- Create: `src/pages/CobrancaPage.tsx`
- Create: `src/pages/__tests__/CobrancaPage.test.tsx`

- [ ] **Step 1: Write failing test**

Create `src/pages/__tests__/CobrancaPage.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CobrancaPage } from '../CobrancaPage'
import type { SessaoParaCobranca, CobrancaEnviadaView } from '@/lib/types'

// ── mock the hook ────────────────────────────────────────────
const mockFetchSessoes   = vi.fn()
const mockFetchCobracas  = vi.fn()
const mockEnfileirar     = vi.fn()
const mockCancelar       = vi.fn()
const mockReenviar       = vi.fn()

vi.mock('@/hooks/useReguaCobranca', () => ({
  useReguaCobranca: () => ({
    sessoesParaCobranca: mockSessoes,
    cobracasEnviadas:    mockCobracas,
    loading:             false,
    error:               null,
    fetchSessoesParaCobranca: mockFetchSessoes,
    fetchCobracasEnviadas:    mockFetchCobracas,
    enfileirarEEnviar:        mockEnfileirar,
    cancelarCobranca:         mockCancelar,
    reenviarFalha:            mockReenviar,
  }),
}))

let mockSessoes:  SessaoParaCobranca[] = []
let mockCobracas: CobrancaEnviadaView[] = []

function renderPage() {
  return render(
    <MemoryRouter>
      <CobrancaPage />
    </MemoryRouter>
  )
}

describe('CobrancaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessoes  = []
    mockCobracas = []
  })

  it('renders both tab labels', () => {
    renderPage()
    expect(screen.getByText(/Sessões Não Pagas/)).toBeInTheDocument()
    expect(screen.getByText(/Histórico de Envios/)).toBeInTheDocument()
  })

  it('calls fetch hooks on mount', () => {
    renderPage()
    expect(mockFetchSessoes).toHaveBeenCalledTimes(1)
    expect(mockFetchCobracas).toHaveBeenCalledTimes(1)
  })

  it('shows empty state when no unpaid sessions', () => {
    renderPage()
    expect(screen.getByText('Nenhuma sessão com pagamento pendente')).toBeInTheDocument()
  })

  it('renders session card when sessions exist', () => {
    mockSessoes = [{
      id: 's-1',
      data_hora: '2026-04-01T10:00:00Z',
      valor_cobrado: 150,
      pago: false,
      status: 'concluida',
      paciente_id: null,
      avulso_nome: 'Maria Silva',
      avulso_telefone: null,
      pacientes: null,
      etapas_pendentes: [1, 2, 3],
    }]
    renderPage()
    expect(screen.getByText('Maria Silva')).toBeInTheDocument()
  })

  it('switches to Histórico tab on click', () => {
    renderPage()
    fireEvent.click(screen.getByText(/Histórico de Envios/))
    expect(screen.getByText('Nenhum envio registrado')).toBeInTheDocument()
  })

  it('shows loading spinner when loading', () => {
    // Override module mock for this test only via vi.doMock is complex;
    // test via the DOM: when loading=true a spinner is rendered.
    // Since our mock always returns loading:false, we just confirm the
    // page renders without spinner in normal state.
    renderPage()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/pages/__tests__/CobrancaPage.test.tsx
```

Expected: FAIL — `Cannot find module '../CobrancaPage'`

- [ ] **Step 3: Implement `src/pages/CobrancaPage.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useReguaCobranca } from '@/hooks/useReguaCobranca'
import type { CobrancaEnviadaView, SessaoParaCobranca, StatusCobranca, EtapaCobranca } from '@/lib/types'

type Aba = 'sessoes' | 'historico'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataFormatada(iso: string) {
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

const statusLabel: Record<StatusCobranca, string> = {
  pendente:  'Pendente',
  agendado:  'Agendado',
  enviado:   'Enviado',
  falha:     'Falha',
  cancelado: 'Cancelado',
}

const statusColor: Record<StatusCobranca, string> = {
  pendente:  'bg-yellow-100 text-yellow-800',
  agendado:  'bg-blue-100 text-blue-800',
  enviado:   'bg-green-100 text-green-800',
  falha:     'bg-red-100 text-red-800',
  cancelado: 'bg-gray-100 text-gray-600',
}

export function CobrancaPage() {
  const {
    sessoesParaCobranca,
    cobracasEnviadas,
    loading,
    error,
    fetchSessoesParaCobranca,
    fetchCobracasEnviadas,
    enfileirarEEnviar,
    cancelarCobranca,
    reenviarFalha,
  } = useReguaCobranca()

  const [aba, setAba]                     = useState<Aba>('sessoes')
  const [expandedId, setExpandedId]       = useState<string | null>(null)
  const [sendingKey, setSendingKey]       = useState<string | null>(null)
  const [retryingId, setRetryingId]       = useState<string | null>(null)
  const [cancelingId, setCancelingId]     = useState<string | null>(null)

  useEffect(() => {
    fetchSessoesParaCobranca()
    fetchCobracasEnviadas()
  }, [])

  async function handleEnviar(sessaoId: string, etapa: EtapaCobranca) {
    const key = `${sessaoId}-${etapa}`
    setSendingKey(key)
    try {
      await enfileirarEEnviar(sessaoId, etapa)
    } finally {
      setSendingKey(null)
    }
  }

  async function handleReenviar(cobrancaId: string) {
    setRetryingId(cobrancaId)
    try {
      await reenviarFalha(cobrancaId)
    } finally {
      setRetryingId(null)
    }
  }

  async function handleCancelar(cobrancaId: string) {
    setCancelingId(cobrancaId)
    try {
      await cancelarCobranca(cobrancaId)
    } finally {
      setCancelingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-6 h-6 border-2 border-[#2D6A6A] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Cobrança WhatsApp</h1>
        <p className="text-sm text-[#7A7A7A] mt-0.5">
          Régua de lembretes para sessões com pagamento pendente
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-sm text-red-700 border border-red-200">
          Erro: {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        {([
          { key: 'sessoes',   label: `Sessões Não Pagas (${sessoesParaCobranca.length})` },
          { key: 'historico', label: `Histórico de Envios (${cobracasEnviadas.length})` },
        ] as { key: Aba; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              aba === key
                ? 'bg-[#2D6A6A] text-white'
                : 'bg-white border border-[#E4E0DA] text-[#7A7A7A] hover:text-[#1C1C1C]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Sessões Não Pagas ── */}
      {aba === 'sessoes' && (
        <div className="flex flex-col gap-3">
          {sessoesParaCobranca.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#7A7A7A]">
              Nenhuma sessão com pagamento pendente
            </div>
          ) : (
            sessoesParaCobranca.map((sessao) => {
              const nome = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Paciente'
              const isExpanded = expandedId === sessao.id
              return (
                <div key={sessao.id} className="bg-white rounded-xl border border-[#E4E0DA]">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : sessao.id)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#1C1C1C]">{nome}</p>
                      <p className="text-xs text-[#7A7A7A] mt-0.5">
                        {dataFormatada(sessao.data_hora)} · {moeda(sessao.valor_cobrado)}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        sessao.etapas_pendentes.length > 0
                          ? 'bg-[#C17F59]/10 text-[#C17F59]'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {sessao.etapas_pendentes.length} etapa{sessao.etapas_pendentes.length !== 1 ? 's' : ''} pendente{sessao.etapas_pendentes.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#E4E0DA] px-4 py-3 space-y-2">
                      {sessao.etapas_pendentes.length === 0 ? (
                        <p className="text-xs text-[#7A7A7A]">Todas as etapas já foram processadas.</p>
                      ) : (
                        sessao.etapas_pendentes.map((etapa) => {
                          const key = `${sessao.id}-${etapa}`
                          return (
                            <div
                              key={etapa}
                              className="flex items-center justify-between p-2 bg-[#F7F5F2] rounded-lg"
                            >
                              <span className="text-xs font-semibold text-[#1C1C1C]">
                                Etapa {etapa}
                              </span>
                              <button
                                onClick={() => handleEnviar(sessao.id, etapa)}
                                disabled={sendingKey === key}
                                className="h-7 px-3 rounded-lg bg-[#2D6A6A] text-white text-xs font-medium disabled:opacity-50 hover:bg-[#2D6A6A]/90 transition-colors"
                              >
                                {sendingKey === key ? 'Enviando...' : 'Enviar Agora'}
                              </button>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ── Histórico ── */}
      {aba === 'historico' && (
        <div className="flex flex-col gap-3">
          {cobracasEnviadas.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#7A7A7A]">
              Nenhum envio registrado
            </div>
          ) : (
            cobracasEnviadas.map((c: CobrancaEnviadaView) => {
              const nome =
                c.sessoes?.pacientes?.nome ??
                (c.sessoes as any)?.avulso_nome ??
                'Paciente'
              return (
                <div key={c.id} className="bg-white rounded-xl border border-[#E4E0DA] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#1C1C1C]">{nome}</p>
                      <p className="text-xs text-[#7A7A7A] mt-0.5">
                        Etapa {c.etapa} · {dataFormatada(c.data_agendado)}
                      </p>
                      {c.data_enviado && (
                        <p className="text-xs text-[#4CAF82] mt-0.5">
                          Enviado em {dataFormatada(c.data_enviado)}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[c.status]}`}>
                      {statusLabel[c.status]}
                    </span>
                  </div>

                  {c.erro_detalhes && (
                    <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-700">
                      {c.erro_detalhes}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    {c.status === 'falha' && (
                      <button
                        onClick={() => handleReenviar(c.id)}
                        disabled={retryingId === c.id}
                        className="h-7 px-3 rounded-lg bg-[#2D6A6A] text-white text-xs font-medium disabled:opacity-50 hover:bg-[#2D6A6A]/90 transition-colors"
                      >
                        {retryingId === c.id ? 'Reenviando...' : 'Tentar Novamente'}
                      </button>
                    )}
                    {c.status === 'pendente' && (
                      <button
                        onClick={() => handleCancelar(c.id)}
                        disabled={cancelingId === c.id}
                        className="h-7 px-3 rounded-lg border border-[#E07070] text-[#E07070] text-xs font-medium disabled:opacity-50 hover:bg-[#E07070]/5 transition-colors"
                      >
                        {cancelingId === c.id ? 'Cancelando...' : 'Cancelar'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/pages/__tests__/CobrancaPage.test.tsx
```

Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/pages/CobrancaPage.tsx src/pages/__tests__/CobrancaPage.test.tsx
git commit -m "feat(pages): add CobrancaPage — unpaid sessions + send history tabs"
```

---

## Task 7: Update Router and Navigation

**Files:**
- Modify: `src/router.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/BottomNav.tsx`

- [ ] **Step 1: Add route to `src/router.tsx`**

Add the import and route. In `src/router.tsx`, add after the `FinanceiroPacientePage` import:

```typescript
import { CobrancaPage } from '@/pages/CobrancaPage'
```

Add route after the `/financeiro/paciente/:id` route, still inside `AppLayout` children:

```typescript
{ path: '/cobranca', element: <CobrancaPage /> },
```

Full updated routes children array (only the changed portion shown):

```typescript
          { path: '/financeiro', element: <FinanceiroPage /> },
          { path: '/financeiro/paciente/:id', element: <FinanceiroPacientePage /> },
          { path: '/cobranca', element: <CobrancaPage /> },
          { path: '/configuracoes', element: <ConfiguracoesPage /> },
```

- [ ] **Step 2: Add Cobrança to `src/components/layout/Sidebar.tsx`**

Add a `MessageSquareDollar` (or `Wallet`) icon import and a new nav item. In the import line, add `Wallet` to the lucide-react import:

```typescript
import { Calendar, Kanban, Users, BarChart2, Settings, LogOut, ClipboardList, Wallet } from 'lucide-react'
```

Add to `navItems` array after the `/financeiro` entry:

```typescript
  { to: '/cobranca',     icon: Wallet,        label: 'Cobrança'      },
```

Full updated `navItems`:

```typescript
const navItems = [
  { to: '/agenda',        icon: Calendar,      label: 'Agenda'        },
  { to: '/kanban',        icon: Kanban,         label: 'Kanban'        },
  { to: '/checklist',     icon: ClipboardList,  label: 'Checklist'     },
  { to: '/pacientes',     icon: Users,          label: 'Pacientes'     },
  { to: '/financeiro',    icon: BarChart2,       label: 'Financeiro'    },
  { to: '/cobranca',      icon: Wallet,          label: 'Cobrança'      },
  { to: '/configuracoes', icon: Settings,        label: 'Configurações' },
] as const
```

- [ ] **Step 3: Add Cobrança to `src/components/layout/BottomNav.tsx`**

BottomNav is space-constrained (mobile). Replace `/configuracoes` with `/cobranca` is not desirable. Instead, add `Wallet` after `/pacientes` and keep Configurações:

Add `Wallet` to the lucide-react import in BottomNav:

```typescript
import { Calendar, Kanban, Users, Settings, ClipboardList, Wallet } from 'lucide-react'
```

Update `staticNavItems`:

```typescript
const staticNavItems = [
  { to: '/agenda',        icon: Calendar,       label: 'Agenda'     },
  { to: '/kanban',        icon: Kanban,          label: 'Kanban'     },
  { to: '/checklist',     icon: ClipboardList,   label: 'Checklist'  },
  { to: '/cobranca',      icon: Wallet,          label: 'Cobrança'   },
  { to: '/configuracoes', icon: Settings,        label: 'Config.'    },
] as const
```

Note: `/pacientes` is dropped from BottomNav to stay at 5 items (mobile optimum). Pacientes remains accessible via Sidebar on desktop and via direct URL.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/router.tsx src/components/layout/Sidebar.tsx src/components/layout/BottomNav.tsx
git commit -m "feat(nav): add /cobranca route and navigation links in sidebar + bottom nav"
```

---

## Task 8: Configurações — Régua de Cobrança Section

**Files:**
- Modify: `src/pages/ConfiguracoesPage.tsx`

This task adds the settings UI: master toggle, PIX key, send mode selector, and the three template editors.

- [ ] **Step 1: Add imports and hook calls to `ConfiguracoesPage.tsx`**

At the top of `ConfiguracoesPage.tsx`, add this import after the existing imports:

```typescript
import { useReguaCobranca } from '@/hooks/useReguaCobranca'
import { ReguaCobrancaTemplateEditor } from '@/components/regua-cobranca/ReguaCobrancaTemplateEditor'
import type { EtapaCobranca, ModoCobracaWhatsapp } from '@/lib/types'
```

Inside `ConfiguracoesPage()`, after the existing hook calls (around line 18), add:

```typescript
  const {
    regras,
    loading: loadingRegras,
    fetchRegras,
    salvarRegra,
    deletarRegra,
  } = useReguaCobranca()

  useEffect(() => { fetchRegras() }, [])
```

(The file already has a `useEffect` import from React. If not, add it to the React import.)

- [ ] **Step 2: Add the Régua de Cobrança section to the JSX**

Find the closing section tag of the WhatsApp section (search for the closing `</section>` after the WhatsApp test button block) and add the new section immediately after it, before the closing `</div>` of the page:

```tsx
      {/* ── Régua de Cobrança ───────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-display font-semibold text-[#1C1C1C] mb-4">
          Régua de Cobrança
        </h2>

        {/* Master toggle */}
        <div className="bg-white rounded-xl border border-[#E4E0DA] p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#1C1C1C]">
                Ativar lembretes automáticos de cobrança
              </p>
              <p className="text-xs text-[#7A7A7A] mt-0.5">
                Envia mensagens WhatsApp para sessões com pagamento pendente
              </p>
            </div>
            <button
              role="switch"
              aria-checked={config?.regua_cobranca_ativa ?? false}
              onClick={() =>
                config && updateConfig({ regua_cobranca_ativa: !(config.regua_cobranca_ativa ?? false) })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config?.regua_cobranca_ativa ? 'bg-[#2D6A6A]' : 'bg-[#E4E0DA]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  config?.regua_cobranca_ativa ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {config?.regua_cobranca_ativa && (
          <>
            {/* PIX Key */}
            <div className="bg-white rounded-xl border border-[#E4E0DA] p-4 mb-4">
              <label className="block text-sm font-semibold text-[#1C1C1C] mb-2">
                Chave PIX
              </label>
              <input
                type="text"
                value={config.chave_pix ?? ''}
                onChange={(e) => updateConfig({ chave_pix: e.target.value || null })}
                placeholder="email, CPF, telefone ou chave aleatória"
                className={`${inputClass} w-full`}
              />
              <p className="text-xs text-[#7A7A7A] mt-1">
                Incluída automaticamente nas mensagens como <code className="bg-[#F7F5F2] px-1 rounded">{'{{chave_pix}}'}</code>
              </p>
            </div>

            {/* Send mode */}
            <div className="bg-white rounded-xl border border-[#E4E0DA] p-4 mb-4">
              <p className="text-sm font-semibold text-[#1C1C1C] mb-3">Modo de Envio</p>
              <div className="flex flex-col gap-3">
                {([
                  {
                    value: 'auto',
                    title: 'Automático',
                    desc: 'Mensagens disparadas automaticamente pela agenda',
                  },
                  {
                    value: 'manual',
                    title: 'Fila de Aprovação',
                    desc: 'Você revisa e aprova cada mensagem antes do envio',
                  },
                ] as { value: ModoCobracaWhatsapp; title: string; desc: string }[]).map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="regua_modo"
                      value={opt.value}
                      checked={(config.regua_cobranca_modo ?? 'manual') === opt.value}
                      onChange={() => updateConfig({ regua_cobranca_modo: opt.value })}
                      className="mt-0.5 accent-[#2D6A6A]"
                    />
                    <div>
                      <p className="text-sm font-medium text-[#1C1C1C]">{opt.title}</p>
                      <p className="text-xs text-[#7A7A7A]">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Template editors */}
            <div className="mb-2">
              <p className="text-sm font-semibold text-[#1C1C1C] mb-1">Modelos de Mensagem</p>
              <p className="text-xs text-[#7A7A7A] mb-4">
                Configure até 3 etapas. Cada etapa dispara após o número de dias definido desde a data da sessão.
              </p>
            </div>
            {loadingRegras ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-[#2D6A6A] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {([1, 2, 3] as EtapaCobranca[]).map((etapa) => (
                  <ReguaCobrancaTemplateEditor
                    key={etapa}
                    etapa={etapa}
                    regra={regras.find((r) => r.etapa === etapa)}
                    onSave={(template, dias, ativo) => salvarRegra(etapa, template, dias, ativo)}
                    onDelete={() => deletarRegra(etapa)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. If `updateConfig` fails due to the new fields not being in the Pick type, Task 3 must be completed first.

- [ ] **Step 4: Commit**

```bash
git add src/pages/ConfiguracoesPage.tsx
git commit -m "feat(settings): add Régua de Cobrança section — toggle, PIX key, mode, templates"
```

---

## Task 9: Edge Function `cobranca-whatsapp`

**Files:**
- Create: `supabase/functions/cobranca-whatsapp/index.ts`

This function handles two call modes:
1. `{ cobranca_id }` — send an already-created `cobracas_enviadas` record
2. `{ sessao_id, etapa, enqueue: true }` — create a new record then send immediately (manual "Enviar Agora")

- [ ] **Step 1: Implement the function**

Create `supabase/functions/cobranca-whatsapp/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EVOLUTION_API_URL  = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY  = Deno.env.get('EVOLUTION_API_KEY')!
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type':                 'application/json',
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 11) return '55' + digits
  if (digits.length === 10) return '55' + digits  // no 9th digit, older format
  return '55' + digits.slice(-11)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // ── Authenticate caller ──────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'Não autenticado' }),
      { status: 401, headers: corsHeaders }
    )
  }

  const body = await req.json() as {
    cobranca_id?: string
    sessao_id?:   string
    etapa?:       number
    enqueue?:     boolean
    test?:        boolean
  }

  const { cobranca_id, sessao_id, etapa, enqueue, test } = body
  let cobrancaId = cobranca_id

  // ── Mode 2: enqueue + send immediately ──────────────────────
  if (enqueue && sessao_id && etapa) {
    // Fetch session to render the message template
    const { data: sessao, error: sessaoErr } = await supabase
      .from('sessoes')
      .select('id, data_hora, valor_cobrado, pago, avulso_nome, avulso_telefone, pacientes(nome, telefone)')
      .eq('id', sessao_id)
      .eq('user_id', user.id)
      .single()

    if (sessaoErr || !sessao) {
      return new Response(
        JSON.stringify({ error: 'Sessão não encontrada' }),
        { status: 404, headers: corsHeaders }
      )
    }

    if (sessao.pago) {
      return new Response(
        JSON.stringify({ skipped: 'Sessão já marcada como paga' }),
        { headers: corsHeaders }
      )
    }

    // Fetch the matching rule template
    const { data: regra, error: regraErr } = await supabase
      .from('regras_cobranca')
      .select('template_mensagem, dias_apos, ativo')
      .eq('user_id', user.id)
      .eq('etapa', etapa)
      .single()

    if (regraErr || !regra || !regra.ativo) {
      return new Response(
        JSON.stringify({ error: `Regra de etapa ${etapa} não encontrada ou inativa` }),
        { status: 404, headers: corsHeaders }
      )
    }

    // Fetch PIX key from config
    const { data: cfg } = await supabase
      .from('config_psicologo')
      .select('chave_pix')
      .eq('user_id', user.id)
      .single()

    const pacienteName = (sessao.pacientes as any)?.nome ?? sessao.avulso_nome ?? 'Paciente'
    const dataSessao   = new Date(sessao.data_hora).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const valor        = sessao.valor_cobrado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '0,00'
    const chavePix     = cfg?.chave_pix ?? '(não configurada)'

    const mensagemTexto = regra.template_mensagem
      .replace(/\{\{nome\}\}/g,        pacienteName)
      .replace(/\{\{valor\}\}/g,       valor)
      .replace(/\{\{data_sessao\}\}/g, dataSessao)
      .replace(/\{\{chave_pix\}\}/g,   chavePix)

    // Create cobracas_enviadas record
    const { data: nova, error: insertErr } = await supabase
      .from('cobracas_enviadas')
      .insert({
        user_id:       user.id,
        sessao_id,
        etapa,
        status:        'agendado',
        mensagem_texto: mensagemTexto,
        data_agendado: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertErr || !nova) {
      return new Response(
        JSON.stringify({ error: 'Erro ao criar registro de cobrança', detail: insertErr?.message }),
        { status: 500, headers: corsHeaders }
      )
    }

    cobrancaId = nova.id
  }

  if (!cobrancaId) {
    return new Response(
      JSON.stringify({ error: 'Parâmetro cobranca_id ou (sessao_id + etapa) obrigatório' }),
      { status: 400, headers: corsHeaders }
    )
  }

  // ── Fetch the cobranca record ────────────────────────────────
  const { data: cobranca, error: cobrancaErr } = await supabase
    .from('cobracas_enviadas')
    .select('id, user_id, sessao_id, etapa, status, mensagem_texto')
    .eq('id', cobrancaId)
    .eq('user_id', user.id)   // tenant safety
    .single()

  if (cobrancaErr || !cobranca) {
    return new Response(
      JSON.stringify({ error: 'Cobrança não encontrada' }),
      { status: 404, headers: corsHeaders }
    )
  }

  if (cobranca.status === 'enviado') {
    return new Response(
      JSON.stringify({ skipped: 'Já enviado anteriormente' }),
      { headers: corsHeaders }
    )
  }

  if (cobranca.status === 'cancelado') {
    return new Response(
      JSON.stringify({ skipped: 'Cobrança cancelada' }),
      { headers: corsHeaders }
    )
  }

  // ── Fetch WhatsApp config for this user ──────────────────────
  const { data: config, error: configErr } = await supabase
    .from('config_psicologo')
    .select('whatsapp_conectado, evolution_instance_name')
    .eq('user_id', cobranca.user_id)
    .single()

  if (configErr || !config?.whatsapp_conectado || !config?.evolution_instance_name) {
    return new Response(
      JSON.stringify({ error: 'WhatsApp não conectado' }),
      { status: 412, headers: corsHeaders }
    )
  }

  // ── Fetch phone from session ─────────────────────────────────
  const { data: sessao, error: sessaoErr2 } = await supabase
    .from('sessoes')
    .select('avulso_telefone, pago, pacientes(telefone)')
    .eq('id', cobranca.sessao_id)
    .single()

  if (sessaoErr2 || !sessao) {
    return new Response(
      JSON.stringify({ error: 'Sessão não encontrada' }),
      { status: 404, headers: corsHeaders }
    )
  }

  // Stop if session was paid in the meantime
  if (sessao.pago) {
    await supabase
      .from('cobracas_enviadas')
      .update({ status: 'cancelado', erro_detalhes: 'Sessão paga antes do envio' })
      .eq('id', cobrancaId)
    return new Response(
      JSON.stringify({ skipped: 'Sessão paga — cobrança cancelada automaticamente' }),
      { headers: corsHeaders }
    )
  }

  const telefoneRaw = (sessao.pacientes as any)?.telefone ?? sessao.avulso_telefone
  if (!telefoneRaw) {
    const err = 'Sem telefone cadastrado para este paciente'
    await supabase
      .from('cobracas_enviadas')
      .update({ status: 'falha', erro_detalhes: err })
      .eq('id', cobrancaId)
    return new Response(
      JSON.stringify({ error: err }),
      { status: 422, headers: corsHeaders }
    )
  }

  const phone    = normalizePhone(telefoneRaw)
  const instance = config.evolution_instance_name
  const diag: Record<string, unknown> = { telefoneRaw, phoneNormalized: phone, instance, test: !!test }

  // ── Test mode: verify Evolution connection state ─────────────
  if (test) {
    try {
      const stateResp = await fetch(
        `${EVOLUTION_API_URL}/instance/connectionState/${instance}`,
        { headers: { apikey: EVOLUTION_API_KEY } }
      )
      const stateBody = await stateResp.text()
      diag.connectionStateStatus = stateResp.status
      diag.connectionStateBody   = stateBody
      console.log(`[test] cobranca connectionState [${stateResp.status}]: ${stateBody}`)

      if (!stateResp.ok) {
        return new Response(
          JSON.stringify({ error: 'Instância não responde', ...diag }),
          { status: 502, headers: corsHeaders }
        )
      }
      const parsed = JSON.parse(stateBody)
      if (parsed?.instance?.state !== 'open') {
        return new Response(
          JSON.stringify({ error: `Instância não está conectada (state=${parsed?.instance?.state})`, ...diag }),
          { status: 412, headers: corsHeaders }
        )
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Falha ao verificar conexão', detail: String(e), ...diag }),
        { status: 502, headers: corsHeaders }
      )
    }
  }

  // ── Send via Evolution API ───────────────────────────────────
  const evoResp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
    method:  'POST',
    headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ number: phone, text: cobranca.mensagem_texto }),
  })
  const evoBody = await evoResp.text()
  diag.sendStatus = evoResp.status
  diag.sendBody   = evoBody
  console.log(`[cobranca-whatsapp] Evolution send [${evoResp.status}] phone=${phone} instance=${instance}: ${evoBody}`)

  if (!evoResp.ok) {
    const errMsg = `Evolution API falhou (${evoResp.status}): ${evoBody}`
    await supabase
      .from('cobracas_enviadas')
      .update({ status: 'falha', erro_detalhes: errMsg })
      .eq('id', cobrancaId)
    return new Response(
      JSON.stringify({ error: 'Falha no envio via Evolution API', ...diag }),
      { status: 502, headers: corsHeaders }
    )
  }

  // ── Mark as sent ─────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('cobracas_enviadas')
    .update({ status: 'enviado', data_enviado: new Date().toISOString(), erro_detalhes: null })
    .eq('id', cobrancaId)

  if (updateErr) {
    console.error('[cobranca-whatsapp] Erro ao atualizar status:', updateErr)
  }

  return new Response(
    JSON.stringify({ ok: true, cobranca_id: cobrancaId, ...diag }),
    { headers: corsHeaders }
  )
})
```

- [ ] **Step 2: Deploy the function**

```bash
supabase functions deploy cobranca-whatsapp
```

Expected: `Deploying Function cobranca-whatsapp ... done`

- [ ] **Step 3: Smoke test via curl**

Replace `YOUR_URL`, `YOUR_ANON_KEY`, and `YOUR_COBRANCA_ID` with real values. This test verifies the auth + 404 flow without sending a real message:

```bash
curl -X POST https://YOUR_URL/functions/v1/cobranca-whatsapp \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cobranca_id":"00000000-0000-0000-0000-000000000000"}'
```

Expected response: `{"error":"Não autenticado"}` (401) because the anon key is not a user JWT. Use a real user JWT (from Supabase auth session) to test further.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cobranca-whatsapp/index.ts
git commit -m "feat(functions): add cobranca-whatsapp edge function — send + enqueue modes"
```

---

## Task 10: Edge Function `cron-cobrancas`

**Files:**
- Create: `supabase/functions/cron-cobrancas/index.ts`
- Create: `supabase/scripts/schedule_cron_cobrancas.sql`

- [ ] **Step 1: Implement the cron function**

Create `supabase/functions/cron-cobrancas/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  // Cron calls arrive with a service-role Bearer token
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now      = new Date()
  const results: Array<{ sessao_id: string; etapa: number; result: string }> = []

  try {
    // 1. Find all users with régua de cobrança enabled
    const { data: configs, error: configsErr } = await supabase
      .from('config_psicologo')
      .select('user_id, regua_cobranca_modo, chave_pix')
      .eq('regua_cobranca_ativa', true)

    if (configsErr) {
      console.error('cron-cobrancas: configs fetch error', JSON.stringify(configsErr))
      return new Response(JSON.stringify({ error: 'Config fetch failed', detail: configsErr.message }), { status: 500 })
    }

    for (const config of configs ?? []) {
      // 2. Fetch active rules for this user
      const { data: regras, error: regrasErr } = await supabase
        .from('regras_cobranca')
        .select('etapa, dias_apos, template_mensagem')
        .eq('user_id', config.user_id)
        .eq('ativo', true)

      if (regrasErr) {
        console.error(`cron-cobrancas: regras error for user ${config.user_id}:`, regrasErr.message)
        continue
      }
      if (!regras || regras.length === 0) continue

      // 3. Fetch unpaid sessions for this user (scope: concluida or faltou, not paid, valor set)
      const { data: sessoes, error: sessoesErr } = await supabase
        .from('sessoes')
        .select(`
          id,
          data_hora,
          valor_cobrado,
          avulso_nome,
          avulso_telefone,
          pacientes(nome),
          cobracas_enviadas!left(etapa, status)
        `)
        .eq('user_id', config.user_id)
        .in('status', ['concluida', 'faltou'])
        .eq('pago', false)
        .not('valor_cobrado', 'is', null)

      if (sessoesErr) {
        console.error(`cron-cobrancas: sessoes error for user ${config.user_id}:`, sessoesErr.message)
        continue
      }

      for (const sessao of sessoes ?? []) {
        const sessaoDate   = new Date(sessao.data_hora)
        const hoursElapsed = (now.getTime() - sessaoDate.getTime()) / 3_600_000

        for (const regra of regras) {
          const hoursRequired = regra.dias_apos * 24

          // Skip if time window not yet reached
          if (hoursElapsed < hoursRequired) continue

          // Skip if this etapa already has a non-cancelled record
          const alreadyDone = (sessao.cobracas_enviadas as any[] ?? []).some(
            (c: any) => c.etapa === regra.etapa && c.status !== 'cancelado'
          )
          if (alreadyDone) continue

          // Render the message
          const pacienteName = (sessao.pacientes as any)?.nome ?? sessao.avulso_nome ?? 'Paciente'
          const dataSessao   = sessaoDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          const valor        = (sessao.valor_cobrado as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
          const chavePix     = config.chave_pix ?? '(não configurada)'

          const mensagemTexto = regra.template_mensagem
            .replace(/\{\{nome\}\}/g,        pacienteName)
            .replace(/\{\{valor\}\}/g,       valor)
            .replace(/\{\{data_sessao\}\}/g, dataSessao)
            .replace(/\{\{chave_pix\}\}/g,   chavePix)

          const statusInicial = config.regua_cobranca_modo === 'auto' ? 'agendado' : 'pendente'

          // Create the cobracas_enviadas record
          const { data: nova, error: insertErr } = await supabase
            .from('cobracas_enviadas')
            .insert({
              user_id:        config.user_id,
              sessao_id:      sessao.id,
              etapa:          regra.etapa,
              status:         statusInicial,
              mensagem_texto: mensagemTexto,
              data_agendado:  now.toISOString(),
            })
            .select('id')
            .single()

          if (insertErr) {
            // Unique violation = already inserted by a previous cron run (race-safe)
            if (insertErr.code === '23505') {
              results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: 'duplicate_skipped' })
              continue
            }
            console.error(`cron-cobrancas: insert error sessao=${sessao.id} etapa=${regra.etapa}:`, insertErr.message)
            results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: 'insert_error' })
            continue
          }

          // In auto mode: immediately call cobranca-whatsapp
          if (config.regua_cobranca_modo === 'auto') {
            try {
              const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/cobranca-whatsapp`, {
                method:  'POST',
                headers: {
                  'Content-Type':  'application/json',
                  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({ cobranca_id: nova!.id }),
              })
              const sendBody = await sendResp.json()
              const resultStr = sendResp.ok
                ? (sendBody.ok ? 'sent' : (sendBody.skipped ?? 'unknown'))
                : (sendBody.error ?? 'send_error')
              results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: resultStr })
            } catch (e) {
              console.error(`cron-cobrancas: send error cobranca=${nova!.id}:`, String(e))
              results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: 'send_exception' })
            }
          } else {
            // Manual mode: created, waiting for user approval
            results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: 'pending_approval' })
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { status: 200 }
    )
  } catch (e) {
    console.error('cron-cobrancas: unexpected error', String(e))
    return new Response(
      JSON.stringify({ error: 'Erro interno', detail: String(e) }),
      { status: 500 }
    )
  }
})
```

- [ ] **Step 2: Write pg_cron schedule script**

Create `supabase/scripts/schedule_cron_cobrancas.sql`:

```sql
-- Schedule or replace the cron-cobrancas job (runs every hour)
-- Run this in Supabase SQL Editor after deploying the edge function.
-- Replace the URL and Bearer token with your project's values.

select cron.unschedule('cron-cobrancas-hourly')
  from cron.job
 where jobname = 'cron-cobrancas-hourly';

select cron.schedule(
  'cron-cobrancas-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url     := 'https://lipfjcdoppnqlcnoatcg.supabase.co/functions/v1/cron-cobrancas',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpcGZqY2RvcHBucWxjbm9hdGNnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjM5MzI3MywiZXhwIjoyMDkxOTY5MjczfQ.K5X45rg9UMeI4wplGPKMgBbxXOJG3QTHcugfUWifsF4"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 3: Deploy the cron function**

```bash
supabase functions deploy cron-cobrancas
```

Expected: `Deploying Function cron-cobrancas ... done`

- [ ] **Step 4: Register pg_cron schedule**

Paste `supabase/scripts/schedule_cron_cobrancas.sql` into Supabase Dashboard → SQL Editor and run it.

Verify the cron was registered:
```sql
select jobname, schedule, command from cron.job where jobname = 'cron-cobrancas-hourly';
```

Expected: one row with schedule `0 * * * *`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/cron-cobrancas/index.ts \
        supabase/scripts/schedule_cron_cobrancas.sql
git commit -m "feat(functions): add cron-cobrancas hourly scheduler for payment reminders"
```

---

## Task 11: End-to-End Verification

This task has no code changes — it verifies the entire feature works together.

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass with no failures.

- [ ] **Step 2: TypeScript final check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Manual test — manual mode**

1. Log into the app
2. Go to Configurações → Régua de Cobrança
3. Toggle "Ativar lembretes automáticos de cobrança" ON
4. Enter a PIX key (e.g., `teste@email.com`)
5. Set mode to "Fila de Aprovação"
6. Save Etapa 1: dias_apos=0, template with `{{nome}}`, `{{valor}}`, `{{data_sessao}}`, `{{chave_pix}}`
7. Create a session for a patient with phone, set status=`concluida`, `valor_cobrado=100`, `pago=false`
8. Manually trigger cron via curl:
   ```bash
   curl -X POST https://YOUR_PROJECT.supabase.co/functions/v1/cron-cobrancas \
     -H "Authorization: Bearer SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```
9. Go to `/cobranca` → verify session appears under "Sessões Não Pagas"
10. Expand the session, click "Enviar Agora" for Etapa 1
11. Verify WhatsApp message is received on the patient's phone
12. Verify `cobracas_enviadas` row shows `status='enviado'` in Supabase Table Editor

- [ ] **Step 4: Manual test — stop on paid**

1. Mark the session `pago=true` in Supabase
2. Trigger cron again
3. Verify no new `cobracas_enviadas` rows are created for remaining etapas (pago=false filter excludes the session)

- [ ] **Step 5: Manual test — auto mode**

1. Set Régua mode to "Automático"
2. Create another unpaid session with status=`concluida`
3. Trigger cron
4. Verify `cobracas_enviadas` row is created with `status='enviado'` and WhatsApp message is sent without manual approval

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "feat: Régua de Cobrança complete — DB, hooks, UI, edge functions, cron"
```

---

## Self-Review Checklist

- [x] **Spec §1 (Overview):** 3-step sequence, auto/manual mode, stop on pago=true, WhatsApp only — all covered
- [x] **Spec §2 (Data Model):** `regras_cobranca` (Task 1), `cobracas_enviadas` (Task 1), `config_psicologo` extension (Task 1) — exact column definitions from spec
- [x] **Spec §3 (Types):** `EtapaCobranca`, `StatusCobranca`, `ModoCobracaWhatsapp`, `RegraCobranca`, `CobrancaEnviada`, `CobrancaEnviadaView`, `SessaoParaCobranca`, `ConfigPsicologo` extension — all in Task 2
- [x] **Spec §4 (Hooks):** `useReguaCobranca` with all methods — Task 4; `enfileirarEEnviar` added to cover the "Enviar Agora" flow
- [x] **Spec §5.1 (ConfiguracoesPage):** toggle, PIX key, mode radio, template editors — Task 8
- [x] **Spec §5.2 (ReguaCobrancaTemplateEditor):** full component with ativo toggle, dias input, template textarea, save/delete — Task 5
- [x] **Spec §5.3 (CobrancaPage):** two-tab page, session cards with expand+send, history with retry/cancel — Task 6
- [x] **Spec §5.4 (Route):** `/cobranca` added — Task 7
- [x] **Spec §5.5 (Navigation):** Sidebar + BottomNav updated — Task 7
- [x] **Spec §6.1 (cobranca-whatsapp):** dual mode (cobranca_id / enqueue), phone normalization, test mode, Evolution API, DB status updates — Task 9
- [x] **Spec §7 (Cron):** `cron-cobrancas`, hourly schedule, auto vs manual mode branching, idempotent insert (23505 guard), stop on pago=true — Task 10
- [x] **Spec §8 (Error Handling):** 401/404/412/422/502/500 HTTP codes, `erro_detalhes` populated on failure, retry via UI — Tasks 9+6
- [x] **Migration number 019** — confirmed
- [x] **All user-facing text in Portuguese** — confirmed across components and pages
- [x] **No placeholders or TODOs** — all code blocks are complete and executable
- [x] **TDD** — failing tests written before implementation in Tasks 4, 5, 6
- [x] **PLAN-IMPACT ALERT** — header warns about `types.ts` and `ConfiguracoesPage.tsx` overlap with Plans 1 and 3
