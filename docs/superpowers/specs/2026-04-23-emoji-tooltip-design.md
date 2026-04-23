# Emoji Tooltip + Kanban Emojis

**Date:** 2026-04-23
**Branch:** feat/modalidades-split

## Problem

- `SessaoCard` shows `modalidades_sessao` + `meios_atendimento` emojis with native browser `title` tooltip — unstyled, inaccessible, inconsistent.
- `SemanaGrid` inline cards show no emojis at all.

## Goal

1. Replace native `title` with styled Base UI Tooltip on emoji badges in `SessaoCard`.
2. Add emoji badges to `SemanaGrid` cards when `height > 30px`, with same tooltip.

## Approach: Base UI Tooltip

`@base-ui/react` v1 already installed. `Tooltip` is portal-based, handles edge collision, accessible. No extra install needed.

## Components

### `src/components/ui/emoji-tooltip.tsx`

New shared component. API:

```tsx
<EmojiTooltip label="Online">🖥️</EmojiTooltip>
```

Internals:
- `Tooltip.Root` (no Provider needed)
- `Tooltip.Trigger` wrapping children
- `Tooltip.Portal → Tooltip.Positioner → Tooltip.Popup`
- `side="top"`, auto-flip near edges

Popup styles (design system tokens):
- `bg-[var(--surface)]` / `border border-[var(--border)]` / `shadow-sm`
- `rounded-lg` / `text-[11px]` / `font-[DM_Sans]` / `text-[var(--text)]`
- `px-2 py-1`

### `SessaoCard` changes

- Remove `title={sessao.modalidades_sessao.nome}` and `title={sessao.meios_atendimento.nome}`.
- Wrap each emoji `<span>` in `<EmojiTooltip label={nome}>`.
- Compact mode: no emojis shown — no change needed.

### `SemanaGrid` changes

Inline card block (lines 126–139), after existing `height > 32` time row:

```tsx
{height > 30 && (s.modalidades_sessao || s.meios_atendimento) && (
  <div className="flex gap-0.5 px-1 leading-none">
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
```

## Tooltip Popup Visual

```
┌─────────────────┐
│ Online           │  ← 11px DM Sans, text-[#1C1C1C]
└─────────────────┘
     ▲ (above trigger, flips if needed)
```

Each emoji gets its own tooltip (two separate tooltips per card, not combined).

## Files Changed

| File | Change |
|---|---|
| `src/components/ui/emoji-tooltip.tsx` | New component |
| `src/components/sessao/SessaoCard.tsx` | Swap `title` → `EmojiTooltip` |
| `src/components/semana/SemanaGrid.tsx` | Add emoji row when `height > 30` |

## Out of Scope

- Compact `SessaoCard` mode (no emojis rendered there — unchanged)
- Combined tooltip showing both emojis at once
- Tooltip on status badge or other card elements
