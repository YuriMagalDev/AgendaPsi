# WhatsApp Confirmation Flow & Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend WhatsApp confirmation to support 2 fixed-window reminders with dedup, cancel-after-confirm via keyword, bell notifications for no-response sessions, and a "Dia concluído" checklist end state — all while adding the Checklist item to the nav with a badge.

**Architecture:** DB migration adds `tipo` (notification classification) to `confirmacoes_whatsapp` and `horario_lembrete_1/2` to `config_psicologo`. Backend uses the existing every-30min cron rewritten for 2 windows, a new `checklist-trigger` Edge Function, and webhook extension. Frontend updates the `useNotificacoes` hook, adds `useChecklistBadge`, extends nav, and upgrades ChecklistPage.

**Tech Stack:** Supabase PostgreSQL migrations, Deno Edge Functions, React + TypeScript + TailwindCSS, Vitest

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/016_lembrete_tipo_updates.sql` | Create | `tipo` column + `horario_lembrete_*` |
| `supabase/functions/_shared/phone.ts` | Modify | Add `3` to CANCELAR, new TipoLembrete, update message text |
| `supabase/functions/_shared/phone.test.ts` | Modify | Fix stale import + add new test cases |
| `supabase/functions/send-lembrete/index.ts` | Modify | Update TipoLembrete type refs |
| `supabase/functions/cron-lembretes/index.ts` | Rewrite | 2-window logic (noite + manhã rolling) |
| `supabase/functions/whatsapp-webhook/index.ts` | Modify | Fix CANCELAR status update + set `tipo` |
| `supabase/functions/checklist-trigger/index.ts` | Create | Insert `alerta_sem_resposta` rows |
| `supabase/functions/checklist-trigger/config.toml` | Create | Edge Function config |
| `supabase/scripts/schedule_cron_v2.sql` | Create | Updated cron schedule with checklist-trigger |
| `src/lib/types.ts` | Modify | `TipoLembrete`, `ConfirmacaoWhatsapp.tipo`, `ConfigPsicologo` |
| `src/hooks/useConfigPsicologo.ts` | Modify | Allow patching `horario_lembrete_*` |
| `src/hooks/useNotificacoes.ts` | Modify | New query filter + tipo-based rendering data |
| `src/hooks/__tests__/useNotificacoes.test.ts` | Modify | Update for new query shape |
| `src/hooks/useChecklistBadge.ts` | Create | Returns `hasPending: boolean` for nav badge |
| `src/hooks/__tests__/useChecklistBadge.test.ts` | Create | Tests for badge logic |
| `src/components/layout/BottomNav.tsx` | Modify | Add Checklist item + badge |
| `src/components/layout/Sidebar.tsx` | Modify | Add Checklist item + badge |
| `src/pages/ConfiguracoesPage.tsx` | Modify | Add `horario_lembrete_1/2` fields |
| `src/pages/ChecklistPage.tsx` | Modify | "Não confirmou" badge + "Dia concluído" state |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/016_lembrete_tipo_updates.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/016_lembrete_tipo_updates.sql

-- 1. Add notification-type column to confirmacoes_whatsapp
--    Nullable — only set when there is an actual notification to show in the bell.
--    Sent-but-unanswered reminder rows keep tipo = NULL and stay hidden from the bell.
alter table confirmacoes_whatsapp
  add column if not exists tipo text
    check (tipo in (
      'confirmacao',
      'cancelamento',
      'cancelamento_pos_confirmacao',
      'alerta_sem_resposta'
    ));

-- 2. Update tipo_lembrete check constraint to include new window names
--    Drop old constraint first (Postgres 15+ ALTER TABLE DROP CONSTRAINT IF EXISTS)
alter table confirmacoes_whatsapp
  drop constraint if exists confirmacoes_whatsapp_tipo_lembrete_check;

alter table confirmacoes_whatsapp
  add constraint confirmacoes_whatsapp_tipo_lembrete_check
    check (tipo_lembrete in ('48h', '24h', '2h', 'lembrete_noite', 'lembrete_manha'));

-- 3. Add reminder schedule columns to config_psicologo
alter table config_psicologo
  add column if not exists horario_lembrete_1 time not null default '18:00',
  add column if not exists horario_lembrete_2 time not null default '07:00';

-- 4. Unique constraint: one alerta_sem_resposta per session per day
--    Uses partial index — only one NULL-tipo_lembrete row allowed per session with tipo='alerta_sem_resposta'
create unique index if not exists idx_confirmacoes_alerta_sem_resposta
  on confirmacoes_whatsapp (sessao_id)
  where tipo = 'alerta_sem_resposta';
```

- [ ] **Step 2: Apply migration locally**

```bash
npx supabase db reset
```

Expected: migration runs without errors, `supabase/migrations/016_lembrete_tipo_updates.sql` is applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/016_lembrete_tipo_updates.sql
git commit -m "feat(db): add tipo to confirmacoes_whatsapp and horario_lembrete to config_psicologo"
```

---

## Task 2: TypeScript Types + useConfigPsicologo

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/hooks/useConfigPsicologo.ts`

- [ ] **Step 1: Update `src/lib/types.ts`**

Replace the `TipoLembrete`, `ConfirmacaoWhatsapp`, and `ConfigPsicologo` blocks:

