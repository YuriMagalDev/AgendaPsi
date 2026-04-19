import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useKanban } from '../useKanban'

const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn(),
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

const mockSessoes = [
  { id: 's-1', status: 'agendada', paciente_id: 'p-1', avulso_nome: null, avulso_telefone: null, modalidade_sessao_id: 'ms-1', meio_atendimento_id: 'ma-1', data_hora: '2026-04-16T10:00:00Z', valor_cobrado: 150, pago: false, data_pagamento: null, remarcada_para: null, sessao_origem_id: null, criado_em: '2026-04-01T00:00:00Z', modalidades_sessao: { nome: 'Individual', emoji: '👤' }, meios_atendimento: { nome: 'Presencial', emoji: '🏥' }, pacientes: { nome: 'Ana Lima' } },
  { id: 's-2', status: 'confirmada', paciente_id: 'p-2', avulso_nome: null, avulso_telefone: null, modalidade_sessao_id: 'ms-1', meio_atendimento_id: 'ma-2', data_hora: '2026-04-16T14:00:00Z', valor_cobrado: 150, pago: false, data_pagamento: null, remarcada_para: null, sessao_origem_id: null, criado_em: '2026-04-01T00:00:00Z', modalidades_sessao: { nome: 'Individual', emoji: '👤' }, meios_atendimento: { nome: 'Online', emoji: '💻' }, pacientes: { nome: 'Bia Souza' } },
]

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  }
}

describe('useKanban', () => {
  beforeEach(() => vi.clearAllMocks())

  it('groups sessions by status', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) }) as any
    )

    const { result } = renderHook(() => useKanban())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.colunas.agendada).toHaveLength(1)
    expect(result.current.colunas.confirmada).toHaveLength(1)
    expect(result.current.colunas.concluida).toHaveLength(0)
  })

  it('subscribes to Realtime on mount', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    renderHook(() => useKanban())
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled())

    expect(mockChannel.on).toHaveBeenCalled()
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })

  it('updateStatus calls supabase update', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockImplementation(() => {
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }), update: updateSpy }) as any
    })

    const { result } = renderHook(() => useKanban())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateStatus('s-1', 'concluida')
    })

    expect(updateSpy).toHaveBeenCalledWith({ status: 'concluida' })
    expect(eqSpy).toHaveBeenCalledWith('id', 's-1')
  })
})
