# Modalidades Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `modalidades` table with two editable tables — `modalidades_sessao` (Individual / Casal / Família / Neurodivergente) and `meios_atendimento` (Presencial / Online / Domicílio) — across the full stack: migration, types, hooks, UI.

**Architecture:** Single migration backfills all existing rows with defaults (Individual + Presencial), then drops the old table. New hooks mirror the existing `useModalidades` pattern. Session cards show two emojis with hover tooltips. Patient and session forms gain two required selects that pre-fill from patient defaults.

**Tech Stack:** React + TypeScript + Vite, Supabase JS, Vitest + React Testing Library, react-hook-form + Zod, TailwindCSS

---

## File Map

| Action | File |
|--------|------|
| Create | `supabase/migrations/009_modalidades_split.sql` |
| Modify | `src/lib/types.ts` |
| Create | `src/hooks/useModalidadesSessao.ts` |
| Create | `src/hooks/__tests__/useModalidadesSessao.test.ts` |
| Create | `src/hooks/useMeiosAtendimento.ts` |
| Create | `src/hooks/__tests__/useMeiosAtendimento.test.ts` |
| Delete | `src/hooks/useModalidades.ts` |
| Delete | `src/hooks/__tests__/useModalidades.test.ts` |
| Modify | `src/hooks/usePacientes.ts` |
| Modify | `src/hooks/useKanban.ts` |
| Modify | `src/hooks/__tests__/useKanban.test.ts` |
| Modify | `src/hooks/useSessoesDia.ts` |
| Modify | `src/hooks/__tests__/useSessoesDia.test.ts` |
| Modify | `src/hooks/useSemana.ts` |
| Modify | `src/hooks/useFinanceiroPaciente.ts` |
| Modify | `src/hooks/__tests__/useFinanceiroPaciente.test.ts` |
| Modify | `src/hooks/usePacienteDetalhe.ts` |
| Modify | `src/hooks/__tests__/usePacienteDetalhe.test.ts` |
| Modify | `src/components/sessao/SessaoCard.tsx` |
| Modify | `src/components/sessao/NovaSessaoModal.tsx` |
| Modify | `src/pages/NovoPacientePage.tsx` |
| Modify | `src/pages/EditarPacientePage.tsx` |
| Delete | `src/pages/onboarding/StepModalidades.tsx` |
| Create | `src/pages/onboarding/StepAtendimento.tsx` |
| Modify | `src/pages/OnboardingPage.tsx` |
| Modify | `src/pages/__tests__/OnboardingPage.test.tsx` |
| Modify | `src/pages/ConfiguracoesPage.tsx` |

---

## Task 1: DB Migration

**File:** `supabase/migrations/009_modalidades_split.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- 009_modalidades_split.sql

-- 1. Create new tables
create table modalidades_sessao (
  id        uuid primary key default uuid_generate_v4(),
  nome      text not null,
  emoji     text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table meios_atendimento (
  id        uuid primary key default uuid_generate_v4(),
  nome      text not null,
  emoji     text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

-- 2. Seed defaults
insert into modalidades_sessao (nome, emoji) values
  ('Individual',      '👤'),
  ('Casal',           '👥'),
  ('Família',         '👨‍👩‍👧'),
  ('Neurodivergente', '🧩');

insert into meios_atendimento (nome, emoji) values
  ('Presencial', '🏥'),
  ('Online',     '💻'),
  ('Domicílio',  '🏠');

-- 3. Add nullable columns to pacientes and sessoes
alter table pacientes
  add column modalidade_sessao_id uuid references modalidades_sessao(id),
  add column meio_atendimento_id  uuid references meios_atendimento(id);

alter table sessoes
  add column modalidade_sessao_id uuid references modalidades_sessao(id),
  add column meio_atendimento_id  uuid references meios_atendimento(id);

alter table slots_semanais
  add column modalidade_sessao_id uuid references modalidades_sessao(id),
  add column meio_atendimento_id  uuid references meios_atendimento(id);

-- 4. Backfill all existing rows with Individual + Presencial
update pacientes
  set modalidade_sessao_id = (select id from modalidades_sessao where nome = 'Individual'),
      meio_atendimento_id  = (select id from meios_atendimento  where nome = 'Presencial');

update sessoes
  set modalidade_sessao_id = (select id from modalidades_sessao where nome = 'Individual'),
      meio_atendimento_id  = (select id from meios_atendimento  where nome = 'Presencial');

update slots_semanais
  set modalidade_sessao_id = (select id from modalidades_sessao where nome = 'Individual'),
      meio_atendimento_id  = (select id from meios_atendimento  where nome = 'Presencial');

-- 5. Enforce NOT NULL
alter table pacientes
  alter column modalidade_sessao_id set not null,
  alter column meio_atendimento_id  set not null;

alter table sessoes
  alter column modalidade_sessao_id set not null,
  alter column meio_atendimento_id  set not null;

alter table slots_semanais
  alter column modalidade_sessao_id set not null,
  alter column meio_atendimento_id  set not null;

-- 6. Drop old infrastructure
drop index if exists idx_sessoes_modalidade_id;
alter table sessoes       drop column modalidade_id;
alter table slots_semanais drop column modalidade_id;
drop table modalidades;

-- 7. Add indexes
create index idx_sessoes_modalidade_sessao_id   on sessoes(modalidade_sessao_id);
create index idx_sessoes_meio_atendimento_id    on sessoes(meio_atendimento_id);
create index idx_pacientes_modalidade_sessao_id on pacientes(modalidade_sessao_id);
create index idx_pacientes_meio_atendimento_id  on pacientes(meio_atendimento_id);

-- 8. RLS
alter table modalidades_sessao enable row level security;
alter table meios_atendimento  enable row level security;

create policy "auth users full access" on modalidades_sessao
  for all to authenticated using (true) with check (true);

create policy "auth users full access" on meios_atendimento
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Apply migration in Supabase Studio**

Open Supabase Studio → SQL Editor → paste the file contents → Run.
Expected: no errors, all statements succeed.

- [ ] **Step 3: Verify in Supabase Studio**

Run: `select count(*) from modalidades_sessao;` → expect `4`
Run: `select count(*) from meios_atendimento;` → expect `3`
Run: `select modalidade_sessao_id, meio_atendimento_id from sessoes limit 3;` → both columns populated (non-null UUIDs)
Run: `select * from modalidades;` → expect error "relation modalidades does not exist"

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/009_modalidades_split.sql
git commit -m "feat(db): split modalidades into modalidades_sessao + meios_atendimento"
```

