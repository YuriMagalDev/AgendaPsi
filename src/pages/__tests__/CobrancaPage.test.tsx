import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CobrancaPage } from '../CobrancaPage'
import type { SessaoParaCobranca, CobrancaEnviadaView } from '@/lib/types'

const {
  mockFetchSessoes,
  mockFetchCobracas,
  mockEnfileirar,
  mockCancelar,
  mockReenviar,
  mockMarcarPago,
} = vi.hoisted(() => ({
  mockFetchSessoes:  vi.fn(),
  mockFetchCobracas: vi.fn(),
  mockEnfileirar:    vi.fn(),
  mockCancelar:      vi.fn(),
  mockReenviar:      vi.fn(),
  mockMarcarPago:    vi.fn(),
}))

let mockSessoes:  SessaoParaCobranca[] = []
let mockCobracas: CobrancaEnviadaView[] = []

vi.mock('@/hooks/useReguaCobranca', () => ({
  useReguaCobranca: () => ({
    sessoesParaCobranca:      mockSessoes,
    cobracasEnviadas:         mockCobracas,
    loading:                  false,
    error:                    null,
    fetchSessoesParaCobranca: mockFetchSessoes,
    fetchCobracasEnviadas:    mockFetchCobracas,
    enfileirarEEnviar:        mockEnfileirar,
    cancelarCobranca:         mockCancelar,
    reenviarFalha:            mockReenviar,
    marcarPago:               mockMarcarPago,
  }),
}))

function renderPage() {
  return render(
    <MemoryRouter>
      <CobrancaPage />
    </MemoryRouter>
  )
}

describe('CobrancaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessoes  = []
    mockCobracas = []
  })

  it('renders both tab labels', () => {
    renderPage()
    expect(screen.getByText(/Sessões Não Pagas/)).toBeInTheDocument()
    expect(screen.getByText(/Histórico de Envios/)).toBeInTheDocument()
  })

  it('calls fetch hooks on mount', () => {
    renderPage()
    expect(mockFetchSessoes).toHaveBeenCalledTimes(1)
    expect(mockFetchCobracas).toHaveBeenCalledTimes(1)
  })

  it('shows empty state when no unpaid sessions', () => {
    renderPage()
    expect(screen.getByText('Nenhuma sessão com pagamento pendente')).toBeInTheDocument()
  })

  it('renders session card when sessions exist', () => {
    mockSessoes = [{
      id: 's-1',
      data_hora: '2026-04-01T10:00:00Z',
      valor_cobrado: 150,
      pago: false,
      status: 'concluida',
      paciente_id: null,
      avulso_nome: 'Maria Silva',
      avulso_telefone: null,
      pacientes: null,
      etapas_pendentes: [1, 2, 3],
    }]
    renderPage()
    expect(screen.getByText('Maria Silva')).toBeInTheDocument()
  })

  it('switches to Histórico tab on click', () => {
    renderPage()
    fireEvent.click(screen.getByText(/Histórico de Envios/))
    expect(screen.getByText('Nenhum envio registrado')).toBeInTheDocument()
  })

  it('shows no spinner in normal state', () => {
    renderPage()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('calls marcarPago with session id when button clicked', () => {
    mockMarcarPago.mockResolvedValue(undefined)
    mockSessoes = [{
      id: 's-1',
      data_hora: '2026-04-01T10:00:00Z',
      valor_cobrado: 150,
      pago: false,
      status: 'concluida',
      paciente_id: null,
      avulso_nome: 'Maria Silva',
      avulso_telefone: null,
      pacientes: null,
      etapas_pendentes: [1, 2, 3],
    }]
    renderPage()
    fireEvent.click(screen.getByText('Marcar como Pago'))
    expect(mockMarcarPago).toHaveBeenCalledWith('s-1')
  })
})
