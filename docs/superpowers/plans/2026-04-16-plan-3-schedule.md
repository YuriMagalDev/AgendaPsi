# Schedule Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Kanban (status columns + real-time), Agenda (daily list + navigation), session creation modal, and end-of-day Checklist.

**Architecture:** Three hooks (`useSessoesDia`, `useKanban`, `useModalidades`) drive the pages. `SessaoCard` is a shared display component. `NovaSessaoModal` handles creation for both registered and standalone (avulso) patients. Kanban uses Supabase Realtime for live updates. Checklist reuses `useSessoesDia` filtered to `agendada`/`confirmada`.

**Tech Stack:** React + TypeScript + Supabase JS + Supabase Realtime + date-fns + lucide-react + Tailwind CSS

**Language:** All user-facing text must be in **Portuguese (pt-BR)**.

---

## File Structure

**Create:**
- `src/hooks/useSessoesDia.ts` — sessions for a given date with patient + modality join
- `src/hooks/useKanban.ts` — all sessions grouped by status with Realtime + updateStatus
- `src/hooks/useModalidades.ts` — list of active modalities
- `src/hooks/__tests__/useSessoesDia.test.ts`
- `src/hooks/__tests__/useKanban.test.ts`
- `src/hooks/__tests__/useModalidades.test.ts`
- `src/components/sessao/SessaoCard.tsx` — shared session card
- `src/components/sessao/NovaSessaoModal.tsx` — create session modal

**Modify:**
- `src/lib/types.ts` — add `SessaoView` type
- `src/pages/KanbanPage.tsx` — replace stub
- `src/pages/AgendaPage.tsx` — replace stub
- `src/pages/ChecklistPage.tsx` — replace stub

---

### Task 1: `SessaoView` type + `useSessoesDia` hook

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/hooks/useSessoesDia.ts`
- Create: `src/hooks/__tests__/useSessoesDia.test.ts`

- [ ] **Step 1: Add `SessaoView` to `src/lib/types.ts`**

Append after line 95 (after `SessaoComModalidade`):

```typescript
export type SessaoView = Sessao & {
  modalidades: { nome: string } | null
  pacientes: { nome: string } | null
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/hooks/__tests__/useSessoesDia.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useSessoesDia } from '../useSessoesDia'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

const mockSessoes = [
  {
    id: 's-1', paciente_id: 'p-1', avulso_nome: null, avulso_telefone: null,
    modalidade_id: 'm-1', data_hora: '2026-04-16T10:00:00Z', status: 'agendada',
    valor_cobrado: 150, pago: false, data_pagamento: null, remarcada_para: null,
    sessao_origem_id: null, criado_em: '2026-04-16T00:00:00Z',
    modalidades: { nome: 'Presencial' }, pacientes: { nome: 'Ana Lima' },
  },
]

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    ...overrides,
  }
}

describe('useSessoesDia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches sessions for the given date ordered by data_hora', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) })
    )

    const { result } = renderHook(() => useSessoesDia('2026-04-16'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.sessoes).toHaveLength(1)
    expect(supabase.from).toHaveBeenCalledWith('sessoes')
  })

  it('sets error on fetch failure', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }) })
    )

    const { result } = renderHook(() => useSessoesDia('2026-04-16'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('fail')
    expect(result.current.sessoes).toEqual([])
  })

  it('refetches when date changes', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) })
    )

    const { result, rerender } = renderHook(({ d }) => useSessoesDia(d), {
      initialProps: { d: '2026-04-16' },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    rerender({ d: '2026-04-17' })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.from).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```
npx vitest run src/hooks/__tests__/useSessoesDia.test.ts
```

Expected: FAIL — "Cannot find module '../useSessoesDia'"

- [ ] **Step 4: Implement `src/hooks/useSessoesDia.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SessaoView } from '@/lib/types'

export function useSessoesDia(data: string) {
  const [sessoes, setSessoes] = useState<SessaoView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchSessoes() {
    setLoading(true)
    setError(null)
    const inicio = `${data}T00:00:00`
    const fim = `${data}T23:59:59`
    const { data: rows, error: err } = await supabase
      .from('sessoes')
      .select('*, modalidades(nome), pacientes(nome)')
      .gte('data_hora', inicio)
      .lt('data_hora', fim)
      .order('data_hora')

    if (err) {
      setError(err.message)
      setSessoes([])
    } else {
      setSessoes((rows ?? []) as SessaoView[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchSessoes()
  }, [data])

  return { sessoes, loading, error, refetch: fetchSessoes }
}
```

- [ ] **Step 5: Run tests and confirm they pass**

```
npx vitest run src/hooks/__tests__/useSessoesDia.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/hooks/useSessoesDia.ts src/hooks/__tests__/useSessoesDia.test.ts
git commit -m "feat: add SessaoView type and useSessoesDia hook"
```

---

### Task 2: `useModalidades` hook

**Files:**
- Create: `src/hooks/useModalidades.ts`
- Create: `src/hooks/__tests__/useModalidades.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useModalidades.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useModalidades } from '../useModalidades'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

describe('useModalidades', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active modalities ordered by nome', async () => {
    const mock = [{ id: 'm-1', nome: 'Presencial', ativo: true }]
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mock, error: null }),
    } as any)

    const { result } = renderHook(() => useModalidades())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.modalidades).toEqual(mock)
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```
npx vitest run src/hooks/__tests__/useModalidades.test.ts
```

Expected: FAIL — "Cannot find module '../useModalidades'"

- [ ] **Step 3: Implement `src/hooks/useModalidades.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Modalidade } from '@/lib/types'

