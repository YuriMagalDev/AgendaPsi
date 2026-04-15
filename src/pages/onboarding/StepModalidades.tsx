import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, X } from 'lucide-react'

interface Props {
  onNext: (modalidades: string[]) => void
  onBack: () => void
}

export function StepModalidades({ onNext, onBack }: Props) {
  const [modalidades, setModalidades] = useState(['Presencial', 'Online'])
  const [nova, setNova] = useState('')

  function add() {
    const trimmed = nova.trim()
    if (trimmed && !modalidades.includes(trimmed)) {
      setModalidades([...modalidades, trimmed])
      setNova('')
    }
  }

  function remove(nome: string) {
    setModalidades(modalidades.filter((m) => m !== nome))
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Modalidades</h2>
      <p className="text-sm text-muted">Confirme ou adicione modalidades de atendimento.</p>

      <div className="flex flex-wrap gap-2">
        {modalidades.map((m) => (
          <Badge
            key={m}
            className="bg-primary-light text-primary flex items-center gap-1 px-3 py-1"
          >
            {m}
            <button
              type="button"
              onClick={() => remove(m)}
              className="ml-1 hover:text-accent transition-colors"
            >
              <X size={12} />
            </button>
          </Badge>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Nova modalidade..."
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
        />
        <Button type="button" variant="outline" onClick={add} className="border-border">
          <Plus size={16} />
        </Button>
      </div>

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1 border-border">
          Voltar
        </Button>
        <Button
          type="button"
          onClick={() => onNext(modalidades)}
          disabled={modalidades.length === 0}
          className="flex-1 bg-primary hover:bg-primary/90 text-white"
        >
          Próximo
        </Button>
      </div>
    </div>
  )
}
