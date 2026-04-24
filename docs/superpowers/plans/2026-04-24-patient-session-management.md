# Patient & Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove modality/attendance duplication from weekly slots, unlock recurrence intervals, add session editing to the panel, wire AgendaPage card click, and add CSV export/import for patients.

**Architecture:** Three independent subsystems — (1) DB migration + patient form refactor removing slot-level modality and adding `intervalo_semanas`; (2) `SessaoPanel` extracted to its own file, extended with inline edit mode, wired to AgendaPage; (3) `csv.ts` utility powering export download and import modal on PacientesPage. No new Edge Functions or tables.

**Tech Stack:** React + TypeScript + react-hook-form + Zod, Supabase JS SDK, Vitest, TailwindCSS, date-fns

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/013_slot_recurrence.sql` |
| Create | `src/lib/sessaoUtils.ts` |
| Create | `src/lib/__tests__/sessaoUtils.test.ts` |
| Modify | `src/lib/types.ts` |
| Modify | `src/pages/NovoPacientePage.tsx` |
| Create | `src/lib/csv.ts` |
| Create | `src/lib/__tests__/csv.test.ts` |
| Create | `src/components/sessao/SessaoPanel.tsx` |
| Modify | `src/pages/KanbanPage.tsx` |
| Modify | `src/pages/AgendaPage.tsx` |
| Create | `src/components/pacientes/ImportarPacientesModal.tsx` |
| Modify | `src/pages/PacientesPage.tsx` |

---

### Task 1: DB migration — nullable slot modality + intervalo_semanas

**Files:**
- Create: `supabase/migrations/013_slot_recurrence.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/013_slot_recurrence.sql
-- slots_semanais: modality/attendance now optional (inherited from patient)
-- and recurrence interval replaces fixed weekly assumption

alter table slots_semanais
  alter column modalidade_sessao_id drop not null,
  alter column meio_atendimento_id  drop not null,
  add column intervalo_semanas int not null default 1
    check (intervalo_semanas >= 1);
```

- [ ] **Step 2: Apply the migration**

Open Supabase dashboard → SQL Editor, paste the SQL above and run.

Expected: no errors. If `modalidade_sessao_id` was already nullable, Postgres will silently succeed.

- [ ] **Step 3: Verify**

Run in SQL editor:
```sql
select column_name, is_nullable, column_default
from information_schema.columns
where table_name = 'slots_semanais'
  and column_name in ('modalidade_sessao_id', 'meio_atendimento_id', 'intervalo_semanas');
```

Expected: `modalidade_sessao_id` and `meio_atendimento_id` show `is_nullable = YES`; `intervalo_semanas` shows `column_default = 1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/013_slot_recurrence.sql
git commit -m "feat(db): slots — nullable modality, add intervalo_semanas"
```

---

### Task 2: Extract gerarSessoesParaSlot to sessaoUtils.ts + tests

**Files:**
- Create: `src/lib/sessaoUtils.ts`
- Create: `src/lib/__tests__/sessaoUtils.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/sessaoUtils.test.ts
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { gerarSessoesParaSlot } from '../sessaoUtils'

// Fix system time to Monday 2026-04-27 09:00 UTC
const FIXED_NOW = new Date('2026-04-27T09:00:00.000Z')

describe('gerarSessoesParaSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('generates semanal sessions (intervalo=1): one per week', () => {
    const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1 }
    const result = gerarSessoesParaSlot('pac-1', 'mod-1', 'meio-1', slot, 4)
    expect(result).toHaveLength(4)
    const diff = new Date(result[1].data_hora).getTime() - new Date(result[0].data_hora).getTime()
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('generates quinzenal sessions (intervalo=2): one every 2 weeks, ceil(4/2)=2 total', () => {
    const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 2 }
    const result = gerarSessoesParaSlot('pac-1', 'mod-1', 'meio-1', slot, 4)
    expect(result).toHaveLength(2)
    const diff = new Date(result[1].data_hora).getTime() - new Date(result[0].data_hora).getTime()
    expect(diff).toBe(14 * 24 * 60 * 60 * 1000)
  })

  it('uses provided modalidade and meio, not hardcoded', () => {
    const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1 }
    const result = gerarSessoesParaSlot('pac-1', 'mod-xyz', 'meio-xyz', slot, 1)
    expect(result[0].modalidade_sessao_id).toBe('mod-xyz')
    expect(result[0].meio_atendimento_id).toBe('meio-xyz')
  })

  it('marks sessions pago=true when is_pacote=true', () => {
    const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: true, intervalo_semanas: 1 }
    const result = gerarSessoesParaSlot('pac-1', 'mod-1', 'meio-1', slot, 1)
    expect(result[0].pago).toBe(true)
    expect(result[0].data_pagamento).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --run src/lib/__tests__/sessaoUtils.test.ts
```

Expected: `Cannot find module '../sessaoUtils'`

- [ ] **Step 3: Create sessaoUtils.ts**

```typescript
// src/lib/sessaoUtils.ts
import { startOfDay, getDay, nextDay, addWeeks, setHours, setMinutes } from 'date-fns'
import type { Day } from 'date-fns'
import type { SessaoStatus } from './types'

export interface SlotInput {
  nome: string
  dia_semana: number
  horario: string
  is_pacote: boolean
  intervalo_semanas: number
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
      duracao_minutos: 50,
    }
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --run src/lib/__tests__/sessaoUtils.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sessaoUtils.ts src/lib/__tests__/sessaoUtils.test.ts
git commit -m "feat(lib): extract gerarSessoesParaSlot with interval support"
```

---

### Task 3: Update types — SlotSemanalInput and SlotSemanal

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/__tests__/types.test.ts  (file already exists — add these cases)
```

The existing `types.test.ts` only does smoke tests. Open it and add:

```typescript
import type { SlotSemanalInput, SlotSemanal } from '../types'

it('SlotSemanalInput has intervalo_semanas and no modality fields', () => {
  const input: SlotSemanalInput = {
    nome: 'S',
    dia_semana: 1,
    horario: '09:00',
    is_pacote: false,
    intervalo_semanas: 2,
  }
  // TypeScript compile error if shape is wrong — this test just confirms shape compiles
  expect(input.intervalo_semanas).toBe(2)
  // @ts-expect-error modalidade_sessao_id removed
  const _x = input.modalidade_sessao_id
})
```

- [ ] **Step 2: Run test to confirm it fails (TypeScript compile error)**

```bash
npm test -- --run src/lib/__tests__/types.test.ts
```

Expected: TypeScript error — `modalidade_sessao_id` exists on the type.

- [ ] **Step 3: Update types.ts**

In `src/lib/types.ts`, replace the two slot interfaces:

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
  ativo: boolean
  data_fim: string | null
  criado_em: string
}

