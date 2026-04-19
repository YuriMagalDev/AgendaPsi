import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useModalidadesSessao } from '../useModalidadesSessao'

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
    ...overrides,
  }
  return base
}

describe('useModalidadesSessao', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active modalidades ordered by nome', async () => {
    const mock = [{ id: 'ms-1', nome: 'Individual', emoji: '👤', ativo: true }]
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mock, error: null }) })
    )

    const { result } = renderHook(() => useModalidadesSessao())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.modalidadesSessao).toEqual(mock)
    expect(vi.mocked(supabase.from)).toHaveBeenCalledWith('modalidades_sessao')
  })

  it('addModalidadeSessao inserts with nome and emoji then refetches', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return { insert: vi.fn().mockResolvedValue({ error: null }) } as any
      }
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    })

    const { result } = renderHook(() => useModalidadesSessao())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addModalidadeSessao('Grupo', '🧑‍🤝‍🧑')
    })

    expect(supabase.from).toHaveBeenCalledWith('modalidades_sessao')
  })

  it('toggleAtivo updates ativo field by id', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy, order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    const { result } = renderHook(() => useModalidadesSessao())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleAtivo('ms-1', false)
    })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'ms-1')
  })
})