```typescript
// Replace line 100:
export type TipoLembrete = '48h' | '24h' | '2h' | 'lembrete_noite' | 'lembrete_manha'

// Replace lines 102-111 (ConfirmacaoWhatsapp):
export type TipoNotificacao =
  | 'confirmacao'
  | 'cancelamento'
  | 'cancelamento_pos_confirmacao'
  | 'alerta_sem_resposta'

export interface ConfirmacaoWhatsapp {
  id: string
  sessao_id: string
  mensagem_enviada_em: string | null
  resposta: string | null
  confirmado: boolean | null
  lida: boolean
  tipo_lembrete: TipoLembrete | null
  remarcacao_solicitada: boolean
  tipo: TipoNotificacao | null
}

// Replace lines 122-133 (ConfigPsicologo):
export interface ConfigPsicologo {
  id: string
  nome: string | null
  horario_inicio: string | null
  horario_fim: string | null
  horario_checklist: string | null
  horario_lembrete_1: string | null
  horario_lembrete_2: string | null
  automacao_whatsapp_ativa: boolean
  evolution_instance_name: string | null
  evolution_token: string | null
  whatsapp_conectado: boolean
  user_id: string | null
}
```

- [ ] **Step 2: Update `src/hooks/useConfigPsicologo.ts`**

Replace the `updateConfig` signature to include the new fields:

```typescript
async function updateConfig(patch: Partial<Pick<ConfigPsicologo,
  | 'nome'
  | 'horario_inicio'
  | 'horario_fim'
  | 'horario_lembrete_1'
  | 'horario_lembrete_2'
  | 'automacao_whatsapp_ativa'
>>): Promise<void> {
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types.ts src/hooks/useConfigPsicologo.ts
git commit -m "feat(types): add TipoNotificacao, tipo to ConfirmacaoWhatsapp, horario_lembrete to ConfigPsicologo"
```

---

## Task 3: `_shared/phone.ts` — Add Cancel Option 3 + Fix Tests

**Files:**
- Modify: `supabase/functions/_shared/phone.ts`
- Modify: `supabase/functions/_shared/phone.test.ts`

- [ ] **Step 1: Write the failing test for `3` keyword**

Add to `phone.test.ts` (fix the stale `buildButtonText` import → `buildReminderText` at the same time):

```typescript
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { normalizePhone, buildReminderText, parseReplyText } from './phone.ts'

Deno.test('normalizePhone strips non-digits', () => {
  assertEquals(normalizePhone('+55 (11) 99999-9999'), '5511999999999')
})

Deno.test('buildReminderText lembrete_noite contains nome and diaSemana', () => {
  const text = buildReminderText('lembrete_noite', 'Maria', '09:00', 'sexta-feira')
  assertEquals(text.includes('Maria'), true)
  assertEquals(text.includes('sexta-feira'), true)
})

Deno.test('buildReminderText lembrete_manha mentions hoje', () => {
  const text = buildReminderText('lembrete_manha', 'João', '14:00', 'segunda-feira')
  assertEquals(text.includes('hoje'), true)
})

Deno.test('parseReplyText returns CONFIRMAR for sim and 1', () => {
  assertEquals(parseReplyText('sim'), 'CONFIRMAR')
  assertEquals(parseReplyText('1'), 'CONFIRMAR')
})

Deno.test('parseReplyText returns CANCELAR for nao, 2, cancelar, and 3', () => {
  assertEquals(parseReplyText('não'), 'CANCELAR')
  assertEquals(parseReplyText('2'), 'CANCELAR')
  assertEquals(parseReplyText('cancelar'), 'CANCELAR')
  assertEquals(parseReplyText('3'), 'CANCELAR')
})

Deno.test('parseReplyText returns null for unrecognized text', () => {
  assertEquals(parseReplyText('talvez'), null)
  assertEquals(parseReplyText(''), null)
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd supabase && deno test functions/_shared/phone.test.ts
```

Expected: failures on `buildReminderText lembrete_noite/manha` and `parseReplyText 3`.

- [ ] **Step 3: Update `phone.ts`**

Replace the entire file:

```typescript
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length === 12 && digits.startsWith('55')) {
    const area = digits.slice(2, 4)
    const local = digits.slice(4)
    if (['6', '7', '8', '9'].includes(local[0])) return `55${area}9${local}`
  }
  return digits
}

export function buildReminderText(
  tipo: 'lembrete_noite' | 'lembrete_manha',
  nome: string,
  hora: string,
  diaSemana: string
): string {
  const intros: Record<string, string> = {
    lembrete_noite: `Olá, *${nome}*! 😊\n\nLembrando que você tem uma sessão *amanhã, ${diaSemana} às ${hora}*.`,
    lembrete_manha: `Olá, *${nome}*! 😊\n\nSua sessão é *hoje às ${hora}*.`,
  }
  const opcoes =
    '\n\n👉 *Responda com:*\n*1* — Confirmar presença ✅\n*2* — Não vou conseguir comparecer ❌\n*3* — Cancelar sessão'
  return `${intros[tipo]}${opcoes}`
}

const CONFIRMAR_REGEX = /^\s*(1|sim|s|confirmar|confirmo|confirmado|ok|✅)\s*$/i
const CANCELAR_REGEX  = /^\s*(2|3|não|nao|n|cancelar|cancelo|cancelado|❌)\s*$/i

export function parseReplyText(raw: string): 'CONFIRMAR' | 'CANCELAR' | null {
  const text = raw.trim()
  if (CONFIRMAR_REGEX.test(text)) return 'CONFIRMAR'
  if (CANCELAR_REGEX.test(text))  return 'CANCELAR'
  return null
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
cd supabase && deno test functions/_shared/phone.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/phone.ts supabase/functions/_shared/phone.test.ts
git commit -m "feat(phone): add cancel option 3, update reminder text to lembrete_noite/manha, fix tests"
```

