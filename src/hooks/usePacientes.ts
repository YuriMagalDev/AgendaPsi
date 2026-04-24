import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { PacienteComConvenio, ContratoTipo } from '@/lib/types'

export interface CreatePacienteInput {
  nome: string
  telefone?: string
  email?: string
  data_nascimento?: string
  tipo?: 'particular' | 'convenio'
  convenio_id?: string
  modalidade_sessao_id: string
  meio_atendimento_id: string
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number
    dia_vencimento?: number
  }
}

export interface UpdatePacienteInput {
  nome?: string
  telefone?: string | null
  email?: string | null
  data_nascimento?: string | null
  tipo?: 'particular' | 'convenio'
  convenio_id?: string | null
  modalidade_sessao_id?: string
  meio_atendimento_id?: string
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number | null
    dia_vencimento?: number | null
  } | null
}

export function usePacientes(opts?: { ativoOnly?: boolean }) {
  const ativoOnly = opts?.ativoOnly ?? true
  const [pacientes, setPacientes] = useState<PacienteComConvenio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchPacientes() {
    setLoading(true)
    let q = supabase
      .from('pacientes')
      .select('*, convenios(nome, valor_sessao), modalidades_sessao(nome, emoji), meios_atendimento(nome, emoji), contratos(tipo, ativo)')
    if (ativoOnly) q = q.eq('ativo', true)
    const { data, error } = await q.order('nome')

    if (error) {
      setError(error.message)
      setPacientes([])
    } else {
      setPacientes((data as PacienteComConvenio[]) ?? [])
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
        tipo: input.tipo ?? 'particular',
        convenio_id: input.convenio_id ?? null,
        modalidade_sessao_id: input.modalidade_sessao_id,
        meio_atendimento_id: input.meio_atendimento_id,
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

  async function updatePaciente(id: string, input: UpdatePacienteInput): Promise<void> {
    const patch: Record<string, unknown> = {}
    if (input.nome !== undefined) patch.nome = input.nome
    if (input.telefone !== undefined) patch.telefone = input.telefone
    if (input.email !== undefined) patch.email = input.email
    if (input.data_nascimento !== undefined) patch.data_nascimento = input.data_nascimento
    if (input.tipo !== undefined) patch.tipo = input.tipo
    if (input.convenio_id !== undefined) patch.convenio_id = input.convenio_id
    if (input.modalidade_sessao_id !== undefined) patch.modalidade_sessao_id = input.modalidade_sessao_id
    if (input.meio_atendimento_id !== undefined) patch.meio_atendimento_id = input.meio_atendimento_id

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('pacientes').update(patch).eq('id', id)
      if (error) throw error
    }

    if (input.contrato !== undefined) {
      await supabase.from('contratos').update({ ativo: false }).eq('paciente_id', id)
      if (input.contrato !== null) {
        const { error } = await supabase.from('contratos').insert({
          paciente_id: id,
          tipo: input.contrato.tipo,
          valor: input.contrato.valor,
          qtd_sessoes: input.contrato.qtd_sessoes ?? null,
          dia_vencimento: input.contrato.dia_vencimento ?? null,
          ativo: true,
        })
        if (error) throw error
      }
    }

    await fetchPacientes()
  }

  async function arquivarPaciente(id: string): Promise<void> {
    const { error } = await supabase
      .from('pacientes')
      .update({ ativo: false })
      .eq('id', id)

    if (error) throw error
    await fetchPacientes()
  }

  return { pacientes, loading, error, createPaciente, updatePaciente, arquivarPaciente }
}
