import { describe, it, expect } from 'vitest'
import { checkGoogleConflict } from '../conflictCheckGoogle'
import type { SessionsExternalBusy } from '@/lib/types'

const busy: SessionsExternalBusy = {
  id: 'b1',
  user_id: 'u1',
  google_event_id: 'ev1',
  titulo: 'Reunião',
  data_hora_inicio: '2026-04-29T14:00:00Z',
  data_hora_fim:    '2026-04-29T15:00:00Z',
  descricao: null,
  atualizacao_em: null,
  sincronizado_em: '2026-04-29T00:00:00Z',
}

describe('checkGoogleConflict', () => {
  it('returns conflicting busy markers for an overlapping session', () => {
    // Session 14:30–15:30 overlaps with busy 14:00–15:00
    const result = checkGoogleConflict('2026-04-29T14:30:00Z', 60, [busy])
    expect(result).toHaveLength(1)
    expect(result[0].titulo).toBe('Reunião')
  })

  it('returns empty array when no overlap', () => {
    // Session 15:30–16:30 does not overlap with busy 14:00–15:00
    const result = checkGoogleConflict('2026-04-29T15:30:00Z', 60, [busy])
    expect(result).toHaveLength(0)
  })

  it('returns empty array when session ends exactly when busy starts', () => {
    // Session 13:00–14:00 ends exactly when busy starts — no overlap
    const result = checkGoogleConflict('2026-04-29T13:00:00Z', 60, [busy])
    expect(result).toHaveLength(0)
  })

  it('returns conflict when session starts exactly when busy starts', () => {
    // Session 14:00–14:30 starts exactly when busy starts — overlap
    const result = checkGoogleConflict('2026-04-29T14:00:00Z', 30, [busy])
    expect(result).toHaveLength(1)
  })
})
