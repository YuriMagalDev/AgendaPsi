import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Assinatura } from '@/lib/types'

export function useAssinatura() {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchAssinatura() {
    const { data } = await supabase
      .from('assinaturas')
      .select('*')
      .limit(1)
      .single()
    setAssinatura(data as Assinatura | null)
    setLoading(false)
  }

  useEffect(() => { fetchAssinatura() }, [])

  const hoje = new Date()
  const trialFim = assinatura?.trial_fim ? new Date(assinatura.trial_fim) : null

  const isTrialAtivo =
    assinatura?.status === 'trial' &&
    trialFim !== null &&
    trialFim >= hoje

  const diasRestantesTrial = isTrialAtivo && trialFim
    ? Math.max(0, Math.ceil((trialFim.getTime() - hoje.getTime()) / 86_400_000))
    : 0

  const podUsarWhatsapp =
    assinatura?.plano === 'completo' &&
    (assinatura?.status === 'ativo' || isTrialAtivo)

  const assinaturaAtiva =
    assinatura?.status === 'ativo' || isTrialAtivo

  return {
    assinatura,
    loading,
    isTrialAtivo,
    diasRestantesTrial,
    podUsarWhatsapp,
    assinaturaAtiva,
    refetch: fetchAssinatura,
  }
}
