import type { SessaoView } from './types'

export interface SessaoFilters {
  search: string
  modalidadeId: string
}

export const DEFAULT_SESSAO_FILTERS: SessaoFilters = {
  search: '',
  modalidadeId: '',
}

export function filterSessoes(
  sessoes: SessaoView[],
  filters: SessaoFilters
): SessaoView[] {
  return sessoes.filter(s => {
    if (filters.search) {
      const nome = (s.pacientes?.nome ?? s.avulso_nome ?? '').toLowerCase()
      if (!nome.includes(filters.search.toLowerCase())) return false
    }
    if (filters.modalidadeId && s.modalidade_sessao_id !== filters.modalidadeId) return false
    return true
  })
}
