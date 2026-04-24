import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import type { SessaoFilters } from '@/lib/filterSessoes'
import { DEFAULT_SESSAO_FILTERS } from '@/lib/filterSessoes'

interface Props {
  filters: SessaoFilters
  onChange: (f: SessaoFilters) => void
  hiddenCount: number
}

export function KanbanFilters({ filters, onChange, hiddenCount }: Props) {
  const { modalidadesSessao } = useModalidadesSessao()
  const hasActiveFilters = !!filters.search || !!filters.modalidadeId

  return (
    <div className="flex flex-wrap gap-2 items-center px-4 py-2 border-b border-border bg-surface flex-shrink-0">
      <input
        type="text"
        placeholder="Buscar paciente..."
        value={filters.search}
        onChange={e => onChange({ ...filters, search: e.target.value })}
        className="h-8 px-3 text-sm rounded-lg border border-border outline-none focus:border-primary min-w-[160px]"
      />
      <select
        value={filters.modalidadeId}
        onChange={e => onChange({ ...filters, modalidadeId: e.target.value })}
        className="h-8 px-2 text-xs rounded-lg border border-border outline-none focus:border-primary bg-white"
      >
        <option value="">Todas as modalidades</option>
        {modalidadesSessao.map(m => (
          <option key={m.id} value={m.id}>{m.nome}</option>
        ))}
      </select>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_SESSAO_FILTERS)}
          className="text-xs text-primary hover:underline"
        >
          Limpar
        </button>
      )}
      {hiddenCount > 0 && (
        <span className="text-xs text-muted ml-auto">
          {hiddenCount} sessão{hiddenCount !== 1 ? 'ões' : ''} oculta{hiddenCount !== 1 ? 's' : ''} pelos filtros
        </span>
      )}
    </div>
  )
}
