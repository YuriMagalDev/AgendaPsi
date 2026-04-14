import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { useContext } from 'react'
import { AuthProvider, AuthContext } from '@/contexts/AuthContext'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}))

function TestConsumer() {
  const ctx = useContext(AuthContext)
  return <div data-testid="loading">{String(ctx.loading)}</div>
}

describe('AuthProvider', () => {
  it('renders children', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <div>child</div>
        </AuthProvider>
      )
    })
    expect(screen.getByText('child')).toBeInTheDocument()
  })

  it('resolves loading after session check', async () => {
    await act(async () => {
      render(
        <AuthProvider>
          <TestConsumer />
        </AuthProvider>
      )
    })
    expect(screen.getByTestId('loading').textContent).toBe('false')
  })
})
