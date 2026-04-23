# DB Schema Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 10 data model fixes identified in audit: split `repasses` hybrid table, add constraints/indexes, drop redundant fields, and update all TypeScript consumers.

**Architecture:** One atomic SQL migration (`010_schema_fixes.sql`) applied to Supabase, followed by TypeScript type updates and frontend changes that remove references to dropped/changed columns. Migration must be applied before the app will compile cleanly against the live DB.

**Tech Stack:** PostgreSQL (Supabase), TypeScript, React 19, Vitest + Testing Library.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/010_schema_fixes.sql` | Create | All DB schema changes in one atomic migration |
| `src/lib/types.ts` | Modify | Update/add/remove types to match new schema |
| `src/hooks/useRepasses.ts` | Modify | Switch from `repasses.mes` → `repasses_mensais` |
| `src/hooks/__tests__/useRepasses.test.ts` | Modify | Update mock data to use `repasses_mensais` |
| `src/hooks/usePacienteDetalhe.ts` | Modify | Replace `SessaoComModalidade` → `SessaoView` |
| `src/hooks/useFinanceiroPaciente.ts` | Modify | Replace `SessaoComModalidade` → `SessaoView` |
| `src/hooks/useKanban.ts` | Modify | Remove `remarcada_para` param from `updateStatus` |
| `src/hooks/__tests__/useKanban.test.ts` | Modify | Remove `remarcada_para` from fixture data |
| `src/hooks/__tests__/usePacienteDetalhe.test.ts` | Modify | Remove `remarcada_para` from fixture data |
| `src/hooks/__tests__/useSessoesDia.test.ts` | Modify | Remove `remarcada_para` from fixture data |
| `src/pages/KanbanPage.tsx` | Modify | Remove `remarcada_para` from remarcar flow |
| `src/pages/ChecklistPage.tsx` | Modify | Remove `remarcada_para` from StatusUpdate + patches |
| `src/pages/NovoPacientePage.tsx` | Modify | Remove `remarcada_para: null` from session insert |

---

## Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/010_schema_fixes.sql`

> Note: SQL migrations cannot be tested with Vitest. Verify by running `npx supabase db push` against a local Supabase instance, or apply manually via the Supabase dashboard. The migration is atomic — if any statement fails, the whole migration rolls back.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/010_schema_fixes.sql` with this exact content:

```sql
-- 010_schema_fixes.sql
-- Atomic migration: all-or-nothing. Must run in order.

-- ─────────────────────────────────────────────
-- 1. Create repasses_mensais (split from repasses hybrid table)
-- ─────────────────────────────────────────────
create table repasses_mensais (
  id               uuid primary key default uuid_generate_v4(),
  regra_repasse_id uuid not null references regras_repasse(id),
  mes              date not null,
  valor_calculado  numeric(10,2) not null,
  pago             boolean not null default false,
  data_pagamento   date,
  constraint chk_repasses_mensais_mes_primeiro_dia check (extract(day from mes) = 1),
  unique (regra_repasse_id, mes)
);

alter table repasses_mensais enable row level security;
create policy "auth users full access" on repasses_mensais
  for all to authenticated using (true) with check (true);

create index idx_repasses_mensais_mes on repasses_mensais(mes);
create index idx_repasses_mensais_regra_mes on repasses_mensais(regra_repasse_id, mes);

-- ─────────────────────────────────────────────
-- 2. Migrate existing monthly rows to repasses_mensais
-- ─────────────────────────────────────────────
insert into repasses_mensais (regra_repasse_id, mes, valor_calculado, pago, data_pagamento)
select regra_repasse_id, mes, valor_calculado, pago, data_pagamento
from repasses
where mes is not null;

delete from repasses where mes is not null;

-- ─────────────────────────────────────────────
-- 3. Clean up repasses (remove hybrid columns)
-- ─────────────────────────────────────────────
drop index if exists idx_repasses_regra_mes;
alter table repasses alter column sessao_id set not null;
alter table repasses drop column mes;

create index idx_repasses_sessao_pago on repasses(sessao_id, pago);

-- ─────────────────────────────────────────────
-- 4. pacientes: enforce tipo ↔ convenio_id consistency
-- ─────────────────────────────────────────────
alter table pacientes add constraint chk_convenio_consistente
  check (
    (tipo = 'particular' and convenio_id is null) or
    (tipo = 'convenio'   and convenio_id is not null)
  );

create index idx_pacientes_convenio_id on pacientes(convenio_id);

-- ─────────────────────────────────────────────
-- 5. contratos: max 1 active per patient
-- ─────────────────────────────────────────────
create unique index idx_contratos_unico_ativo
  on contratos(paciente_id) where ativo = true;

