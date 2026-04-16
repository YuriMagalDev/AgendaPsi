import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Paciente, Contrato, SessaoComModalidade } from '@/lib/types'

interface Stats {
  total: number
  concluidas: number
  faltas: number
  totalPago: number
}

export function usePacienteDetalhe(id: string) {
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [sessoes, setSessoes] = useState<SessaoComModalidade[]>([])
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    async function fetchAll() {
      const [pacienteRes, sessoesRes, contratoRes] = await Promise.all([
        supabase.from('pacientes').select('*').eq('id', id).single(),
        supabase
          .from('sessoes')
          .select('*, modalidades(nome)')
          .eq('paciente_id', id)
          .order('data_hora', { ascending: false }),
        supabase
          .from('contratos')
          .select('*')
          .eq('paciente_id', id)
          .eq('ativo', true)
          .maybeSingle(),
      ])

      setPaciente(pacienteRes.data)
      setSessoes((sessoesRes.data ?? []) as SessaoComModalidade[])
      setContrato(contratoRes.data)
      setLoading(false)
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
  }

  return { paciente, sessoes, contrato, stats, loading, arquivar }
}
