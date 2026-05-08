import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useReguaCobranca } from '@/hooks/useReguaCobranca'
import type { CobrancaEnviadaView, SessaoParaCobranca, StatusCobranca, EtapaCobranca } from '@/lib/types'

type Aba = 'sessoes' | 'historico'

function moeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataFormatada(iso: string) {
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

const statusLabel: Record<StatusCobranca, string> = {
  pendente:  'Pendente',
  agendado:  'Agendado',
  enviado:   'Enviado',
  falha:     'Falha',
  cancelado: 'Cancelado',
}

const statusColor: Record<StatusCobranca, string> = {
  pendente:  'bg-yellow-100 text-yellow-800',
  agendado:  'bg-blue-100 text-blue-800',
  enviado:   'bg-green-100 text-green-800',
  falha:     'bg-red-100 text-red-800',
  cancelado: 'bg-gray-100 text-gray-600',
}

export function CobrancaPage() {
  const {
    sessoesParaCobranca,
    cobracasEnviadas,
    loading,
    error,
    fetchSessoesParaCobranca,
    fetchCobracasEnviadas,
    enfileirarEEnviar,
    cancelarCobranca,
    reenviarFalha,
    marcarPago,
  } = useReguaCobranca()

  const [aba, setAba]               = useState<Aba>('sessoes')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [sendingKey, setSendingKey]   = useState<string | null>(null)
  const [retryingId, setRetryingId]   = useState<string | null>(null)
  const [cancelingId, setCancelingId] = useState<string | null>(null)
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null)

  useEffect(() => {
    fetchSessoesParaCobranca()
    fetchCobracasEnviadas()
  }, [])

  async function handleEnviar(sessaoId: string, etapa: EtapaCobranca) {
    const key = `${sessaoId}-${etapa}`
    setSendingKey(key)
    try {
      await enfileirarEEnviar(sessaoId, etapa)
    } finally {
      setSendingKey(null)
    }
  }

  async function handleReenviar(cobrancaId: string) {
    setRetryingId(cobrancaId)
    try {
      await reenviarFalha(cobrancaId)
    } finally {
      setRetryingId(null)
    }
  }

  async function handleCancelar(cobrancaId: string) {
    setCancelingId(cobrancaId)
    try {
      await cancelarCobranca(cobrancaId)
    } finally {
      setCancelingId(null)
    }
  }

  async function handleMarcarPago(sessaoId: string) {
    setMarkingPaidId(sessaoId)
    try {
      await marcarPago(sessaoId)
    } finally {
      setMarkingPaidId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <div className="w-6 h-6 border-2 border-[#2D6A6A] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Cobrança WhatsApp</h1>
        <p className="text-sm text-[#7A7A7A] mt-0.5">
          Régua de lembretes para sessões com pagamento pendente
        </p>
      </div>

      <div className="mb-5 bg-[#E8F4F4] border border-primary/20 rounded-xl px-4 py-3 text-sm text-primary">
        <p className="font-medium mb-1">Como funciona</p>
        <p className="text-primary/80 text-xs leading-relaxed">
          Sessões concluídas sem pagamento aparecem aqui. Expanda o card para enviar lembretes via WhatsApp em etapas (D+1, D+7...) e marque como pago quando receber.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-sm text-red-700 border border-red-200">
          Erro: {error}
        </div>
      )}

      <div className="flex gap-2 mb-5">
        {([
          { key: 'sessoes',   label: `Sessões Não Pagas (${sessoesParaCobranca.length})` },
          { key: 'historico', label: `Histórico de Envios (${cobracasEnviadas.length})` },
        ] as { key: Aba; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
              aba === key
                ? 'bg-[#2D6A6A] text-white'
                : 'bg-white border border-[#E4E0DA] text-[#7A7A7A] hover:text-[#1C1C1C]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === 'sessoes' && (
        <div className="flex flex-col gap-3">
          {sessoesParaCobranca.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#7A7A7A]">
              Nenhuma sessão com pagamento pendente
            </div>
          ) : (
            sessoesParaCobranca.map((sessao: SessaoParaCobranca) => {
              const nome = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Paciente'
              const isExpanded = expandedId === sessao.id
              return (
                <div key={sessao.id} className="bg-white rounded-xl border border-[#E4E0DA]">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                    onClick={() => setExpandedId(isExpanded ? null : sessao.id)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#1C1C1C]">{nome}</p>
                      <p className="text-xs text-[#7A7A7A] mt-0.5">
                        {dataFormatada(sessao.data_hora)} · {moeda(sessao.valor_cobrado)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          sessao.etapas_pendentes.length > 0
                            ? 'bg-[#C17F59]/10 text-[#C17F59]'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {sessao.etapas_pendentes.length} lembrete{sessao.etapas_pendentes.length !== 1 ? 's' : ''} pendente{sessao.etapas_pendentes.length !== 1 ? 's' : ''}
                      </span>
                      {isExpanded ? <ChevronUp size={16} className="text-[#7A7A7A]" /> : <ChevronDown size={16} className="text-[#7A7A7A]" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[#E4E0DA] px-4 py-3 space-y-2">
                      {sessao.etapas_pendentes.length === 0 ? (
                        <p className="text-xs text-[#7A7A7A]">Todos os lembretes já foram processados.</p>
                      ) : (
                        sessao.etapas_pendentes.map((etapa) => {
                          const key = `${sessao.id}-${etapa}`
                          return (
                            <div
                              key={etapa}
                              className="flex items-center justify-between p-2 bg-[#F7F5F2] rounded-lg"
                            >
                              <span className="text-xs font-semibold text-[#1C1C1C]">
                                Lembrete {etapa}
                              </span>
                              <button
                                onClick={() => handleEnviar(sessao.id, etapa)}
                                disabled={sendingKey === key}
                                className="h-7 px-3 rounded-lg bg-[#2D6A6A] text-white text-xs font-medium disabled:opacity-50 hover:bg-[#2D6A6A]/90 transition-colors"
                              >
                                {sendingKey === key ? 'Enviando...' : 'Enviar Agora'}
                              </button>
                            </div>
                          )
                        })
                      )}
                      <div className="pt-2 border-t border-[#E4E0DA]">
                        <button
                          onClick={() => handleMarcarPago(sessao.id)}
                          disabled={markingPaidId === sessao.id}
                          className="w-full h-9 rounded-lg border border-[#4CAF82] text-[#4CAF82] text-sm font-medium disabled:opacity-50 hover:bg-[#4CAF82]/5 transition-colors"
                        >
                          {markingPaidId === sessao.id ? 'Salvando...' : '✓ Marcar como Pago'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {aba === 'historico' && (
        <div className="flex flex-col gap-3">
          {cobracasEnviadas.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#7A7A7A]">
              Nenhum envio registrado
            </div>
          ) : (
            cobracasEnviadas.map((c: CobrancaEnviadaView) => {
              const nome =
                c.sessoes?.pacientes?.nome ??
                (c.sessoes as any)?.avulso_nome ??
                'Paciente'
              return (
                <div key={c.id} className="bg-white rounded-xl border border-[#E4E0DA] p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#1C1C1C]">{nome}</p>
                      <p className="text-xs text-[#7A7A7A] mt-0.5">
                        Lembrete {c.etapa} · {dataFormatada(c.data_agendado)}
                      </p>
                      {c.data_enviado && (
                        <p className="text-xs text-[#4CAF82] mt-0.5">
                          Enviado em {dataFormatada(c.data_enviado)}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[c.status]}`}>
                      {statusLabel[c.status]}
                    </span>
                  </div>

                  {c.erro_detalhes && (
                    <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-700">
                      {c.erro_detalhes}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    {c.status === 'falha' && (
                      <button
                        onClick={() => handleReenviar(c.id)}
                        disabled={retryingId === c.id}
                        className="h-7 px-3 rounded-lg bg-[#2D6A6A] text-white text-xs font-medium disabled:opacity-50 hover:bg-[#2D6A6A]/90 transition-colors"
                      >
                        {retryingId === c.id ? 'Reenviando...' : 'Tentar Novamente'}
                      </button>
                    )}
                    {c.status === 'pendente' && (
                      <button
                        onClick={() => handleCancelar(c.id)}
                        disabled={cancelingId === c.id}
                        className="h-7 px-3 rounded-lg border border-[#E07070] text-[#E07070] text-xs font-medium disabled:opacity-50 hover:bg-[#E07070]/5 transition-colors"
                      >
                        {cancelingId === c.id ? 'Cancelando...' : 'Cancelar'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
