import { useState, useRef, useEffect } from 'react'
import { Bell } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { useNotificacoes } from '@/hooks/useNotificacoes'

export function TopBar() {
  const { notificacoes, count, marcarLidas } = useNotificacoes()
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (aberto && notificacoes.length > 0) {
          marcarLidas(notificacoes.map(n => n.id))
        }
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto, notificacoes, marcarLidas])

  function handleToggle() {
    if (aberto && notificacoes.length > 0) {
      marcarLidas(notificacoes.map(n => n.id))
    }
    setAberto(a => !a)
  }

  return (
    <div className="h-12 border-b border-border bg-surface flex items-center justify-end px-4 flex-shrink-0">
      <div className="relative" ref={ref}>
        <button
          onClick={handleToggle}
          className="relative p-2 rounded-lg text-muted hover:text-[#1C1C1C] hover:bg-bg transition-colors"
          aria-label="Notificações"
        >
          <Bell size={20} />
          {count > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-[#E07070] text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </button>

        {aberto && (
          <div className="absolute right-0 top-full mt-1 w-80 bg-surface border border-border rounded-card shadow-lg z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-[#1C1C1C]">Notificações</p>
            </div>
            {notificacoes.length === 0 ? (
              <p className="text-sm text-muted px-4 py-6 text-center">Nenhuma notificação.</p>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {notificacoes.map(n => {
                  const nomePaciente =
                    n.sessoes?.pacientes?.nome ?? n.sessoes?.avulso_nome ?? 'Paciente'
                  const dataHora = n.sessoes?.data_hora
                    ? format(new Date(n.sessoes.data_hora), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })
                    : ''
                  return (
                    <div key={n.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-[#1C1C1C]">{nomePaciente}</p>
                      <p className="text-xs text-muted mt-0.5">{dataHora}</p>
                      <p
                        className={`text-xs mt-1 font-medium ${
                          n.confirmado ? 'text-[#4CAF82]' : 'text-[#E07070]'
                        }`}
                      >
                        {n.confirmado ? 'Confirmou a sessão' : 'Cancelou a sessão'}
                      </p>
                      {n.remarcacao_solicitada && (
                        <p className="text-xs font-medium text-[#9B7EC8] mt-0.5">Solicitou remarcação</p>
                      )}
                      {n.resposta && (
                        <p className="text-xs text-muted mt-0.5 italic">"{n.resposta}"</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
