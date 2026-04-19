import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SessaoStatus, SessaoView } from '@/lib/types'

export type KanbanColunas = Record<SessaoStatus, SessaoView[]>

const STATUSES: SessaoStatus[] = ['agendada', 'confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada']

function groupByStatus(sessoes: SessaoView[]): KanbanColunas {
  const empty = Object.fromEntries(STATUSES.map(s => [s, []])) as KanbanColunas
  return sessoes.reduce((acc, s) => {
    acc[s.status].push(s)
    return acc
  }, empty)
}

export function useKanban() {
  const [colunas, setColunas] = useState<KanbanColunas>(groupByStatus([]))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchAll() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('sessoes')
      .select('*, modalidades_sessao(nome, emoji), meios_atendimento(nome, emoji), pacientes(nome)')
      .order('data_hora')

    if (err) {
      setError(err.message)
    } else {
      setColunas(groupByStatus((data ?? []) as SessaoView[]))
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchAll()

    const channel = supabase
      .channel('kanban-sessoes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessoes' }, fetchAll)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  async function updateStatus(id: string, status: SessaoStatus, remarcada_para?: string) {
    const patch: Record<string, unknown> = { status }
    if (remarcada_para) patch.remarcada_para = remarcada_para
    const { error: err } = await supabase.from('sessoes').update(patch).eq('id', id)
    if (err) throw err
    await fetchAll()
  }

  return { colunas, loading, error, updateStatus, refetch: fetchAll }
}
