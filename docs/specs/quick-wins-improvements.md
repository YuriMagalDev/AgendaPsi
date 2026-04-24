# Quick Wins — Feature Specs

---

## 1. Patient Search & Filters

**Current:** List shows all patients. No filtering.

**Change:** Add filter bar below search with toggles + dropdowns.

```
[Search by name]  [Active only ✓]  [Modality: All ▼]  [Contract: All ▼]
```

### Implementation

**Components affected:**
- `PacientesPage.tsx` — add filter state
- New `PatientFilters.tsx` component

**Filters:**
- `ativo`: boolean toggle (default: true)
- `modalidade_id`: dropdown (single select, includes "All")
- `tipo_contrato`: dropdown (por_sessao | pacote | mensal | All)

**Query logic:**
```sql
SELECT * FROM pacientes 
WHERE ativo = $1
  AND (modalidade_default IS NULL OR modalidade_default = $2)
  AND (contratos.tipo = $3 OR $3 IS NULL)
ORDER BY nome
```

**UI:**
- Badge-style filters (TailwindCSS)
- "Clear all" button when any filter active
- Show result count: "12 pacientes"

**Database:** No schema change. Use existing `modalidade_default` on `pacientes` table. Join with `contratos` for contract type.

---

## 2. Checklist — Session Notes Field

**Current:** Checklist shows status buttons only. No way to add quick notes.

**Change:** Add optional text field for short notes per session in checklist.

```
┌─────────────────────────────┐
│ João Silva — 14:00 — Online │
│ [Completed] [Missed] [...]  │
│ Notas: ________________________ │
│        (max 200 chars)       │
└─────────────────────────────┘
```

### Implementation

**Schema change:**
```sql
ALTER TABLE sessoes ADD COLUMN notas_checklist TEXT;
```

**Components:**
- `ChecklistPage.tsx` — add textarea per session card
- `SessaoCard.tsx` (checklist variant) — include notes field

**Logic:**
- Notes saved on blur or on status update
- Not required
- Displays in session history (read-only in other pages)

**UI:**
- Textarea, light grey background, placeholder: "Ex: paciente pediu remarcar"
- Character counter (e.g., "45/200")
- Auto-save debounce 500ms

**Database:** 1 column migration.

---

## 3. Kanban — Filtering

**Current:** All sessions shown. No way to filter.

**Change:** Add filter panel above Kanban columns.

```
[Search: _______] [Modality: All ▼] [Date range: ▼] [Reset]
```

### Implementation

**Components affected:**
- `KanbanPage.tsx` — add filter state + apply to session list
- New `KanbanFilters.tsx` component

**Filters:**
- `search` (text): patient name or phone
- `modalidade_id`: dropdown
- `date_range`: "This week" / "This month" / "All" / "Custom (start-end)"

**Logic:**
```ts
const filtered = sessions.filter(s => 
  (s.paciente_nome + s.avulso_nome).includes(search) &&
  (!modalidade_filter || s.modalidade_id === modalidade_filter) &&
  (isInRange(s.data_hora, dateRange))
);
```

**UI:**
- Inline filters, persistent state in URL query params
- "3 sessions hidden by filters" message when active
- Filter button shows badge with count of active filters

**Database:** No change. Filtering on client-side.

---

## 4. Agenda — Month View Selector

**Current:** Agenda shows single day. User navigates day-by-day.

**Change:** Add calendar month picker. Quick jump to specific date.

```
┌─ Navegação ────────────────┐
│ ◀ Abril 2026 ▶ [📅 Apr 23] │
└────────────────────────────┘
```

### Implementation

**Components affected:**
- `AgendaPage.tsx` — add calendar picker
- Use shadcn/ui `Calendar` component (already in project)

**Logic:**
- When user clicks date in calendar, jump to that day
- Calendar shows current month
- Nav arrows switch months
- Highlight today + selected day

**UI:**
- Popover with calendar (opens on click of date badge)
- "Hoje" button to return to current day
- Show week number on agenda view for reference

**Database:** No change.

---

## Priority & Effort

| Feature | Effort | Impact | Priority |
|---------|--------|--------|----------|
| Patient filters | 2h | High (daily use) | 1 |
| Kanban filters | 2h | High (visibility) | 2 |
| Checklist notes | 1.5h | Medium (convenience) | 3 |
| Agenda month picker | 1.5h | Medium (navigation) | 4 |

**Total:** ~7 hours. Can ship in 2 PRs (filters + notes + month picker).

---

## Testing

- **Patient filters:** Test each filter combo. Verify "Clear all" works. Check empty state.
- **Kanban filters:** Filter by past dates (should be empty). Test date range logic.
- **Checklist notes:** Verify notes save + persist on refresh. Check 200 char limit.
- **Month picker:** Jump between months. Verify URL state persists on reload.

No E2E needed — integrate tests via component testing if heavy usage.

---

# Hidden Opportunities — Higher Impact

---

## 5. Payment History Per Patient

**Current:** Sessions track `pago`, `forma_pagamento`, `data_pagamento` but no UI to view payment history.

**Problem:** Psychologist can't audit "when did I receive from João?" or "which sessions are pending?"

