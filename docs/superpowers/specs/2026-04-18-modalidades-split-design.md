# Design Spec — Split `modalidades` into Modalidade de Sessão + Meio de Atendimento

**Date:** 2026-04-18
**Status:** Approved
**Project:** Psicologo

---

## 1. Overview

Today the app has a single `modalidades` table conflating two distinct concepts ("Presencial", "Online"). This spec replaces it with two independent editable tables:

- **Modalidade de sessão** — clinical nature of the appointment (Individual, Casal, Família, Neurodivergente)
- **Meio de atendimento** — operational mode (Presencial, Online, Domicílio)

Both are required on every new patient and session, both have emoji icons, and both are editable by the user in Configurações.

### Goals
- Let the psychologist classify sessions along two axes that matter clinically and operationally
- Preserve the app's existing pattern of user-editable lookup tables
- Keep session cards visually compact via emoji + hover tooltip

### Out of scope
- Billing logic driven by modalidade (values still come from contratos/convênios, not from modalidade)
- Reporting / analytics by modalidade breakdown
- Per-modalidade WhatsApp templates

---

## 2. Data Model Changes

### Migration `009_modalidades_split.sql`

Executes in this order (single transaction where possible):

1. **Create `modalidades_sessao`:**
   ```sql
   create table modalidades_sessao (
     id uuid primary key default gen_random_uuid(),
     nome text not null,
     emoji text not null,
     ativo boolean not null default true,
     criado_em timestamptz not null default now()
   );
   ```

2. **Create `meios_atendimento`:**
   ```sql
   create table meios_atendimento (
     id uuid primary key default gen_random_uuid(),
     nome text not null,
     emoji text not null,
     ativo boolean not null default true,
     criado_em timestamptz not null default now()
   );
   ```

3. **Seed both:**
   ```sql
   insert into modalidades_sessao (nome, emoji) values
     ('Individual',       '👤'),
     ('Casal',            '👥'),
     ('Família',          '👨‍👩‍👧'),
     ('Neurodivergente',  '🧩');

   insert into meios_atendimento (nome, emoji) values
     ('Presencial', '🏥'),
     ('Online',     '💻'),
     ('Domicílio',  '🏠');
   ```

4. **Add columns to `pacientes` and `sessoes` (nullable initially):**
   ```sql
   alter table pacientes
     add column modalidade_sessao_id uuid references modalidades_sessao(id),
     add column meio_atendimento_id  uuid references meios_atendimento(id);

   alter table sessoes
     add column modalidade_sessao_id uuid references modalidades_sessao(id),
     add column meio_atendimento_id  uuid references meios_atendimento(id);
   ```

5. **Backfill every existing row with Individual + Presencial** (the "clean slate" default):
   ```sql
   update pacientes
      set modalidade_sessao_id = (select id from modalidades_sessao where nome = 'Individual'),
          meio_atendimento_id  = (select id from meios_atendimento where nome = 'Presencial');

   update sessoes
      set modalidade_sessao_id = (select id from modalidades_sessao where nome = 'Individual'),
          meio_atendimento_id  = (select id from meios_atendimento where nome = 'Presencial');
   ```

6. **Enforce NOT NULL:**
   ```sql
   alter table pacientes
     alter column modalidade_sessao_id set not null,
     alter column meio_atendimento_id  set not null;

   alter table sessoes
     alter column modalidade_sessao_id set not null,
     alter column meio_atendimento_id  set not null;
   ```

7. **Drop the old `modalidades` infrastructure:**
   ```sql
   drop index if exists idx_sessoes_modalidade_id;
   alter table sessoes drop column modalidade_id;
   drop table modalidades;
   ```

8. **Enable RLS on the new tables with the same "authenticated full access" policy used elsewhere.**

9. **Add indexes:**
   ```sql
   create index idx_sessoes_modalidade_sessao_id on sessoes(modalidade_sessao_id);
   create index idx_sessoes_meio_atendimento_id on sessoes(meio_atendimento_id);
   create index idx_pacientes_modalidade_sessao_id on pacientes(modalidade_sessao_id);
   create index idx_pacientes_meio_atendimento_id on pacientes(meio_atendimento_id);
   ```

### Note on existing data
The migration discards the current `modalidades` rows ("Presencial", "Online", anything the user added). All existing patients and sessions are set to Individual + Presencial as a neutral default. The user can re-categorize via the Pacientes and Configurações pages afterward.

---

## 3. Types

Update `src/lib/types.ts`:

```ts
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

// Paciente gains two required FK columns + optional joined fields
export interface Paciente {
  // ...existing fields
  modalidade_sessao_id: string
  meio_atendimento_id: string
  modalidades_sessao?: Pick<ModalidadeSessao, 'nome' | 'emoji'>
  meios_atendimento?:  Pick<MeioAtendimento,  'nome' | 'emoji'>
}

// Sessao gains the same two required FK columns + optional joined fields
export interface Sessao {
  // ...existing fields
  modalidade_sessao_id: string
  meio_atendimento_id: string
  modalidades_sessao?: Pick<ModalidadeSessao, 'nome' | 'emoji'>
  meios_atendimento?:  Pick<MeioAtendimento,  'nome' | 'emoji'>
}
```

Delete the existing `Modalidade` interface and `modalidade_id` fields from `Paciente` / `Sessao`.

---

## 4. Hooks