export function useModalidades() {
  const [modalidades, setModalidades] = useState<Modalidade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('modalidades')
      .select('*')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => {
        setModalidades(data ?? [])
        setLoading(false)
      })
  }, [])

  return { modalidades, loading }
}
```

- [ ] **Step 4: Run tests and confirm pass**

```
npx vitest run src/hooks/__tests__/useModalidades.test.ts
```

Expected: PASS — 1 test

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useModalidades.ts src/hooks/__tests__/useModalidades.test.ts
git commit -m "feat: add useModalidades hook"
```

---

### Task 3: `useKanban` hook with Realtime + updateStatus

**Files:**
- Create: `src/hooks/useKanban.ts`
- Create: `src/hooks/__tests__/useKanban.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/__tests__/useKanban.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useKanban } from '../useKanban'

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

const mockSessoes = [
  { id: 's-1', status: 'agendada', paciente_id: 'p-1', avulso_nome: null, avulso_telefone: null, modalidade_id: 'm-1', data_hora: '2026-04-16T10:00:00Z', valor_cobrado: 150, pago: false, data_pagamento: null, remarcada_para: null, sessao_origem_id: null, criado_em: '2026-04-01T00:00:00Z', modalidades: { nome: 'Presencial' }, pacientes: { nome: 'Ana Lima' } },
  { id: 's-2', status: 'confirmada', paciente_id: 'p-2', avulso_nome: null, avulso_telefone: null, modalidade_id: 'm-1', data_hora: '2026-04-16T14:00:00Z', valor_cobrado: 150, pago: false, data_pagamento: null, remarcada_para: null, sessao_origem_id: null, criado_em: '2026-04-01T00:00:00Z', modalidades: { nome: 'Online' }, pacientes: { nome: 'Bia Souza' } },
]

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  }
}

describe('useKanban', () => {
  beforeEach(() => vi.clearAllMocks())

  it('groups sessions by status', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) })
    )

    const { result } = renderHook(() => useKanban())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.colunas.agendada).toHaveLength(1)
    expect(result.current.colunas.confirmada).toHaveLength(1)
    expect(result.current.colunas.concluida).toHaveLength(0)
  })

  it('subscribes to Realtime on mount', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) })
    )

    renderHook(() => useKanban())
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled())

    expect(mockChannel.on).toHaveBeenCalled()
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('updateStatus calls supabase update', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockImplementation(() => {
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }), update: updateSpy }) as any
    })

    const { result } = renderHook(() => useKanban())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateStatus('s-1', 'concluida')
    })

    expect(updateSpy).toHaveBeenCalledWith({ status: 'concluida' })
    expect(eqSpy).toHaveBeenCalledWith('id', 's-1')
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```
npx vitest run src/hooks/__tests__/useKanban.test.ts
```

Expected: FAIL — "Cannot find module '../useKanban'"

- [ ] **Step 3: Implement `src/hooks/useKanban.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SessaoStatus, SessaoView } from '@/lib/types'