**Change:** Add "Histórico de Pagamentos" tab in patient profile.

### Implementation

**Components affected:**
- New `PacienteDetalhePage.tsx` tab
- New `PaymentHistoryTab.tsx` component

**Query:**
```sql
SELECT 
  id, data_hora, status, valor_cobrado, 
  pago, forma_pagamento, data_pagamento
FROM sessoes
WHERE paciente_id = $1
ORDER BY data_hora DESC
```

**UI:**
- Table: Date | Status | Amount | Payment form | Payment date | ☐ pending/✓ paid
- Filter: [All] [Paid only] [Pending only]
- Totals row: "Total recebido: R$ X | Total pendente: R$ Y"
- "Marcar como pago" button per unpaid session (or bulk checkbox)

**Database:** No schema change.

---

## 6. Repasses Calculation Breakdown

**Current:** `useRepasses()` shows total per rule. No breakdown of which sessions counted.

**Problem:** Psychologist can't audit. If total is wrong, can't debug.

**Change:** Show repasse calculation inline with session detail.

### Implementation

**Components affected:**
- New `ReparceDetailModal.tsx`
- `FinanceiroPage.tsx` (Repasses tab)

**Logic:**
For each repasse rule, query sessions that contributed:
```sql
SELECT COUNT(*) as qtd_sessoes, SUM(valor_cobrado) as total_bruto
FROM sessoes
WHERE status = 'concluida' AND DATE_TRUNC('month', data_hora) = $1
```

Then calculate: `total_bruto * percentual = valor_calculado`

**UI change in Repasses tab:**
```
┌─ Clínica (20%) ────────────┐
│ 12 sessões × 20% = R$ X.XX │
│ [Ver sessões] [Pago ✓]     │
└────────────────────────────┘
```

Click "[Ver sessões]" → modal lists all 12 sessions with dates, values, calculation.

**Database:** No change. Calculation on demand from sessoes table.

---

## 7. Bulk Payment Confirmation in Checklist

**Current:** Checklist updates session status only. Payment entry must happen in Kanban (1-by-1).

**Problem:** End-of-day workflow: checklist → switch to Kanban → 15 clicks to record payment.

**Change:** Add payment section at bottom of checklist after status updates.

### Implementation

**Components affected:**
- `ChecklistPage.tsx` — major refactor
- New `ChecklistPaymentSection.tsx` component

**Flow:**
1. Update all session statuses (as now)
2. Show "Pagamentos pendentes" section below: list all sessions marked `concluida` but `pago: false`
3. For each: checkbox + auto-calculated value (from `valor_cobrado`)
4. At bottom: form
   ```
   [Forma: Dinheiro ▼] [Total selecionado: R$ X.XX]
   [Confirmar X pagamentos]
   ```

**Logic:**
- User checks boxes (default: all checked)
- Selects payment form (applies to all checked)
- Clicks "Confirmar" → batch update all with `pago: true, forma_pagamento, data_pagamento: now()`

**UI:**
```
┌─ Pagamentos pendentes ──────────────┐
│ ☐ João Silva — 14:00 — R$ 150.00   │
│ ☐ Maria Santos — 16:00 — R$ 100.00 │
│ ☐ Pedro Costa — 18:00 — R$ 150.00  │
│                                      │
│ Forma: [PIX ▼]                       │
│ Total: R$ 400.00 (3 sessões)         │
│ [Confirmar pagamentos]               │
└────────────────────────────────────┘
```

**Database:** No change.

---

## 8. Session Duration + Conflict Detection

**Current:** Sessions have `data_hora` but no duration. Overlapping sessions possible.

**Problem:** Can't show "revenue per hour" analytics. Booking same time twice goes undetected.

**Change:** Track session duration. Warn on overlaps.

### Implementation

**Schema:**
```sql
ALTER TABLE sessoes ADD COLUMN duracao_minutos INT DEFAULT 50;
-- or add to modalidades:
ALTER TABLE modalidades ADD COLUMN duracao_padrao_minutos INT DEFAULT 50;
```

**Option A (simpler):** Add `duracao_minutos` directly to `sessoes`. Default 50. User can override per session.

**Option B (structured):** Add standard duration to modalities. Use as default when creating session.

Recommend **Option A** for MVP.

**Conflict detection in Kanban/Agenda:**
```ts
function hasOverlap(newSession) {
  const end = new Date(newSession.data_hora).getTime() + (newSession.duracao_minutos * 60 * 1000)
  return existing.some(s => {
    const sEnd = new Date(s.data_hora).getTime() + (s.duracao_minutos * 60 * 1000)
    return newSession.data_hora < sEnd && end > s.data_hora
  })
}
```

**UI:**
- When creating/editing session, show warning: "⚠️ Overlaps with João Silva (14:00)"
- In Kanban grid: overlapping sessions shown in same cell with `z-index` layers

**Database:** 1 column migration. Or use modalidades relationship.

---

## 9. WhatsApp Communication Log in Patient Profile

**Current:** `confirmacoes_whatsapp` table exists but never shown. Patient profile has no WhatsApp history.

