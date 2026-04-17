import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SessaoView } from '@/lib/types'

export function useSessoesDia(data: string) {
  const [sessoes, setSessoes] = useState<SessaoView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchSessoes() {
    setLoading(true)
    setError(null)
    const inicio = `${data}T00:00:00`
    const fim = `${data}T23:59:59`
    const { data: rows, error: err } = await supabase
      .from('sessoes')
      .select('*, modalidades(nome), pacientes(nome)')
      .gte('data_hora', inicio)
      .lt('data_hora', fim)
      .order('data_hora')

    if (err) {
      setError(err.message)
      setSessoes([])
    } else {
      setSessoes((rows ?? []) as SessaoView[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchSessoes()
  }, [data])

  return { sessoes, loading, error, refetch: fetchSessoes }
}
