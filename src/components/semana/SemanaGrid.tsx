import { useMemo } from 'react'
import { addDays, format, isToday } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { STATUS_CONFIG } from '@/lib/statusConfig'
import type { SessaoView } from '@/lib/types'

const PIXELS_POR_HORA = 80

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
  const totalHeight = (horaFim - horaInicio) * PIXELS_POR_HORA

  const sessoesPorDia = useMemo(() => {
    const map = new Map<string, SessaoView[]>()
    for (const s of sessoes) {
      const key = format(new Date(s.data_hora), 'yyyy-MM-dd')
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return map
  }, [sessoes])

  function handleColumnClick(e: React.MouseEvent<HTMLDivElement>, dia: Date) {
    const rect = e.currentTarget.getBoundingClientRect()
    const relY = e.clientY - rect.top
    const snappedMinutes = Math.round((relY / PIXELS_POR_HORA) * 60 / 15) * 15
    const h = Math.min(horaInicio + Math.floor(snappedMinutes / 60), horaFim - 1)
    const m = snappedMinutes % 60
    const dataHoraStr = `${format(dia, 'yyyy-MM-dd')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    onCelulaClick(dataHoraStr)
  }

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

      {/* Body */}
      <div className="grid grid-cols-[52px_repeat(7,1fr)]" style={{ height: totalHeight }}>
        {/* Time gutter */}
        <div className="relative" style={{ height: totalHeight }}>
          {horas.map(hora => (
            <div
              key={hora}
              className="absolute right-2"
              style={{ top: (hora - horaInicio) * PIXELS_POR_HORA + 2 }}
            >
              <span className="text-[11px] text-muted leading-none">
                {String(hora).padStart(2, '0')}h
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {dias.map((dia, di) => {
          const diaKey = format(dia, 'yyyy-MM-dd')
          const sessoesNoDia = sessoesPorDia.get(diaKey) ?? []

          return (
            <div
              key={di}
              className={`relative border-l border-border cursor-pointer ${
                isToday(dia) ? 'bg-primary/5' : ''
              }`}
              style={{ height: totalHeight }}
              onClick={(e) => handleColumnClick(e, dia)}
            >
              {/* Hour divider lines */}
              {horas.map(hora => (
                <div
                  key={hora}
                  className="absolute left-0 right-0 border-t border-border pointer-events-none"
                  style={{ top: (hora - horaInicio) * PIXELS_POR_HORA }}
                />
              ))}

              {/* Session cards */}
              {sessoesNoDia.map(s => {
                const cfg = STATUS_CONFIG[s.status]
                const dt = new Date(s.data_hora)
                const minutesFromStart = (dt.getHours() - horaInicio) * 60 + dt.getMinutes()
                const top = (minutesFromStart / 60) * PIXELS_POR_HORA
                const height = Math.max(20, (s.duracao_minutos / 60) * PIXELS_POR_HORA)
                const nomePaciente = s.pacientes?.nome ?? s.avulso_nome ?? 'Avulso'
                const horario = format(dt, 'HH:mm', { locale: ptBR })

                return (
                  <div
                    key={s.id}
                    className="absolute left-0.5 right-0.5 rounded border bg-surface overflow-hidden cursor-pointer hover:shadow-sm transition-shadow z-10"
                    style={{ top, height, borderLeftWidth: 3, borderLeftColor: cfg.cor }}
                    onClick={e => { e.stopPropagation(); onSessaoClick(s) }}
                  >
                    <p className="text-[11px] font-medium text-[#1C1C1C] truncate px-1 pt-0.5 leading-tight">
                      {nomePaciente}
                    </p>
                    {height > 32 && (
                      <p className="text-[10px] text-muted px-1 leading-none">{horario}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-surface/60 flex items-center justify-center z-20">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
