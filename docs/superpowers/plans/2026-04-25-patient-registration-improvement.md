# Patient Registration Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor patient registration into a 3-step wizard, add duration-based conflict detection for recurring slots, add session duration and patient notes fields, and enable slot editing in the patient edit page.

**Architecture:** Five independent layers build on each other — DB migrations first, then types/utilities, then hooks, then the two pages. The conflict check is a pure function library with no side effects. The wizard uses a single `react-hook-form` instance across all three steps with per-step field validation via `trigger()`.

**Tech Stack:** React + TypeScript + react-hook-form + Zod, Supabase JS SDK, Vitest, TailwindCSS, date-fns

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/014_slot_duration.sql` |
| Create | `supabase/migrations/015_patient_notes.sql` |
| Modify | `src/lib/types.ts` — `duracao_minutos` on slot types, `notas` on Paciente |
| Modify | `src/lib/sessaoUtils.ts` — `SlotInput.duracao_minutos`, read from slot |
| Modify | `src/lib/__tests__/sessaoUtils.test.ts` — add `duracao_minutos` to fixtures |
| Modify | `src/hooks/usePacientes.ts` — add `notas` to Create/UpdatePacienteInput |
| Create | `src/lib/conflictCheck.ts` |
| Create | `src/lib/__tests__/conflictCheck.test.ts` |
| Create | `src/hooks/useAllActiveSlots.ts` |
| Create | `src/hooks/useSlotsSemanais.ts` |
| Modify | `src/pages/NovoPacientePage.tsx` — full wizard rewrite |
| Modify | `src/pages/EditarPacientePage.tsx` — add notas + slots section |

---

### Task 1: DB migrations + usePacientes notas support

**Files:**
- Create: `supabase/migrations/014_slot_duration.sql`
- Create: `supabase/migrations/015_patient_notes.sql`
- Modify: `src/hooks/usePacientes.ts`

- [ ] **Step 1: Create migration 014**

```sql
-- supabase/migrations/014_slot_duration.sql
alter table slots_semanais add column duracao_minutos int not null default 50;
```

- [ ] **Step 2: Create migration 015**

```sql
-- supabase/migrations/015_patient_notes.sql
alter table pacientes add column notas text;
```

- [ ] **Step 3: Apply both migrations**

Open Supabase dashboard → SQL Editor, run each file in order.

Verify:
```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'slots_semanais' and column_name = 'duracao_minutos';

select column_name, data_type
from information_schema.columns
where table_name = 'pacientes' and column_name = 'notas';
```

Expected: `duracao_minutos` shows `integer` with default 50; `notas` shows `text`.

- [ ] **Step 4: Add notas to CreatePacienteInput and updatePaciente**

In `src/hooks/usePacientes.ts`, make these changes:

```typescript
export interface CreatePacienteInput {
  nome: string
  telefone?: string
  email?: string
  data_nascimento?: string
  notas?: string          // ADD
  tipo?: 'particular' | 'convenio'
  convenio_id?: string
  modalidade_sessao_id: string
  meio_atendimento_id: string
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number
    dia_vencimento?: number
  }
}

export interface UpdatePacienteInput {
  nome?: string
  telefone?: string | null
  email?: string | null
  data_nascimento?: string | null
  notas?: string | null   // ADD
  tipo?: 'particular' | 'convenio'
  convenio_id?: string | null
  modalidade_sessao_id?: string
  meio_atendimento_id?: string
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number | null
    dia_vencimento?: number | null
  } | null
}
```

In `createPaciente`, add `notas` to the insert:
```typescript
const { data: paciente, error: pacienteError } = await supabase
  .from('pacientes')
  .insert({
    nome: input.nome,
    telefone: input.telefone ?? null,
    email: input.email ?? null,
    data_nascimento: input.data_nascimento ?? null,
    notas: input.notas ?? null,            // ADD
    tipo: input.tipo ?? 'particular',
    convenio_id: input.convenio_id ?? null,
    modalidade_sessao_id: input.modalidade_sessao_id,
    meio_atendimento_id: input.meio_atendimento_id,
  })
  .select('id')
  .single()
```

In `updatePaciente`, add notas to the patch block (after the `meio_atendimento_id` line):
```typescript
if (input.notas !== undefined) patch.notas = input.notas
```

- [ ] **Step 5: Run all tests**

```bash
cd C:\Users\yurig\Documents\Antigravity\Psicologo && npm test -- --run
```

Expected: 88 tests pass.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/014_slot_duration.sql supabase/migrations/015_patient_notes.sql src/hooks/usePacientes.ts
git commit -m "feat(db): add slot duration and patient notes fields"
```

---

### Task 2: Types — duracao_minutos on slots, notas on Paciente

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update SlotSemanal**

In `src/lib/types.ts`, find `SlotSemanal` and add `duracao_minutos`:

```typescript
export interface SlotSemanal {
  id: string
  paciente_id: string
  nome: string | null
  dia_semana: number
  horario: string
  modalidade_sessao_id: string | null
  meio_atendimento_id: string | null
  is_pacote: boolean
  intervalo_semanas: number
  duracao_minutos: number          // ADD
  ativo: boolean
  data_fim: string | null
  criado_em: string
}
```

- [ ] **Step 2: Update SlotSemanalInput**

```typescript
export interface SlotSemanalInput {
  nome: string
  dia_semana: number
  horario: string
  is_pacote: boolean
  intervalo_semanas: number
  duracao_minutos: number          // ADD
}
```

- [ ] **Step 3: Add notas to Paciente**

