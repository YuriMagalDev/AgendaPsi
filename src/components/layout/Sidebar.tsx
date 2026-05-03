import { NavLink } from 'react-router-dom'
import { Calendar, Kanban, Users, BarChart2, Settings, LogOut, ClipboardList, Wallet, AlertTriangle, Crown } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useChecklistBadge } from '@/hooks/useChecklistBadge'
import { useAssinatura } from '@/hooks/useAssinatura'

const navItems = [
  { to: '/agenda',        icon: Calendar,      label: 'Agenda'        },
  { to: '/kanban',        icon: Kanban,         label: 'Kanban'        },
  { to: '/checklist',     icon: ClipboardList,  label: 'Checklist'     },
  { to: '/pacientes',     icon: Users,          label: 'Pacientes'     },
  { to: '/pacientes/risco', icon: AlertTriangle, label: 'Em Risco'      },
  { to: '/financeiro',    icon: BarChart2,       label: 'Financeiro'    },
  { to: '/cobranca',      icon: Wallet,          label: 'Cobrança'      },
  { to: '/configuracoes', icon: Settings,        label: 'Configurações' },
  { to: '/plano',         icon: Crown,           label: 'Plano'         },
] as const

export function Sidebar() {
  const { signOut } = useAuth()
  const { hasPending } = useChecklistBadge()
  const { isTrialAtivo } = useAssinatura()

  return (
    <aside className="hidden md:flex flex-col w-60 min-h-screen bg-surface border-r border-border p-4">
      <div className="mb-8 px-2">
        <h1 className="font-display text-2xl font-semibold text-primary">Consultório</h1>
      </div>

      <nav className="flex-1 flex flex-col gap-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary-light text-primary font-medium'
                  : 'text-[#1C1C1C] hover:bg-bg'
              }`
            }
          >
            <div className="relative">
              <Icon size={18} />
              {to === '/checklist' && hasPending && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#E07070] rounded-full" />
              )}
              {to === '/plano' && isTrialAtivo && (
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full" />
              )}
            </div>
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={signOut}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted hover:bg-bg transition-colors mt-4"
      >
        <LogOut size={18} />
        Sair
      </button>
    </aside>
  )
}
