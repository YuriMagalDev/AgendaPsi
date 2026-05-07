import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useRiscoTemplates } from '@/hooks/useRiscoTemplates'
import type { PacienteEmRisco } from '@/lib/types'

const TEMPLATE_PADRAO_ID = '__padrao__'
const TEMPLATE_PADRAO_CORPO =
  'Oi {{nome}}, tudo bem? Notei que faz {{dias_ausente}} dias que não marcamos uma sessão. Gostaria de retomar? Estou à disposição! 😊'

const VARIAVEIS = [
  { label: 'Nome', valor: '{{nome}}' },
  { label: 'Dias ausente', valor: '{{dias_ausente}}' },
  { label: 'Última sessão', valor: '{{ultima_sessao}}' },
]

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
  const [templateId, setTemplateId] = useState<string>(TEMPLATE_PADRAO_ID)
  const [personalizado, setPersonalizado] = useState(false)
  const [mensagemCustom, setMensagemCustom] = useState('')
  const [enviando, setEnviando] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const templateSelecionado = templates.find(t => t.id === templateId)
  const corpoTemplate = templateId === TEMPLATE_PADRAO_ID ? TEMPLATE_PADRAO_CORPO : (templateSelecionado?.corpo ?? '')
  const textoBase = personalizado ? mensagemCustom : corpoTemplate
  const preview = textoBase ? aplicarVariaveis(textoBase, paciente) : ''

  const semTelefone = !paciente.telefone

  function inserirVariavel(valor: string) {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const nova = mensagemCustom.slice(0, start) + valor + mensagemCustom.slice(end)
    setMensagemCustom(nova)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + valor.length, start + valor.length)
    })
  }

  async function handleEnviar() {
    setEnviando(true)
    try {
      const isPadrao = !personalizado && templateId === TEMPLATE_PADRAO_ID
      const { error } = await supabase.functions.invoke('send-followup', {
        body: {
          paciente_id: paciente.id,
          template_id: (!personalizado && templateId !== TEMPLATE_PADRAO_ID) ? templateId : null,
          custom_message: (personalizado || isPadrao) ? (personalizado ? mensagemCustom : TEMPLATE_PADRAO_CORPO) : null,
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

  const podeEnviar = personalizado ? mensagemCustom.trim().length > 0 : (templateId !== '')

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
              <option value={TEMPLATE_PADRAO_ID}>Reconexão Padrão</option>
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[#1C1C1C]">Mensagem</label>
                <div className="flex gap-1.5">
                  {VARIAVEIS.map(v => (
                    <button
                      key={v.valor}
                      type="button"
                      onClick={() => inserirVariavel(v.valor)}
                      className="px-2 py-0.5 text-xs rounded border border-border bg-[#F7F5F2] text-muted hover:text-[#1C1C1C] hover:border-primary/40 transition-colors font-mono"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                ref={textareaRef}
                value={mensagemCustom}
                onChange={e => setMensagemCustom(e.target.value)}
                rows={4}
                placeholder="Digite a mensagem..."
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
              disabled={enviando || !podeEnviar}
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
