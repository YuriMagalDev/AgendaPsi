import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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

function SessaoChecklist({ sessao, update, pagamento, onUpdate, onPagamento, onRemarcar, disabled }: {
  sessao: SessaoView
  update: StatusUpdate | undefined
  pagamento: PagamentoUpdate | undefined
  onUpdate: (u: StatusUpdate) => void
  onPagamento: (p: PagamentoUpdate) => void
  onRemarcar: () => void
  disabled?: boolean
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
          <p className="text-xs text-muted">{horario} · {sessao.modalidades?.nome}</p>
        </div>
        {novoStatus && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${getStatusColor(novoStatus)}20`, color: getStatusColor(novoStatus) }}>
            {novoStatus.charAt(0).toUpperCase() + novoStatus.slice(1)}
          </span>
        )}
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

  const pendentes = sessoes.filter(s => s.status === 'agendada' || s.status === 'confirmada')
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
      const { error: insertError } = await supabase.from('sessoes').insert({
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
      })
      if (insertError) {
        await supabase
          .from('sessoes')
          .update({ status: sessao.status })
          .eq('id', sessao.id)
        throw insertError
      }
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
      await supabase.from('sessoes').update({ status: u.status }).eq('id', u.id)
    }
    for (const p of pagamentos.filter(p => p.pago)) {
      await supabase.from('sessoes').update({
        pago: true,
        forma_pagamento: p.forma_pagamento,
        valor_cobrado: p.valor_cobrado,
        data_pagamento: new Date().toISOString(),
      }).eq('id', p.id)
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
          <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Checklist do dia</h1>
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
        <div className="text-center py-16">
          <p className="text-muted text-sm">Nenhuma sessão pendente hoje.</p>
        </div>
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
            />
          ))}
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
