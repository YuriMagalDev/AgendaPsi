# Patients Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete patients module: list with search, registration with billing contract, and profile with session history and archive action.

**Architecture:** Three isolated hooks (`usePacientes`, `usePacienteDetalhe`) call Supabase directly via `supabase-js`. The three existing placeholder pages are replaced with real implementations. No global state — each page fetches its own data.

**Tech Stack:** React + TypeScript + React Hook Form + Zod + Supabase JS + date-fns + Tailwind CSS + lucide-react

---

## File Structure

**Create:**
- `src/hooks/usePacientes.ts` — list of active patients, createPaciente, arquivarPaciente
- `src/hooks/usePacienteDetalhe.ts` — patient + sessions with modality + active contract + stats
- `src/hooks/__tests__/usePacientes.test.ts`
- `src/hooks/__tests__/usePacienteDetalhe.test.ts`

**Modify:**
- `src/lib/types.ts` — add `SessaoComModalidade`
- `src/pages/PacientesPage.tsx` — list with search (replace stub)
- `src/pages/NovoPacientePage.tsx` — registration form (replace stub)
- `src/pages/PacienteDetalhePage.tsx` — patient profile (replace stub)

---

### Task 1: Type `SessaoComModalidade` + hook `usePacientes`

Hook that fetches all active patients, creates a new patient (with optional contract) and archives. Used in PacientesPage and NovoPacientePage.

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/hooks/usePacientes.ts`
- Create: `src/hooks/__tests__/usePacientes.test.ts`

- [ ] **Step 1: Add `SessaoComModalidade` in `src/lib/types.ts`**

Open `src/lib/types.ts` and add at the end (after line 91, `}`):

```typescript
export type SessaoComModalidade = Sessao & {
  modalidades: { nome: string } | null
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/hooks/__tests__/usePacientes.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePacientes } from '../usePacientes'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

/** Helper: creates a mock of Supabase fluent-builder */
function buildChain(overrides: Record<string, any> = {}) {
  const base: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  return base
}

describe('usePacientes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active patients ordered by name', async () => {
    const mockData = [
      { id: '1', nome: 'Ana Lima', telefone: null, email: null, data_nascimento: null, ativo: true, criado_em: '2024-01-01T00:00:00Z' },
    ]
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mockData, error: null }) })
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.pacientes).toEqual(mockData)
    expect(supabase.from).toHaveBeenCalledWith('pacientes')
  })

  it('sets error when fetch fails', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }) })
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('DB error')
    expect(result.current.pacientes).toEqual([])
  })

  it('createPaciente returns the new patient id', async () => {
    const newId = 'uuid-novo'
    let callCount = 0

    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        // Second call = patient insert
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: newId }, error: null }),
            }),
          }),
        } as any
      }
      // First (initial fetch) and third+ (post-creation refresh)
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    })

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returnedId = ''
    await act(async () => {
      returnedId = await result.current.createPaciente({ nome: 'João' })
    })

    expect(returnedId).toBe(newId)
  })

  it('createPaciente throws an exception when Supabase returns an error', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
            }),
          }),
        } as any
      }
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.createPaciente({ nome: 'Erro' }) })
    ).rejects.toBeDefined()
  })

  it('arquivarPaciente calls update in Supabase', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy }) as any
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.arquivarPaciente('p-123')
    })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'p-123')
  })
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

```
npx vitest run src/hooks/__tests__/usePacientes.test.ts
```

Expected: FAIL with "Cannot find module '../usePacientes'"

- [ ] **Step 4: Implement `src/hooks/usePacientes.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Paciente, ContratoTipo } from '@/lib/types'

export interface CreatePacienteInput {
  nome: string
  telefone?: string
  email?: string
  data_nascimento?: string
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number
    dia_vencimento?: number
  }
}

export function usePacientes() {
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchPacientes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pacientes')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    if (error) {
      setError(error.message)
      setPacientes([])
    } else {
      setPacientes(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPacientes()
  }, [])

  async function createPaciente(input: CreatePacienteInput): Promise<string> {
    const { data: paciente, error: pacienteError } = await supabase
      .from('pacientes')
      .insert({
        nome: input.nome,
        telefone: input.telefone ?? null,
        email: input.email ?? null,
        data_nascimento: input.data_nascimento ?? null,
      })
      .select('id')
      .single()

    if (pacienteError) throw pacienteError

    if (input.contrato) {
      const { error: contratoError } = await supabase
        .from('contratos')
        .insert({
          paciente_id: paciente.id,
          tipo: input.contrato.tipo,
          valor: input.contrato.valor,
          qtd_sessoes: input.contrato.qtd_sessoes ?? null,
          dia_vencimento: input.contrato.dia_vencimento ?? null,
          ativo: true,
        })
      if (contratoError) throw contratoError
    }

    await fetchPacientes()
    return paciente.id
  }

  async function arquivarPaciente(id: string): Promise<void> {
    const { error } = await supabase
      .from('pacientes')
      .update({ ativo: false })
      .eq('id', id)

    if (error) throw error
    await fetchPacientes()
  }

  return { pacientes, loading, error, createPaciente, arquivarPaciente }
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

```
npx vitest run src/hooks/__tests__/usePacientes.test.ts
```

Expected: PASS — 5 tests passing

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/hooks/usePacientes.ts src/hooks/__tests__/usePacientes.test.ts
git commit -m "feat: add SessaoComModalidade type and usePacientes hook"
```

