import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ConfigPsicologo } from '@/lib/types'

export function useConfigPsicologo() {
  const [config, setConfig] = useState<ConfigPsicologo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('config_psicologo').select('*').limit(1)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setConfig((data?.[0] as ConfigPsicologo) ?? null)
        setLoading(false)
      })
  }, [])

  return { config, loading, error }
}
