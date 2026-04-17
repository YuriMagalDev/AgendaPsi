// src/hooks/useDespesas.ts
import { useState, useEffect } from 'react'
import { startOfMonth, format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { Despesa } from '@/lib/types'

export function useDespesas(mes: Date) {
  const [despesas, setDespesas] = useState<Despesa[]>([])
  const [loading, setLoading] = useState(true)
  const mesStr = format(startOfMonth(mes), 'yyyy-MM-dd')

  async function fetchDespesas() {
    setLoading(true)
    const { data } = await supabase
      .from('despesas')
      .select('*')
      .eq('mes', mesStr)
      .order('criado_em')
    setDespesas((data ?? []) as Despesa[])
    setLoading(false)
  }

  useEffect(() => { fetchDespesas() }, [mes.getFullYear(), mes.getMonth()])

  async function addDespesa(descricao: string, valor: number) {
    await supabase.from('despesas').insert({ mes: mesStr, descricao, valor })
    await fetchDespesas()
  }

  async function removeDespesa(id: string) {
    await supabase.from('despesas').delete().eq('id', id)
    await fetchDespesas()
  }

  const total = despesas.reduce((s, d) => s + d.valor, 0)

  return { despesas, loading, total, addDespesa, removeDespesa }
}
