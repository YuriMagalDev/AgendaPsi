import { useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useRiscoTemplates } from '@/hooks/useRiscoTemplates'
import type { PacienteEmRisco } from '@/lib/types'

interface Props {
  paciente: PacienteEmRisco
  onClose: () => void
  onSent: () => void
}

function diasAusente(ultimaSessao: string | null): string {
  if (!ultimaSessao) return '?'
  const diff = Math.floor((Date.now() - new Date(ultimaSessao).getTime()) / (1000 * 60 * 60 * 24))
  return String(diff)
}

function formatarData(iso: string | null): string {
  if (!iso) return 'N/A'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function aplicarVariaveis(texto: string, paciente: PacienteEmRisco): string {
  return texto
    .replace(/\{\{nome\}\}/g, paciente.nome)
    .replace(/\{\{dias_ausente\}\}/g, diasAusente(paciente.ultima_sessao_data_hora))
    .replace(/\{\{ultima_sessao\}\}/g, formatarData(paciente.ultima_sessao_data_hora))
}

export function SendFollowupModal({ paciente, onClose, onSent }: Props) {
  const { templates, loading: templatesLoading } = useRiscoTemplates()
  const [templateId, setTemplateId] = useState<string>('')
  const [personalizado, setPersonalizado] = useState(false)
  const [mensagemCustom, setMensagemCustom] = useState('')
  const [enviando, setEnviando] = useState(false)

  const templateSelecionado = templates.find(t => t.id === templateId)
  const textoBase = personalizado ? mensagemCustom : (templateSelecionado?.corpo ?? '')
  const preview = textoBase ? aplicarVariaveis(textoBase, paciente) : ''

  const semTelefone = !paciente.telefone

  async function handleEnviar() {
    setEnviando(true)
    try {
      const { error } = await supabase.functions.invoke('send-followup', {
        body: {
          paciente_id: paciente.id,
          template_id: personalizado ? null : (templateId || null),
          custom_message: personalizado ? mensagemCustom : null,
        },
      })
      if (error) throw error
      toast.success('Mensagem enviada!')
      onSent()
    } catch {
      toast.error('Erro ao enviar mensagem')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-lg shadow-lg flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="font-display font-semibold text-[#1C1C1C]">Enviar mensagem</p>
            <p className="text-xs text-muted mt-0.5">{paciente.nome}</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div>
            <label className="text-sm font-medium text-[#1C1C1C] block mb-1.5">Template</label>
            <select
              value={templateId}
              onChange={e => setTemplateId(e.target.value)}
              disabled={personalizado || templatesLoading}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-[#1C1C1C] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Selecione um template</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-[#1C1C1C] cursor-pointer">
            <input
              type="checkbox"
              checked={personalizado}
              onChange={e => setPersonalizado(e.target.checked)}
              className="accent-primary"
            />
            Mensagem personalizada
          </label>

          {personalizado && (
            <div>
              <label className="text-sm font-medium text-[#1C1C1C] block mb-1.5">Mensagem</label>
              <textarea
                value={mensagemCustom}
                onChange={e => setMensagemCustom(e.target.value)}
                rows={4}
                placeholder="Digite a mensagem. Use {{nome}}, {{dias_ausente}}, {{ultima_sessao}}"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-[#1C1C1C] resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}

          {preview && (
            <div className="bg-[#F7F5F2] border border-border rounded-lg px-3 py-2">
              <p className="text-xs text-muted mb-1 font-medium">Pré-visualização</p>
              <p className="text-sm text-[#1C1C1C] whitespace-pre-wrap">{preview}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 h-9 text-sm border border-border rounded-lg text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            Cancelar
          </button>
          {semTelefone ? (
            <div title="Sem telefone cadastrado">
              <button
                disabled
                className="px-4 h-9 text-sm bg-primary text-white font-medium rounded-lg opacity-40 cursor-not-allowed"
              >
                Enviar via WhatsApp
              </button>
            </div>
          ) : (
            <button
              onClick={handleEnviar}
              disabled={enviando || (!personalizado && !templateId) || (personalizado && !mensagemCustom.trim())}
              className="px-4 h-9 text-sm bg-primary text-white font-medium rounded-lg hover:bg-primary/90 disabled:opacity-40 transition-colors"
            >
              {enviando ? 'Enviando...' : 'Enviar via WhatsApp'}
            </button>
          )}
        </div>

        {semTelefone && (
          <p className="px-5 pb-4 text-xs text-muted text-right">Sem telefone cadastrado</p>
        )}
      </div>
    </div>
  )
}