---

## Task 4: `useNotificacoes` Hook + Tests

**Files:**
- Modify: `src/hooks/useNotificacoes.ts`
- Modify: `src/hooks/__tests__/useNotificacoes.test.ts`

- [ ] **Step 1: Update the test with new query shape**

Replace `src/hooks/__tests__/useNotificacoes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useNotificacoes } from '../useNotificacoes'

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

const mockConfirmacao = {
  id: 'n1',
  sessao_id: 's1',
  mensagem_enviada_em: '2026-04-17T10:00:00Z',
  resposta: 'Sim',
  confirmado: true,
  lida: false,
  tipo: 'confirmacao',
  sessoes: {
    data_hora: '2026-04-18T09:00:00Z',
    paciente_id: 'p1',
    avulso_nome: null,
    pacientes: { nome: 'João Silva' },
  },
}

const mockAlerta = {
  id: 'n2',
  sessao_id: 's2',
  mensagem_enviada_em: '2026-04-18T18:00:00Z',
  resposta: null,
  confirmado: null,
  lida: false,
  tipo: 'alerta_sem_resposta',
  sessoes: {
    data_hora: '2026-04-18T14:00:00Z',
    paciente_id: 'p2',
    avulso_nome: null,
    pacientes: { nome: 'Maria Souza' },
  },
}

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  }
}

describe('useNotificacoes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns confirmacao notifications', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: [mockConfirmacao], error: null }) }) as any
    )
    const { result } = renderHook(() => useNotificacoes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notificacoes).toHaveLength(1)
    expect(result.current.count).toBe(1)
  })

  it('returns alerta_sem_resposta notifications', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: [mockAlerta], error: null }) }) as any
    )
    const { result } = renderHook(() => useNotificacoes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.notificacoes[0].tipo).toBe('alerta_sem_resposta')
  })

  it('marcarLidas clears the list', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: [mockConfirmacao], error: null }) }) as any
    )
    const { result } = renderHook(() => useNotificacoes())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.marcarLidas(['n1']) })
    expect(result.current.notificacoes).toHaveLength(0)
  })

  it('subscribes to Realtime on mount', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )
    renderHook(() => useNotificacoes())
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled())
    expect(mockChannel.on).toHaveBeenCalled()
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect failures**

```bash
npx vitest run src/hooks/__tests__/useNotificacoes.test.ts
```

Expected: `alerta_sem_resposta` test fails (hook still filters by `confirmado`).

- [ ] **Step 3: Update `src/hooks/useNotificacoes.ts`**

Replace the entire file:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { NotificacaoConfirmacao } from '@/lib/types'

export function useNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<NotificacaoConfirmacao[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchNotificacoes() {
    const { data, error: err } = await supabase
      .from('confirmacoes_whatsapp')
      .select('*, sessoes(data_hora, paciente_id, avulso_nome, pacientes(nome))')
      .not('tipo', 'is', null)
      .eq('lida', false)
      .order('mensagem_enviada_em', { ascending: false })

    if (err) setError(err.message)
    else setNotificacoes((data ?? []) as NotificacaoConfirmacao[])
    setLoading(false)
  }

  const marcarLidas = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    await supabase.from('confirmacoes_whatsapp').update({ lida: true }).in('id', ids)
    setNotificacoes(prev => prev.filter(n => !ids.includes(n.id)))
  }, [])

  useEffect(() => {
    fetchNotificacoes()
    const channel = supabase
      .channel('notificacoes-confirmacoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'confirmacoes_whatsapp' }, fetchNotificacoes)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  return { notificacoes, count: notificacoes.length, loading, error, marcarLidas }
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npx vitest run src/hooks/__tests__/useNotificacoes.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Update `TopBar.tsx` to render by `tipo`**

In `src/components/layout/TopBar.tsx`, replace the notification message rendering block (lines 58-79) inside the `notificacoes.map()`:

```tsx
{notificacoes.map(n => {
  const nomePaciente =
    n.sessoes?.pacientes?.nome ?? n.sessoes?.avulso_nome ?? 'Paciente'
  const dataHora = n.sessoes?.data_hora
    ? format(new Date(n.sessoes.data_hora), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })
    : ''

  const { label, color } = (() => {
    switch (n.tipo) {
      case 'confirmacao':
        return { label: 'Confirmou a sessão', color: '#4CAF82' }
      case 'cancelamento':
      case 'cancelamento_pos_confirmacao':
        return { label: 'Cancelou a sessão', color: '#E07070' }
      case 'alerta_sem_resposta':
        return { label: `Não confirmou a sessão das ${dataHora.split(' às ')[1] ?? ''}`, color: '#C17F59' }
      default:
        return { label: n.confirmado ? 'Confirmou a sessão' : 'Cancelou a sessão', color: n.confirmado ? '#4CAF82' : '#E07070' }
    }
  })()

  return (
    <div key={n.id} className="px-4 py-3">
      <p className="text-sm font-medium text-[#1C1C1C]">{nomePaciente}</p>
      {n.tipo !== 'alerta_sem_resposta' && (
        <p className="text-xs text-muted mt-0.5">{dataHora}</p>
      )}
      {n.tipo === 'alerta_sem_resposta' && (
        <p className="text-xs text-muted mt-0.5">{format(new Date(n.sessoes!.data_hora), "HH:mm", { locale: ptBR })}</p>
      )}
      <p className="text-xs mt-1 font-medium" style={{ color }}>
        {label}
      </p>
      {n.resposta && (
        <p className="text-xs text-muted mt-0.5 italic">"{n.resposta}"</p>
      )}
    </div>
  )
})}
```

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useNotificacoes.ts src/hooks/__tests__/useNotificacoes.test.ts src/components/layout/TopBar.tsx
git commit -m "feat(notifications): filter by tipo, render bell by notification type"
```

