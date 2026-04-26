import { NavLink } from 'react-router-dom'
import { Calendar, Kanban, Users, BarChart2, Settings, ClipboardList } from 'lucide-react'
import { useChecklistBadge } from '@/hooks/useChecklistBadge'

const staticNavItems = [
  { to: '/agenda',        icon: Calendar,       label: 'Agenda'     },
  { to: '/kanban',        icon: Kanban,          label: 'Kanban'     },
  { to: '/checklist',     icon: ClipboardList,   label: 'Checklist'  },
  { to: '/pacientes',     icon: Users,           label: 'Pacientes'  },
  { to: '/configuracoes', icon: Settings,        label: 'Config.'    },
] as const

export function BottomNav() {
  const { hasPending } = useChecklistBadge()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border flex md:hidden z-50">
      {staticNavItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${
              isActive ? 'text-primary' : 'text-muted'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <div className={`relative p-1 rounded-full transition-colors ${isActive ? 'bg-primary-light' : ''}`}>
                <Icon size={20} />
                {to === '/checklist' && hasPending && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-[#E07070] rounded-full" />
                )}
              </div>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
