// src/hooks/useFinanceiroPaciente.ts
import { useState, useEffect } from 'react'
import { startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'
import type { PacienteComConvenio, SessaoComModalidade } from '@/lib/types'

export function useFinanceiroPaciente(pacienteId: string, mes: Date) {
  const [paciente, setPaciente] = useState<PacienteComConvenio | null>(null)
  const [sessoesMes, setSessoesMes] = useState<SessaoComModalidade[]>([])
  const [totalHistorico, setTotalHistorico] = useState(0)
  const [totalPendente, setTotalPendente] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pacienteId) return
    setLoading(true)

    const inicio = startOfMonth(mes).toISOString()
    const fim = endOfMonth(mes).toISOString()

    Promise.all([
      supabase
        .from('pacientes')
        .select('*, convenios(nome, valor_sessao)')
        .eq('id', pacienteId)
        .single(),
      supabase
        .from('sessoes')
        .select('*, modalidades(nome)')
        .eq('paciente_id', pacienteId)
        .gte('data_hora', inicio)
        .lte('data_hora', fim)
        .order('data_hora', { ascending: false }),
      supabase
        .from('sessoes')
        .select('valor_cobrado, pago, status')
        .eq('paciente_id', pacienteId)
        .order('data_hora'),
    ]).then(([{ data: pac, error: pacErr }, { data: mes_, error: mesErr }, { data: all }]) => {
      if (pacErr || mesErr) {
        setError((pacErr ?? mesErr)!.message)
      } else {
        setPaciente(pac as PacienteComConvenio)
        setSessoesMes((mes_ ?? []) as SessaoComModalidade[])
        const hist = (all ?? [])
          .filter((s: any) => s.status === 'concluida' && s.pago)
          .reduce((sum: number, s: any) => sum + (s.valor_cobrado ?? 0), 0)
        const pend = (all ?? [])
          .filter((s: any) => s.status === 'concluida' && !s.pago)
          .reduce((sum: number, s: any) => sum + (s.valor_cobrado ?? 0), 0)
        setTotalHistorico(hist)
        setTotalPendente(pend)
      }
      setLoading(false)
    })
  }, [pacienteId, mes.getFullYear(), mes.getMonth()])

  return { paciente, sessoesMes, totalHistorico, totalPendente, loading, error }
}
