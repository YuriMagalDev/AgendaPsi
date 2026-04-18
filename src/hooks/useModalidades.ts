import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Modalidade } from '@/lib/types'

export function useModalidades() {
  const [modalidades, setModalidades] = useState<Modalidade[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchModalidades() {
    const { data } = await supabase
      .from('modalidades')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    setModalidades(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchModalidades()
  }, [])

  async function addModalidade(nome: string): Promise<void> {
    const { error } = await supabase
      .from('modalidades')
      .insert({ nome: nome.trim(), ativo: true })
    if (error) throw error
    await fetchModalidades()
  }

  async function toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase
      .from('modalidades')
      .update({ ativo })
      .eq('id', id)
    if (error) throw error
    await fetchModalidades()
  }

  return { modalidades, loading, addModalidade, toggleAtivo }
}
