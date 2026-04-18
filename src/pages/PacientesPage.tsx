import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, ChevronRight, UserRound } from 'lucide-react'
import { usePacientes } from '@/hooks/usePacientes'
import type { Paciente } from '@/lib/types'

function PacienteCard({ paciente }: { paciente: Paciente }) {
  return (
    <Link
      to={`/pacientes/${paciente.id}`}
      className="flex items-center justify-between p-4 bg-surface rounded-card border border-border hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center shrink-0">
          <UserRound size={18} className="text-primary" />
        </div>
        <div>
          <p className="font-medium text-[#1C1C1C] leading-tight">{paciente.nome}</p>
          {paciente.telefone && (
            <p className="text-sm text-muted mt-0.5">{paciente.telefone}</p>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </Link>
  )
}

export function PacientesPage() {
  const { pacientes, loading, error } = usePacientes()
  const [search, setSearch] = useState('')

  const filtered = pacientes.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Pacientes</h1>
        <Link
          to="/pacientes/novo"
          className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          Novo
        </Link>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar paciente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <p className="text-center py-8 text-sm text-[#E07070]">Erro ao carregar pacientes.</p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <UserRound size={40} className="text-border mx-auto mb-3" />
          <p className="text-muted text-sm">
            {search ? 'Nenhum paciente encontrado.' : 'Nenhum paciente cadastrado ainda.'}
          </p>
          {!search && (
            <Link to="/pacientes/novo" className="inline-block mt-4 text-sm text-primary font-medium hover:underline">
              Cadastrar primeiro paciente
            </Link>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map(p => (
            <PacienteCard key={p.id} paciente={p} />
          ))}
        </div>
      )}
    </div>
  )
}
