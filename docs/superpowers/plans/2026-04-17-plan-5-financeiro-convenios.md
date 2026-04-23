# Financeiro + Convênios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Financials module (4-tab dashboard: Resumo, Pacientes, Repasses, Despesas) and add health insurance (convênio) support across patient registration, session creation, and onboarding.

**Architecture:** Direct Supabase queries from React hooks; no global state. FinanceiroPage uses three hooks (useFinanceiro, useRepasses, useDespesas) each scoped to a selected month. Convênio data is joined into usePacientes so NovaSessaoModal can auto-fill session values without an extra query.

**Tech Stack:** React + TypeScript + Vite, Supabase JS, Recharts (already installed), react-hook-form + zod, date-fns v4, TailwindCSS.

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `supabase/migrations/005_convenios.sql` | `convenios` table, `tipo`/`convenio_id` on `pacientes`, `mes`/nullable `sessao_id` on `repasses` |
| Create | `supabase/migrations/006_despesas.sql` | `despesas` table |
| Modify | `src/lib/types.ts` | Add `Convenio`, `Despesa`, `PacienteComConvenio`; extend `Paciente` |
| Create | `src/hooks/useConvenios.ts` | CRUD list of convênios |
| Modify | `src/hooks/usePacientes.ts` | Join `convenios(nome, valor_sessao)` into select |
| Create | `src/hooks/__tests__/useConvenios.test.ts` | Hook unit test |
| Create | `src/pages/onboarding/StepConvenios.tsx` | New onboarding step 3 |
| Modify | `src/pages/OnboardingPage.tsx` | 4-step flow; save convênios on finalize |
| Modify | `src/pages/NovoPacientePage.tsx` | tipo selector + convenio dropdown |
| Modify | `src/components/sessao/NovaSessaoModal.tsx` | Show value field for convenio patients |
| Create | `src/hooks/useFinanceiro.ts` | KPIs + semanas + pacientes list from month's sessions |
| Create | `src/hooks/useRepasses.ts` | Rules + calculated amounts + marcar como pago |
| Create | `src/hooks/useDespesas.ts` | CRUD for monthly expenses |
| Create | `src/hooks/__tests__/useFinanceiro.test.ts` | Hook unit test |
| Create | `src/hooks/__tests__/useRepasses.test.ts` | Hook unit test |
| Create | `src/hooks/__tests__/useDespesas.test.ts` | Hook unit test |
| Rewrite | `src/pages/FinanceiroPage.tsx` | Full 4-tab page with month navigation |
| Create | `src/hooks/useFinanceiroPaciente.ts` | Patient financial history + sessions by month |
| Create | `src/hooks/__tests__/useFinanceiroPaciente.test.ts` | Hook unit test |
| Rewrite | `src/pages/FinanceiroPacientePage.tsx` | Patient detail financial view |
| Modify | `src/pages/ConfiguracoesPage.tsx` | Add Convênios section |

---

## Task 1: DB Migrations

**Files:**
- Create: `supabase/migrations/005_convenios.sql`
- Create: `supabase/migrations/006_despesas.sql`

> ⚠️ These must be applied in Supabase Studio before running the frontend. Apply 005 first, then 006.

- [ ] **Step 1: Write 005_convenios.sql**

```sql
-- 005_convenios.sql

-- New table for health insurance plans
create table convenios (
  id           uuid primary key default uuid_generate_v4(),
  nome         text not null,
  valor_sessao numeric(10,2),
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now()
);

alter table convenios enable row level security;
create policy "auth users full access" on convenios
  for all to authenticated using (true) with check (true);

-- Add tipo and convenio_id to pacientes
alter table pacientes
  add column if not exists tipo        text not null default 'particular'
                                        check (tipo in ('particular', 'convenio')),
  add column if not exists convenio_id uuid references convenios(id) on delete set null;

-- Extend repasses to support monthly aggregate records
alter table repasses
  add column if not exists mes date;

alter table repasses
  alter column sessao_id drop not null;

-- Unique constraint so we can upsert one record per (rule, month)
create unique index if not exists idx_repasses_regra_mes
  on repasses (regra_repasse_id, mes)
  where mes is not null;
```

- [ ] **Step 2: Write 006_despesas.sql**

```sql
-- 006_despesas.sql

create table despesas (
  id          uuid primary key default uuid_generate_v4(),
  mes         date not null,
  descricao   text not null,
  valor       numeric(10,2) not null,
  criado_em   timestamptz not null default now()
);

alter table despesas enable row level security;
create policy "auth users full access" on despesas
  for all to authenticated using (true) with check (true);

create index idx_despesas_mes on despesas(mes);
```

- [ ] **Step 3: Apply migrations in Supabase Studio**

Apply `005_convenios.sql` first, then `006_despesas.sql`. Verify both complete without errors.

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add Convenio and Despesa interfaces and PacienteComConvenio, extend Paciente**

Append to the end of `src/lib/types.ts` (after `SlotSemanalInput`):

```typescript
export interface Convenio {
  id: string
  nome: string
  valor_sessao: number | null
  ativo: boolean
  criado_em: string
}

export interface Despesa {
  id: string
  mes: string          // 'YYYY-MM-DD' — first day of the month
  descricao: string
  valor: number
  criado_em: string
}

export type PacienteComConvenio = Paciente & {
  convenios: { nome: string; valor_sessao: number | null } | null
}
```

In the existing `Paciente` interface, add two fields after `ativo`:

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
  criado_em: string
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors (existing code uses `Paciente` fields that are still present).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Convenio, Despesa types and extend Paciente"
```

---

## Task 3: useConvenios Hook

**Files:**
- Create: `src/hooks/useConvenios.ts`
- Create: `src/hooks/__tests__/useConvenios.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/hooks/__tests__/useConvenios.test.ts
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useConvenios } from '../useConvenios'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockConvenios = [
  { id: 'c1', nome: 'Unimed', valor_sessao: 80, ativo: true, criado_em: '2026-01-01' },
]

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: mockConvenios, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  }
}

describe('useConvenios', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active convenios ordered by nome', async () => {
    vi.mocked(supabase.from).mockReturnValue(buildChain() as any)
    const { result } = renderHook(() => useConvenios())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.convenios).toHaveLength(1)
    expect(result.current.convenios[0].nome).toBe('Unimed')
  })

  it('addConvenio inserts and refetches', async () => {
    const chain = buildChain()
    vi.mocked(supabase.from).mockReturnValue(chain as any)
    const { result } = renderHook(() => useConvenios())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.addConvenio('Bradesco', 100)
    })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Bradesco', valor_sessao: 100 })
    )
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/hooks/__tests__/useConvenios.test.ts
```

Expected: FAIL with "Cannot find module '../useConvenios'"

- [ ] **Step 3: Implement useConvenios**

```typescript
// src/hooks/useConvenios.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Convenio } from '@/lib/types'

