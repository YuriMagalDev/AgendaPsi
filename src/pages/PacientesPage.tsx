import { useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ChevronRight, UserRound, Upload } from 'lucide-react'
import { usePacientes } from '@/hooks/usePacientes'
import { PatientFilters } from '@/components/pacientes/PatientFilters'
import { filterPacientes, DEFAULT_PACIENTE_FILTERS } from '@/lib/filterPacientes'
import { buildCsv, parseCsv } from '@/lib/csv'
import { ImportarPacientesModal } from '@/components/pacientes/ImportarPacientesModal'
import type { Paciente } from '@/lib/types'
import type { PatientCsvRow } from '@/lib/csv'

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
          {!paciente.ativo && (
            <span className="text-xs text-muted italic">Arquivado</span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </Link>
  )
}

export function PacientesPage() {
  const { pacientes, loading, error } = usePacientes({ ativoOnly: false })
  const [filters, setFilters] = useState(DEFAULT_PACIENTE_FILTERS)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importRows, setImportRows] = useState<Record<string, string>[] | null>(null)

  const filtered = filterPacientes(pacientes, filters)

  function handleArquivoSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const rows = parseCsv(text)
      setImportRows(rows.length > 0 ? rows : [])
    }
    reader.readAsText(file)
    e.target.value = '' // reset so same file can be re-selected
  }

  function exportarCsv() {
    const rows: PatientCsvRow[] = pacientes.map(p => ({
      nome: p.nome,
      telefone: p.telefone ?? '',
      email: p.email ?? '',
      data_nascimento: p.data_nascimento ?? '',
      tipo: p.tipo,
      ativo: String(p.ativo),
    }))
    const csv = buildCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'pacientes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Pacientes</h1>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleArquivoSelecionado}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg transition-colors"
          >
            <Upload size={14} />
            Importar CSV
          </button>
          <button
            onClick={exportarCsv}
            disabled={loading || pacientes.length === 0}
            className="text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg transition-colors disabled:opacity-40"
          >
            Exportar CSV
          </button>
          <Link
            to="/pacientes/novo"
            className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
            Novo
          </Link>
        </div>
      </div>

      <PatientFilters
        filters={filters}
        onChange={setFilters}
        resultCount={filtered.length}
      />

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
            {filters.search || filters.modalidadeId || filters.tipoContrato
              ? 'Nenhum paciente encontrado para os filtros selecionados.'
              : 'Nenhum paciente cadastrado ainda.'
            }
          </p>
          {!filters.search && !filters.modalidadeId && !filters.tipoContrato && (
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

      {importRows !== null && (
        <ImportarPacientesModal
          rawRows={importRows}
          existentes={pacientes.map(p => ({ nome: p.nome, telefone: p.telefone ?? null }))}
          onClose={() => setImportRows(null)}
          onImportado={() => { setImportRows(null); window.location.reload() }}
        />
      )}
    </div>
  )
}