**Problem:** Can't debug "why didn't João confirm?" or verify reminder sent.

**Change:** Add "WhatsApp" tab in patient profile showing all reminders + replies.

### Implementation

**Components affected:**
- `PacienteDetalhePage.tsx` — add tab
- New `PatientWhatsAppTab.tsx` component

**Query:**
```sql
SELECT 
  cw.id, cw.sessao_id, cw.mensagem_enviada_em, 
  cw.resposta, cw.confirmado,
  s.data_hora, s.status
FROM confirmacoes_whatsapp cw
JOIN sessoes s ON cw.sessao_id = s.id
WHERE s.paciente_id = $1
ORDER BY cw.mensagem_enviada_em DESC
```

**UI:**
```
┌─ D-1 Reminder — 22 de Abril (14:00) ────┐
│ Enviado: 21 de Abril às 10:30            │
│ Status da sessão: Confirmada ✓           │
│ Resposta: "Sim"                          │
│ Confirmado automaticamente: Sim          │
└──────────────────────────────────────────┘
```

Rows for:
- Reminders sent (timestamp, session, status after)
- Replies received (what patient said)
- Auto-confirmation (did reply trigger status change?)

**Database:** No change. Use existing `confirmacoes_whatsapp`.

---

## 10. Expense Categories

**Current:** Free-text expense description. No categorization.

**Problem:** Can't filter/analyze expenses. No breakdown by type over time.

**Change:** Add optional category to expenses.

### Implementation

**Schema:**
```sql
ALTER TABLE despesas ADD COLUMN categoria TEXT;
-- OR use enum:
CREATE TYPE categoria_despesa AS ENUM (
  'aluguel', 'fornecedores', 'software', 'marketing', 'outro'
);
ALTER TABLE despesas ADD COLUMN categoria categoria_despesa;
```

**Components affected:**
- `FinanceiroPage.tsx` (Despesas tab) — add select dropdown
- New `ExpensesCategoryChart.tsx` component

**UI in Despesas tab:**
```
[Descrição: aluguel] [Categoria: Aluguel ▼] [R$ 1500.00] [+]

Filtrar: [Todas] [Aluguel] [Fornecedores] [Software] [Marketing] [Outro]

Gráfico: Pizza chart by category (monthly)
```

**Database:** 1 column + enum type migration.

---

## 11. Kanban — "Today" Visual Marker

**Current:** Week view header shows "d MMM – d MMM yyyy". No highlight of current day.

**Problem:** User can't instantly see "which column is today?" in grid. Disorienting.

**Change:** Highlight today's date column. Add visual badge.

### Implementation

**Components affected:**
- `SemanaGrid.tsx` or day column component

**Logic:**
```ts
const isToday = isSameDay(columnDate, new Date())
```

**UI:**
- Today's column: light background color (e.g., `bg-primary-light`)
- Day header badge: "Hoje" in small pill
- Visual vertical line or border on today column

**Database:** No change.

---

## 12. Patient Modality Pre-fill

**Current:** When creating session for patient, modality dropdown empty. Schema has `modalidade_default`.

**Problem:** Wasted click if patient always uses same modality.

**Change:** Pre-select `modalidade_default` when creating session.

### Implementation

**Components affected:**
- `NovaSessaoModal.tsx` — fetch `modalidade_default` on patient select
- When paciente_id provided, pre-fill form with patient's default modality

**Logic:**
```ts
if (paciente_id && paciente.modalidade_default) {
  setModalidade(paciente.modalidade_default)
}
```

**Database:** No change. Use existing `pacientes.modalidade_default`.

---

## 13. Remove Dead Convênio Code

**Current:** `FinanceiroPage.tsx:200` references `p.tipo === 'convenio'` but not in spec or schema.

**Problem:** Dead code or incomplete feature. Confusing.

**Change:** Remove convênio references or complete the feature.

**Decision needed:** Is convênio (health insurance) planned? If no:
- Remove references from FinanceiroPage
- Clean up related hook logic

If yes:
- Add schema: `pacientes.tipo_convenio`, `pacientes.convenio_id`
- Define `convenios` table
- Implement UI

Recommend: **Remove for now** unless explicitly planned.

---

## Full Impact Ranking

| Opportunity | Impact | Effort | Priority |
|---|---|---|---|
| Payment history | High (audit) | 2.5h | 1 |
| Repasses breakdown | High (money) | 2h | 2 |
| Bulk payment checklist | High (EOD workflow) | 3h | 3 |
| Session duration + conflicts | Medium (scheduling) | 3.5h | 4 |
| WhatsApp communication log | Medium (debug) | 2h | 5 |
| Expense categories | Low (analytics) | 1.5h | 6 |
| Patient modality pre-fill | Low (convenience) | 0.5h | 7 |
| Kanban today marker | Low (UX) | 0.5h | 8 |
| Remove convênio code | Medium (cleanup) | 0.5h | 9 |

**Quick wins (features 1-4):** ~7 hours

**High-impact (features 5-7):** ~7 hours

**Polish (features 8-13):** ~5.5 hours

**Total:** ~19.5 hours. Prioritize payment + repasses + bulk payment first.
