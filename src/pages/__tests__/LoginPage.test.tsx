import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockSignIn = vi.fn()
const mockNavigate = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignIn,
    },
  },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Import after mocking
const { LoginPage } = await import('@/pages/LoginPage')

describe('LoginPage', () => {
  beforeEach(() => {
    mockSignIn.mockReset()
    mockNavigate.mockReset()
  })

  it('renders email and password fields', () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>)
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument()
  })

  it('shows error message on invalid credentials', async () => {
    mockSignIn.mockResolvedValue({ error: { message: 'Invalid login credentials' } })

    render(<MemoryRouter><LoginPage /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'wrongpassword' } })
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(screen.getByText(/credenciais inválidas/i)).toBeInTheDocument()
    })
  })
})