---

### Task 2: Hook `usePacienteDetalhe`

Hook that fetches in parallel: the patient by ID, their sessions with modality name, and the active contract. Calculates session stats. Used in PacienteDetalhePage.

**Files:**
- Create: `src/hooks/usePacienteDetalhe.ts`
- Create: `src/hooks/__tests__/usePacienteDetalhe.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/usePacienteDetalhe.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePacienteDetalhe } from '../usePacienteDetalhe'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

const mockPaciente = {
  id: 'p-1',
  nome: 'Maria Souza',
  telefone: '11988887777',
  email: 'maria@email.com',
  data_nascimento: '1985-06-15',
  ativo: true,
  criado_em: '2024-01-01T00:00:00Z',
}

const mockSessoes = [
  { id: 's-1', paciente_id: 'p-1', status: 'concluida', pago: true, valor_cobrado: 150, data_hora: '2024-03-01T14:00:00Z', modalidades: { nome: 'Presencial' }, avulso_nome: null, avulso_telefone: null, modalidade_id: 'm-1', remarcada_para: null, sessao_origem_id: null, criado_em: '2024-03-01T00:00:00Z', data_pagamento: null },
  { id: 's-2', paciente_id: 'p-1', status: 'faltou', pago: false, valor_cobrado: 150, data_hora: '2024-03-08T14:00:00Z', modalidades: { nome: 'Presencial' }, avulso_nome: null, avulso_telefone: null, modalidade_id: 'm-1', remarcada_para: null, sessao_origem_id: null, criado_em: '2024-03-08T00:00:00Z', data_pagamento: null },
  { id: 's-3', paciente_id: 'p-1', status: 'concluida', pago: false, valor_cobrado: 150, data_hora: '2024-03-15T14:00:00Z', modalidades: { nome: 'Presencial' }, avulso_nome: null, avulso_telefone: null, modalidade_id: 'm-1', remarcada_para: null, sessao_origem_id: null, criado_em: '2024-03-15T00:00:00Z', data_pagamento: null },
]

const mockContrato = {
  id: 'c-1',
  paciente_id: 'p-1',
  tipo: 'por_sessao' as const,
  valor: 150,
  qtd_sessoes: null,
  dia_vencimento: null,
  ativo: true,
  criado_em: '2024-01-01T00:00:00Z',
}

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

describe('usePacienteDetalhe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches patient, sessions and contract in parallel', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'pacientes') {
        return buildChain({ single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }) }) as any
      }
      if (table === 'sessoes') {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) }) as any
      }
      if (table === 'contratos') {
        return buildChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }) }) as any
      }
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacienteDetalhe('p-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.paciente).toEqual(mockPaciente)
    expect(result.current.sessoes).toHaveLength(3)
    expect(result.current.contrato).toEqual(mockContrato)
  })

  it('calculates stats correctly from sessions', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'pacientes') return buildChain({ single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }) }) as any
      if (table === 'sessoes') return buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) }) as any
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacienteDetalhe('p-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.stats.total).toBe(3)
    expect(result.current.stats.concluidas).toBe(2)
    expect(result.current.stats.faltas).toBe(1)
    expect(result.current.stats.totalPago).toBe(150) // only s-1 is paid
  })

  it('archive calls update with ativo=false', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'pacientes') {
        return buildChain({
          single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }),
          update: updateSpy,
        }) as any
      }
      if (table === 'sessoes') return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacienteDetalhe('p-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.arquivar() })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'p-1')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```