```typescript
export interface Paciente {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  data_nascimento: string | null
  notas: string | null             // ADD
  ativo: boolean
  tipo: 'particular' | 'convenio'
  convenio_id: string | null
  modalidade_sessao_id: string | null
  meio_atendimento_id: string | null
  criado_em: string
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd C:\Users\yurig\Documents\Antigravity\Psicologo && npx tsc --noEmit 2>&1 | head -40
```

TypeScript will surface places that construct `SlotSemanalInput` without `duracao_minutos`. Note them — they are fixed in Tasks 3 and 7. If the only errors are about missing `duracao_minutos` on `SlotSemanalInput`, that is expected. Do not fix them yet.

- [ ] **Step 5: Run tests**

```bash
npm test -- --run
```

Expected: 88 pass (type errors don't break tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): duracao_minutos on slot types, notas on Paciente"
```

---

### Task 3: sessaoUtils — read slot.duracao_minutos

**Files:**
- Modify: `src/lib/sessaoUtils.ts`
- Modify: `src/lib/__tests__/sessaoUtils.test.ts`

- [ ] **Step 1: Write new failing test**

In `src/lib/__tests__/sessaoUtils.test.ts`, add inside the `describe` block:

```typescript
it('uses slot.duracao_minutos on generated sessions', () => {
  const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1, duracao_minutos: 90 }
  const result = gerarSessoesParaSlot('pac-1', 'mod-1', 'meio-1', slot, 1)
  expect(result[0].duracao_minutos).toBe(90)
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npm test -- --run src/lib/__tests__/sessaoUtils.test.ts
```

Expected: FAIL — `expect(50).toBe(90)` (hardcoded 50).

- [ ] **Step 3: Update SlotInput and gerarSessoesParaSlot**

Replace `src/lib/sessaoUtils.ts` entirely:

```typescript
import { startOfDay, getDay, nextDay, addWeeks, setHours, setMinutes } from 'date-fns'
import type { Day } from 'date-fns'
import type { SessaoStatus } from './types'

export interface SlotInput {
  nome: string
  dia_semana: number
  horario: string
  is_pacote: boolean
  intervalo_semanas: number
  duracao_minutos: number
}

export function gerarSessoesParaSlot(
  pacienteId: string,
  modalidadeSessaoId: string,
  meioAtendimentoId: string,
  slot: SlotInput,
  semanas = 8,
) {
  const hoje = startOfDay(new Date())
  const [hh, mm] = slot.horario.split(':').map(Number)
  const dia = slot.dia_semana as Day
  const inicio = getDay(hoje) === dia ? hoje : nextDay(hoje, dia)
  const intervalo = slot.intervalo_semanas
  const count = Math.ceil(semanas / intervalo)
  const pagoAutomatico = slot.is_pacote

  return Array.from({ length: count }, (_, i) => {
    const base = addWeeks(inicio, i * intervalo)
    return {
      paciente_id: pacienteId,
      avulso_nome: null as null,
      avulso_telefone: null as null,
      modalidade_sessao_id: modalidadeSessaoId,
      meio_atendimento_id: meioAtendimentoId,
      data_hora: setMinutes(setHours(base, hh), mm).toISOString(),
      status: 'agendada' as SessaoStatus,
      valor_cobrado: null as null,
      pago: pagoAutomatico,
      data_pagamento: pagoAutomatico ? new Date().toISOString() : null,
      sessao_origem_id: null as null,
      duracao_minutos: slot.duracao_minutos,
    }
  })
}
```

- [ ] **Step 4: Fix existing test fixtures — add duracao_minutos: 50**

In `src/lib/__tests__/sessaoUtils.test.ts`, update every `slot` object literal in the existing 4 tests (not the new one) to include `duracao_minutos: 50`:

```typescript
// Change all existing slot objects from:
{ nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1 }
// To:
{ nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1, duracao_minutos: 50 }

// And:
{ nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 2 }
// To:
{ nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 2, duracao_minutos: 50 }

// And:
{ nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: true, intervalo_semanas: 1 }
// To:
{ nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: true, intervalo_semanas: 1, duracao_minutos: 50 }
```

- [ ] **Step 5: Run tests**

```bash
npm test -- --run src/lib/__tests__/sessaoUtils.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 6: Run all tests**

```bash
npm test -- --run
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sessaoUtils.ts src/lib/__tests__/sessaoUtils.test.ts
git commit -m "feat(sessaoUtils): read duracao_minutos from slot instead of hardcoding 50"
```

---

### Task 4: conflictCheck utility + tests

**Files:**
- Create: `src/lib/conflictCheck.ts`
- Create: `src/lib/__tests__/conflictCheck.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/__tests__/conflictCheck.test.ts
import { describe, it, expect } from 'vitest'
import { checkSlotConflict } from '../conflictCheck'

describe('checkSlotConflict', () => {
  const existing = { id: 'e1', dia_semana: 2, horario: '14:00', duracao_minutos: 60 }

  it('returns null when list is empty', () => {
    expect(checkSlotConflict({ dia_semana: 2, horario: '14:00', duracao_minutos: 60 }, [])).toBeNull()
  })

  it('returns conflict for exact same time', () => {
    expect(checkSlotConflict({ dia_semana: 2, horario: '14:00', duracao_minutos: 60 }, [existing])).toBe(existing)
  })

  it('returns conflict when new slot starts during existing', () => {
    // existing: 14:00–15:00, new: 14:30–15:30 → overlap
    expect(checkSlotConflict({ dia_semana: 2, horario: '14:30', duracao_minutos: 60 }, [existing])).toBe(existing)
  })

  it('returns conflict when new slot contains existing', () => {
    // existing: 14:00–15:00, new: 13:30–15:30 → overlap
    expect(checkSlotConflict({ dia_semana: 2, horario: '13:30', duracao_minutos: 120 }, [existing])).toBe(existing)
  })

  it('returns null for adjacent slot (no gap but no overlap)', () => {
    // existing: 14:00–15:00, new: 15:00–16:00 → adjacent, not overlapping
    expect(checkSlotConflict({ dia_semana: 2, horario: '15:00', duracao_minutos: 60 }, [existing])).toBeNull()
  })

  it('returns null for different day', () => {
    expect(checkSlotConflict({ dia_semana: 3, horario: '14:00', duracao_minutos: 60 }, [existing])).toBeNull()
  })

  it('excludes self when id matches (for editing existing slot)', () => {
    expect(checkSlotConflict({ id: 'e1', dia_semana: 2, horario: '14:00', duracao_minutos: 60 }, [existing])).toBeNull()
  })
})
```

- [ ] **Step 2: Run to confirm they fail**

```bash
npm test -- --run src/lib/__tests__/conflictCheck.test.ts
```

Expected: FAIL — `Cannot find module '../conflictCheck'`

- [ ] **Step 3: Create conflictCheck.ts**

```typescript
// src/lib/conflictCheck.ts

export interface SlotConflictInput {
  id?: string
  dia_semana: number
  horario: string       // "HH:mm"
  duracao_minutos: number
}

function timeToMinutes(horario: string): number {
  const [h, m] = horario.split(':').map(Number)
  return h * 60 + m
}

function timeOverlaps(t1: string, d1: number, t2: string, d2: number): boolean {
  const start1 = timeToMinutes(t1)
  const end1 = start1 + d1
  const start2 = timeToMinutes(t2)
  const end2 = start2 + d2
  return start1 < end2 && start2 < end1
}

export function checkSlotConflict(
  slot: SlotConflictInput,
  existing: SlotConflictInput[],
): SlotConflictInput | null {
  return existing.find(e =>
    e.id !== slot.id &&
    e.dia_semana === slot.dia_semana &&
    timeOverlaps(slot.horario, slot.duracao_minutos, e.horario, e.duracao_minutos)
  ) ?? null
}

export function addMinutesToTime(horario: string, minutes: number): string {
  const total = timeToMinutes(horario) + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/lib/__tests__/conflictCheck.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Run all tests**

```bash
npm test -- --run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/conflictCheck.ts src/lib/__tests__/conflictCheck.test.ts
git commit -m "feat(lib): conflict detection utility for recurring slots"
```

---

### Task 5: useAllActiveSlots hook

**Files:**
- Create: `src/hooks/useAllActiveSlots.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useAllActiveSlots.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SlotConflictInput } from '@/lib/conflictCheck'

export function useAllActiveSlots() {
  const [slots, setSlots] = useState<SlotConflictInput[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('slots_semanais')
        .select('id, dia_semana, horario, duracao_minutos')
        .eq('ativo', true)
      setSlots((data ?? []) as SlotConflictInput[])
      setLoading(false)
    }
    fetch()
  }, [])

  return { slots, loading }
}
```

- [ ] **Step 2: Run all tests**

```bash
cd C:\Users\yurig\Documents\Antigravity\Psicologo && npm test -- --run
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useAllActiveSlots.ts
git commit -m "feat(hooks): useAllActiveSlots for conflict detection"
```

---

### Task 6: useSlotsSemanais hook

**Files:**
- Create: `src/hooks/useSlotsSemanais.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useSlotsSemanais.ts
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { SlotSemanal } from '@/lib/types'