export interface SlotSemanalInput {
  nome: string
  dia_semana: number
  horario: string
  is_pacote: boolean
  intervalo_semanas: number
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test -- --run
```

Expected: all pass. TypeScript may surface errors in `NovoPacientePage.tsx` — those are fixed in Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/__tests__/types.test.ts
git commit -m "feat(types): update SlotSemanalInput — remove modality, add intervalo_semanas"
```

---

### Task 4: NovoPacientePage — slot UI refactor

**Files:**
- Modify: `src/pages/NovoPacientePage.tsx`

- [ ] **Step 1: Update imports at top of NovoPacientePage.tsx**

Replace the existing `import type { ... } from '@/lib/types'` line:

```typescript
import type { ContratoTipo, SessaoStatus, SlotSemanalInput } from '@/lib/types'
import { gerarSessoesParaSlot } from '@/lib/sessaoUtils'
```

Remove the local `gerarSessoesParaSlot` function definition (lines 72–95 in the original file) — it is now imported from `sessaoUtils`.

- [ ] **Step 2: Update adicionarSlot default**

Replace:

```typescript
const adicionarSlot = () =>
  setSlots(p => [...p, { nome: '', dia_semana: 1, horario: '09:00', modalidade_sessao_id: '', meio_atendimento_id: '', is_pacote: false }])
```

With:

```typescript
const adicionarSlot = () =>
  setSlots(p => [...p, { nome: '', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1 }])
```

- [ ] **Step 3: Update slot validation in onSubmit**

Replace:

```typescript
const slotsInvalidos = slots.some(s => !s.modalidade_sessao_id || !s.meio_atendimento_id || !s.horario || !s.nome.trim())
if (slotsInvalidos) {
  setServerError('Preencha modalidade e horário em todos os horários semanais.')
  return
}
```

With:

```typescript
const slotsInvalidos = slots.some(s => !s.horario || !s.nome.trim())
if (slotsInvalidos) {
  setServerError('Preencha o nome e horário em todos os horários semanais.')
  return
}
```

- [ ] **Step 4: Update slot insert and session generation in onSubmit**

Replace the slot insert block:

```typescript
if (slots.length > 0) {
  const { error: slotErr } = await supabase.from('slots_semanais').insert(
    slots.map(s => ({ paciente_id: id, ...s, ativo: true }))
  )
  if (slotErr) throw slotErr

  const sessoesBulk = slots.flatMap(s => gerarSessoesParaSlot(id, s, semanas))
  const { error: sessErr } = await supabase.from('sessoes').insert(sessoesBulk)
  if (sessErr) throw sessErr
}
```

With:

```typescript
if (slots.length > 0) {
  const { error: slotErr } = await supabase.from('slots_semanais').insert(
    slots.map(s => ({
      paciente_id: id,
      nome: s.nome,
      dia_semana: s.dia_semana,
      horario: s.horario,
      is_pacote: s.is_pacote,
      intervalo_semanas: s.intervalo_semanas,
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
```

- [ ] **Step 5: Replace slot row UI**

Inside the `slots.map((slot, i) => ...)` block, remove the two `<select>` elements for `modalidade_sessao_id` and `meio_atendimento_id`. Add a recurrence picker in their place.

Replace the inner flex row (the second `div` inside the slot card that currently contains the day/time/modality/attendance/is_pacote row):

```tsx
<div className="flex items-center gap-2 flex-wrap">
  <select
    value={slot.dia_semana}
    onChange={e => atualizarSlot(i, 'dia_semana', Number(e.target.value))}
    className={selectClass}
  >
    {DIAS.map(d => (
      <option key={d.value} value={d.value}>{d.label}</option>
    ))}
  </select>

  <input
    type="time"
    value={slot.horario}
    onChange={e => atualizarSlot(i, 'horario', e.target.value)}
    className={`${selectClass} w-28`}
  />

  {/* Recurrence picker */}
  <div className="flex items-center gap-1">
    {[
      { label: 'Semanal', value: 1 },
      { label: 'Quinzenal', value: 2 },
      { label: 'Mensal', value: 4 },
    ].map(opt => (
      <button
        key={opt.value}
        type="button"
        onClick={() => atualizarSlot(i, 'intervalo_semanas', opt.value)}
        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
          slot.intervalo_semanas === opt.value
            ? 'bg-primary text-white border-primary'
            : 'border-border text-[#1C1C1C] hover:border-primary'
        }`}
      >
        {opt.label}
      </button>
    ))}
    <input
      type="number"
      min="1"
      max="52"
      value={slot.intervalo_semanas}
      onChange={e => atualizarSlot(i, 'intervalo_semanas', Math.max(1, Number(e.target.value)))}
      className={`${selectClass} w-16 text-center`}
      title="Intervalo em semanas"
    />
    <span className="text-xs text-muted">sem.</span>
  </div>

  <label className="flex items-center gap-1.5 text-sm text-[#1C1C1C] cursor-pointer whitespace-nowrap">
    <input
      type="checkbox"
      checked={slot.is_pacote}
      onChange={e => atualizarSlot(i, 'is_pacote', e.target.checked)}
      className="w-4 h-4 accent-primary"
    />
    É pacote
  </label>
