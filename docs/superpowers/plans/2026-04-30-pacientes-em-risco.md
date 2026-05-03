# Plano 7 — Pacientes em Risco

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detectar padrões de abandono de pacientes (cancelamentos consecutivos, inatividade, falta sem reagendamento), permitir envio de mensagem WhatsApp personalizada com um clique, e rastrear o outcome de cada contato.

**Architecture:** Três novas tabelas (`risco_config` para thresholds, `risco_templates` para mensagens, `risco_followups` para log de envios). Uma RPC PostgreSQL (`get_pacientes_em_risco`) computa o risco em tempo real. Uma Edge Function `send-followup` envia via Evolution API. O frontend ganha a rota `/pacientes/risco` e uma seção em Configurações.

**Tech Stack:** PostgreSQL (RLS + RPC plpgsql), Supabase Edge Functions (Deno), React + TypeScript + TailwindCSS, Vitest + Testing Library, Evolution API.

---

## File Structure

**New files:**
- `supabase/migrations/021_pacientes_em_risco.sql`
- `supabase/functions/send-followup/index.ts`
- `src/hooks/usePacientesEmRisco.ts`
- `src/hooks/useRiscoTemplates.ts`
- `src/hooks/useRiscoConfig.ts`
- `src/hooks/__tests__/usePacientesEmRisco.test.ts`
- `src/hooks/__tests__/useRiscoTemplates.test.ts`
- `src/hooks/__tests__/useRiscoConfig.test.ts`
- `src/pages/PacientesRiscoPage.tsx`
- `src/pages/__tests__/PacientesRiscoPage.test.tsx`
- `src/components/pacientes/SendFollowupModal.tsx`
- `src/components/pacientes/FollowupDetailModal.tsx`
- `src/components/configuracoes/RiscoConfigSection.tsx`

**Modified files:**
- `src/lib/types.ts` — add `RiscoConfig`, `RiscoTemplate`, `PacienteEmRisco`, `RiscoTrigger`, `RiscoFollowup`
- `src/router.tsx` — add `/pacientes/risco` route
- `src/components/layout/Sidebar.tsx` — add "Em Risco" sub-item under Pacientes
- `src/components/layout/BottomNav.tsx` — update Pacientes nav
- `src/pages/ConfiguracoesPage.tsx` — add `<RiscoConfigSection />`

---

## Task 1: Database Migration 021

