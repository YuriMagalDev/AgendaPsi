import { useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAssinatura } from '@/hooks/useAssinatura'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export function PlanoPage() {
  const { assinatura, loading, isTrialAtivo, diasRestantesTrial, assinaturaAtiva, refetch } = useAssinatura()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const status = searchParams.get('status')
    if (status === 'sucesso') {
      toast.success('Assinatura ativada com sucesso!')
      refetch()
    } else if (status === 'cancelado') {
      toast.info('Pagamento cancelado.')
    }
  }, [])

  async function handleAssinar(plano: 'basico' | 'completo') {
    const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { plano } })
    if (error || !data?.url) {
      toast.error('Erro ao iniciar pagamento. Tente novamente.')
      return
    }
    window.location.href = data.url
  }

  async function handlePortal() {
    const { data, error } = await supabase.functions.invoke('stripe-portal')
    if (error || !data?.url) {
      toast.error('Erro ao abrir portal de pagamento.')
      return
    }
    window.location.href = data.url
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[200px]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const trialFimFormatted = assinatura?.trial_fim
    ? format(new Date(assinatura.trial_fim + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })
    : null

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Seu Plano</h1>

      {/* Status card */}
      <div className="bg-surface rounded-card border border-border p-5">
        {isTrialAtivo && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4CAF82]" />
              <span className="font-medium text-[#1C1C1C]">Trial Ativo</span>
            </div>
            <p className="text-sm text-muted">Plano Completo</p>
            <p className="text-sm text-muted">{diasRestantesTrial} dias restantes</p>
            {trialFimFormatted && (
              <p className="text-sm text-muted">Expira em {trialFimFormatted}</p>
            )}
          </div>
        )}

        {assinatura?.status === 'ativo' && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4CAF82]" />
              <span className="font-medium text-[#1C1C1C]">Plano Ativo</span>
            </div>
            <p className="text-sm text-muted capitalize">{assinatura.plano}</p>
          </div>
        )}

        {assinatura?.status === 'inadimplente' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#C17F59]" />
              <span className="font-medium text-[#C17F59]">Pagamento pendente</span>
            </div>
            <p className="text-sm text-muted">Seu acesso ao plano Completo foi suspenso.</p>
            <button
              onClick={handlePortal}
              className="self-start h-9 px-4 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Atualizar pagamento
            </button>
          </div>
        )}

        {assinatura?.status === 'cancelado' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#9CA3AF]" />
              <span className="font-medium text-[#1C1C1C]">Assinatura cancelada</span>
            </div>
            <p className="text-sm text-muted">Você pode reativar a qualquer momento.</p>
          </div>
        )}
      </div>

      {/* Plan cards — shown when not active or when trial/cancelled */}
      {(!assinaturaAtiva || assinatura?.status === 'trial' || assinatura?.status === 'cancelado') && (
        <div className="grid grid-cols-2 gap-4">
          {/* Básico */}
          <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-3">
            <div>
              <h3 className="font-display font-semibold text-[#1C1C1C]">Básico</h3>
              <p className="text-lg font-bold text-primary mt-1">R$ 30<span className="text-sm font-normal text-muted">/mês</span></p>
            </div>
            <ul className="text-sm text-muted flex flex-col gap-1 flex-1">
              <li>✅ Agenda e Kanban</li>
              <li>✅ Gestão de Pacientes</li>
              <li>✅ Financeiro</li>
              <li>✅ Convênios e Repasses</li>
              <li className="text-[#9CA3AF]">❌ WhatsApp Automático</li>
              <li className="text-[#9CA3AF]">❌ Kanban Realtime</li>
            </ul>
            <button
              onClick={() => handleAssinar('basico')}
              className="h-9 px-4 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary-light transition-colors"
            >
              Assinar
            </button>
          </div>

          {/* Completo */}
          <div className="bg-primary-light rounded-card border border-primary/30 p-5 flex flex-col gap-3">
            <div>
              <h3 className="font-display font-semibold text-primary">Completo ⭐</h3>
              <p className="text-lg font-bold text-primary mt-1">R$ 50<span className="text-sm font-normal text-muted">/mês</span></p>
            </div>
            <ul className="text-sm text-muted flex flex-col gap-1 flex-1">
              <li>✅ Tudo do Básico</li>
              <li>✅ WhatsApp Automático</li>
              <li>✅ Kanban Realtime</li>
            </ul>
            <button
              onClick={() => handleAssinar('completo')}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Assinar
            </button>
          </div>
        </div>
      )}

      {/* Manage payment — shown when active subscription exists */}
      {assinatura?.stripe_subscription_id && (
        <button
          onClick={handlePortal}
          className="text-sm text-primary hover:underline self-start"
        >
          Gerenciar pagamento →
        </button>
      )}
    </div>
  )
}
