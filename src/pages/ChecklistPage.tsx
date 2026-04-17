import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useSessoesDia } from '@/hooks/useSessoesDia'
import type { SessaoStatus, SessaoView } from '@/lib/types'

const TODAY = format(new Date(), 'yyyy-MM-dd')

type StatusUpdate = { id: string; status: SessaoStatus; remarcada_para?: string }

function getStatusColor(s: SessaoStatus): string {
  const map: Record<SessaoStatus, string> = {
    agendada: '#9CA3AF', confirmada: '#2D6A6A', concluida: '#4CAF82',
    faltou: '#C17F59', cancelada: '#E07070', remarcada: '#9B7EC8',
  }
  return map[s]
}

function SessaoChecklist({ sessao, update, onUpdate }: {
  sessao: SessaoView
  update: StatusUpdate | undefined
  onUpdate: (u: StatusUpdate) => void
}) {
  const novoStatus = update?.status
  const [remarcarData, setRemarcarData] = useState('')
  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const horario = format(new Date(sessao.data_hora), 'HH:mm', { locale: ptBR })

  const botoes: { status: SessaoStatus; label: string }[] = [
    { status: 'concluida', label: 'Concluída' },
    { status: 'faltou',    label: 'Faltou' },
    { status: 'cancelada', label: 'Cancelada' },
  ]

  return (
    <div className="bg-surface rounded-card border border-border p-4"
      style={{ borderLeftWidth: 3, borderLeftColor: getStatusColor(novoStatus ?? sessao.status) }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium text-[#1C1C1C]">{nomePaciente}</p>
          <p className="text-xs text-muted">{horario} · {sessao.modalidades?.nome}</p>
        </div>
        {novoStatus && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${getStatusColor(novoStatus)}20`, color: getStatusColor(novoStatus) }}>
            {novoStatus.charAt(0).toUpperCase() + novoStatus.slice(1)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {botoes.map(({ status, label }) => (
          <button
            key={status}
            onClick={() => onUpdate({ id: sessao.id, status })}
            className="text-xs px-3 py-1 rounded-lg border transition-colors"
            style={novoStatus === status
              ? { backgroundColor: `${getStatusColor(status)}20`, borderColor: getStatusColor(status), color: getStatusColor(status) }
              : { borderColor: '#E4E0DA', color: '#7A7A7A' }
            }
          >
            {label}
          </button>
        ))}
        <div className="flex gap-1 w-full mt-1">
          <input
            type="datetime-local"
            value={remarcarData}
            onChange={e => setRemarcarData(e.target.value)}
            className="flex-1 h-7 px-2 text-xs rounded border border-border outline-none focus:border-primary"
          />
          <button
            onClick={() => remarcarData && onUpdate({ id: sessao.id, status: 'remarcada', remarcada_para: remarcarData })}
            disabled={!remarcarData}
            className="text-xs px-2 h-7 rounded border disabled:opacity-40 transition-colors"
            style={{ borderColor: '#9B7EC8', color: '#9B7EC8' }}
          >
            Remarcar
          </button>
        </div>
      </div>
    </div>
  )
}

export function ChecklistPage() {
  const { sessoes, loading, error, refetch } = useSessoesDia(TODAY)
  const [updates, setUpdates] = useState<StatusUpdate[]>([])
  const [salvando, setSalvando] = useState(false)

  const pendentes = sessoes.filter(s => s.status === 'agendada' || s.status === 'confirmada')

  function handleUpdate(u: StatusUpdate) {
    setUpdates(prev => [...prev.filter(x => x.id !== u.id), u])
  }

  async function salvarTudo() {
    setSalvando(true)
    for (const u of updates) {
      const patch: Record<string, unknown> = { status: u.status }
      if (u.remarcada_para) patch.remarcada_para = u.remarcada_para
      await supabase.from('sessoes').update(patch).eq('id', u.id)
    }
    setUpdates([])
    await refetch()
    setSalvando(false)
  }

  const tituloData = format(new Date(), "d 'de' MMMM", { locale: ptBR })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Checklist do dia</h1>
          <p className="text-sm text-muted capitalize">{tituloData}</p>
        </div>
        {updates.length > 0 && (
          <button
            onClick={salvarTudo}
            disabled={salvando}
            className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {salvando ? 'Salvando...' : `Salvar (${updates.length})`}
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && <p className="text-center py-8 text-sm text-[#E07070]">Erro ao carregar sessões.</p>}

      {!loading && !error && pendentes.length === 0 && (
        <div className="text-center py-16">
          <p className="text-muted text-sm">Nenhuma sessão pendente hoje. 🎉</p>
        </div>
      )}

      {!loading && !error && pendentes.length > 0 && (
        <div className="flex flex-col gap-3">
          {pendentes.map(s => (
            <SessaoChecklist
              key={s.id}
              sessao={s}
              update={updates.find(u => u.id === s.id)}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