---

## Task 5: `whatsapp-webhook` Extension

**Files:**
- Modify: `supabase/functions/whatsapp-webhook/index.ts`

The current webhook does NOT update `sessoes.status = 'cancelada'` for CANCELAR — this is a bug. Fix it here and add `tipo` classification.

- [ ] **Step 1: Replace the `CONFIRMAR`/`CANCELAR` handler block**

Replace lines 82–122 (the `if (selectedId === 'CONFIRMAR')` block through the end of the handler) with:

```typescript
  const isCancelar = selectedId === 'CANCELAR'
  const isConfirmar = selectedId === 'CONFIRMAR'

  // Determine tipo for notification bell
  let tipo: string
  if (isConfirmar) {
    tipo = 'confirmacao'
  } else {
    // Check if session was previously confirmada — if so this is a post-confirm cancel
    const sessaoStatus = (match.sessoes as any)?.status ?? ''
    tipo = sessaoStatus === 'confirmada' ? 'cancelamento_pos_confirmacao' : 'cancelamento'
  }

  // Update confirmacao row with response + tipo
  await supabase.from('confirmacoes_whatsapp')
    .update({
      confirmado: isConfirmar,
      resposta: isConfirmar ? 'Confirmado' : 'Cancelado',
      lida: false,
      tipo,
    })
    .eq('id', match.id)

  // Update session status
  const newStatus = isConfirmar ? 'confirmada' : 'cancelada'
  await supabase.from('sessoes')
    .update({ status: newStatus })
    .eq('id', match.sessao_id)

  // Send acknowledgement via WhatsApp
  const replyText = isConfirmar
    ? 'Confirmação recebida! ✅ Te esperamos na sessão. Até lá! 😊'
    : 'Entendido! 🙏 Sessão cancelada. Entre em contato se quiser remarcar.'

  const r = await fetch(
    `${EVOLUTION_API_URL}/message/sendText/${config!.evolution_instance_name}`,
    {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, text: replyText }),
    }
  )
  console.log(`Evolution ${selectedId} send [${r.status}]: ${await r.text()}`)

  return new Response('ok')
```

- [ ] **Step 2: Deploy and manual test**

```bash
npx supabase functions deploy whatsapp-webhook
```

Send `cancelar` to a test number and verify:
- `sessoes.status` becomes `cancelada`
- `confirmacoes_whatsapp.tipo` is set to `cancelamento` or `cancelamento_pos_confirmacao`
- Bell shows the notification

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/whatsapp-webhook/index.ts
git commit -m "fix(webhook): update session to cancelada on cancel reply, set tipo for bell notifications"
```

---

## Task 6: `send-lembrete` + `cron-lembretes` Rewrite

**Files:**
- Modify: `supabase/functions/send-lembrete/index.ts`
- Rewrite: `supabase/functions/cron-lembretes/index.ts`

- [ ] **Step 1: Update `send-lembrete/index.ts` tipo type**

Replace the type annotation on line 19:

```typescript
// Old:
const { sessao_id, tipo, test } = await req.json() as {
  sessao_id: string
  tipo: '48h' | '24h' | '2h'
  test?: boolean
}