---

## Task 2: TypeScript Types

**File:** `src/lib/types.ts`

- [ ] **Step 1: Write the failing type check**

Run: `npx tsc --noEmit`
Expected: 0 errors (baseline before changes — confirm it's clean first).

- [ ] **Step 2: Update types.ts**

Make these changes (full replacements within the file):

**Remove** the `Modalidade` interface:
```typescript
// DELETE this block entirely:
export interface Modalidade {
  id: string
  nome: string
  ativo: boolean
}
```

**Add** new interfaces after the `ContratoTipo` line:
```typescript
export interface ModalidadeSessao {
  id: string
  nome: string
  emoji: string
  ativo: boolean
}

export interface MeioAtendimento {
  id: string
  nome: string
  emoji: string
  ativo: boolean
}
```

**Update** `Paciente` — add two new required fields:
```typescript
export interface Paciente {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  data_nascimento: string | null
  ativo: boolean
  tipo: 'particular' | 'convenio'
  convenio_id: string | null
  modalidade_sessao_id: string
  meio_atendimento_id: string
  criado_em: string
}
```

**Update** `Sessao` — replace `modalidade_id` with two new required fields:
```typescript
export interface Sessao {
  id: string
  paciente_id: string | null
  avulso_nome: string | null
  avulso_telefone: string | null
  modalidade_sessao_id: string
  meio_atendimento_id: string
  data_hora: string
  status: SessaoStatus
  valor_cobrado: number | null
  pago: boolean
  forma_pagamento: string | null
  data_pagamento: string | null
  remarcada_para: string | null
  sessao_origem_id: string | null
  duracao_minutos: number
  criado_em: string
}
```

**Update** `SlotSemanal` and `SlotSemanalInput`:
```typescript
export interface SlotSemanal {
  id: string
  paciente_id: string
  nome: string | null
  dia_semana: number
  horario: string
  modalidade_sessao_id: string
  meio_atendimento_id: string
  is_pacote: boolean
  ativo: boolean
  criado_em: string
}

export interface SlotSemanalInput {
  nome: string
  dia_semana: number
  horario: string
  modalidade_sessao_id: string
  meio_atendimento_id: string
  is_pacote: boolean
}
```

**Update** `SessaoComModalidade` and `SessaoView` type aliases:
```typescript
export type SessaoComModalidade = Sessao & {
  modalidades_sessao: { nome: string; emoji: string } | null
  meios_atendimento:  { nome: string; emoji: string } | null
}

export type SessaoView = Sessao & {
  modalidades_sessao: { nome: string; emoji: string } | null
  meios_atendimento:  { nome: string; emoji: string } | null
  pacientes: { nome: string } | null
}
```

**Update** `PacienteComConvenio`:
```typescript
export type PacienteComConvenio = Paciente & {
  convenios: { nome: string; valor_sessao: number | null } | null
  modalidades_sessao?: { nome: string; emoji: string } | null
  meios_atendimento?:  { nome: string; emoji: string } | null
}
```

- [ ] **Step 3: Run type check — expect errors (RED)**

```bash
npx tsc --noEmit 2>&1 | head -50
```
Expected: many errors about `modalidade_id`, `Modalidade`, missing new fields. This confirms the types are driving the refactor.

- [ ] **Step 4: Commit types (will be fixed as tasks complete)**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add ModalidadeSessao + MeioAtendimento, update Sessao/Paciente/SlotSemanal"
```

---

## Task 3: useModalidadesSessao hook

**Files:**
- Create: `src/hooks/useModalidadesSessao.ts`
- Create: `src/hooks/__tests__/useModalidadesSessao.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useModalidadesSessao.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useModalidadesSessao } from '../useModalidadesSessao'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

function buildChain(overrides: Record<string, any> = {}) {
  const base: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  }
  return base
}

describe('useModalidadesSessao', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active modalidades ordered by nome', async () => {
    const mock = [{ id: 'ms-1', nome: 'Individual', emoji: '👤', ativo: true }]
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mock, error: null }) })
    )

    const { result } = renderHook(() => useModalidadesSessao())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.modalidadesSessao).toEqual(mock)
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('modalidades_sessao')
  })

  it('addModalidadeSessao inserts with nome and emoji then refetches', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
      }
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    })

    const { result } = renderHook(() => useModalidadesSessao())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addModalidadeSessao('Grupo', '🧑‍🤝‍🧑')
    })

    expect(supabase.from).toHaveBeenCalledWith('modalidades_sessao')
  })

  it('toggleAtivo updates ativo field by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy, order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    const { result } = renderHook(() => useModalidadesSessao())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleAtivo('ms-1', false)
    })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'ms-1')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (RED)**

```bash
npx vitest run src/hooks/__tests__/useModalidadesSessao.test.ts
```
Expected: FAIL — "Cannot find module '../useModalidadesSessao'"

- [ ] **Step 3: Create the hook**

Create `src/hooks/useModalidadesSessao.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ModalidadeSessao } from '@/lib/types'

export function useModalidadesSessao() {
  const [modalidadesSessao, setModalidadesSessao] = useState<ModalidadeSessao[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchModalidadesSessao() {
    const { data } = await supabase
      .from('modalidades_sessao')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    setModalidadesSessao(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchModalidadesSessao()
  }, [])

  async function addModalidadeSessao(nome: string, emoji: string): Promise<void> {
    const { error } = await supabase
      .from('modalidades_sessao')
      .insert({ nome: nome.trim(), emoji: emoji.trim(), ativo: true })
    if (error) throw error
    await fetchModalidadesSessao()
  }

  async function toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase
      .from('modalidades_sessao')
      .update({ ativo })
      .eq('id', id)
    if (error) throw error
    await fetchModalidadesSessao()
  }

  return { modalidadesSessao, loading, addModalidadeSessao, toggleAtivo }
}
```

