import { describe, it, expect } from 'vitest'
import { filterSessoes } from '../filterSessoes'
import type { SessaoView } from '../types'

function makeSessao(overrides: Partial<SessaoView> = {}): SessaoView {
  return {
    id: '1',
    paciente_id: 'p1',
    avulso_nome: null,
    avulso_telefone: null,
    modalidade_sessao_id: 'mod-1',
    meio_atendimento_id: 'meio-1',
    data_hora: '2026-04-23T14:00:00',
    status: 'agendada',
    valor_cobrado: null,
    pago: false,
    forma_pagamento: null,
    data_pagamento: null,
    sessao_origem_id: null,
    duracao_minutos: 50,
    notas_checklist: null,
    criado_em: '2026-01-01',
    pacientes: { nome: 'João Silva' },
    modalidades_sessao: null,
    meios_atendimento: null,
    ...overrides,
  }
}

describe('filterSessoes', () => {
  it('returns all when filters empty', () => {
    const sessoes = [makeSessao(), makeSessao({ id: '2' })]
    expect(filterSessoes(sessoes, { search: '', modalidadeId: '' })).toHaveLength(2)
  })

  it('filters by patient name — case insensitive', () => {
    const sessoes = [
      makeSessao({ pacientes: { nome: 'João Silva' } }),
      makeSessao({ id: '2', pacientes: { nome: 'Maria Santos' } }),
    ]
    const result = filterSessoes(sessoes, { search: 'joão', modalidadeId: '' })
    expect(result).toHaveLength(1)
    expect(result[0].pacientes?.nome).toBe('João Silva')
  })

  it('filters avulso session by avulso_nome', () => {
    const sessoes = [
      makeSessao({ paciente_id: null, pacientes: undefined, avulso_nome: 'Pedro Avulso' }),
    ]
    expect(filterSessoes(sessoes, { search: 'pedro', modalidadeId: '' })).toHaveLength(1)
  })

  it('filters by modalidadeId', () => {
    const sessoes = [
      makeSessao({ modalidade_sessao_id: 'mod-1' }),
      makeSessao({ id: '2', modalidade_sessao_id: 'mod-2' }),
    ]
    const result = filterSessoes(sessoes, { search: '', modalidadeId: 'mod-2' })
    expect(result).toHaveLength(1)
  })

  it('empty search returns all', () => {
    const sessoes = [makeSessao(), makeSessao({ id: '2' }), makeSessao({ id: '3' })]
    expect(filterSessoes(sessoes, { search: '', modalidadeId: '' })).toHaveLength(3)
  })
})
