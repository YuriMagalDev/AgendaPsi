// src/hooks/useConvenios.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Convenio } from '@/lib/types'

export function useConvenios() {
  const [convenios, setConvenios] = useState<Convenio[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchConvenios() {
    const { data } = await supabase
      .from('convenios')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    setConvenios((data ?? []) as Convenio[])
    setLoading(false)
  }

  useEffect(() => { fetchConvenios() }, [])

  async function addConvenio(nome: string, valor_sessao: number | null) {
    await supabase.from('convenios').insert({ nome, valor_sessao, ativo: true })
    await fetchConvenios()
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from('convenios').update({ ativo }).eq('id', id)
    await fetchConvenios()
  }

  async function updateValor(id: string, valor_sessao: number | null) {
    await supabase.from('convenios').update({ valor_sessao }).eq('id', id)
    await fetchConvenios()
  }

  return { convenios, loading, addConvenio, toggleAtivo, updateValor }
}