export type KanbanColunas = Record<SessaoStatus, SessaoView[]>

const STATUSES: SessaoStatus[] = ['agendada', 'confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada']

function groupByStatus(sessoes: SessaoView[]): KanbanColunas {
  const empty = Object.fromEntries(STATUSES.map(s => [s, []])) as KanbanColunas
  return sessoes.reduce((acc, s) => {
    acc[s.status].push(s)
    return acc
  }, empty)
}

export function useKanban() {
  const [colunas, setColunas] = useState<KanbanColunas>(groupByStatus([]))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchAll() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('sessoes')
      .select('*, modalidades(nome), pacientes(nome)')
      .order('data_hora')

    if (err) {
      setError(err.message)
    } else {
      setColunas(groupByStatus((data ?? []) as SessaoView[]))
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()

    const channel = supabase
      .channel('kanban-sessoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessoes' }, fetchAll)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function updateStatus(id: string, status: SessaoStatus, remarcada_para?: string) {
    const patch: Record<string, unknown> = { status }
    if (remarcada_para) patch.remarcada_para = remarcada_para
    const { error: err } = await supabase.from('sessoes').update(patch).eq('id', id)
    if (err) throw err
    await fetchAll()
  }

  return { colunas, loading, error, updateStatus, refetch: fetchAll }
}
```

- [ ] **Step 4: Run tests and confirm pass**

```
npx vitest run src/hooks/__tests__/useKanban.test.ts
```

Expected: PASS — 3 tests

- [ ] **Step 5: Run all tests**

```
npx vitest run
```

Expected: all passing

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useKanban.ts src/hooks/__tests__/useKanban.test.ts
git commit -m "feat: add useKanban hook with Realtime and updateStatus"
```

---

### Task 4: `SessaoCard` shared component

**Files:**
- Create: `src/components/sessao/SessaoCard.tsx`

No automated tests — visual component, verified in browser during Tasks 5 and 6.

- [ ] **Step 1: Create `src/components/sessao/SessaoCard.tsx`**

```typescript
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { SessaoStatus, SessaoView } from '@/lib/types'

const statusConfig: Record<SessaoStatus, { label: string; cor: string }> = {
  agendada:   { label: 'Agendada',    cor: '#9CA3AF' },
  confirmada: { label: 'Confirmada',  cor: '#2D6A6A' },
  concluida:  { label: 'Concluída',   cor: '#4CAF82' },
  faltou:     { label: 'Faltou',      cor: '#C17F59' },
  cancelada:  { label: 'Cancelada',   cor: '#E07070' },
  remarcada:  { label: 'Remarcada',   cor: '#9B7EC8' },
}

interface Props {
  sessao: SessaoView
  onClick?: () => void
}

export function SessaoCard({ sessao, onClick }: Props) {
  const cfg = statusConfig[sessao.status]
  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const horario = format(new Date(sessao.data_hora), 'HH:mm', { locale: ptBR })

  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-card border border-border p-3 cursor-pointer hover:shadow-sm transition-shadow"
      style={{ borderLeftWidth: 3, borderLeftColor: cfg.cor }}
    >
      <p className="text-sm font-medium text-[#1C1C1C] leading-tight">{nomePaciente}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted">{horario}</span>
        {sessao.modalidades?.nome && (
          <span className="text-xs text-muted">· {sessao.modalidades.nome}</span>
        )}
        {sessao.valor_cobrado != null && (
          <span className="text-xs font-mono text-muted ml-auto">
            {sessao.valor_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/sessao/SessaoCard.tsx
git commit -m "feat: add SessaoCard shared component"
```

---

### Task 5: `NovaSessaoModal` component

**Files:**
- Create: `src/components/sessao/NovaSessaoModal.tsx`

- [ ] **Step 1: Create `src/components/sessao/NovaSessaoModal.tsx`**

