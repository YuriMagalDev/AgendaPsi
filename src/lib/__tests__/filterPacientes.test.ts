import { describe, it, expect } from 'vitest'
import { filterPacientes } from '../filterPacientes'
import type { PacienteComConvenio } from '../types'

function makePaciente(overrides: Partial<PacienteComConvenio> = {}): PacienteComConvenio {
  return {
    id: '1',
    nome: 'Teste',
    telefone: null,
    email: null,
    data_nascimento: null,
    ativo: true,
    tipo: 'particular',
    convenio_id: null,
    modalidade_sessao_id: 'mod-1',
    meio_atendimento_id: 'meio-1',
    criado_em: '2024-01-01',
    convenios: null,
    modalidades_sessao: null,
    meios_atendimento: null,
    contratos: null,
    ...overrides,
  }
}

describe('filterPacientes', () => {
  it('returns all when no active filters', () => {
    const ps = [makePaciente({ nome: 'Alpha' }), makePaciente({ id: '2', nome: 'Beta' })]
    expect(filterPacientes(ps, { search: '', ativoOnly: false, modalidadeId: '', tipoContrato: '' })).toHaveLength(2)
  })

  it('filters by ativoOnly — excludes inactive', () => {
    const ps = [
      makePaciente({ ativo: true, nome: 'Ativo' }),
      makePaciente({ id: '2', ativo: false, nome: 'Inativo' }),
    ]
    const result = filterPacientes(ps, { search: '', ativoOnly: true, modalidadeId: '', tipoContrato: '' })
    expect(result).toHaveLength(1)
    expect(result[0].nome).toBe('Ativo')
  })

  it('when ativoOnly false — includes both', () => {
    const ps = [
      makePaciente({ ativo: true }),
      makePaciente({ id: '2', ativoOnly: false }),
    ]
    expect(filterPacientes(ps, { search: '', ativoOnly: false, modalidadeId: '', tipoContrato: '' })).toHaveLength(2)
  })

  it('filters by search — case insensitive', () => {
    const ps = [makePaciente({ nome: 'João Silva' }), makePaciente({ id: '2', nome: 'Maria Santos' })]
    const result = filterPacientes(ps, { search: 'joã', ativoOnly: false, modalidadeId: '', tipoContrato: '' })
    expect(result).toHaveLength(1)
    expect(result[0].nome).toBe('João Silva')
  })

  it('filters by modalidadeId', () => {
    const ps = [
      makePaciente({ modalidade_sessao_id: 'mod-1' }),
      makePaciente({ id: '2', modalidade_sessao_id: 'mod-2' }),
    ]
    const result = filterPacientes(ps, { search: '', ativoOnly: false, modalidadeId: 'mod-1', tipoContrato: '' })
    expect(result).toHaveLength(1)
  })

  it('filters by tipoContrato — matches active contract', () => {
    const ps = [
      makePaciente({ contratos: [{ tipo: 'por_sessao', ativo: true }] }),
      makePaciente({ id: '2', contratos: [{ tipo: 'mensal', ativo: true }] }),
      makePaciente({ id: '3', contratos: null }),
    ]
    const result = filterPacientes(ps, { search: '', ativoOnly: false, modalidadeId: '', tipoContrato: 'por_sessao' })
    expect(result).toHaveLength(1)
  })

  it('tipoContrato filter — inactive contract does not match', () => {
    const ps = [
      makePaciente({ contratos: [{ tipo: 'por_sessao', ativo: false }, { tipo: 'mensal', ativo: true }] }),
    ]
    const result = filterPacientes(ps, { search: '', ativoOnly: false, modalidadeId: '', tipoContrato: 'por_sessao' })
    expect(result).toHaveLength(0)
  })
})