- [ ] **Step 4: Run test — expect PASS (GREEN)**

```bash
npx vitest run src/hooks/__tests__/useModalidadesSessao.test.ts
```
Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useModalidadesSessao.ts src/hooks/__tests__/useModalidadesSessao.test.ts
git commit -m "feat(hooks): add useModalidadesSessao with tests"
```

---

## Task 4: useMeiosAtendimento hook

**Files:**
- Create: `src/hooks/useMeiosAtendimento.ts`
- Create: `src/hooks/__tests__/useMeiosAtendimento.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useMeiosAtendimento.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useMeiosAtendimento } from '../useMeiosAtendimento'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

function buildChain(overrides: Record<string, any> = {}) {
  const base: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  }
  return base
}

describe('useMeiosAtendimento', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active meios ordered by nome', async () => {
    const mock = [{ id: 'ma-1', nome: 'Presencial', emoji: '🏥', ativo: true }]
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mock, error: null }) })
    )

    const { result } = renderHook(() => useMeiosAtendimento())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.meiosAtendimento).toEqual(mock)
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('meios_atendimento')
  })

  it('addMeioAtendimento inserts with nome and emoji then refetches', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
      }
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    })

    const { result } = renderHook(() => useMeiosAtendimento())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addMeioAtendimento('Híbrido', '🔀')
    })

    expect(supabase.from).toHaveBeenCalledWith('meios_atendimento')
  })

  it('toggleAtivo updates ativo field by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy, order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    const { result } = renderHook(() => useMeiosAtendimento())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleAtivo('ma-1', false)
    })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'ma-1')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (RED)**

```bash
npx vitest run src/hooks/__tests__/useMeiosAtendimento.test.ts
```
Expected: FAIL — "Cannot find module '../useMeiosAtendimento'"

- [ ] **Step 3: Create the hook**

Create `src/hooks/useMeiosAtendimento.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { MeioAtendimento } from '@/lib/types'

export function useMeiosAtendimento() {
  const [meiosAtendimento, setMeiosAtendimento] = useState<MeioAtendimento[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchMeiosAtendimento() {
    const { data } = await supabase
      .from('meios_atendimento')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    setMeiosAtendimento(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMeiosAtendimento()
  }, [])

  async function addMeioAtendimento(nome: string, emoji: string): Promise<void> {
    const { error } = await supabase
      .from('meios_atendimento')
      .insert({ nome: nome.trim(), emoji: emoji.trim(), ativo: true })
    if (error) throw error
    await fetchMeiosAtendimento()
  }

  async function toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase
      .from('meios_atendimento')
      .update({ ativo })
      .eq('id', id)
    if (error) throw error
    await fetchMeiosAtendimento()
  }

  return { meiosAtendimento, loading, addMeioAtendimento, toggleAtivo }
}
```

- [ ] **Step 4: Run test — expect PASS (GREEN)**