</div>
```

- [ ] **Step 6: Remove unused imports**

Remove `useModalidadesSessao` and `useMeiosAtendimento` imports from `NovoPacientePage.tsx` (and their hook calls `const { modalidadesSessao } = useModalidadesSessao()` etc.) since the slot row no longer uses them.

- [ ] **Step 7: Run all tests**

```bash
npm test -- --run
```

Expected: all 76+ tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/pages/NovoPacientePage.tsx
git commit -m "feat(patients): remove slot-level modality, add recurrence interval picker"
```

---

### Task 5: CSV utility

**Files:**
- Create: `src/lib/csv.ts`
- Create: `src/lib/__tests__/csv.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/__tests__/csv.test.ts
import { describe, it, expect } from 'vitest'
import { buildCsv, parseCsv, PATIENT_CSV_HEADERS } from '../csv'

describe('buildCsv', () => {
  it('outputs header row first', () => {
    const csv = buildCsv([])
    expect(csv.split('\n')[0]).toBe(PATIENT_CSV_HEADERS.join(','))
  })

  it('outputs one data row per patient', () => {
    const rows = [
      { nome: 'Ana', telefone: '11999', email: 'ana@x.com', data_nascimento: '1990-01-01', tipo: 'particular', ativo: 'true' },
    ]
    const lines = buildCsv(rows).split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Ana')
    expect(lines[1]).toContain('11999')
  })

  it('wraps values containing commas in double quotes', () => {
    const rows = [
      { nome: 'Silva, João', telefone: '', email: '', data_nascimento: '', tipo: 'particular', ativo: 'true' },
    ]
    const csv = buildCsv(rows)
    expect(csv).toContain('"Silva, João"')
  })
})

describe('parseCsv', () => {
  it('returns empty array for header-only content', () => {
    expect(parseCsv(PATIENT_CSV_HEADERS.join(','))).toHaveLength(0)
  })

  it('parses a valid data row into keyed object', () => {
    const text = `${PATIENT_CSV_HEADERS.join(',')}\nMaria,11888,,1992-05-10,particular,true`
    const rows = parseCsv(text)
    expect(rows).toHaveLength(1)
    expect(rows[0].nome).toBe('Maria')
    expect(rows[0].tipo).toBe('particular')
    expect(rows[0].data_nascimento).toBe('1992-05-10')
  })

  it('handles quoted values with embedded commas', () => {
    const text = `${PATIENT_CSV_HEADERS.join(',')}\n"Silva, João",,,,particular,true`
    const rows = parseCsv(text)
    expect(rows[0].nome).toBe('Silva, João')
  })

  it('trims whitespace from values', () => {
    const text = `${PATIENT_CSV_HEADERS.join(',')}\n  Pedro , , , , particular , true `
    const rows = parseCsv(text)
    expect(rows[0].nome).toBe('Pedro')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --run src/lib/__tests__/csv.test.ts
```

Expected: `Cannot find module '../csv'`

- [ ] **Step 3: Create csv.ts**

```typescript
// src/lib/csv.ts
export const PATIENT_CSV_HEADERS = [
  'nome', 'telefone', 'email', 'data_nascimento', 'tipo', 'ativo',
] as const

export type PatientCsvRow = Record<typeof PATIENT_CSV_HEADERS[number], string>

export function buildCsv(rows: PatientCsvRow[]): string {
  const lines: string[] = [PATIENT_CSV_HEADERS.join(',')]
  for (const row of rows) {
    const values = PATIENT_CSV_HEADERS.map(h => escapeCsvValue(row[h] ?? ''))
    lines.push(values.join(','))
  }
  return lines.join('\n')
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? '']))
  })
}

function escapeCsvValue(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- --run src/lib/__tests__/csv.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/csv.ts src/lib/__tests__/csv.test.ts
git commit -m "feat(lib): CSV build and parse utility for patient export/import"
```