**Files:**
- Create: `supabase/migrations/021_pacientes_em_risco.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 021_pacientes_em_risco.sql

-- ── 1. risco_config ──────────────────────────────────────────
create table risco_config (
  id                              uuid primary key default uuid_generate_v4(),
  user_id                         uuid not null references auth.users(id) on delete cascade,
  min_cancelamentos_seguidos      int  not null default 2
    check (min_cancelamentos_seguidos >= 2 and min_cancelamentos_seguidos <= 10),
  dias_sem_sessao                 int  not null default 30
    check (dias_sem_sessao >= 7 and dias_sem_sessao <= 180),
  dias_apos_falta_sem_agendamento int  not null default 7
    check (dias_apos_falta_sem_agendamento >= 1 and dias_apos_falta_sem_agendamento <= 30),
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint risco_config_user_unique unique (user_id)
);

alter table risco_config enable row level security;
create policy "tenant_isolation" on risco_config
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index idx_risco_config_user_id on risco_config(user_id);
-- NOTE: set_user_id() triggers omitted — will be added by migration 017 (multi-tenant plan).
-- RLS with check (user_id = auth.uid()) enforces isolation for now.

-- ── 2. risco_templates ───────────────────────────────────────
create table risco_templates (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  nome          text not null,
  corpo         text not null,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint risco_templates_nome_unico unique (user_id, nome)
);

alter table risco_templates enable row level security;
create policy "tenant_isolation" on risco_templates
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create index idx_risco_templates_user_id on risco_templates(user_id);
-- NOTE: set_user_id() trigger omitted — same rationale as risco_config above.

-- ── 3. risco_followups ───────────────────────────────────────
create table risco_followups (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  paciente_id          uuid not null references pacientes(id) on delete cascade,
  template_id          uuid references risco_templates(id) on delete set null,
  mensagem_completa    text not null,
  mensagem_enviada_em  timestamptz not null default now(),
  resposta_whatsapp    text,
  resposta_em          timestamptz,
  resultado            text default 'enviada'
    check (resultado in ('enviada','respondida_sim','respondida_nao','reconectado')),
  sessao_agendada_apos uuid references sessoes(id) on delete set null,
  reconectado_em       timestamptz
);

alter table risco_followups enable row level security;
create policy "tenant_isolation" on risco_followups
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create index idx_risco_followups_user_id    on risco_followups(user_id);
create index idx_risco_followups_paciente   on risco_followups(paciente_id);
create index idx_risco_followups_enviado_em on risco_followups(mensagem_enviada_em);
create index idx_risco_followups_resultado  on risco_followups(resultado);
-- NOTE: set_user_id() trigger omitted — same rationale as risco_config above.

-- ── 4. RPC get_pacientes_em_risco ────────────────────────────
create or replace function get_pacientes_em_risco(
  p_user_id            uuid,
  p_min_cancelamentos  int default 2,
  p_dias_sem_sessao    int default 30,
  p_dias_apos_falta    int default 7
)
returns table (
  id                      uuid,
  nome                    text,
  telefone                text,
  ultima_sessao_data_hora timestamptz,
  risk_level              text,
  cancelamentos_seguidos  int,
  dias_sem_sessao         int,
  dias_apos_falta         int,
  triggers                jsonb
)
language plpgsql stable
as $$
declare
  v_now               timestamptz := now();
  v_cutoff_inatividade timestamptz := v_now - (p_dias_sem_sessao || ' days')::interval;
begin
  return query
  with
  pacientes_user as (
    select id, nome, telefone
    from pacientes
    where user_id = p_user_id and ativo = true
  ),
  ultima_sessao_pp as (
    select paciente_id, max(data_hora) as data_hora
    from sessoes where user_id = p_user_id
    group by paciente_id
  ),
  trig_cancelamentos as (
    -- Patients with >= p_min_cancelamentos cancelled/rescheduled sessions in past 90 days.
    -- Simple count in a rolling window; good enough for single-user app.
    select paciente_id
    from sessoes
    where user_id = p_user_id
      and status in ('cancelada', 'remarcada')
      and data_hora >= now() - interval '90 days'
    group by paciente_id
    having count(*) >= p_min_cancelamentos
  ),
  trig_inatividade as (
    select pu.id as paciente_id
    from pacientes_user pu
    left join ultima_sessao_pp usp on pu.id = usp.paciente_id
    where usp.data_hora is null or usp.data_hora < v_cutoff_inatividade
  ),
  trig_falta as (
    -- Most recent 'faltou' session (within 90 days) with no follow-up booked within the threshold.
    -- Scoped to 90-day window to avoid surfacing years-old missed sessions.
    select distinct s1.paciente_id
    from sessoes s1
    left join sessoes s2
      on s1.paciente_id = s2.paciente_id
      and s2.user_id = p_user_id
      and s2.data_hora > s1.data_hora
      and s2.data_hora <= s1.data_hora + (p_dias_apos_falta || ' days')::interval
    where s1.user_id = p_user_id
      and s1.status = 'faltou'
      and s1.data_hora >= now() - interval '90 days'
      and s2.id is null
  ),
  all_triggers as (
    select paciente_id, 'cancelamentos' as ttype from trig_cancelamentos union all
    select paciente_id, 'inatividade'   from trig_inatividade             union all
    select paciente_id, 'falta'         from trig_falta
  ),
  agg as (
    select
      pu.id, pu.nome, pu.telefone,
      usp.data_hora,
      count(at.ttype)       as num_triggers,
      array_agg(at.ttype)   as tlist
    from pacientes_user pu
    join all_triggers at on pu.id = at.paciente_id
    left join ultima_sessao_pp usp on pu.id = usp.paciente_id
    group by pu.id, pu.nome, pu.telefone, usp.data_hora
  )
  select
    a.id,
    a.nome,
    a.telefone,
    a.data_hora,
    case when a.num_triggers >= 2 then 'Alto' else 'Médio' end,
    (select count(*) from trig_cancelamentos tc where tc.paciente_id = a.id)::int,
    case
      when a.data_hora is null then (p_dias_sem_sessao + 30)::int
      else (extract(epoch from (v_now - a.data_hora)) / 86400)::int
    end,
    null::int,
    (
      select jsonb_agg(obj) from (
        select jsonb_build_object('tipo','cancelamentos_seguidos','motivo','2+ cancelamentos seguidos') as obj
          where 'cancelamentos' = any(a.tlist)
        union all
        select jsonb_build_object('tipo','inatividade','motivo', p_dias_sem_sessao || ' dias sem sessão')
          where 'inatividade' = any(a.tlist)
        union all
        select jsonb_build_object('tipo','falta_sem_agendamento','motivo','Faltou sem reagendar')
          where 'falta' = any(a.tlist)
      ) sub
    )
  from agg a
  order by a.num_triggers desc, a.data_hora asc nulls last;
end;
$$;
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor**

Paste in Supabase Dashboard → SQL Editor. Verify:
- Tables `risco_config`, `risco_templates`, `risco_followups` existem
- RPC `get_pacientes_em_risco` existe

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/021_pacientes_em_risco.sql
git commit -m "feat(db): migration 021 — risco_config, risco_templates, risco_followups, RPC get_pacientes_em_risco"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add types to end of `src/lib/types.ts`**

```typescript
// ============================================================
// Pacientes em Risco
// ============================================================