export function useConvenios() {
  const [convenios, setConvenios] = useState<Convenio[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchConvenios() {
    const { data } = await supabase
      .from('convenios')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    setConvenios((data ?? []) as Convenio[])
    setLoading(false)
  }

  useEffect(() => { fetchConvenios() }, [])

  async function addConvenio(nome: string, valor_sessao: number | null) {
    await supabase.from('convenios').insert({ nome, valor_sessao, ativo: true })
    await fetchConvenios()
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from('convenios').update({ ativo }).eq('id', id)
    await fetchConvenios()
  }

  async function updateValor(id: string, valor_sessao: number | null) {
    await supabase.from('convenios').update({ valor_sessao }).eq('id', id)
    await fetchConvenios()
  }

  return { convenios, loading, addConvenio, toggleAtivo, updateValor }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/hooks/__tests__/useConvenios.test.ts
```

Expected: 2 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useConvenios.ts src/hooks/__tests__/useConvenios.test.ts
git commit -m "feat: add useConvenios hook"
```

---

## Task 4: Extend usePacientes to Join Convênios

**Files:**
- Modify: `src/hooks/usePacientes.ts`

The goal is to have `pacientes` return `PacienteComConvenio[]` so `NovaSessaoModal` can read `convenios.valor_sessao` without a second query.

- [ ] **Step 1: Update usePacientes**

In `src/hooks/usePacientes.ts`, make these two changes:

1. Change import to include `PacienteComConvenio`:
```typescript
import type { PacienteComConvenio, ContratoTipo } from '@/lib/types'
```

2. Change `useState<Paciente[]>` to `useState<PacienteComConvenio[]>`:
```typescript
const [pacientes, setPacientes] = useState<PacienteComConvenio[]>([])
```

3. Change the select query from `'*'` to `'*, convenios(nome, valor_sessao)'`:
```typescript
const { data, error } = await supabase
  .from('pacientes')
  .select('*, convenios(nome, valor_sessao)')
  .eq('ativo', true)
  .order('nome')
```

4. Cast the returned data:
```typescript
setPacientes(data as PacienteComConvenio[] ?? [])
```

5. In `createPaciente`, extend `CreatePacienteInput` to accept `tipo` and `convenio_id`:
```typescript
export interface CreatePacienteInput {
  nome: string
  telefone?: string
  email?: string
  data_nascimento?: string
  tipo?: 'particular' | 'convenio'
  convenio_id?: string
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number
    dia_vencimento?: number
  }
}
```

6. Include `tipo` and `convenio_id` in the insert:
```typescript
const { data: paciente, error: pacienteError } = await supabase
  .from('pacientes')
  .insert({
    nome: input.nome,
    telefone: input.telefone ?? null,
    email: input.email ?? null,
    data_nascimento: input.data_nascimento ?? null,
    tipo: input.tipo ?? 'particular',
    convenio_id: input.convenio_id ?? null,
  })
  .select('id')
  .single()
```

- [ ] **Step 2: Run TypeScript check and all tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 TS errors, all existing tests still pass (the mock chain in existing tests uses `select: vi.fn().mockReturnThis()` which is still compatible).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/usePacientes.ts
git commit -m "feat: extend usePacientes to join convenios and accept tipo/convenio_id"
```

---

## Task 5: Onboarding — Add StepConvenios (Step 3)

**Files:**
- Create: `src/pages/onboarding/StepConvenios.tsx`
- Modify: `src/pages/OnboardingPage.tsx`

The onboarding becomes 4 steps: Dados → Modalidades → **Convênios** → WhatsApp.

- [ ] **Step 1: Create StepConvenios.tsx**

```typescript
// src/pages/onboarding/StepConvenios.tsx
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

export interface ConvenioInput {
  nome: string
  valor_sessao: number | null
}

interface Props {
  onNext: (convenios: ConvenioInput[]) => void
  onBack: () => void
}

const inputClass = "h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function StepConvenios({ onNext, onBack }: Props) {
  const [lista, setLista] = useState<ConvenioInput[]>([])
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')

  function add() {
    const n = nome.trim()
    if (!n) return
    setLista(prev => [...prev, { nome: n, valor_sessao: valor ? Number(valor) : null }])
    setNome('')
    setValor('')
  }

  function remove(i: number) {
    setLista(prev => prev.filter((_, j) => j !== i))
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Convênios</h2>
      <p className="text-sm text-muted">
        Cadastre os planos de saúde que você aceita. Você poderá editar depois em Configurações.
      </p>

      {lista.length > 0 && (
        <div className="flex flex-col gap-2">
          {lista.map((c, i) => (
            <div key={i} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2">
              <div>
                <span className="text-sm font-medium text-[#1C1C1C]">{c.nome}</span>
                {c.valor_sessao != null && (
                  <span className="text-xs text-muted ml-2">
                    R$ {c.valor_sessao.toFixed(2)}/sessão
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted hover:text-[#E07070] transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          placeholder="Nome do plano (ex: Unimed)"
          value={nome}
          onChange={e => setNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          className={`${inputClass} flex-1`}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="R$/sessão"
          value={valor}
          onChange={e => setValor(e.target.value)}
          className={`${inputClass} w-28`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!nome.trim()}
          className="h-9 px-3 rounded-lg border border-border text-muted hover:text-[#1C1C1C] disabled:opacity-40 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={() => onNext(lista)}
          className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          {lista.length === 0 ? 'Não atendo por convênio' : 'Próximo'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update OnboardingPage.tsx to 4 steps**

Replace the entire file:

```typescript
// src/pages/OnboardingPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { StepDados, type StepDadosData } from './onboarding/StepDados'
import { StepModalidades } from './onboarding/StepModalidades'
import { StepConvenios, type ConvenioInput } from './onboarding/StepConvenios'
import { StepWhatsapp } from './onboarding/StepWhatsapp'

type Step = 1 | 2 | 3 | 4

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [dadosStep1, setDadosStep1] = useState<StepDadosData | null>(null)
  const [modalidades, setModalidades] = useState<string[]>([])
  const [convenios, setConvenios] = useState<ConvenioInput[]>([])
  const [erroFinal, setErroFinal] = useState<string | null>(null)

  async function finalize(whatsappOpcao: 'agora' | 'depois' | 'nao') {
    if (!dadosStep1) return
    setErroFinal(null)

    const { error } = await supabase.from('config_psicologo').insert({
      nome: dadosStep1.nome,
      horario_inicio: dadosStep1.horario_inicio,
      horario_fim: dadosStep1.horario_fim,
      horario_checklist: dadosStep1.horario_checklist,
      automacao_whatsapp_ativa: false,
    })

    if (error) {
      setErroFinal('Erro ao salvar configurações. Tente novamente.')
      return
    }

    const extras = modalidades.filter(m => !['Presencial', 'Online'].includes(m))
    if (extras.length > 0) {
      await supabase.from('modalidades').insert(extras.map(nome => ({ nome })))
    }

    if (convenios.length > 0) {
      await supabase.from('convenios').insert(
        convenios.map(c => ({ nome: c.nome, valor_sessao: c.valor_sessao, ativo: true }))
      )
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
          {([1, 2, 3, 4] as Step[]).map(s => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step ? 'w-8 bg-primary' : s < step ? 'w-4 bg-primary/40' : 'w-4 bg-border'
              }`}
            />
          ))}
        </div>

        {erroFinal && (
          <p className="text-sm text-[#E07070] text-center mb-4">{erroFinal}</p>
        )}

        <div className="bg-surface rounded-card p-6 shadow-sm border border-border">
          {step === 1 && (
            <StepDados onNext={data => { setDadosStep1(data); setStep(2) }} />
          )}
          {step === 2 && (
            <StepModalidades
              onNext={m => { setModalidades(m); setStep(3) }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepConvenios
              onNext={c => { setConvenios(c); setStep(4) }}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <StepWhatsapp
              onConfigurar={() => finalize('agora')}
              onDepois={() => finalize('depois')}
              onNaoUsar={() => finalize('nao')}
              onBack={() => setStep(3)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Check StepWhatsapp accepts onBack prop**

Read `src/pages/onboarding/StepWhatsapp.tsx`. If it doesn't have an `onBack` prop, add it:

```typescript
// add to Props interface:
onBack: () => void

// add button before the existing buttons:
<button type="button" onClick={onBack} className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors">
  Voltar
</button>
```

- [ ] **Step 4: Run TypeScript check and all tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/onboarding/StepConvenios.tsx src/pages/OnboardingPage.tsx src/pages/onboarding/StepWhatsapp.tsx
git commit -m "feat: add StepConvenios to onboarding (step 3 of 4)"
```

---

## Task 6: NovoPacientePage — Tipo + Convênio Fields

**Files:**
- Modify: `src/pages/NovoPacientePage.tsx`

- [ ] **Step 1: Add useConvenios import and tipo/convenio state**

At the top of `NovoPacientePage.tsx`, add:
```typescript
import { useConvenios } from '@/hooks/useConvenios'
```

Inside the component, after `useModalidades()`:
```typescript
const { convenios } = useConvenios()
```

- [ ] **Step 2: Add tipo to form schema**

In the `schema` object, add before `tem_contrato`:
```typescript
tipo: z.enum(['particular', 'convenio']).default('particular'),
convenio_id: z.string().optional(),
```

And in `superRefine`, add validation for convenio:
```typescript
if (data.tipo === 'convenio' && !data.convenio_id) {
  ctx.addIssue({ code: 'custom', path: ['convenio_id'], message: 'Selecione o plano de saúde' })
}
```

And make contrato optional for convenio patients (change the contrato validation block):
```typescript
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
```

- [ ] **Step 3: Add watch for tipo and update form defaultValues**

```typescript
const tipo = watch('tipo')
```

Update `defaultValues`:
```typescript
defaultValues: { tem_contrato: false, tipo: 'particular' },
```

- [ ] **Step 4: Add tipo/convenio UI in the "Dados pessoais" section**

After the "Nome" field and before "WhatsApp", insert:

```tsx
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
      {convenios.map(c => (
        <option key={c.id} value={c.id}>{c.nome}</option>
      ))}
    </select>
    <FieldError message={errors.convenio_id?.message} />
  </div>
)}
```

- [ ] **Step 5: Show contrato section hint for convenio patients**

In the "Cobrança" section, add a note when `tipo === 'convenio'`:

```tsx
{tipo === 'convenio' && !temContrato && (
  <p className="text-sm text-muted">
    Pacientes de convênio geralmente não precisam de contrato — o valor é definido pelo plano.
  </p>
)}
```

- [ ] **Step 6: Pass tipo and convenio_id to createPaciente in onSubmit**

In the `createPaciente` call, add:
```typescript
const id = await createPaciente({
  nome: data.nome,
  telefone: data.telefone || undefined,
  email: data.email || undefined,
  data_nascimento: data.data_nascimento || undefined,
  tipo: data.tipo,
  convenio_id: data.tipo === 'convenio' ? data.convenio_id : undefined,
  contrato: data.tem_contrato && data.contrato_tipo && data.tipo === 'particular'
    ? {
        tipo: data.contrato_tipo as ContratoTipo,
        valor: Number(data.contrato_valor),
        qtd_sessoes: data.contrato_tipo === 'pacote' ? Number(data.contrato_qtd_sessoes) : undefined,
        dia_vencimento: data.contrato_tipo === 'mensal' ? Number(data.contrato_dia_vencimento) : undefined,
      }
    : undefined,
})
```

- [ ] **Step 7: Run TypeScript check and tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/pages/NovoPacientePage.tsx
git commit -m "feat: add tipo/convenio fields to patient registration"
```

---

## Task 7: NovaSessaoModal — Value Field for Convênio Patients

**Files:**
- Modify: `src/components/sessao/NovaSessaoModal.tsx`

Currently the value field is only shown for `avulso`. For `paciente` tipo=`convenio`, it should appear pre-filled with the convenio's `valor_sessao`.

- [ ] **Step 1: Add paciente_id watch and convenio lookup**

In `NovaSessaoModal`, after `const tipo = watch('tipo')`, add:

```typescript
const pacienteId = watch('paciente_id')

const pacienteSelecionado = pacientes.find(p => p.id === pacienteId) ?? null
const isConvenio = pacienteSelecionado?.tipo === 'convenio'
const convenioValor = pacienteSelecionado?.convenios?.valor_sessao ?? null
```

- [ ] **Step 2: Pre-fill valor when convenio patient selected**

Replace the existing `valor_cobrado` field block (currently shows only for `avulso`) with:

```tsx
{(tipo === 'avulso' || isConvenio) && (
  <div className="flex flex-col gap-1">
    <label className="text-sm font-medium text-[#1C1C1C]">
      Valor (R$){isConvenio && convenioValor != null && (
        <span className="text-xs text-muted font-normal ml-1">
          — valor do convênio: R$ {convenioValor.toFixed(2)}
        </span>
      )}
    </label>
    <input
      {...register('valor_cobrado')}
      type="number"
      step="0.01"
      min="0"
      placeholder={convenioValor != null ? String(convenioValor) : '0,00'}
      defaultValue={isConvenio && convenioValor != null ? String(convenioValor) : undefined}
      className={inputClass}
    />
  </div>
)}
```

Note: `defaultValue` on a react-hook-form `register`'d input won't react to dynamic changes. Use `setValue` instead when the patient selection changes:

After the watch declarations, add:
```typescript
import { useEffect } from 'react'
// ...
const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({...})

useEffect(() => {
  if (isConvenio && convenioValor != null) {
    setValue('valor_cobrado', String(convenioValor))
  } else if (!isConvenio && tipo === 'paciente') {
    setValue('valor_cobrado', '')
  }
}, [pacienteId, isConvenio, convenioValor, tipo, setValue])
```

- [ ] **Step 3: Run TypeScript check and tests**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/sessao/NovaSessaoModal.tsx
git commit -m "feat: show and pre-fill value field for convenio patients in NovaSessaoModal"
```

---

## Task 8: useFinanceiro Hook

**Files:**
- Create: `src/hooks/useFinanceiro.ts`
- Create: `src/hooks/__tests__/useFinanceiro.test.ts`

Returns KPIs, weekly chart data, and patient list for a given month.

- [ ] **Step 1: Write failing test**

```typescript
// src/hooks/__tests__/useFinanceiro.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useFinanceiro } from '../useFinanceiro'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockSessoes = [
  {
    id: 's1', paciente_id: 'p1', avulso_nome: null,
    data_hora: '2026-04-07T10:00:00Z', status: 'concluida',
    valor_cobrado: 200, pago: true,
    pacientes: { nome: 'Ana Lima', tipo: 'particular', convenio_id: null, convenios: null },
  },
  {
    id: 's2', paciente_id: 'p1', avulso_nome: null,
    data_hora: '2026-04-14T10:00:00Z', status: 'concluida',
    valor_cobrado: 200, pago: false,
    pacientes: { nome: 'Ana Lima', tipo: 'particular', convenio_id: null, convenios: null },
  },
]

describe('useFinanceiro', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calculates KPIs from sessions', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }),
    } as any)

    const mes = new Date('2026-04-01')
    const { result } = renderHook(() => useFinanceiro(mes))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.dados.recebido).toBe(200)
    expect(result.current.dados.pendente).toBe(200)
    expect(result.current.dados.totalSessoes).toBe(2)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/hooks/__tests__/useFinanceiro.test.ts
```

Expected: FAIL with "Cannot find module '../useFinanceiro'"

- [ ] **Step 3: Implement useFinanceiro**

```typescript
// src/hooks/useFinanceiro.ts
import { useState, useEffect } from 'react'
import { startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'

export interface SemanaData {
  label: string
  concluida: number
  faltou: number
  cancelada: number
  agendada: number
}

export interface PacienteFinanceiro {
  paciente_id: string | null
  avulso_nome: string | null
  nome: string
  tipo: 'particular' | 'convenio' | null
  convenio_nome: string | null
  sessoes: number
  recebido: number
  pendente: number
  ultima_sessao: string | null
}

export interface DadosFinanceiro {
  recebido: number
  pendente: number
  projecao: number
  totalSessoes: number
  semanas: SemanaData[]
  pacientes: PacienteFinanceiro[]
}

function semanaIdx(dataHora: string, mesStart: Date): number {
  const dia = new Date(dataHora).getDate()
  return Math.min(Math.floor((dia - 1) / 7), 3)
}

function calcularDados(sessoes: any[], mes: Date): DadosFinanceiro {
  const mesStart = startOfMonth(mes)
  let recebido = 0
  let pendente = 0
  let projecaoExtra = 0
  const semanas: SemanaData[] = [
    { label: 'S1', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
    { label: 'S2', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
    { label: 'S3', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
    { label: 'S4', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
  ]
  const pacienteMap = new Map<string, PacienteFinanceiro>()

  for (const s of sessoes) {
    const idx = semanaIdx(s.data_hora, mesStart)
    const valor = s.valor_cobrado ?? 0
    const key = s.paciente_id ?? `avulso:${s.avulso_nome}`

    if (s.status === 'concluida') {
      semanas[idx].concluida++
      if (s.pago) recebido += valor
      else pendente += valor
    } else if (s.status === 'faltou') {
      semanas[idx].faltou++
    } else if (s.status === 'cancelada') {
      semanas[idx].cancelada++
    } else if (s.status === 'agendada' || s.status === 'confirmada') {
      semanas[idx].agendada++
      projecaoExtra += valor
    }

    if (!pacienteMap.has(key)) {
      const nome = s.pacientes?.nome ?? s.avulso_nome ?? 'Avulso'
      pacienteMap.set(key, {
        paciente_id: s.paciente_id,
        avulso_nome: s.avulso_nome,
        nome,
        tipo: s.pacientes?.tipo ?? null,
        convenio_nome: s.pacientes?.convenios?.nome ?? null,
        sessoes: 0,
        recebido: 0,
        pendente: 0,
        ultima_sessao: null,
      })
    }
    const p = pacienteMap.get(key)!
    p.sessoes++
    if (s.status === 'concluida' && s.pago) p.recebido += valor
    if (s.status === 'concluida' && !s.pago) p.pendente += valor
    if (!p.ultima_sessao || s.data_hora > p.ultima_sessao) p.ultima_sessao = s.data_hora
  }

  const pacientes = Array.from(pacienteMap.values())
    .sort((a, b) => b.recebido - a.recebido)

  return {
    recebido,
    pendente,
    projecao: recebido + pendente + projecaoExtra,
    totalSessoes: sessoes.filter(s => s.status !== 'cancelada' && s.status !== 'remarcada').length,
    semanas,
    pacientes,
  }
}

export function useFinanceiro(mes: Date) {
  const [dados, setDados] = useState<DadosFinanceiro>({
    recebido: 0, pendente: 0, projecao: 0, totalSessoes: 0, semanas: [
      { label: 'S1', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
      { label: 'S2', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
      { label: 'S3', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
      { label: 'S4', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
    ], pacientes: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const inicio = startOfMonth(mes).toISOString()
    const fim = endOfMonth(mes).toISOString()
    supabase
      .from('sessoes')
      .select('*, pacientes(nome, tipo, convenio_id, convenios(nome))')
      .gte('data_hora', inicio)
      .lte('data_hora', fim)
      .order('data_hora')
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setDados(calcularDados(data ?? [], mes))
        setLoading(false)
      })
  }, [mes.getFullYear(), mes.getMonth()])

  return { dados, loading, error }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/hooks/__tests__/useFinanceiro.test.ts
```

Expected: 1 test passing.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFinanceiro.ts src/hooks/__tests__/useFinanceiro.test.ts
git commit -m "feat: add useFinanceiro hook with KPIs and weekly chart data"
```

---

## Task 9: useRepasses Hook

**Files:**
- Create: `src/hooks/useRepasses.ts`
- Create: `src/hooks/__tests__/useRepasses.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/hooks/__tests__/useRepasses.test.ts
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useRepasses } from '../useRepasses'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockRegras = [
  { id: 'r1', nome: 'Clínica (20%)', tipo_valor: 'percentual', valor: 20, ativo: true },
]

const mockRepasses = [
  { id: 'rp1', regra_repasse_id: 'r1', mes: '2026-04-01', valor_calculado: 960, pago: false, data_pagamento: null },
]

describe('useRepasses', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads regras and existing repasses', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockRegras, error: null }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockRepasses, error: null }),
      } as any)

    const mes = new Date('2026-04-01')
    const { result } = renderHook(() => useRepasses(mes, 4800))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.itens).toHaveLength(1)
    expect(result.current.itens[0].nome).toBe('Clínica (20%)')
    expect(result.current.itens[0].valorCalculado).toBe(960) // 20% of 4800
    expect(result.current.itens[0].pago).toBe(false)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/hooks/__tests__/useRepasses.test.ts
```

- [ ] **Step 3: Implement useRepasses**

```typescript
// src/hooks/useRepasses.ts
import { useState, useEffect } from 'react'
import { startOfMonth, format } from 'date-fns'
import { supabase } from '@/lib/supabase'

export interface RepasseItem {
  regra_id: string
  nome: string
  tipo_valor: 'percentual' | 'fixo'
  valorCalculado: number
  pago: boolean
  data_pagamento: string | null
}

export function useRepasses(mes: Date, totalRecebido: number) {
  const [itens, setItens] = useState<RepasseItem[]>([])
  const [loading, setLoading] = useState(true)
  const mesStr = format(startOfMonth(mes), 'yyyy-MM-dd')

  async function fetchRepasses() {
    setLoading(true)
    const [{ data: regras }, { data: repasses }] = await Promise.all([
      supabase.from('regras_repasse').select('*').eq('ativo', true).order('nome'),
      supabase.from('repasses').select('*').eq('mes', mesStr),
    ])

    const result: RepasseItem[] = (regras ?? []).map((r: any) => {
      const pago = repasses?.find((rp: any) => rp.regra_repasse_id === r.id)
      const valorCalculado = r.tipo_valor === 'percentual'
        ? Math.round((totalRecebido * r.valor) / 100 * 100) / 100
        : r.valor
      return {
        regra_id: r.id,
        nome: r.nome,
        tipo_valor: r.tipo_valor,
        valorCalculado,
        pago: pago?.pago ?? false,
        data_pagamento: pago?.data_pagamento ?? null,
      }
    })
    setItens(result)
    setLoading(false)
  }

  useEffect(() => { fetchRepasses() }, [mes.getFullYear(), mes.getMonth(), totalRecebido])

  async function marcarComoPago(regraId: string, valorCalculado: number) {
    await supabase.from('repasses').upsert({
      regra_repasse_id: regraId,
      mes: mesStr,
      sessao_id: null,
      valor_calculado: valorCalculado,
      pago: true,
      data_pagamento: format(new Date(), 'yyyy-MM-dd'),
    }, { onConflict: 'regra_repasse_id,mes' })
    await fetchRepasses()
  }

  const totalPago = itens.filter(i => i.pago).reduce((s, i) => s + i.valorCalculado, 0)
  const totalAPagar = itens.filter(i => !i.pago).reduce((s, i) => s + i.valorCalculado, 0)

  return { itens, loading, totalPago, totalAPagar, marcarComoPago }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/hooks/__tests__/useRepasses.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useRepasses.ts src/hooks/__tests__/useRepasses.test.ts
git commit -m "feat: add useRepasses hook with monthly calculation and marcarComoPago"
```

---

## Task 10: useDespesas Hook

**Files:**
- Create: `src/hooks/useDespesas.ts`
- Create: `src/hooks/__tests__/useDespesas.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/hooks/__tests__/useDespesas.test.ts
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useDespesas } from '../useDespesas'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockDespesas = [
  { id: 'd1', mes: '2026-04-01', descricao: 'Aluguel', valor: 300, criado_em: '2026-04-01' },
]

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: mockDespesas, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnThis(),
    ...overrides,
  }
}

describe('useDespesas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches despesas for the month', async () => {
    vi.mocked(supabase.from).mockReturnValue(buildChain() as any)
    const { result } = renderHook(() => useDespesas(new Date('2026-04-01')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.despesas).toHaveLength(1)
    expect(result.current.total).toBe(300)
  })

  it('addDespesa inserts and refetches', async () => {
    const chain = buildChain()
    vi.mocked(supabase.from).mockReturnValue(chain as any)
    const { result } = renderHook(() => useDespesas(new Date('2026-04-01')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.addDespesa('Espaço', 100) })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ descricao: 'Espaço', valor: 100 })
    )
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/hooks/__tests__/useDespesas.test.ts
```

- [ ] **Step 3: Implement useDespesas**

```typescript
// src/hooks/useDespesas.ts
import { useState, useEffect } from 'react'
import { startOfMonth, format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { Despesa } from '@/lib/types'

export function useDespesas(mes: Date) {
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [loading, setLoading] = useState(true)
  const mesStr = format(startOfMonth(mes), 'yyyy-MM-dd')

  async function fetchDespesas() {
    setLoading(true)
    const { data } = await supabase
      .from('despesas')
      .select('*')
      .eq('mes', mesStr)
      .order('criado_em')
    setDespesas((data ?? []) as Despesa[])
    setLoading(false)
  }

  useEffect(() => { fetchDespesas() }, [mes.getFullYear(), mes.getMonth()])

  async function addDespesa(descricao: string, valor: number) {
    await supabase.from('despesas').insert({ mes: mesStr, descricao, valor })
    await fetchDespesas()
  }

  async function removeDespesa(id: string) {
    await supabase.from('despesas').delete().eq('id', id)
    await fetchDespesas()
  }

  const total = despesas.reduce((s, d) => s + d.valor, 0)

  return { despesas, loading, total, addDespesa, removeDespesa }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/hooks/__tests__/useDespesas.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDespesas.ts src/hooks/__tests__/useDespesas.test.ts
git commit -m "feat: add useDespesas hook"
```

---

## Task 11: FinanceiroPage — Full 4-Tab Page

**Files:**
- Rewrite: `src/pages/FinanceiroPage.tsx`

- [ ] **Step 1: Write the full FinanceiroPage**

```typescript
// src/pages/FinanceiroPage.tsx
import { useState } from 'react'
import { addMonths, subMonths, startOfMonth, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { Trash2, Plus } from 'lucide-react'
import { useFinanceiro } from '@/hooks/useFinanceiro'
import { useRepasses } from '@/hooks/useRepasses'
import { useDespesas } from '@/hooks/useDespesas'
import { useNavigate } from 'react-router-dom'

type Aba = 'resumo' | 'pacientes' | 'repasses' | 'despesas'

const inputClass = "h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function FinanceiroPage() {
  const navigate = useNavigate()
  const [mes, setMes] = useState(() => startOfMonth(new Date()))
  const [aba, setAba] = useState<Aba>('resumo')
  const [novaDescricao, setNovaDescricao] = useState('')
  const [novoValor, setNovoValor] = useState('')

  const { dados, loading } = useFinanceiro(mes)
  const { itens: repasses, loading: loadingRepasses, totalPago, totalAPagar, marcarComoPago } = useRepasses(mes, dados.recebido)
  const { despesas, loading: loadingDespesas, total: totalDespesas, addDespesa, removeDespesa } = useDespesas(mes)

  const resultadoLiquido = dados.recebido - totalPago - totalDespesas
  const tituloMes = format(mes, "MMMM 'de' yyyy", { locale: ptBR })

  const abas: { key: Aba; label: string }[] = [
    { key: 'resumo', label: 'Resumo' },
    { key: 'pacientes', label: 'Pacientes' },
    { key: 'repasses', label: 'Repasses' },
    { key: 'despesas', label: 'Despesas' },
  ]

  async function handleAddDespesa() {
    if (!novaDescricao.trim() || !novoValor) return
    await addDespesa(novaDescricao.trim(), Number(novoValor))
    setNovaDescricao('')
    setNovoValor('')
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Financeiro</h1>
          <p className="text-sm text-muted capitalize">{tituloMes}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMes(m => startOfMonth(subMonths(m, 1)))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-[#1C1C1C] transition-colors"
          >
            ◀
          </button>
          <button
            onClick={() => setMes(m => startOfMonth(addMonths(m, 1)))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:text-[#1C1C1C] transition-colors"
          >
            ▶
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {abas.map(a => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              aba === a.key
                ? 'bg-primary text-white'
                : 'bg-surface border border-border text-muted hover:text-[#1C1C1C]'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* ABA: Resumo */}
      {aba === 'resumo' && (
        <div className="flex flex-col gap-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* KPI grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Recebido', valor: dados.recebido, cor: '#4CAF82', detalhe: `${dados.totalSessoes} sessões no mês` },
                  { label: 'Pendente', valor: dados.pendente, cor: '#C17F59', detalhe: `${dados.pacientes.filter(p => p.pendente > 0).length} pacientes` },
                  { label: 'Projeção', valor: dados.projecao, cor: '#9B7EC8', detalhe: 'baseada em agendadas' },
                  { label: 'Resultado líquido', valor: resultadoLiquido, cor: '#2D6A6A', detalhe: 'após repasses e despesas' },
                ].map(k => (
                  <div key={k.label} className="bg-surface rounded-card border border-border p-4"
                    style={{ borderLeftWidth: 3, borderLeftColor: k.cor }}>
                    <p className="text-xs text-muted uppercase tracking-wide mb-1">{k.label}</p>
                    <p className="text-xl font-semibold font-mono text-[#1C1C1C]">{moeda(k.valor)}</p>
                    <p className="text-xs text-muted mt-0.5">{k.detalhe}</p>
                  </div>
                ))}
              </div>

              {/* Stacked bar chart */}
              <div className="bg-surface rounded-card border border-border p-4">
                <p className="text-xs text-muted uppercase tracking-wide mb-3">Sessões por semana</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={dados.semanas} barSize={32} barCategoryGap="30%">
                    <XAxis dataKey="label" tickLine={false} axisLine={false}
                      tick={{ fontSize: 11, fill: '#7A7A7A' }} />
                    <Tooltip
                      formatter={(value, name) => {
                        const labels: Record<string, string> = {
                          concluida: 'Concluída', faltou: 'Faltou',
                          cancelada: 'Cancelada', agendada: 'Agendada',
                        }
                        return [value, labels[name as string] ?? name]
                      }}
                    />
                    <Bar dataKey="concluida" stackId="a" fill="#4CAF82" />
                    <Bar dataKey="faltou" stackId="a" fill="#C17F59" />
                    <Bar dataKey="cancelada" stackId="a" fill="#E07070" />
                    <Bar dataKey="agendada" stackId="a" fill="#E8F4F4"
                      stroke="#4CAF82" strokeDasharray="3 2" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 mt-1 flex-wrap">
                  {[
                    { cor: '#4CAF82', label: 'Concluída' },
                    { cor: '#C17F59', label: 'Faltou' },
                    { cor: '#E07070', label: 'Cancelada' },
                    { cor: '#E8F4F4', label: 'Agendada', dashed: true },
                  ].map(l => (
                    <span key={l.label} className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ background: l.cor, border: l.dashed ? '1px dashed #4CAF82' : undefined }} />
                      {l.label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Saídas do mês */}
              <div className="bg-surface rounded-card border border-border p-4">
                <p className="text-xs text-muted uppercase tracking-wide mb-3">Saídas do mês</p>
                <div className="flex justify-between text-sm py-2 border-b border-border">
                  <span className="text-muted">Repasses</span>
                  <span className="font-mono text-[#E07070]">− {moeda(totalPago)}</span>
                </div>
                <div className="flex justify-between text-sm py-2 border-b border-border">
                  <span className="text-muted">Despesas</span>
                  <span className="font-mono text-[#E07070]">− {moeda(totalDespesas)}</span>
                </div>
                <div className="flex justify-between text-sm pt-3 font-semibold">
                  <span>Resultado líquido</span>
                  <span className="font-mono text-[#2D6A6A]">{moeda(resultadoLiquido)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ABA: Pacientes */}
      {aba === 'pacientes' && (
        <div>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : dados.pacientes.length === 0 ? (
            <p className="text-center py-12 text-sm text-muted">Nenhuma sessão neste mês.</p>
          ) : (
            <div className="bg-surface rounded-card border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-2 border-b border-border text-xs text-muted uppercase tracking-wide">
                <span>Paciente</span>
                <span className="text-right">Sessões</span>
                <span className="text-right">Total</span>
              </div>
              {dados.pacientes.map((p, i) => (
                <button
                  key={i}
                  onClick={() => p.paciente_id && navigate(`/financeiro/paciente/${p.paciente_id}`)}
                  className="w-full grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 border-b border-border last:border-0 text-left hover:bg-bg transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-[#1C1C1C] leading-tight">{p.nome}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.tipo === 'convenio' && p.convenio_nome && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-[#9B7EC8]/10 text-[#9B7EC8]">
                          {p.convenio_nome}
                        </span>
                      )}
                      {p.ultima_sessao && (
                        <span className="text-xs text-muted">
                          Última: {format(new Date(p.ultima_sessao), 'dd/MM', { locale: ptBR })}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted text-right pt-1">{p.sessoes}</span>
                  <div className="text-right">
                    <span className="text-sm font-mono font-medium text-[#4CAF82]">{moeda(p.recebido)}</span>
                    {p.pendente > 0 && (
                      <p className="text-xs text-[#C17F59]">+ {moeda(p.pendente)} pend.</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABA: Repasses */}
      {aba === 'repasses' && (
        <div className="flex flex-col gap-3">
          {loadingRepasses ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : repasses.length === 0 ? (
            <p className="text-center py-12 text-sm text-muted">
              Nenhuma regra de repasse configurada.
            </p>
          ) : (
            <>
              {repasses.map(r => (
                <div key={r.regra_id} className="bg-surface rounded-card border border-border p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-sm font-medium text-[#1C1C1C]">{r.nome}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {r.tipo_valor === 'percentual'
                          ? `${r.tipo_valor === 'percentual' ? r.valorCalculado / (dados.recebido / 100) : ''}% sobre recebido`
                          : 'Valor fixo mensal'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold font-mono">{moeda(r.valorCalculado)}</p>
                      {r.pago ? (
                        <p className="text-xs text-[#4CAF82] mt-0.5">
                          ● Pago em {r.data_pagamento ? format(new Date(r.data_pagamento), 'dd/MM') : '—'}
                        </p>
                      ) : (
                        <p className="text-xs text-[#C17F59] mt-0.5">● A pagar</p>
                      )}
                    </div>
                  </div>
                  {r.pago ? (
                    <div className="w-full py-2 rounded-lg bg-[#F0FAF5] text-[#4CAF82] text-xs font-medium text-center">
                      ✓ Pago
                    </div>
                  ) : (
                    <button
                      onClick={() => marcarComoPago(r.regra_id, r.valorCalculado)}
                      className="w-full py-2 rounded-lg border border-primary text-primary text-xs font-medium hover:bg-primary/5 transition-colors"
                    >
                      Marcar como pago
                    </button>
                  )}
                </div>
              ))}
              <div className="bg-[#E8F4F4] rounded-lg p-3 text-xs text-[#2D6A6A]">
                <span className="font-semibold">Total a pagar:</span> {moeda(totalAPagar)}
                {' '}·{' '}
                <span className="font-semibold">Já pago:</span> {moeda(totalPago)}
              </div>
            </>
          )}
        </div>
      )}

      {/* ABA: Despesas */}
      {aba === 'despesas' && (
        <div className="flex flex-col gap-3">
          {loadingDespesas ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {despesas.length > 0 && (
                <div className="bg-surface rounded-card border border-border overflow-hidden">
                  {despesas.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-3 border-b border-border last:border-0">
                      <span className="text-sm text-[#1C1C1C]">{d.descricao}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono font-medium text-[#E07070]">{moeda(d.valor)}</span>
                        <button
                          onClick={() => removeDespesa(d.id)}
                          className="text-muted hover:text-[#E07070] transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add form */}
              <div className="bg-surface rounded-card border border-border p-4">
                <p className="text-xs text-muted uppercase tracking-wide mb-3">Adicionar despesa</p>
                <div className="flex gap-2">
                  <input
                    placeholder="Descrição (ex: aluguel)"
                    value={novaDescricao}
                    onChange={e => setNovaDescricao(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddDespesa()}
                    className={`${inputClass} flex-1`}
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="R$"
                    value={novoValor}
                    onChange={e => setNovoValor(e.target.value)}
                    className={`${inputClass} w-24`}
                  />
                  <button
                    onClick={handleAddDespesa}
                    disabled={!novaDescricao.trim() || !novoValor}
                    className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 transition-colors hover:bg-primary/90"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              {despesas.length > 0 && (
                <div className="bg-surface rounded-card border border-border p-3 flex justify-between text-sm font-semibold">
                  <span>Total de despesas</span>
                  <span className="font-mono text-[#E07070]">{moeda(totalDespesas)}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/FinanceiroPage.tsx
git commit -m "feat: implement FinanceiroPage with 4 tabs (Resumo, Pacientes, Repasses, Despesas)"
```

---

## Task 12: useFinanceiroPaciente Hook

**Files:**
- Create: `src/hooks/useFinanceiroPaciente.ts`
- Create: `src/hooks/__tests__/useFinanceiroPaciente.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/hooks/__tests__/useFinanceiroPaciente.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useFinanceiroPaciente } from '../useFinanceiroPaciente'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockSessoes = [
  {
    id: 's1', paciente_id: 'p1', data_hora: '2026-04-07T10:00:00Z',
    status: 'concluida', valor_cobrado: 200, pago: true, forma_pagamento: 'pix',
    modalidades: { nome: 'Presencial' },
  },
  {
    id: 's2', paciente_id: 'p1', data_hora: '2026-04-14T10:00:00Z',
    status: 'concluida', valor_cobrado: 200, pago: false, forma_pagamento: null,
    modalidades: { nome: 'Presencial' },
  },
]

const mockPaciente = {
  id: 'p1', nome: 'Ana Lima', tipo: 'particular', convenio_id: null,
  convenios: null,
}

describe('useFinanceiroPaciente', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calculates totais from all sessions for the patient', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }),
      } as any)

    const { result } = renderHook(() =>
      useFinanceiroPaciente('p1', new Date('2026-04-01'))
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.totalHistorico).toBe(200) // only pago=true
    expect(result.current.totalPendente).toBe(200)  // pago=false concluida across all months
    expect(result.current.sessoesMes).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run src/hooks/__tests__/useFinanceiroPaciente.test.ts
```

- [ ] **Step 3: Implement useFinanceiroPaciente**

```typescript
// src/hooks/useFinanceiroPaciente.ts
import { useState, useEffect } from 'react'
import { startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { PacienteComConvenio, SessaoComModalidade } from '@/lib/types'

export function useFinanceiroPaciente(pacienteId: string, mes: Date) {
  const [paciente, setPaciente] = useState<PacienteComConvenio | null>(null)
  const [sessoesMes, setSessoesMes] = useState<SessaoComModalidade[]>([])
  const [totalHistorico, setTotalHistorico] = useState(0)
  const [totalPendente, setTotalPendente] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pacienteId) return
    setLoading(true)

    const inicio = startOfMonth(mes).toISOString()
    const fim = endOfMonth(mes).toISOString()

    Promise.all([
      supabase
        .from('pacientes')
        .select('*, convenios(nome, valor_sessao)')
        .eq('id', pacienteId)
        .single(),
      supabase
        .from('sessoes')
        .select('*, modalidades(nome)')
        .eq('paciente_id', pacienteId)
        .gte('data_hora', inicio)
        .lte('data_hora', fim)
        .order('data_hora', { ascending: false }),
      supabase
        .from('sessoes')
        .select('valor_cobrado, pago, status')
        .eq('paciente_id', pacienteId)
        .order('data_hora'),
    ]).then(([{ data: pac, error: pacErr }, { data: mes_, error: mesErr }, { data: all }]) => {
      if (pacErr || mesErr) {
        setError((pacErr ?? mesErr)!.message)
      } else {
        setPaciente(pac as PacienteComConvenio)
        setSessoesMes((mes_ ?? []) as SessaoComModalidade[])
        const hist = (all ?? [])
          .filter((s: any) => s.status === 'concluida' && s.pago)
          .reduce((sum: number, s: any) => sum + (s.valor_cobrado ?? 0), 0)
        const pend = (all ?? [])
          .filter((s: any) => s.status === 'concluida' && !s.pago)
          .reduce((sum: number, s: any) => sum + (s.valor_cobrado ?? 0), 0)
        setTotalHistorico(hist)
        setTotalPendente(pend)
      }
      setLoading(false)
    })
  }, [pacienteId, mes.getFullYear(), mes.getMonth()])

  return { paciente, sessoesMes, totalHistorico, totalPendente, loading, error }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run src/hooks/__tests__/useFinanceiroPaciente.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useFinanceiroPaciente.ts src/hooks/__tests__/useFinanceiroPaciente.test.ts
git commit -m "feat: add useFinanceiroPaciente hook"
```

---

## Task 13: FinanceiroPacientePage

**Files:**
- Rewrite: `src/pages/FinanceiroPacientePage.tsx`

- [ ] **Step 1: Write the full page**

```typescript
// src/pages/FinanceiroPacientePage.tsx
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { addMonths, subMonths, startOfMonth, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft } from 'lucide-react'
import { useFinanceiroPaciente } from '@/hooks/useFinanceiroPaciente'
import { STATUS_CONFIG } from '@/lib/statusConfig'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function FinanceiroPacientePage() {
  const { id } = useParams<{ id: string }>()
  const [mes, setMes] = useState(() => startOfMonth(new Date()))
  const { paciente, sessoesMes, totalHistorico, totalPendente, loading } =
    useFinanceiroPaciente(id!, mes)

  const tituloMes = format(mes, "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/financeiro" className="text-muted hover:text-[#1C1C1C] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-semibold text-[#1C1C1C] truncate">
            {paciente?.nome ?? '—'}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            {paciente?.tipo === 'convenio' && paciente.convenios && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#9B7EC8]/10 text-[#9B7EC8]">
                {paciente.convenios.nome}
              </span>
            )}
            {paciente?.tipo === 'particular' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Particular
              </span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Histórico pago', valor: totalHistorico, cor: '#4CAF82' },
              { label: 'Em aberto', valor: totalPendente, cor: '#C17F59' },
              { label: 'Sessões no mês', valor: sessoesMes.length, cor: '#2D6A6A', isMoeda: false },
            ].map(k => (
              <div key={k.label} className="bg-surface rounded-card border border-border p-3"
                style={{ borderLeftWidth: 3, borderLeftColor: k.cor }}>
                <p className="text-xs text-muted leading-tight mb-1">{k.label}</p>
                <p className="text-base font-semibold font-mono text-[#1C1C1C]">
                  {k.isMoeda === false ? k.valor : moeda(k.valor as number)}
                </p>
              </div>
            ))}
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium capitalize">{tituloMes}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setMes(m => startOfMonth(subMonths(m, 1)))}
                className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-[#1C1C1C] text-xs transition-colors"
              >
                ◀
              </button>
              <button
                onClick={() => setMes(m => startOfMonth(addMonths(m, 1)))}
                className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-[#1C1C1C] text-xs transition-colors"
              >
                ▶
              </button>
            </div>
          </div>

          {/* Sessions list */}
          {sessoesMes.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted">Nenhuma sessão neste mês.</p>
          ) : (
            <div className="bg-surface rounded-card border border-border overflow-hidden">
              {sessoesMes.map(s => {
                const cfg = STATUS_CONFIG[s.status]
                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0"
                    style={{ borderLeftWidth: 3, borderLeftColor: cfg.cor }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1C1C1C]">
                        {format(new Date(s.data_hora), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted">{s.modalidades?.nome} · {cfg.label}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {s.valor_cobrado != null && (
                        <p className="text-sm font-mono font-medium">{moeda(s.valor_cobrado)}</p>
                      )}
                      {s.status === 'concluida' && (
                        <p className={`text-xs mt-0.5 ${s.pago ? 'text-[#4CAF82]' : 'text-[#C17F59]'}`}>
                          {s.pago ? 'Pago' : 'Pendente'}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/FinanceiroPacientePage.tsx
git commit -m "feat: implement FinanceiroPacientePage with session history and KPIs"
```

---

## Task 14: ConfiguracoesPage — Convênios Section

**Files:**
- Modify: `src/pages/ConfiguracoesPage.tsx`

- [ ] **Step 1: Write the full ConfiguracoesPage with Convênios section**

```typescript
// src/pages/ConfiguracoesPage.tsx
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useConvenios } from '@/hooks/useConvenios'

const inputClass = "h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function ConfiguracoesPage() {
  const { convenios, loading, addConvenio, toggleAtivo, updateValor } = useConvenios()
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [editandoValor, setEditandoValor] = useState<Record<string, string>>({})

  function handleAdd() {
    if (!nome.trim()) return
    addConvenio(nome.trim(), valor ? Number(valor) : null)
    setNome('')
    setValor('')
  }

  function handleValorBlur(id: string) {
    const v = editandoValor[id]
    if (v !== undefined) {
      updateValor(id, v === '' ? null : Number(v))
      setEditandoValor(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C] mb-6">Configurações</h1>

      {/* Convênios section */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Convênios</p>

        {loading ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {convenios.length > 0 && (
              <div className="flex flex-col gap-2">
                {convenios.map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-[#1C1C1C]">{c.nome}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="R$/sessão"
                      value={editandoValor[c.id] !== undefined
                        ? editandoValor[c.id]
                        : (c.valor_sessao != null ? String(c.valor_sessao) : '')}
                      onChange={e => setEditandoValor(prev => ({ ...prev, [c.id]: e.target.value }))}
                      onBlur={() => handleValorBlur(c.id)}
                      className={`${inputClass} w-28`}
                    />
                    <button
                      onClick={() => toggleAtivo(c.id, false)}
                      className="text-muted hover:text-[#E07070] transition-colors"
                      title="Desativar convênio"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {convenios.length === 0 && (
              <p className="text-sm text-muted">Nenhum convênio cadastrado.</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <input
                placeholder="Nome do plano"
                value={nome}
                onChange={e => setNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="R$/sessão"
                value={valor}
                onChange={e => setValor(e.target.value)}
                className={`${inputClass} w-28`}
              />
              <button
                onClick={handleAdd}
                disabled={!nome.trim()}
                className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests and TypeScript check**

```bash
npx tsc --noEmit && npx vitest run
```

Expected: 0 TS errors, all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ConfiguracoesPage.tsx
git commit -m "feat: add Convênios management section to ConfiguracoesPage"
```

---

## Verification

After all tasks complete:

- [ ] Apply `005_convenios.sql` and `006_despesas.sql` in Supabase Studio
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx vitest run` — all tests pass
- [ ] Open `/onboarding` — confirm 4-step progress bar, Convênios step works
- [ ] Open `/pacientes/novo` — confirm tipo selector, convenio dropdown appears when Convênio selected
- [ ] Open `/kanban` → create session for a convenio patient — confirm value auto-fills
- [ ] Open `/financeiro` — confirm 4 tabs load, chart renders, month navigation works
- [ ] Open `/financeiro` → Pacientes tab → click patient → confirm `/financeiro/paciente/:id` loads
- [ ] Open `/configuracoes` — confirm Convênios section shows, add/remove works