npx vitest run src/hooks/__tests__/usePacienteDetalhe.test.ts
```

Expected: FAIL with "Cannot find module '../usePacienteDetalhe'"

- [ ] **Step 3: Implement `src/hooks/usePacienteDetalhe.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Paciente, Contrato, SessaoComModalidade } from '@/lib/types'

interface Stats {
  total: number
  concluidas: number
  faltas: number
  totalPago: number
}

export function usePacienteDetalhe(id: string) {
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [sessoes, setSessoes] = useState<SessaoComModalidade[]>([])
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    async function fetchAll() {
      const [pacienteRes, sessoesRes, contratoRes] = await Promise.all([
        supabase.from('pacientes').select('*').eq('id', id).single(),
        supabase
          .from('sessoes')
          .select('*, modalidades(nome)')
          .eq('paciente_id', id)
          .order('data_hora', { ascending: false }),
        supabase
          .from('contratos')
          .select('*')
          .eq('paciente_id', id)
          .eq('ativo', true)
          .maybeSingle(),
      ])

      setPaciente(pacienteRes.data)
      setSessoes((sessoesRes.data ?? []) as SessaoComModalidade[])
      setContrato(contratoRes.data)
      setLoading(false)
    }

    fetchAll()
  }, [id])

  const stats: Stats = {
    total: sessoes.length,
    concluidas: sessoes.filter(s => s.status === 'concluida').length,
    faltas: sessoes.filter(s => s.status === 'faltou').length,
    totalPago: sessoes
      .filter(s => s.pago)
      .reduce((sum, s) => sum + (s.valor_cobrado ?? 0), 0),
  }

  async function arquivar(): Promise<void> {
    const { error } = await supabase
      .from('pacientes')
      .update({ ativo: false })
      .eq('id', id)
    if (error) throw error
  }

  return { paciente, sessoes, contrato, stats, loading, arquivar }
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```
npx vitest run src/hooks/__tests__/usePacienteDetalhe.test.ts
```

Expected: PASS — 3 tests passing

- [ ] **Step 5: Run all tests to confirm nothing broke**

```
npx vitest run
```

Expected: all passing (ignore the type error in types.test.ts — it's pre-existing)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePacienteDetalhe.ts src/hooks/__tests__/usePacienteDetalhe.test.ts
git commit -m "feat: add usePacienteDetalhe hook with stats computation"
```

---

### Task 3: `PacientesPage` — list with search

Lists all active patients with search field by name. Link to each profile and "Novo Paciente" (New Patient) button.

**Files:**
- Modify: `src/pages/PacientesPage.tsx`

- [ ] **Step 1: Replace the stub with the implementation**

Replace the entire content of `src/pages/PacientesPage.tsx`:

```typescript
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, ChevronRight, UserRound } from 'lucide-react'
import { usePacientes } from '@/hooks/usePacientes'
import type { Paciente } from '@/lib/types'

const contratoLabel: Record<string, string> = {
  por_sessao: 'Per session',
  pacote: 'Package',
  mensal: 'Monthly',
}

