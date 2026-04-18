import { createBrowserRouter } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/LoginPage'
import { OnboardingPage } from '@/pages/OnboardingPage'
import { AgendaPage } from '@/pages/AgendaPage'
import { KanbanPage } from '@/pages/KanbanPage'
import { ChecklistPage } from '@/pages/ChecklistPage'
import { PacientesPage } from '@/pages/PacientesPage'
import { NovoPacientePage } from '@/pages/NovoPacientePage'
import { PacienteDetalhePage } from '@/pages/PacienteDetalhePage'
import { EditarPacientePage } from '@/pages/EditarPacientePage'
import { FinanceiroPage } from '@/pages/FinanceiroPage'
import { FinanceiroPacientePage } from '@/pages/FinanceiroPacientePage'
import { ConfiguracoesPage } from '@/pages/ConfiguracoesPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/onboarding', element: <OnboardingPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <AgendaPage /> },
          { path: '/agenda', element: <AgendaPage /> },
          { path: '/kanban', element: <KanbanPage /> },
          { path: '/checklist', element: <ChecklistPage /> },
          { path: '/pacientes', element: <PacientesPage /> },
          { path: '/pacientes/novo', element: <NovoPacientePage /> },
          { path: '/pacientes/:id', element: <PacienteDetalhePage /> },
          { path: '/pacientes/:id/editar', element: <EditarPacientePage /> },
          { path: '/financeiro', element: <FinanceiroPage /> },
          { path: '/financeiro/paciente/:id', element: <FinanceiroPacientePage /> },
          { path: '/configuracoes', element: <ConfiguracoesPage /> },
        ],
      },
    ],
  },
])
