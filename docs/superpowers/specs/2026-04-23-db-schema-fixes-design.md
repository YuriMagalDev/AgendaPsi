# DB Schema Fixes — Design Spec

**Date:** 2026-04-23
**Branch:** feat/modalidades-split
**Migration:** `010_schema_fixes.sql`

## Context

Data model audit identified 10 issues (2 critical, 4 important, 4 minor). This spec covers all 10 in a single atomic migration + TypeScript updates.

---

## Section 1 — Structural Changes

### 1.1 Split `repasses` hybrid table

`repasses` currently serves two purposes:
- Per-session repasse: `sessao_id` set, `mes` null
- Monthly aggregate repasse: `mes` set, `sessao_id` null

This violates single responsibility and 3NF. Fix: create `repasses_mensais`, migrate existing monthly rows, then enforce `sessao_id NOT NULL` on `repasses`.

**New table `repasses_mensais`:**
```sql
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
```

**Clean up `repasses`:**
```sql
-- after data migration
alter table repasses drop column mes;
alter table repasses alter column sessao_id set not null;
drop index if exists idx_repasses_regra_mes;
```

**Data migration (must run before cleanup):**
```sql
insert into repasses_mensais (regra_repasse_id, mes, valor_calculado, pago, data_pagamento)
select regra_repasse_id, mes, valor_calculado, pago, data_pagamento
from repasses
where mes is not null;

delete from repasses where mes is not null;
```

### 1.2 Add `user_id` FK to `config_psicologo`

Enforces referential integrity with Supabase Auth. Nullable to allow existing rows.

```sql
alter table config_psicologo
  add column user_id uuid references auth.users(id) on delete cascade;
```

### 1.3 Add `data_fim` to `slots_semanais`

Allows natural expiration of recurring slots without forcing `ativo = false`.

```sql
alter table slots_semanais add column data_fim date;
```

### 1.4 Drop `sessoes.remarcada_para`

Redundant derived field. Source of truth: `select * from sessoes where sessao_origem_id = :id and status = 'agendada'`. Frontend already uses `sessao_origem_id` to track rescheduling.

```sql
alter table sessoes drop column remarcada_para;
```

---

## Section 2 — Constraints + Indexes

```sql
-- pacientes: tipo ↔ convenio_id must be consistent
alter table pacientes add constraint chk_convenio_consistente
  check (
    (tipo = 'particular' and convenio_id is null) or
    (tipo = 'convenio'   and convenio_id is not null)
  );

-- contratos: max 1 active contract per patient
create unique index idx_contratos_unico_ativo
  on contratos(paciente_id) where ativo = true;

-- despesas: mes must always be first day of month
alter table despesas add constraint chk_despesas_mes_primeiro_dia
  check (extract(day from mes) = 1);

-- missing FK index on pacientes.convenio_id
create index idx_pacientes_convenio_id on pacientes(convenio_id);

-- repasses: composite index for financial queries
create index idx_repasses_sessao_pago on repasses(sessao_id, pago);

-- repasses_mensais: indexes for financial queries
create index idx_repasses_mensais_mes on repasses_mensais(mes);
create index idx_repasses_mensais_regra_mes on repasses_mensais(regra_repasse_id, mes);

-- RLS for new table
alter table repasses_mensais enable row level security;
create policy "auth users full access" on repasses_mensais
  for all to authenticated using (true) with check (true);
```

---

## Section 3 — Migration Order (atomic, single file)

All changes in `supabase/migrations/010_schema_fixes.sql`. Order matters:

```
1. Create repasses_mensais table
2. Migrate monthly rows: INSERT INTO repasses_mensais SELECT ... FROM repasses WHERE mes IS NOT NULL
3. DELETE FROM repasses WHERE mes IS NOT NULL
4. ALTER repasses: drop mes column, set sessao_id NOT NULL, drop old index
5. Add constraints (chk_convenio_consistente, chk_contratos_unico_ativo, chk_despesas_mes_primeiro_dia)
6. Add indexes (pacientes.convenio_id, repasses composite, repasses_mensais)
7. RLS on repasses_mensais
8. Add config_psicologo.user_id FK
9. Add slots_semanais.data_fim
10. Drop sessoes.remarcada_para
```

Steps 2–3 must precede step 4 to avoid NOT NULL violation on existing data.

---

## Section 4 — TypeScript Changes

| File | Change |
|---|---|
| `src/lib/types.ts` | `Repasse`: remove `mes: string \| null` |
| `src/lib/types.ts` | New `RepasseMensal` interface |
| `src/lib/types.ts` | `Sessao`: remove `remarcada_para: string \| null` |
| `src/lib/types.ts` | `SlotSemanal`: add `data_fim: string \| null` |
| `src/lib/types.ts` | `ConfigPsicologo`: add `user_id: string \| null` |
| `src/lib/types.ts` | Delete `SessaoComModalidade` (subsumed by `SessaoView`) |
| `src/hooks/useRepasses.ts` (if exists) | Update queries to use `repasses_mensais` for monthly |
| `src/pages/KanbanPage.tsx` | Remove `remarcada_para` from update patches in `remarcar()` and rollback |
| `src/pages/ChecklistPage.tsx` | Remove `remarcada_para` from `StatusUpdate` type, update patches, rollback |
| `src/pages/NovoPacientePage.tsx` | Remove `remarcada_para: null` from session insert |
| `src/hooks/useKanban.ts` | Remove `remarcada_para` param from `updateStatus()` |
| `src/hooks/__tests__/useKanban.test.ts` | Remove `remarcada_para` from fixture data |
| `src/hooks/__tests__/usePacienteDetalhe.test.ts` | Remove `remarcada_para` from fixture data |
| `src/hooks/__tests__/useSessoesDia.test.ts` | Remove `remarcada_para` from fixture data |

**New `RepasseMensal` interface:**
```ts
export interface RepasseMensal {
  id: string
  regra_repasse_id: string
  mes: string           // ISO date, always first of month
  valor_calculado: number
  pago: boolean
  data_pagamento: string | null
}
```

---

## Section 5 — Out of Scope

- `evolution_token` encryption (Supabase Vault — separate effort)
- UI changes for `data_fim` on slots (no UI exists for slots yet)
- Backfilling `config_psicologo.user_id` for existing rows (manual or separate script)
