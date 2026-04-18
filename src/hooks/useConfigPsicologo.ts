import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ConfigPsicologo } from '@/lib/types'

export function useConfigPsicologo() {
  const [config, setConfig] = useState<ConfigPsicologo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchConfig() {
    const { data, error: err } = await supabase.from('config_psicologo').select('*').limit(1)
    if (err) setError(err.message)
    else setConfig((data?.[0] as ConfigPsicologo) ?? null)
    setLoading(false)
  }

  useEffect(() => { fetchConfig() }, [])

  async function updateConfig(patch: Partial<Pick<ConfigPsicologo, 'nome' | 'horario_inicio' | 'horario_fim' | 'automacao_whatsapp_ativa'>>): Promise<void> {
    if (!config?.id) throw new Error('Config não carregada')
    const { data, error: err } = await supabase
      .from('config_psicologo')
      .update(patch)
      .eq('id', config.id)
      .select('*')
      .single()
    if (err) throw err
    setConfig(data as ConfigPsicologo)
  }

  return { config, loading, error, updateConfig, refetch: fetchConfig }
}
