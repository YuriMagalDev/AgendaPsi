import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Archive, Phone, Mail, Calendar, Banknote } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { usePacienteDetalhe } from '@/hooks/usePacienteDetalhe'
import type { SessaoStatus, ContratoTipo } from '@/lib/types'

const statusConfig: Record<SessaoStatus, { label: string; color: string }> = {
  agendada:   { label: 'Scheduled',   color: '#9CA3AF' },
  confirmada: { label: 'Confirmed', color: '#2D6A6A' },
  concluida:  { label: 'Completed',  color: '#4CAF82' },
  faltou:     { label: 'Missed',     color: '#C17F59' },
  cancelada:  { label: 'Canceled',  color: '#E07070' },
  remarcada:  { label: 'Rescheduled',  color: '#9B7EC8' },
}

const contratoDescricao = (tipo: ContratoTipo, valor: number, qtd?: number | null, dia?: number | null) => {
  const valorFmt = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (tipo === 'por_sessao') return `${valorFmt} per session`
  if (tipo === 'pacote') return `${qtd ?? '?'} sessions for ${valorFmt}`
  return `${valorFmt}/month — due day ${dia ?? '?'}`
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface rounded-card border border-border p-4 flex flex-col gap-1">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold text-[#1C1C1C] font-mono">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  )
}

export function PacienteDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { paciente, sessoes, contrato, stats, loading, arquivar, error } = usePacienteDetalhe(id!)

  async function handleArquivar() {
    if (!window.confirm(`Archive ${paciente?.nome}? The session history will be kept.`)) return
    try {
      await arquivar()
      navigate('/pacientes')
    } catch {
      alert('Error archiving. Try again.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-[#E07070] mb-2">Error loading patient data.</p>
        <Link to="/pacientes" className="text-primary text-sm hover:underline">
          Back to Patients
        </Link>
      </div>
    )
  }

  if (!paciente) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted">Patient not found.</p>
        <Link to="/pacientes" className="text-primary text-sm mt-2 inline-block hover:underline">
          Back to Patients
        </Link>
      </div>
    )
  }

  const idade = paciente.data_nascimento
    ? differenceInYears(new Date(), new Date(paciente.data_nascimento))
    : null

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/pacientes" className="text-muted hover:text-[#1C1C1C] transition-colors mt-0.5">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">{paciente.nome}</h1>
            {idade !== null && (
              <p className="text-sm text-muted">{idade} years old</p>
            )}
          </div>
        </div>
        <button
          onClick={handleArquivar}
          className="flex items-center gap-1.5 text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg hover:text-[#1C1C1C] transition-colors"
        >
          <Archive size={15} />
          Archive
        </button>
      </div>

      {/* Contact */}
      <div className="bg-surface rounded-card border border-border p-4 mb-4 flex flex-col gap-2">
        {paciente.telefone && (
          <div className="flex items-center gap-2 text-sm text-[#1C1C1C]">
            <Phone size={14} className="text-muted shrink-0" />
            {paciente.telefone}
          </div>
        )}
        {paciente.email && (
          <div className="flex items-center gap-2 text-sm text-[#1C1C1C]">
            <Mail size={14} className="text-muted shrink-0" />
            {paciente.email}
          </div>
        )}
        {paciente.data_nascimento && (
          <div className="flex items-center gap-2 text-sm text-[#1C1C1C]">
            <Calendar size={14} className="text-muted shrink-0" />
            {format(new Date(paciente.data_nascimento), "MMMM d', 'yyyy", { locale: ptBR })}
          </div>
        )}
        {!paciente.telefone && !paciente.email && !paciente.data_nascimento && (
          <p className="text-sm text-muted">No contact data registered.</p>
        )}
      </div>

      {/* Active contract */}
      {contrato && (
        <div className="bg-primary-light rounded-card border border-primary/20 p-4 mb-4 flex items-center gap-2">
          <Banknote size={16} className="text-primary shrink-0" />
          <p className="text-sm text-primary font-medium">
            {contratoDescricao(contrato.tipo, contrato.valor, contrato.qtd_sessoes, contrato.dia_vencimento)}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Total sessions" value={stats.total} />
        <StatCard label="Completed" value={stats.concluidas} />
        <StatCard label="Missed" value={stats.faltas} />
        <StatCard
          label="Total paid"
          value={stats.totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        />
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Session history</h2>

        {sessoes.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted">No sessions registered.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessoes.map(s => {
              const cfg = statusConfig[s.status]
              return (
                <div
                  key={s.id}
                  className="bg-surface rounded-card border border-border p-4 flex items-center justify-between"
                  style={{ borderLeftWidth: 3, borderLeftColor: cfg.color }}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
                      >
                        {cfg.label}
                      </span>
                      {s.modalidades?.nome && (
                        <span className="text-xs text-muted">{s.modalidades.nome}</span>
                      )}
                    </div>
                    <p className="text-sm text-[#1C1C1C]">
                      {format(new Date(s.data_hora), "d MMM yyyy 'at' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    {s.valor_cobrado != null && (
                      <p className="text-sm font-mono font-medium text-[#1C1C1C]">
                        {s.valor_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    )}
                    {s.pago && (
                      <p className="text-xs text-[#4CAF82] mt-0.5">Paid</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