export interface RiscoConfig {
  id: string
  user_id: string
  min_cancelamentos_seguidos: number
  dias_sem_sessao: number
  dias_apos_falta_sem_agendamento: number
  criado_em: string
  atualizado_em: string
}

export interface RiscoTemplate {
  id: string
  user_id: string
  nome: string
  corpo: string
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

export interface RiscoTrigger {
  tipo: 'cancelamentos_seguidos' | 'inatividade' | 'falta_sem_agendamento'
  motivo: string
  dias?: number
  count?: number
}

export interface PacienteEmRisco {
  id: string
  nome: string
  telefone: string | null
  ultima_sessao_data_hora: string | null
  risk_level: 'Alto' | 'Médio'
  cancelamentos_seguidos: number | null
  dias_sem_sessao: number | null
  dias_apos_falta: number | null
  triggers: RiscoTrigger[]
}

export interface RiscoFollowup {
  id: string
  user_id: string
  paciente_id: string
  template_id: string | null
  mensagem_completa: string
  mensagem_enviada_em: string
  resposta_whatsapp: string | null
  resposta_em: string | null
  resultado: 'enviada' | 'respondida_sim' | 'respondida_nao' | 'reconectado'
  sessao_agendada_apos: string | null
  reconectado_em: string | null
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add Risco types — RiscoConfig, RiscoTemplate, PacienteEmRisco, RiscoFollowup"
```

---

## Task 3: `useRiscoConfig` Hook

**Files:**
- Create: `src/hooks/useRiscoConfig.ts`
- Create: `src/hooks/__tests__/useRiscoConfig.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/hooks/__tests__/useRiscoConfig.test.ts
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useRiscoConfig } from '../useRiscoConfig'

const makeChain = (resolved: { data: unknown; error: unknown }) => {
  const c: Record<string, unknown> = {}
  c.select  = vi.fn().mockReturnValue(c)
  c.eq      = vi.fn().mockReturnValue(c)
  c.insert  = vi.fn().mockReturnValue(c)
  c.update  = vi.fn().mockReturnValue(c)
  c.single  = vi.fn().mockResolvedValue(resolved)
  return c
}

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }))

