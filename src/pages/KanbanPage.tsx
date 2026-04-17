import { useState } from 'react'
import { ChevronLeft, ChevronRight, X, CheckCircle2 } from 'lucide-react'
import { startOfWeek, addWeeks, subWeeks, addDays, format, isSameWeek } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { useSemana } from '@/hooks/useSemana'
import { useConfigPsicologo } from '@/hooks/useConfigPsicologo'
import { SemanaGrid } from '@/components/semana/SemanaGrid'
import { NovaSessaoModal } from '@/components/sessao/NovaSessaoModal'
import { STATUS_CONFIG } from '@/lib/statusConfig'
import { RemarcarModal } from '@/components/sessao/RemarcarModal'
import type { FormaPagamento, SessaoStatus, SessaoView } from '@/lib/types'

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Débito' },
  { value: 'cartao_credito', label: 'Crédito' },
]

function parseHora(t: string | null | undefined, fallback: number): number {
  if (!t) return fallback
  const h = parseInt(t.split(':')[0], 10)
  return isNaN(h) ? fallback : h
}

const STATUS_ACOES: Partial<Record<SessaoStatus, SessaoStatus[]>> = {
  agendada:   ['confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada'],
  confirmada: ['concluida', 'faltou', 'cancelada', 'remarcada'],
}

