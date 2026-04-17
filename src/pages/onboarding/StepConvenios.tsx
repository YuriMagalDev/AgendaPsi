// src/pages/onboarding/StepConvenios.tsx
import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

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

  function add() {
    const n = nome.trim()
    if (!n) return
    setLista(prev => [...prev, { nome: n, valor_sessao: valor ? Number(valor) : null }])
    setNome('')
    setValor('')
  }

  function remove(i: number) {
    setLista(prev => prev.filter((_, j) => j !== i))
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Convênios</h2>
      <p className="text-sm text-muted">
        Cadastre os planos de saúde que você aceita. Você poderá editar depois em Configurações.
      </p>

      {lista.length > 0 && (
        <div className="flex flex-col gap-2">
          {lista.map((c, i) => (
            <div key={i} className="flex items-center justify-between bg-bg rounded-lg px-3 py-2">
              <div>
                <span className="text-sm font-medium text-[#1C1C1C]">{c.nome}</span>
                {c.valor_sessao != null && (
                  <span className="text-xs text-muted ml-2">
                    R$ {c.valor_sessao.toFixed(2)}/sessão
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted hover:text-[#E07070] transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          placeholder="Nome do plano (ex: Unimed)"
          value={nome}
          onChange={e => setNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())}
          className={`${inputClass} flex-1`}
        />
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="R$/sessão"
          value={valor}
          onChange={e => setValor(e.target.value)}
          className={`${inputClass} w-28`}
        />
        <button
          type="button"
          onClick={add}
          disabled={!nome.trim()}
          className="h-9 px-3 rounded-lg border border-border text-muted hover:text-[#1C1C1C] disabled:opacity-40 transition-colors"
        >
          <Plus size={16} />
        </button>
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
