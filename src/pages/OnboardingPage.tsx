import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { StepDados, type StepDadosData } from './onboarding/StepDados'
import { StepModalidades } from './onboarding/StepModalidades'
import { StepWhatsapp } from './onboarding/StepWhatsapp'

type Step = 1 | 2 | 3

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [dadosStep1, setDadosStep1] = useState<StepDadosData | null>(null)
  const [modalidades, setModalidades] = useState<string[]>([])

  async function finalize(whatsappOpcao: 'agora' | 'depois' | 'nao') {
    if (!dadosStep1) return

    await supabase.from('config_psicologo').insert({
      nome: dadosStep1.nome,
      horario_inicio: dadosStep1.horario_inicio,
      horario_fim: dadosStep1.horario_fim,
      horario_checklist: dadosStep1.horario_checklist,
      automacao_whatsapp_ativa: false,
    })

    const extras = modalidades.filter((m) => !['Presencial', 'Online'].includes(m))
    if (extras.length > 0) {
      await supabase.from('modalidades').insert(extras.map((nome) => ({ nome })))
    }

    navigate(whatsappOpcao === 'agora' ? '/configuracoes?setup=whatsapp' : '/agenda')
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="font-display text-3xl font-semibold text-primary">Bem-vindo</h1>
          <p className="text-muted text-sm mt-1">Vamos configurar seu consultório</p>
        </div>

        <div className="flex items-center gap-2 mb-6 justify-center">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step
                  ? 'w-8 bg-primary'
                  : s < step
                    ? 'w-4 bg-primary/40'
                    : 'w-4 bg-border'
              }`}
            />
          ))}
        </div>

        <div className="bg-surface rounded-card p-6 shadow-sm border border-border">
          {step === 1 && (
            <StepDados
              onNext={(data) => {
                setDadosStep1(data)
                setStep(2)
              }}
            />
          )}
          {step === 2 && (
            <StepModalidades
              onNext={(m) => {
                setModalidades(m)
                setStep(3)
              }}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepWhatsapp
              onConfigurar={() => finalize('agora')}
              onDepois={() => finalize('depois')}
              onNaoUsar={() => finalize('nao')}
              onBack={() => setStep(2)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
