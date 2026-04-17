import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { NotificacaoConfirmacao } from '@/lib/types'

export function useNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<NotificacaoConfirmacao[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchNotificacoes() {
    const { data } = await supabase
      .from('confirmacoes_whatsapp')
      .select('*, sessoes(data_hora, paciente_id, avulso_nome, pacientes(nome))')
      .not('confirmado', 'is', null)
      .eq('lida', false)
      .order('mensagem_enviada_em', { ascending: false })

    setNotificacoes((data ?? []) as NotificacaoConfirmacao[])
    setLoading(false)
  }

  async function marcarLidas(ids: string[]) {
    if (ids.length === 0) return
    await supabase.from('confirmacoes_whatsapp').update({ lida: true }).in('id', ids)
    setNotificacoes([])
  }

  useEffect(() => {
    fetchNotificacoes()

    const channel = supabase
      .channel('notificacoes-confirmacoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'confirmacoes_whatsapp' }, fetchNotificacoes)
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return { notificacoes, count: notificacoes.length, loading, marcarLidas }
}
