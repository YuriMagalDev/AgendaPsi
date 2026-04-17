import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { NotificacaoConfirmacao } from '@/lib/types'

export function useNotificacoes() {
  const [notificacoes, setNotificacoes] = useState<NotificacaoConfirmacao[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchNotificacoes() {
    const { data, error: err } = await supabase
      .from('confirmacoes_whatsapp')
      .select('*, sessoes(data_hora, paciente_id, avulso_nome, pacientes(nome))')
      .not('confirmado', 'is', null)
      .eq('lida', false)
      .order('mensagem_enviada_em', { ascending: false })

    if (err) setError(err.message)
    else setNotificacoes((data ?? []) as NotificacaoConfirmacao[])
    setLoading(false)
  }

  async function marcarLidas(ids: string[]) {
    if (ids.length === 0) return
    await supabase.from('confirmacoes_whatsapp').update({ lida: true }).in('id', ids)
    setNotificacoes(prev => prev.filter(n => !ids.includes(n.id)))
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

  return { notificacoes, count: notificacoes.length, loading, error, marcarLidas }
}
