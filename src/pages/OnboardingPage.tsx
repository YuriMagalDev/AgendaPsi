// src/pages/OnboardingPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { StepDados, type StepDadosData } from './onboarding/StepDados'
import { StepAtendimento } from './onboarding/StepAtendimento'
import { StepConvenios, type ConvenioInput } from './onboarding/StepConvenios'
import { StepWhatsapp } from './onboarding/StepWhatsapp'

type Step = 1 | 2 | 3 | 4

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>(1)
  const [dadosStep1, setDadosStep1] = useState<StepDadosData | null>(null)
  const [convenios, setConvenios] = useState<ConvenioInput[]>([])
  const [erroFinal, setErroFinal] = useState<string | null>(null)

  async function finalize(whatsappOpcao: 'agora' | 'depois' | 'nao') {
    if (!dadosStep1) return
    setErroFinal(null)

    const { error } = await supabase.from('config_psicologo').insert({
      nome: dadosStep1.nome,
      horario_inicio: dadosStep1.horario_inicio,
      horario_fim: dadosStep1.horario_fim,
      horario_checklist: dadosStep1.horario_checklist,
      automacao_whatsapp_ativa: false,
    })

    if (error) {
      setErroFinal('Erro ao salvar configurações. Tente novamente.')
      return
    }

    if (convenios.length > 0) {
      await supabase.from('convenios').insert(
        convenios.map(c => ({ nome: c.nome, valor_sessao: c.valor_sessao, ativo: true }))
      )
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
          {([1, 2, 3, 4] as Step[]).map(s => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                s === step ? 'w-8 bg-primary' : s < step ? 'w-4 bg-primary/40' : 'w-4 bg-border'
              }`}
            />
          ))}
        </div>

        {erroFinal && (
          <p className="text-sm text-[#E07070] text-center mb-4">{erroFinal}</p>
        )}

        <div className="bg-surface rounded-card p-6 shadow-sm border border-border">
          {step === 1 && (
            <StepDados onNext={data => { setDadosStep1(data); setStep(2) }} />
          )}
          {step === 2 && (
            <StepAtendimento
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}
          {step === 3 && (
            <StepConvenios
              onNext={c => { setConvenios(c); setStep(4) }}
              onBack={() => setStep(2)}
            />
          )}
          {step === 4 && (
            <StepWhatsapp
              onConfigurar={() => finalize('agora')}
              onDepois={() => finalize('depois')}
              onNaoUsar={() => finalize('nao')}
              onBack={() => setStep(3)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
