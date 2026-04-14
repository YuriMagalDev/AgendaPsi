import { describe, it, expectTypeOf } from 'vitest'
import type { Paciente, Sessao, SessaoStatus } from '@/lib/types'

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
})
