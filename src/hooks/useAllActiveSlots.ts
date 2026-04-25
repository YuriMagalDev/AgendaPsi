import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SlotConflictInput } from '@/lib/conflictCheck'

export function useAllActiveSlots() {
  const [slots, setSlots] = useState<SlotConflictInput[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('slots_semanais')
        .select('id, dia_semana, horario, duracao_minutos')
        .eq('ativo', true)
      setSlots((data ?? []) as SlotConflictInput[])
      setLoading(false)
    }
    fetch()
  }, [])

  return { slots, loading }
}