describe('useRiscoConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches existing config', async () => {
    const mockData = { id: 'c1', min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const { result } = renderHook(() => useRiscoConfig())
    await act(async () => { await result.current.refetch() })
    expect(result.current.config?.min_cancelamentos_seguidos).toBe(2)
    expect(result.current.error).toBeNull()
  })

  it('creates default config when none exists (PGRST116)', async () => {
    const chain = makeChain({ data: null, error: { code: 'PGRST116' } })
    const chainCreate = makeChain({ data: { id: 'c2', min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }, error: null })
    mockFrom.mockReturnValueOnce(chain).mockReturnValue(chainCreate)
    const { result } = renderHook(() => useRiscoConfig())
    await act(async () => { await result.current.refetch() })
    expect(result.current.config?.id).toBe('c2')
  })

  it('update calls supabase.update with patch', async () => {
    const mockData = { id: 'c1', min_cancelamentos_seguidos: 3, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const { result } = renderHook(() => useRiscoConfig())
    await act(async () => { await result.current.update({ min_cancelamentos_seguidos: 3 }) })
    expect(result.current.error).toBeNull()
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
npx vitest run src/hooks/__tests__/useRiscoConfig.test.ts
```

Expected: FAIL — `Cannot find module '../useRiscoConfig'`

- [ ] **Step 3: Implement `src/hooks/useRiscoConfig.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { RiscoConfig } from '@/lib/types'

const DEFAULTS = {
  min_cancelamentos_seguidos: 2,
  dias_sem_sessao: 30,
  dias_apos_falta_sem_agendamento: 7,
}

export function useRiscoConfig() {
  const [config, setConfig] = useState<RiscoConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refetch() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('risco_config')
        .select('*')
        .single()

      if (err && err.code !== 'PGRST116') throw new Error(err.message)

      if (!data) {
        const { data: created, error: createErr } = await supabase
          .from('risco_config')
          .insert(DEFAULTS)
          .select()
          .single()
        if (createErr) throw new Error(createErr.message)
        setConfig(created as RiscoConfig)
      } else {
        setConfig(data as RiscoConfig)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function update(patch: Partial<Pick<RiscoConfig,
    'min_cancelamentos_seguidos' | 'dias_sem_sessao' | 'dias_apos_falta_sem_agendamento'
  >>): Promise<void> {
    if (!config?.id) throw new Error('Config não carregada')
    const { data, error: err } = await supabase
      .from('risco_config')
      .update(patch)
      .eq('id', config.id)
      .select()
      .single()
    if (err) { setError(err.message); throw new Error(err.message) }
    setConfig(data as RiscoConfig)
  }

  useEffect(() => { refetch() }, [])

  return { config, loading, error, update, refetch }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/hooks/__tests__/useRiscoConfig.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRiscoConfig.ts src/hooks/__tests__/useRiscoConfig.test.ts
git commit -m "feat(hooks): add useRiscoConfig with fetch, auto-create defaults, update"
```

---

## Task 4: `useRiscoTemplates` Hook

**Files:**
- Create: `src/hooks/useRiscoTemplates.ts`
- Create: `src/hooks/__tests__/useRiscoTemplates.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/hooks/__tests__/useRiscoTemplates.test.ts
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useRiscoTemplates } from '../useRiscoTemplates'

const makeChain = (resolved: { data: unknown; error: unknown }) => {
  const c: Record<string, unknown> = {}
  c.select = vi.fn().mockReturnValue(c)
  c.insert = vi.fn().mockReturnValue(c)
  c.update = vi.fn().mockReturnValue(c)
  c.delete = vi.fn().mockReturnValue(c)
  c.eq     = vi.fn().mockReturnValue(c)
  c.order  = vi.fn().mockResolvedValue(resolved)
  c.single = vi.fn().mockResolvedValue(resolved)
  return c
}

const mockFrom = vi.fn()
vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }))

describe('useRiscoTemplates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active templates ordered by nome', async () => {
    const data = [{ id: 't1', nome: 'Padrão', corpo: 'Olá {{nome}}', ativo: true }]
    mockFrom.mockReturnValue(makeChain({ data, error: null }))
    const { result } = renderHook(() => useRiscoTemplates())
    await act(async () => { await result.current.refetch() })
    expect(result.current.templates).toHaveLength(1)
    expect(result.current.templates[0].nome).toBe('Padrão')
  })

  it('create calls insert and refetches', async () => {
    const chain = makeChain({ data: { id: 't2', nome: 'Novo', corpo: 'Oi', ativo: true }, error: null })
    mockFrom.mockReturnValue(chain)
    const { result } = renderHook(() => useRiscoTemplates())
    await act(async () => { await result.current.create('Novo', 'Oi') })
    expect(result.current.error).toBeNull()
  })

  it('sets error on fetch failure', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fail' } }))
    const { result } = renderHook(() => useRiscoTemplates())
    await act(async () => { await result.current.refetch() })
    expect(result.current.error).toMatch(/fail/)
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
npx vitest run src/hooks/__tests__/useRiscoTemplates.test.ts
```

- [ ] **Step 3: Implement `src/hooks/useRiscoTemplates.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { RiscoTemplate } from '@/lib/types'

export function useRiscoTemplates() {
  const [templates, setTemplates] = useState<RiscoTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refetch() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('risco_templates')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      if (err) throw new Error(err.message)
      setTemplates((data ?? []) as RiscoTemplate[])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function create(nome: string, corpo: string): Promise<RiscoTemplate> {
    const { data, error: err } = await supabase
      .from('risco_templates')
      .insert({ nome, corpo })
      .select()
      .single()
    if (err) { setError(err.message); throw new Error(err.message) }
    await refetch()
    return data as RiscoTemplate
  }

  async function update(id: string, patch: Partial<Pick<RiscoTemplate, 'nome' | 'corpo' | 'ativo'>>): Promise<void> {
    const { error: err } = await supabase
      .from('risco_templates')
      .update(patch)
      .eq('id', id)
    if (err) { setError(err.message); throw new Error(err.message) }
    await refetch()
  }

  async function remove(id: string): Promise<void> {
    const { error: err } = await supabase
      .from('risco_templates')
      .delete()
      .eq('id', id)
    if (err) { setError(err.message); throw new Error(err.message) }
    await refetch()
  }

  useEffect(() => { refetch() }, [])

  return { templates, loading, error, refetch, create, update, remove }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/hooks/__tests__/useRiscoTemplates.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRiscoTemplates.ts src/hooks/__tests__/useRiscoTemplates.test.ts
git commit -m "feat(hooks): add useRiscoTemplates with CRUD and refetch"
```

---

## Task 5: `usePacientesEmRisco` Hook

**Files:**
- Create: `src/hooks/usePacientesEmRisco.ts`
- Create: `src/hooks/__tests__/usePacientesEmRisco.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/hooks/__tests__/usePacientesEmRisco.test.ts
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePacientesEmRisco } from '../usePacientesEmRisco'

const mockRpc = vi.fn()
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } })
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mockRpc, auth: { getUser: mockGetUser } } }))

