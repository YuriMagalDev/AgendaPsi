import { describe, it, expect } from 'vitest'
import { checkSlotConflict } from '../conflictCheck'

describe('checkSlotConflict', () => {
  const existing = { id: 'e1', dia_semana: 2, horario: '14:00', duracao_minutos: 60 }

  it('returns null when list is empty', () => {
    expect(checkSlotConflict({ dia_semana: 2, horario: '14:00', duracao_minutos: 60 }, [])).toBeNull()
  })

  it('returns conflict for exact same time', () => {
    expect(checkSlotConflict({ dia_semana: 2, horario: '14:00', duracao_minutos: 60 }, [existing])).toBe(existing)
  })

  it('returns conflict when new slot starts during existing', () => {
    // existing: 14:00–15:00, new: 14:30–15:30 → overlap
    expect(checkSlotConflict({ dia_semana: 2, horario: '14:30', duracao_minutos: 60 }, [existing])).toBe(existing)
  })

  it('returns conflict when new slot contains existing', () => {
    // existing: 14:00–15:00, new: 13:30–15:30 → overlap
    expect(checkSlotConflict({ dia_semana: 2, horario: '13:30', duracao_minutos: 120 }, [existing])).toBe(existing)
  })

  it('returns null for adjacent slot (no gap but no overlap)', () => {
    // existing: 14:00–15:00, new: 15:00–16:00 → adjacent, not overlapping
    expect(checkSlotConflict({ dia_semana: 2, horario: '15:00', duracao_minutos: 60 }, [existing])).toBeNull()
  })

  it('returns null for different day', () => {
    expect(checkSlotConflict({ dia_semana: 3, horario: '14:00', duracao_minutos: 60 }, [existing])).toBeNull()
  })

  it('excludes self when id matches (for editing existing slot)', () => {
    expect(checkSlotConflict({ id: 'e1', dia_semana: 2, horario: '14:00', duracao_minutos: 60 }, [existing])).toBeNull()
  })
})
