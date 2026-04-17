import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Modalidade } from '@/lib/types'

export function useModalidades() {
  const [modalidades, setModalidades] = useState<Modalidade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('modalidades')
      .select('*')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => {
        setModalidades(data ?? [])
        setLoading(false)
      })
  }, [])

  return { modalidades, loading }
}