```typescript
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePacientes } from '@/hooks/usePacientes'
import { useModalidades } from '@/hooks/useModalidades'

const schema = z.object({
  tipo: z.enum(['paciente', 'avulso']),
  paciente_id: z.string().optional(),
  avulso_nome: z.string().optional(),
  avulso_telefone: z.string().optional(),
  modalidade_id: z.string().min(1, 'Selecione a modalidade'),
  data_hora: z.string().min(1, 'Informe data e horário'),
  valor_cobrado: z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.tipo === 'paciente' && !d.paciente_id) {
    ctx.addIssue({ code: 'custom', path: ['paciente_id'], message: 'Selecione o paciente' })
  }
  if (d.tipo === 'avulso' && (!d.avulso_nome || d.avulso_nome.trim().length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['avulso_nome'], message: 'Informe o nome' })
  }
})

type FormData = z.infer<typeof schema>

interface Props {
  defaultDate?: string
  onClose: () => void
  onSaved: () => void
}

const inputClass = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function NovaSessaoModal({ defaultDate, onClose, onSaved }: Props) {
  const { pacientes } = usePacientes()
  const { modalidades } = useModalidades()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: 'paciente',
      data_hora: defaultDate ? `${defaultDate}T08:00` : '',
    },
  })

  const tipo = watch('tipo')

  async function onSubmit(data: FormData) {
    setServerError(null)
    try {
      const { error } = await supabase.from('sessoes').insert({
        paciente_id: data.tipo === 'paciente' ? data.paciente_id : null,
        avulso_nome: data.tipo === 'avulso' ? data.avulso_nome : null,
        avulso_telefone: data.tipo === 'avulso' ? (data.avulso_telefone || null) : null,
        modalidade_id: data.modalidade_id,
        data_hora: data.data_hora,
        status: 'agendada',
        valor_cobrado: data.valor_cobrado ? Number(data.valor_cobrado) : null,
        pago: false,
      })
      if (error) throw error
      onSaved()
      onClose()
    } catch {
      setServerError('Erro ao salvar. Tente novamente.')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-md p-6 shadow-lg">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Nova sessão</h2>
          <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Tipo */}
          <div className="flex gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value="paciente" {...register('tipo')} className="accent-primary" />
              <span className="text-sm">Paciente cadastrado</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value="avulso" {...register('tipo')} className="accent-primary" />
              <span className="text-sm">Avulso</span>
            </label>
          </div>

          {tipo === 'paciente' ? (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#1C1C1C]">Paciente</label>
              <select {...register('paciente_id')} className={inputClass}>
                <option value="">Selecionar...</option>
                {pacientes.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
              {errors.paciente_id && <span className="text-xs text-[#E07070]">{errors.paciente_id.message}</span>}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#1C1C1C]">Nome</label>
                <input {...register('avulso_nome')} placeholder="Nome do paciente" className={inputClass} />
                {errors.avulso_nome && <span className="text-xs text-[#E07070]">{errors.avulso_nome.message}</span>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#1C1C1C]">WhatsApp (opcional)</label>
                <input {...register('avulso_telefone')} placeholder="(11) 99999-9999" className={inputClass} />
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Modalidade</label>
            <select {...register('modalidade_id')} className={inputClass}>
              <option value="">Selecionar...</option>
              {modalidades.map(m => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
            {errors.modalidade_id && <span className="text-xs text-[#E07070]">{errors.modalidade_id.message}</span>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Data e horário</label>
            <input type="datetime-local" {...register('data_hora')} className={inputClass} />
            {errors.data_hora && <span className="text-xs text-[#E07070]">{errors.data_hora.message}</span>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Valor (R$)</label>
            <input {...register('valor_cobrado')} type="number" step="0.01" min="0" placeholder="0,00" className={inputClass} />
          </div>

          {serverError && <p className="text-sm text-[#E07070] text-center">{serverError}</p>}

          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/sessao/NovaSessaoModal.tsx
git commit -m "feat: add NovaSessaoModal component"
```

---

### Task 6: `KanbanPage`

**Files:**
- Modify: `src/pages/KanbanPage.tsx`

- [ ] **Step 1: Replace stub with implementation**

Replace entire content of `src/pages/KanbanPage.tsx`:

