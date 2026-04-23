// src/pages/FinanceiroPacientePage.tsx
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { addMonths, subMonths, startOfMonth, format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowLeft } from 'lucide-react'
import { useFinanceiroPaciente } from '@/hooks/useFinanceiroPaciente'
import { STATUS_CONFIG } from '@/lib/statusConfig'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function FinanceiroPacientePage() {
  const { id } = useParams<{ id: string }>()
  const [mes, setMes] = useState(() => startOfMonth(new Date()))
  const { paciente, sessoesMes, totalHistorico, totalPendente, loading } =
    useFinanceiroPaciente(id!, mes)

  const tituloMes = format(mes, "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/financeiro" className="text-muted hover:text-[#1C1C1C] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl font-semibold text-[#1C1C1C] truncate">
            {paciente?.nome ?? '—'}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            {paciente?.tipo === 'convenio' && paciente.convenios && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#9B7EC8]/10 text-[#9B7EC8]">
                {paciente.convenios.nome}
              </span>
            )}
            {paciente?.tipo === 'particular' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                Particular
              </span>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Histórico pago', valor: totalHistorico, cor: '#4CAF82' },
              { label: 'Em aberto', valor: totalPendente, cor: '#C17F59' },
              { label: 'Sessões no mês', valor: sessoesMes.length, cor: '#2D6A6A', isMoeda: false },
            ].map(k => (
              <div key={k.label} className="bg-surface rounded-card border border-border p-3"
                style={{ borderLeftWidth: 3, borderLeftColor: k.cor }}>
                <p className="text-xs text-muted leading-tight mb-1">{k.label}</p>
                <p className="text-base font-semibold font-mono text-[#1C1C1C]">
                  {k.isMoeda === false ? k.valor : moeda(k.valor as number)}
                </p>
              </div>
            ))}
          </div>

          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium capitalize">{tituloMes}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setMes(m => startOfMonth(subMonths(m, 1)))}
                className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-[#1C1C1C] text-xs transition-colors"
              >
                ◀
              </button>
              <button
                onClick={() => setMes(m => startOfMonth(addMonths(m, 1)))}
                className="w-7 h-7 flex items-center justify-center rounded border border-border text-muted hover:text-[#1C1C1C] text-xs transition-colors"
              >
                ▶
              </button>
            </div>
          </div>

          {/* Sessions list */}
          {sessoesMes.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted">Nenhuma sessão neste mês.</p>
          ) : (
            <div className="bg-surface rounded-card border border-border overflow-hidden">
              {sessoesMes.map(s => {
                const cfg = STATUS_CONFIG[s.status]
                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0"
                    style={{ borderLeftWidth: 3, borderLeftColor: cfg.cor }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#1C1C1C]">
                        {format(new Date(s.data_hora), "dd 'de' MMMM, HH:mm", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted">
                        {s.modalidades_sessao && `${s.modalidades_sessao.emoji} ${s.modalidades_sessao.nome}`}
                        {s.modalidades_sessao && s.meios_atendimento && ' · '}
                        {s.meios_atendimento && `${s.meios_atendimento.emoji} ${s.meios_atendimento.nome}`}
                        {(s.modalidades_sessao || s.meios_atendimento) && ' · '}
                        {cfg.label}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {s.valor_cobrado != null && (
                        <p className="text-sm font-mono font-medium">{moeda(s.valor_cobrado)}</p>
                      )}
                      {s.status === 'concluida' && (
                        <p className={`text-xs mt-0.5 ${s.pago ? 'text-[#4CAF82]' : 'text-[#C17F59]'}`}>
                          {s.pago ? 'Pago' : 'Pendente'}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
