import { useMemo } from 'react'
import { addDays, format, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { SessaoCard } from '@/components/sessao/SessaoCard'
import type { SessaoView } from '@/lib/types'

interface SemanaGridProps {
  weekStart: Date
  sessoes: SessaoView[]
  loading: boolean
  horaInicio: number
  horaFim: number
  onCelulaClick: (dataHora: string) => void
  onSessaoClick: (sessao: SessaoView) => void
}

const DIAS_ABREV = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export function SemanaGrid({
  weekStart,
  sessoes,
  loading,
  horaInicio,
  horaFim,
  onCelulaClick,
  onSessaoClick,
}: SemanaGridProps) {
  const horas = Array.from({ length: horaFim - horaInicio }, (_, i) => horaInicio + i)
  const dias = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const index = useMemo(() => {
    const map = new Map<string, SessaoView[]>()
    for (const s of sessoes) {
      const key = format(new Date(s.data_hora), 'yyyy-MM-dd-HH')
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return map
  }, [sessoes])

  return (
    <div className="relative overflow-auto">
      {/* Header row */}
      <div className="grid grid-cols-[52px_repeat(7,1fr)] sticky top-0 z-10 bg-surface border-b border-border">
        <div className="h-10" />
        {dias.map((dia, i) => (
          <div
            key={i}
            className={`h-10 flex flex-col items-center justify-center border-l border-border text-xs ${
              isToday(dia) ? 'border-t-2 border-t-primary' : ''
            }`}
          >
            <span className={`font-medium ${isToday(dia) ? 'text-primary' : 'text-muted'}`}>
              {DIAS_ABREV[i]}
            </span>
            <span className={`text-[11px] ${isToday(dia) ? 'text-primary font-semibold' : 'text-muted'}`}>
              {format(dia, 'd', { locale: ptBR })}
            </span>
          </div>
        ))}
      </div>

      {/* Body rows */}
      {horas.map(hora => (
        <div key={hora} className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-border min-h-[72px]">
          {/* Time gutter */}
          <div className="flex items-start justify-end pr-2 pt-1">
            <span className="text-[11px] text-muted leading-none">{String(hora).padStart(2, '0')}h</span>
          </div>
          {/* Day cells */}
          {dias.map((dia, di) => {
            const key = `${format(dia, 'yyyy-MM-dd')}-${String(hora).padStart(2, '0')}`
            const celulasSessoes = index.get(key) ?? []
            const dataHoraStr = `${format(dia, 'yyyy-MM-dd')}T${String(hora).padStart(2, '0')}:00`
            return (
              <div
                key={di}
                onClick={() => onCelulaClick(dataHoraStr)}
                className={`border-l border-border p-1 cursor-pointer hover:bg-bg transition-colors ${
                  isToday(dia) ? 'bg-primary/5' : ''
                }`}
              >
                {celulasSessoes.slice(0, 2).map(s => (
                  <div key={s.id} onClick={e => { e.stopPropagation(); onSessaoClick(s) }}>
                    <SessaoCard sessao={s} />
                  </div>
                ))}
                {celulasSessoes.length > 2 && (
                  <span className="text-[10px] text-muted pl-1">+{celulasSessoes.length - 2} mais</span>
                )}
              </div>
            )
          })}
        </div>
      ))}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-surface/60 flex items-center justify-center z-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