function SessaoPanel({
  sessao,
  onClose,
  onUpdate,
}: {
  sessao: SessaoView
  onClose: () => void
  onUpdate: () => void
}) {
  const [remarcarAberto, setRemarcarAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(
    (sessao.forma_pagamento as FormaPagamento | null) ?? null
  )
  const [valorPagamento, setValorPagamento] = useState(
    sessao.valor_cobrado != null ? String(sessao.valor_cobrado) : ''
  )
  const acoes = STATUS_ACOES[sessao.status]
  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const cfg = STATUS_CONFIG[sessao.status]
  const mostrarPagamento = sessao.status === 'concluida' || acoes?.includes('concluida')

  async function atualizar(novoStatus: SessaoStatus) {
    setSalvando(true)
    await supabase.from('sessoes').update({ status: novoStatus }).eq('id', sessao.id)
    onUpdate()
    onClose()
  }

  async function remarcar(novaDataHora: string) {
    setSalvando(true)
    setErro(null)
    try {
      const { error: updateError } = await supabase
        .from('sessoes')
        .update({ status: 'remarcada', remarcada_para: novaDataHora })
        .eq('id', sessao.id)
      if (updateError) throw updateError

      const { error: insertError } = await supabase.from('sessoes').insert({
        paciente_id: sessao.paciente_id,
        avulso_nome: sessao.avulso_nome,
        avulso_telefone: sessao.avulso_telefone,
        modalidade_id: sessao.modalidade_id,
        data_hora: novaDataHora,
        status: 'agendada',
        valor_cobrado: sessao.valor_cobrado,
        pago: false,
        data_pagamento: null,
        remarcada_para: null,
        sessao_origem_id: sessao.id,
      })
      if (insertError) {
        await supabase
          .from('sessoes')
          .update({ status: sessao.status, remarcada_para: null })
          .eq('id', sessao.id)
        throw insertError
      }

      onUpdate()
      onClose()
    } catch {
      setErro('Erro ao remarcar. Tente novamente.')
      setSalvando(false)
    }
  }

  async function confirmarPagamento() {
    if (!formaPagamento) return
    setSalvando(true)
    await supabase.from('sessoes').update({
      pago: true,
      forma_pagamento: formaPagamento,
      valor_cobrado: valorPagamento ? Number(valorPagamento) : null,
      data_pagamento: new Date().toISOString(),
    }).eq('id', sessao.id)
    onUpdate()
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-surface rounded-card border border-border w-full max-w-sm p-5 shadow-lg">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="font-medium text-[#1C1C1C]">{nomePaciente}</p>
              <p className="text-xs text-muted mt-0.5">
                {format(new Date(sessao.data_hora), "EEEE, d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
              </p>
              <span
                className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
                style={{ backgroundColor: `${cfg.cor}20`, color: cfg.cor }}
              >
                {cfg.label}
              </span>
            </div>
            <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors ml-4">
              <X size={18} />
            </button>
          </div>

          {acoes ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">Alterar status</p>
              <div className="flex flex-wrap gap-2">
                {acoes.filter(s => s !== 'remarcada').map(s => (
                  <button
                    key={s}
                    disabled={salvando}
                    onClick={() => atualizar(s)}
                    className="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                    style={{ borderColor: STATUS_CONFIG[s].cor, color: STATUS_CONFIG[s].cor }}
                  >
                    {STATUS_CONFIG[s].label}
                  </button>
                ))}
                <button
                  disabled={salvando}
                  onClick={() => setRemarcarAberto(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50"
                  style={{ borderColor: STATUS_CONFIG.remarcada.cor, color: STATUS_CONFIG.remarcada.cor }}
                >
                  Remarcar
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted text-center py-2">Sessão já finalizada.</p>
          )}

          {mostrarPagamento && (
            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
              <p className="text-xs text-muted font-medium uppercase tracking-wide">Pagamento</p>
              {sessao.pago ? (
                <div className="flex items-center gap-2 text-sm text-[#4CAF82]">
                  <CheckCircle2 size={16} />
                  <span>Pago{sessao.forma_pagamento ? ` — ${FORMAS_PAGAMENTO.find(f => f.value === sessao.forma_pagamento)?.label ?? sessao.forma_pagamento}` : ''}</span>
                  {sessao.valor_cobrado != null && (
                    <span className="ml-auto font-medium">R$ {sessao.valor_cobrado.toFixed(2)}</span>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {FORMAS_PAGAMENTO.map(f => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setFormaPagamento(f.value)}
                        className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                          formaPagamento === f.value
                            ? 'bg-primary text-white border-primary'
                            : 'border-border text-[#1C1C1C] hover:border-primary'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Valor (R$)"
                      value={valorPagamento}
                      onChange={e => setValorPagamento(e.target.value)}
                      className="flex-1 h-9 px-3 rounded-lg border border-border text-sm outline-none focus:border-primary"
                    />
                    <button
                      disabled={!formaPagamento || salvando}
                      onClick={confirmarPagamento}
                      className="px-4 h-9 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
                    >
                      Confirmar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {erro && <p className="text-xs text-[#E07070] text-center mt-2">{erro}</p>}
        </div>
      </div>

      {remarcarAberto && (
        <RemarcarModal
          sessao={sessao}
          onClose={() => setRemarcarAberto(false)}
          onConfirmar={async (novaDataHora) => {
            setRemarcarAberto(false)
            await remarcar(novaDataHora)
          }}
        />
      )}
    </>
  )
}

export function KanbanPage() {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  )
  const [modalAberto, setModalAberto] = useState(false)
  const [defaultDateTime, setDefaultDateTime] = useState<string | undefined>()
  const [sessaoSelecionada, setSessaoSelecionada] = useState<SessaoView | null>(null)

  const { sessoes, loading, refetch } = useSemana(weekStart)
  const { config } = useConfigPsicologo()
  const horaInicio = parseHora(config?.horario_inicio, 7)
  const horaFim = parseHora(config?.horario_fim, 21)

  const isEstaSemana = isSameWeek(weekStart, new Date(), { weekStartsOn: 1 })
  const labelSemana =
    format(weekStart, "d MMM", { locale: ptBR }) +
    ' – ' +
    format(addDays(weekStart, 6), "d MMM yyyy", { locale: ptBR })

  function handleCelulaClick(dataHora: string) {
    setDefaultDateTime(dataHora)
    setModalAberto(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(w => subWeeks(w, 1))}
            className="p-1.5 rounded-lg text-muted hover:text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-[#1C1C1C] capitalize min-w-[160px] text-center">
            {labelSemana}
          </span>
          <button
            onClick={() => setWeekStart(w => addWeeks(w, 1))}
            className="p-1.5 rounded-lg text-muted hover:text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          {!isEstaSemana && (
            <button
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="text-xs text-primary hover:underline ml-1"
            >
              Esta semana
            </button>
          )}
        </div>
        <button
          onClick={() => { setDefaultDateTime(undefined); setModalAberto(true) }}
          className="bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          + Nova sessão
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <SemanaGrid
          weekStart={weekStart}
          sessoes={sessoes}
          loading={loading}
          horaInicio={horaInicio}
          horaFim={horaFim}
          onCelulaClick={handleCelulaClick}
          onSessaoClick={setSessaoSelecionada}
        />
      </div>

      {/* Modals */}
      {modalAberto && (
        <NovaSessaoModal
          defaultDate={defaultDateTime}
          onClose={() => setModalAberto(false)}
          onSaved={() => { refetch(); setModalAberto(false) }}
        />
      )}
      {sessaoSelecionada && (
        <SessaoPanel
          sessao={sessaoSelecionada}
          onClose={() => setSessaoSelecionada(null)}
          onUpdate={refetch}
        />
      )}
    </div>
  )
}
