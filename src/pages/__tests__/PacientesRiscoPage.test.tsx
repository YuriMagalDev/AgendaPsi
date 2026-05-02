import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/hooks/useRiscoConfig', () => ({
  useRiscoConfig: () => ({ config: { min_cancelamentos_seguidos: 2, dias_sem_sessao: 30, dias_apos_falta_sem_agendamento: 7 }, loading: false, error: null, update: vi.fn(), refetch: vi.fn() })
}))
vi.mock('@/hooks/usePacientesEmRisco', () => ({
  usePacientesEmRisco: () => ({ pacientes: [], loading: false, error: null, refetch: vi.fn() })
}))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) }) }
}))

const { PacientesRiscoPage } = await import('@/pages/PacientesRiscoPage')

describe('PacientesRiscoPage', () => {
  it('renders page title', () => {
    render(<MemoryRouter><PacientesRiscoPage /></MemoryRouter>)
    expect(screen.getByText('Pacientes em Risco')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    render(<MemoryRouter><PacientesRiscoPage /></MemoryRouter>)
    expect(screen.getByText(/Nenhum paciente em risco/i)).toBeInTheDocument()
  })
})
