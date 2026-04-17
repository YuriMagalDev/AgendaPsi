# Notifications Bell + Calendar Rescheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-time notification bell for WhatsApp confirmations/cancellations and replace the datetime-local rescheduling input with a calendar-grid picker that lets the psychologist visually pick a free slot.

**Architecture:** A new `TopBar` component sits above all pages (inside `AppLayout`) and renders a notification bell that polls `confirmacoes_whatsapp` via Realtime. Rescheduling is replaced by a `RemarcarModal` that reuses `SemanaGrid` — clicking an empty cell pre-fills the new time, and confirming both marks the original session as `remarcada` AND inserts a new `agendada` session for the rescheduled time.

**Tech Stack:** React + TypeScript, Supabase JS (Realtime + `postgres_changes`), date-fns, Lucide React, TailwindCSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create migration | `supabase/migrations/004_notifications.sql` | Add `lida` column to `confirmacoes_whatsapp` |
| Modify | `src/lib/types.ts` | Add `lida` to `ConfirmacaoWhatsapp`; add `NotificacaoConfirmacao` joined type |
| Create | `src/hooks/useNotificacoes.ts` | Fetch unread WhatsApp confirmations with Realtime; mark lidas |
| Create | `src/components/layout/TopBar.tsx` | Bell icon + dropdown list of unread notifications |
| Modify | `src/components/layout/AppLayout.tsx` | Wrap content in flex-col; add `<TopBar />` above `<main>` |
| Create | `src/components/sessao/RemarcarModal.tsx` | Full-screen calendar picker for picking rescheduled time |
| Modify | `src/pages/KanbanPage.tsx` | Replace datetime-local remarcar with `RemarcarModal`; create new session on confirm |
| Modify | `src/pages/ChecklistPage.tsx` | Replace datetime-local remarcar with `RemarcarModal` |

---

## Task 1: DB Migration — add `lida` to `confirmacoes_whatsapp`

**Files:**
- Create: `supabase/migrations/004_notifications.sql`

> ⚠️ Apply in Supabase Studio before running the app.

- [ ] **Step 1: Create the migration file**

```sql
-- Track which WhatsApp confirmation notifications the psychologist has already seen
alter table confirmacoes_whatsapp add column if not exists lida boolean not null default false;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/004_notifications.sql
git commit -m "feat: add lida field to confirmacoes_whatsapp for notification tracking"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Update `ConfirmacaoWhatsapp` and add `NotificacaoConfirmacao`**

In `src/lib/types.ts`, replace the existing `ConfirmacaoWhatsapp` interface and add the joined type:

```typescript
export interface ConfirmacaoWhatsapp {
  id: string
  sessao_id: string
  mensagem_enviada_em: string | null
  resposta: string | null
  confirmado: boolean | null
  lida: boolean
}

export type NotificacaoConfirmacao = ConfirmacaoWhatsapp & {
  sessoes: {
    data_hora: string
    paciente_id: string | null
    avulso_nome: string | null
    pacientes: { nome: string } | null
  } | null
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add lida to ConfirmacaoWhatsapp and NotificacaoConfirmacao type"
```

---

## Task 3: `useNotificacoes` Hook

**Files:**
- Create: `src/hooks/useNotificacoes.ts`
- Test: `src/hooks/__tests__/useNotificacoes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useNotificacoes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNotificacoes } from '../useNotificacoes'

const mockData = [
  {
    id: 'n1',
    sessao_id: 's1',
    mensagem_enviada_em: '2026-04-17T10:00:00Z',
    resposta: 'Sim',
    confirmado: true,
    lida: false,
    sessoes: {
      data_hora: '2026-04-18T09:00:00Z',
      paciente_id: 'p1',
      avulso_nome: null,
      pacientes: { nome: 'João Silva' },
    },
  },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      in: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}))

