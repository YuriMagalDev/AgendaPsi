import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { SessaoView } from '@/lib/types'
import { STATUS_CONFIG } from '@/lib/statusConfig'
import { EmojiTooltip } from '@/components/ui/emoji-tooltip'

interface Props {
  sessao: SessaoView
  onClick?: () => void
  compact?: boolean
}

export function SessaoCard({ sessao, onClick, compact }: Props) {
  const cfg = STATUS_CONFIG[sessao.status]
  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const horario = format(new Date(sessao.data_hora), 'HH:mm', { locale: ptBR })

  if (compact) {
    return (
      <div
        onClick={onClick}
        className="bg-surface rounded border border-border px-1.5 py-0.5 cursor-pointer hover:shadow-sm transition-shadow overflow-hidden"
        style={{ borderLeftWidth: 3, borderLeftColor: cfg.cor }}
      >
        <p className="text-[11px] font-medium text-[#1C1C1C] truncate leading-tight">{nomePaciente}</p>
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-card border border-border p-3 cursor-pointer hover:shadow-sm transition-shadow"
      style={{ borderLeftWidth: 3, borderLeftColor: cfg.cor }}
    >
      <p className="text-sm font-medium text-[#1C1C1C] leading-tight">{nomePaciente}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted">{horario}</span>
        <span className="inline-flex gap-1">
          {sessao.modalidades_sessao && (
            <EmojiTooltip label={sessao.modalidades_sessao.nome}>
              {sessao.modalidades_sessao.emoji}
            </EmojiTooltip>
          )}
          {sessao.meios_atendimento && (
            <EmojiTooltip label={sessao.meios_atendimento.nome}>
              {sessao.meios_atendimento.emoji}
            </EmojiTooltip>
          )}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {sessao.valor_cobrado != null && (
            <span className="text-xs font-mono text-muted">
              {sessao.valor_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </span>
          )}
          {sessao.status === 'concluida' && !sessao.pago && (
            <span className="text-xs text-[#C17F59] font-medium">· pendente</span>
          )}
        </span>
      </div>
    </div>
  )
}
