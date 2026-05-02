import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { PacienteEmRisco, RiscoConfig } from '@/lib/types'

type Config = Pick<RiscoConfig, 'min_cancelamentos_seguidos' | 'dias_sem_sessao' | 'dias_apos_falta_sem_agendamento'>

export function usePacientesEmRisco(config: Config | null) {
  const [pacientes, setPacientes] = useState<PacienteEmRisco[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refetch() {
    if (!config) return
    setLoading(true)
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Não autenticado')
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase.rpc('get_pacientes_em_risco', {
      p_user_id:           user.id,
      p_min_cancelamentos: config.min_cancelamentos_seguidos,
      p_dias_sem_sessao:   config.dias_sem_sessao,
      p_dias_apos_falta:   config.dias_apos_falta_sem_agendamento,
    })
    if (err) {
      setError(err.message)
    } else {
      setPacientes((data ?? []) as PacienteEmRisco[])
    }
    setLoading(false)
  }

  useEffect(() => {
    refetch()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.min_cancelamentos_seguidos, config?.dias_sem_sessao, config?.dias_apos_falta_sem_agendamento])

  return { pacientes, loading, error, refetch }
}
