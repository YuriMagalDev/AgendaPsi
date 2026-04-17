import { useState, useEffect } from 'react'
import { startOfMonth, endOfMonth } from 'date-fns'
import { supabase } from '@/lib/supabase'

export interface SemanaData {
  label: string
  concluida: number
  faltou: number
  cancelada: number
  agendada: number
}

export interface PacienteFinanceiro {
  paciente_id: string | null
  avulso_nome: string | null
  nome: string
  tipo: 'particular' | 'convenio' | null
  convenio_nome: string | null
  sessoes: number
  recebido: number
  pendente: number
  ultima_sessao: string | null
}

export interface DadosFinanceiro {
  recebido: number
  pendente: number
  projecao: number
  totalSessoes: number
  semanas: SemanaData[]
  pacientes: PacienteFinanceiro[]
}

function calcularDados(sessoes: any[], mes: Date): DadosFinanceiro {
  let recebido = 0
  let pendente = 0
  let projecaoExtra = 0
  const semanas: SemanaData[] = [
    { label: 'S1', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
    { label: 'S2', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
    { label: 'S3', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
    { label: 'S4', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
  ]
  const pacienteMap = new Map<string, PacienteFinanceiro>()

  for (const s of sessoes) {
    const dia = new Date(s.data_hora).getDate()
    const idx = Math.min(Math.floor((dia - 1) / 7), 3)
    const valor = s.valor_cobrado ?? 0
    const key = s.paciente_id ?? `avulso:${s.avulso_nome}`

    if (s.status === 'concluida') {
      semanas[idx].concluida++
      if (s.pago) recebido += valor
      else pendente += valor
    } else if (s.status === 'faltou') {
      semanas[idx].faltou++
    } else if (s.status === 'cancelada') {
      semanas[idx].cancelada++
    } else if (s.status === 'agendada' || s.status === 'confirmada') {
      semanas[idx].agendada++
      projecaoExtra += valor
    }

    if (!pacienteMap.has(key)) {
      const nome = s.pacientes?.nome ?? s.avulso_nome ?? 'Avulso'
      pacienteMap.set(key, {
        paciente_id: s.paciente_id,
        avulso_nome: s.avulso_nome,
        nome,
        tipo: s.pacientes?.tipo ?? null,
        convenio_nome: s.pacientes?.convenios?.nome ?? null,
        sessoes: 0,
        recebido: 0,
        pendente: 0,
        ultima_sessao: null,
      })
    }
    const p = pacienteMap.get(key)!
    p.sessoes++
    if (s.status === 'concluida' && s.pago) p.recebido += valor
    if (s.status === 'concluida' && !s.pago) p.pendente += valor
    if (!p.ultima_sessao || s.data_hora > p.ultima_sessao) p.ultima_sessao = s.data_hora
  }

  const pacientes = Array.from(pacienteMap.values())
    .sort((a, b) => b.recebido - a.recebido)

  return {
    recebido,
    pendente,
    projecao: recebido + pendente + projecaoExtra,
    totalSessoes: sessoes.filter(s => s.status !== 'cancelada' && s.status !== 'remarcada').length,
    semanas,
    pacientes,
  }
}

export function useFinanceiro(mes: Date) {
  const [dados, setDados] = useState<DadosFinanceiro>({
    recebido: 0, pendente: 0, projecao: 0, totalSessoes: 0, semanas: [
      { label: 'S1', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
      { label: 'S2', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
      { label: 'S3', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
      { label: 'S4', concluida: 0, faltou: 0, cancelada: 0, agendada: 0 },
    ], pacientes: [],
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const inicio = startOfMonth(mes).toISOString()
    const fim = endOfMonth(mes).toISOString()
    supabase
      .from('sessoes')
      .select('*, pacientes(nome, tipo, convenio_id, convenios(nome))')
      .gte('data_hora', inicio)
      .lte('data_hora', fim)
      .order('data_hora')
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setDados(calcularDados(data ?? [], mes))
        setLoading(false)
      })
  }, [mes.getFullYear(), mes.getMonth()])

  return { dados, loading, error }
}
