// src/hooks/__tests__/useConvenios.test.ts
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useConvenios } from '../useConvenios'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockConvenios = [
  { id: 'c1', nome: 'Unimed', valor_sessao: 80, ativo: true, criado_em: '2026-01-01' },
]

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: mockConvenios, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  }
}

describe('useConvenios', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active convenios ordered by nome', async () => {
    vi.mocked(supabase.from).mockReturnValue(buildChain() as any)
    const { result } = renderHook(() => useConvenios())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.convenios).toHaveLength(1)
    expect(result.current.convenios[0].nome).toBe('Unimed')
  })

  it('addConvenio inserts and refetches', async () => {
    const chain = buildChain()
    vi.mocked(supabase.from).mockReturnValue(chain as any)
    const { result } = renderHook(() => useConvenios())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.addConvenio('Bradesco', 100)
    })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Bradesco', valor_sessao: 100 })
    )
  })
})
