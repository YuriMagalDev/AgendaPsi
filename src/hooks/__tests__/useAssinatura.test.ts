import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAssinatura } from '../useAssinatura'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

function mockSupabase(data: unknown, error: unknown = null) {
  ;(supabase.from as any).mockReturnValue({
    select: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  })
}

describe('useAssinatura', () => {
  beforeEach(() => vi.clearAllMocks())

  it('trial ativo: isTrialAtivo=true, diasRestantesTrial>0, podUsarWhatsapp=true', async () => {
    const trialFim = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'trial', trial_fim: trialFim, stripe_customer_id: null, stripe_subscription_id: null, criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isTrialAtivo).toBe(true)
    expect(result.current.diasRestantesTrial).toBeGreaterThan(0)
    expect(result.current.podUsarWhatsapp).toBe(true)
    expect(result.current.assinaturaAtiva).toBe(true)
  })

  it('trial expirado: isTrialAtivo=false, podUsarWhatsapp=false', async () => {
    const trialFim = new Date(Date.now() - 1 * 86_400_000).toISOString().slice(0, 10)
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'trial', trial_fim: trialFim, stripe_customer_id: null, stripe_subscription_id: null, criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isTrialAtivo).toBe(false)
    expect(result.current.diasRestantesTrial).toBe(0)
    expect(result.current.podUsarWhatsapp).toBe(false)
    expect(result.current.assinaturaAtiva).toBe(false)
  })

  it('ativo completo: assinaturaAtiva=true, podUsarWhatsapp=true', async () => {
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'ativo', trial_fim: '2026-01-01', stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub_x', criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinaturaAtiva).toBe(true)
    expect(result.current.podUsarWhatsapp).toBe(true)
    expect(result.current.isTrialAtivo).toBe(false)
  })

  it('ativo basico: assinaturaAtiva=true, podUsarWhatsapp=false', async () => {
    mockSupabase({ id: '1', user_id: 'u1', plano: 'basico', status: 'ativo', trial_fim: '2026-01-01', stripe_customer_id: 'cus_x', stripe_subscription_id: 'sub_x', criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinaturaAtiva).toBe(true)
    expect(result.current.podUsarWhatsapp).toBe(false)
  })

  it('inadimplente: assinaturaAtiva=false, podUsarWhatsapp=false', async () => {
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'inadimplente', trial_fim: '2026-01-01', stripe_customer_id: null, stripe_subscription_id: null, criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinaturaAtiva).toBe(false)
    expect(result.current.podUsarWhatsapp).toBe(false)
  })

  it('cancelado: assinaturaAtiva=false', async () => {
    mockSupabase({ id: '1', user_id: 'u1', plano: 'completo', status: 'cancelado', trial_fim: '2026-01-01', stripe_customer_id: null, stripe_subscription_id: null, criado_em: '', atualizado_em: '' })
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinaturaAtiva).toBe(false)
  })

  it('null assinatura: treats as inadimplente', async () => {
    mockSupabase(null)
    const { result } = renderHook(() => useAssinatura())
    await vi.waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.assinatura).toBeNull()
    expect(result.current.assinaturaAtiva).toBe(false)
    expect(result.current.podUsarWhatsapp).toBe(false)
  })
})
