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
      buildChain({
        single: vi.fn().mockResolvedValue({ data: { horario_checklist: '00:01' }, error: null }),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      }) as any
    )
    const { result } = renderHook(() => useChecklistBadge())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasPending).toBe(false)
  })

  it('returns true when there are pending sessions', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({
        single: vi.fn().mockResolvedValue({ data: { horario_checklist: '00:01' }, error: null }),
        in: vi.fn().mockResolvedValue({ data: [{ id: 's1' }], error: null }),
      }) as any
    )
    const { result } = renderHook(() => useChecklistBadge())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.hasPending).toBe(true)
  })
})
