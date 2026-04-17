import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useFinanceiro } from '../useFinanceiro'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockSessoes = [
  {
    id: 's1', paciente_id: 'p1', avulso_nome: null,
    data_hora: '2026-04-07T10:00:00Z', status: 'concluida',
    valor_cobrado: 200, pago: true,
    pacientes: { nome: 'Ana Lima', tipo: 'particular', convenio_id: null, convenios: null },
  },
  {
    id: 's2', paciente_id: 'p1', avulso_nome: null,
    data_hora: '2026-04-14T10:00:00Z', status: 'concluida',
    valor_cobrado: 200, pago: false,
    pacientes: { nome: 'Ana Lima', tipo: 'particular', convenio_id: null, convenios: null },
  },
]

describe('useFinanceiro', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calculates KPIs from sessions', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }),
    } as any)

    const mes = new Date('2026-04-01')
    const { result } = renderHook(() => useFinanceiro(mes))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.dados.recebido).toBe(200)
    expect(result.current.dados.pendente).toBe(200)
    expect(result.current.dados.totalSessoes).toBe(2)
  })
})