function PacienteCard({ paciente }: { paciente: Paciente }) {
  return (
    <Link
      to={`/pacientes/${paciente.id}`}
      className="flex items-center justify-between p-4 bg-surface rounded-card border border-border hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center shrink-0">
          <UserRound size={18} className="text-primary" />
        </div>
        <div>
          <p className="font-medium text-[#1C1C1C] leading-tight">{paciente.nome}</p>
          {paciente.telefone && (
            <p className="text-sm text-muted mt-0.5">{paciente.telefone}</p>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </Link>
  )
}

export function PacientesPage() {
  const { pacientes, loading, error } = usePacientes()
  const [search, setSearch] = useState('')

  const filtered = pacientes.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Patients</h1>
        <Link to="/pacientes/novo">
          <button className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors">
            <Plus size={16} />
            New
          </button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          placeholder="Search patient..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted"
        />
      </div>

      {/* States */}
      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <p className="text-center py-8 text-sm text-[#E07070]">Error loading patients.</p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <UserRound size={40} className="text-border mx-auto mb-3" />
          <p className="text-muted text-sm">
            {search ? 'No patients found.' : 'No patients registered yet.'}
          </p>
          {!search && (
            <Link to="/pacientes/novo" className="inline-block mt-4 text-sm text-primary font-medium hover:underline">
              Register first patient
            </Link>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map(p => (
            <PacienteCard key={p.id} paciente={p} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify in the browser**

With the dev server running (`npm run dev`), navigate to `/pacientes`.

Expected: page with "Patients" header, search field and empty state (no patients registered yet) or a list of patients if there is data in Supabase.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PacientesPage.tsx
git commit -m "feat: implement PacientesPage with search and patient list"
```

---

### Task 4: `NovoPacientePage` — registration form

Form to create a patient with name, contact, birth date, and an optional billing contract section. After saving, navigates to the created patient profile.

**Files:**
- Modify: `src/pages/NovoPacientePage.tsx`

- [ ] **Step 1: Replace the stub with the implementation**

Replace the entire content of `src/pages/NovoPacientePage.tsx`:

```typescript
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { usePacientes } from '@/hooks/usePacientes'
import type { ContratoTipo } from '@/lib/types'

const schema = z
  .object({
    nome: z.string().min(1, 'Name is required'),
    telefone: z.string().optional(),
    email: z.string().optional(),
    data_nascimento: z.string().optional(),
    tem_contrato: z.boolean(),
    contrato_tipo: z.enum(['por_sessao', 'pacote', 'mensal']).optional(),
    contrato_valor: z.string().optional(),
    contrato_qtd_sessoes: z.string().optional(),
    contrato_dia_vencimento: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.email && data.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Invalid E-mail' })
    }
    if (data.tem_contrato) {
      if (!data.contrato_tipo) {
        ctx.addIssue({ code: 'custom', path: ['contrato_tipo'], message: 'Select billing type' })
      }
      if (!data.contrato_valor || isNaN(Number(data.contrato_valor)) || Number(data.contrato_valor) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['contrato_valor'], message: 'Enter a valid amount' })
      }
      if (data.contrato_tipo === 'pacote') {
        if (!data.contrato_qtd_sessoes || isNaN(Number(data.contrato_qtd_sessoes)) || Number(data.contrato_qtd_sessoes) < 1) {
          ctx.addIssue({ code: 'custom', path: ['contrato_qtd_sessoes'], message: 'Enter the amount of sessions' })
        }
      }
      if (data.contrato_tipo === 'mensal') {
        const dia = Number(data.contrato_dia_vencimento)
        if (!data.contrato_dia_vencimento || isNaN(dia) || dia < 1 || dia > 31) {
          ctx.addIssue({ code: 'custom', path: ['contrato_dia_vencimento'], message: 'Enter a day between 1 and 31' })
        }
      }
    }
  })

type FormData = z.infer<typeof schema>

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span className="text-xs text-[#E07070] mt-1">{message}</span>
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm font-medium text-[#1C1C1C]">
      {children}
      {required && <span className="text-[#E07070] ml-0.5">*</span>}
    </label>
  )
}

const inputClass = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted"

export function NovoPacientePage() {
  const navigate = useNavigate()
  const { createPaciente } = usePacientes()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tem_contrato: false },
  })

  const temContrato = watch('tem_contrato')
  const contratoTipo = watch('contrato_tipo')

  async function onSubmit(data: FormData) {
    setServerError(null)
    try {
      const id = await createPaciente({
        nome: data.nome,
        telefone: data.telefone || undefined,
        email: data.email || undefined,
        data_nascimento: data.data_nascimento || undefined,
        contrato: data.tem_contrato && data.contrato_tipo
          ? {
              tipo: data.contrato_tipo as ContratoTipo,
              valor: Number(data.contrato_valor),
              qtd_sessoes: data.contrato_tipo === 'pacote' ? Number(data.contrato_qtd_sessoes) : undefined,
              dia_vencimento: data.contrato_tipo === 'mensal' ? Number(data.contrato_dia_vencimento) : undefined,
            }
          : undefined,
      })
      navigate(`/pacientes/${id}`)
    } catch {
      setServerError('Error saving. Try again.')
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/pacientes" className="text-muted hover:text-[#1C1C1C] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">New Patient</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Personal data */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Personal data</p>

          <div className="flex flex-col gap-1">
            <FieldLabel required>Name</FieldLabel>
            <input {...register('nome')} placeholder="Full name" className={inputClass} />
            <FieldError message={errors.nome?.message} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>WhatsApp</FieldLabel>
            <input {...register('telefone')} placeholder="(11) 99999-9999" className={inputClass} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>E-mail</FieldLabel>
            <input {...register('email')} type="email" placeholder="email@example.com" className={inputClass} />
            <FieldError message={errors.email?.message} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>Birth date</FieldLabel>
            <input {...register('data_nascimento')} type="date" className={inputClass} />
          </div>
        </div>

        {/* Contract */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Billing</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('tem_contrato')}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-[#1C1C1C]">Define now</span>
            </label>
          </div>

          {temContrato && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel>Billing type</FieldLabel>
                <select
                  {...register('contrato_tipo')}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  <option value="por_sessao">Per session</option>
                  <option value="pacote">Session package</option>
                  <option value="mensal">Monthly</option>
                </select>
                <FieldError message={errors.contrato_tipo?.message} />
              </div>

              <div className="flex flex-col gap-1">
                <FieldLabel>Amount (R$)</FieldLabel>
                <input
                  {...register('contrato_valor')}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className={inputClass}
                />
                <FieldError message={errors.contrato_valor?.message} />
              </div>

              {contratoTipo === 'pacote' && (
                <div className="flex flex-col gap-1">
                  <FieldLabel>Amount of sessions</FieldLabel>
                  <input
                    {...register('contrato_qtd_sessoes')}
                    type="number"
                    min="1"
                    placeholder="Ex: 10"
                    className={inputClass}
                  />
                  <FieldError message={errors.contrato_qtd_sessoes?.message} />
                </div>
              )}

              {contratoTipo === 'mensal' && (
                <div className="flex flex-col gap-1">
                  <FieldLabel>Due day</FieldLabel>
                  <input
                    {...register('contrato_dia_vencimento')}
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Ex: 5"
                    className={inputClass}
                  />
                  <FieldError message={errors.contrato_dia_vencimento?.message} />
                </div>
              )}
            </div>
          )}

          {!temContrato && (
            <p className="text-sm text-muted">You can define the billing method later in the patient's profile.</p>
          )}
        </div>

        {serverError && (
          <p className="text-sm text-[#E07070] text-center">{serverError}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            to="/pacientes"
            className="flex-1 h-10 flex items-center justify-center rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify in the browser**

Navigate to `/pacientes/novo`.

Expected:
- Form with "Personal data" section (Name*, WhatsApp, E-mail, Birth date)
- "Billing" section with "Define now" checkbox
- Checking the box: contract fields appear (type, amount, conditional fields)
- Cancel and Save buttons
- Fill name + check package + fill amount and qty → click Save → redirects to `/pacientes/:id`

- [ ] **Step 3: Commit**

```bash
git add src/pages/NovoPacientePage.tsx
git commit -m "feat: implement NovoPacientePage with patient creation form"
```

---

### Task 5: `PacienteDetalhePage` — patient profile

Displays patient data, active contract, session stats, and chronological history. Archive button with confirmation.

**Files:**
- Modify: `src/pages/PacienteDetalhePage.tsx`

- [ ] **Step 1: Replace the stub with the implementation**

Replace the entire content of `src/pages/PacienteDetalhePage.tsx`:

```typescript
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Archive, Phone, Mail, Calendar, Banknote } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { usePacienteDetalhe } from '@/hooks/usePacienteDetalhe'
import type { SessaoStatus, ContratoTipo } from '@/lib/types'

const statusConfig: Record<SessaoStatus, { label: string; color: string }> = {
  agendada:   { label: 'Scheduled',   color: '#9CA3AF' },
  confirmada: { label: 'Confirmed', color: '#2D6A6A' },
  concluida:  { label: 'Completed',  color: '#4CAF82' },
  faltou:     { label: 'Missed',     color: '#C17F59' },
  cancelada:  { label: 'Canceled',  color: '#E07070' },
  remarcada:  { label: 'Rescheduled',  color: '#9B7EC8' },
}

const contratoDescricao = (tipo: ContratoTipo, valor: number, qtd?: number | null, dia?: number | null) => {
  const valorFmt = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (tipo === 'por_sessao') return `${valorFmt} per session`
  if (tipo === 'pacote') return `${qtd ?? '?'} sessions for ${valorFmt}`
  return `${valorFmt}/month — due day ${dia ?? '?'}`
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface rounded-card border border-border p-4 flex flex-col gap-1">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold text-[#1C1C1C] font-mono">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  )
}

export function PacienteDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { paciente, sessoes, contrato, stats, loading, arquivar } = usePacienteDetalhe(id!)

  async function handleArquivar() {
    if (!window.confirm(`Archive ${paciente?.nome}? The session history will be kept.`)) return
    try {
      await arquivar()
      navigate('/pacientes')
    } catch {
      alert('Error archiving. Try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!paciente) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted">Patient not found.</p>
        <Link to="/pacientes" className="text-primary text-sm mt-2 inline-block hover:underline">
          Back to Patients
        </Link>
      </div>
    )
  }

  const idade = paciente.data_nascimento
    ? differenceInYears(new Date(), new Date(paciente.data_nascimento))
    : null

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/pacientes" className="text-muted hover:text-[#1C1C1C] transition-colors mt-0.5">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">{paciente.nome}</h1>
            {idade !== null && (
              <p className="text-sm text-muted">{idade} years old</p>
            )}
          </div>
        </div>
        <button
          onClick={handleArquivar}
          className="flex items-center gap-1.5 text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg hover:text-[#1C1C1C] transition-colors"
        >
          <Archive size={15} />
          Archive
        </button>
      </div>

      {/* Contact */}
      <div className="bg-surface rounded-card border border-border p-4 mb-4 flex flex-col gap-2">
        {paciente.telefone && (
          <div className="flex items-center gap-2 text-sm text-[#1C1C1C]">
            <Phone size={14} className="text-muted shrink-0" />
            {paciente.telefone}
          </div>
        )}
        {paciente.email && (
          <div className="flex items-center gap-2 text-sm text-[#1C1C1C]">
            <Mail size={14} className="text-muted shrink-0" />
            {paciente.email}
          </div>
        )}
        {paciente.data_nascimento && (
          <div className="flex items-center gap-2 text-sm text-[#1C1C1C]">
            <Calendar size={14} className="text-muted shrink-0" />
            {format(new Date(paciente.data_nascimento), "MMMM d', 'yyyy", { locale: ptBR })}
          </div>
        )}
        {!paciente.telefone && !paciente.email && !paciente.data_nascimento && (
          <p className="text-sm text-muted">No contact data registered.</p>
        )}
      </div>

      {/* Active contract */}
      {contrato && (
        <div className="bg-primary-light rounded-card border border-primary/20 p-4 mb-4 flex items-center gap-2">
          <Banknote size={16} className="text-primary shrink-0" />
          <p className="text-sm text-primary font-medium">
            {contratoDescricao(contrato.tipo, contrato.valor, contrato.qtd_sessoes, contrato.dia_vencimento)}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Total sessions" value={stats.total} />
        <StatCard label="Completed" value={stats.concluidas} />
        <StatCard label="Missed" value={stats.faltas} />
        <StatCard
          label="Total paid"
          value={stats.totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        />
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Session history</h2>

        {sessoes.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted">No sessions registered.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessoes.map(s => {
              const cfg = statusConfig[s.status]
              return (
                <div
                  key={s.id}
                  className="bg-surface rounded-card border border-border p-4 flex items-center justify-between"
                  style={{ borderLeftWidth: 3, borderLeftColor: cfg.color }}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                      {s.modalidades?.nome && (
                        <span className="text-xs text-muted">{s.modalidades.nome}</span>
                      )}
                    </div>
                    <p className="text-sm text-[#1C1C1C]">
                      {format(new Date(s.data_hora), "d MMM yyyy 'at' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    {s.valor_cobrado != null && (
                      <p className="text-sm font-mono font-medium text-[#1C1C1C]">
                        {s.valor_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    )}
                    {s.pago && (
                      <p className="text-xs text-[#4CAF82] mt-0.5">Paid</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify in the browser**

Navigate to `/pacientes`, create a patient with a contract, click on the card to open the profile.

Expected:
- Header with patient name, age (if birth date is filled), Archive button
- Contact card with phone/email/birth date
- Teal banner with contract info (if registered)
- 4 stat cards: Total, Completed, Missed, Total Paid
- "Session history" section (empty if no sessions yet)
- Click "Archive" → confirm dialog → redirects to `/pacientes`

- [ ] **Step 3: Run all tests to confirm none broke**

```
npx vitest run
```

Expected: all passing

- [ ] **Step 4: Commit**

```bash
git add src/pages/PacienteDetalhePage.tsx
git commit -m "feat: implement PacienteDetalhePage with stats and session history"
```

---

## Final Verification Checklist

After all tasks:

- [ ] `npx vitest run` — all tests pass
- [ ] `npx vite build` — build without errors
- [ ] In the browser: `/pacientes` → empty list with "New" button
- [ ] `/pacientes/novo` → form works, validation works, submit redirects
- [ ] `/pacientes/:id` → profile with stats, contract, history
- [ ] Archive patient → disappears from the list, history preserved in Supabase
