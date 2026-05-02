import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePacientesEmRisco } from '../usePacientesEmRisco'

const { mockRpc, mockGetUser } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockGetUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } })
}))
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: mockRpc, auth: { getUser: mockGetUser } } }))

const mockConfig = { min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }

describe('usePacientesEmRisco', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty list and skips RPC when config is null', () => {
    const { result } = renderHook(() => usePacientesEmRisco(null))
    expect(result.current.pacientes).toEqual([])
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('fetches and maps RPC results', async () => {
    const data = [{ id: 'p1', nome: 'Ana', telefone: null, ultima_sessao_data_hora: null, risk_level: 'Alto', cancelamentos_seguidos: 2, dias_sem_sessao: 40, dias_apos_falta: null, triggers: [] }]
    mockRpc.mockResolvedValue({ data, error: null })
    const { result } = renderHook(() => usePacientesEmRisco(mockConfig))
    await act(async () => { await result.current.refetch() })
    expect(result.current.pacientes[0].nome).toBe('Ana')
    expect(mockRpc).toHaveBeenLastCalledWith('get_pacientes_em_risco', {
      p_user_id: 'u1',
      p_min_cancelamentos: 2,
      p_dias_sem_sessao: 30,
      p_dias_apos_falta: 7,
    })
  })

  it('sets error on RPC failure', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc error' } })
    const { result } = renderHook(() => usePacientesEmRisco(mockConfig))
    await act(async () => { await result.current.refetch() })
    expect(result.current.error).toMatch(/rpc error/)
  })
})
