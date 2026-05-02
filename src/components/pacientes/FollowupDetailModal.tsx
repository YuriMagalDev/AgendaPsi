import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { RiscoFollowup } from '@/lib/types'

type FollowupWithPaciente = RiscoFollowup & { pacientes: { nome: string } }

interface Props {
  followup: FollowupWithPaciente
  onClose: () => void
  onUpdated: () => void
}

const RESULTADO_LABELS: Record<RiscoFollowup['resultado'], string> = {
  enviada: 'Enviada',
  respondida_sim: 'Respondida: Sim',
  respondida_nao: 'Respondida: Não',
  reconectado: 'Reconectado',
}

const RESULTADO_CLASSES: Record<RiscoFollowup['resultado'], string> = {
  enviada: 'bg-[#E4E0DA] text-[#7A7A7A]',
  respondida_sim: 'bg-[#4CAF82]/15 text-[#4CAF82]',
  respondida_nao: 'bg-[#E07070]/15 text-[#E07070]',
  reconectado: 'bg-primary-light text-primary',
}

function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function FollowupDetailModal({ followup, onClose, onUpdated }: Props) {
  const [marcando, setMarcando] = useState(false)

  async function handleReconectado() {
    setMarcando(true)
    await supabase
      .from('risco_followups')
      .update({ resultado: 'reconectado', reconectado_em: new Date().toISOString() })
      .eq('id', followup.id)
    setMarcando(false)
    onUpdated()
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-lg shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-display font-semibold text-[#1C1C1C]">{followup.pacientes.nome}</p>
            <p className="text-xs text-muted mt-0.5">{formatarDataHora(followup.mensagem_enviada_em)}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${RESULTADO_CLASSES[followup.resultado]}`}>
              {RESULTADO_LABELS[followup.resultado]}
            </span>
          </div>

          <div>
            <p className="text-xs text-muted font-medium mb-1">Mensagem enviada</p>
            <p className="text-sm text-[#1C1C1C] whitespace-pre-wrap bg-[#F7F5F2] border border-border rounded-lg px-3 py-2">
              {followup.mensagem_completa}
            </p>
          </div>

          {followup.resposta_whatsapp && (
            <div>
              <p className="text-xs text-muted font-medium mb-1">
                Resposta{followup.resposta_em ? ` — ${formatarDataHora(followup.resposta_em)}` : ''}
              </p>
              <p className="text-sm text-[#1C1C1C] bg-[#F7F5F2] border border-border rounded-lg px-3 py-2">
                {followup.resposta_whatsapp}
              </p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 h-9 text-sm border border-border rounded-lg text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            Fechar
          </button>
          {followup.resultado !== 'reconectado' && (
            <button
              onClick={handleReconectado}
              disabled={marcando}
              className="px-4 h-9 text-sm bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {marcando ? 'Salvando...' : 'Marcar como Reconectado'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
