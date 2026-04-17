// src/hooks/__tests__/useFinanceiroPaciente.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useFinanceiroPaciente } from '../useFinanceiroPaciente'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockSessoes = [
  {
    id: 's1', paciente_id: 'p1', data_hora: '2026-04-07T10:00:00Z',
    status: 'concluida', valor_cobrado: 200, pago: true, forma_pagamento: 'pix',
    modalidades: { nome: 'Presencial' },
  },
  {
    id: 's2', paciente_id: 'p1', data_hora: '2026-04-14T10:00:00Z',
    status: 'concluida', valor_cobrado: 200, pago: false, forma_pagamento: null,
    modalidades: { nome: 'Presencial' },
  },
]

const mockPaciente = {
  id: 'p1', nome: 'Ana Lima', tipo: 'particular', convenio_id: null,
  convenios: null,
}

describe('useFinanceiroPaciente', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calculates totais from all sessions for the patient', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }),
      } as any)

    const { result } = renderHook(() =>
      useFinanceiroPaciente('p1', new Date('2026-04-01'))
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.totalHistorico).toBe(200) // only pago=true
    expect(result.current.totalPendente).toBe(200)  // pago=false concluida across all months
    expect(result.current.sessoesMes).toHaveLength(2)
  })
})
