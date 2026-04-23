import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePacienteDetalhe } from '../usePacienteDetalhe'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

const mockPaciente = {
  id: 'p-1',
  nome: 'Maria Souza',
  telefone: '11988887777',
  email: 'maria@email.com',
  data_nascimento: '1985-06-15',
  ativo: true,
  criado_em: '2024-01-01T00:00:00Z',
}

const mockSessoes = [
  { id: 's-1', paciente_id: 'p-1', status: 'concluida', pago: true, valor_cobrado: 150, data_hora: '2024-03-01T14:00:00Z', modalidades_sessao: { nome: 'Individual', emoji: '👤' }, meios_atendimento: { nome: 'Presencial', emoji: '🏥' }, avulso_nome: null, avulso_telefone: null, modalidade_sessao_id: 'ms-1', meio_atendimento_id: 'ma-1', sessao_origem_id: null, criado_em: '2024-03-01T00:00:00Z', data_pagamento: null },
  { id: 's-2', paciente_id: 'p-1', status: 'faltou', pago: false, valor_cobrado: 150, data_hora: '2024-03-08T14:00:00Z', modalidades_sessao: { nome: 'Individual', emoji: '👤' }, meios_atendimento: { nome: 'Presencial', emoji: '🏥' }, avulso_nome: null, avulso_telefone: null, modalidade_sessao_id: 'ms-1', meio_atendimento_id: 'ma-1', sessao_origem_id: null, criado_em: '2024-03-08T00:00:00Z', data_pagamento: null },
  { id: 's-3', paciente_id: 'p-1', status: 'concluida', pago: false, valor_cobrado: 150, data_hora: '2024-03-15T14:00:00Z', modalidades_sessao: { nome: 'Individual', emoji: '👤' }, meios_atendimento: { nome: 'Presencial', emoji: '🏥' }, avulso_nome: null, avulso_telefone: null, modalidade_sessao_id: 'ms-1', meio_atendimento_id: 'ma-1', sessao_origem_id: null, criado_em: '2024-03-15T00:00:00Z', data_pagamento: null },
]

const mockContrato = {
  id: 'c-1',
  paciente_id: 'p-1',
  tipo: 'por_sessao' as const,
  valor: 150,
  qtd_sessoes: null,
  dia_vencimento: null,
  ativo: true,
  criado_em: '2024-01-01T00:00:00Z',
}

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

describe('usePacienteDetalhe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches patient, sessions and contract in parallel', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'pacientes') {
        return buildChain({ single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }) }) as any
      }
      if (table === 'sessoes') {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) }) as any
      }
      if (table === 'contratos') {
        return buildChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }) }) as any
      }
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacienteDetalhe('p-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.paciente).toEqual(mockPaciente)
    expect(result.current.sessoes).toHaveLength(3)
    expect(result.current.contrato).toEqual(mockContrato)
  })

  it('calculates stats correctly from sessions', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'pacientes') return buildChain({ single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }) }) as any
      if (table === 'sessoes') return buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) }) as any
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacienteDetalhe('p-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.stats.total).toBe(3)
    expect(result.current.stats.concluidas).toBe(2)
    expect(result.current.stats.faltas).toBe(1)
    expect(result.current.stats.totalPago).toBe(150) // only s-1 is paid
  })

  it('archive calls update with ativo=false', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'pacientes') {
        return buildChain({
          single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }),
          update: updateSpy,
        }) as any
      }
      if (table === 'sessoes') return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacienteDetalhe('p-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.arquivar() })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'p-1')
    expect(result.current.paciente?.ativo).toBe(false)
  })
})
