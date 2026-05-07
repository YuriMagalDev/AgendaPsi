import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useRiscoConfig } from '../useRiscoConfig'

const makeChain = (resolved: { data: unknown; error: unknown }) => {
  const c: Record<string, unknown> = {}
  c.select  = vi.fn().mockReturnValue(c)
  c.eq      = vi.fn().mockReturnValue(c)
  c.insert  = vi.fn().mockReturnValue(c)
  c.update  = vi.fn().mockReturnValue(c)
  c.single  = vi.fn().mockResolvedValue(resolved)
  return c
}

const { mockFrom, mockGetUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockGetUser: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    auth: { getUser: mockGetUser },
  },
}))

describe('useRiscoConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  })

  it('fetches existing config', async () => {
    const mockData = { id: 'c1', min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }
    mockFrom.mockReturnValue(makeChain({ data: mockData, error: null }))
    const { result } = renderHook(() => useRiscoConfig())
    await act(async () => { await result.current.refetch() })
    expect(result.current.config?.min_cancelamentos_seguidos).toBe(2)
    expect(result.current.error).toBeNull()
  })

  it('creates default config when none exists (PGRST116)', async () => {
    const chain = makeChain({ data: null, error: { code: 'PGRST116' } })
    const chainCreate = makeChain({ data: { id: 'c2', min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }, error: null })
    mockFrom.mockReturnValueOnce(chain).mockReturnValue(chainCreate)
    const { result } = renderHook(() => useRiscoConfig())
    await act(async () => { await result.current.refetch() })
    expect(result.current.config?.id).toBe('c2')
  })

  it('update calls supabase.update with patch', async () => {
    const initialData = { id: 'c1', min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }
    const updatedData = { ...initialData, min_cancelamentos_seguidos: 3 }
    const chain = makeChain({ data: initialData, error: null })
    // For the update call, mock a new chain that returns updatedData
    const updateChain = makeChain({ data: updatedData, error: null })
    mockFrom
      .mockReturnValueOnce(chain)      // initial fetch on mount
      .mockReturnValue(updateChain)    // update call

    const { result } = renderHook(() => useRiscoConfig())
    // Wait for initial fetch to complete
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })

    await act(async () => { await result.current.update({ min_cancelamentos_seguidos: 3 }) })

    expect(result.current.error).toBeNull()
    expect(updateChain.update).toHaveBeenCalledWith({ min_cancelamentos_seguidos: 3 })
    expect(result.current.config?.min_cancelamentos_seguidos).toBe(3)
  })
})
