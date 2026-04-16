import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Paciente, ContratoTipo } from '@/lib/types'

export interface CreatePacienteInput {
  nome: string
  telefone?: string
  email?: string
  data_nascimento?: string
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number
    dia_vencimento?: number
  }
}

export function usePacientes() {
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchPacientes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pacientes')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    if (error) {
      setError(error.message)
      setPacientes([])
    } else {
      setPacientes(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPacientes()
  }, [])

  async function createPaciente(input: CreatePacienteInput): Promise<string> {
    const { data: paciente, error: pacienteError } = await supabase
      .from('pacientes')
      .insert({
        nome: input.nome,
        telefone: input.telefone ?? null,
        email: input.email ?? null,
        data_nascimento: input.data_nascimento ?? null,
      })
      .select('id')
      .single()

    if (pacienteError) throw pacienteError

    if (input.contrato) {
      const { error: contratoError } = await supabase
        .from('contratos')
        .insert({
          paciente_id: paciente.id,
          tipo: input.contrato.tipo,
          valor: input.contrato.valor,
          qtd_sessoes: input.contrato.qtd_sessoes ?? null,
          dia_vencimento: input.contrato.dia_vencimento ?? null,
          ativo: true,
        })
      if (contratoError) throw contratoError
    }

    await fetchPacientes()
    return paciente.id
  }

  async function arquivarPaciente(id: string): Promise<void> {
    const { error } = await supabase
      .from('pacientes')
      .update({ ativo: false })
      .eq('id', id)

    if (error) throw error
    await fetchPacientes()
  }

  return { pacientes, loading, error, createPaciente, arquivarPaciente }
}
