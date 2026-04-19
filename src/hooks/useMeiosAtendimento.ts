import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { MeioAtendimento } from '@/lib/types'

export function useMeiosAtendimento() {
  const [meiosAtendimento, setMeiosAtendimento] = useState<MeioAtendimento[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchMeiosAtendimento() {
    const { data } = await supabase
      .from('meios_atendimento')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    setMeiosAtendimento(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchMeiosAtendimento()
  }, [])

  async function addMeioAtendimento(nome: string, emoji: string): Promise<void> {
    const { error } = await supabase
      .from('meios_atendimento')
      .insert({ nome: nome.trim(), emoji: emoji.trim(), ativo: true })
    if (error) throw error
    await fetchMeiosAtendimento()
  }

  async function toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase
      .from('meios_atendimento')
      .update({ ativo })
      .eq('id', id)
    if (error) throw error
    await fetchMeiosAtendimento()
  }

  return { meiosAtendimento, loading, addMeioAtendimento, toggleAtivo }
}