export function useSlotsSemanais(pacienteId: string) {
  const [slots, setSlots] = useState<SlotSemanal[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSlots = useCallback(async () => {
    const { data } = await supabase
      .from('slots_semanais')
      .select('*')
      .eq('paciente_id', pacienteId)
      .eq('ativo', true)
      .order('dia_semana')
    setSlots((data ?? []) as SlotSemanal[])
    setLoading(false)
  }, [pacienteId])

  useEffect(() => {
    fetchSlots()
  }, [fetchSlots])

  async function updateSlot(slot: SlotSemanal): Promise<void> {
    const { error } = await supabase
      .from('slots_semanais')
      .update({
        nome: slot.nome,
        dia_semana: slot.dia_semana,
        horario: slot.horario,
        duracao_minutos: slot.duracao_minutos,
        intervalo_semanas: slot.intervalo_semanas,
        is_pacote: slot.is_pacote,
      })
      .eq('id', slot.id)
    if (error) throw error
    await fetchSlots()
  }

  async function deactivateSlot(id: string): Promise<void> {
    const { error } = await supabase
      .from('slots_semanais')
      .update({ ativo: false })
      .eq('id', id)
    if (error) throw error
    await fetchSlots()
  }

  return { slots, loading, refetch: fetchSlots, updateSlot, deactivateSlot }
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test -- --run
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSlotsSemanais.ts
git commit -m "feat(hooks): useSlotsSemanais with update and deactivate"
```

---

### Task 7: NovoPacientePage — 3-step wizard

**Files:**
- Modify: `src/pages/NovoPacientePage.tsx`

- [ ] **Step 1: Replace NovoPacientePage.tsx with the wizard**

Replace the entire file content with:

```typescript
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePacientes } from '@/hooks/usePacientes'
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
import { useConvenios } from '@/hooks/useConvenios'
import { useAllActiveSlots } from '@/hooks/useAllActiveSlots'
import { checkSlotConflict, addMinutesToTime } from '@/lib/conflictCheck'
import { gerarSessoesParaSlot } from '@/lib/sessaoUtils'
import type { ContratoTipo, SlotSemanalInput } from '@/lib/types'

const schema = z
  .object({
    nome: z.string().min(1, 'Nome é obrigatório'),
    telefone: z.string().optional(),
    email: z.string().optional(),
    data_nascimento: z.string().optional(),
    notas: z.string().optional(),
    tipo: z.enum(['particular', 'convenio']).default('particular'),
    convenio_id: z.string().optional(),
    modalidade_sessao_id: z.string().min(1, 'Selecione a modalidade de sessão'),
    meio_atendimento_id: z.string().min(1, 'Selecione o meio de atendimento'),
    tem_contrato: z.boolean(),
    contrato_tipo: z.enum(['por_sessao', 'pacote', 'mensal']).optional(),
    contrato_valor: z.string().optional(),
    contrato_qtd_sessoes: z.string().optional(),
    contrato_dia_vencimento: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.email && data.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'E-mail inválido' })
    }
    if (data.tipo === 'convenio' && !data.convenio_id) {
      ctx.addIssue({ code: 'custom', path: ['convenio_id'], message: 'Selecione o plano de saúde' })
    }
    if (data.tem_contrato && data.tipo === 'particular') {
      if (!data.contrato_tipo) {
        ctx.addIssue({ code: 'custom', path: ['contrato_tipo'], message: 'Selecione o tipo de cobrança' })
      }
      if (!data.contrato_valor || isNaN(Number(data.contrato_valor)) || Number(data.contrato_valor) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['contrato_valor'], message: 'Informe um valor válido' })
      }
      if (data.contrato_tipo === 'pacote') {
        if (!data.contrato_qtd_sessoes || isNaN(Number(data.contrato_qtd_sessoes)) || Number(data.contrato_qtd_sessoes) < 1) {
          ctx.addIssue({ code: 'custom', path: ['contrato_qtd_sessoes'], message: 'Informe a quantidade de sessões' })
        }
      }
      if (data.contrato_tipo === 'mensal') {
        const dia = Number(data.contrato_dia_vencimento)
        if (!data.contrato_dia_vencimento || isNaN(dia) || dia < 1 || dia > 31) {
          ctx.addIssue({ code: 'custom', path: ['contrato_dia_vencimento'], message: 'Informe um dia entre 1 e 31' })
        }
      }
    }
  })