```bash
npx vitest run src/hooks/__tests__/useMeiosAtendimento.test.ts
```
Expected: 3 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useMeiosAtendimento.ts src/hooks/__tests__/useMeiosAtendimento.test.ts
git commit -m "feat(hooks): add useMeiosAtendimento with tests"
```

---

## Task 5: Delete useModalidades, update usePacientes

**Files:**
- Delete: `src/hooks/useModalidades.ts`
- Delete: `src/hooks/__tests__/useModalidades.test.ts`
- Modify: `src/hooks/usePacientes.ts`

- [ ] **Step 1: Delete the old hook and its test**

```bash
rm src/hooks/useModalidades.ts src/hooks/__tests__/useModalidades.test.ts
```

- [ ] **Step 2: Update usePacientes.ts — swap join**

In `src/hooks/usePacientes.ts`, find the `.select(...)` string that includes `modalidades(nome)` or similar and replace the join. The select string should become:

```typescript
.select('*, convenios(nome, valor_sessao), modalidades_sessao(nome, emoji), meios_atendimento(nome, emoji)')
```

Also update the `createPaciente` and `updatePaciente` functions to accept and persist `modalidade_sessao_id` and `meio_atendimento_id`. Add them to the input type (the patch object for update, and the insert object for create).

Find the `createPaciente` function and ensure it includes the two new fields:

```typescript
async function createPaciente(input: {
  nome: string
  telefone?: string | null
  email?: string | null
  data_nascimento?: string | null
  tipo: 'particular' | 'convenio'
  convenio_id?: string | null
  modalidade_sessao_id: string
  meio_atendimento_id: string
}): Promise<string> {
  const { data, error } = await supabase
    .from('pacientes')
    .insert({
      nome: input.nome,
      telefone: input.telefone ?? null,
      email: input.email ?? null,
      data_nascimento: input.data_nascimento ?? null,
      tipo: input.tipo,
      convenio_id: input.convenio_id ?? null,
      modalidade_sessao_id: input.modalidade_sessao_id,
      meio_atendimento_id: input.meio_atendimento_id,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}
```

Find `updatePaciente` and extend the patch type to include the two new fields:

```typescript
async function updatePaciente(
  id: string,
  patch: Partial<Pick<Paciente,
    'nome' | 'telefone' | 'email' | 'data_nascimento' | 'tipo' | 'convenio_id' |
    'modalidade_sessao_id' | 'meio_atendimento_id'
  >>
): Promise<void>
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "useModalidades\|useModalidade" | head -20
```
Expected: no errors referencing `useModalidades` (those files are gone).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePacientes.ts
git rm src/hooks/useModalidades.ts src/hooks/__tests__/useModalidades.test.ts
git commit -m "refactor(hooks): delete useModalidades, update usePacientes to join new tables"
```

---

## Task 6: Update session query hooks

**Files:**
- Modify: `src/hooks/useKanban.ts` + `src/hooks/__tests__/useKanban.test.ts`
- Modify: `src/hooks/useSessoesDia.ts` + `src/hooks/__tests__/useSessoesDia.test.ts`
- Modify: `src/hooks/useSemana.ts`
- Modify: `src/hooks/useFinanceiroPaciente.ts` + `src/hooks/__tests__/useFinanceiroPaciente.test.ts`
- Modify: `src/hooks/usePacienteDetalhe.ts` + `src/hooks/__tests__/usePacienteDetalhe.test.ts`

- [ ] **Step 1: Update tests first (RED)**

In each test file, find any mock that returns a `modalidades` joined object (e.g., `{ modalidades: { nome: 'Presencial' } }`) and replace with the two new joins:

```typescript
// Replace:
{ modalidades: { nome: 'Presencial' } }

// With:
{ modalidades_sessao: { nome: 'Individual', emoji: '👤' }, meios_atendimento: { nome: 'Presencial', emoji: '🏥' } }
```

Do this in:
- `src/hooks/__tests__/useKanban.test.ts`
- `src/hooks/__tests__/useSessoesDia.test.ts`
- `src/hooks/__tests__/useFinanceiroPaciente.test.ts`
- `src/hooks/__tests__/usePacienteDetalhe.test.ts`

- [ ] **Step 2: Run affected tests — expect FAIL (RED)**

```bash
npx vitest run src/hooks/__tests__/useKanban.test.ts src/hooks/__tests__/useSessoesDia.test.ts
```
Expected: failures on type mismatches.

- [ ] **Step 3: Update useKanban.ts**

In `src/hooks/useKanban.ts`, replace the select string:

```typescript
// Before:
.select('*, modalidades(nome), pacientes(nome)')

// After:
.select('*, modalidades_sessao(nome, emoji), meios_atendimento(nome, emoji), pacientes(nome)')
```

- [ ] **Step 4: Update useSessoesDia.ts**

In `src/hooks/useSessoesDia.ts`, replace:

```typescript
// Before:
.select('*, modalidades(nome), pacientes(nome)')

// After:
.select('*, modalidades_sessao(nome, emoji), meios_atendimento(nome, emoji), pacientes(nome)')
```

- [ ] **Step 5: Update useSemana.ts**

In `src/hooks/useSemana.ts`, replace:

```typescript
// Before:
.select('*, modalidades(nome), pacientes(nome)')

// After:
.select('*, modalidades_sessao(nome, emoji), meios_atendimento(nome, emoji), pacientes(nome)')
```

- [ ] **Step 6: Update useFinanceiroPaciente.ts**

Find the `sessoes` select query in `src/hooks/useFinanceiroPaciente.ts` and replace `modalidades(nome)` with `modalidades_sessao(nome, emoji), meios_atendimento(nome, emoji)`.

- [ ] **Step 7: Update usePacienteDetalhe.ts**

Find the `sessoes` select query in `src/hooks/usePacienteDetalhe.ts` and make the same replacement.

- [ ] **Step 8: Run all affected tests — expect PASS (GREEN)**

```bash
npx vitest run src/hooks/__tests__/useKanban.test.ts src/hooks/__tests__/useSessoesDia.test.ts src/hooks/__tests__/useFinanceiroPaciente.test.ts src/hooks/__tests__/usePacienteDetalhe.test.ts
```
Expected: all passing.

- [ ] **Step 9: Commit**

```bash
git add src/hooks/useKanban.ts src/hooks/__tests__/useKanban.test.ts \
        src/hooks/useSessoesDia.ts src/hooks/__tests__/useSessoesDia.test.ts \
        src/hooks/useSemana.ts \
        src/hooks/useFinanceiroPaciente.ts src/hooks/__tests__/useFinanceiroPaciente.test.ts \
        src/hooks/usePacienteDetalhe.ts src/hooks/__tests__/usePacienteDetalhe.test.ts
git commit -m "refactor(hooks): swap modalidades join for modalidades_sessao + meios_atendimento in all session hooks"
```

---

## Task 7: SessaoCard — emoji display

**File:** `src/components/sessao/SessaoCard.tsx`

- [ ] **Step 1: Update SessaoCard**

In `src/components/sessao/SessaoCard.tsx`, replace the existing modalidade display line:

```typescript
// Before (around line 42):
{sessao.modalidades?.nome && (
  <span className="text-xs text-muted">· {sessao.modalidades.nome}</span>
)}

// After:
<span className="inline-flex gap-1 ml-1">
  {sessao.modalidades_sessao?.emoji && (
    <span title={sessao.modalidades_sessao.nome} className="text-sm cursor-default">
      {sessao.modalidades_sessao.emoji}
    </span>
  )}
  {sessao.meios_atendimento?.emoji && (
    <span title={sessao.meios_atendimento.nome} className="text-sm cursor-default">
      {sessao.meios_atendimento.emoji}
    </span>
  )}
</span>
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "SessaoCard" | head -10
```
Expected: no errors on SessaoCard.

- [ ] **Step 3: Commit**

```bash
git add src/components/sessao/SessaoCard.tsx
git commit -m "feat(ui): replace modalidade text badge with dual emoji + tooltip in SessaoCard"
```

---

## Task 8: NovaSessaoModal — two new selects

**File:** `src/components/sessao/NovaSessaoModal.tsx`

- [ ] **Step 1: Update schema**

In `src/components/sessao/NovaSessaoModal.tsx`, replace the schema:

```typescript
// Remove:
modalidade_id: z.string().min(1, 'Selecione a modalidade'),

// Add:
modalidade_sessao_id: z.string().min(1, 'Selecione a modalidade de sessão'),
meio_atendimento_id:  z.string().min(1, 'Selecione o meio de atendimento'),
```

- [ ] **Step 2: Update imports and hook usage**

Replace `useModalidades` import with the two new hooks:

```typescript
// Remove:
import { useModalidades } from '@/hooks/useModalidades'

// Add:
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
```

Inside the component, replace:

```typescript
// Remove:
const { modalidades } = useModalidades()

// Add:
const { modalidadesSessao } = useModalidadesSessao()
const { meiosAtendimento } = useMeiosAtendimento()
```

- [ ] **Step 3: Add pre-fill effect for patient defaults**

After the existing `useEffect` for convenio value, add:

```typescript
useEffect(() => {
  if (tipo === 'paciente' && pacienteSelecionado) {
    setValue('modalidade_sessao_id', pacienteSelecionado.modalidade_sessao_id)
    setValue('meio_atendimento_id',  pacienteSelecionado.meio_atendimento_id)
  }
}, [pacienteId, tipo])
```

- [ ] **Step 4: Update the insert payload**

In the `onSubmit` function, replace `modalidade_id: data.modalidade_id` with:

```typescript
modalidade_sessao_id: data.modalidade_sessao_id,
meio_atendimento_id:  data.meio_atendimento_id,
```

- [ ] **Step 5: Replace the modalidade select in JSX**

Find the single modalidade `<select>` in the JSX and replace with two selects. Place them side by side in a `<div className="grid grid-cols-2 gap-3">`:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-[#1C1C1C]">
      Modalidade <span className="text-[#E07070]">*</span>
    </label>
    <select
      {...register('modalidade_sessao_id')}
      className={`${inputClass} ${errors.modalidade_sessao_id ? 'border-[#E07070]' : ''}`}
    >
      <option value="">Selecione...</option>
      {modalidadesSessao.map(m => (
        <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
      ))}
    </select>
    {errors.modalidade_sessao_id && (
      <span className="text-xs text-[#E07070]">{errors.modalidade_sessao_id.message}</span>
    )}
  </div>

  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-[#1C1C1C]">
      Meio <span className="text-[#E07070]">*</span>
    </label>
    <select
      {...register('meio_atendimento_id')}
      className={`${inputClass} ${errors.meio_atendimento_id ? 'border-[#E07070]' : ''}`}
    >
      <option value="">Selecione...</option>
      {meiosAtendimento.map(m => (
        <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
      ))}
    </select>
    {errors.meio_atendimento_id && (
      <span className="text-xs text-[#E07070]">{errors.meio_atendimento_id.message}</span>
    )}
  </div>
</div>
```

- [ ] **Step 6: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep "NovaSessaoModal" | head -10
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/sessao/NovaSessaoModal.tsx
git commit -m "feat(ui): replace modalidade select with modalidade_sessao + meio_atendimento in NovaSessaoModal"
```

---

## Task 9: NovoPacientePage + EditarPacientePage

**Files:**
- Modify: `src/pages/NovoPacientePage.tsx`
- Modify: `src/pages/EditarPacientePage.tsx`

- [ ] **Step 1: Update NovoPacientePage schema**

In `src/pages/NovoPacientePage.tsx`, add two fields to the zod schema and remove the old `modalidade_id` references from `SlotSemanalInput` usage:

In the schema object, add:
```typescript
modalidade_sessao_id: z.string().min(1, 'Selecione a modalidade de sessão'),
meio_atendimento_id:  z.string().min(1, 'Selecione o meio de atendimento'),
```

- [ ] **Step 2: Update SlotSemanalInput usage in NovoPacientePage**

The `gerarSessoesParaSlot` helper uses `slot.modalidade_id`. Update it to use both new fields:

```typescript
function gerarSessoesParaSlot(pacienteId: string, slot: SlotSemanalInput, semanas = 8) {
  const hoje = startOfDay(new Date())
  const [hh, mm] = slot.horario.split(':').map(Number)
  const dia = slot.dia_semana as Day
  const inicio = getDay(hoje) === dia ? hoje : nextDay(hoje, dia)
  const pagoAutomatico = slot.is_pacote
  return Array.from({ length: semanas }, (_, i) => {
    const base = addWeeks(inicio, i)
    return {
      paciente_id: pacienteId,
      avulso_nome: null,
      avulso_telefone: null,
      modalidade_sessao_id: slot.modalidade_sessao_id,
      meio_atendimento_id:  slot.meio_atendimento_id,
      data_hora: setMinutes(setHours(base, hh), mm).toISOString(),
      status: 'agendada' as SessaoStatus,
      valor_cobrado: null,
      pago: pagoAutomatico,
      data_pagamento: pagoAutomatico ? new Date().toISOString() : null,
      remarcada_para: null,
      sessao_origem_id: null,
      duracao_minutos: 50,
    }
  })
}
```

- [ ] **Step 3: Update NovoPacientePage imports and hooks**

Replace `useModalidades` with the two new hooks:

```typescript
// Remove:
import { useModalidades } from '@/hooks/useModalidades'

// Add:
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
```

Inside the component replace:
```typescript
// Remove:
const { modalidades } = useModalidades()

// Add:
const { modalidadesSessao } = useModalidadesSessao()
const { meiosAtendimento } = useMeiosAtendimento()
```

- [ ] **Step 4: Update the createPaciente call in NovoPacientePage**

In the `onSubmit` function, add the two new fields to the `createPaciente` call:

```typescript
const pacienteId = await createPaciente({
  nome: data.nome,
  telefone: data.telefone || null,
  email: data.email || null,
  data_nascimento: data.data_nascimento || null,
  tipo: data.tipo,
  convenio_id: data.tipo === 'convenio' ? data.convenio_id! : null,
  modalidade_sessao_id: data.modalidade_sessao_id,
  meio_atendimento_id:  data.meio_atendimento_id,
})
```

- [ ] **Step 5: Add two selects to NovoPacientePage JSX**

After the tipo/convênio section, add:

```tsx
<div className="grid grid-cols-2 gap-3">
  <div className="flex flex-col gap-1">
    <FieldLabel required>Modalidade de sessão</FieldLabel>
    <select
      {...register('modalidade_sessao_id')}
      className={selectClass}
    >
      <option value="">Selecione...</option>
      {modalidadesSessao.map(m => (
        <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
      ))}
    </select>
    <FieldError message={errors.modalidade_sessao_id?.message} />
  </div>

  <div className="flex flex-col gap-1">
    <FieldLabel required>Meio de atendimento</FieldLabel>
    <select
      {...register('meio_atendimento_id')}
      className={selectClass}
    >
      <option value="">Selecione...</option>
      {meiosAtendimento.map(m => (
        <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
      ))}
    </select>
    <FieldError message={errors.meio_atendimento_id?.message} />
  </div>
</div>
```

- [ ] **Step 6: Update the slot row in NovoPacientePage**

In the slots section, each slot row also had a `modalidade_id` select. Replace with two compacts (or combine them in a single `<select>` pair). In each slot, change the `modalidade_id` field to `modalidade_sessao_id` and add `meio_atendimento_id`, mirroring the form's patient-level selects. Update the `slots` state type from `SlotSemanalInput[]` accordingly.

- [ ] **Step 7: Update EditarPacientePage**

In `src/pages/EditarPacientePage.tsx`:

Add to schema:
```typescript
modalidade_sessao_id: z.string().min(1, 'Selecione a modalidade de sessão'),
meio_atendimento_id:  z.string().min(1, 'Selecione o meio de atendimento'),
```

Add imports:
```typescript
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
```

Add hook calls inside the component:
```typescript
const { modalidadesSessao } = useModalidadesSessao()
const { meiosAtendimento } = useMeiosAtendimento()
```

In the `useEffect` that calls `reset(...)`, add the two new fields:
```typescript
reset({
  // ...existing fields...
  modalidade_sessao_id: paciente.modalidade_sessao_id,
  meio_atendimento_id:  paciente.meio_atendimento_id,
})
```

In `onSubmit`, add to the `updatePaciente` patch:
```typescript
modalidade_sessao_id: data.modalidade_sessao_id,
meio_atendimento_id:  data.meio_atendimento_id,
```

Add the same two-column select JSX as in NovoPacientePage (after the tipo/convênio section).

- [ ] **Step 8: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep -E "NovoPaciente|EditarPaciente" | head -20
```
Expected: no errors on these files.

- [ ] **Step 9: Commit**

```bash
git add src/pages/NovoPacientePage.tsx src/pages/EditarPacientePage.tsx
git commit -m "feat(ui): add modalidade_sessao + meio_atendimento selects to patient forms"
```

---

## Task 10: Replace StepModalidades with StepAtendimento

**Files:**
- Delete: `src/pages/onboarding/StepModalidades.tsx`
- Create: `src/pages/onboarding/StepAtendimento.tsx`
- Modify: `src/pages/OnboardingPage.tsx`
- Modify: `src/pages/__tests__/OnboardingPage.test.tsx`

- [ ] **Step 1: Update OnboardingPage test first (RED)**

In `src/pages/__tests__/OnboardingPage.test.tsx`, find any reference to `StepModalidades` or the old "Modalidades" heading and replace with `StepAtendimento` / "Tipo de sessão". Example:

```typescript
// Before:
expect(screen.getByText(/modalidades/i)).toBeInTheDocument()

// After:
expect(screen.getByText(/tipo de sessão/i)).toBeInTheDocument()
```

Run:
```bash
npx vitest run src/pages/__tests__/OnboardingPage.test.tsx
```
Expected: FAIL (still importing StepModalidades).

- [ ] **Step 2: Create StepAtendimento**

Delete `src/pages/onboarding/StepModalidades.tsx`.

Create `src/pages/onboarding/StepAtendimento.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, X } from 'lucide-react'

interface ItemConfig {
  nome: string
  emoji: string
}

interface Props {
  onNext: (modalidades: ItemConfig[], meios: ItemConfig[]) => void
  onBack: () => void
}

const DEFAULT_MODALIDADES: ItemConfig[] = [
  { nome: 'Individual',      emoji: '👤' },
  { nome: 'Casal',           emoji: '👥' },
  { nome: 'Família',         emoji: '👨‍👩‍👧' },
  { nome: 'Neurodivergente', emoji: '🧩' },
]

const DEFAULT_MEIOS: ItemConfig[] = [
  { nome: 'Presencial', emoji: '🏥' },
  { nome: 'Online',     emoji: '💻' },
  { nome: 'Domicílio',  emoji: '🏠' },
]

function ItemList({
  title,
  items,
  onAdd,
  onRemove,
}: {
  title: string
  items: ItemConfig[]
  onAdd: (nome: string, emoji: string) => void
  onRemove: (nome: string) => void
}) {
  const [novoNome, setNovoNome] = useState('')
  const [novoEmoji, setNovoEmoji] = useState('')

  function handleAdd() {
    const nome = novoNome.trim()
    const emoji = novoEmoji.trim() || '📋'
    if (nome && !items.find(i => i.nome === nome)) {
      onAdd(nome, emoji)
      setNovoNome('')
      setNovoEmoji('')
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-[#1C1C1C]">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map(item => (
          <Badge
            key={item.nome}
            className="bg-primary-light text-primary flex items-center gap-1 px-3 py-1"
          >
            {item.emoji} {item.nome}
            <button
              type="button"
              onClick={() => onRemove(item.nome)}
              className="ml-1 hover:text-accent transition-colors"
            >
              <X size={12} />
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="Emoji"
          value={novoEmoji}
          onChange={e => setNovoEmoji(e.target.value)}
          className="w-16"
        />
        <Input
          placeholder="Novo item..."
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
          className="flex-1"
        />
        <Button type="button" variant="outline" onClick={handleAdd} className="border-border">
          <Plus size={16} />
        </Button>
      </div>
    </div>
  )
}

export function StepAtendimento({ onNext, onBack }: Props) {
  const [modalidades, setModalidades] = useState<ItemConfig[]>(DEFAULT_MODALIDADES)
  const [meios, setMeios] = useState<ItemConfig[]>(DEFAULT_MEIOS)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Tipo de sessão</h2>
        <p className="text-sm text-muted mt-1">Confirme ou ajuste os tipos de atendimento que você oferece.</p>
      </div>

      <ItemList
        title="Modalidade de sessão"
        items={modalidades}
        onAdd={(nome, emoji) => setModalidades(prev => [...prev, { nome, emoji }])}
        onRemove={nome => setModalidades(prev => prev.filter(m => m.nome !== nome))}
      />

      <ItemList
        title="Meio de atendimento"
        items={meios}
        onAdd={(nome, emoji) => setMeios(prev => [...prev, { nome, emoji }])}
        onRemove={nome => setMeios(prev => prev.filter(m => m.nome !== nome))}
      />

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1 border-border">
          Voltar
        </Button>
        <Button
          type="button"
          onClick={() => onNext(modalidades, meios)}
          disabled={modalidades.length === 0 || meios.length === 0}
          className="flex-1 bg-primary hover:bg-primary/90 text-white"
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update OnboardingPage.tsx**

In `src/pages/OnboardingPage.tsx`:

Replace import:
```typescript
// Remove:
import { StepModalidades } from './onboarding/StepModalidades'

// Add:
import { StepAtendimento } from './onboarding/StepAtendimento'
```

Update state:
```typescript
// Remove:
const [modalidades, setModalidades] = useState<string[]>([])

// Add:
const [modalidadesSessao, setModalidadesSessao] = useState<{ nome: string; emoji: string }[]>([])
const [meiosAtendimento, setMeiosAtendimento] = useState<{ nome: string; emoji: string }[]>([])
```

In the `finalize` function, replace the old `modalidades` insert logic:

```typescript
// Remove:
const extras = modalidades.filter(m => !['Presencial', 'Online'].includes(m))
if (extras.length > 0) {
  await supabase.from('modalidades').insert(extras.map(nome => ({ nome })))
}

// Add:
const seedNomesModalidade = ['Individual', 'Casal', 'Família', 'Neurodivergente']
const extraModalidades = modalidadesSessao.filter(m => !seedNomesModalidade.includes(m.nome))
if (extraModalidades.length > 0) {
  await supabase.from('modalidades_sessao').insert(extraModalidades)
}

const seedNomesMeio = ['Presencial', 'Online', 'Domicílio']
const extraMeios = meiosAtendimento.filter(m => !seedNomesMeio.includes(m.nome))
if (extraMeios.length > 0) {
  await supabase.from('meios_atendimento').insert(extraMeios)
}

// Deactivate seeds that the user removed
const removedModalidades = seedNomesModalidade.filter(n => !modalidadesSessao.find(m => m.nome === n))
if (removedModalidades.length > 0) {
  await supabase.from('modalidades_sessao').update({ ativo: false }).in('nome', removedModalidades)
}

const removedMeios = seedNomesMeio.filter(n => !meiosAtendimento.find(m => m.nome === n))
if (removedMeios.length > 0) {
  await supabase.from('meios_atendimento').update({ ativo: false }).in('nome', removedMeios)
}
```

Replace the step 2 JSX:
```tsx
// Remove:
{step === 2 && (
  <StepModalidades
    onNext={m => { setModalidades(m); setStep(3) }}
    onBack={() => setStep(1)}
  />
)}

// Add:
{step === 2 && (
  <StepAtendimento
    onNext={(m, meios) => { setModalidadesSessao(m); setMeiosAtendimento(meios); setStep(3) }}
    onBack={() => setStep(1)}
  />
)}
```

- [ ] **Step 4: Run test — expect PASS (GREEN)**

```bash
npx vitest run src/pages/__tests__/OnboardingPage.test.tsx
```
Expected: passing.

- [ ] **Step 5: Commit**

```bash
git rm src/pages/onboarding/StepModalidades.tsx
git add src/pages/onboarding/StepAtendimento.tsx src/pages/OnboardingPage.tsx src/pages/__tests__/OnboardingPage.test.tsx
git commit -m "feat(onboarding): replace StepModalidades with StepAtendimento (emoji + dual picker)"
```

---

## Task 11: ConfiguracoesPage — two new sections

**File:** `src/pages/ConfiguracoesPage.tsx`

- [ ] **Step 1: Update imports**

In `src/pages/ConfiguracoesPage.tsx`, replace:

```typescript
// Remove:
import { useModalidades } from '@/hooks/useModalidades'

// Add:
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
```

- [ ] **Step 2: Replace hook usage**

Inside the component, replace:
```typescript
// Remove:
const { modalidades, loading: loadingModalidades, addModalidade, toggleAtivo: toggleModalidade } = useModalidades()

// Add:
const { modalidadesSessao, loading: loadingModalidades, addModalidadeSessao, toggleAtivo: toggleModalidadeSessao } = useModalidadesSessao()
const { meiosAtendimento, loading: loadingMeios, addMeioAtendimento, toggleAtivo: toggleMeioAtendimento } = useMeiosAtendimento()
```

- [ ] **Step 3: Replace state variables**

```typescript
// Remove:
const [nomeModalidade, setNomeModalidade] = useState('')

// Add:
const [nomeModalidadeSessao, setNomeModalidadeSessao] = useState('')
const [emojiModalidadeSessao, setEmojiModalidadeSessao] = useState('')
const [nomeMeio, setNomeMeio] = useState('')
const [emojiMeio, setEmojiMeio] = useState('')
```

- [ ] **Step 4: Replace the Modalidades section in JSX**

Find the `{/* Modalidades */}` block in the JSX and replace the entire card with two sibling cards:

```tsx
{/* Modalidades de Sessão */}
<div className="bg-surface border border-border rounded-card p-6">
  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-4">Modalidades de Sessão</p>
  {loadingModalidades ? (
    <p className="text-sm text-muted">Carregando...</p>
  ) : (
    <div className="space-y-3">
      {modalidadesSessao.length > 0 && (
        <div className="space-y-2">
          {modalidadesSessao.map(m => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="text-lg w-6 text-center">{m.emoji}</span>
              <span className="text-sm flex-1">{m.nome}</span>
              <button
                onClick={() => toggleModalidadeSessao(m.id, false)}
                title="Desativar"
                className="text-xs text-muted hover:text-accent transition-colors"
              >
                Desativar
              </button>
            </div>
          ))}
        </div>
      )}
      {modalidadesSessao.length === 0 && (
        <p className="text-sm text-muted">Nenhuma modalidade cadastrada.</p>
      )}
      <div className="flex gap-2 pt-2">
        <input
          type="text"
          placeholder="😀"
          value={emojiModalidadeSessao}
          onChange={e => setEmojiModalidadeSessao(e.target.value)}
          className="w-14 h-9 px-2 rounded-lg border border-border bg-surface text-sm text-center outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <input
          type="text"
          placeholder="Nome da modalidade"
          value={nomeModalidadeSessao}
          onChange={e => setNomeModalidadeSessao(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (nomeModalidadeSessao.trim()) {
                addModalidadeSessao(nomeModalidadeSessao.trim(), emojiModalidadeSessao.trim() || '📋')
                setNomeModalidadeSessao('')
                setEmojiModalidadeSessao('')
              }
            }
          }}
          className="flex-1 h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <button
          onClick={() => {
            if (nomeModalidadeSessao.trim()) {
              addModalidadeSessao(nomeModalidadeSessao.trim(), emojiModalidadeSessao.trim() || '📋')
              setNomeModalidadeSessao('')
              setEmojiModalidadeSessao('')
            }
          }}
          className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-primary-light transition-colors"
        >
          + Adicionar
        </button>
      </div>
    </div>
  )}
</div>

{/* Meios de Atendimento */}
<div className="bg-surface border border-border rounded-card p-6">
  <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-4">Meios de Atendimento</p>
  {loadingMeios ? (
    <p className="text-sm text-muted">Carregando...</p>
  ) : (
    <div className="space-y-3">
      {meiosAtendimento.length > 0 && (
        <div className="space-y-2">
          {meiosAtendimento.map(m => (
            <div key={m.id} className="flex items-center gap-3">
              <span className="text-lg w-6 text-center">{m.emoji}</span>
              <span className="text-sm flex-1">{m.nome}</span>
              <button
                onClick={() => toggleMeioAtendimento(m.id, false)}
                title="Desativar"
                className="text-xs text-muted hover:text-accent transition-colors"
              >
                Desativar
              </button>
            </div>
          ))}
        </div>
      )}
      {meiosAtendimento.length === 0 && (
        <p className="text-sm text-muted">Nenhum meio cadastrado.</p>
      )}
      <div className="flex gap-2 pt-2">
        <input
          type="text"
          placeholder="😀"
          value={emojiMeio}
          onChange={e => setEmojiMeio(e.target.value)}
          className="w-14 h-9 px-2 rounded-lg border border-border bg-surface text-sm text-center outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <input
          type="text"
          placeholder="Nome do meio"
          value={nomeMeio}
          onChange={e => setNomeMeio(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (nomeMeio.trim()) {
                addMeioAtendimento(nomeMeio.trim(), emojiMeio.trim() || '📋')
                setNomeMeio('')
                setEmojiMeio('')
              }
            }
          }}
          className="flex-1 h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <button
          onClick={() => {
            if (nomeMeio.trim()) {
              addMeioAtendimento(nomeMeio.trim(), emojiMeio.trim() || '📋')
              setNomeMeio('')
              setEmojiMeio('')
            }
          }}
          className="h-9 px-3 rounded-lg border border-border text-sm hover:bg-primary-light transition-colors"
        >
          + Adicionar
        </button>
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 5: Run type check + full test suite**

```bash
npx tsc --noEmit && npx vitest run
```
Expected: 0 type errors, all tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/pages/ConfiguracoesPage.tsx
git commit -m "feat(ui): replace Modalidades section with Modalidades de Sessão + Meios de Atendimento in Configurações"
```

---

## Task 12: Update detail views (PacienteDetalhePage + FinanceiroPacientePage)

**Files:**
- Modify: `src/pages/PacienteDetalhePage.tsx`
- Modify: `src/pages/FinanceiroPacientePage.tsx`

- [ ] **Step 1: Update session rows in PacienteDetalhePage**

In `src/pages/PacienteDetalhePage.tsx`, find where session rows render the old `sessao.modalidades?.nome` field (or similar) and replace with:

```tsx
{(sessao.modalidades_sessao || sessao.meios_atendimento) && (
  <span className="text-xs text-muted">
    {sessao.modalidades_sessao?.emoji} {sessao.modalidades_sessao?.nome}
    {sessao.modalidades_sessao && sessao.meios_atendimento && ' · '}
    {sessao.meios_atendimento?.emoji} {sessao.meios_atendimento?.nome}
  </span>
)}
```

- [ ] **Step 2: Update session rows in FinanceiroPacientePage**

Apply the same replacement in `src/pages/FinanceiroPacientePage.tsx` wherever `modalidades?.nome` appears.

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit 2>&1 | grep -E "PacienteDetalhe|FinanceiroPaciente" | head -10
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PacienteDetalhePage.tsx src/pages/FinanceiroPacientePage.tsx
git commit -m "feat(ui): show emoji + nome for modalidade_sessao + meio_atendimento in detail views"
```

---

## Task 13: Final verification

- [ ] **Step 1: Run full type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```
Expected: all tests passing, 0 failures.

- [ ] **Step 3: Verify in the browser**

Start the dev server:
```bash
npm run dev
```

Check:
1. `/configuracoes` — two new sections "Modalidades de Sessão" and "Meios de Atendimento" render with emoji rows
2. Kanban / Agenda — session cards show two emojis with hover tooltips
3. Create new patient (`/pacientes/novo`) — two required selects visible
4. Edit patient — two selects pre-filled from existing data
5. NovaSessaoModal — two selects appear, pre-fill from patient when patient is selected
6. Onboarding step 2 — shows "Tipo de sessão" heading with both pickers

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup after modalidades split"
```