-- ─────────────────────────────────────────────
-- 6. despesas: enforce mes = first day of month
-- ─────────────────────────────────────────────
alter table despesas add constraint chk_despesas_mes_primeiro_dia
  check (extract(day from mes) = 1);

-- ─────────────────────────────────────────────
-- 7. config_psicologo: add user_id FK
-- ─────────────────────────────────────────────
alter table config_psicologo
  add column user_id uuid references auth.users(id) on delete cascade;

-- ─────────────────────────────────────────────
-- 8. slots_semanais: add optional end date
-- ─────────────────────────────────────────────
alter table slots_semanais add column data_fim date;

-- ─────────────────────────────────────────────
-- 9. sessoes: drop redundant remarcada_para
--    Source of truth: sessoes WHERE sessao_origem_id = id AND status = 'agendada'
-- ─────────────────────────────────────────────
alter table sessoes drop column remarcada_para;
```

- [ ] **Step 2: Commit the migration**

```bash
git add supabase/migrations/010_schema_fixes.sql
git commit -m "feat(db): migration 010 — schema fixes (repasses split, constraints, indexes, drop remarcada_para)"
```

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Apply all type changes**

Open `src/lib/types.ts` and make these changes:

**a) Remove `remarcada_para` from `Sessao` (line ~67):**
```ts
// REMOVE this line:
remarcada_para: string | null
```

**b) Remove `mes` from `Repasse`:**
```ts
export interface Repasse {
  id: string
  regra_repasse_id: string
  sessao_id: string          // now NOT NULL
  valor_calculado: number
  pago: boolean
  data_pagamento: string | null
}
```

**c) Add `RepasseMensal` interface (after `Repasse`):**
```ts
export interface RepasseMensal {
  id: string
  regra_repasse_id: string
  mes: string                // ISO date, always first of month (yyyy-MM-01)
  valor_calculado: number
  pago: boolean
  data_pagamento: string | null
}
```

**d) Add `data_fim` to `SlotSemanal`:**
```ts
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
  data_fim: string | null    // add this
  criado_em: string
}
```

**e) Add `user_id` to `ConfigPsicologo`:**
```ts
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
  user_id: string | null     // add this
}
```

**f) Delete `SessaoComModalidade` type entirely** (lines ~124-127):
```ts
// DELETE these lines:
export type SessaoComModalidade = Sessao & {
  modalidades_sessao: { nome: string; emoji: string } | null
  meios_atendimento:  { nome: string; emoji: string } | null
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: errors about `SessaoComModalidade` not found in `usePacienteDetalhe.ts` and `useFinanceiroPaciente.ts`. That is expected — those hooks are fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): update types for schema 010 — RepasseMensal, remove remarcada_para, SlotSemanal data_fim, ConfigPsicologo user_id, delete SessaoComModalidade"
```

---

## Task 3: Update hooks that used `SessaoComModalidade`

**Files:**
- Modify: `src/hooks/usePacienteDetalhe.ts`
- Modify: `src/hooks/useFinanceiroPaciente.ts`

Both hooks import `SessaoComModalidade` which is now deleted. Replace with `SessaoView` — it's a superset (adds nullable `pacientes` field, which is fine since the data fetched in these hooks doesn't join pacientes).

- [ ] **Step 1: Update `usePacienteDetalhe.ts`**

Replace the import line:
```ts
// BEFORE:
import type { Paciente, Contrato, SessaoComModalidade } from '@/lib/types'

// AFTER:
import type { Paciente, Contrato, SessaoView } from '@/lib/types'
```

Replace all 3 occurrences of `SessaoComModalidade` with `SessaoView`:
```ts
// Line 14 — BEFORE:
const [sessoes, setSessoes] = useState<SessaoComModalidade[]>([])
// AFTER:
const [sessoes, setSessoes] = useState<SessaoView[]>([])

// Line 54 — BEFORE:
setSessoes((sessoesRes.data ?? []) as SessaoComModalidade[])
// AFTER:
setSessoes((sessoesRes.data ?? []) as SessaoView[])
```

- [ ] **Step 2: Update `useFinanceiroPaciente.ts`**

Replace the import line:
```ts
// BEFORE:
import type { PacienteComConvenio, SessaoComModalidade } from '@/lib/types'

// AFTER:
import type { PacienteComConvenio, SessaoView } from '@/lib/types'
```

Replace all occurrences of `SessaoComModalidade` with `SessaoView`:
```ts
// BEFORE:
const [sessoesMes, setSessoesMes] = useState<SessaoComModalidade[]>([])
// AFTER:
const [sessoesMes, setSessoesMes] = useState<SessaoView[]>([])

