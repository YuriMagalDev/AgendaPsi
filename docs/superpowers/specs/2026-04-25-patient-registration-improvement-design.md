# Patient Registration Improvement — Design Spec

**Date:** 2026-04-25
**Status:** Approved

---

## Context

Four gaps in the current patient registration and management flow:

1. **Single long form** — `NovoPacientePage` renders all fields at once (dados, horários, cobrança), causing cognitive fatigue
2. **No conflict detection** — adding a slot never checks whether that weekday+time is already taken by another patient
3. **Session duration hardcoded** — `gerarSessoesParaSlot` always uses 50 min; no way to configure per-patient
4. **No slot editing** — `EditarPacientePage` has no slots section; the psychologist cannot change a patient's recurring schedule after creation
5. **No patient notes** — no free-text field for contextual information about the patient

---

## Section 1 — Multi-Step Registration Wizard

### 1.1 Step structure

`NovoPacientePage` becomes a 3-step wizard. A single `react-hook-form` instance manages all fields across steps; `step` is local state (1 | 2 | 3). Navigation validates only the fields belonging to the current step via `trigger([...fields])` before advancing.

**Step 1 — Dados pessoais**
- Nome (required)
- Tipo (particular / convênio)
- Convênio (required if tipo = convênio)
- WhatsApp / telefone
- E-mail
- Data de nascimento
- Notas (optional textarea — see Section 3)

**Step 2 — Sessão**
- Modalidade de sessão (required)
- Meio de atendimento (required)
- Duração padrão (required select: 30/45/50/60/90 min, default 50 — see Section 2)
- Horários semanais (slots with day, time, recurrence — same UI as current, but duration inherited from above)
- Conflict check runs per slot change (see Section 2)
- "Próximo" disabled while any slot has a conflict

**Step 3 — Cobrança**
- Same billing fields as current (`tem_contrato`, tipo, valor, qtd_sessoes, dia_vencimento)
- "Salvar" button replaces "Próximo"

### 1.2 Progress indicator

Three-node step bar at the top: completed steps show ✓ in teal; active step shows step number in teal; future steps muted. Connects nodes with a line that fills teal as steps are completed.

### 1.3 Navigation

- "Próximo →" button advances after validating current step
- "← Anterior" button goes back (no validation, preserves data)
- "Cancelar" link returns to `/pacientes`
- "Salvar" on step 3 submits all data (same logic as current `onSubmit`)

---

## Section 2 — Conflict Detection

### 2.1 Duration on slots

`duracao_minutos` is added to `SlotSemanalInput`, `SlotSemanal` (types), and `slots_semanais` (DB). In the wizard, a single "Duração padrão" select at the top of step 2 sets the duration for all slots added in that registration. Each slot row inherits this value; it is stored on the slot record and passed to `gerarSessoesParaSlot`.

`gerarSessoesParaSlot` changes: reads `slot.duracao_minutos` instead of hardcoding 50.

**DB migration:**
```sql
ALTER TABLE slots_semanais ADD COLUMN duracao_minutos int NOT NULL DEFAULT 50;
```

### 2.2 Conflict check logic

On page load, `NovoPacientePage` (step 2) fetches all active slots from Supabase:
```sql
SELECT dia_semana, horario, duracao_minutos FROM slots_semanais WHERE ativo = true
```

When the user adds or modifies a slot, the conflict check runs client-side:

```
conflict = existingSlots.some(existing =>
  existing.dia_semana === slot.dia_semana &&
  timeOverlaps(slot.horario, slot.duracao_minutos, existing.horario, existing.duracao_minutos)
)

timeOverlaps(t1, d1, t2, d2):
  start1 = toMinutes(t1), end1 = start1 + d1
  start2 = toMinutes(t2), end2 = start2 + d2
  return start1 < end2 && start2 < end1
```

**UI feedback:**
- Conflicting slot: amber warning banner inside the slot card — "⚠️ Conflito: outro paciente ocupa [Dia] [HH:mm]–[HH:mm]"
- Clean slot: green border + "✓ Horário disponível"
- "Próximo" button disabled while any slot has `conflito = true`

