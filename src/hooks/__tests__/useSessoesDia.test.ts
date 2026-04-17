import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useSessoesDia } from '../useSessoesDia'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

const mockSessoes = [
  {
    id: 's-1', paciente_id: 'p-1', avulso_nome: null, avulso_telefone: null,
    modalidade_id: 'm-1', data_hora: '2026-04-16T10:00:00Z', status: 'agendada',
    valor_cobrado: 150, pago: false, data_pagamento: null, remarcada_para: null,
    sessao_origem_id: null, criado_em: '2026-04-16T00:00:00Z',
    modalidades: { nome: 'Presencial' }, pacientes: { nome: 'Ana Lima' },
  },
]

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    ...overrides,
  }
}

describe('useSessoesDia', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches sessions for the given date ordered by data_hora', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) }) as any
    )

    const { result } = renderHook(() => useSessoesDia('2026-04-16'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.sessoes).toHaveLength(1)
    expect(supabase.from).toHaveBeenCalledWith('sessoes')
  })

  it('sets error on fetch failure', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }) }) as any
    )

    const { result } = renderHook(() => useSessoesDia('2026-04-16'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('fail')
    expect(result.current.sessoes).toEqual([])
  })

  it('refetches when date changes', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    const { result, rerender } = renderHook(({ d }) => useSessoesDia(d), {
      initialProps: { d: '2026-04-16' },
    })
    await waitFor(() => expect(result.current.loading).toBe(false))

    rerender({ d: '2026-04-17' })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.from).toHaveBeenCalledTimes(2)
  })
})
