# Emoji Tooltip + Kanban Emojis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add styled Base UI tooltips to emoji badges in SessaoCard and show emoji badges in SemanaGrid cards when height > 30px.

**Architecture:** New `EmojiTooltip` shared component wraps `@base-ui/react` Tooltip parts. SessaoCard replaces native `title` attrs with `EmojiTooltip`. SemanaGrid inline card rendering adds an emoji row (height > 30px), each emoji wrapped in `EmojiTooltip`.

**Tech Stack:** React 19, `@base-ui/react` v1.4 (already installed), Tailwind CSS, Vitest + Testing Library.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/components/ui/emoji-tooltip.tsx` | Create | Shared tooltip wrapper around Base UI |
| `src/components/ui/__tests__/emoji-tooltip.test.tsx` | Create | Unit tests for EmojiTooltip |
| `src/components/sessao/SessaoCard.tsx` | Modify | Swap `title` → EmojiTooltip on emoji spans |
| `src/components/semana/SemanaGrid.tsx` | Modify | Add emoji row at height > 30, use EmojiTooltip |

---

## Task 1: EmojiTooltip component

**Files:**
- Create: `src/components/ui/emoji-tooltip.tsx`
- Create: `src/components/ui/__tests__/emoji-tooltip.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/components/ui/__tests__/emoji-tooltip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmojiTooltip } from '../emoji-tooltip'

