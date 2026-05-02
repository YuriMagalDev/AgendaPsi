import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Trash2, Plus, Pencil, X, Check } from 'lucide-react'
import { useRiscoConfig } from '@/hooks/useRiscoConfig'
import { useRiscoTemplates } from '@/hooks/useRiscoTemplates'
import type { RiscoTemplate } from '@/lib/types'

const inputClass =
  'h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors'

// ── Threshold sub-section ──────────────────────────────────────────────────

function LimiaresForm() {
  const { config, loading, update } = useRiscoConfig()
  const [form, setForm] = useState({
    min_cancelamentos_seguidos: '',
    dias_sem_sessao: '',
    dias_apos_falta_sem_agendamento: '',
  })
  const [synced, setSynced] = useState(false)
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (config && !synced) {
      setForm({
        min_cancelamentos_seguidos: String(config.min_cancelamentos_seguidos),
        dias_sem_sessao: String(config.dias_sem_sessao),
        dias_apos_falta_sem_agendamento: String(config.dias_apos_falta_sem_agendamento),
      })
      setSynced(true)
    }
  }, [config, synced])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await update({
        min_cancelamentos_seguidos: Number(form.min_cancelamentos_seguidos),
        dias_sem_sessao: Number(form.dias_sem_sessao),
        dias_apos_falta_sem_agendamento: Number(form.dias_apos_falta_sem_agendamento),
      })
      toast.success('Configurações salvas')
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setSalvando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[#1C1C1C]">Cancelamentos seguidos</label>
        <p className="text-xs text-muted">Número mínimo de cancelamentos consecutivos para sinalizar risco</p>
        <input
          type="number"
          min={2}
          max={10}
          value={form.min_cancelamentos_seguidos}
          onChange={e => setForm(f => ({ ...f, min_cancelamentos_seguidos: e.target.value }))}
          disabled={!config}
          className={`${inputClass} w-24`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[#1C1C1C]">Dias sem sessão</label>
        <p className="text-xs text-muted">Paciente sem sessão por este número de dias é considerado em risco de inatividade</p>
        <input
          type="number"
          min={7}
          max={180}
          value={form.dias_sem_sessao}
          onChange={e => setForm(f => ({ ...f, dias_sem_sessao: e.target.value }))}
          disabled={!config}
          className={`${inputClass} w-24`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[#1C1C1C]">Dias após falta sem reagendamento</label>
        <p className="text-xs text-muted">Paciente que faltou e não reagendou após este número de dias é sinalizado</p>
        <input
          type="number"
          min={1}
          max={30}
          value={form.dias_apos_falta_sem_agendamento}
          onChange={e => setForm(f => ({ ...f, dias_apos_falta_sem_agendamento: e.target.value }))}
          disabled={!config}
          className={`${inputClass} w-24`}
        />
      </div>

      <button
        type="submit"
        disabled={salvando || !config}
        className="self-end h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        {salvando ? 'Salvando...' : 'Salvar'}
      </button>
    </form>
  )
}

// ── Inline edit form for a single template ─────────────────────────────────

interface TemplateEditFormProps {
  initial: { nome: string; corpo: string }
  onSave: (nome: string, corpo: string) => Promise<void>
  onCancel: () => void
  saveLabel?: string
}

function TemplateEditForm({ initial, onSave, onCancel, saveLabel = 'Salvar' }: TemplateEditFormProps) {
  const [nome, setNome] = useState(initial.nome)
  const [corpo, setCorpo] = useState(initial.corpo)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !corpo.trim()) return
    setSaving(true)
    try {
      await onSave(nome.trim(), corpo.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-2 p-3 bg-[#F7F5F2] rounded-lg border border-border">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[#1C1C1C]">Nome</label>
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          className={`${inputClass} w-full`}
          placeholder="Nome do template"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-[#1C1C1C]">Mensagem</label>
        <textarea
          value={corpo}
          onChange={e => setCorpo(e.target.value)}
          rows={4}
          className="px-3 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors resize-none"
          placeholder="Texto da mensagem"
          required
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-8 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-bg transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving || !nome.trim() || !corpo.trim()}
          className="h-8 px-3 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center gap-1"
        >
          <Check size={14} />
          {saving ? 'Salvando...' : saveLabel}
        </button>
      </div>
    </form>
  )
}

// ── Templates sub-section ──────────────────────────────────────────────────

function TemplatesSection() {
  const { templates, loading, create, update, remove } = useRiscoTemplates({ soAtivos: false })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  async function handleToggleAtivo(template: RiscoTemplate) {
    try {
      await update(template.id, { ativo: !template.ativo })
      toast.success(template.ativo ? 'Template desativado' : 'Template ativado')
    } catch {
      toast.error('Erro ao atualizar template')
    }
  }

  async function handleEdit(template: RiscoTemplate, nome: string, corpo: string) {
    try {
      await update(template.id, { nome, corpo })
      toast.success('Template atualizado')
      setEditingId(null)
    } catch {
      toast.error('Erro ao salvar template')
    }
  }

  async function handleRemove(template: RiscoTemplate) {
    if (!confirm(`Excluir o template "${template.nome}"?`)) return
    try {
      await remove(template.id)
      toast.success('Template excluído')
    } catch {
      toast.error('Erro ao excluir template')
    }
  }

  async function handleCreate(nome: string, corpo: string) {
    try {
      await create(nome, corpo)
      toast.success('Template criado')
      setShowNew(false)
    } catch {
      toast.error('Erro ao criar template')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {templates.length === 0 && !showNew && (
        <p className="text-sm text-muted">Nenhum template cadastrado.</p>
      )}

      {templates.map(template => (
        <div key={template.id} className="border border-border rounded-lg p-3 bg-[#F7F5F2]">
          <div className="flex items-start gap-3">
            {/* Toggle ativo */}
            <label className="flex items-center gap-1.5 cursor-pointer mt-0.5 shrink-0" title={template.ativo ? 'Desativar' : 'Ativar'}>
              <input
                type="checkbox"
                checked={template.ativo}
                onChange={() => handleToggleAtivo(template)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-border rounded-full peer peer-checked:bg-primary transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-3 after:h-3 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
            </label>

            {/* Name + preview */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#1C1C1C] truncate">{template.nome}</p>
              <p className="text-xs text-muted mt-0.5 line-clamp-2">{template.corpo}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => setEditingId(editingId === template.id ? null : template.id)}
                className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-[#E8F4F4] transition-colors"
                title="Editar"
              >
                {editingId === template.id ? <X size={14} /> : <Pencil size={14} />}
              </button>
              <button
                onClick={() => handleRemove(template)}
                className="p-1.5 rounded-lg text-muted hover:text-[#E07070] hover:bg-[#E07070]/10 transition-colors"
                title="Excluir"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Inline edit form */}
          {editingId === template.id && (
            <TemplateEditForm
              initial={{ nome: template.nome, corpo: template.corpo }}
              onSave={(nome, corpo) => handleEdit(template, nome, corpo)}
              onCancel={() => setEditingId(null)}
            />
          )}
        </div>
      ))}

      {/* New template form */}
      {showNew && (
        <div className="border border-dashed border-border rounded-lg p-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Novo template</p>
          <TemplateEditForm
            initial={{ nome: '', corpo: '' }}
            onSave={handleCreate}
            onCancel={() => setShowNew(false)}
            saveLabel="Criar"
          />
        </div>
      )}

      {/* Add button */}
      {!showNew && (
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 h-9 px-3 self-start rounded-lg border border-dashed border-border text-sm text-muted hover:text-primary hover:border-primary hover:bg-[#E8F4F4] transition-colors"
        >
          <Plus size={15} />
          Novo template
        </button>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────

export function RiscoConfigSection() {
  return (
    <div className="bg-surface border border-border rounded-card p-6 flex flex-col gap-6">
      <h2 className="font-display text-lg font-semibold text-[#1C1C1C]">Pacientes em Risco</h2>

      {/* Sub-seção: Limiares */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Limiares de Alerta</p>
          <p className="text-xs text-muted mt-0.5">Defina quando um paciente deve ser sinalizado como em risco</p>
        </div>
        <LimiaresForm />
      </div>

      {/* Divider */}
      <div className="border-t border-border" />

      {/* Sub-seção: Templates */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Templates de Mensagem</p>
          <p className="text-xs text-muted mt-0.5">Mensagens de acompanhamento para pacientes em risco</p>
        </div>
        <TemplatesSection />
      </div>
    </div>
  )
}