---

### Task 6: Extract SessaoPanel to its own file

**Files:**
- Create: `src/components/sessao/SessaoPanel.tsx`
- Modify: `src/pages/KanbanPage.tsx`

- [ ] **Step 1: Create SessaoPanel.tsx by extracting from KanbanPage**

The current `SessaoPanel` function starts at line 36 and ends at line 236 in `KanbanPage.tsx`. Create a new file with the extracted component plus its dependencies:

```typescript
// src/components/sessao/SessaoPanel.tsx
import { useState } from 'react'
import { X, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { RemarcarModal } from './RemarcarModal'
import { STATUS_CONFIG } from '@/lib/statusConfig'
import type { FormaPagamento, SessaoStatus, SessaoView } from '@/lib/types'

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Débito' },
  { value: 'cartao_credito', label: 'Crédito' },
]

const STATUS_ACOES: Partial<Record<SessaoStatus, SessaoStatus[]>> = {
  agendada:   ['confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada'],
  confirmada: ['concluida', 'faltou', 'cancelada', 'remarcada'],
}

interface Props {
  sessao: SessaoView
  onClose: () => void
  onUpdate: () => void
}

export function SessaoPanel({ sessao, onClose, onUpdate }: Props) {
  const [remarcarAberto, setRemarcarAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(
    (sessao.forma_pagamento as FormaPagamento | null) ?? null
  )
  const [valorPagamento, setValorPagamento] = useState(
    sessao.valor_cobrado != null ? String(sessao.valor_cobrado) : ''
  )
  const acoes = STATUS_ACOES[sessao.status]
  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const cfg = STATUS_CONFIG[sessao.status]
  const mostrarPagamento = sessao.status === 'concluida' || acoes?.includes('concluida')

  async function atualizar(novoStatus: SessaoStatus) {
    setSalvando(true)
    await supabase.from('sessoes').update({ status: novoStatus }).eq('id', sessao.id)
    onUpdate()
    onClose()
  }

  async function remarcar(novaDataHora: string) {
    setSalvando(true)
    setErro(null)
    try {
      const { error: updateError } = await supabase
        .from('sessoes')
        .update({ status: 'remarcada' })
        .eq('id', sessao.id)
      if (updateError) throw updateError

      const { error: insertError } = await supabase.from('sessoes').insert({
        paciente_id: sessao.paciente_id,
        avulso_nome: sessao.avulso_nome,
        avulso_telefone: sessao.avulso_telefone,
        modalidade_sessao_id: sessao.modalidade_sessao_id,
        meio_atendimento_id: sessao.meio_atendimento_id,
        data_hora: novaDataHora,
        status: 'agendada',
        valor_cobrado: sessao.valor_cobrado,
        pago: false,
        data_pagamento: null,
        sessao_origem_id: sessao.id,
      })
      if (insertError) {
        await supabase.from('sessoes').update({ status: sessao.status }).eq('id', sessao.id)
        throw insertError
      }

      onUpdate()
      onClose()
    } catch {
      setErro('Erro ao remarcar. Tente novamente.')
      setSalvando(false)
    }
  }

  async function confirmarPagamento() {
    if (!formaPagamento) return
    setSalvando(true)
    await supabase.from('sessoes').update({
      pago: true,
      forma_pagamento: formaPagamento,
      valor_cobrado: valorPagamento ? Number(valorPagamento) : null,
      data_pagamento: new Date().toISOString(),
    }).eq('id', sessao.id)
    onUpdate()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-card border border-border w-full max-w-sm p-5 shadow-lg">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="font-medium text-[#1C1C1C]">{nomePaciente}</p>
              <p className="text-xs text-muted mt-0.5">
                {format(new Date(sessao.data_hora), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </p>
              <span
                className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
                style={{ backgroundColor: `${cfg.cor}20`, color: cfg.cor }}
              >
                {cfg.label}
              </span>
            </div>
            <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors ml-4">
              <X size={18} />
            </button>
          </div>

          {acoes ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">Alterar status</p>
              <div className="flex flex-wrap gap-2">
                {acoes.filter(s => s !== 'remarcada').map(s => (
                  <button
                    key={s}
                    disabled={salvando}
                    onClick={() => atualizar(s)}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                    style={{ borderColor: STATUS_CONFIG[s].cor, color: STATUS_CONFIG[s].cor }}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
                <button
                  disabled={salvando}
                  onClick={() => setRemarcarAberto(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                  style={{ borderColor: STATUS_CONFIG.remarcada.cor, color: STATUS_CONFIG.remarcada.cor }}
                >
                  Remarcar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted text-center py-2">Sessão já finalizada.</p>
          )}

          {mostrarPagamento && (
            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
              <p className="text-xs text-muted font-medium uppercase tracking-wide">Pagamento</p>
              {sessao.pago ? (
                <div className="flex items-center gap-2 text-sm text-[#4CAF82]">
                  <CheckCircle2 size={16} />
                  <span>Pago{sessao.forma_pagamento ? ` — ${FORMAS_PAGAMENTO.find(f => f.value === sessao.forma_pagamento)?.label ?? sessao.forma_pagamento}` : ''}</span>
                  {sessao.valor_cobrado != null && (
                    <span className="ml-auto font-medium">R$ {sessao.valor_cobrado.toFixed(2)}</span>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {FORMAS_PAGAMENTO.map(f => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setFormaPagamento(f.value)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          formaPagamento === f.value
                            ? 'bg-primary text-white border-primary'
                            : 'border-border text-[#1C1C1C] hover:border-primary'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Valor (R$)"
                      value={valorPagamento}
                      onChange={e => setValorPagamento(e.target.value)}
                      className="flex-1 h-9 px-3 rounded-lg border border-border text-sm outline-none focus:border-primary"
                    />
                    <button
                      disabled={!formaPagamento || salvando}
                      onClick={confirmarPagamento}
                      className="px-4 h-9 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
                    >
                      Confirmar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {erro && <p className="text-xs text-[#E07070] text-center mt-2">{erro}</p>}
        </div>
      </div>

      {remarcarAberto && (
        <RemarcarModal
          sessao={sessao}
          onClose={() => setRemarcarAberto(false)}
          onConfirmar={async (novaDataHora) => {
            setRemarcarAberto(false)
            await remarcar(novaDataHora)
          }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Update KanbanPage.tsx to use imported SessaoPanel**

At the top of `KanbanPage.tsx`, add:

```typescript
import { SessaoPanel } from '@/components/sessao/SessaoPanel'
```

Delete the `FORMAS_PAGAMENTO`, `STATUS_ACOES`, and `SessaoPanel` function from `KanbanPage.tsx` (lines 18–236). Keep everything else unchanged — the `SessaoPanel` usage at the bottom of `KanbanPage` stays the same since it uses the same props interface.

- [ ] **Step 3: Run all tests**

```bash
npm test -- --run
```

Expected: all tests pass (no behavior changed, just moved code).

- [ ] **Step 4: Commit**

```bash
git add src/components/sessao/SessaoPanel.tsx src/pages/KanbanPage.tsx
git commit -m "refactor(sessao): extract SessaoPanel to reusable component"
```

---

### Task 7: SessaoPanel — inline edit mode

**Files:**
- Modify: `src/components/sessao/SessaoPanel.tsx`

- [ ] **Step 1: Add imports at top of SessaoPanel.tsx**

```typescript
import { Pencil } from 'lucide-react'
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
```

- [ ] **Step 2: Add editando state and edit form data**

Inside the `SessaoPanel` function body, after the existing state declarations, add:

```typescript
const [editando, setEditando] = useState(false)
const [editDataHora, setEditDataHora] = useState(
  sessao.data_hora.slice(0, 16) // datetime-local wants "YYYY-MM-DDTHH:mm"
)
const [editDuracao, setEditDuracao] = useState(String(sessao.duracao_minutos))
const [editValor, setEditValor] = useState(sessao.valor_cobrado != null ? String(sessao.valor_cobrado) : '')
const [editModalidade, setEditModalidade] = useState(sessao.modalidade_sessao_id)
const [editMeio, setEditMeio] = useState(sessao.meio_atendimento_id)
const { modalidadesSessao } = useModalidadesSessao()
const { meiosAtendimento } = useMeiosAtendimento()
const podeEditar = sessao.status === 'agendada' || sessao.status === 'confirmada'
```

- [ ] **Step 3: Add salvarEdicao function**

After the `confirmarPagamento` function, add:

```typescript
async function salvarEdicao() {
  setSalvando(true)
  setErro(null)
  try {
    const { error } = await supabase.from('sessoes').update({
      data_hora: editDataHora,
      duracao_minutos: Number(editDuracao),
      valor_cobrado: editValor ? Number(editValor) : null,
      modalidade_sessao_id: editModalidade,
      meio_atendimento_id: editMeio,
    }).eq('id', sessao.id)
    if (error) throw error
    onUpdate()
    onClose()
  } catch {
    setErro('Erro ao salvar. Tente novamente.')
    setSalvando(false)
  }
}
```

- [ ] **Step 4: Add pencil button to the panel header**

In the JSX, find the `<div className="flex items-start justify-between mb-4">` block. Add the pencil button inside it, after the status badge span and before the close button:

```tsx
<div className="flex items-start justify-between mb-4">
  <div>
    <p className="font-medium text-[#1C1C1C]">{nomePaciente}</p>
    <p className="text-xs text-muted mt-0.5">
      {format(new Date(sessao.data_hora), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
    </p>
    <span
      className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
      style={{ backgroundColor: `${cfg.cor}20`, color: cfg.cor }}
    >
      {cfg.label}
    </span>
  </div>
  <div className="flex items-center gap-2 ml-4">
    {podeEditar && !editando && (
      <button
        onClick={() => setEditando(true)}
        className="text-muted hover:text-[#1C1C1C] transition-colors"
        title="Editar sessão"
      >
        <Pencil size={16} />
      </button>
    )}
    <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
      <X size={18} />
    </button>
  </div>
</div>
```

- [ ] **Step 5: Add edit form block**

After the `<div className="flex items-start justify-between mb-4">` block, add a conditional edit form that replaces the actions section when `editando` is true:

```tsx
{editando ? (
  <div className="flex flex-col gap-3">
    <p className="text-xs text-muted font-medium uppercase tracking-wide">Editar sessão</p>

    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[#1C1C1C]">Data e horário</label>
      <input
        type="datetime-local"
        value={editDataHora}
        onChange={e => setEditDataHora(e.target.value)}
        className="w-full h-9 px-3 rounded-lg border border-border text-sm outline-none focus:border-primary"
      />
    </div>

    <div className="flex gap-2">
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs font-medium text-[#1C1C1C]">Duração</label>
        <select
          value={editDuracao}
          onChange={e => setEditDuracao(e.target.value)}
          className="h-9 px-2 rounded-lg border border-border text-sm outline-none focus:border-primary"
        >
          {['30', '45', '50', '60', '90'].map(d => (
            <option key={d} value={d}>{d} min</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1 flex-1">
        <label className="text-xs font-medium text-[#1C1C1C]">Valor (R$)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={editValor}
          onChange={e => setEditValor(e.target.value)}
          placeholder="0,00"
          className="w-full h-9 px-3 rounded-lg border border-border text-sm outline-none focus:border-primary"
        />
      </div>
    </div>

    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[#1C1C1C]">Modalidade</label>
      <select
        value={editModalidade}
        onChange={e => setEditModalidade(e.target.value)}
        className="w-full h-9 px-2 rounded-lg border border-border text-sm outline-none focus:border-primary"
      >
        {modalidadesSessao.map(m => (
          <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
        ))}
      </select>
    </div>

    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[#1C1C1C]">Meio de atendimento</label>
      <select
        value={editMeio}
        onChange={e => setEditMeio(e.target.value)}
        className="w-full h-9 px-2 rounded-lg border border-border text-sm outline-none focus:border-primary"
      >
        {meiosAtendimento.map(m => (
          <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
        ))}
      </select>
    </div>

    <div className="flex gap-2 mt-1">
      <button
        type="button"
        onClick={() => setEditando(false)}
        className="flex-1 h-9 rounded-lg border border-border text-sm text-[#1C1C1C] hover:bg-bg transition-colors"
      >
        Cancelar
      </button>
      <button
        type="button"
        disabled={salvando}
        onClick={salvarEdicao}
        className="flex-1 h-9 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
      >
        {salvando ? 'Salvando...' : 'Salvar'}
      </button>
    </div>
    {erro && <p className="text-xs text-[#E07070] text-center">{erro}</p>}
  </div>
) : (
  // existing status actions + payment block goes here (no changes to that JSX)
  <>
    {acoes ? ( ... existing actions JSX ... ) : ( ... )}
    {mostrarPagamento && ( ... existing payment JSX ... )}
    {erro && <p className="text-xs text-[#E07070] text-center mt-2">{erro}</p>}
  </>
)}
```

**Important:** The `{editando ? ... : ...}` wrapper replaces the portion of JSX that currently contains the status actions and payment block. The header and the `RemarcarModal` at the bottom stay outside this conditional and are unchanged.

- [ ] **Step 6: Run all tests**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/sessao/SessaoPanel.tsx
git commit -m "feat(sessao): inline edit mode in SessaoPanel — date/time/value/modality"
```

---

### Task 8: AgendaPage — wire SessaoCard click to SessaoPanel

**Files:**
- Modify: `src/pages/AgendaPage.tsx`

- [ ] **Step 1: Update AgendaPage.tsx**

Replace the entire file content with:

```typescript
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarIcon } from 'lucide-react'
import { format, addDays, subDays, isToday, getISOWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSessoesDia } from '@/hooks/useSessoesDia'
import { SessaoCard } from '@/components/sessao/SessaoCard'
import { SessaoPanel } from '@/components/sessao/SessaoPanel'
import { NovaSessaoModal } from '@/components/sessao/NovaSessaoModal'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { SessaoView } from '@/lib/types'

function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function AgendaPage() {
  const [data, setData] = useState(new Date())
  const [calendarAberto, setCalendarAberto] = useState(false)
  const dateStr = toDateString(data)
  const { sessoes, loading, error, refetch } = useSessoesDia(dateStr)
  const [modalAberto, setModalAberto] = useState(false)
  const [sessaoSelecionada, setSessaoSelecionada] = useState<SessaoView | null>(null)

  const semana = getISOWeek(data)
  const tituloData = isToday(data)
    ? 'Hoje'
    : format(data, "EEEE, d 'de' MMMM", { locale: ptBR })

  function selecionarDia(day: Date | undefined) {
    if (!day) return
    setData(day)
    setCalendarAberto(false)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setData(d => subDays(d, 1))}
            className="text-muted hover:text-[#1C1C1C] transition-colors p-1"
          >
            <ChevronLeft size={20} />
          </button>
          <Popover open={calendarAberto} onOpenChange={setCalendarAberto}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-bg transition-colors">
                <CalendarIcon size={14} className="text-muted" />
                <h1 className="font-display text-xl font-semibold text-[#1C1C1C] capitalize">
                  {tituloData}
                </h1>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={data}
                onSelect={selecionarDia}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <button
            onClick={() => setData(d => addDays(d, 1))}
            className="text-muted hover:text-[#1C1C1C] transition-colors p-1"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Semana {semana}</span>
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
            <SessaoCard key={s.id} sessao={s} onClick={() => setSessaoSelecionada(s)} />
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

      {sessaoSelecionada && (
        <SessaoPanel
          sessao={sessaoSelecionada}
          onClose={() => setSessaoSelecionada(null)}
          onUpdate={refetch}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/AgendaPage.tsx
git commit -m "feat(agenda): wire session card click to SessaoPanel"
```

---

### Task 9: PacientesPage — CSV export

**Files:**
- Modify: `src/pages/PacientesPage.tsx`

- [ ] **Step 1: Add export function and button to PacientesPage.tsx**

Add the following import at the top:

```typescript
import { buildCsv } from '@/lib/csv'
import type { PatientCsvRow } from '@/lib/csv'
```

Inside `PacientesPage`, after the existing state declarations, add the export handler:

```typescript
function exportarCsv() {
  const rows: PatientCsvRow[] = pacientes.map(p => ({
    nome: p.nome,
    telefone: p.telefone ?? '',
    email: p.email ?? '',
    data_nascimento: p.data_nascimento ?? '',
    tipo: p.tipo,
    ativo: String(p.ativo),
  }))
  const csv = buildCsv(rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'pacientes.csv'
  a.click()
  URL.revokeObjectURL(url)
}
```

In the header JSX, replace:

```tsx
<div className="flex items-center justify-between mb-4">
  <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Pacientes</h1>
  <Link
    to="/pacientes/novo"
    className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
  >
    <Plus size={16} />
    Novo
  </Link>
</div>
```

With:

```tsx
<div className="flex items-center justify-between mb-4">
  <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Pacientes</h1>
  <div className="flex items-center gap-2">
    <button
      onClick={exportarCsv}
      disabled={loading || pacientes.length === 0}
      className="text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg transition-colors disabled:opacity-40"
    >
      Exportar CSV
    </button>
    <Link
      to="/pacientes/novo"
      className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
    >
      <Plus size={16} />
      Novo
    </Link>
  </div>
</div>
```

- [ ] **Step 2: Run all tests**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PacientesPage.tsx
git commit -m "feat(pacientes): CSV export button"
```

---

### Task 10: PacientesPage — CSV import

**Files:**
- Create: `src/components/pacientes/ImportarPacientesModal.tsx`
- Modify: `src/pages/PacientesPage.tsx`

- [ ] **Step 1: Create ImportarPacientesModal.tsx**

```typescript
// src/components/pacientes/ImportarPacientesModal.tsx
import { useState } from 'react'
import { X, AlertCircle, CheckCircle2, MinusCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface ParsedRow {
  nome: string
  telefone: string
  email: string
  data_nascimento: string
  tipo: 'particular' | 'convenio'
  ativo: boolean
  _status: 'valid' | 'invalid' | 'duplicate'
  _error?: string
}

interface Props {
  rawRows: Record<string, string>[]
  existentes: { nome: string; telefone: string | null }[]
  onClose: () => void
  onImportado: () => void
}

function validarRow(raw: Record<string, string>, existentes: { nome: string; telefone: string | null }[]): ParsedRow {
  const nome = raw.nome?.trim() ?? ''
  const telefone = raw.telefone?.trim() ?? ''
  const email = raw.email?.trim() ?? ''
  const data_nascimento = raw.data_nascimento?.trim() ?? ''
  const tipoRaw = raw.tipo?.trim().toLowerCase()
  const tipo: 'particular' | 'convenio' = tipoRaw === 'convenio' ? 'convenio' : 'particular'
  const ativoRaw = raw.ativo?.trim().toLowerCase()
  const ativo = ativoRaw === 'false' ? false : true

  if (!nome) {
    return { nome, telefone, email, data_nascimento, tipo, ativo, _status: 'invalid', _error: 'Nome obrigatório' }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { nome, telefone, email, data_nascimento, tipo, ativo, _status: 'invalid', _error: 'E-mail inválido' }
  }

  const isDuplicate = existentes.some(
    e => e.nome.toLowerCase() === nome.toLowerCase() && (e.telefone ?? '') === telefone
  )
  if (isDuplicate) {
    return { nome, telefone, email, data_nascimento, tipo, ativo, _status: 'duplicate' }
  }

  return { nome, telefone, email, data_nascimento, tipo, ativo, _status: 'valid' }
}

export function ImportarPacientesModal({ rawRows, existentes, onClose, onImportado }: Props) {
  const rows: ParsedRow[] = rawRows.map(r => validarRow(r, existentes))
  const validos = rows.filter(r => r._status === 'valid')
  const invalidos = rows.filter(r => r._status === 'invalid').length
  const duplicados = rows.filter(r => r._status === 'duplicate').length

  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function confirmarImport() {
    setImportando(true)
    setErro(null)
    try {
      const { error } = await supabase.from('pacientes').insert(
        validos.map(r => ({
          nome: r.nome,
          telefone: r.telefone || null,
          email: r.email || null,
          data_nascimento: r.data_nascimento || null,
          tipo: r.tipo,
          ativo: r.ativo,
          modalidade_sessao_id: null,
          meio_atendimento_id: null,
        }))
      )
      if (error) throw error
      onImportado()
      onClose()
    } catch {
      setErro('Erro ao importar. Tente novamente.')
      setImportando(false)
    }
  }

  const statusIcon = {
    valid: <CheckCircle2 size={14} className="text-[#4CAF82] shrink-0" />,
    invalid: <AlertCircle size={14} className="text-[#E07070] shrink-0" />,
    duplicate: <MinusCircle size={14} className="text-muted shrink-0" />,
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-2xl shadow-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="font-display font-semibold text-[#1C1C1C]">Importar pacientes</p>
            <p className="text-xs text-muted mt-0.5">
              {validos.length} válidos · {duplicados} duplicados · {invalidos} com erros
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left pb-2 font-medium w-6"></th>
                <th className="text-left pb-2 font-medium">Nome</th>
                <th className="text-left pb-2 font-medium">Telefone</th>
                <th className="text-left pb-2 font-medium">E-mail</th>
                <th className="text-left pb-2 font-medium">Tipo</th>
                <th className="text-left pb-2 font-medium">Obs.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={`border-b border-border/50 last:border-0 ${
                    r._status === 'invalid' ? 'bg-[#E07070]/5' :
                    r._status === 'duplicate' ? 'opacity-50' : ''
                  }`}
                >
                  <td className="py-1.5 pr-2">{statusIcon[r._status]}</td>
                  <td className="py-1.5 pr-3 font-medium text-[#1C1C1C]">{r.nome || '—'}</td>
                  <td className="py-1.5 pr-3 text-muted">{r.telefone || '—'}</td>
                  <td className="py-1.5 pr-3 text-muted">{r.email || '—'}</td>
                  <td className="py-1.5 pr-3 text-muted capitalize">{r.tipo}</td>
                  <td className="py-1.5 text-[#E07070]">
                    {r._status === 'invalid' ? r._error : r._status === 'duplicate' ? 'Duplicado' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-between flex-shrink-0">
          {erro && <p className="text-xs text-[#E07070]">{erro}</p>}
          {!erro && <span />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 h-9 text-sm border border-border rounded-lg text-[#1C1C1C] hover:bg-bg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarImport}
              disabled={validos.length === 0 || importando}
              className="px-4 h-9 text-sm bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {importando ? 'Importando...' : `Importar ${validos.length} paciente${validos.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Note on `modalidade_sessao_id` / `meio_atendimento_id`:** The `pacientes` table has these columns. Imported patients get `null` for both — the psychologist sets them later via Editar Paciente. This requires those columns to be nullable on the `pacientes` table. Check with:

```sql
select column_name, is_nullable
from information_schema.columns
where table_name = 'pacientes'
  and column_name in ('modalidade_sessao_id', 'meio_atendimento_id');
```

If either shows `is_nullable = NO`, run:

```sql
alter table pacientes
  alter column modalidade_sessao_id drop not null,
  alter column meio_atendimento_id  drop not null;
```

Add this to migration `013_slot_recurrence.sql` (or create `014_pacientes_nullable_modality.sql`).

- [ ] **Step 2: Update PacientesPage.tsx to add import flow**

Add imports:

```typescript
import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { parseCsv } from '@/lib/csv'
import { ImportarPacientesModal } from '@/components/pacientes/ImportarPacientesModal'
```

Add state inside `PacientesPage`:

```typescript
const fileInputRef = useRef<HTMLInputElement>(null)
const [importRows, setImportRows] = useState<Record<string, string>[] | null>(null)
```

Add the file handler function:

```typescript
function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = ev => {
    const text = ev.target?.result as string
    const rows = parseCsv(text)
    setImportRows(rows.length > 0 ? rows : [])
  }
  reader.readAsText(file)
  e.target.value = '' // reset so same file can be re-selected
}
```

Add the hidden file input and "Importar CSV" button to the header JSX (alongside the existing export button):

```tsx
<>
  <input
    ref={fileInputRef}
    type="file"
    accept=".csv"
    className="hidden"
    onChange={handleArquivoSelecionado}
  />
  <button
    onClick={() => fileInputRef.current?.click()}
    className="flex items-center gap-1.5 text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg transition-colors"
  >
    <Upload size={14} />
    Importar CSV
  </button>
  <button
    onClick={exportarCsv}
    disabled={loading || pacientes.length === 0}
    className="text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg transition-colors disabled:opacity-40"
  >
    Exportar CSV
  </button>
  <Link
    to="/pacientes/novo"
    className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
  >
    <Plus size={16} />
    Novo
  </Link>
</>
```

At the bottom of the return, before the closing `</div>`, add:

```tsx
{importRows !== null && (
  <ImportarPacientesModal
    rawRows={importRows}
    existentes={pacientes.map(p => ({ nome: p.nome, telefone: p.telefone }))}
    onClose={() => setImportRows(null)}
    onImportado={() => { setImportRows(null); window.location.reload() }}
  />
)}
```

- [ ] **Step 3: Run all tests**

```bash
npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/pacientes/ImportarPacientesModal.tsx src/pages/PacientesPage.tsx
git commit -m "feat(pacientes): CSV import with preview modal and duplicate detection"
```
