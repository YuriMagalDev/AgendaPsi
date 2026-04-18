import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useModalidades } from '../useModalidades'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

function buildChain(overrides: Record<string, any> = {}) {
  const base: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  return base
}

describe('useModalidades', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active modalities ordered by nome', async () => {
    const mock = [{ id: 'm-1', nome: 'Presencial', ativo: true }]
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mock, error: null }) })
    )

    const { result } = renderHook(() => useModalidades())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.modalidades).toEqual(mock)
  })

  it('addModalidade inserts a new modality and refetches', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        } as any
      }
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    })

    const { result } = renderHook(() => useModalidades())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addModalidade('Casal')
    })

    expect(supabase.from).toHaveBeenCalledWith('modalidades')
  })

  it('toggleAtivo deactivates a modality', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy, order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    const { result } = renderHook(() => useModalidades())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleAtivo('m-1', false)
    })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'm-1')
  })
})