### New
- `src/hooks/useModalidadesSessao.ts` — mirrors today's `useModalidades.ts` shape: `list`, `addModalidadeSessao`, `updateModalidadeSessao` (nome + emoji), `toggleAtivo`
- `src/hooks/useMeiosAtendimento.ts` — same shape for the meio table

### Delete
- `src/hooks/useModalidades.ts` and its test

### Modify (swap join from `modalidades(nome)` to both new tables)
- `src/hooks/usePacientes.ts`
- `src/hooks/useKanban.ts`
- `src/hooks/useSessoesDia.ts`
- `src/hooks/useSemana.ts`
- `src/hooks/useFinanceiroPaciente.ts`
- `src/hooks/usePacienteDetalhe.ts`

Each adjusts its `select(...)` string to replace `modalidades(nome)` with `modalidades_sessao(nome,emoji), meios_atendimento(nome,emoji)`.

### Tests
- Add unit tests for both new hooks (match the current `useModalidades.test.ts` mocking pattern).
- Update affected hook tests to cover the new join shape — assert both `modalidades_sessao` and `meios_atendimento` are present on returned rows.

---

## 5. UI Changes

### 5.1 Session cards (Kanban / Agenda / Checklist / `SessaoCard`)

Replace today's single "Presencial" badge with two emojis side-by-side, each with a `title` attribute for the hover tooltip:

```tsx
<span className="inline-flex gap-1 text-sm">
  <span title={sessao.modalidades_sessao?.nome}>{sessao.modalidades_sessao?.emoji}</span>
  <span title={sessao.meios_atendimento?.nome}>{sessao.meios_atendimento?.emoji}</span>
</span>
```

No text on the card — space is limited. The emoji + tooltip pattern matches the user's explicit preference.

### 5.2 Detail views (PacienteDetalhePage, FinanceiroPacientePage, any session detail)

Show emoji + full name side by side:

```
👨‍👩‍👧 Família · 🏥 Presencial
```

### 5.3 NovoPacientePage / EditarPacientePage

Add two required `<select>` fields below the existing tipo/convênio row:
- **Modalidade de sessão** — options are active `modalidades_sessao` rows
- **Meio de atendimento** — options are active `meios_atendimento` rows

Default value on create: the first active row in each table (seed default is Individual / Presencial). Validation via the existing zod schema pattern.

### 5.4 NovaSessaoModal

Two new required selects. Defaults pre-fill from the selected patient's `modalidade_sessao_id` / `meio_atendimento_id` when a patient is chosen. User can override for this session only.

### 5.5 OnboardingPage

Replace the current `StepModalidades` with `StepAtendimento`, a single step containing both pickers stacked (checkbox list of modalidades de sessão, then checkbox list of meios de atendimento). User selects which ones they use; deselected rows become `ativo=false`.

The onboarding flow count stays the same (the old Modalidades step is reused, not added).

### 5.6 ConfiguracoesPage

Replace the single "Modalidades" section with two sibling sections using the same card pattern:

- **"Modalidades de Sessão"** — table with columns: emoji, nome, ativo toggle, edit/delete. Emoji field is a native text input (user types or pastes any emoji).
- **"Meios de Atendimento"** — same pattern.

Both sections share the add-new-row UX (inline form or modal, matching the current implementation).

---

## 6. Data Flow

- Patient created → `modalidade_sessao_id` + `meio_atendimento_id` set on the `pacientes` row.
- Session created via NovaSessaoModal → pre-fills from patient's defaults → user confirms or overrides → values persist on `sessoes` row.
- Cards query via joined select → emoji + name available on every render without extra lookup.
- Configurações edits → directly update `modalidades_sessao` / `meios_atendimento` rows; joined selects on sessions still resolve because FK is stable.

---

## 7. Error Handling

- Required-field validation handled in zod schemas at form level (NovoPaciente, NovaSessaoModal, onboarding).
- DB-level NOT NULL is the backstop — if a form somehow submits without values, the insert fails with a Supabase error which the existing toast error handler surfaces.
- If a user deletes a `modalidade_sessao` or `meio_atendimento` that's still referenced by a patient or session, the FK prevents deletion — show a toast: "Não é possível excluir. Existem pacientes ou sessões usando esta modalidade." Offer "desativar" (set `ativo=false`) as the soft-delete alternative. The toggle `ativo` is the primary mechanism; hard delete is only allowed when unused.

---

## 8. Testing

Follow existing conventions (Vitest + React Testing Library).

- `useModalidadesSessao.test.ts` — list, add, toggleAtivo, update
- `useMeiosAtendimento.test.ts` — same shape
- Update `useKanban.test.ts`, `useSessoesDia.test.ts`, `usePacienteDetalhe.test.ts`, `useFinanceiroPaciente.test.ts` to assert the new join keys
- `OnboardingPage.test.tsx` — update the modalidades step assertion to cover both pickers

No new E2E. This is a data-shape refactor; the existing integration paths (create patient, create session, checklist, kanban) all continue to exercise the new fields once migrated.

---

## 9. Rollout

1. Apply migration `009_modalidades_split.sql` in Supabase Studio.
2. Update frontend code (the new columns must exist before the new code queries them, hence migration first).
3. No re-onboarding needed — existing onboarded users already have default values from the backfill. If they want to change modalidades, they do it in Configurações.

---

## 10. Open Questions

None. All four clarifying decisions are captured:
- Both tables editable (B)
- Clean-slate migration (B)
- Both required on new sessions + patients carry defaults (A, X)
- Emoji + tooltip on cards, emoji + name on detail views