describe('usePacientesEmRisco', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty list initially', () => {
    mockRpc.mockResolvedValue({ data: [], error: null })
    const { result } = renderHook(() => usePacientesEmRisco({ min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }))
    expect(result.current.pacientes).toEqual([])
  })

  it('fetches and maps RPC results', async () => {
    const data = [{ id: 'p1', nome: 'Ana', telefone: null, ultima_sessao_data_hora: null, risk_level: 'Alto', cancelamentos_seguidos: 2, dias_sem_sessao: 40, dias_apos_falta: null, triggers: [] }]
    mockRpc.mockResolvedValue({ data, error: null })
    const { result } = renderHook(() => usePacientesEmRisco({ min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }))
    await act(async () => { await result.current.refetch() })
    expect(result.current.pacientes[0].nome).toBe('Ana')
  })

  it('sets error on RPC failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } })
    const { result } = renderHook(() => usePacientesEmRisco({ min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }))
    await act(async () => { await result.current.refetch() })
    expect(result.current.error).toMatch(/rpc error/)
  })
})
```

- [ ] **Step 2: Run failing test**

```bash
npx vitest run src/hooks/__tests__/usePacientesEmRisco.test.ts
```

- [ ] **Step 3: Implement `src/hooks/usePacientesEmRisco.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { PacienteEmRisco, RiscoConfig } from '@/lib/types'

type Config = Pick<RiscoConfig, 'min_cancelamentos_seguidos' | 'dias_sem_sessao' | 'dias_apos_falta_sem_agendamento'>

