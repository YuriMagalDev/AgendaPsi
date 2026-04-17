import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useNotificacoes } from '../useNotificacoes'

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

const mockData = [
  {
    id: 'n1',
    sessao_id: 's1',
    mensagem_enviada_em: '2026-04-17T10:00:00Z',
    resposta: 'Sim',
    confirmado: true,
    lida: false,
    sessoes: {
      data_hora: '2026-04-18T09:00:00Z',
      paciente_id: 'p1',
      avulso_nome: null,
      pacientes: { nome: 'João Silva' },
    },
  },
]

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    in: vi.fn().mockResolvedValue({ error: null }),
    ...overrides,
  }
}

describe('useNotificacoes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns unread notifications', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mockData, error: null }) }) as any
    )

    const { result } = renderHook(() => useNotificacoes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.notificacoes).toHaveLength(1)
    expect(result.current.count).toBe(1)
  })

  it('marcarLidas clears the list', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mockData, error: null }) }) as any
    )

    const { result } = renderHook(() => useNotificacoes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.notificacoes).toHaveLength(1)

    await act(async () => {
      await result.current.marcarLidas(['n1'])
    })

    expect(result.current.notificacoes).toHaveLength(0)
  })

  it('subscribes to Realtime on mount', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    renderHook(() => useNotificacoes())
    await waitFor(() => expect(supabase.channel).toHaveBeenCalled())

    expect(mockChannel.on).toHaveBeenCalled()
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })
})
