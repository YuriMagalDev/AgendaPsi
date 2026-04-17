import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useModalidades } from '../useModalidades'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

describe('useModalidades', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active modalities ordered by nome', async () => {
    const mock = [{ id: 'm-1', nome: 'Presencial', ativo: true }]
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mock, error: null }),
    } as any)

    const { result } = renderHook(() => useModalidades())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.modalidades).toEqual(mock)
  })
})