```typescript
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useKanban } from '@/hooks/useKanban'
import { SessaoCard } from '@/components/sessao/SessaoCard'
import { NovaSessaoModal } from '@/components/sessao/NovaSessaoModal'
import type { SessaoStatus, SessaoView } from '@/lib/types'

const COLUNAS: { status: SessaoStatus; titulo: string }[] = [
  { status: 'agendada',   titulo: 'Agendadas' },
  { status: 'confirmada', titulo: 'Confirmadas' },
  { status: 'concluida',  titulo: 'Concluídas' },
  { status: 'faltou',     titulo: 'Faltaram' },
  { status: 'cancelada',  titulo: 'Canceladas' },
  { status: 'remarcada',  titulo: 'Remarcadas' },
]

const STATUS_ACOES: Partial<Record<SessaoStatus, SessaoStatus[]>> = {
  agendada:   ['confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada'],
  confirmada: ['concluida', 'faltou', 'cancelada', 'remarcada'],
}

const ACTION_LABEL: Record<SessaoStatus, string> = {
  agendada:   'Agendada',
  confirmada: 'Confirmada',
  concluida:  'Concluída',
  faltou:     'Faltou',
  cancelada:  'Cancelada',
  remarcada:  'Remarcada',
}

function CardMenu({ sessao, onUpdate }: { sessao: SessaoView; onUpdate: (s: SessaoStatus, r?: string) => void }) {
  const acoes = STATUS_ACOES[sessao.status]
  const [remarcarData, setRemarcarData] = useState('')

  if (!acoes) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {acoes.map(s => (
        s === 'remarcada' ? (
          <div key={s} className="flex gap-1 w-full">
            <input
              type="datetime-local"
              value={remarcarData}
              onChange={e => setRemarcarData(e.target.value)}
              className="flex-1 h-7 px-2 text-xs rounded border border-border outline-none focus:border-primary"
            />
            <button
              onClick={() => remarcarData && onUpdate('remarcada', remarcarData)}
              disabled={!remarcarData}
              className="text-xs px-2 h-7 rounded bg-[#9B7EC820] text-[#9B7EC8] disabled:opacity-40 hover:bg-[#9B7EC840] transition-colors"
            >
              Remarcar
            </button>
          </div>
        ) : (
          <button
            key={s}
            onClick={() => onUpdate(s)}
            className="text-xs px-2 py-0.5 rounded transition-colors"
            style={{ backgroundColor: `${getColor(s)}20`, color: getColor(s) }}
          >
            {ACTION_LABEL[s]}
          </button>
        )
      ))}
    </div>
  )
}

function getColor(s: SessaoStatus): string {
  const map: Record<SessaoStatus, string> = {
    agendada: '#9CA3AF', confirmada: '#2D6A6A', concluida: '#4CAF82',
    faltou: '#C17F59', cancelada: '#E07070', remarcada: '#9B7EC8',
  }
  return map[s]
}

export function KanbanPage() {
  const { colunas, loading, updateStatus, refetch } = useKanban()
  const [modalAberto, setModalAberto] = useState(false)
  const [cardExpandido, setCardExpandido] = useState<string | null>(null)

  return (
    <div className="p-4 h-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Kanban</h1>
        <button
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nova sessão
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUNAS.map(({ status, titulo }) => (
            <div key={status} className="min-w-[220px] flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getColor(status) }} />
                <span className="text-xs font-semibold text-muted uppercase tracking-wide">{titulo}</span>
                <span className="text-xs text-muted ml-auto">({colunas[status].length})</span>
              </div>
              <div className="flex flex-col gap-2">
                {colunas[status].map(s => (
                  <div key={s.id}>
                    <SessaoCard sessao={s} onClick={() => setCardExpandido(cardExpandido === s.id ? null : s.id)} />
                    {cardExpandido === s.id && (
                      <CardMenu
                        sessao={s}
                        onUpdate={async (novoStatus, remarcarData) => {
                          await updateStatus(s.id, novoStatus, remarcarData)
                          setCardExpandido(null)
                        }}
                      />
                    )}
                  </div>
                ))}
                {colunas[status].length === 0 && (
                  <div className="rounded-card border border-dashed border-border p-4 text-center">
                    <p className="text-xs text-muted">Nenhuma sessão</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <NovaSessaoModal
          onClose={() => setModalAberto(false)}
          onSaved={() => { refetch(); setModalAberto(false) }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Verify in browser**

Navigate to `/kanban`. Expected:
- 6 columns (Agendadas, Confirmadas, Concluídas, Faltaram, Canceladas, Remarcadas)
- "Nova sessão" button opens modal
- Empty state in each column shows "Nenhuma sessão"
- Clicking a card in Agendadas/Confirmadas expands action buttons

- [ ] **Step 4: Commit**

```bash
git add src/pages/KanbanPage.tsx
git commit -m "feat: implement KanbanPage with columns, status actions and session modal"
```

---

### Task 7: `AgendaPage`

**Files:**
- Modify: `src/pages/AgendaPage.tsx`

- [ ] **Step 1: Replace stub with implementation**

Replace entire content of `src/pages/AgendaPage.tsx`:

```typescript
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { format, addDays, subDays, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSessoesDia } from '@/hooks/useSessoesDia'
import { SessaoCard } from '@/components/sessao/SessaoCard'
import { NovaSessaoModal } from '@/components/sessao/NovaSessaoModal'

