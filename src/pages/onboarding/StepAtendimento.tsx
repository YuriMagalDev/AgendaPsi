import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import type { ModalidadeSessao, MeioAtendimento } from '@/lib/types'

interface Props {
  onNext: () => void
  onBack: () => void
}

export function StepAtendimento({ onNext, onBack }: Props) {
  const [modalidades, setModalidades] = useState<ModalidadeSessao[]>([])
  const [meios, setMeios] = useState<MeioAtendimento[]>([])
  const [selectedModalidades, setSelectedModalidades] = useState<Set<string>>(new Set())
  const [selectedMeios, setSelectedMeios] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const [novaModalidade, setNovaModalidade] = useState('')
  const [emojiModalidade, setEmojiModalidade] = useState('')
  const [addingMod, setAddingMod] = useState(false)

  const [novoMeio, setNovoMeio] = useState('')
  const [emojiMeio, setEmojiMeio] = useState('')
  const [addingMeio, setAddingMeio] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: mods }, { data: meis }] = await Promise.all([
        supabase.from('modalidades_sessao').select('*').order('nome'),
        supabase.from('meios_atendimento').select('*').order('nome'),
      ])
      const ms = (mods ?? []) as ModalidadeSessao[]
      const ma = (meis ?? []) as MeioAtendimento[]
      setModalidades(ms)
      setMeios(ma)
      setSelectedModalidades(new Set(ms.map(m => m.id)))
      setSelectedMeios(new Set(ma.map(m => m.id)))
      setLoading(false)
    }
    load()
  }, [])

  function toggleModalidade(id: string) {
    setSelectedModalidades(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleMeio(id: string) {
    setSelectedMeios(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleAddModalidade() {
    if (!novaModalidade.trim() || !emojiModalidade.trim()) return
    setAddingMod(true)
    const { data, error } = await supabase
      .from('modalidades_sessao')
      .insert({ nome: novaModalidade.trim(), emoji: emojiModalidade.trim(), ativo: true })
      .select('*')
      .single()
    if (!error && data) {
      const m = data as ModalidadeSessao
      setModalidades(prev => [...prev, m])
      setSelectedModalidades(prev => new Set([...prev, m.id]))
      setNovaModalidade('')
      setEmojiModalidade('')
    }
    setAddingMod(false)
  }

  async function handleAddMeio() {
    if (!novoMeio.trim() || !emojiMeio.trim()) return
    setAddingMeio(true)
    const { data, error } = await supabase
      .from('meios_atendimento')
      .insert({ nome: novoMeio.trim(), emoji: emojiMeio.trim(), ativo: true })
      .select('*')
      .single()
    if (!error && data) {
      const m = data as MeioAtendimento
      setMeios(prev => [...prev, m])
      setSelectedMeios(prev => new Set([...prev, m.id]))
      setNovoMeio('')
      setEmojiMeio('')
    }
    setAddingMeio(false)
  }

  async function handleNext() {
    setSaving(true)
    const deselectedMods = modalidades.filter(m => !selectedModalidades.has(m.id))
    const deselectedMeios = meios.filter(m => !selectedMeios.has(m.id))

    await Promise.all([
      ...deselectedMods.map(m =>
        supabase.from('modalidades_sessao').update({ ativo: false }).eq('id', m.id)
      ),
      ...deselectedMeios.map(m =>
        supabase.from('meios_atendimento').update({ ativo: false }).eq('id', m.id)
      ),
    ])
    setSaving(false)
    onNext()
  }

  const nenhuma =
    (modalidades.length > 0 && selectedModalidades.size === 0) ||
    (meios.length > 0 && selectedMeios.size === 0)

  const inputClass = "flex-1 h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Tipos de atendimento</h2>
        <p className="text-sm text-muted mt-1">Selecione os que você utiliza no seu consultório.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (<>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Modalidade de sessão</p>
        {modalidades.map(m => (
          <label key={m.id} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedModalidades.has(m.id)}
              onChange={() => toggleModalidade(m.id)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">{m.emoji} {m.nome}</span>
          </label>
        ))}
        <div className="flex gap-2 pt-1 border-t border-border mt-1">
          <EmojiPicker value={emojiModalidade} onChange={setEmojiModalidade} />
          <input
            placeholder="Nova modalidade"
            value={novaModalidade}
            onChange={e => setNovaModalidade(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddModalidade())}
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleAddModalidade}
            disabled={!novaModalidade.trim() || !emojiModalidade.trim() || addingMod}
            className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Meio de atendimento</p>
        {meios.map(m => (
          <label key={m.id} className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedMeios.has(m.id)}
              onChange={() => toggleMeio(m.id)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">{m.emoji} {m.nome}</span>
          </label>
        ))}
        <div className="flex gap-2 pt-1 border-t border-border mt-1">
          <EmojiPicker value={emojiMeio} onChange={setEmojiMeio} />
          <input
            placeholder="Novo meio"
            value={novoMeio}
            onChange={e => setNovoMeio(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddMeio())}
            className={inputClass}
          />
          <button
            type="button"
            onClick={handleAddMeio}
            disabled={!novoMeio.trim() || !emojiMeio.trim() || addingMeio}
            className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      </>)}

      {nenhuma && !loading && (
        <p className="text-xs text-[#E07070] -mt-2">Selecione pelo menos um item em cada seção.</p>
      )}

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1 border-border">
          Voltar
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={nenhuma || saving || loading}
          className="flex-1 bg-primary hover:bg-primary/90 text-white"
        >
          {saving ? 'Salvando...' : 'Próximo'}
        </Button>
      </div>
    </div>
  )
}
