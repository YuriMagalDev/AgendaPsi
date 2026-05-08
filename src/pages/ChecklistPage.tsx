import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { triggerGoogleCalendarSync } from '@/lib/googleCalendarSync'
import { useSessoesDia } from '@/hooks/useSessoesDia'
import { RemarcarModal } from '@/components/sessao/RemarcarModal'
import type { FormaPagamento, SessaoStatus, SessaoView } from '@/lib/types'

const TODAY = format(new Date(), 'yyyy-MM-dd')

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Débito' },
  { value: 'cartao_credito', label: 'Crédito' },
]

type StatusUpdate = { id: string; status: SessaoStatus }
type PagamentoUpdate = { id: string; pago: boolean; forma_pagamento: FormaPagamento | null; valor_cobrado: number | null }

function getStatusColor(s: SessaoStatus): string {
  const map: Record<SessaoStatus, string> = {
    agendada: '#9CA3AF', confirmada: '#2D6A6A', concluida: '#4CAF82',
    faltou: '#C17F59', cancelada: '#E07070', remarcada: '#9B7EC8',
  }
  return map[s]
}

function SessaoChecklist({ sessao, update, pagamento, onUpdate, onPagamento, onRemarcar, disabled, semConfirmacao }: {
  sessao: SessaoView
  update: StatusUpdate | undefined
  pagamento: PagamentoUpdate | undefined
  onUpdate: (u: StatusUpdate) => void
  onPagamento: (p: PagamentoUpdate) => void
  onRemarcar: () => void
  disabled?: boolean
  semConfirmacao?: boolean
}) {
  const novoStatus = update?.status
  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const horario = format(new Date(sessao.data_hora), 'HH:mm', { locale: ptBR })

  const statusEfetivo = novoStatus ?? sessao.status
  const mostrarPagamento = statusEfetivo === 'concluida'
  const pagamentoEfetivo = pagamento ?? {
    id: sessao.id,
    pago: sessao.pago,
    forma_pagamento: sessao.forma_pagamento as FormaPagamento | null,
    valor_cobrado: sessao.valor_cobrado,
  }

  const [notas, setNotas] = useState(sessao.notas_checklist ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  function handleNotasChange(val: string) {
    if (val.length > 200) return
    setNotas(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      const { error } = await supabase.from('sessoes').update({ notas_checklist: val || null }).eq('id', sessao.id)
      if (!error) await triggerGoogleCalendarSync('sync_update', sessao.id)
    }, 500)
  }

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
          <p className="text-xs text-muted">{horario} · {sessao.modalidades_sessao?.nome}</p>
        </div>
        <div className="flex items-center gap-2">
          {semConfirmacao && !novoStatus && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#C17F59]/10 text-[#C17F59]">
              Não confirmou
            </span>
          )}
          {novoStatus && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{ backgroundColor: `${getStatusColor(novoStatus)}20`, color: getStatusColor(novoStatus) }}>
              {novoStatus.charAt(0).toUpperCase() + novoStatus.slice(1)}
            </span>
          )}
        </div>
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
        <button
          onClick={onRemarcar}
          disabled={disabled}
          className="text-xs px-3 py-1 rounded-lg border transition-colors disabled:opacity-50"
          style={{ borderColor: '#9B7EC8', color: '#9B7EC8' }}
        >
          Remarcar
        </button>
      </div>

      {/* Notes */}
      <div className="mt-3">
        <textarea
          value={notas}
          onChange={e => handleNotasChange(e.target.value)}
          placeholder="Ex: paciente pediu remarcar"
          rows={2}
          className="w-full px-2 py-1.5 text-xs rounded border border-border bg-bg outline-none focus:border-primary resize-none"
        />
        <p className="text-right text-xs text-muted mt-0.5">{notas.length}/200</p>
      </div>

      {mostrarPagamento && (
        <div className="mt-3 pt-3 border-t border-border flex flex-col gap-2">
          <p className="text-xs text-muted font-medium uppercase tracking-wide">Pagamento</p>
          {pagamentoEfetivo.pago ? (
            <div className="flex items-center gap-2 text-sm text-[#4CAF82]">
              <CheckCircle2 size={15} />
              <span>Pago{pagamentoEfetivo.forma_pagamento ? ` — ${FORMAS_PAGAMENTO.find(f => f.value === pagamentoEfetivo.forma_pagamento)?.label}` : ''}</span>
              {pagamentoEfetivo.valor_cobrado != null && (
                <span className="ml-auto font-medium font-mono text-xs">
                  R$ {pagamentoEfetivo.valor_cobrado.toFixed(2)}
                </span>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {FORMAS_PAGAMENTO.map(f => (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => onPagamento({ ...pagamentoEfetivo, forma_pagamento: f.value })}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                      pagamentoEfetivo.forma_pagamento === f.value
                        ? 'bg-primary text-white border-primary'
                        : 'border-border text-[#1C1C1C] hover:border-primary'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onPagamento({ ...pagamentoEfetivo, pago: true, forma_pagamento: pagamentoEfetivo.forma_pagamento })}
                  disabled={!pagamentoEfetivo.forma_pagamento}
                  className="text-xs px-2.5 py-1 rounded-lg bg-[#4CAF82]/10 border border-[#4CAF82] text-[#4CAF82] disabled:opacity-40 transition-colors ml-auto"
                >
                  Confirmar pago
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Valor cobrado (R$)"
                value={pagamentoEfetivo.valor_cobrado ?? ''}
                onChange={e => onPagamento({ ...pagamentoEfetivo, valor_cobrado: e.target.value ? Number(e.target.value) : null })}
                className="h-7 px-2 text-xs rounded border border-border outline-none focus:border-primary w-full"
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

export function ChecklistPage() {
  const { sessoes, loading, error, refetch } = useSessoesDia(TODAY)
  const [updates, setUpdates] = useState<StatusUpdate[]>([])
  const [pagamentos, setPagamentos] = useState<PagamentoUpdate[]>([])
  const [salvando, setSalvando] = useState(false)
  const [remarcarSessao, setRemarcarSessao] = useState<SessaoView | null>(null)
  const [salvandoRemarcar, setSalvandoRemarcar] = useState(false)
  const [erroRemarcar, setErroRemarcar] = useState<string | null>(null)
  const [sessoesComAlerta, setSessoesComAlerta] = useState<Set<string>>(new Set())
  const [checklistConcluido, setChecklistConcluido] = useState(false)

  useEffect(() => {
    async function fetchAlertas() {
      const { data, error: alertaError } = await supabase
        .from('confirmacoes_whatsapp')
        .select('sessao_id')
        .eq('tipo', 'alerta_sem_resposta')
        .gte('mensagem_enviada_em', `${TODAY}T00:00:00`)
        .lte('mensagem_enviada_em', `${TODAY}T23:59:59`)
      if (alertaError) console.error('fetchAlertas:', alertaError.message)
      setSessoesComAlerta(new Set((data ?? []).map((r: any) => r.sessao_id)))
    }
    fetchAlertas()
  }, [])

  const pendentes = sessoes.filter(s => s.status === 'agendada' || s.status === 'confirmada')
  const finalizadas = sessoes.filter(s => s.status !== 'agendada' && s.status !== 'confirmada')

  useEffect(() => {
    if (!loading) {
      setChecklistConcluido(pendentes.length === 0 && sessoes.length > 0)
    }
  }, [loading, pendentes.length])

  const totalAlteracoes = updates.length + pagamentos.filter(p => p.pago).length

  function handleUpdate(u: StatusUpdate) {
    setUpdates(prev => [...prev.filter(x => x.id !== u.id), u])
  }

  function handlePagamento(p: PagamentoUpdate) {
    setPagamentos(prev => [...prev.filter(x => x.id !== p.id), p])
  }

  async function handleRemarcar(sessao: SessaoView, novaDataHora: string) {
    setSalvandoRemarcar(true)
    setErroRemarcar(null)
    try {
      const { error: updateError } = await supabase
        .from('sessoes')
        .update({ status: 'remarcada' })
        .eq('id', sessao.id)
      if (updateError) throw updateError
      const { data: novaSessao, error: insertError } = await supabase.from('sessoes').insert({
        paciente_id: sessao.paciente_id,
        avulso_nome: sessao.avulso_nome,
        avulso_telefone: sessao.avulso_telefone,
        modalidade_sessao_id: sessao.modalidade_sessao_id,
        meio_atendimento_id: sessao.meio_atendimento_id,
        data_hora: novaDataHora,
        status: 'agendada',
        valor_cobrado: sessao.valor_cobrado,
        pago: false,
        data_pagamento: null,
        sessao_origem_id: sessao.id,
      }).select('id').single()
      if (insertError) {
        await supabase
          .from('sessoes')
          .update({ status: sessao.status })
          .eq('id', sessao.id)
        throw insertError
      }
      await triggerGoogleCalendarSync('sync_update', sessao.id)
      await triggerGoogleCalendarSync('sync_create', novaSessao.id)
      setRemarcarSessao(null)
      await refetch()
    } catch {
      setErroRemarcar('Erro ao remarcar. Tente novamente.')
    } finally {
      setSalvandoRemarcar(false)
    }
  }

  async function salvarTudo() {
    setSalvando(true)
    for (const u of updates) {
      const { error } = await supabase.from('sessoes').update({ status: u.status }).eq('id', u.id)
      if (!error) await triggerGoogleCalendarSync('sync_update', u.id)
    }
    for (const p of pagamentos.filter(p => p.pago)) {
      await supabase.from('sessoes').update({
        pago: true,
        forma_pagamento: p.forma_pagamento,
        valor_cobrado: p.valor_cobrado,
        data_pagamento: new Date().toISOString(),
      }).eq('id', p.id)
      // Payment-only updates do NOT trigger calendar sync
    }
    setUpdates([])
    setPagamentos([])
    await refetch()
    setSalvando(false)
  }

  const tituloData = format(new Date(), "d 'de' MMMM", { locale: ptBR })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Checklist do dia</h1>
            <div className="group relative">
              <button type="button" className="w-5 h-5 rounded-full bg-border text-muted text-xs font-bold flex items-center justify-center hover:bg-primary hover:text-white transition-colors">?</button>
              <div className="absolute left-6 top-0 w-64 bg-[#1C1C1C] text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-10 shadow-lg">
                Revise todas as sessões de hoje: marque como concluída, faltou ou cancelada, e registre pagamentos.
              </div>
            </div>
          </div>
          <p className="text-sm text-muted capitalize">{tituloData}</p>
        </div>
        {totalAlteracoes > 0 && (
          <button
            onClick={salvarTudo}
            disabled={salvando}
            className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {salvando ? 'Salvando...' : `Salvar (${totalAlteracoes})`}
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
        checklistConcluido ? (
          <div className="text-center py-16 flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#4CAF82]/10 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-[#4CAF82]" />
            </div>
            <p className="font-display text-lg font-semibold text-[#1C1C1C]">Dia concluído</p>
            {sessoes.length > 0 && (
              <div className="flex gap-3 flex-wrap justify-center mt-1">
                {(['concluida', 'faltou', 'cancelada', 'remarcada'] as const).map(status => {
                  const count = sessoes.filter(s => s.status === status).length
                  if (count === 0) return null
                  const labels: Record<string, string> = {
                    concluida: 'concluída', faltou: 'faltou', cancelada: 'cancelada', remarcada: 'remarcada',
                  }
                  return (
                    <span key={status} className="text-xs px-3 py-1 rounded-full"
                      style={{ background: `${getStatusColor(status)}18`, color: getStatusColor(status) }}>
                      {count} {labels[status]}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-muted text-sm">Nenhuma sessão pendente hoje.</p>
          </div>
        )
      )}

      {!loading && !error && pendentes.length > 0 && (
        <div className="flex flex-col gap-3">
          {pendentes.map(s => (
            <SessaoChecklist
              key={s.id}
              sessao={s}
              update={updates.find(u => u.id === s.id)}
              pagamento={pagamentos.find(p => p.id === s.id)}
              onUpdate={handleUpdate}
              onPagamento={handlePagamento}
              onRemarcar={() => setRemarcarSessao(s)}
              disabled={salvandoRemarcar}
              semConfirmacao={sessoesComAlerta.has(s.id)}
            />
          ))}
        </div>
      )}

      {!loading && !error && finalizadas.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">Já registradas</p>
          <div className="flex flex-col gap-3">
            {finalizadas.map(s => (
              <SessaoChecklist
                key={s.id}
                sessao={s}
                update={updates.find(u => u.id === s.id)}
                pagamento={pagamentos.find(p => p.id === s.id)}
                onUpdate={handleUpdate}
                onPagamento={handlePagamento}
                onRemarcar={() => setRemarcarSessao(s)}
                disabled={salvandoRemarcar}
                semConfirmacao={sessoesComAlerta.has(s.id)}
              />
            ))}
          </div>
        </div>
      )}

      {remarcarSessao && (
        <RemarcarModal
          sessao={remarcarSessao}
          onClose={() => setRemarcarSessao(null)}
          onConfirmar={novaDataHora => handleRemarcar(remarcarSessao, novaDataHora)}
        />
      )}
      {erroRemarcar && (
        <p className="text-sm text-[#E07070] text-center mt-2">{erroRemarcar}</p>
      )}
    </div>
  )
}
