// src/pages/onboarding/StepConvenios.tsx
import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'

export interface ConvenioInput {
  nome: string
  valor_sessao: number | null
}

interface Props {
  onNext: (convenios: ConvenioInput[]) => void
  onBack: () => void
}

const inputClass = "h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function StepConvenios({ onNext, onBack }: Props) {
  const [lista, setLista] = useState<ConvenioInput[]>([])
  const [nome, setNome] = useState('')
  const [valor, setValor] = useState('')
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editValor, setEditValor] = useState('')

  function add() {
    const n = nome.trim()
    if (!n) return
    setLista(prev => [...prev, { nome: n, valor_sessao: valor ? Number(valor) : null }])
    setNome('')
    setValor('')
  }

  function remove(i: number) {
    setLista(prev => prev.filter((_, j) => j !== i))
    if (editIdx === i) setEditIdx(null)
  }

  function startEdit(i: number) {
    setEditIdx(i)
    setEditNome(lista[i].nome)
    setEditValor(lista[i].valor_sessao != null ? String(lista[i].valor_sessao) : '')
  }

  function confirmEdit() {
    if (editIdx === null || !editNome.trim()) return
    setLista(prev => prev.map((c, i) => i === editIdx
      ? { nome: editNome.trim(), valor_sessao: editValor ? Number(editValor) : null }
      : c
    ))
    setEditIdx(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Convênios</h2>
      <p className="text-sm text-muted">
        Cadastre os planos de saúde que você aceita. Você poderá editar depois em Configurações.
      </p>

      <div className="bg-[#E8F4F4] border border-primary/20 rounded-lg px-3 py-2.5 text-xs text-primary/80 leading-relaxed">
        <span className="font-medium text-primary">Como funciona a cobrança:</span> Ao cadastrar cada paciente, você define o valor e o tipo de contrato (por sessão, pacote ou mensalidade). A seção <strong>Cobrança</strong> do app lista sessões com pagamento pendente e envia lembretes automáticos via WhatsApp.
      </div>

      {lista.length > 0 && (
        <div className="flex flex-col gap-2">
          {lista.map((c, i) => editIdx === i ? (
            <div key={i} className="flex flex-col gap-2 bg-bg rounded-lg px-3 py-2">
              <input
                value={editNome}
                onChange={e => setEditNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), confirmEdit())}
                className={`${inputClass} w-full`}
                placeholder="Nome do plano"
              />
              <div className="flex gap-2">
                <input
                  type="number" step="0.01" min="0"
                  value={editValor}
                  onChange={e => setEditValor(e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder="R$/sessão (opcional)"
                />
                <button type="button" onClick={confirmEdit} className="h-9 px-3 rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors">
                  <Check size={15} />
                </button>
                <button type="button" onClick={() => setEditIdx(null)} className="h-9 px-3 rounded-lg border border-border text-muted hover:text-[#1C1C1C] transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>
          ) : (
            <div key={i} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2">
              <div>
                <span className="text-sm font-medium text-[#1C1C1C]">{c.nome}</span>
                {c.valor_sessao != null && (
                  <span className="text-xs text-muted ml-2">
                    R$ {c.valor_sessao.toFixed(2)}/sessão
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(i)}
                  className="text-muted hover:text-primary transition-colors p-1"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-muted hover:text-[#E07070] transition-colors p-1"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <input
          placeholder="Nome do plano (ex: Unimed)"
          value={nome}
          onChange={e => setNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          className={`${inputClass} w-full`}
        />
        <div className="flex gap-2">
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="Valor por sessão (opcional)"
            value={valor}
            onChange={e => setValor(e.target.value)}
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={add}
            disabled={!nome.trim()}
            className="h-9 px-4 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors flex items-center gap-1.5 text-sm font-medium whitespace-nowrap"
          >
            <Plus size={15} />
            Adicionar
          </button>
        </div>
      </div>

      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={() => onNext(lista)}
          className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
        >
          {lista.length === 0 ? 'Não atendo por convênio' : 'Próximo'}
        </button>
      </div>
    </div>
  )
}