// New:
const { sessao_id, tipo, test } = await req.json() as {
  sessao_id: string
  tipo: 'lembrete_noite' | 'lembrete_manha'
  test?: boolean
}
```

Also update the `tipo_lembrete` check in the insert (line ~107):
```typescript
// The value stored in tipo_lembrete is now 'lembrete_noite' or 'lembrete_manha'
// No other changes needed — tipo is passed through as-is
```

Also update the test section (line 44) to use the new `tipo` type:
```typescript
const [testando, setTestando] = useState<'lembrete_noite' | 'lembrete_manha' | null>(null)
```
Note: this is in ConfiguracoesPage, handled in Task 9.

- [ ] **Step 2: Rewrite `cron-lembretes/index.ts`**

Replace the entire file:

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now = new Date()
  const nowMs = now.getTime()

  // Fetch reminder schedule config
  const { data: config } = await supabase
    .from('config_psicologo')
    .select('horario_lembrete_1, horario_lembrete_2, horario_inicio')
    .limit(1)
    .single()

  const horarioLembrete2 = config?.horario_lembrete_2 ?? '07:00'
  const horarioInicio = config?.horario_inicio ?? '07:00'

  // Parse HH:MM string into today's Date at that time (UTC+Brazil offset not needed here — cron fires in UTC, times are stored as local time strings)
  function todayAt(hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number)
    const d = new Date(now)
    d.setUTCHours(h, m, 0, 0)
    return d
  }

  const lembrete2Time = todayAt(horarioLembrete2)
  const inicioTime = todayAt(horarioInicio)

  // Threshold for "early session": session_time < horario_inicio + 2h
  const earlyThresholdMs = inicioTime.getTime() + 2 * 3600_000

  const results: Array<{ sessao_id: string; tipo: string; result: string }> = []

  // --- WINDOW A: lembrete_noite ---
  // Sessions scheduled for [now + 17.5h, now + 24h] that haven't received lembrete_noite
  // This window is wide to tolerate cron drift; unique index prevents double-sends
  const noiteFrom = new Date(nowMs + 17.5 * 3600_000).toISOString()
  const nioteTo   = new Date(nowMs + 24   * 3600_000).toISOString()

  const { data: sessoesNoite } = await supabase
    .from('sessoes')
    .select('id, confirmacoes_whatsapp!left(tipo_lembrete)')
    .gte('data_hora', noiteFrom)
    .lte('data_hora', nioteTo)
    .in('status', ['agendada', 'confirmada'])

  for (const s of sessoesNoite ?? []) {
    const jaEnviado = (s.confirmacoes_whatsapp as any[])?.some((c: any) => c.tipo_lembrete === 'lembrete_noite')
    if (jaEnviado) continue
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-lembrete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ sessao_id: s.id, tipo: 'lembrete_noite' }),
    })
    const body = await resp.json()
    results.push({ sessao_id: s.id, tipo: 'lembrete_noite', result: body.ok ? 'sent' : (body.skipped ?? 'error') })
  }

  // --- WINDOW B: lembrete_manha ---
  // Two sub-cases handled in one pass:
  //
  // B1 (early sessions): session_time < earlyThreshold AND session_time - 2h is in [now - 15min, now + 15min]
  //    Sends a rolling 2h-before reminder for sessions before horario_inicio + 2h
  //
  // B2 (standard sessions): session_time >= earlyThreshold AND current time is within 15min of horario_lembrete_2
  //    Sends the morning reminder for all other sessions

  const isNearLembrete2 = Math.abs(nowMs - lembrete2Time.getTime()) <= 15 * 60_000

  // B1: sessions in [now + 1.5h, now + 2.5h]
  const manhaEarlyFrom = new Date(nowMs + 1.5 * 3600_000).toISOString()
  const manhaEarlyTo   = new Date(nowMs + 2.5 * 3600_000).toISOString()

  // B2: sessions from now until end of day (if within lembrete_2 window)
  const manhaTodayFrom = now.toISOString()
  const manhaTodayTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).toISOString()

  // Fetch candidates for both sub-cases
  const fromTime = isNearLembrete2 ? manhaTodayFrom : manhaEarlyFrom
  const toTime   = isNearLembrete2 ? manhaTodayTo   : manhaEarlyTo

  const { data: sessoesManha } = await supabase
    .from('sessoes')
    .select('id, data_hora, confirmacoes_whatsapp!left(tipo_lembrete, confirmado)')
    .gte('data_hora', fromTime)
    .lte('data_hora', toTime)
    .in('status', ['agendada', 'confirmada'])

  for (const s of sessoesManha ?? []) {
    const confs = s.confirmacoes_whatsapp as any[]

    // Skip if already sent lembrete_manha
    if (confs?.some((c: any) => c.tipo_lembrete === 'lembrete_manha')) continue

    // Skip if patient already responded to lembrete_noite (confirmed or cancelled)
    if (confs?.some((c: any) => c.confirmado !== null)) continue

    const sessaoMs = new Date(s.data_hora).getTime()
    const isEarly = sessaoMs < earlyThresholdMs

    // B1: early session — only send if session_time - 2h is near now
    if (isEarly) {
      const twoHourBefore = sessaoMs - 2 * 3600_000
      if (Math.abs(nowMs - twoHourBefore) > 15 * 60_000) continue
    } else {
      // B2: standard session — only send if we're in the lembrete_2 window
      if (!isNearLembrete2) continue
    }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-lembrete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ sessao_id: s.id, tipo: 'lembrete_manha' }),
    })
    const body = await resp.json()
    results.push({ sessao_id: s.id, tipo: 'lembrete_manha', result: body.ok ? 'sent' : (body.skipped ?? 'error') })
  }

  return new Response(JSON.stringify({ processed: results.length, results }), { status: 200 })
})
```

- [ ] **Step 3: Deploy both functions**

```bash
npx supabase functions deploy send-lembrete
npx supabase functions deploy cron-lembretes
```

Expected: deploys successfully.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-lembrete/index.ts supabase/functions/cron-lembretes/index.ts
git commit -m "feat(crons): rewrite lembrete cron to 2 fixed windows (noite D-1 + manhã rolling)"
```

---

## Task 7: `checklist-trigger` Edge Function

**Files:**
- Create: `supabase/functions/checklist-trigger/index.ts`
- Create: `supabase/functions/checklist-trigger/config.toml`
- Create: `supabase/scripts/schedule_cron_v2.sql`

- [ ] **Step 1: Create `config.toml`**

```toml
[functions.checklist-trigger]
verify_jwt = false
```

- [ ] **Step 2: Create `supabase/functions/checklist-trigger/index.ts`**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).toISOString()

  // Sessions today still in agendada or confirmada
  const { data: sessoes, error } = await supabase
    .from('sessoes')
    .select('id, confirmacoes_whatsapp!left(tipo_lembrete, confirmado)')
    .gte('data_hora', todayStart)
    .lte('data_hora', todayEnd)
    .in('status', ['agendada', 'confirmada'])

  if (error) {
    console.error('checklist-trigger DB error:', JSON.stringify(error))
    return new Response('error', { status: 500 })
  }

  const inserted: string[] = []

  for (const s of sessoes ?? []) {
    const confs = s.confirmacoes_whatsapp as any[]

    // Only alert for sessions that received a reminder but got no response
    const receivedLembrete = confs?.some((c: any) =>
      c.tipo_lembrete === 'lembrete_noite' || c.tipo_lembrete === 'lembrete_manha'
    )
    if (!receivedLembrete) continue

    const hasResponse = confs?.some((c: any) => c.confirmado !== null)
    if (hasResponse) continue

    // Insert alerta_sem_resposta — unique index prevents duplicates
    const { error: insertError } = await supabase
      .from('confirmacoes_whatsapp')
      .insert({
        sessao_id: s.id,
        mensagem_enviada_em: now.toISOString(),
        tipo: 'alerta_sem_resposta',
        lida: false,
        remarcacao_solicitada: false,
      })

    if (insertError && insertError.code !== '23505') {
      console.error(`alerta insert error sessao=${s.id}:`, JSON.stringify(insertError))
      continue
    }

    if (!insertError) inserted.push(s.id)
  }

  console.log(`checklist-trigger: inserted ${inserted.length} alerts`)
  return new Response(JSON.stringify({ inserted: inserted.length, sessao_ids: inserted }), { status: 200 })
})
```

