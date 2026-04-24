// src/components/pacientes/ImportarPacientesModal.tsx
import { useState } from 'react'
import { X, AlertCircle, CheckCircle2, MinusCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface ParsedRow {
  nome: string
  telefone: string
  email: string
  data_nascimento: string
  tipo: 'particular' | 'convenio'
  ativo: boolean
  _status: 'valid' | 'invalid' | 'duplicate'
  _error?: string
}

interface Props {
  rawRows: Record<string, string>[]
  existentes: { nome: string; telefone: string | null }[]
  onClose: () => void
  onImportado: () => void
}

function validarRow(raw: Record<string, string>, existentes: { nome: string; telefone: string | null }[]): ParsedRow {
  const nome = raw.nome?.trim() ?? ''
  const telefone = raw.telefone?.trim() ?? ''
  const email = raw.email?.trim() ?? ''
  const data_nascimento = raw.data_nascimento?.trim() ?? ''
  const tipoRaw = raw.tipo?.trim().toLowerCase()
  const tipo: 'particular' | 'convenio' = tipoRaw === 'convenio' ? 'convenio' : 'particular'
  const ativoRaw = raw.ativo?.trim().toLowerCase()
  const ativo = ativoRaw === 'false' ? false : true

  if (!nome) {
    return { nome, telefone, email, data_nascimento, tipo, ativo, _status: 'invalid', _error: 'Nome obrigatório' }
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { nome, telefone, email, data_nascimento, tipo, ativo, _status: 'invalid', _error: 'E-mail inválido' }
  }

  const isDuplicate = existentes.some(
    e => e.nome.toLowerCase() === nome.toLowerCase() && (e.telefone ?? '') === telefone
  )
  if (isDuplicate) {
    return { nome, telefone, email, data_nascimento, tipo, ativo, _status: 'duplicate' }
  }

  return { nome, telefone, email, data_nascimento, tipo, ativo, _status: 'valid' }
}

export function ImportarPacientesModal({ rawRows, existentes, onClose, onImportado }: Props) {
  const rows: ParsedRow[] = rawRows.map(r => validarRow(r, existentes))
  const validos = rows.filter(r => r._status === 'valid')
  const invalidos = rows.filter(r => r._status === 'invalid').length
  const duplicados = rows.filter(r => r._status === 'duplicate').length

  const [importando, setImportando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function confirmarImport() {
    if (validos.length === 0) return
    setImportando(true)
    setErro(null)
    try {
      const { error } = await supabase.from('pacientes').insert(
        validos.map(r => ({
          nome: r.nome,
          telefone: r.telefone || null,
          email: r.email || null,
          data_nascimento: r.data_nascimento || null,
          tipo: r.tipo,
          ativo: r.ativo,
          modalidade_sessao_id: null,
          meio_atendimento_id: null,
        }))
      )
      if (error) throw error
      onImportado()
      onClose()
    } catch {
      setErro('Erro ao importar. Tente novamente.')
      setImportando(false)
    }
  }

  const statusIcon = {
    valid: <CheckCircle2 size={14} className="text-[#4CAF82] shrink-0" />,
    invalid: <AlertCircle size={14} className="text-[#E07070] shrink-0" />,
    duplicate: <MinusCircle size={14} className="text-muted shrink-0" />,
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-2xl shadow-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <p className="font-display font-semibold text-[#1C1C1C]">Importar pacientes</p>
            <p className="text-xs text-muted mt-0.5">
              {validos.length} válidos · {duplicados} duplicados · {invalidos} com erros
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted border-b border-border">
                <th className="text-left pb-2 font-medium w-6"></th>
                <th className="text-left pb-2 font-medium">Nome</th>
                <th className="text-left pb-2 font-medium">Telefone</th>
                <th className="text-left pb-2 font-medium">E-mail</th>
                <th className="text-left pb-2 font-medium">Tipo</th>
                <th className="text-left pb-2 font-medium">Obs.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={i}
                  className={`border-b border-border/50 last:border-0 ${
                    r._status === 'invalid' ? 'bg-[#E07070]/5' :
                    r._status === 'duplicate' ? 'opacity-50' : ''
                  }`}
                >
                  <td className="py-1.5 pr-2">{statusIcon[r._status]}</td>
                  <td className="py-1.5 pr-3 font-medium text-[#1C1C1C]">{r.nome || '—'}</td>
                  <td className="py-1.5 pr-3 text-muted">{r.telefone || '—'}</td>
                  <td className="py-1.5 pr-3 text-muted">{r.email || '—'}</td>
                  <td className="py-1.5 pr-3 text-muted capitalize">{r.tipo}</td>
                  <td className="py-1.5 text-[#E07070]">
                    {r._status === 'invalid' ? r._error : r._status === 'duplicate' ? 'Duplicado' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-between flex-shrink-0">
          {erro && <p className="text-xs text-[#E07070]">{erro}</p>}
          {!erro && <span />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 h-9 text-sm border border-border rounded-lg text-[#1C1C1C] hover:bg-bg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarImport}
              disabled={validos.length === 0 || importando}
              className="px-4 h-9 text-sm bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {importando ? 'Importando...' : `Importar ${validos.length} paciente${validos.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
