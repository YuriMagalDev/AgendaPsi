// src/hooks/__tests__/useRepasses.test.ts
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useRepasses } from '../useRepasses'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

const mockRegras = [
  { id: 'r1', nome: 'Clínica (20%)', tipo_valor: 'percentual', valor: 20, ativo: true },
]

const mockRepasses = [
  { id: 'rp1', regra_repasse_id: 'r1', mes: '2026-04-01', valor_calculado: 960, pago: false, data_pagamento: null },
]

describe('useRepasses', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads regras and existing repasses', async () => {
    vi.mocked(supabase.from)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: mockRegras, error: null }),
      } as any)
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: mockRepasses, error: null }),
      } as any)

    const mes = new Date('2026-04-01')
    const { result } = renderHook(() => useRepasses(mes, 4800))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.itens).toHaveLength(1)
    expect(result.current.itens[0].nome).toBe('Clínica (20%)')
    expect(result.current.itens[0].valorCalculado).toBe(960) // 20% of 4800
    expect(result.current.itens[0].pago).toBe(false)
  })
})
