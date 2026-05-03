import { Navigate, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)

  useEffect(() => {
    if (!session) return
    supabase
      .from('config_psicologo')
      .select('id, nome')
      .limit(1)
      .then(({ data }) => setOnboardingDone(!!data && data.length > 0 && !!data[0]?.nome))
  }, [session])

  if (loading || (session && onboardingDone === null)) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Navigate to="/login" replace />
  if (!onboardingDone) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
