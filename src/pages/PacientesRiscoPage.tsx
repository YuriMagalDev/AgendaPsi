import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Settings, AlertTriangle, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRiscoConfig } from '@/hooks/useRiscoConfig'
import { usePacientesEmRisco } from '@/hooks/usePacientesEmRisco'
import { SendFollowupModal } from '@/components/pacientes/SendFollowupModal'
import { FollowupDetailModal } from '@/components/pacientes/FollowupDetailModal'
import type { PacienteEmRisco, RiscoFollowup } from '@/lib/types'

type Tab = 'listagem' | 'historico'

type FollowupWithPaciente = RiscoFollowup & { pacientes: { nome: string } }

const RISK_LEVEL_CLASSES: Record<PacienteEmRisco['risk_level'], string> = {
  Alto: 'bg-accent/15 text-accent',
  Médio: 'bg-primary-light text-primary',
}

function formatarData(iso: string | null): string {
  if (!iso) return 'Nenhuma sessão registrada'
  return new Date(iso).toLocaleDateString('pt-BR')
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

export function PacientesRiscoPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('listagem')
  const { config } = useRiscoConfig()
  const { pacientes, loading, refetch } = usePacientesEmRisco(config)
  const [sendTarget, setSendTarget] = useState<PacienteEmRisco | null>(null)
  const [detailTarget, setDetailTarget] = useState<FollowupWithPaciente | null>(null)

  const [historico, setHistorico] = useState<FollowupWithPaciente[]>([])
  const [historicoLoading, setHistoricoLoading] = useState(false)

  async function fetchHistorico() {
    setHistoricoLoading(true)
    const { data } = await supabase
      .from('risco_followups')
      .select('*, pacientes(nome)')
      .order('mensagem_enviada_em', { ascending: false })
    setHistorico((data ?? []) as FollowupWithPaciente[])
    setHistoricoLoading(false)
  }

  useEffect(() => {
    if (tab !== 'historico') return
    fetchHistorico()
  }, [tab])

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Pacientes em Risco</h1>
          <p className="text-sm text-muted mt-1">Pacientes com padrão de abandono detectado</p>
        </div>
        <button
          onClick={() => navigate('/configuracoes')}
          className="flex items-center gap-1.5 text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg transition-colors"
        >
          <Settings size={14} />
          Configurar
        </button>
      </div>

      <div className="flex gap-1 mb-6 p-1 bg-[#F7F5F2] rounded-lg border border-border w-fit">
        {(['listagem', 'historico'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-surface text-[#1C1C1C] shadow-sm border border-border'
                : 'text-muted hover:text-[#1C1C1C]'
            }`}
          >
            {t === 'listagem' ? 'Listagem' : 'Histórico'}
          </button>
        ))}
      </div>

      {tab === 'listagem' && (
        <>
          {loading && (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && pacientes.length === 0 && (
            <div className="text-center py-16">
              <UserRound size={40} className="text-border mx-auto mb-3" />
              <p className="text-muted text-sm">Nenhum paciente em risco detectado</p>
            </div>
          )}

          {!loading && pacientes.length > 0 && (
            <div className="flex flex-col gap-3">
              {pacientes.map(p => (
                <div
                  key={p.id}
                  className={`bg-surface rounded-card border border-border shadow-sm border-l-4 ${
                    p.risk_level === 'Alto' ? 'border-l-accent' : 'border-l-primary'
                  } p-4`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-[#1C1C1C] truncate">{p.nome}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${RISK_LEVEL_CLASSES[p.risk_level]}`}>
                          {p.risk_level}
                        </span>
                      </div>

                      {p.triggers.length > 0 && (
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {p.triggers.map((trigger, i) => (
                            <li key={i} className="flex items-center gap-1.5 text-xs text-muted">
                              <AlertTriangle size={10} className="text-accent shrink-0" />
                              {trigger.motivo}
                            </li>
                          ))}
                        </ul>
                      )}

                      <p className="text-xs text-muted mt-2">
                        {p.ultima_sessao_data_hora
                          ? `Última sessão: ${formatarData(p.ultima_sessao_data_hora)}`
                          : 'Nenhuma sessão registrada'}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {!p.telefone ? (
                        <div title="Sem telefone cadastrado">
                          <button
                            disabled
                            className="text-sm px-3 py-1.5 rounded-lg bg-primary text-white font-medium opacity-40 cursor-not-allowed"
                          >
                            Enviar mensagem
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSendTarget(p)}
                          className="text-sm px-3 py-1.5 rounded-lg bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                        >
                          Enviar mensagem
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'historico' && (
        <>
          {historicoLoading && (
            <div className="flex justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!historicoLoading && historico.length === 0 && (
            <div className="text-center py-16">
              <p className="text-muted text-sm">Nenhuma mensagem enviada ainda</p>
            </div>
          )}

          {!historicoLoading && historico.length > 0 && (
            <div className="flex flex-col gap-2">
              {historico.map(f => (
                <div
                  key={f.id}
                  className="bg-surface rounded-card border border-border shadow-sm p-4 flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-[#1C1C1C] text-sm truncate">{f.pacientes.nome}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${RESULTADO_CLASSES[f.resultado]}`}>
                        {RESULTADO_LABELS[f.resultado]}
                      </span>
                    </div>
                    <p className="text-xs text-muted truncate max-w-sm">
                      {f.mensagem_completa.slice(0, 80)}{f.mensagem_completa.length > 80 ? '…' : ''}
                    </p>
                    <p className="text-xs text-muted mt-1">{formatarDataHora(f.mensagem_enviada_em)}</p>
                  </div>
                  <button
                    onClick={() => setDetailTarget(f)}
                    className="text-xs text-primary font-medium hover:underline shrink-0"
                  >
                    Ver detalhes
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {sendTarget && (
        <SendFollowupModal
          paciente={sendTarget}
          onClose={() => setSendTarget(null)}
          onSent={() => { setSendTarget(null); refetch() }}
        />
      )}

      {detailTarget && (
        <FollowupDetailModal
          followup={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdated={() => {
            setDetailTarget(null)
            fetchHistorico()
          }}
        />
      )}
    </div>
  )
}