- [ ] **Step 3: Create `supabase/scripts/schedule_cron_v2.sql`**

```sql
-- supabase/scripts/schedule_cron_v2.sql
-- Run against Supabase SQL editor.
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with real values.

-- Remove old single cron if it exists
select cron.unschedule('whatsapp-lembretes');

-- Lembrete cron: every 30 minutes (handles both noite and manhã windows)
select cron.schedule(
  'whatsapp-lembretes',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-lembretes',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);

-- Checklist trigger: runs at 18:30 UTC daily (adjust to match horario_checklist + 30min)
select cron.schedule(
  'checklist-trigger',
  '30 21 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/checklist-trigger',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 4: Deploy**

```bash
npx supabase functions deploy checklist-trigger
```

Expected: deploys successfully.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/checklist-trigger/ supabase/scripts/schedule_cron_v2.sql
git commit -m "feat(edge): add checklist-trigger function and updated cron schedule"
```

---

## Task 8: `useChecklistBadge` Hook + Nav Updates

**Files:**
- Create: `src/hooks/useChecklistBadge.ts`
- Create: `src/hooks/__tests__/useChecklistBadge.test.ts`
- Modify: `src/components/layout/BottomNav.tsx`
- Modify: `src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/hooks/__tests__/useChecklistBadge.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useChecklistBadge } from '../useChecklistBadge'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { horario_checklist: '18:00' }, error: null }),
    ...overrides,
  }
}

describe('useChecklistBadge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns false when no pending sessions', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )
    const { result } = renderHook(() => useChecklistBadge())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasPending).toBe(false)
  })

  it('returns true when there are pending sessions', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({
        in: vi.fn().mockResolvedValue({ data: [{ id: 's1' }], error: null }),
      }) as any
    )
    const { result } = renderHook(() => useChecklistBadge())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasPending).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect failure**

```bash
npx vitest run src/hooks/__tests__/useChecklistBadge.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Create `src/hooks/useChecklistBadge.ts`**

```typescript
import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'

export function useChecklistBadge() {
  const [hasPending, setHasPending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: configData } = await supabase
        .from('config_psicologo')
        .select('horario_checklist')
        .limit(1)
        .single()

      const horario = configData?.horario_checklist ?? '18:00'
      const [h, m] = horario.split(':').map(Number)
      const checklistTime = new Date()
      checklistTime.setHours(h, m, 0, 0)

      if (new Date() < checklistTime) {
        setHasPending(false)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('sessoes')
        .select('id')
        .gte('data_hora', `${today}T00:00:00`)
        .lte('data_hora', `${today}T23:59:59`)
        .in('status', ['agendada', 'confirmada'])

      setHasPending((data ?? []).length > 0)
      setLoading(false)
    }

    check()
  }, [])

  return { hasPending, loading }
}
```

- [ ] **Step 4: Run test — expect pass**

```bash
npx vitest run src/hooks/__tests__/useChecklistBadge.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Update `BottomNav.tsx`**

Replace the entire file:

```tsx
import { NavLink } from 'react-router-dom'
import { Calendar, Kanban, Users, BarChart2, Settings, ClipboardList } from 'lucide-react'
import { useChecklistBadge } from '@/hooks/useChecklistBadge'

const staticNavItems = [
  { to: '/agenda',        icon: Calendar,       label: 'Agenda'     },
  { to: '/kanban',        icon: Kanban,          label: 'Kanban'     },
  { to: '/checklist',     icon: ClipboardList,   label: 'Checklist'  },
  { to: '/pacientes',     icon: Users,           label: 'Pacientes'  },
  { to: '/configuracoes', icon: Settings,        label: 'Config.'    },
] as const

