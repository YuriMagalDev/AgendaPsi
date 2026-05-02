import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from:      vi.fn(),
    functions: { invoke: vi.fn() },
    auth:      { getUser: vi.fn() },
  },
}))
vi.mock('@/hooks/useConvenios',         () => ({ useConvenios:         () => ({ convenios: [], loading: false, addConvenio: vi.fn(), toggleAtivo: vi.fn(), updateValor: vi.fn() }) }))
vi.mock('@/hooks/useModalidadesSessao', () => ({ useModalidadesSessao: () => ({ modalidadesSessao: [], loading: false, addModalidadeSessao: vi.fn(), toggleAtivo: vi.fn() }) }))
vi.mock('@/hooks/useMeiosAtendimento',  () => ({ useMeiosAtendimento:  () => ({ meiosAtendimento: [], loading: false, addMeioAtendimento: vi.fn(), toggleAtivo: vi.fn() }) }))
vi.mock('@/hooks/useConfigPsicologo',   () => ({
  useConfigPsicologo: () => ({
    config: { id: '1', nome: 'Dr. Teste', horario_inicio: '08:00', horario_fim: '18:00', whatsapp_conectado: false, evolution_instance_name: null, automacao_whatsapp_ativa: false, user_id: 'u1', horario_lembrete_1: '18:00', horario_lembrete_2: '07:00', google_calendar_sync_enabled: false, google_calendar_bidirectional: false, ical_token: null },
    loading: false,
    updateConfig: vi.fn(),
    refetch: vi.fn(),
  }),
}))
vi.mock('@/hooks/useReguaCobranca', () => ({
  useReguaCobranca: () => ({
    regras: [],
    loading: false,
    fetchRegras: vi.fn(),
    salvarRegra: vi.fn(),
    deletarRegra: vi.fn(),
  }),
}))
vi.mock('@/components/regua-cobranca/ReguaCobrancaTemplateEditor', () => ({
  ReguaCobrancaTemplateEditor: () => null,
}))
vi.mock('@/hooks/useRiscoConfig', () => ({
  useRiscoConfig: () => ({
    config: { id: 'rc1', min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 },
    loading: false,
    error: null,
    update: vi.fn(),
    refetch: vi.fn(),
  }),
}))
vi.mock('@/hooks/useRiscoTemplates', () => ({
  useRiscoTemplates: () => ({
    templates: [],
    loading: false,
    error: null,
    refetch: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  }),
}))
vi.mock('@/hooks/useGoogleCalendarSync', () => ({
  useGoogleCalendarSync: vi.fn(() => ({
    status: { connected: false, sync_enabled: false, bidirectional_enabled: false, calendario_nome: null, google_user_id: null, ultimo_sync_em: null },
    loading: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    updateSyncSettings: vi.fn(),
    syncNow: vi.fn(),
    refetch: vi.fn(),
  })),
}))

import { ConfiguracoesPage } from '../ConfiguracoesPage'

describe('ConfiguracoesPage — Google Calendar section', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Google Calendar section heading', async () => {
    render(<ConfiguracoesPage />)
    await waitFor(() => expect(screen.getByText('Google Calendar')).toBeInTheDocument())
  })

  it('shows connect button when not connected', async () => {
    render(<ConfiguracoesPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /conectar google calendar/i })).toBeInTheDocument()
    )
  })

  it('calls connect when button clicked', async () => {
    const { useGoogleCalendarSync } = await import('@/hooks/useGoogleCalendarSync')
    const connectFn = vi.fn()
    vi.mocked(useGoogleCalendarSync).mockReturnValue({
      status: { connected: false, sync_enabled: false, bidirectional_enabled: false, calendario_nome: null, google_user_id: null, ultimo_sync_em: null },
      loading: false, error: null,
      connect: connectFn, disconnect: vi.fn(), updateSyncSettings: vi.fn(), syncNow: vi.fn(), refetch: vi.fn(),
    } as any)

    render(<ConfiguracoesPage />)
    const btn = await screen.findByRole('button', { name: /conectar google calendar/i })
    await userEvent.click(btn)
    expect(connectFn).toHaveBeenCalledTimes(1)
  })
})
