import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Assinatura } from '@/lib/types'

export function useAssinatura() {
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchAssinatura = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error: sbError } = await supabase
        .from('assinaturas')
        .select('*')
        .limit(1)
        .single()
      if (sbError && sbError.code !== 'PGRST116') {
        setError(new Error(sbError.message))
      } else {
        setError(null)
      }
      setAssinatura(data as Assinatura | null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAssinatura() }, [fetchAssinatura])

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
    error,
    isTrialAtivo,
    diasRestantesTrial,
    podUsarWhatsapp,
    assinaturaAtiva,
    refetch: fetchAssinatura,
  }
}