**Scope:** checks against ALL active `slots_semanais` rows (all patients). Does not check against one-off sessions in `sessoes` (out of scope — slots are the recurring schedule).

---

## Section 3 — New Fields

### 3.1 Session duration (mandatory on slot)

- Added to `SlotSemanalInput` as `duracao_minutos: number`
- Added to `SlotSemanal` type as `duracao_minutos: number`
- In `NovoPacientePage` step 2: single select at top of section ("Duração padrão") sets the value for all slots; each `SlotSemanalInput` stores it
- In `EditarPacientePage` slots section: editable per slot (select 30/45/50/60/90)
- `gerarSessoesParaSlot` reads `slot.duracao_minutos` (was hardcoded 50)

### 3.2 Patient notes (optional)

- `notas text` column added to `pacientes` table (nullable)
- Textarea in step 1 of `NovoPacientePage` (label: "Notas", placeholder: "Informações adicionais sobre o paciente")
- Field added to `EditarPacientePage` Dados pessoais section
- Field added to patient detail view (`/pacientes/:id`) if a notes section exists there

**DB migration:**
```sql
ALTER TABLE pacientes ADD COLUMN notas text;
```

---

## Section 4 — Slot Editing in EditarPacientePage

### 4.1 New "Horários semanais" section

`EditarPacientePage` gains a third card section after "Dados pessoais" and "Cobrança". It loads active slots via `useSlotsSemanais(pacienteId)` — a new hook that fetches `slots_semanais WHERE paciente_id = id AND ativo = true`.

### 4.2 Editing existing slots

Each slot row shows: nome, dia_semana, horario, duracao_minutos, intervalo_semanas, is_pacote — all editable. On change, calls `supabase.from('slots_semanais').update({...}).eq('id', slot.id)`.

**Important:** editing a slot updates the slot record only. Already-generated sessions in `sessoes` are NOT retroactively changed — the psychologist edits individual sessions via `SessaoPanel`. Only future slot generation (if triggered) uses the new values.

Conflict check applies: same logic as Section 2, excluding the slot being edited from the existing set.

### 4.3 Adding new slots

Same "Adicionar horário" button as `NovoPacientePage`. On save:
1. Inserts slot to `slots_semanais`
2. Calls `gerarSessoesParaSlot` for the next 8 weeks from today
3. Inserts generated sessions to `sessoes`

### 4.4 Deactivating slots

Each slot row has a deactivate button (archive icon). Sets `ativo = false` on the slot record. Does not delete the slot or any existing sessions. No new sessions will be generated from the slot.

---

## DB Migrations

Two new migration files:

```sql
-- 014_slot_duration.sql
ALTER TABLE slots_semanais ADD COLUMN duracao_minutos int NOT NULL DEFAULT 50;

-- 015_patient_notes.sql
ALTER TABLE pacientes ADD COLUMN notas text;
```

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/014_slot_duration.sql` |
| Create | `supabase/migrations/015_patient_notes.sql` |
| Create | `src/hooks/useSlotsSemanais.ts` |
| Create | `src/lib/conflictCheck.ts` |
| Create | `src/lib/__tests__/conflictCheck.test.ts` |
| Modify | `src/lib/types.ts` — add `duracao_minutos` to SlotSemanal/SlotSemanalInput; add `notas` to Paciente |
| Modify | `src/lib/sessaoUtils.ts` — read `slot.duracao_minutos` instead of hardcoding 50 |
| Modify | `src/lib/__tests__/sessaoUtils.test.ts` — update slot fixtures to include `duracao_minutos` |
| Modify | `src/pages/NovoPacientePage.tsx` — full rewrite as 3-step wizard |
| Modify | `src/pages/EditarPacientePage.tsx` — add slots section + notas field |

---

## Out of Scope

- Retroactive session update when a slot time is edited
- Conflict check against one-off sessions (only checks `slots_semanais`)
- Slot editing in `NovoPacientePage` after moving to step 3 (back button preserves data but slots are not re-validated until step 2)
- Patient notes shown in kanban card or agenda view
