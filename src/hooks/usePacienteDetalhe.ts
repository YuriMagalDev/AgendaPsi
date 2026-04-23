import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Paciente, Contrato, SessaoView } from '@/lib/types'

interface Stats {
  total: number
  concluidas: number
  faltas: number
  totalPago: number
}

export function usePacienteDetalhe(id: string) {
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [sessoes, setSessoes] = useState<SessaoView[]>([])
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    async function fetchAll() {
      try {
        const [pacienteRes, sessoesRes, contratoRes] = await Promise.all([
          supabase.from('pacientes').select('*').eq('id', id).single(),
          supabase
            .from('sessoes')
            .select('*, modalidades_sessao(nome, emoji), meios_atendimento(nome, emoji)')
            .eq('paciente_id', id)
            .order('data_hora', { ascending: false }),
          supabase
            .from('contratos')
            .select('*')
            .eq('paciente_id', id)
            .eq('ativo', true)
            .maybeSingle(),
        ])

        if (pacienteRes.error) {
          setError(pacienteRes.error.message)
          return
        }
        if (sessoesRes.error) {
          setError(sessoesRes.error.message)
          return
        }
        if (contratoRes.error) {
          setError(contratoRes.error.message)
          return
        }

        setError(null)
        setPaciente(pacienteRes.data)
        setSessoes((sessoesRes.data ?? []) as SessaoView[])
        setContrato(contratoRes.data)
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [id])

  const stats: Stats = {
    total: sessoes.length,
    concluidas: sessoes.filter(s => s.status === 'concluida').length,
    faltas: sessoes.filter(s => s.status === 'faltou').length,
    totalPago: sessoes
      .filter(s => s.pago)
      .reduce((sum, s) => sum + (s.valor_cobrado ?? 0), 0),
  }

  async function arquivar(): Promise<void> {
    const { error } = await supabase
      .from('pacientes')
      .update({ ativo: false })
      .eq('id', id)
    if (error) throw error
    setPaciente(prev => prev ? { ...prev, ativo: false } : null)
  }

  return { paciente, sessoes, contrato, stats, loading, error, arquivar }
}