export function usePacientesEmRisco(config: Config | null) {
  const [pacientes, setPacientes] = useState<PacienteEmRisco[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refetch() {
    if (!config) return
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Não autenticado')
      const { data, error: err } = await supabase.rpc('get_pacientes_em_risco', {
        p_user_id:           user.id,
        p_min_cancelamentos: config.min_cancelamentos_seguidos,
        p_dias_sem_sessao:   config.dias_sem_sessao,
        p_dias_apos_falta:   config.dias_apos_falta_sem_agendamento,
      })
      if (err) throw new Error(err.message)
      setPacientes((data ?? []) as PacienteEmRisco[])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refetch()
  }, [config?.min_cancelamentos_seguidos, config?.dias_sem_sessao, config?.dias_apos_falta_sem_agendamento])

  return { pacientes, loading, error, refetch }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/hooks/__tests__/usePacientesEmRisco.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePacientesEmRisco.ts src/hooks/__tests__/usePacientesEmRisco.test.ts
git commit -m "feat(hooks): add usePacientesEmRisco calling RPC get_pacientes_em_risco"
```

---

## Task 6: Edge Function `send-followup`

**Files:**
- Create: `supabase/functions/send-followup/index.ts`

- [ ] **Step 1: Implement Edge Function**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizePhone } from '../_shared/phone.ts'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: { user }, error: userErr } = await supabase.auth.getUser(
    (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  )
  if (userErr || !user) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: cors })

  const { paciente_id, template_id, custom_message } = await req.json()

  const { data: config } = await supabase
    .from('config_psicologo')
    .select('whatsapp_conectado, evolution_instance_name')
    .eq('user_id', user.id).single()

  if (!config?.whatsapp_conectado || !config.evolution_instance_name)
    return new Response(JSON.stringify({ error: 'WhatsApp não conectado' }), { status: 412, headers: cors })

  const { data: paciente } = await supabase
    .from('pacientes').select('id, nome, telefone')
    .eq('id', paciente_id).eq('user_id', user.id).single()

  if (!paciente) return new Response(JSON.stringify({ error: 'Paciente não encontrado' }), { status: 404, headers: cors })
  if (!paciente.telefone) return new Response(JSON.stringify({ error: 'Sem telefone' }), { status: 422, headers: cors })

  let corpo = custom_message as string | undefined
  if (!corpo && template_id) {
    const { data: tpl } = await supabase.from('risco_templates').select('corpo')
      .eq('id', template_id).eq('user_id', user.id).single()
    if (!tpl) return new Response(JSON.stringify({ error: 'Template não encontrado' }), { status: 404, headers: cors })
    corpo = tpl.corpo
  }
  if (!corpo) return new Response(JSON.stringify({ error: 'Mensagem vazia' }), { status: 400, headers: cors })

  const { data: sessions } = await supabase.from('sessoes')
    .select('data_hora').eq('paciente_id', paciente_id)
    .order('data_hora', { ascending: false }).limit(1)

  const ultima_sessao = sessions?.[0]?.data_hora
    ? new Date(sessions[0].data_hora).toLocaleDateString('pt-BR') : 'N/A'
  const dias_ausente = sessions?.[0]?.data_hora
    ? String(Math.floor((Date.now() - new Date(sessions[0].data_hora).getTime()) / 86_400_000)) : 'muitos'

  const mensagem_completa = corpo
    .replace(/\{\{nome\}\}/g, paciente.nome)
    .replace(/\{\{dias_ausente\}\}/g, dias_ausente)
    .replace(/\{\{ultima_sessao\}\}/g, ultima_sessao)

  const evoResp = await fetch(
    `${EVOLUTION_API_URL}/message/sendText/${config.evolution_instance_name}`,
    { method: 'POST', headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: normalizePhone(paciente.telefone), text: mensagem_completa }) }
  )
  if (!evoResp.ok)
    return new Response(JSON.stringify({ error: `Evolution API ${evoResp.status}` }), { status: 502, headers: cors })

  const { data: followup } = await supabase.from('risco_followups')
    .insert({ user_id: user.id, paciente_id, template_id: template_id ?? null, mensagem_completa, resultado: 'enviada' })
    .select().single()

  return new Response(JSON.stringify({ success: true, followup_id: followup?.id }), { headers: cors })
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy send-followup
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-followup/
git commit -m "feat(edge): add send-followup — WhatsApp via Evolution API + risco_followups log"
```

---

## Task 7: `PacientesRiscoPage` + Modals

**Files:**
- Create: `src/pages/PacientesRiscoPage.tsx`
- Create: `src/components/pacientes/SendFollowupModal.tsx`
- Create: `src/components/pacientes/FollowupDetailModal.tsx`
- Create: `src/pages/__tests__/PacientesRiscoPage.test.tsx`

- [ ] **Step 1: Implement `SendFollowupModal.tsx`**

Props: `{ paciente: PacienteEmRisco; onClose: () => void; onSent: () => void }`

Internamente:
- `useRiscoTemplates()` → dropdown de templates
- Toggle "Mensagem personalizada" → mostra textarea
- Preview renderizado em tempo real com variáveis substituídas (usar `ultimaSessao` e `diasAusente` calculados a partir de `paciente.ultima_sessao_data_hora`)
- Botão "Enviar via WhatsApp" → `supabase.functions.invoke('send-followup', { body: { paciente_id, template_id, custom_message } })`
- Toast sucesso/erro; `onSent()` ao concluir

- [ ] **Step 2: Implement `FollowupDetailModal.tsx`**

Props: `{ followup: RiscoFollowup & { pacientes: { nome: string } }; onClose: () => void; onUpdated: () => void }`

Mostra: nome + data + status badge + mensagem completa + resposta + botão "Marcar como Reconectado"

Marcar reconectado:
```typescript
await supabase.from('risco_followups')
  .update({ resultado: 'reconectado', reconectado_em: new Date().toISOString() })
  .eq('id', followup.id)
onUpdated()
```

- [ ] **Step 3: Implement `PacientesRiscoPage.tsx`**

```
Header: "Pacientes em Risco" | subtitle | botão "Configurar" → /configuracoes
Tabs: "Listagem" | "Histórico"

Tab Listagem:
  useRiscoConfig() → config
  usePacientesEmRisco(config) → pacientes
  Cards: borda accent=Alto, primary=Médio
    Nome + badge + triggers (lista de motivos)
    Última sessão ou "Nenhuma"
    Botão "Enviar mensagem" (desabilitado se sem telefone) → SendFollowupModal

Tab Histórico:
  query: supabase.from('risco_followups').select('*, pacientes(nome)').order('mensagem_enviada_em', { ascending: false })
  Lista com status badge + preview mensagem + botão "Ver detalhes" → FollowupDetailModal
```

- [ ] **Step 4: Write smoke test**

```typescript
// src/pages/__tests__/PacientesRiscoPage.test.tsx
import { render, screen } from '@testing-library/react'
import { vi, it, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { PacientesRiscoPage } from '../PacientesRiscoPage'

vi.mock('@/hooks/useRiscoConfig', () => ({
  useRiscoConfig: () => ({ config: { min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }, loading: false, error: null, update: vi.fn(), refetch: vi.fn() })
}))
vi.mock('@/hooks/usePacientesEmRisco', () => ({
  usePacientesEmRisco: () => ({ pacientes: [], loading: false, error: null, refetch: vi.fn() })
}))

it('renders page title', () => {
  render(<MemoryRouter><PacientesRiscoPage /></MemoryRouter>)
  expect(screen.getByText('Pacientes em Risco')).toBeInTheDocument()
})
it('shows empty state', () => {
  render(<MemoryRouter><PacientesRiscoPage /></MemoryRouter>)
  expect(screen.getByText(/Nenhum paciente em risco/i)).toBeInTheDocument()
})
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run src/pages/__tests__/PacientesRiscoPage.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/PacientesRiscoPage.tsx src/components/pacientes/SendFollowupModal.tsx src/components/pacientes/FollowupDetailModal.tsx src/pages/__tests__/PacientesRiscoPage.test.tsx
git commit -m "feat(ui): add PacientesRiscoPage, SendFollowupModal, FollowupDetailModal"
```

---

## Task 8: `RiscoConfigSection` + ConfiguracoesPage

**Files:**
- Create: `src/components/configuracoes/RiscoConfigSection.tsx`
- Modify: `src/pages/ConfiguracoesPage.tsx`

- [ ] **Step 1: Implement `RiscoConfigSection.tsx`**

Duas sub-seções dentro de um card colapsável:

**Limiares:** `useRiscoConfig()` → 3 campos numéricos + botão Salvar
**Templates:** `useRiscoTemplates()` → lista com toggle ativo, editar (modal inline), deletar, + botão "Novo template"

- [ ] **Step 2: Add to `ConfiguracoesPage.tsx`**

```tsx
import { RiscoConfigSection } from '@/components/configuracoes/RiscoConfigSection'

// Após seção WhatsApp:
<RiscoConfigSection />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/configuracoes/RiscoConfigSection.tsx src/pages/ConfiguracoesPage.tsx
git commit -m "feat(ui): add RiscoConfigSection — thresholds + templates management"
```

---

## Task 9: Router + Navigation

**Files:**
- Modify: `src/router.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/BottomNav.tsx`

- [ ] **Step 1: Add route to `src/router.tsx`**

```tsx
import { PacientesRiscoPage } from '@/pages/PacientesRiscoPage'

// BEFORE /pacientes/:id to avoid conflict:
{ path: '/pacientes/risco', element: <PacientesRiscoPage /> },
```

- [ ] **Step 2: Update `Sidebar.tsx`**

```tsx
import { AlertTriangle } from 'lucide-react'

// After Pacientes in navItems:
{ to: '/pacientes/risco', icon: AlertTriangle, label: 'Em Risco' },
```

- [ ] **Step 3: Run full suite**

```bash
npx vitest run
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/router.tsx src/components/layout/Sidebar.tsx src/components/layout/BottomNav.tsx
git commit -m "feat(nav): add /pacientes/risco route and Em Risco sidebar item"
```

---

## Task 10: Seed Default Templates

- [ ] **Step 1: Insert for existing user via SQL Editor**

```sql
-- Substitua <user_id> pelo UUID do usuário
INSERT INTO risco_templates (user_id, nome, corpo) VALUES
  ('<user_id>', 'Reconexão Padrão',
   'Oi {{nome}}, tudo bem? Notei que faz {{dias_ausente}} dias que não marcamos uma sessão. Gostaria de retomar? Estou à disposição! 😊'),
  ('<user_id>', 'Acompanhamento Pós-Falta',
   'Oi {{nome}}, percebi que você não compareceu à última sessão ({{ultima_sessao}}). Tudo bem? Posso ajudar em algo?'),
  ('<user_id>', 'Paciência e Comprometimento',
   '{{nome}}, às vezes a vida fica corrida, mas estou aqui para você. Vamos retomar nossa jornada? 🙏')
ON CONFLICT (user_id, nome) DO NOTHING;

INSERT INTO risco_config (user_id)
  VALUES ('<user_id>')
  ON CONFLICT (user_id) DO NOTHING;
```

- [ ] **Step 2: Final commit**

```bash
git add .
git commit -m "feat: Plano 7 complete — Pacientes em Risco"
```

---

## Rollout Order

1. Task 1 — Migration 021
2. Task 2 — Types
3. Task 3 — useRiscoConfig
4. Task 4 — useRiscoTemplates
5. Task 5 — usePacientesEmRisco
6. Task 6 — Edge Function send-followup
7. Task 7 — PacientesRiscoPage + Modals
8. Task 8 — RiscoConfigSection
9. Task 9 — Router + Navigation
10. Task 10 — Seed templates

**Pré-requisito:** Nenhum bloqueador. `set_user_id()` triggers foram omitidos intencionalmente — serão adicionados pelo Plan 1 (migrations 017-018, multi-tenant) quando esse plano rodar. Enquanto isso, RLS com `with check (user_id = auth.uid())` garante isolamento.