export function BottomNav() {
  const { hasPending } = useChecklistBadge()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border flex md:hidden z-50">
      {staticNavItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
              isActive ? 'text-primary' : 'text-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className={`relative p-1 rounded-full transition-colors ${isActive ? 'bg-primary-light' : ''}`}>
                <Icon size={20} />
                {to === '/checklist' && hasPending && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-[#E07070] rounded-full" />
                )}
              </div>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 6: Update `Sidebar.tsx`**

Replace the `navItems` array and add badge support:

```tsx
import { NavLink } from 'react-router-dom'
import { Calendar, Kanban, Users, BarChart2, Settings, LogOut, ClipboardList } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useChecklistBadge } from '@/hooks/useChecklistBadge'

const navItems = [
  { to: '/agenda',        icon: Calendar,      label: 'Agenda'        },
  { to: '/kanban',        icon: Kanban,         label: 'Kanban'        },
  { to: '/checklist',     icon: ClipboardList,  label: 'Checklist'     },
  { to: '/pacientes',     icon: Users,          label: 'Pacientes'     },
  { to: '/financeiro',    icon: BarChart2,       label: 'Financeiro'    },
  { to: '/configuracoes', icon: Settings,        label: 'Configurações' },
] as const

export function Sidebar() {
  const { signOut } = useAuth()
  const { hasPending } = useChecklistBadge()

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-surface border-r border-border p-4">
      <div className="mb-8 px-2">
        <h1 className="font-display text-2xl font-semibold text-primary">Consultório</h1>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary-light text-primary font-medium'
                  : 'text-[#1C1C1C] hover:bg-bg'
              }`
            }
          >
            <div className="relative">
              <Icon size={18} />
              {to === '/checklist' && hasPending && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#E07070] rounded-full" />
              )}
            </div>
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={signOut}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:bg-bg transition-colors mt-4"
      >
        <LogOut size={18} />
        Sair
      </button>
    </aside>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useChecklistBadge.ts src/hooks/__tests__/useChecklistBadge.test.ts src/components/layout/BottomNav.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(nav): add Checklist to nav with pending badge"
```

---

## Task 9: ConfiguracoesPage — Lembrete Time Fields

**Files:**
- Modify: `src/pages/ConfiguracoesPage.tsx`

- [ ] **Step 1: Add lembrete state to config form**

In the `configForm` state (line 34), add the new fields:

```typescript
const [configForm, setConfigForm] = useState({
  nome: '',
  horario_inicio: '',
  horario_fim: '',
  horario_lembrete_1: '',
  horario_lembrete_2: '',
})
```

- [ ] **Step 2: Sync from config (lines 47-53)**

```typescript
if (config && !configSynced) {
  setConfigForm({
    nome: config.nome ?? '',
    horario_inicio: config.horario_inicio ?? '07:00',
    horario_fim: config.horario_fim ?? '21:00',
    horario_lembrete_1: config.horario_lembrete_1 ?? '18:00',
    horario_lembrete_2: config.horario_lembrete_2 ?? '07:00',
  })
  setConfigSynced(true)
}
```

- [ ] **Step 3: Update `handleSaveConfig`**

```typescript
await updateConfig({
  nome: configForm.nome || null,
  horario_inicio: configForm.horario_inicio || null,
  horario_fim: configForm.horario_fim || null,
  horario_lembrete_1: configForm.horario_lembrete_1 || null,
  horario_lembrete_2: configForm.horario_lembrete_2 || null,
} as any)
```

- [ ] **Step 4: Add the two time inputs to the WhatsApp section**

Inside the "State C: connected" block, before the "Test section" (`<div className="border-t ...`), add:

```tsx
{/* Lembrete schedule */}
<div className="border-t border-border pt-4">
  <p className="text-sm font-medium text-[#1C1C1C] mb-3">Horário dos lembretes</p>
  <div className="flex gap-3">
    <div className="flex flex-col gap-1 flex-1">
      <label className="text-xs text-muted">1º lembrete (noite anterior)</label>
      <input
        type="time"
        value={configForm.horario_lembrete_1}
        onChange={e => setConfigForm(f => ({ ...f, horario_lembrete_1: e.target.value }))}
        className={`${inputClass} w-full`}
      />
    </div>
    <div className="flex flex-col gap-1 flex-1">
      <label className="text-xs text-muted">2º lembrete (manhã do dia)</label>
      <input
        type="time"
        value={configForm.horario_lembrete_2}
        onChange={e => setConfigForm(f => ({ ...f, horario_lembrete_2: e.target.value }))}
        className={`${inputClass} w-full`}
      />
    </div>
  </div>
  <button
    type="button"
    onClick={() => handleSaveConfig({ preventDefault: () => {} } as any)}
    disabled={salvandoConfig}
    className="mt-2 self-end h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
  >
    {salvandoConfig ? 'Salvando...' : 'Salvar horários'}
  </button>
</div>
```

- [ ] **Step 5: Update test button types from '48h'|'24h'|'2h' to 'lembrete_noite'|'lembrete_manha'**

Replace line 43:
```typescript
const [testando, setTestando] = useState<'lembrete_noite' | 'lembrete_manha' | null>(null)
```

Replace the test buttons array (lines 542-554):
```tsx
<div className="flex gap-2">
  {(['lembrete_noite', 'lembrete_manha'] as const).map(tipo => (
    <button
      key={tipo}
      onClick={() => triggerTest(tipo)}
      disabled={testando !== null}
      className="flex-1 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-bg transition-colors disabled:opacity-50"
    >
      {testando === tipo ? '...' : tipo === 'lembrete_noite' ? 'Teste noite' : 'Teste manhã'}
    </button>
  ))}
</div>
```

Update `triggerTest` signature:
```typescript
async function triggerTest(tipo: 'lembrete_noite' | 'lembrete_manha') {
```

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ConfiguracoesPage.tsx
git commit -m "feat(configuracoes): add horario_lembrete_1 and horario_lembrete_2 fields"
```

---

## Task 10: ChecklistPage — "Não confirmou" Badge + "Dia concluído" State

**Files:**
- Modify: `src/pages/ChecklistPage.tsx`

- [ ] **Step 1: Add sessão-confirmation query**

At the top of `ChecklistPage()`, after `const { sessoes, loading, error, refetch } = useSessoesDia(TODAY)`, add:

```typescript
const [sessoesComAlerta, setSessoesComAlerta] = useState<Set<string>>(new Set())
const [checklistConcluido, setChecklistConcluido] = useState(false)

