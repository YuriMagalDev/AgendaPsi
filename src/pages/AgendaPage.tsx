import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { format, addDays, subDays, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useSessoesDia } from '@/hooks/useSessoesDia'
import { SessaoCard } from '@/components/sessao/SessaoCard'
import { NovaSessaoModal } from '@/components/sessao/NovaSessaoModal'

function toDateString(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function AgendaPage() {
  const [data, setData] = useState(new Date())
  const dateStr = toDateString(data)
  const { sessoes, loading, error, refetch } = useSessoesDia(dateStr)
  const [modalAberto, setModalAberto] = useState(false)

  const tituloData = isToday(data)
    ? 'Hoje'
    : format(data, "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setData(subDays(data, 1))} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <ChevronLeft size={20} />
          </button>
          <h1 className="font-display text-xl font-semibold text-[#1C1C1C] capitalize">{tituloData}</h1>
          <button onClick={() => setData(addDays(data, 1))} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="flex items-center gap-2">
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
          {sessoes.map(s => (
            <SessaoCard key={s.id} sessao={s} />
          ))}
        </div>
      )}

      {modalAberto && (
        <NovaSessaoModal
          defaultDate={dateStr}
          onClose={() => setModalAberto(false)}
          onSaved={() => { refetch(); setModalAberto(false) }}
        />
      )}
    </div>
  )
}
