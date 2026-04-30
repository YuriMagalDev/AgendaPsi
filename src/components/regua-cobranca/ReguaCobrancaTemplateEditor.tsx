import { useState } from 'react'
import type { EtapaCobranca, RegraCobranca } from '@/lib/types'

interface Props {
  etapa: EtapaCobranca
  regra?: RegraCobranca
  onSave: (template: string, dias: number, ativo: boolean) => Promise<void>
  onDelete: () => Promise<void>
}

const inputClass =
  'h-9 px-3 rounded-lg border border-[#E4E0DA] bg-white text-sm outline-none focus:ring-2 focus:ring-[#2D6A6A]/20 focus:border-[#2D6A6A] transition-colors'

const defaultTemplates: Record<EtapaCobranca, string> = {
  1: 'Olá {{nome}}, tudo bem? Passando para lembrar que a sessão do dia {{data_sessao}} gerou um valor de R$ {{valor}}.\n\nPode pagar via PIX: {{chave_pix}}\n\nQualquer dúvida, é só falar. Obrigada!',
  2: 'Olá {{nome}}! Ainda não identificamos o pagamento da sessão de {{data_sessao}} (R$ {{valor}}).\n\nPIX: {{chave_pix}}\n\nSe já pagou, desconsidere esta mensagem. Obrigada!',
  3: 'Oi {{nome}}, último lembrete sobre a sessão de {{data_sessao}} no valor de R$ {{valor}}.\n\nPIX: {{chave_pix}}\n\nQualquer problema, me avise. Obrigada!',
}

export function ReguaCobrancaTemplateEditor({ etapa, regra, onSave, onDelete }: Props) {
  const [template, setTemplate] = useState(regra?.template_mensagem ?? defaultTemplates[etapa])
  const [dias, setDias]         = useState(regra?.dias_apos ?? (etapa === 1 ? 1 : etapa === 2 ? 3 : 7))
  const [ativo, setAtivo]       = useState(regra?.ativo ?? true)
  const [saving, setSaving]     = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave(template, dias, ativo)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!window.confirm('Deseja excluir este modelo? Esta ação não pode ser desfeita.')) return
    await onDelete()
  }

  return (
    <div className="p-4 border border-[#E4E0DA] rounded-xl bg-[#F7F5F2]">
      <div className="flex items-center justify-between mb-4">
        <h5 className="text-sm font-semibold text-[#1C1C1C]">
          {'Lembrete '}
          {etapa}
          {regra && (
            <span className="ml-2 text-xs font-normal text-[#7A7A7A]">
              — envia {regra.dias_apos === 0 ? 'no mesmo dia' : `${regra.dias_apos} dia${regra.dias_apos > 1 ? 's' : ''} depois`}
            </span>
          )}
        </h5>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="w-4 h-4 accent-[#2D6A6A]"
          />
          <span className="text-xs text-[#7A7A7A]">Ativo</span>
        </label>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-semibold text-[#1C1C1C] mb-1">
          Enviar após (dias da sessão)
        </label>
        <input
          type="number"
          min={0}
          value={dias}
          onChange={(e) => setDias(Math.max(0, parseInt(e.target.value) || 0))}
          className={`${inputClass} w-28`}
        />
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-[#1C1C1C] mb-1">
          Mensagem
        </label>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={5}
          className="w-full px-3 py-2 rounded-lg border border-[#E4E0DA] bg-white text-xs outline-none focus:ring-2 focus:ring-[#2D6A6A]/20 focus:border-[#2D6A6A] transition-colors resize-y"
        />
        <p className="mt-1 text-xs text-[#7A7A7A]">
          Variáveis disponíveis:{' '}
          <code className="bg-white px-1 rounded">{'{{nome}}'}</code>{' '}
          <code className="bg-white px-1 rounded">{'{{valor}}'}</code>{' '}
          <code className="bg-white px-1 rounded">{'{{data_sessao}}'}</code>{' '}
          <code className="bg-white px-1 rounded">{'{{chave_pix}}'}</code>
        </p>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-9 rounded-lg bg-[#2D6A6A] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#2D6A6A]/90 transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        {regra && (
          <button
            onClick={handleDelete}
            className="flex-1 h-9 rounded-lg border border-[#E07070] text-[#E07070] text-sm font-medium hover:bg-[#E07070]/5 transition-colors"
          >
            Deletar
          </button>
        )}
      </div>
    </div>
  )
}