type FormData = z.infer<typeof schema>
type Step = 1 | 2 | 3

const STEP_LABELS: Record<Step, string> = { 1: 'Dados', 2: 'Sessão', 3: 'Cobrança' }
const STEP_FIELDS: Record<Step, (keyof FormData)[]> = {
  1: ['nome', 'email', 'convenio_id'],
  2: ['modalidade_sessao_id', 'meio_atendimento_id'],
  3: ['contrato_tipo', 'contrato_valor', 'contrato_qtd_sessoes', 'contrato_dia_vencimento'],
}

const DIAS = [
  { value: 1, label: 'Segunda' }, { value: 2, label: 'Terça' }, { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' }, { value: 5, label: 'Sexta' }, { value: 6, label: 'Sábado' }, { value: 0, label: 'Domingo' },
]
const DURACOES = [30, 45, 50, 60, 90]

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span className="text-xs text-[#E07070] mt-1">{message}</span>
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm font-medium text-[#1C1C1C]">
      {children}{required && <span className="text-[#E07070] ml-0.5">*</span>}
    </label>
  )
}

const inputClass = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted"
const selectClass = "h-9 px-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function NovoPacientePage() {
  const navigate = useNavigate()
  const { createPaciente } = usePacientes()
  const { modalidadesSessao } = useModalidadesSessao()
  const { meiosAtendimento } = useMeiosAtendimento()
  const { convenios } = useConvenios()
  const { slots: allActiveSlots } = useAllActiveSlots()

  const [step, setStep] = useState<Step>(1)
  const [serverError, setServerError] = useState<string | null>(null)
  const [slots, setSlots] = useState<SlotSemanalInput[]>([])
  const [semanas, setSemanas] = useState(8)
  const [duracaoPadrao, setDuracaoPadraoRaw] = useState(50)

  const { register, handleSubmit, watch, trigger, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tem_contrato: false, tipo: 'particular' },
  })

  const temContrato = watch('tem_contrato')
  const contratoTipo = watch('contrato_tipo')
  const tipo = watch('tipo')

  function setDuracaoPadrao(val: number) {
    setDuracaoPadraoRaw(val)
    setSlots(prev => prev.map(s => ({ ...s, duracao_minutos: val })))
  }

  const adicionarSlot = () =>
    setSlots(p => [...p, { nome: '', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1, duracao_minutos: duracaoPadrao }])
  const removerSlot = (i: number) => setSlots(p => p.filter((_, j) => j !== i))
  const atualizarSlot = (i: number, campo: keyof SlotSemanalInput, val: unknown) =>
    setSlots(p => p.map((s, j) => j === i ? { ...s, [campo]: val } : s))

  const algumConflito = slots.some(s => checkSlotConflict(s, allActiveSlots) !== null)

  async function handleNext() {
    const valid = await trigger(STEP_FIELDS[step])
    if (!valid) return
    if (step === 2 && algumConflito) return
    setStep(s => (s + 1) as Step)
  }

  async function onSubmit(data: FormData) {
    setServerError(null)
    if (slots.some(s => !s.horario || !s.nome.trim())) {
      setServerError('Preencha o nome e horário em todos os horários semanais.')
      return
    }
    try {
      const id = await createPaciente({
        nome: data.nome,
        telefone: data.telefone || undefined,
        email: data.email || undefined,
        data_nascimento: data.data_nascimento || undefined,
        notas: data.notas || undefined,
        tipo: data.tipo,
        convenio_id: data.tipo === 'convenio' ? data.convenio_id : undefined,
        modalidade_sessao_id: data.modalidade_sessao_id,
        meio_atendimento_id: data.meio_atendimento_id,
        contrato: data.tem_contrato && data.contrato_tipo && data.tipo === 'particular'
          ? {
              tipo: data.contrato_tipo as ContratoTipo,
              valor: Number(data.contrato_valor),
              qtd_sessoes: data.contrato_tipo === 'pacote' ? Number(data.contrato_qtd_sessoes) : undefined,
              dia_vencimento: data.contrato_tipo === 'mensal' ? Number(data.contrato_dia_vencimento) : undefined,
            }
          : undefined,
      })

      if (slots.length > 0) {
        const { error: slotErr } = await supabase.from('slots_semanais').insert(
          slots.map(s => ({
            paciente_id: id,
            nome: s.nome,
            dia_semana: s.dia_semana,
            horario: s.horario,
            is_pacote: s.is_pacote,
            intervalo_semanas: s.intervalo_semanas,
            duracao_minutos: s.duracao_minutos,
            ativo: true,
          }))
        )
        if (slotErr) throw slotErr

        const sessoesBulk = slots.flatMap(s =>
          gerarSessoesParaSlot(id, data.modalidade_sessao_id, data.meio_atendimento_id, s, semanas)
        )
        const { error: sessErr } = await supabase.from('sessoes').insert(sessoesBulk)
        if (sessErr) throw sessErr
      }

      navigate(`/pacientes/${id}`)
    } catch {
      setServerError('Erro ao salvar. Tente novamente.')
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/pacientes" className="text-muted hover:text-[#1C1C1C] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Novo paciente</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center mb-6">
        {([1, 2, 3] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                step > s ? 'bg-primary text-white' : step === s ? 'bg-primary text-white' : 'bg-border text-muted'
              }`}>
                {step > s ? '✓' : s}
              </div>
              <span className={`text-xs whitespace-nowrap ${step >= s ? 'text-primary font-semibold' : 'text-muted'}`}>
                {STEP_LABELS[s]}
              </span>
            </div>
            {i < 2 && (
              <div className={`flex-1 h-0.5 mx-2 mb-4 transition-colors ${step > s ? 'bg-primary' : 'bg-border'}`} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

        {/* ─── Step 1: Dados pessoais ─── */}
        {step === 1 && (
          <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Dados pessoais</p>

            <div className="flex flex-col gap-1">
              <FieldLabel required>Nome</FieldLabel>
              <input {...register('nome')} placeholder="Nome completo" className={inputClass} />
              <FieldError message={errors.nome?.message} />
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel required>Tipo de atendimento</FieldLabel>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" value="particular" {...register('tipo')} className="accent-primary" />
                  Particular
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="radio" value="convenio" {...register('tipo')} className="accent-primary" />
                  Convênio
                </label>
              </div>
            </div>

            {tipo === 'convenio' && (
              <div className="flex flex-col gap-1">
                <FieldLabel required>Plano de saúde</FieldLabel>
                <select {...register('convenio_id')} className={inputClass}>
                  <option value="">Selecionar...</option>
                  {convenios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <FieldError message={errors.convenio_id?.message} />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <FieldLabel>WhatsApp</FieldLabel>
              <input {...register('telefone')} placeholder="(11) 99999-9999" className={inputClass} />
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel>E-mail</FieldLabel>
              <input {...register('email')} type="email" placeholder="email@exemplo.com" className={inputClass} />
              <FieldError message={errors.email?.message} />
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel>Data de nascimento</FieldLabel>
              <input {...register('data_nascimento')} type="date" className={inputClass} />
            </div>

            <div className="flex flex-col gap-1">
              <FieldLabel>Notas</FieldLabel>
              <textarea
                {...register('notas')}
                placeholder="Informações adicionais sobre o paciente"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted resize-none"
              />
            </div>
          </div>
        )}

        {/* ─── Step 2: Sessão ─── */}
        {step === 2 && (
          <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Sessão</p>

            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                <FieldLabel required>Modalidade</FieldLabel>
                <select {...register('modalidade_sessao_id')} className={inputClass}>
                  <option value="">Selecionar...</option>
                  {modalidadesSessao.map(m => <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>)}
                </select>
                <FieldError message={errors.modalidade_sessao_id?.message} />
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[120px]">
                <FieldLabel required>Meio</FieldLabel>
                <select {...register('meio_atendimento_id')} className={inputClass}>
                  <option value="">Selecionar...</option>
                  {meiosAtendimento.map(m => <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>)}
                </select>
                <FieldError message={errors.meio_atendimento_id?.message} />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel required>Duração</FieldLabel>
                <select value={duracaoPadrao} onChange={e => setDuracaoPadrao(Number(e.target.value))} className={selectClass}>
                  {DURACOES.map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
              </div>
            </div>

            {/* Horários semanais */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Horários semanais</p>
                <button type="button" onClick={adicionarSlot} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors">
                  <Plus size={14} />
                  Adicionar horário
                </button>
              </div>

              {slots.length === 0 && (
                <p className="text-sm text-muted">Defina os dias e horários recorrentes. As sessões serão criadas automaticamente.</p>
              )}

              {slots.map((slot, i) => {
                const conflito = checkSlotConflict(slot, allActiveSlots)
                return (
                  <div key={i} className={`flex flex-col gap-2 pb-3 border-b border-border last:border-0 last:pb-0`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="text"
                        placeholder="Nome do horário (ex: Sessão semanal)"
                        value={slot.nome}
                        onChange={e => atualizarSlot(i, 'nome', e.target.value)}
                        className={`${inputClass} flex-1 min-w-[140px]`}
                      />
                      <button type="button" onClick={() => removerSlot(i)} className="text-muted hover:text-[#E07070] transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select value={slot.dia_semana} onChange={e => atualizarSlot(i, 'dia_semana', Number(e.target.value))} className={selectClass}>
                        {DIAS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </select>
                      <input type="time" value={slot.horario} onChange={e => atualizarSlot(i, 'horario', e.target.value)} className={`${selectClass} w-28`} />
                      <div className="flex items-center gap-1">
                        {[{ label: 'Semanal', value: 1 }, { label: 'Quinzenal', value: 2 }, { label: 'Mensal', value: 4 }].map(opt => (
                          <button
                            key={opt.value} type="button"
                            onClick={() => atualizarSlot(i, 'intervalo_semanas', opt.value)}
                            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${slot.intervalo_semanas === opt.value ? 'bg-primary text-white border-primary' : 'border-border text-[#1C1C1C] hover:border-primary'}`}
                          >{opt.label}</button>
                        ))}
                        <input
                          type="number" min="1" max="52"
                          value={slot.intervalo_semanas}
                          onChange={e => atualizarSlot(i, 'intervalo_semanas', Math.max(1, Number(e.target.value)))}
                          className={`${selectClass} w-16 text-center`}
                          title="Intervalo em semanas"
                        />
                        <span className="text-xs text-muted">sem.</span>
                      </div>
                      <label className="flex items-center gap-1.5 text-sm cursor-pointer whitespace-nowrap">
                        <input type="checkbox" checked={slot.is_pacote} onChange={e => atualizarSlot(i, 'is_pacote', e.target.checked)} className="w-4 h-4 accent-primary" />
                        É pacote
                      </label>
                    </div>
                    {conflito ? (
                      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                        ⚠️ Conflito: outro paciente ocupa {DIAS.find(d => d.value === conflito.dia_semana)?.label} {conflito.horario}–{addMinutesToTime(conflito.horario, conflito.duracao_minutos)} ({conflito.duracao_minutos} min)
                      </div>
                    ) : slot.nome ? (
                      <div className="text-xs text-[#4CAF82]">✓ Horário disponível</div>
                    ) : null}
                  </div>
                )
              })}

              {slots.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-[#1C1C1C] whitespace-nowrap">Gerar para as próximas</label>
                  <input type="number" min="1" max="52" value={semanas} onChange={e => setSemanas(Math.max(1, Number(e.target.value)))} className={`${selectClass} w-20`} />
                  <span className="text-sm text-[#1C1C1C]">semanas</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Step 3: Cobrança ─── */}
        {step === 3 && (
          <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">Cobrança</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" {...register('tem_contrato')} className="w-4 h-4 accent-primary" />
                <span className="text-sm text-[#1C1C1C]">Definir agora</span>
              </label>
            </div>

            {temContrato && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <FieldLabel>Tipo de cobrança</FieldLabel>
                  <select {...register('contrato_tipo')} className={inputClass}>
                    <option value="">Selecionar...</option>
                    <option value="por_sessao">Por sessão</option>
                    <option value="pacote">Pacote de sessões</option>
                    <option value="mensal">Mensal</option>
                  </select>
                  <FieldError message={errors.contrato_tipo?.message} />
                </div>
                <div className="flex flex-col gap-1">
                  <FieldLabel>Valor (R$)</FieldLabel>
                  <input {...register('contrato_valor')} type="number" step="0.01" min="0" placeholder="0,00" className={inputClass} />
                  <FieldError message={errors.contrato_valor?.message} />
                </div>
                {contratoTipo === 'pacote' && (
                  <div className="flex flex-col gap-1">
                    <FieldLabel>Quantidade de sessões</FieldLabel>
                    <input {...register('contrato_qtd_sessoes')} type="number" min="1" placeholder="Ex: 10" className={inputClass} />
                    <FieldError message={errors.contrato_qtd_sessoes?.message} />
                  </div>
                )}
                {contratoTipo === 'mensal' && (
                  <div className="flex flex-col gap-1">
                    <FieldLabel>Dia de vencimento</FieldLabel>
                    <input {...register('contrato_dia_vencimento')} type="number" min="1" max="31" placeholder="Ex: 5" className={inputClass} />
                    <FieldError message={errors.contrato_dia_vencimento?.message} />
                  </div>
                )}
              </div>
            )}

            {tipo === 'convenio' && !temContrato && (
              <p className="text-sm text-muted">Pacientes de convênio geralmente não precisam de contrato — o valor é definido pelo plano.</p>
            )}
            {!temContrato && tipo === 'particular' && (
              <p className="text-sm text-muted">Você pode definir a forma de cobrança depois no perfil do paciente.</p>
            )}
          </div>
        )}

        {serverError && <p className="text-sm text-[#E07070] text-center">{serverError}</p>}

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 1 ? (
            <button type="button" onClick={() => setStep(s => (s - 1) as Step)}
              className="flex-1 h-10 flex items-center justify-center rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors">
              ← Anterior
            </button>
          ) : (
            <Link to="/pacientes" className="flex-1 h-10 flex items-center justify-center rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors">
              Cancelar
            </Link>
          )}

          {step < 3 ? (
            <button type="button" onClick={handleNext}
              disabled={step === 2 && algumConflito}
              className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              Próximo →
            </button>
          ) : (
            <button type="submit" disabled={isSubmitting}
              className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd C:\Users\yurig\Documents\Antigravity\Psicologo && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm test -- --run
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/NovoPacientePage.tsx
git commit -m "feat(patients): 3-step wizard registration with conflict detection and notas"
```

---

### Task 8: EditarPacientePage — notas field + slots section

**Files:**
- Modify: `src/pages/EditarPacientePage.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/pages/EditarPacientePage.tsx`, add:

```typescript
import { useState } from 'react'
import { Plus, Pencil, ArchiveX } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSlotsSemanais } from '@/hooks/useSlotsSemanais'
import { useAllActiveSlots } from '@/hooks/useAllActiveSlots'
import { checkSlotConflict, addMinutesToTime } from '@/lib/conflictCheck'
import { gerarSessoesParaSlot } from '@/lib/sessaoUtils'
import type { SlotSemanal, SlotSemanalInput } from '@/lib/types'
```

- [ ] **Step 2: Add notas to the schema**

In the `schema` object, add after `meio_atendimento_id`:

```typescript
notas: z.string().optional(),
```

- [ ] **Step 3: Add notas to reset() and onSubmit**

In the `useEffect` reset call, add:
```typescript
notas: paciente.notas ?? '',
```

In `onSubmit`, add `notas` to the `updatePaciente` call:
```typescript
notas: data.notas || null,
```

- [ ] **Step 4: Add notas textarea to the Dados pessoais section**

After the `data_nascimento` field in the form JSX, add:

```tsx
<div className="flex flex-col gap-1">
  <label className="text-sm font-medium text-[#1C1C1C]">Notas</label>
  <textarea
    {...register('notas')}
    placeholder="Informações adicionais sobre o paciente"
    rows={3}
    className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted resize-none"
  />
</div>
```

- [ ] **Step 5: Add slot state and helpers inside EditarPacientePage**

After the existing state declarations (`tipo`, `temContrato`, `contratoTipo`), add:

```typescript
const { slots, loading: slotsLoading, refetch: refetchSlots, updateSlot, deactivateSlot } = useSlotsSemanais(id!)
const { slots: allActiveSlots } = useAllActiveSlots()
const [editingSlot, setEditingSlot] = useState<SlotSemanal | null>(null)
const [newSlot, setNewSlot] = useState<SlotSemanalInput | null>(null)
const [salvandoSlot, setSalvandoSlot] = useState(false)
const [slotErro, setSlotErro] = useState<string | null>(null)

const DIAS_EDIT = [
  { value: 1, label: 'Segunda' }, { value: 2, label: 'Terça' }, { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' }, { value: 5, label: 'Sexta' }, { value: 6, label: 'Sábado' }, { value: 0, label: 'Domingo' },
]
const DURACOES_EDIT = [30, 45, 50, 60, 90]

const inputClassEdit = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
const selectClassEdit = "h-9 px-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

async function handleSaveEditingSlot() {
  if (!editingSlot) return
  const conflito = checkSlotConflict(editingSlot, allActiveSlots)
  if (conflito) return
  setSalvandoSlot(true)
  setSlotErro(null)
  try {
    await updateSlot(editingSlot)
    setEditingSlot(null)
  } catch {
    setSlotErro('Erro ao salvar horário. Tente novamente.')
  } finally {
    setSalvandoSlot(false)
  }
}

async function handleDeactivateSlot(slotId: string) {
  setSalvandoSlot(true)
  setSlotErro(null)
  try {
    await deactivateSlot(slotId)
  } catch {
    setSlotErro('Erro ao desativar horário.')
  } finally {
    setSalvandoSlot(false)
  }
}

async function handleAddSlot() {
  if (!newSlot || !paciente) return
  const conflito = checkSlotConflict(newSlot, allActiveSlots)
  if (conflito) return
  setSalvandoSlot(true)
  setSlotErro(null)
  try {
    const { data: inserted, error: slotErr } = await supabase
      .from('slots_semanais')
      .insert({
        paciente_id: id!,
        nome: newSlot.nome,
        dia_semana: newSlot.dia_semana,
        horario: newSlot.horario,
        duracao_minutos: newSlot.duracao_minutos,
        intervalo_semanas: newSlot.intervalo_semanas,
        is_pacote: newSlot.is_pacote,
        ativo: true,
      })
      .select('id')
      .single()
    if (slotErr) throw slotErr

    const sessoesBulk = gerarSessoesParaSlot(
      id!,
      paciente.modalidade_sessao_id ?? '',
      paciente.meio_atendimento_id ?? '',
      newSlot,
      8,
    )
    if (sessoesBulk.length > 0) {
      const { error: sessErr } = await supabase.from('sessoes').insert(sessoesBulk)
      if (sessErr) throw sessErr
    }

    setNewSlot(null)
    await refetchSlots()
  } catch {
    setSlotErro('Erro ao adicionar horário. Tente novamente.')
  } finally {
    setSalvandoSlot(false)
  }
}
```

- [ ] **Step 6: Add slots section JSX**

After the closing `</div>` of the "Cobrança" section and before the `{errors.root && ...}` error line, add a new card:

```tsx
{/* Horários semanais */}
{!slotsLoading && (
  <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
    <div className="flex items-center justify-between">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide">Horários semanais</p>
      {!newSlot && (
        <button
          type="button"
          onClick={() => setNewSlot({ nome: '', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1, duracao_minutos: 50 })}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={14} />
          Adicionar horário
        </button>
      )}
    </div>

    {slots.length === 0 && !newSlot && (
      <p className="text-sm text-muted">Nenhum horário recorrente cadastrado.</p>
    )}

    {slots.map(slot => {
      const isEditing = editingSlot?.id === slot.id
      const conflito = isEditing ? checkSlotConflict(editingSlot, allActiveSlots) : null
      return (
        <div key={slot.id} className="flex flex-col gap-2 pb-3 border-b border-border last:border-0 last:pb-0">
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                placeholder="Nome do horário"
                value={editingSlot.nome ?? ''}
                onChange={e => setEditingSlot(p => p ? { ...p, nome: e.target.value } : null)}
                className={inputClassEdit}
              />
              <div className="flex gap-2 flex-wrap">
                <select value={editingSlot.dia_semana} onChange={e => setEditingSlot(p => p ? { ...p, dia_semana: Number(e.target.value) } : null)} className={selectClassEdit}>
                  {DIAS_EDIT.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                <input type="time" value={editingSlot.horario} onChange={e => setEditingSlot(p => p ? { ...p, horario: e.target.value } : null)} className={`${selectClassEdit} w-28`} />
                <select value={editingSlot.duracao_minutos} onChange={e => setEditingSlot(p => p ? { ...p, duracao_minutos: Number(e.target.value) } : null)} className={selectClassEdit}>
                  {DURACOES_EDIT.map(d => <option key={d} value={d}>{d} min</option>)}
                </select>
                <div className="flex items-center gap-1">
                  {[{ label: 'Semanal', value: 1 }, { label: 'Quinzenal', value: 2 }, { label: 'Mensal', value: 4 }].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setEditingSlot(p => p ? { ...p, intervalo_semanas: opt.value } : null)}
                      className={`text-xs px-2 py-1 rounded-lg border transition-colors ${editingSlot.intervalo_semanas === opt.value ? 'bg-primary text-white border-primary' : 'border-border text-[#1C1C1C] hover:border-primary'}`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              {conflito && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                  ⚠️ Conflito: outro paciente ocupa {DIAS_EDIT.find(d => d.value === conflito.dia_semana)?.label} {conflito.horario}–{addMinutesToTime(conflito.horario, conflito.duracao_minutos)}
                </div>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setEditingSlot(null)}
                  className="flex-1 h-8 rounded-lg border border-border text-xs text-[#1C1C1C] hover:bg-bg transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={handleSaveEditingSlot}
                  disabled={!!conflito || salvandoSlot}
                  className="flex-1 h-8 bg-primary text-white text-xs rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {salvandoSlot ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-[#1C1C1C]">{slot.nome}</span>
                <span className="text-xs text-muted">
                  {DIAS_EDIT.find(d => d.value === slot.dia_semana)?.label} {slot.horario} · {slot.duracao_minutos} min ·{' '}
                  {slot.intervalo_semanas === 1 ? 'Semanal' : slot.intervalo_semanas === 2 ? 'Quinzenal' : slot.intervalo_semanas === 4 ? 'Mensal' : `a cada ${slot.intervalo_semanas} sem.`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setEditingSlot({ ...slot })}
                  className="text-muted hover:text-[#1C1C1C] transition-colors" title="Editar horário">
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => handleDeactivateSlot(slot.id)}
                  disabled={salvandoSlot}
                  className="text-muted hover:text-[#E07070] transition-colors disabled:opacity-40" title="Desativar horário">
                  <ArchiveX size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      )
    })}

    {/* New slot form */}
    {newSlot && (
      <div className="flex flex-col gap-2 pt-2 border-t border-border">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Novo horário</p>
        <input
          type="text"
          placeholder="Nome do horário (ex: Sessão semanal)"
          value={newSlot.nome}
          onChange={e => setNewSlot(p => p ? { ...p, nome: e.target.value } : null)}
          className={inputClassEdit}
        />
        <div className="flex gap-2 flex-wrap">
          <select value={newSlot.dia_semana} onChange={e => setNewSlot(p => p ? { ...p, dia_semana: Number(e.target.value) } : null)} className={selectClassEdit}>
            {DIAS_EDIT.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
          <input type="time" value={newSlot.horario} onChange={e => setNewSlot(p => p ? { ...p, horario: e.target.value } : null)} className={`${selectClassEdit} w-28`} />
          <select value={newSlot.duracao_minutos} onChange={e => setNewSlot(p => p ? { ...p, duracao_minutos: Number(e.target.value) } : null)} className={selectClassEdit}>
            {DURACOES_EDIT.map(d => <option key={d} value={d}>{d} min</option>)}
          </select>
        </div>
        {checkSlotConflict(newSlot, allActiveSlots) && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
            ⚠️ Conflito: horário já ocupado por outro paciente.
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => setNewSlot(null)}
            className="flex-1 h-8 rounded-lg border border-border text-xs text-[#1C1C1C] hover:bg-bg transition-colors">
            Cancelar
          </button>
          <button type="button" onClick={handleAddSlot}
            disabled={!!checkSlotConflict(newSlot, allActiveSlots) || salvandoSlot || !newSlot.nome.trim()}
            className="flex-1 h-8 bg-primary text-white text-xs rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
            {salvandoSlot ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>
    )}

    {slotErro && <p className="text-xs text-[#E07070] text-center">{slotErro}</p>}
  </div>
)}
```

- [ ] **Step 7: Run TypeScript check**

```bash
cd C:\Users\yurig\Documents\Antigravity\Psicologo && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 8: Run all tests**

```bash
npm test -- --run
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add src/pages/EditarPacientePage.tsx
git commit -m "feat(patients): add notas field and slot editing to EditarPacientePage"
```
