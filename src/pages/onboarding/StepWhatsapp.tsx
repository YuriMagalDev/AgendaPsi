import { Button } from '@/components/ui/button'
import { MessageCircle, SkipForward, X } from 'lucide-react'

interface Props {
  onConfigurar: () => void
  onDepois: () => void
  onNaoUsar: () => void
  onBack: () => void
}

export function StepWhatsapp({ onConfigurar, onDepois, onNaoUsar, onBack }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">WhatsApp</h2>

      <div className="bg-primary-light rounded-card p-4 text-sm text-primary">
        <p className="font-medium mb-1">Use um número dedicado ao consultório</p>
        <p className="text-primary/80">
          Recomendamos um número separado do seu pessoal. Você precisará de um chip ou número
          virtual (ex: VoIP). Isso protege sua privacidade e organiza as conversas com pacientes.
        </p>
      </div>

      <p className="text-sm text-muted">
        Com a automação, o app envia lembretes automáticos um dia antes de cada sessão e registra
        as confirmações dos pacientes.
      </p>

      <div className="flex flex-col gap-2 mt-2">
        <Button
          type="button"
          onClick={onConfigurar}
          className="bg-primary hover:bg-primary/90 text-white flex items-center gap-2"
        >
          <MessageCircle size={16} />
          Configurar agora
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onDepois}
          className="border-border flex items-center gap-2"
        >
          <SkipForward size={16} />
          Configurar depois
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onNaoUsar}
          className="text-muted flex items-center gap-2"
        >
          <X size={16} />
          Não usar automação
        </Button>
      </div>

      <Button type="button" variant="ghost" onClick={onBack} className="text-muted text-sm">
        Voltar
      </Button>
    </div>
  )
}
