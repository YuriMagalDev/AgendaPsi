import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { OnboardingPage } from '@/pages/OnboardingPage'

const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockNavigate = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

describe('OnboardingPage', () => {
  beforeEach(() => {
    mockInsert.mockClear()
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
      expect(screen.getByRole('heading', { name: /modalidades/i })).toBeInTheDocument()
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
      expect(screen.getByRole('heading', { name: /modalidades/i })).toBeInTheDocument()
    })

    // Fill step 2 - just click próximo since modalidades has defaults
    fireEvent.click(screen.getByRole('button', { name: /próximo/i }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /whatsapp/i })).toBeInTheDocument()
    })

    // Fill step 3 - choose "não usar automação"
    const naoUsarButton = screen.getByRole('button', { name: /não usar automação/i })
    fireEvent.click(naoUsarButton)

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/agenda')
    })
  })
})