describe('EmojiTooltip', () => {
  it('renders children', () => {
    render(<EmojiTooltip label="Online">🖥️</EmojiTooltip>)
    expect(screen.getByText('🖥️')).toBeInTheDocument()
  })

  it('shows label on hover', async () => {
    const user = userEvent.setup()
    render(<EmojiTooltip label="Online">🖥️</EmojiTooltip>)
    await user.hover(screen.getByText('🖥️'))
    expect(await screen.findByText('Online')).toBeInTheDocument()
  })

  it('hides label after unhover', async () => {
    const user = userEvent.setup()
    render(<EmojiTooltip label="Online">🖥️</EmojiTooltip>)
    const trigger = screen.getByText('🖥️')
    await user.hover(trigger)
    await screen.findByText('Online')
    await user.unhover(trigger)
    await waitFor(() => expect(screen.queryByText('Online')).not.toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx vitest run src/components/ui/__tests__/emoji-tooltip.test.tsx
```

Expected: `Cannot find module '../emoji-tooltip'`

- [ ] **Step 3: Implement EmojiTooltip**

Create `src/components/ui/emoji-tooltip.tsx`:

```tsx
import { Tooltip } from '@base-ui/react'

interface Props {
  label: string
  children: React.ReactNode
}

export function EmojiTooltip({ label, children }: Props) {
  return (
    <Tooltip.Root delay={0}>
      <Tooltip.Trigger render={<span tabIndex={0} className="inline-flex items-center outline-none" />}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6}>
          <Tooltip.Popup className="bg-white border border-[#E4E0DA] shadow-sm rounded-lg px-2 py-1 text-[11px] text-[#1C1C1C] z-50 pointer-events-none">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npx vitest run src/components/ui/__tests__/emoji-tooltip.test.tsx
```

Expected: 3 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/emoji-tooltip.tsx src/components/ui/__tests__/emoji-tooltip.test.tsx
git commit -m "feat(ui): add EmojiTooltip component using Base UI"
```

---

## Task 2: Update SessaoCard

**Files:**
- Modify: `src/components/sessao/SessaoCard.tsx`

- [ ] **Step 1: Replace title attrs with EmojiTooltip**

Open `src/components/sessao/SessaoCard.tsx`. Find the emoji span block (lines 38–45):

```tsx
<span className="inline-flex gap-1">
  {sessao.modalidades_sessao && (
    <span title={sessao.modalidades_sessao.nome}>{sessao.modalidades_sessao.emoji}</span>
  )}
  {sessao.meios_atendimento && (
    <span title={sessao.meios_atendimento.nome}>{sessao.meios_atendimento.emoji}</span>
  )}
</span>
```

Replace with:

```tsx
<span className="inline-flex gap-1">
  {sessao.modalidades_sessao && (
    <EmojiTooltip label={sessao.modalidades_sessao.nome}>
      {sessao.modalidades_sessao.emoji}
    </EmojiTooltip>
  )}
  {sessao.meios_atendimento && (
    <EmojiTooltip label={sessao.meios_atendimento.nome}>
      {sessao.meios_atendimento.emoji}
    </EmojiTooltip>
  )}
</span>
```

Add import at top of file:

```tsx
import { EmojiTooltip } from '@/components/ui/emoji-tooltip'
```

- [ ] **Step 2: Run full test suite — expect no regressions**

```bash
npx vitest run
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/components/sessao/SessaoCard.tsx
git commit -m "feat(ui): SessaoCard — replace title attr with EmojiTooltip"
```

---

## Task 3: Update SemanaGrid

**Files:**
- Modify: `src/components/semana/SemanaGrid.tsx`

- [ ] **Step 1: Add EmojiTooltip import**

Open `src/components/semana/SemanaGrid.tsx`. Add import at top:

```tsx
import { EmojiTooltip } from '@/components/ui/emoji-tooltip'
```

- [ ] **Step 2: Add emoji row to inline card rendering**

Find the inline card block (lines 126–139). The full block currently looks like:

```tsx
return (
  <div
    key={s.id}
    className="absolute left-0.5 right-0.5 rounded border bg-surface overflow-hidden cursor-pointer hover:shadow-sm transition-shadow z-10"
    style={{ top, height, borderLeftWidth: 3, borderLeftColor: cfg.cor }}
    onClick={e => { e.stopPropagation(); onSessaoClick(s) }}
  >
    <p className="text-[11px] font-medium text-[#1C1C1C] truncate px-1 pt-0.5 leading-tight">
      {nomePaciente}
    </p>
    {height > 32 && (
      <p className="text-[10px] text-muted px-1 leading-none">{horario}</p>
    )}
  </div>
)
```

Replace with:

```tsx
return (
  <div
    key={s.id}
    className="absolute left-0.5 right-0.5 rounded border bg-surface overflow-hidden cursor-pointer hover:shadow-sm transition-shadow z-10"
    style={{ top, height, borderLeftWidth: 3, borderLeftColor: cfg.cor }}
    onClick={e => { e.stopPropagation(); onSessaoClick(s) }}
  >
    <p className="text-[11px] font-medium text-[#1C1C1C] truncate px-1 pt-0.5 leading-tight">
      {nomePaciente}
    </p>
    {height > 32 && (
      <p className="text-[10px] text-muted px-1 leading-none">{horario}</p>
    )}
    {height > 30 && (s.modalidades_sessao || s.meios_atendimento) && (
      <div className="flex gap-0.5 px-1 leading-none mt-0.5">
        {s.modalidades_sessao && (
          <EmojiTooltip label={s.modalidades_sessao.nome}>
            <span className="text-[10px]">{s.modalidades_sessao.emoji}</span>
          </EmojiTooltip>
        )}
        {s.meios_atendimento && (
          <EmojiTooltip label={s.meios_atendimento.nome}>
            <span className="text-[10px]">{s.meios_atendimento.emoji}</span>
          </EmojiTooltip>
        )}
      </div>
    )}
  </div>
)
```

- [ ] **Step 3: Run full test suite — expect no regressions**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/semana/SemanaGrid.tsx
git commit -m "feat(ui): SemanaGrid — add emoji badges (height > 30px) with EmojiTooltip"
```

---

## Verification Checklist

After all tasks complete, manual smoke test:

- [ ] Open Kanban (`/kanban`) — session cards with `height > 30px` show emoji badges
- [ ] Hover emoji on Kanban card — styled tooltip appears above with modality/meio name
- [ ] Open Agenda or any view using SessaoCard (full mode) — emojis visible
- [ ] Hover emoji on SessaoCard — styled tooltip appears (no browser native tooltip)
- [ ] Cards with `height ≤ 30px` show no emojis (no overflow)
- [ ] Tooltip auto-flips when card is near top of viewport