// BEFORE:
setSessoesMes((mes_ ?? []) as SessaoComModalidade[])
// AFTER:
setSessoesMes((mes_ ?? []) as SessaoView[])
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: remaining errors only from `remarcada_para` usages in pages/hooks (fixed in later tasks). If there are unexpected errors, fix them before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/usePacienteDetalhe.ts src/hooks/useFinanceiroPaciente.ts
git commit -m "refactor(hooks): replace SessaoComModalidade with SessaoView"
```

---

## Task 4: Update `useRepasses` hook

**Files:**
- Modify: `src/hooks/useRepasses.ts`
- Modify: `src/hooks/__tests__/useRepasses.test.ts`

`useRepasses` currently queries `repasses` with `.eq('mes', mesStr)` and upserts with `sessao_id: null`. After the migration, monthly repasses live in `repasses_mensais`. Switch table name throughout.

- [ ] **Step 1: Update `useRepasses.ts`**

Replace the full file content with:

```ts
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
      supabase.from('repasses_mensais').select('*').eq('mes', mesStr),
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
    await supabase.from('repasses_mensais').upsert({
      regra_repasse_id: regraId,
      mes: mesStr,
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

Key changes: `'repasses'` → `'repasses_mensais'` in both fetch and upsert; `sessao_id: null` removed from upsert.

- [ ] **Step 2: Verify test still passes without changes**

The mock in `src/hooks/__tests__/useRepasses.test.ts` uses `mockReturnValueOnce` — it does not assert which table name is passed to `.from()`. The mock data shape for `repasses_mensais` is identical to the monthly mode of `repasses` (same fields: id, regra_repasse_id, mes, valor_calculado, pago, data_pagamento). No changes to the test file are needed.

Verify:

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/hooks/__tests__/useRepasses.test.ts
```

Expected: 1 passing test.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useRepasses.ts src/hooks/__tests__/useRepasses.test.ts
git commit -m "feat(hooks): useRepasses — switch from repasses.mes to repasses_mensais table"
```

---

## Task 5: Fix test fixtures — remove `remarcada_para`

**Files:**
- Modify: `src/hooks/__tests__/useKanban.test.ts`
- Modify: `src/hooks/__tests__/usePacienteDetalhe.test.ts`
- Modify: `src/hooks/__tests__/useSessoesDia.test.ts`

Remove `remarcada_para` from all session fixture objects. TypeScript will error if it stays since the field no longer exists in `Sessao`.

- [ ] **Step 1: Update `useKanban.test.ts`**

Find the two mock session objects (lines ~21-22). Remove `remarcada_para: null,` from each:

```ts
// BEFORE (line 21):
{ id: 's-1', status: 'agendada', paciente_id: 'p-1', avulso_nome: null, avulso_telefone: null, modalidade_sessao_id: 'ms-1', meio_atendimento_id: 'ma-1', data_hora: '2026-04-16T10:00:00Z', valor_cobrado: 150, pago: false, data_pagamento: null, remarcada_para: null, sessao_origem_id: null, criado_em: '2026-04-01T00:00:00Z', modalidades_sessao: { nome: 'Individual', emoji: '👤' }, meios_atendimento: { nome: 'Presencial', emoji: '🏥' }, pacientes: { nome: 'Ana Lima' } },

// AFTER:
{ id: 's-1', status: 'agendada', paciente_id: 'p-1', avulso_nome: null, avulso_telefone: null, modalidade_sessao_id: 'ms-1', meio_atendimento_id: 'ma-1', data_hora: '2026-04-16T10:00:00Z', valor_cobrado: 150, pago: false, data_pagamento: null, sessao_origem_id: null, criado_em: '2026-04-01T00:00:00Z', modalidades_sessao: { nome: 'Individual', emoji: '👤' }, meios_atendimento: { nome: 'Presencial', emoji: '🏥' }, pacientes: { nome: 'Ana Lima' } },
```

Do the same for `s-2`.

- [ ] **Step 2: Update `usePacienteDetalhe.test.ts`**

Remove `remarcada_para: null,` from all 3 mock session objects (lines ~22-24).

- [ ] **Step 3: Update `useSessoesDia.test.ts`**

Remove `remarcada_para: null,` from the mock session object (line ~15).

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass. If TypeScript errors remain about `remarcada_para`, there are additional fixture locations — find with `grep -r "remarcada_para" src/`.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/__tests__/useKanban.test.ts src/hooks/__tests__/usePacienteDetalhe.test.ts src/hooks/__tests__/useSessoesDia.test.ts
git commit -m "fix(tests): remove remarcada_para from all session fixtures"
```

---

## Task 6: Update `useKanban` hook

**Files:**
- Modify: `src/hooks/useKanban.ts`

Remove `remarcada_para` optional param from `updateStatus`. The function is called by `KanbanPage` and `ChecklistPage` — those callers are updated in Task 7.

- [ ] **Step 1: Update `updateStatus` in `useKanban.ts`**

Find the `updateStatus` function (lines ~48-51):

```ts
// BEFORE:
async function updateStatus(id: string, status: SessaoStatus, remarcada_para?: string) {
  const patch: Record<string, unknown> = { status }
  if (remarcada_para) patch.remarcada_para = remarcada_para
  await supabase.from('sessoes').update(patch).eq('id', id)
  await refetch()
}

// AFTER:
async function updateStatus(id: string, status: SessaoStatus) {
  await supabase.from('sessoes').update({ status }).eq('id', id)
  await refetch()
}
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run src/hooks/__tests__/useKanban.test.ts
```

Expected: all passing.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useKanban.ts
git commit -m "refactor(hooks): useKanban — remove remarcada_para from updateStatus"
```

---

## Task 7: Update pages — remove `remarcada_para`

**Files:**
- Modify: `src/pages/KanbanPage.tsx`
- Modify: `src/pages/ChecklistPage.tsx`
- Modify: `src/pages/NovoPacientePage.tsx`

- [ ] **Step 1: Update `KanbanPage.tsx`**

Find the `remarcar` function. Make these 3 changes:

**a)** Line ~68 — remove `remarcada_para` from the update of the original session:
```ts
// BEFORE:
await supabase.from('sessoes').update({ status: 'remarcada', remarcada_para: novaDataHora }).eq('id', sessao.id)

// AFTER:
await supabase.from('sessoes').update({ status: 'remarcada' }).eq('id', sessao.id)
```

**b)** Line ~82 — remove `remarcada_para: null` from the new session insert:
```ts
// BEFORE:
const { error: insertError } = await supabase.from('sessoes').insert({
  paciente_id: sessao.paciente_id,
  avulso_nome: sessao.avulso_nome,
  avulso_telefone: sessao.avulso_telefone,
  modalidade_id: sessao.modalidade_id,
  data_hora: novaDataHora,
  status: 'agendada',
  valor_cobrado: sessao.valor_cobrado,
  pago: false,
  data_pagamento: null,
  remarcada_para: null,
  sessao_origem_id: sessao.id,
})

// AFTER:
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
```

