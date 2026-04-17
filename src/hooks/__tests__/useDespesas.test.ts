// src/hooks/__tests__/useDespesas.test.ts
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useDespesas } from '../useDespesas'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockDespesas = [
  { id: 'd1', mes: '2026-04-01', descricao: 'Aluguel', valor: 300, criado_em: '2026-04-01' },
]

function buildChain(overrides: Record<string, unknown> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: mockDespesas, error: null }),
    insert: vi.fn().mockResolvedValue({ error: null }),
    delete: vi.fn().mockReturnThis(),
    ...overrides,
  }
}

describe('useDespesas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches despesas for the month', async () => {
    vi.mocked(supabase.from).mockReturnValue(buildChain() as any)
    const { result } = renderHook(() => useDespesas(new Date('2026-04-01')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.despesas).toHaveLength(1)
    expect(result.current.total).toBe(300)
  })

  it('addDespesa inserts and refetches', async () => {
    const chain = buildChain()
    vi.mocked(supabase.from).mockReturnValue(chain as any)
    const { result } = renderHook(() => useDespesas(new Date('2026-04-01')))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.addDespesa('Espaço', 100) })
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ descricao: 'Espaço', valor: 100 })
    )
  })
})
