import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
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

  useEffect(() => {
    async function load() {
      const [{ data: mods }, { data: meis }] = await Promise.all([
        supabase.from('modalidades_sessao').select('*').order('nome'),
        supabase.from('meios_atendimento').select('*').order('nome'),
      ])
      const ms = (mods ?? []) as ModalidadeSessao[]
      const ma = (meis ?? []) as MeioAtendimento[]
      setModalidades(ms)
      setMeios(ma)
      // Default: all active
      setSelectedModalidades(new Set(ms.map(m => m.id)))
      setSelectedMeios(new Set(ma.map(m => m.id)))
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

  async function handleNext() {
    setSaving(true)
    // Set ativo=false for deselected rows
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

  const nenhuma = selectedModalidades.size === 0 || selectedMeios.size === 0

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Tipos de atendimento</h2>
        <p className="text-sm text-muted mt-1">Selecione os que você utiliza no seu consultório.</p>
      </div>

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
      </div>

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1 border-border">
          Voltar
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={nenhuma || saving}
          className="flex-1 bg-primary hover:bg-primary/90 text-white"
        >
          {saving ? 'Salvando...' : 'Próximo'}
        </Button>
      </div>
    </div>
  )
}
