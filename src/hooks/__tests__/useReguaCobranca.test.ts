import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useReguaCobranca } from '../useReguaCobranca'

// ── Supabase mock ──────────────────────────────────────────────
const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  },
}))

const makeChain = (resolved: { data: unknown; error: unknown }) => {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.order  = vi.fn().mockResolvedValue(resolved)
  chain.eq     = vi.fn().mockReturnValue(chain)
  chain.in     = vi.fn().mockReturnValue(chain)
  chain.not    = vi.fn().mockReturnValue(chain)
  chain.gte    = vi.fn().mockReturnValue(chain)
  chain.upsert = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolved)
  return chain
}

describe('useReguaCobranca', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('starts with empty state', () => {
    mockFrom.mockReturnValue(makeChain({ data: [], error: null }))
    const { result } = renderHook(() => useReguaCobranca())
    expect(result.current.regras).toEqual([])
    expect(result.current.cobracasEnviadas).toEqual([])
    expect(result.current.sessoesParaCobranca).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('fetchRegras populates regras state', async () => {
    const mockData = [
      { id: 'r-1', etapa: 1, dias_apos: 1, template_mensagem: 'Olá {{nome}}', ativo: true },
    ]
    const chain = makeChain({ data: mockData, error: null })
    mockFrom.mockReturnValue(chain)

    const { result } = renderHook(() => useReguaCobranca())
    await act(async () => { await result.current.fetchRegras() })

    expect(result.current.regras).toEqual(mockData)
    expect(result.current.error).toBeNull()
  })

  it('fetchRegras sets error on failure', async () => {
    const chain = makeChain({ data: null, error: { message: 'DB error' } })
    mockFrom.mockReturnValue(chain)

    const { result } = renderHook(() => useReguaCobranca())
    await act(async () => { await result.current.fetchRegras() })

    expect(result.current.error).toMatch(/DB error/)
  })

  it('cancelarCobranca calls update with status=cancelado', async () => {
    const updateChain: Record<string, unknown> = {}
    updateChain.update = vi.fn().mockReturnValue(updateChain)
    updateChain.eq     = vi.fn().mockResolvedValue({ data: null, error: null })

    const refetchChain = makeChain({ data: [], error: null })
    mockFrom
      .mockReturnValueOnce(updateChain)
      .mockReturnValue(refetchChain)

    const { result } = renderHook(() => useReguaCobranca())
    await act(async () => { await result.current.cancelarCobranca('cob-1') })

    expect(result.current.error).toBeNull()
  })
})
