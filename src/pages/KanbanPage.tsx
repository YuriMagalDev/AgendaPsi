import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { KanbanFilters } from '@/components/kanban/KanbanFilters'
import { filterSessoes } from '@/lib/filterSessoes'
import type { SessaoFilters } from '@/lib/filterSessoes'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfWeek, addWeeks, subWeeks, addDays, format, isSameWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSemana } from '@/hooks/useSemana'
import { useConfigPsicologo } from '@/hooks/useConfigPsicologo'
import { SemanaGrid } from '@/components/semana/SemanaGrid'
import { NovaSessaoModal } from '@/components/sessao/NovaSessaoModal'
import { SessaoPanel } from '@/components/sessao/SessaoPanel'
import type { SessaoView } from '@/lib/types'

function parseHora(t: string | null | undefined, fallback: number): number {
  if (!t) return fallback
  const h = parseInt(t.split(':')[0], 10)
  return isNaN(h) ? fallback : h
}

export function KanbanPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [modalAberto, setModalAberto] = useState(false)
  const [defaultDateTime, setDefaultDateTime] = useState<string | undefined>()
  const [sessaoSelecionada, setSessaoSelecionada] = useState<SessaoView | null>(null)

  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState<SessaoFilters>({
    search: searchParams.get('q') ?? '',
    modalidadeId: searchParams.get('mod') ?? '',
  })

  function handleFiltersChange(f: SessaoFilters) {
    setFilters(f)
    const params = new URLSearchParams()
    if (f.search) params.set('q', f.search)
    if (f.modalidadeId) params.set('mod', f.modalidadeId)
    setSearchParams(params, { replace: true })
  }

  const { sessoes, loading, refetch } = useSemana(weekStart)
  const { config } = useConfigPsicologo()
  const horaInicio = parseHora(config?.horario_inicio, 7)
  const horaFim = parseHora(config?.horario_fim, 21)

  const sessoesFiltradas = filterSessoes(sessoes, filters)
  const hiddenCount = sessoes.length - sessoesFiltradas.length

  const isEstaSemana = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 })
  const labelSemana =
    format(weekStart, "d MMM", { locale: ptBR }) +
    ' – ' +
    format(addDays(weekStart, 6), "d MMM yyyy", { locale: ptBR })

  function handleCelulaClick(dataHora: string) {
    setDefaultDateTime(dataHora)
    setModalAberto(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="p-1.5 rounded-lg text-muted hover:text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-[#1C1C1C] capitalize min-w-[160px] text-center">
            {labelSemana}
          </span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 rounded-lg text-muted hover:text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          {!isEstaSemana && (
            <button
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="text-xs text-primary hover:underline ml-1"
            >
              Esta semana
            </button>
          )}
        </div>
        <button
          onClick={() => { setDefaultDateTime(undefined); setModalAberto(true) }}
          className="bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          + Nova sessão
        </button>
      </div>

      {/* Filters */}
      <KanbanFilters
        filters={filters}
        onChange={handleFiltersChange}
        hiddenCount={hiddenCount}
      />

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <SemanaGrid
          weekStart={weekStart}
          sessoes={sessoesFiltradas}
          loading={loading}
          horaInicio={horaInicio}
          horaFim={horaFim}
          onCelulaClick={handleCelulaClick}
          onSessaoClick={setSessaoSelecionada}
        />
      </div>

      {/* Modals */}
      {modalAberto && (
        <NovaSessaoModal
          defaultDate={defaultDateTime}
          onClose={() => setModalAberto(false)}
          onSaved={() => { refetch(); setModalAberto(false) }}
        />
      )}
      {sessaoSelecionada && (
        <SessaoPanel
          sessao={sessaoSelecionada}
          onClose={() => setSessaoSelecionada(null)}
          onUpdate={refetch}
        />
      )}
    </div>
  )
}
