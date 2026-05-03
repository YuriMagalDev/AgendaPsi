import { Outlet, Link } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { TopBar } from './TopBar'
import { useAssinatura } from '@/hooks/useAssinatura'

export function AppLayout() {
  const { assinatura, isTrialAtivo, diasRestantesTrial } = useAssinatura()

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        {isTrialAtivo && (
          <div className="bg-primary/10 text-primary text-sm text-center py-2 px-4">
            Teste grátis — {diasRestantesTrial} dias restantes.{' '}
            <Link to="/plano" className="font-medium underline">Escolher plano</Link>
          </div>
        )}
        {assinatura?.status === 'inadimplente' && (
          <div className="bg-accent/10 text-accent text-sm text-center py-2 px-4">
            Seu período de teste expirou.{' '}
            <Link to="/plano" className="font-medium underline">Assinar agora</Link>
          </div>
        )}
        <TopBar />
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  )
}
