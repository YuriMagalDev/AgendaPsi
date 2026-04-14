import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '@/contexts/AuthContext'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import type { Session, User } from '@supabase/supabase-js'

function renderWithAuth(authenticated: boolean) {
  const contextValue = {
    session: authenticated ? ({ user: { id: '1' } } as Session) : null,
    user: authenticated ? ({ id: '1' } as User) : null,
    loading: false,
    signOut: vi.fn(),
  }
  render(
    <AuthContext.Provider value={contextValue}>
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/protected" element={<div>Protected Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

describe('ProtectedRoute', () => {
  it('renders children when authenticated', () => {
    renderWithAuth(true)
    expect(screen.getByText('Protected Content')).toBeInTheDocument()
  })

  it('redirects to /login when not authenticated', () => {
    renderWithAuth(false)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })
})
