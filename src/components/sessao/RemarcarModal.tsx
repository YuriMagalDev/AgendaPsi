import { useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { startOfWeek, addWeeks, subWeeks, addDays, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSemana } from '@/hooks/useSemana'
import { useConfigPsicologo } from '@/hooks/useConfigPsicologo'
import { SemanaGrid } from '@/components/semana/SemanaGrid'
import type { SessaoView } from '@/lib/types'

function parseHora(t: string | null | undefined, fallback: number): number {
  if (!t) return fallback
  const h = parseInt(t.split(':')[0], 10)
  return isNaN(h) ? fallback : h
}

interface Props {
  sessao: SessaoView
  onClose: () => void
  onConfirmar: (novaDataHora: string) => void
}

export function RemarcarModal({ sessao, onClose, onConfirmar }: Props) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const { sessoes, loading } = useSemana(weekStart)
  const { config } = useConfigPsicologo()
  const horaInicio = parseHora(config?.horario_inicio, 7)
  const horaFim = parseHora(config?.horario_fim, 21)

  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const labelSemana =
    format(weekStart, 'd MMM', { locale: ptBR }) +
    ' – ' +
    format(addDays(weekStart, 6), "d MMM yyyy", { locale: ptBR })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-4xl shadow-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="font-display font-semibold text-[#1C1C1C]">Remarcar sessão</p>
            <p className="text-xs text-muted mt-0.5">
              {nomePaciente} · Clique em um horário livre na agenda
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Week navigation */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-shrink-0">
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
        </div>

        {/* Calendar grid */}
        <div className="flex-1 overflow-auto">
          <SemanaGrid
            weekStart={weekStart}
            sessoes={sessoes}
            loading={loading}
            horaInicio={horaInicio}
            horaFim={horaFim}
            onCelulaClick={setSelecionado}
            onSessaoClick={() => {}}
          />
        </div>

        {/* Confirmation bar — appears when a cell is selected */}
        {selecionado && (
          <div className="px-5 py-4 border-t border-border flex items-center justify-between flex-shrink-0 bg-primary/5">
            <p className="text-sm text-[#1C1C1C]">
              Remarcar para{' '}
              <span className="font-medium">
                {format(new Date(selecionado), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setSelecionado(null)}
                className="text-sm text-muted hover:text-[#1C1C1C] px-3 py-1.5 rounded-lg border border-border transition-colors"
              >
                Limpar
              </button>
              <button
                onClick={() => onConfirmar(selecionado)}
                className="text-sm font-medium px-4 py-1.5 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors"
              >
                Confirmar remarcação
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
