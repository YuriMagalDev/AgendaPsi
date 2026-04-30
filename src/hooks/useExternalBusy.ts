import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SessionsExternalBusy } from '@/lib/types'

export function useExternalBusy(desde: Date, ate: Date) {
  const [busy, setBusy] = useState<SessionsExternalBusy[]>([])

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('sessions_external_busy')
        .select('*')
        .lte('data_hora_inicio', ate.toISOString())
        .gte('data_hora_fim',    desde.toISOString())
        .order('data_hora_inicio')

      setBusy((data as SessionsExternalBusy[]) ?? [])
    }
    fetch()
  }, [desde.toISOString(), ate.toISOString()])

  return busy
}
