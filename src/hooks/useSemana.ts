import { useState, useEffect } from 'react'
import { addDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { SessaoView } from '@/lib/types'

export function useSemana(weekStart: Date) {
  const [sessoes, setSessoes] = useState<SessaoView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchSemana() {
    setLoading(true)
    const fim = addDays(weekStart, 7)
    const { data, error: err } = await supabase
      .from('sessoes')
      .select('*, modalidades_sessao(nome, emoji), meios_atendimento(nome, emoji), pacientes(nome)')
      .gte('data_hora', weekStart.toISOString())
      .lt('data_hora', fim.toISOString())
      .order('data_hora')
    if (err) setError(err.message)
    else setSessoes((data ?? []) as SessaoView[])
    setLoading(false)
  }

  useEffect(() => {
    fetchSemana()
    const ch = supabase
      .channel('semana-' + weekStart.getTime())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessoes' }, fetchSemana)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [weekStart.getTime()])

  return { sessoes, loading, error, refetch: fetchSemana }
}
