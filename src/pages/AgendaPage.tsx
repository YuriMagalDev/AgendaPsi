import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarIcon } from 'lucide-react'
import { format, addDays, subDays, isToday, getISOWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSessoesDia } from '@/hooks/useSessoesDia'
import { useExternalBusy } from '@/hooks/useExternalBusy'
import { checkGoogleConflict } from '@/lib/conflictCheckGoogle'
import { SessaoCard } from '@/components/sessao/SessaoCard'
import { SessaoPanel } from '@/components/sessao/SessaoPanel'
import { NovaSessaoModal } from '@/components/sessao/NovaSessaoModal'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import type { SessaoView } from '@/lib/types'

function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function AgendaPage() {
  const [data, setData] = useState(new Date())
  const [calendarAberto, setCalendarAberto] = useState(false)
  const dateStr = toDateString(data)
  const { sessoes, loading, error, refetch } = useSessoesDia(dateStr)
  const [modalAberto, setModalAberto] = useState(false)
  const [sessaoSelecionada, setSessaoSelecionada] = useState<SessaoView | null>(null)

  const startOfDay = new Date(new Date(data).setHours(0, 0, 0, 0))
  const endOfDay   = new Date(new Date(data).setHours(23, 59, 59, 999))
  const externalBusy = useExternalBusy(startOfDay, endOfDay)

  const semana = getISOWeek(data)
  const tituloData = isToday(data)
    ? 'Hoje'
    : format(data, "EEEE, d 'de' MMMM", { locale: ptBR })

  function selecionarDia(day: Date | undefined) {
    if (!day) return
    setData(day)
    setCalendarAberto(false)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setData(d => subDays(d, 1))}
            className="text-muted hover:text-[#1C1C1C] transition-colors p-1"
          >
            <ChevronLeft size={20} />
          </button>
          <Popover open={calendarAberto} onOpenChange={setCalendarAberto}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-bg transition-colors">
                <CalendarIcon size={14} className="text-muted" />
                <h1 className="font-display text-xl font-semibold text-[#1C1C1C] capitalize">
                  {tituloData}
                </h1>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={data}
                onSelect={selecionarDia}
                locale={ptBR}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <button
            onClick={() => setData(d => addDays(d, 1))}
            className="text-muted hover:text-[#1C1C1C] transition-colors p-1"
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Semana {semana}</span>
          {!isToday(data) && (
            <button onClick={() => setData(new Date())} className="text-xs text-primary hover:underline">
              Hoje
            </button>
          )}
          <button
            onClick={() => setModalAberto(true)}
            className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
            Nova sessão
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && <p className="text-center py-8 text-sm text-[#E07070]">Erro ao carregar sessões.</p>}

      {!loading && !error && sessoes.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted text-sm">Nenhuma sessão agendada para este dia.</p>
        </div>
      )}

      {!loading && !error && sessoes.length > 0 && (
        <div className="flex flex-col gap-2">
          {sessoes.map(s => {
            const conflicts = checkGoogleConflict(s.data_hora, s.duracao_minutos ?? 50, externalBusy)
            const hasConflict = conflicts.length > 0
            return (
              <div key={s.id} className="flex flex-col">
                <SessaoCard sessao={s} onClick={() => setSessaoSelecionada(s)} />
                {hasConflict && (
                  <span className="text-xs text-[#C17F59] font-medium px-1 pt-0.5">
                    Conflito: {conflicts[0].titulo}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalAberto && (
        <NovaSessaoModal
          defaultDate={dateStr}
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
