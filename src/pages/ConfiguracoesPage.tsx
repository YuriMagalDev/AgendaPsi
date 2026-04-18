import { useState } from 'react'
import { useConvenios } from '@/hooks/useConvenios'
import { useModalidades } from '@/hooks/useModalidades'
import { useConfigPsicologo } from '@/hooks/useConfigPsicologo'
import { Plus, Trash2 } from 'lucide-react'

const inputClass = "h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function ConfiguracoesPage() {
  const { convenios, loading: loadingConvenios, addConvenio, toggleAtivo: toggleConvenio, updateValor } = useConvenios()
  const { modalidades, loading: loadingModalidades, addModalidade, toggleAtivo: toggleModalidade } = useModalidades()
  const { config, loading: loadingConfig, updateConfig } = useConfigPsicologo()

  // Convênios state
  const [nomeConvenio, setNomeConvenio] = useState('')
  const [valorConvenio, setValorConvenio] = useState('')
  const [editandoValor, setEditandoValor] = useState<Record<string, string>>({})

  // Modalidades state
  const [nomeModalidade, setNomeModalidade] = useState('')

  // Config state
  const [configForm, setConfigForm] = useState({ nome: '', horario_inicio: '', horario_fim: '' })
  const [configSynced, setConfigSynced] = useState(false)
  const [salvandoConfig, setSalvandoConfig] = useState(false)

  if (config && !configSynced) {
    setConfigForm({
      nome: config.nome ?? '',
      horario_inicio: config.horario_inicio ?? '07:00',
      horario_fim: config.horario_fim ?? '21:00',
    })
    setConfigSynced(true)
  }

  function handleAddConvenio() {
    if (!nomeConvenio.trim()) return
    addConvenio(nomeConvenio.trim(), valorConvenio ? Number(valorConvenio) : null)
    setNomeConvenio('')
    setValorConvenio('')
  }

  function handleValorBlur(id: string) {
    const v = editandoValor[id]
    if (v !== undefined) {
      updateValor(id, v === '' ? null : Number(v))
      setEditandoValor(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  function handleAddModalidade() {
    if (!nomeModalidade.trim()) return
    addModalidade(nomeModalidade.trim())
    setNomeModalidade('')
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    setSalvandoConfig(true)
    try {
      await updateConfig({
        nome: configForm.nome || null,
        horario_inicio: configForm.horario_inicio || null,
        horario_fim: configForm.horario_fim || null,
      } as any)
    } finally {
      setSalvandoConfig(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Configurações</h1>

      {/* Configurações básicas */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Configurações básicas</p>

        {loadingConfig ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSaveConfig} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#1C1C1C]">Seu nome</label>
              <input
                value={configForm.nome}
                onChange={e => setConfigForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do psicólogo"
                className={`${inputClass} w-full`}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm font-medium text-[#1C1C1C]">Horário de início</label>
                <input
                  type="time"
                  value={configForm.horario_inicio}
                  onChange={e => setConfigForm(f => ({ ...f, horario_inicio: e.target.value }))}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm font-medium text-[#1C1C1C]">Horário de término</label>
                <input
                  type="time"
                  value={configForm.horario_fim}
                  onChange={e => setConfigForm(f => ({ ...f, horario_fim: e.target.value }))}
                  className={`${inputClass} w-full`}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={salvandoConfig}
              className="self-end h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {salvandoConfig ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        )}
      </div>

      {/* Convênios */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Convênios</p>

        {loadingConvenios ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {convenios.length > 0 && (
              <div className="flex flex-col gap-2">
                {convenios.map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-[#1C1C1C]">{c.nome}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="R$/sessão"
                      value={editandoValor[c.id] !== undefined
                        ? editandoValor[c.id]
                        : (c.valor_sessao != null ? String(c.valor_sessao) : '')}
                      onChange={e => setEditandoValor(prev => ({ ...prev, [c.id]: e.target.value }))}
                      onBlur={() => handleValorBlur(c.id)}
                      className={`${inputClass} w-28`}
                    />
                    <button
                      onClick={() => toggleConvenio(c.id, false)}
                      className="text-muted hover:text-[#E07070] transition-colors"
                      title="Desativar convênio"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {convenios.length === 0 && (
              <p className="text-sm text-muted">Nenhum convênio cadastrado.</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <input
                placeholder="Nome do plano"
                value={nomeConvenio}
                onChange={e => setNomeConvenio(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddConvenio())}
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="R$/sessão"
                value={valorConvenio}
                onChange={e => setValorConvenio(e.target.value)}
                className={`${inputClass} w-28`}
              />
              <button
                onClick={handleAddConvenio}
                disabled={!nomeConvenio.trim()}
                className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modalidades */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Modalidades</p>

        {loadingModalidades ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {modalidades.length > 0 && (
              <div className="flex flex-col gap-2">
                {modalidades.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-[#1C1C1C]">{m.nome}</span>
                    <button
                      onClick={() => toggleModalidade(m.id, false)}
                      className="text-muted hover:text-[#E07070] transition-colors"
                      title="Desativar modalidade"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {modalidades.length === 0 && (
              <p className="text-sm text-muted">Nenhuma modalidade cadastrada.</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <input
                placeholder="Nome da modalidade"
                value={nomeModalidade}
                onChange={e => setNomeModalidade(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddModalidade())}
                className={`${inputClass} flex-1`}
              />
              <button
                onClick={handleAddModalidade}
                disabled={!nomeModalidade.trim()}
                className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
