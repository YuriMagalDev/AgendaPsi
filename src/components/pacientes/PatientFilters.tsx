import { Search } from 'lucide-react'
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import type { PacienteFilters } from '@/lib/filterPacientes'
import { DEFAULT_PACIENTE_FILTERS } from '@/lib/filterPacientes'

const TIPOS_CONTRATO = [
  { value: '', label: 'Todos os contratos' },
  { value: 'por_sessao', label: 'Por sessão' },
  { value: 'pacote', label: 'Pacote' },
  { value: 'mensal', label: 'Mensal' },
]

interface Props {
  filters: PacienteFilters
  onChange: (f: PacienteFilters) => void
  resultCount: number
}

export function PatientFilters({ filters, onChange, resultCount }: Props) {
  const { modalidades } = useModalidadesSessao()
  const hasActiveFilters = !filters.ativoOnly || !!filters.modalidadeId || !!filters.tipoContrato

  return (
    <div className="flex flex-wrap gap-2 items-center mb-4">
      <div className="relative flex-1 min-w-[160px]">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nome..."
          value={filters.search}
          onChange={e => onChange({ ...filters, search: e.target.value })}
          className="w-full pl-8 pr-3 h-8 text-sm rounded-lg border border-border outline-none focus:border-primary"
        />
      </div>
      <button
        type="button"
        onClick={() => onChange({ ...filters, ativoOnly: !filters.ativoOnly })}
        className={`h-8 px-3 text-xs rounded-lg border transition-colors whitespace-nowrap ${
          filters.ativoOnly
            ? 'bg-primary/10 border-primary text-primary'
            : 'border-border text-muted'
        }`}
      >
        Apenas ativos
      </button>
      <select
        value={filters.modalidadeId}
        onChange={e => onChange({ ...filters, modalidadeId: e.target.value })}
        className="h-8 px-2 text-xs rounded-lg border border-border outline-none focus:border-primary bg-white"
      >
        <option value="">Todas as modalidades</option>
        {modalidades.map(m => (
          <option key={m.id} value={m.id}>{m.nome}</option>
        ))}
      </select>
      <select
        value={filters.tipoContrato}
        onChange={e => onChange({ ...filters, tipoContrato: e.target.value })}
        className="h-8 px-2 text-xs rounded-lg border border-border outline-none focus:border-primary bg-white"
      >
        {TIPOS_CONTRATO.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <span className="text-xs text-muted">
        {resultCount} paciente{resultCount !== 1 ? 's' : ''}
      </span>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={() => onChange(DEFAULT_PACIENTE_FILTERS)}
          className="text-xs text-primary hover:underline"
        >
          Limpar
        </button>
      )}
    </div>
  )
}
