import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { PlanoPage } from '../PlanoPage'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

vi.mock('@/hooks/useAssinatura', () => ({ useAssinatura: vi.fn() }))
import { useAssinatura } from '@/hooks/useAssinatura'

function renderPage() {
  return render(
    <MemoryRouter>
      <PlanoPage />
    </MemoryRouter>
  )
}

describe('PlanoPage', () => {
  it('shows trial state with days remaining', () => {
    ;(useAssinatura as any).mockReturnValue({
      assinatura: { plano: 'completo', status: 'trial', trial_fim: '2026-05-07', stripe_customer_id: null, stripe_subscription_id: null },
      loading: false,
      isTrialAtivo: true,
      diasRestantesTrial: 10,
      podUsarWhatsapp: true,
      assinaturaAtiva: true,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText(/Trial Ativo/i)).toBeInTheDocument()
    expect(screen.getByText(/10 dias restantes/i)).toBeInTheDocument()
  })

  it('shows active plan state', () => {
    ;(useAssinatura as any).mockReturnValue({
      assinatura: { plano: 'completo', status: 'ativo', trial_fim: '2026-01-01', stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub_x' },
      loading: false,
      isTrialAtivo: false,
      diasRestantesTrial: 0,
      podUsarWhatsapp: true,
      assinaturaAtiva: true,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText(/Plano Ativo/i)).toBeInTheDocument()
    expect(screen.getByText(/Gerenciar pagamento/i)).toBeInTheDocument()
  })

  it('shows inadimplente warning', () => {
    ;(useAssinatura as any).mockReturnValue({
      assinatura: { plano: 'completo', status: 'inadimplente', trial_fim: '2026-01-01', stripe_customer_id: null, stripe_subscription_id: null },
      loading: false,
      isTrialAtivo: false,
      diasRestantesTrial: 0,
      podUsarWhatsapp: false,
      assinaturaAtiva: false,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText(/Pagamento pendente/i)).toBeInTheDocument()
    expect(screen.getByText(/Atualizar pagamento/i)).toBeInTheDocument()
  })

  it('shows both plan cards when not active', () => {
    ;(useAssinatura as any).mockReturnValue({
      assinatura: { plano: 'completo', status: 'trial', trial_fim: '2026-05-07', stripe_customer_id: null, stripe_subscription_id: null },
      loading: false,
      isTrialAtivo: true,
      diasRestantesTrial: 10,
      podUsarWhatsapp: true,
      assinaturaAtiva: true,
      refetch: vi.fn(),
    })
    renderPage()
    expect(screen.getByText('Básico')).toBeInTheDocument()
    expect(screen.getByText('Completo ⭐')).toBeInTheDocument()
  })
})
