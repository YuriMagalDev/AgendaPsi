import { describe, it, expectTypeOf, expect } from 'vitest'
import type { Paciente, Sessao, SessaoStatus, SlotSemanalInput } from '@/lib/types'

describe('Database types', () => {
  it('SessaoStatus covers all values', () => {
    const status: SessaoStatus = 'agendada'
    expectTypeOf(status).toEqualTypeOf<SessaoStatus>()
  })

  it('Paciente id is string (uuid)', () => {
    expectTypeOf<Paciente['id']>().toBeString()
  })

  it('Sessao paciente_id is nullable', () => {
    expectTypeOf<Sessao['paciente_id']>().toEqualTypeOf<string | null>()
  })

  it('SlotSemanalInput has intervalo_semanas and no modality fields', () => {
    const input: SlotSemanalInput = {
      nome: 'Sessão semanal',
      dia_semana: 1,
      horario: '09:00',
      is_pacote: false,
      intervalo_semanas: 2,
    }
    expect(input.intervalo_semanas).toBe(2)
  })
})
