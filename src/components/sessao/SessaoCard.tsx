import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { SessaoStatus, SessaoView } from '@/lib/types'

const statusConfig: Record<SessaoStatus, { label: string; cor: string }> = {
  agendada:   { label: 'Agendada',    cor: '#9CA3AF' },
  confirmada: { label: 'Confirmada',  cor: '#2D6A6A' },
  concluida:  { label: 'Concluída',   cor: '#4CAF82' },
  faltou:     { label: 'Faltou',      cor: '#C17F59' },
  cancelada:  { label: 'Cancelada',   cor: '#E07070' },
  remarcada:  { label: 'Remarcada',   cor: '#9B7EC8' },
}

interface Props {
  sessao: SessaoView
  onClick?: () => void
}

export function SessaoCard({ sessao, onClick }: Props) {
  const cfg = statusConfig[sessao.status]
  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const horario = format(new Date(sessao.data_hora), 'HH:mm', { locale: ptBR })

  return (
    <div
      onClick={onClick}
      className="bg-surface rounded-card border border-border p-3 cursor-pointer hover:shadow-sm transition-shadow"
      style={{ borderLeftWidth: 3, borderLeftColor: cfg.cor }}
    >
      <p className="text-sm font-medium text-[#1C1C1C] leading-tight">{nomePaciente}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted">{horario}</span>
        {sessao.modalidades?.nome && (
          <span className="text-xs text-muted">· {sessao.modalidades.nome}</span>
        )}
        {sessao.valor_cobrado != null && (
          <span className="text-xs font-mono text-muted ml-auto">
            {sessao.valor_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </span>
        )}
      </div>
    </div>
  )
}