function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function AgendaPage() {
  const [data, setData] = useState(new Date())
  const dateStr = toDateString(data)
  const { sessoes, loading, error, refetch } = useSessoesDia(dateStr)
  const [modalAberto, setModalAberto] = useState(false)

  const tituloData = isToday(data)
    ? 'Hoje'
    : format(data, "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setData(subDays(data, 1))} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-display text-xl font-semibold text-[#1C1C1C] capitalize">{tituloData}</h1>
          <button onClick={() => setData(addDays(data, 1))} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          {!isToday(data) && (
            <button onClick={() => setData(new Date())} className="text-xs text-primary hover:underline">
              Hoje
            </button>
          )}
          <button
            onClick={() => setModalAberto(true)}
            className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
            Nova sessão
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && <p className="text-center py-8 text-sm text-[#E07070]">Erro ao carregar sessões.</p>}

      {!loading && !error && sessoes.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted text-sm">Nenhuma sessão agendada para este dia.</p>
        </div>
      )}

      {!loading && !error && sessoes.length > 0 && (
        <div className="flex flex-col gap-2">
          {sessoes.map(s => (
            <SessaoCard key={s.id} sessao={s} />
          ))}
        </div>
      )}

      {modalAberto && (
        <NovaSessaoModal
          defaultDate={dateStr}
          onClose={() => setModalAberto(false)}
          onSaved={() => { refetch(); setModalAberto(false) }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Verify in browser**

Navigate to `/agenda`. Expected:
- Shows today's date (or "Hoje")
- Left/right arrows navigate between days
- "Hoje" button appears when not on today
- "Nova sessão" opens modal pre-filled with the current date
- Sessions shown as cards in chronological order

- [ ] **Step 4: Commit**

```bash
git add src/pages/AgendaPage.tsx
git commit -m "feat: implement AgendaPage with day navigation and session list"
```

---

### Task 8: `ChecklistPage`

**Files:**
- Modify: `src/pages/ChecklistPage.tsx`

- [ ] **Step 1: Replace stub with implementation**

Replace entire content of `src/pages/ChecklistPage.tsx`:

```typescript
import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useSessoesDia } from '@/hooks/useSessoesDia'
import type { SessaoStatus, SessaoView } from '@/lib/types'

const TODAY = format(new Date(), 'yyyy-MM-dd')

type StatusUpdate = { id: string; status: SessaoStatus; remarcada_para?: string }

function getStatusColor(s: SessaoStatus): string {
  const map: Record<SessaoStatus, string> = {
    agendada: '#9CA3AF', confirmada: '#2D6A6A', concluida: '#4CAF82',
    faltou: '#C17F59', cancelada: '#E07070', remarcada: '#9B7EC8',
  }
  return map[s]
}

function SessaoChecklist({ sessao, update, onUpdate }: {
  sessao: SessaoView
  update: StatusUpdate | undefined
  onUpdate: (u: StatusUpdate) => void
}) {
  const novoStatus = update?.status
  const [remarcarData, setRemarcarData] = useState('')
  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const horario = format(new Date(sessao.data_hora), 'HH:mm', { locale: ptBR })

  const botoes: { status: SessaoStatus; label: string }[] = [
    { status: 'concluida', label: 'Concluída' },
    { status: 'faltou',    label: 'Faltou' },
    { status: 'cancelada', label: 'Cancelada' },
  ]

  return (
    <div className="bg-surface rounded-card border border-border p-4"
      style={{ borderLeftWidth: 3, borderLeftColor: getStatusColor(novoStatus ?? sessao.status) }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-[#1C1C1C]">{nomePaciente}</p>
          <p className="text-xs text-muted">{horario} · {sessao.modalidades?.nome}</p>
        </div>
        {novoStatus && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${getStatusColor(novoStatus)}20`, color: getStatusColor(novoStatus) }}>
            {novoStatus.charAt(0).toUpperCase() + novoStatus.slice(1)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {botoes.map(({ status, label }) => (
          <button
            key={status}
            onClick={() => onUpdate({ id: sessao.id, status })}
            className="text-xs px-3 py-1 rounded-lg border transition-colors"
            style={novoStatus === status
              ? { backgroundColor: `${getStatusColor(status)}20`, borderColor: getStatusColor(status), color: getStatusColor(status) }
              : { borderColor: '#E4E0DA', color: '#7A7A7A' }
            }
          >
            {label}
          </button>
        ))}
        <div className="flex gap-1 w-full mt-1">
          <input
            type="datetime-local"
            value={remarcarData}
            onChange={e => setRemarcarData(e.target.value)}
            className="flex-1 h-7 px-2 text-xs rounded border border-border outline-none focus:border-primary"
          />
          <button
            onClick={() => remarcarData && onUpdate({ id: sessao.id, status: 'remarcada', remarcada_para: remarcarData })}
            disabled={!remarcarData}
            className="text-xs px-2 h-7 rounded border disabled:opacity-40 transition-colors"
            style={{ borderColor: '#9B7EC8', color: '#9B7EC8' }}
          >
            Remarcar
          </button>
        </div>
      </div>
    </div>
  )
}

