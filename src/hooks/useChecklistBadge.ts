import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'

export function useChecklistBadge() {
  const [hasPending, setHasPending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      const today = format(new Date(), 'yyyy-MM-dd')
      const { data: configData } = await supabase
        .from('config_psicologo')
        .select('horario_checklist')
        .limit(1)
        .single()

      const horario = configData?.horario_checklist ?? '18:00'
      const [h, m] = horario.split(':').map(Number)
      const now = new Date()
      const checklistTime = new Date(now)
      checklistTime.setHours(h, m, 0, 0)

      if (now < checklistTime) {
        setHasPending(false)
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('sessoes')
        .select('id')
        .gte('data_hora', `${today}T00:00:00`)
        .lte('data_hora', `${today}T23:59:59`)
        .in('status', ['agendada', 'confirmada'])

      setHasPending((data ?? []).length > 0)
      setLoading(false)
    }

    check()
  }, [])

  return { hasPending, loading }
}
