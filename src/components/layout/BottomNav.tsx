import { NavLink } from 'react-router-dom'
import { Calendar, Kanban, Users, BarChart2, Settings } from 'lucide-react'

const navItems = [
  { to: '/agenda', icon: Calendar, label: 'Agenda' },
  { to: '/kanban', icon: Kanban, label: 'Kanban' },
  { to: '/pacientes', icon: Users, label: 'Pacientes' },
  { to: '/financeiro', icon: BarChart2, label: 'Financeiro' },
  { to: '/configuracoes', icon: Settings, label: 'Config.' },
] as const

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface border-t border-border flex md:hidden z-50">
      {navItems.map(({ to, icon: Icon, label }) => (
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
              <div
                className={`p-1 rounded-full transition-colors ${
                  isActive ? 'bg-primary-light' : ''
                }`}
              >
                <Icon size={20} />
              </div>
              <span>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