useEffect(() => {
  async function fetchAlertas() {
    const { data } = await supabase
      .from('confirmacoes_whatsapp')
      .select('sessao_id')
      .eq('tipo', 'alerta_sem_resposta')
      .gte('mensagem_enviada_em', `${TODAY}T00:00:00`)
    setSessoesComAlerta(new Set((data ?? []).map((r: any) => r.sessao_id)))
  }
  fetchAlertas()
}, [])
```

- [ ] **Step 2: Detect "Dia concluído" after save**

In `salvarTudo()`, after `await refetch()`, add:

```typescript
const pendentesPos = sessoes.filter(s =>
  s.status === 'agendada' || s.status === 'confirmada'
)
if (pendentesPos.length === 0) setChecklistConcluido(true)
```

Also detect on initial load (in case page is opened when already done):

```typescript
useEffect(() => {
  if (!loading && pendentes.length === 0 && sessoes.length > 0) {
    setChecklistConcluido(true)
  }
}, [loading, pendentes.length, sessoes.length])
```

- [ ] **Step 3: Add "Não confirmou" badge to `SessaoChecklist`**

Add `semConfirmacao?: boolean` to the `SessaoChecklist` props interface:

```typescript
function SessaoChecklist({ sessao, update, pagamento, onUpdate, onPagamento, onRemarcar, disabled, semConfirmacao }: {
  // ...existing props...
  semConfirmacao?: boolean
}) {
```

Inside the component header `<div className="flex items-center justify-between mb-3">`, add after the name/time block:

```tsx
<div className="flex items-center gap-2">
  {semConfirmacao && !novoStatus && (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#C17F59]/10 text-[#C17F59]">
      Não confirmou
    </span>
  )}
  {novoStatus && (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${getStatusColor(novoStatus)}20`, color: getStatusColor(novoStatus) }}>
      {novoStatus.charAt(0).toUpperCase() + novoStatus.slice(1)}
    </span>
  )}
</div>
```

- [ ] **Step 4: Pass `semConfirmacao` prop in the list**

In the `pendentes.map()` block:

```tsx
<SessaoChecklist
  key={s.id}
  sessao={s}
  update={updates.find(u => u.id === s.id)}
  pagamento={pagamentos.find(p => p.id === s.id)}
  onUpdate={handleUpdate}
  onPagamento={handlePagamento}
  onRemarcar={() => setRemarcarSessao(s)}
  disabled={salvandoRemarcar}
  semConfirmacao={sessoesComAlerta.has(s.id)}
/>
```

- [ ] **Step 5: Add "Dia concluído" summary state**

Replace the `{!loading && !error && pendentes.length === 0 && (...)` empty state block with:

```tsx
{!loading && !error && pendentes.length === 0 && (
  checklistConcluido ? (
    <div className="text-center py-16 flex flex-col items-center gap-3">
      <div className="w-14 h-14 rounded-full bg-[#4CAF82]/10 flex items-center justify-center">
        <CheckCircle2 size={28} className="text-[#4CAF82]" />
      </div>
      <p className="font-display text-lg font-semibold text-[#1C1C1C]">Dia concluído</p>
      {sessoes.length > 0 && (
        <div className="flex gap-3 flex-wrap justify-center mt-1">
          {(['concluida', 'faltou', 'cancelada', 'remarcada'] as const).map(status => {
            const count = sessoes.filter(s => s.status === status).length
            if (count === 0) return null
            return (
              <span key={status} className="text-xs px-3 py-1 rounded-full"
                style={{ background: `${getStatusColor(status)}18`, color: getStatusColor(status) }}>
                {count} {status}
              </span>
            )
          })}
        </div>
      )}
    </div>
  ) : (
    <div className="text-center py-16">
      <p className="text-muted text-sm">Nenhuma sessão pendente hoje.</p>
    </div>
  )
)}
```

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/ChecklistPage.tsx
git commit -m "feat(checklist): add Não confirmou badge and Dia concluído summary state"
```

---

## Self-Review Checklist

- [x] **Spec section 2.1** (Checklist nav + badge) → Task 8 (useChecklistBadge + BottomNav + Sidebar)
- [x] **Spec section 2.2** (2 fixed reminder windows) → Task 6 (cron-lembretes rewrite)
- [x] **Spec section 2.3** (WhatsApp message format + cancel/3) → Task 3 (phone.ts) + Task 5 (webhook)
- [x] **Spec section 2.4** (no response → bell alert) → Task 7 (checklist-trigger) + Task 4 (useNotificacoes)
- [x] **Spec section 2.5** (Checklist page behavior) → Task 10
- [x] **Spec section 3** (DB changes) → Task 1
- [x] **Spec section 4** (useNotificacoes hook change) → Task 4
- [x] **Spec section 5** (Edge Functions) → Tasks 5, 6, 7
- [x] **Spec section 6** (Settings page) → Task 9
- [x] **Spec section 7** (Error handling: idempotent cancel) → Task 5 (webhook doesn't double-update), Task 7 (23505 ignored)
- [x] **Bug fix**: webhook CANCELAR not updating `sessoes.status` → Task 5
