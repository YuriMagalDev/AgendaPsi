import type { PacienteComConvenio } from './types'

export interface PacienteFilters {
  search: string
  ativoOnly: boolean
  modalidadeId: string
  tipoContrato: string
}

export const DEFAULT_PACIENTE_FILTERS: PacienteFilters = {
  search: '',
  ativoOnly: true,
  modalidadeId: '',
  tipoContrato: '',
}

export function filterPacientes(
  pacientes: PacienteComConvenio[],
  filters: PacienteFilters
): PacienteComConvenio[] {
  const searchLower = filters.search.toLowerCase()
  return pacientes.filter(p => {
    if (filters.ativoOnly && !p.ativo) return false
    if (filters.modalidadeId && p.modalidade_sessao_id !== filters.modalidadeId) return false
    if (filters.tipoContrato) {
      const active = Array.isArray(p.contratos) ? p.contratos.find(c => c.ativo) : null
      if (active?.tipo !== filters.tipoContrato) return false
    }
    if (searchLower && !p.nome.toLowerCase().includes(searchLower)) return false
    return true
  })
}
