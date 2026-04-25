import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { gerarSessoesParaSlot } from '../sessaoUtils'

// Fix system time to Monday 2026-04-27 09:00 UTC
const FIXED_NOW = new Date('2026-04-27T09:00:00.000Z')

describe('gerarSessoesParaSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('generates semanal sessions (intervalo=1): one per week', () => {
    const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1, duracao_minutos: 50 }
    const result = gerarSessoesParaSlot('pac-1', 'mod-1', 'meio-1', slot, 4)
    expect(result).toHaveLength(4)
    const diff = new Date(result[1].data_hora).getTime() - new Date(result[0].data_hora).getTime()
    expect(diff).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it('generates quinzenal sessions (intervalo=2): ceil(4/2)=2 total', () => {
    const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 2, duracao_minutos: 50 }
    const result = gerarSessoesParaSlot('pac-1', 'mod-1', 'meio-1', slot, 4)
    expect(result).toHaveLength(2)
    const diff = new Date(result[1].data_hora).getTime() - new Date(result[0].data_hora).getTime()
    expect(diff).toBe(14 * 24 * 60 * 60 * 1000)
  })

  it('uses provided modalidade and meio', () => {
    const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1, duracao_minutos: 50 }
    const result = gerarSessoesParaSlot('pac-1', 'mod-xyz', 'meio-xyz', slot, 1)
    expect(result[0].modalidade_sessao_id).toBe('mod-xyz')
    expect(result[0].meio_atendimento_id).toBe('meio-xyz')
  })

  it('marks sessions pago=true when is_pacote=true', () => {
    const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: true, intervalo_semanas: 1, duracao_minutos: 50 }
    const result = gerarSessoesParaSlot('pac-1', 'mod-1', 'meio-1', slot, 1)
    expect(result[0].pago).toBe(true)
    expect(result[0].data_pagamento).not.toBeNull()
  })

  it('uses slot.duracao_minutos on generated sessions', () => {
    const slot = { nome: 'S', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1, duracao_minutos: 90 }
    const result = gerarSessoesParaSlot('pac-1', 'mod-1', 'meio-1', slot, 1)
    expect(result[0].duracao_minutos).toBe(90)
  })
})
