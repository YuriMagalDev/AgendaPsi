import type { SessaoStatus } from './types'

export const STATUS_CONFIG: Record<SessaoStatus, { label: string; cor: string }> = {
  agendada:   { label: 'Agendada',   cor: '#9CA3AF' },
  confirmada: { label: 'Confirmada', cor: '#2D6A6A' },
  concluida:  { label: 'Concluída',  cor: '#4CAF82' },
  faltou:     { label: 'Faltou',     cor: '#C17F59' },
  cancelada:  { label: 'Cancelada',  cor: '#E07070' },
  remarcada:  { label: 'Remarcada',  cor: '#9B7EC8' },
}