export function ChecklistPage() {
  const { sessoes, loading, error, refetch } = useSessoesDia(TODAY)
  const [updates, setUpdates] = useState<StatusUpdate[]>([])
  const [salvando, setSalvando] = useState(false)

  const pendentes = sessoes.filter(s => s.status === 'agendada' || s.status === 'confirmada')

  function handleUpdate(u: StatusUpdate) {
    setUpdates(prev => [...prev.filter(x => x.id !== u.id), u])
  }

  async function salvarTudo() {
    setSalvando(true)
    for (const u of updates) {
      const patch: Record<string, unknown> = { status: u.status }
      if (u.remarcada_para) patch.remarcada_para = u.remarcada_para
      await supabase.from('sessoes').update(patch).eq('id', u.id)
    }
    setUpdates([])
    await refetch()
    setSalvando(false)
  }

  const tituloData = format(new Date(), "d 'de' MMMM", { locale: ptBR })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Checklist do dia</h1>
          <p className="text-sm text-muted capitalize">{tituloData}</p>
        </div>
        {updates.length > 0 && (
          <button
            onClick={salvarTudo}
            disabled={salvando}
            className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {salvando ? 'Salvando...' : `Salvar (${updates.length})`}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && <p className="text-center py-8 text-sm text-[#E07070]">Erro ao carregar sessões.</p>}

      {!loading && !error && pendentes.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted text-sm">Nenhuma sessão pendente hoje. 🎉</p>
        </div>
      )}

      {!loading && !error && pendentes.length > 0 && (
        <div className="flex flex-col gap-3">
          {pendentes.map(s => (
            <SessaoChecklist
              key={s.id}
              sessao={s}
              update={updates.find(u => u.id === s.id)}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```
npx tsc --noEmit
```

- [ ] **Step 3: Run all tests**

```
npx vitest run
```

Expected: all passing

- [ ] **Step 4: Verify in browser**

Navigate to `/checklist`. Expected:
- Shows today's date
- Lists sessions with status `agendada` or `confirmada`
- Status buttons (Concluída, Faltou, Cancelada, Remarcar + datetime)
- Selected status highlighted
- "Salvar (N)" button appears when updates exist
- After saving, sessions disappear from checklist

- [ ] **Step 5: Commit**

```bash
git add src/pages/ChecklistPage.tsx
git commit -m "feat: implement ChecklistPage with batch status update"
```

---

## Final Verification Checklist

After all tasks:

- [ ] `npx vitest run` — todos os testes passando
- [ ] `npx vite build` — build sem erros
- [ ] `/kanban` → 6 colunas, nova sessão, ações de status no card
- [ ] `/agenda` → navegação de dias, sessões do dia, nova sessão pré-preenchida
- [ ] `/checklist` → sessões pendentes do dia, atualização em lote
- [ ] Realtime: abrir kanban em duas abas, criar sessão numa → aparece na outra automaticamente
