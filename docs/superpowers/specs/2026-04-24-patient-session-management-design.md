# Patient & Session Management — Design Spec

**Date:** 2026-04-24
**Status:** Approved

---

## Context

Three usability gaps and one data management feature identified in the current patient/session flow:

1. **Modality/attendance duplicated** — registered twice (patient level + each slot) during patient creation
2. **Slot recurrence locked to weekly** — no way to set quinzenal, mensal, or custom intervals
3. **No session editing** — `SessaoPanel` allows status changes and payment but not date/time/value/modality edits
4. **No CSV export/import** — no way to bulk-migrate or back up patient data

---

## Section 1 — Patient + Slot Refactor

### 1.1 Modality/attendance ownership

`modalidade_sessao_id` and `meio_atendimento_id` remain on the `pacientes` table as required fields — they identify how the patient typically attends. They remain on `sessoes` as well (copied at session creation for historical accuracy and per-session overrides).

`slots_semanais` currently also requires both fields. This causes double-entry during patient registration. **Fix:** make them nullable on `slots_semanais`. Sessions generated from a slot inherit the patient's values instead.

**DB migration:**
```sql
ALTER TABLE slots_semanais ALTER COLUMN modalidade_sessao_id DROP NOT NULL;
ALTER TABLE slots_semanais ALTER COLUMN meio_atendimento_id DROP NOT NULL;
```

**UI changes:**
- `NovoPacientePage` slot row: remove the modality and attendance selects
- `EditarPacientePage`: no change (slots are not editable there currently)
- Session generation (`gerarSessoesParaSlot`): read modality/attendance from the patient object, not from the slot

### 1.2 Flexible slot recurrence

Add `intervalo_semanas int NOT NULL DEFAULT 1` to `slots_semanais`. This is the number of weeks between sessions.

**DB migration:**
```sql
ALTER TABLE slots_semanais ADD COLUMN intervalo_semanas int NOT NULL DEFAULT 1;
```

**UI — slot row in `NovoPacientePage`:** replace the current weekly-only assumption with a recurrence picker. Show three preset buttons (Semanal / Quinzenal / Mensal) that set `intervalo_semanas` to 1 / 2 / 4. Also show a free number input for custom intervals. Default: Semanal.

**Session generation logic (`gerarSessoesParaSlot`):**
- Current: generates one session per week for N weeks
- New: generates one session every `intervalo_semanas` weeks for N weeks, stepping `addWeeks(base, i * intervalo_semanas)`
- Total sessions generated = `Math.ceil(semanas / intervalo_semanas)`

---

## Section 2 — Session Editing

### 2.1 Edit mode in SessaoPanel

`SessaoPanel` (in `KanbanPage`) gains an edit mode toggled by a pencil icon button in the panel header. Edit mode replaces the status-action buttons with an inline form.

**Editable fields:**
| Field | Input type | Notes |
|---|---|---|
| `data_hora` | `datetime-local` | In-place update — no new session row created |
| `duracao_minutos` | `select` | Options: 30 / 45 / 50 / 60 / 90 min |
| `valor_cobrado` | `number` | Step 0.01 |
| `modalidade_sessao_id` | `select` | Defaults to patient's modality; overridable |
| `meio_atendimento_id` | `select` | Defaults to patient's attendance; overridable |

**Save:** `supabase.from('sessoes').update({...}).eq('id', sessao.id)` → calls `onUpdate()` and returns to display mode.

**Cancel:** reverts to display mode with no changes.

**Constraints:**
- Edit mode only available for sessions with status `agendada` or `confirmada`
- Already-finalized sessions (`concluida`, `faltou`, `cancelada`, `remarcada`) are read-only
- Editing `data_hora` updates the row in place — this is a psychologist-initiated schedule adjustment, not a patient reschedule. The existing `confirmacoes_whatsapp` row remains linked.

No DB migration required — `sessoes` already has all these columns.

### 2.2 AgendaPage session interaction

`AgendaPage` currently renders `SessaoCard` with `onClick` but opens nothing. Wire it up to open the same `SessaoPanel` used in KanbanPage. `SessaoPanel` is already self-contained and reusable.

---

## Section 3 — CSV Export / Import

### 3.1 Export

Button labeled **"Exportar CSV"** in the `PacientesPage` header (next to "+ Novo paciente").

**Behavior:** fetches all patients (including archived) from Supabase, builds a CSV string client-side, triggers a browser download as `pacientes.csv`.

**Columns:**
```
nome,telefone,email,data_nascimento,tipo,ativo
```

No Edge Function. Pure frontend: build string → `URL.createObjectURL(new Blob([csv]))` → `<a download>` click.

### 3.2 Import

Button labeled **"Importar CSV"** in the `PacientesPage` header. Opens a hidden `<input type="file" accept=".csv">`.

**Flow:**
1. User selects a `.csv` file
2. File is parsed client-side (split by newline + comma, trim whitespace)
3. Modal opens showing a preview table with all parsed rows
4. Rows with validation errors are highlighted in red: missing `nome`, invalid email format
5. Psychologist reviews and clicks **"Importar N pacientes"** (valid rows only)
6. Bulk insert: `supabase.from('pacientes').insert(validRows)`
7. Duplicate detection: before insert, fetch existing `(nome, telefone)` pairs; skip rows where both match an existing patient
8. Success toast shows: "X pacientes importados, Y ignorados (duplicados), Z com erros"

**Expected CSV format:** same as export — same columns, same order. Header row required.

**Import limitations:**
- Basic patient data only (name, phone, email, birthdate, type, active)
- No contracts, no slots — added manually after import
- `tipo` must be `particular` or `convenio`; defaults to `particular` if blank or invalid
- `ativo` defaults to `true` if blank

No DB migration. No Edge Function.

---

## File Map

| Action | Path |
|---|---|
| Modify | `supabase/migrations/` — new migration file for slot schema changes |
| Modify | `src/pages/NovoPacientePage.tsx` — remove slot modality/attendance, add recurrence picker |
| Modify | `src/components/sessao/NovaSessaoModal.tsx` — use patient modality as default (already done; verify) |
| Modify | `src/pages/KanbanPage.tsx` — add edit mode to `SessaoPanel` |
| Modify | `src/pages/AgendaPage.tsx` — wire card click to open `SessaoPanel` |
| Modify | `src/pages/PacientesPage.tsx` — add export + import buttons |
| Create | `src/lib/csv.ts` — CSV build and parse utilities |

---

## Out of Scope

- Contract editing (separate effort)
- Slot editing after patient creation (separate effort)
- Import of contracts or slots via CSV
- Avulso → patient conversion
- Server-side CSV generation via Edge Function
