import { useState } from 'react'
import { X, CheckCircle2, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from '@/lib/supabase'
import { RemarcarModal } from '@/components/sessao/RemarcarModal'
import { STATUS_CONFIG } from '@/lib/statusConfig'
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
import type { FormaPagamento, SessaoStatus, SessaoView } from '@/lib/types'

const FORMAS_PAGAMENTO: { value: FormaPagamento; label: string }[] = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'PIX' },
  { value: 'cartao_debito', label: 'Débito' },
  { value: 'cartao_credito', label: 'Crédito' },
]

const STATUS_ACOES: Partial<Record<SessaoStatus, SessaoStatus[]>> = {
  agendada:   ['confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada'],
  confirmada: ['concluida', 'faltou', 'cancelada', 'remarcada'],
}

interface Props {
  sessao: SessaoView
  onClose: () => void
  onUpdate: () => void
}

export function SessaoPanel({ sessao, onClose, onUpdate }: Props) {
  const [remarcarAberto, setRemarcarAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(
    (sessao.forma_pagamento as FormaPagamento | null) ?? null
  )
  const [valorPagamento, setValorPagamento] = useState(
    sessao.valor_cobrado != null ? String(sessao.valor_cobrado) : ''
  )

  const [editando, setEditando] = useState(false)
  const [editDataHora, setEditDataHora] = useState(
    sessao.data_hora.slice(0, 16) // datetime-local wants "YYYY-MM-DDTHH:mm"
  )
  const [editDuracao, setEditDuracao] = useState(String(sessao.duracao_minutos))
  const [editValor, setEditValor] = useState(sessao.valor_cobrado != null ? String(sessao.valor_cobrado) : '')
  const [editModalidade, setEditModalidade] = useState(sessao.modalidade_sessao_id)
  const [editMeio, setEditMeio] = useState(sessao.meio_atendimento_id)
  const { modalidadesSessao } = useModalidadesSessao()
  const { meiosAtendimento } = useMeiosAtendimento()
  const podeEditar = sessao.status === 'agendada' || sessao.status === 'confirmada'

  const acoes = STATUS_ACOES[sessao.status]
  const nomePaciente = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const cfg = STATUS_CONFIG[sessao.status]
  const mostrarPagamento = sessao.status === 'concluida' || acoes?.includes('concluida')

  async function atualizar(novoStatus: SessaoStatus) {
    setSalvando(true)
    setErro(null)
    try {
      const { error } = await supabase
        .from('sessoes')
        .update({ status: novoStatus })
        .eq('id', sessao.id)
      if (error) throw error
      onUpdate()
      onClose()
    } catch {
      setErro('Erro ao atualizar status. Tente novamente.')
      setSalvando(false)
    }
  }

  async function remarcar(novaDataHora: string) {
    setSalvando(true)
    setErro(null)
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
    setErro(null)
    try {
      const { error } = await supabase.from('sessoes').update({
        pago: true,
        forma_pagamento: formaPagamento,
        valor_cobrado: valorPagamento ? Number(valorPagamento) : null,
        data_pagamento: new Date().toISOString(),
      }).eq('id', sessao.id)
      if (error) throw error
      onUpdate()
      onClose()
    } catch {
      setErro('Erro ao registrar pagamento. Tente novamente.')
      setSalvando(false)
    }
  }

  async function salvarEdicao() {
    setSalvando(true)
    setErro(null)
    try {
      const { error } = await supabase.from('sessoes').update({
        data_hora: editDataHora,
        duracao_minutos: Number(editDuracao),
        valor_cobrado: editValor ? Number(editValor) : null,
        modalidade_sessao_id: editModalidade,
        meio_atendimento_id: editMeio,
      }).eq('id', sessao.id)
      if (error) throw error
      onUpdate()
      onClose()
    } catch {
      setErro('Erro ao salvar. Tente novamente.')
      setSalvando(false)
    }
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
            <div className="flex items-center gap-2 ml-4">
              {podeEditar && !editando && (
                <button
                  onClick={() => setEditando(true)}
                  className="text-muted hover:text-[#1C1C1C] transition-colors"
                  title="Editar sessão"
                >
                  <Pencil size={16} />
                </button>
              )}
              <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {editando ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted font-medium uppercase tracking-wide">Editar sessão</p>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#1C1C1C]">Data e horário</label>
                <input
                  type="datetime-local"
                  value={editDataHora}
                  onChange={e => setEditDataHora(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border text-sm outline-none focus:border-primary"
                />
              </div>

              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs font-medium text-[#1C1C1C]">Duração</label>
                  <select
                    value={editDuracao}
                    onChange={e => setEditDuracao(e.target.value)}
                    className="h-9 px-2 rounded-lg border border-border text-sm outline-none focus:border-primary"
                  >
                    {['30', '45', '50', '60', '90'].map(d => (
                      <option key={d} value={d}>{d} min</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs font-medium text-[#1C1C1C]">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editValor}
                    onChange={e => setEditValor(e.target.value)}
                    placeholder="0,00"
                    className="w-full h-9 px-3 rounded-lg border border-border text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#1C1C1C]">Modalidade</label>
                <select
                  value={editModalidade ?? ''}
                  onChange={e => setEditModalidade(e.target.value)}
                  className="w-full h-9 px-2 rounded-lg border border-border text-sm outline-none focus:border-primary"
                >
                  {modalidadesSessao.map(m => (
                    <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-[#1C1C1C]">Meio de atendimento</label>
                <select
                  value={editMeio ?? ''}
                  onChange={e => setEditMeio(e.target.value)}
                  className="w-full h-9 px-2 rounded-lg border border-border text-sm outline-none focus:border-primary"
                >
                  {meiosAtendimento.map(m => (
                    <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setEditando(false)}
                  className="flex-1 h-9 rounded-lg border border-border text-sm text-[#1C1C1C] hover:bg-bg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={salvando}
                  onClick={salvarEdicao}
                  className="flex-1 h-9 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
              {erro && <p className="text-xs text-[#E07070] text-center">{erro}</p>}
            </div>
          ) : (
            <>
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
            </>
          )}
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
