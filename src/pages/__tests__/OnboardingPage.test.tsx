import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OnboardingPage } from '@/pages/OnboardingPage'

const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockNavigate = vi.fn()

const mockModalidades = [
  { id: 'mod-1', nome: 'Individual', emoji: '👤', ativo: true },
  { id: 'mod-2', nome: 'Casal', emoji: '👥', ativo: true },
]
const mockMeios = [
  { id: 'meio-1', nome: 'Online', emoji: '💻', ativo: true },
  { id: 'meio-2', nome: 'Presencial', emoji: '🏥', ativo: true },
]

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'modalidades_sessao') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockModalidades, error: null }),
          }),
          update: mockUpdate,
          insert: mockInsert,
        }
      }
      if (table === 'meios_atendimento') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockMeios, error: null }),
          }),
          update: mockUpdate,
          insert: mockInsert,
        }
      }
      return { insert: mockInsert, update: mockUpdate }
    }),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('OnboardingPage', () => {
  beforeEach(() => {
    mockInsert.mockClear()
    mockUpdate.mockClear()
    mockNavigate.mockClear()
  })

  it('renders step 1 by default', () => {
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    expect(screen.getByText(/seus dados/i)).toBeInTheDocument()
  })

  it('advances to step 2 after filling step 1', async () => {
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText(/seu nome/i), { target: { value: 'Dra. Ana' } })
    fireEvent.click(screen.getByRole('button', { name: /próximo/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /tipos de atendimento/i })).toBeInTheDocument()
    })
  })

  it('shows step progress indicator', () => {
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    const indicators = screen.getAllByRole('generic', { hidden: true })
    expect(indicators.length).toBeGreaterThan(0)
  })

  it('navigates to agenda after completing onboarding', async () => {
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)

    // Fill step 1
    fireEvent.change(screen.getByLabelText(/seu nome/i), { target: { value: 'Dra. Ana' } })
    fireEvent.click(screen.getAllByRole('button', { name: /próximo/i })[0])

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /tipos de atendimento/i })).toBeInTheDocument()
    })

    // Fill step 2 - checkboxes default to all selected; click próximo
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /próximo/i })).not.toBeDisabled()
    })
    fireEvent.click(screen.getByRole('button', { name: /próximo/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /convênios/i })).toBeInTheDocument()
    })

    // Fill step 3 - skip convênios
    fireEvent.click(screen.getByRole('button', { name: /não atendo por convênio/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /whatsapp/i })).toBeInTheDocument()
    })

    // Fill step 4 - choose "não usar automação"
    const naoUsarButton = screen.getByRole('button', { name: /não usar automação/i })
    fireEvent.click(naoUsarButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/agenda')
    })
  })
})
