import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { RiscoConfig } from '@/lib/types'

const DEFAULTS = {
  min_cancelamentos_seguidos: 2,
  dias_sem_sessao: 30,
  dias_apos_falta_sem_agendamento: 7,
}

async function fetchOrCreateConfig(): Promise<RiscoConfig> {
  const { data, error: err } = await supabase
    .from('risco_config')
    .select('*')
    .single()

  if (err && err.code !== 'PGRST116') throw new Error(err.message)

  if (!data) {
    const { data: created, error: createErr } = await supabase
      .from('risco_config')
      .insert(DEFAULTS)
      .select()
      .single()
    if (createErr) throw new Error(createErr.message)
    return created as RiscoConfig
  }

  return data as RiscoConfig
}

export function useRiscoConfig() {
  const [config, setConfig] = useState<RiscoConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const configRef = useRef<RiscoConfig | null>(null)

  function applyConfig(c: RiscoConfig) {
    configRef.current = c
    setConfig(c)
  }

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchOrCreateConfig()
      applyConfig(result)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const update = useCallback(async (patch: Partial<Pick<RiscoConfig,
    'min_cancelamentos_seguidos' | 'dias_sem_sessao' | 'dias_apos_falta_sem_agendamento'
  >>): Promise<void> => {
    let current = configRef.current
    if (!current?.id) {
      // Config not yet loaded — fetch it first
      current = await fetchOrCreateConfig()
      applyConfig(current)
    }
    const { data, error: err } = await supabase
      .from('risco_config')
      .update(patch)
      .eq('id', current.id)
      .select()
      .single()
    if (err) { setError(err.message); throw new Error(err.message) }
    applyConfig(data as RiscoConfig)
  }, [])

  useEffect(() => { refetch() }, [refetch])

  return { config, loading, error, update, refetch }
}