describe('useNotificacoes', () => {
  it('returns unread notifications', async () => {
    const { result } = renderHook(() => useNotificacoes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notificacoes).toHaveLength(1)
    expect(result.current.count).toBe(1)
  })

  it('marcarLidas clears the list', async () => {
    const { result } = renderHook(() => useNotificacoes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await result.current.marcarLidas(['n1'])
    expect(result.current.notificacoes).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/__tests__/useNotificacoes.test.ts
```

Expected: FAIL — `useNotificacoes` not found.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/useNotificacoes.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { NotificacaoConfirmacao } from '@/lib/types'

export function useNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<NotificacaoConfirmacao[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchNotificacoes() {
    const { data } = await supabase
      .from('confirmacoes_whatsapp')
      .select('*, sessoes(data_hora, paciente_id, avulso_nome, pacientes(nome))')
      .not('confirmado', 'is', null)
      .eq('lida', false)
      .order('mensagem_enviada_em', { ascending: false })
    setNotificacoes((data ?? []) as NotificacaoConfirmacao[])
    setLoading(false)
  }

  async function marcarLidas(ids: string[]) {
    if (ids.length === 0) return
    await supabase.from('confirmacoes_whatsapp').update({ lida: true }).in('id', ids)
    setNotificacoes([])
  }

  useEffect(() => {
    fetchNotificacoes()
    const ch = supabase
      .channel('notificacoes-confirmacoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'confirmacoes_whatsapp' }, fetchNotificacoes)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  return { notificacoes, count: notificacoes.length, loading, marcarLidas }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/hooks/__tests__/useNotificacoes.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useNotificacoes.ts src/hooks/__tests__/useNotificacoes.test.ts
git commit -m "feat: add useNotificacoes hook with Realtime subscription"
```

---

## Task 4: `TopBar` Component

**Files:**
- Create: `src/components/layout/TopBar.tsx`

The bell shows a red badge when there are unread notifications. Opening the dropdown auto-marks all visible ones as read when the dropdown closes (click outside).

- [ ] **Step 1: Create the component**

Create `src/components/layout/TopBar.tsx`:

```typescript
import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNotificacoes } from '@/hooks/useNotificacoes'

export function TopBar() {
  const { notificacoes, count, marcarLidas } = useNotificacoes()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (aberto && notificacoes.length > 0) {
          marcarLidas(notificacoes.map(n => n.id))
        }
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto, notificacoes, marcarLidas])

  function handleToggle() {
    if (aberto && notificacoes.length > 0) {
      marcarLidas(notificacoes.map(n => n.id))
    }
    setAberto(a => !a)
  }

  return (
    <div className="h-12 border-b border-border bg-surface flex items-center justify-end px-4 flex-shrink-0">
      <div className="relative" ref={ref}>
        <button
          onClick={handleToggle}
          className="relative p-2 rounded-lg text-muted hover:text-[#1C1C1C] hover:bg-bg transition-colors"
          aria-label="Notificações"
        >
          <Bell size={20} />
          {count > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-[#E07070] text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>

        {aberto && (
          <div className="absolute right-0 top-full mt-1 w-80 bg-surface border border-border rounded-card shadow-lg z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-[#1C1C1C]">Notificações</p>
            </div>
            {notificacoes.length === 0 ? (
              <p className="text-sm text-muted px-4 py-6 text-center">Nenhuma notificação.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {notificacoes.map(n => {
                  const nomePaciente =
                    n.sessoes?.pacientes?.nome ?? n.sessoes?.avulso_nome ?? 'Paciente'
                  const dataHora = n.sessoes?.data_hora
                    ? format(new Date(n.sessoes.data_hora), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })
                    : ''
                  return (
                    <div key={n.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-[#1C1C1C]">{nomePaciente}</p>
                      <p className="text-xs text-muted mt-0.5">{dataHora}</p>
                      <p
                        className={`text-xs mt-1 font-medium ${
                          n.confirmado ? 'text-[#4CAF82]' : 'text-[#E07070]'
                        }`}
                      >
                        {n.confirmado ? 'Confirmou a sessão' : 'Cancelou a sessão'}
                      </p>
                      {n.resposta && (
                        <p className="text-xs text-muted mt-0.5 italic">"{n.resposta}"</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/TopBar.tsx
git commit -m "feat: add TopBar component with notification bell"
```

---

## Task 5: Wire `TopBar` into `AppLayout`

**Files:**
- Modify: `src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Update AppLayout**

Replace the entire content of `src/components/layout/AppLayout.tsx`:

```typescript
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <TopBar />
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

```bash
npx vitest run
```

Expected: 31+ tests pass (all existing + 2 new from Task 3).

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppLayout.tsx
git commit -m "feat: integrate TopBar into AppLayout"
```

---

## Task 6: `RemarcarModal` Component

**Files:**
- Create: `src/components/sessao/RemarcarModal.tsx`

This modal shows the weekly calendar grid. The psychologist navigates weeks and clicks an empty cell to select the new time. A confirmation bar appears at the bottom with the chosen datetime. Confirming calls `onConfirmar(novaDataHora)`.

Note: `parseHora` is duplicated from `KanbanPage` — this is intentional (YAGNI; don't extract yet).

- [ ] **Step 1: Create the component**

Create `src/components/sessao/RemarcarModal.tsx`:

```typescript
import { useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfWeek, addWeeks, subWeeks, addDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSemana } from '@/hooks/useSemana'
import { useConfigPsicologo } from '@/hooks/useConfigPsicologo'
import { SemanaGrid } from '@/components/semana/SemanaGrid'
import type { SessaoView } from '@/lib/types'

function parseHora(t: string | null | undefined, fallback: number): number {
  if (!t) return fallback
  const h = parseInt(t.split(':')[0], 10)
  return isNaN(h) ? fallback : h
}

interface Props {
  sessao: SessaoView
  onClose: () => void
  onConfirmar: (novaDataHora: string) => void
}

export function RemarcarModal({ sessao, onClose, onConfirmar }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const { sessoes, loading } = useSemana(weekStart)
  const { config } = useConfigPsicologo()
  const horaInicio = parseHora(config?.horario_inicio, 7)
  const horaFim = parseHora(config?.horario_fim, 21)

  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const labelSemana =
    format(weekStart, 'd MMM', { locale: ptBR }) +
    ' – ' +
    format(addDays(weekStart, 6), "d MMM yyyy", { locale: ptBR })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-4xl shadow-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="font-display font-semibold text-[#1C1C1C]">Remarcar sessão</p>
            <p className="text-xs text-muted mt-0.5">
              {nomePaciente} · Clique em um horário livre na agenda
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-shrink-0">
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="p-1.5 rounded-lg text-muted hover:text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-[#1C1C1C] capitalize min-w-[160px] text-center">
            {labelSemana}
          </span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 rounded-lg text-muted hover:text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-auto">
          <SemanaGrid
            weekStart={weekStart}
            sessoes={sessoes}
            loading={loading}
            horaInicio={horaInicio}
            horaFim={horaFim}
            onCelulaClick={setSelecionado}
            onSessaoClick={() => {}}
          />
        </div>

        {/* Confirmation bar — appears when a cell is selected */}
        {selecionado && (
          <div className="px-5 py-4 border-t border-border flex items-center justify-between flex-shrink-0 bg-primary/5">
            <p className="text-sm text-[#1C1C1C]">
              Remarcar para{' '}
              <span className="font-medium">
                {format(new Date(selecionado), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelecionado(null)}
                className="text-sm text-muted hover:text-[#1C1C1C] px-3 py-1.5 rounded-lg border border-border transition-colors"
              >
                Limpar
              </button>
              <button
                onClick={() => onConfirmar(selecionado)}
                className="text-sm font-medium px-4 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                Confirmar remarcação
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/sessao/RemarcarModal.tsx
git commit -m "feat: add RemarcarModal calendar picker for rescheduling"
```

---

## Task 7: Update `KanbanPage` — use `RemarcarModal`

**Files:**
- Modify: `src/pages/KanbanPage.tsx`

Replace the datetime-local remarcar input inside `SessaoPanel` with `RemarcarModal`. Confirming now:
1. Updates original session: `{ status: 'remarcada', remarcada_para: novaDataHora }`
2. Inserts a new session copying patient/modality/value with `data_hora: novaDataHora`, `status: 'agendada'`, `sessao_origem_id: original.id`

- [ ] **Step 1: Add import for RemarcarModal**

At the top of `src/pages/KanbanPage.tsx`, add:

```typescript
import { RemarcarModal } from '@/components/sessao/RemarcarModal'
```

- [ ] **Step 2: Update `SessaoPanel` — replace remarcar input with modal**

In `SessaoPanel`, replace the `remarcarData` state and the datetime-local block. Full updated `SessaoPanel`:

```typescript
function SessaoPanel({
  sessao,
  onClose,
  onUpdate,
}: {
  sessao: SessaoView
  onClose: () => void
  onUpdate: () => void
}) {
  const [remarcarAberto, setRemarcarAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
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
    await supabase
      .from('sessoes')
      .update({ status: 'remarcada', remarcada_para: novaDataHora })
      .eq('id', sessao.id)
    await supabase.from('sessoes').insert({
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
    onUpdate()
    onClose()
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

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/KanbanPage.tsx
git commit -m "feat: replace datetime-local remarcar with RemarcarModal in KanbanPage"
```

---

## Task 8: Update `ChecklistPage` — use `RemarcarModal`

**Files:**
- Modify: `src/pages/ChecklistPage.tsx`

The checklist "Remarcar" button now opens `RemarcarModal` directly (bypassing the batch save for rescheduling — rescheduling creates a new session so it can't be batched).

- [ ] **Step 1: Add import**

At the top of `src/pages/ChecklistPage.tsx`, add:

```typescript
import { RemarcarModal } from '@/components/sessao/RemarcarModal'
```

- [ ] **Step 2: Add remarcar state and handler to `ChecklistPage`**

In `ChecklistPage`, add:

```typescript
const [remarcarSessao, setRemarcarSessao] = useState<SessaoView | null>(null)

async function handleRemarcar(sessao: SessaoView, novaDataHora: string) {
  await supabase
    .from('sessoes')
    .update({ status: 'remarcada', remarcada_para: novaDataHora })
    .eq('id', sessao.id)
  await supabase.from('sessoes').insert({
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
  setRemarcarSessao(null)
  await refetch()
}
```

- [ ] **Step 3: Update `SessaoChecklist` props to receive remarcar callback**

Change the `SessaoChecklist` component signature:

```typescript
function SessaoChecklist({ sessao, update, pagamento, onUpdate, onPagamento, onRemarcar }: {
  sessao: SessaoView
  update: StatusUpdate | undefined
  pagamento: PagamentoUpdate | undefined
  onUpdate: (u: StatusUpdate) => void
  onPagamento: (p: PagamentoUpdate) => void
  onRemarcar: () => void
}) {
```

And replace the datetime-local remarcar block with a single button:

```typescript
{/* Replace the datetime-local + Remarcar button block with: */}
<button
  onClick={onRemarcar}
  className="text-xs px-2 h-7 rounded border transition-colors"
  style={{ borderColor: '#9B7EC8', color: '#9B7EC8' }}
>
  Remarcar
</button>
```

- [ ] **Step 4: Pass `onRemarcar` in the render loop and add `RemarcarModal` at the bottom of the page**

In the `pendentes.map(...)` call, add `onRemarcar={() => setRemarcarSessao(s)}`:

```typescript
{pendentes.map(s => (
  <SessaoChecklist
    key={s.id}
    sessao={s}
    update={updates.find(u => u.id === s.id)}
    pagamento={pagamentos.find(p => p.id === s.id)}
    onUpdate={handleUpdate}
    onPagamento={handlePagamento}
    onRemarcar={() => setRemarcarSessao(s)}
  />
))}
```

After the closing `</div>` of the page, add:

```typescript
{remarcarSessao && (
  <RemarcarModal
    sessao={remarcarSessao}
    onClose={() => setRemarcarSessao(null)}
    onConfirmar={(novaDataHora) => handleRemarcar(remarcarSessao, novaDataHora)}
  />
)}
```

- [ ] **Step 5: Run all tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Run type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ChecklistPage.tsx
git commit -m "feat: replace datetime-local remarcar with RemarcarModal in ChecklistPage"
```

---

## Verification

1. Apply `004_notifications.sql` in Supabase Studio
2. `npx vitest run` — all 33+ tests pass
3. `npx tsc --noEmit` — no errors
4. Open the app — confirm a thin TopBar with bell appears above all pages
5. Insert a test row in `confirmacoes_whatsapp` in Supabase Studio with `confirmado = true` and `lida = false` — bell should show badge `1`
6. Click bell → notification shows patient name + "Confirmou a sessão" → clicking outside closes and marks as read (badge disappears)
7. Open `/kanban` → click a session → click "Remarcar" → `RemarcarModal` opens with full weekly grid
8. Navigate to next week, click an empty cell → confirmation bar appears at bottom → click "Confirmar remarcação" → original session becomes `remarcada`, new `agendada` session appears in the grid at the selected time
9. Open `/checklist` → pending session → click "Remarcar" → same modal flow

## Dependency Order

```
Task 1 (migration) → apply in Supabase Studio first
Task 2 (types) → unblocks Tasks 3, 6, 7, 8
Task 3 (useNotificacoes) → Task 4 (TopBar)
Task 4 (TopBar) → Task 5 (AppLayout)
Task 6 (RemarcarModal) → Tasks 7, 8
Tasks 7 and 8 are independent of each other
```
