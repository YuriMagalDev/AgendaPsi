import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useKanban } from '@/hooks/useKanban'
import { SessaoCard } from '@/components/sessao/SessaoCard'
import { NovaSessaoModal } from '@/components/sessao/NovaSessaoModal'
import type { SessaoStatus, SessaoView } from '@/lib/types'

const COLUNAS: { status: SessaoStatus; titulo: string }[] = [
  { status: 'agendada',   titulo: 'Agendadas' },
  { status: 'confirmada', titulo: 'Confirmadas' },
  { status: 'concluida',  titulo: 'Concluídas' },
  { status: 'faltou',     titulo: 'Faltaram' },
  { status: 'cancelada',  titulo: 'Canceladas' },
  { status: 'remarcada',  titulo: 'Remarcadas' },
]

const STATUS_ACOES: Partial<Record<SessaoStatus, SessaoStatus[]>> = {
  agendada:   ['confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada'],
  confirmada: ['concluida', 'faltou', 'cancelada', 'remarcada'],
}

const ACTION_LABEL: Record<SessaoStatus, string> = {
  agendada:   'Agendada',
  confirmada: 'Confirmada',
  concluida:  'Concluída',
  faltou:     'Faltou',
  cancelada:  'Cancelada',
  remarcada:  'Remarcada',
}

function getColor(s: SessaoStatus): string {
  const map: Record<SessaoStatus, string> = {
    agendada: '#9CA3AF', confirmada: '#2D6A6A', concluida: '#4CAF82',
    faltou: '#C17F59', cancelada: '#E07070', remarcada: '#9B7EC8',
  }
  return map[s]
}

function CardMenu({ sessao, onUpdate }: { sessao: SessaoView; onUpdate: (s: SessaoStatus, r?: string) => void }) {
  const acoes = STATUS_ACOES[sessao.status]
  const [remarcarData, setRemarcarData] = useState('')

  if (!acoes) return null

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {acoes.map(s => (
        s === 'remarcada' ? (
          <div key={s} className="flex gap-1 w-full">
            <input
              type="datetime-local"
              value={remarcarData}
              onChange={e => setRemarcarData(e.target.value)}
              className="flex-1 h-7 px-2 text-xs rounded border border-border outline-none focus:border-primary"
            />
            <button
              onClick={() => remarcarData && onUpdate('remarcada', remarcarData)}
              disabled={!remarcarData}
              className="text-xs px-2 h-7 rounded bg-[#9B7EC820] text-[#9B7EC8] disabled:opacity-40 hover:bg-[#9B7EC840] transition-colors"
            >
              Remarcar
            </button>
          </div>
        ) : (
          <button
            key={s}
            onClick={() => onUpdate(s)}
            className="text-xs px-2 py-0.5 rounded transition-colors"
            style={{ backgroundColor: `${getColor(s)}20`, color: getColor(s) }}
          >
            {ACTION_LABEL[s]}
          </button>
        )
      ))}
    </div>
  )
}

export function KanbanPage() {
  const { colunas, loading, updateStatus, refetch } = useKanban()
  const [modalAberto, setModalAberto] = useState(false)
  const [cardExpandido, setCardExpandido] = useState<string | null>(null)

  return (
    <div className="p-4 h-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Kanban</h1>
        <button
          onClick={() => setModalAberto(true)}
          className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nova sessão
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUNAS.map(({ status, titulo }) => (
            <div key={status} className="min-w-[220px] flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getColor(status) }} />
                <span className="text-xs font-semibold text-muted uppercase tracking-wide">{titulo}</span>
                <span className="text-xs text-muted ml-auto">({colunas[status].length})</span>
              </div>
              <div className="flex flex-col gap-2">
                {colunas[status].map(s => (
                  <div key={s.id}>
                    <SessaoCard sessao={s} onClick={() => setCardExpandido(cardExpandido === s.id ? null : s.id)} />
                    {cardExpandido === s.id && (
                      <CardMenu
                        sessao={s}
                        onUpdate={async (novoStatus, remarcarData) => {
                          await updateStatus(s.id, novoStatus, remarcarData)
                          setCardExpandido(null)
                        }}
                      />
                    )}
                  </div>
                ))}
                {colunas[status].length === 0 && (
                  <div className="rounded-card border border-dashed border-border p-4 text-center">
                    <p className="text-xs text-muted">Nenhuma sessão</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalAberto && (
        <NovaSessaoModal
          onClose={() => setModalAberto(false)}
          onSaved={() => { refetch(); setModalAberto(false) }}
        />
      )}
    </div>
  )
}
