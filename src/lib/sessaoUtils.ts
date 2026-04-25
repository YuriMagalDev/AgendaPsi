import { startOfDay, getDay, nextDay, addWeeks, setHours, setMinutes } from 'date-fns'
import type { Day } from 'date-fns'
import type { SessaoStatus } from './types'

export interface SlotInput {
  nome: string
  dia_semana: number
  horario: string
  is_pacote: boolean
  intervalo_semanas: number
  duracao_minutos: number
}

export function gerarSessoesParaSlot(
  pacienteId: string,
  modalidadeSessaoId: string,
  meioAtendimentoId: string,
  slot: SlotInput,
  semanas = 8,
) {
  const hoje = startOfDay(new Date())
  const [hh, mm] = slot.horario.split(':').map(Number)
  const dia = slot.dia_semana as Day
  const inicio = getDay(hoje) === dia ? hoje : nextDay(hoje, dia)
  const intervalo = slot.intervalo_semanas
  const count = Math.ceil(semanas / intervalo)
  const pagoAutomatico = slot.is_pacote

  return Array.from({ length: count }, (_, i) => {
    const base = addWeeks(inicio, i * intervalo)
    return {
      paciente_id: pacienteId,
      avulso_nome: null as null,
      avulso_telefone: null as null,
      modalidade_sessao_id: modalidadeSessaoId,
      meio_atendimento_id: meioAtendimentoId,
      data_hora: setMinutes(setHours(base, hh), mm).toISOString(),
      status: 'agendada' as SessaoStatus,
      valor_cobrado: null as null,
      pago: pagoAutomatico,
      data_pagamento: pagoAutomatico ? new Date().toISOString() : null,
      sessao_origem_id: null as null,
      duracao_minutos: slot.duracao_minutos,
    }
  })
}
