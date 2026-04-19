import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ModalidadeSessao } from '@/lib/types'

export function useModalidadesSessao() {
  const [modalidadesSessao, setModalidadesSessao] = useState<ModalidadeSessao[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchModalidadesSessao() {
    const { data } = await supabase
      .from('modalidades_sessao')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    setModalidadesSessao(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchModalidadesSessao()
  }, [])

  async function addModalidadeSessao(nome: string, emoji: string): Promise<void> {
    const { error } = await supabase
      .from('modalidades_sessao')
      .insert({ nome: nome.trim(), emoji: emoji.trim(), ativo: true })
    if (error) throw error
    await fetchModalidadesSessao()
  }

  async function toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase
      .from('modalidades_sessao')
      .update({ ativo })
      .eq('id', id)
    if (error) throw error
    await fetchModalidadesSessao()
  }

  return { modalidadesSessao, loading, addModalidadeSessao, toggleAtivo }
}