Note: also fix pre-existing bug — insert still uses deprecated `modalidade_id` (removed in migration 009) instead of `modalidade_sessao_id` + `meio_atendimento_id`. Fix both issues in this step.

**c)** Line ~88 — remove `remarcada_para: null` from the rollback update:
```ts
// BEFORE:
await supabase.from('sessoes').update({ status: sessao.status, remarcada_para: null }).eq('id', sessao.id)

// AFTER:
await supabase.from('sessoes').update({ status: sessao.status }).eq('id', sessao.id)
```

- [ ] **Step 2: Update `ChecklistPage.tsx`**

**a)** Line ~19 — remove `remarcada_para` from `StatusUpdate` type:
```ts
// BEFORE:
type StatusUpdate = { id: string; status: SessaoStatus; remarcada_para?: string }

// AFTER:
type StatusUpdate = { id: string; status: SessaoStatus }
```

**b)** Line ~179 — remove `remarcada_para` from the original session update:
```ts
// BEFORE:
.update({ status: 'remarcada', remarcada_para: novaDataHora })

// AFTER:
.update({ status: 'remarcada' })
```

**c)** Line ~192 — remove `remarcada_para: null` from the new session insert:
```ts
// Remove: remarcada_para: null,
```

**d)** Line ~198 — remove `remarcada_para: null` from the rollback update:
```ts
// BEFORE:
.update({ status: sessao.status, remarcada_para: null })

// AFTER:
.update({ status: sessao.status })
```

**e)** Line ~215 — remove the conditional patch line:
```ts
// REMOVE:
if (u.remarcada_para) patch.remarcada_para = u.remarcada_para
```

- [ ] **Step 3: Update `NovoPacientePage.tsx`**

Find the session insert (line ~91). Remove `remarcada_para: null,`:
```ts
// REMOVE this line from the insert object:
remarcada_para: null,
```

- [ ] **Step 4: Verify TypeScript is clean**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/KanbanPage.tsx src/pages/ChecklistPage.tsx src/pages/NovoPacientePage.tsx
git commit -m "refactor(pages): remove remarcada_para from all session mutations"
```

---

## Final Verification Checklist

After all tasks complete:

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `npx vitest run` — all tests pass
- [ ] No `remarcada_para` references remain: `grep -r "remarcada_para" src/` → empty
- [ ] No `SessaoComModalidade` references remain: `grep -r "SessaoComModalidade" src/` → empty
- [ ] No `repasses.mes` references remain in hooks: `grep -r "\.eq('mes'" src/hooks/` → empty (only `repasses_mensais`)
- [ ] Migration file exists: `supabase/migrations/010_schema_fixes.sql`
