import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePacientes } from '@/hooks/usePacientes'
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'

const schema = z.object({
  tipo: z.enum(['paciente', 'avulso']),
  paciente_id: z.string().optional(),
  avulso_nome: z.string().optional(),
  avulso_telefone: z.string().optional(),
  modalidade_sessao_id: z.string().min(1, 'Selecione a modalidade de sessão'),
  meio_atendimento_id: z.string().min(1, 'Selecione o meio de atendimento'),
  data_hora: z.string().min(1, 'Informe data e horário'),
  duracao_minutos: z.string().default('50'),
  valor_cobrado: z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.tipo === 'paciente' && !d.paciente_id) {
    ctx.addIssue({ code: 'custom', path: ['paciente_id'], message: 'Selecione o paciente' })
  }
  if (d.tipo === 'avulso' && (!d.avulso_nome || d.avulso_nome.trim().length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['avulso_nome'], message: 'Informe o nome' })
  }
})

type FormData = z.infer<typeof schema>

interface Props {
  defaultDate?: string
  onClose: () => void
  onSaved: () => void
}

const inputClass = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function NovaSessaoModal({ defaultDate, onClose, onSaved }: Props) {
  const { pacientes } = usePacientes()
  const { modalidadesSessao } = useModalidadesSessao()
  const { meiosAtendimento } = useMeiosAtendimento()
  const [serverError, setServerError] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: 'paciente',
      data_hora: defaultDate?.includes('T') ? defaultDate : defaultDate ? `${defaultDate}T08:00` : '',
    },
  })

  const tipo = watch('tipo')

  const pacienteId = watch('paciente_id')

  const pacienteSelecionado = pacientes.find(p => p.id === pacienteId) ?? null
  const isConvenio = pacienteSelecionado?.tipo === 'convenio'
  const convenioValor = (pacienteSelecionado as any)?.convenios?.valor_sessao ?? null

  useEffect(() => {
    if (isConvenio && convenioValor != null) {
      setValue('valor_cobrado', String(convenioValor))
    } else if (!isConvenio && tipo === 'paciente') {
      setValue('valor_cobrado', '')
    }
  }, [pacienteId, isConvenio, convenioValor, tipo, setValue])

  useEffect(() => {
    if (pacienteSelecionado) {
      setValue('modalidade_sessao_id', pacienteSelecionado.modalidade_sessao_id)
      setValue('meio_atendimento_id', pacienteSelecionado.meio_atendimento_id)
    }
  }, [pacienteId, pacienteSelecionado, setValue])

  async function onSubmit(data: FormData) {
    setServerError(null)
    try {
      const { error } = await supabase.from('sessoes').insert({
        paciente_id: data.tipo === 'paciente' ? data.paciente_id : null,
        avulso_nome: data.tipo === 'avulso' ? data.avulso_nome : null,
        avulso_telefone: data.tipo === 'avulso' ? (data.avulso_telefone || null) : null,
        modalidade_sessao_id: data.modalidade_sessao_id,
        meio_atendimento_id: data.meio_atendimento_id,
        data_hora: data.data_hora,
        status: 'agendada',
        duracao_minutos: Number(data.duracao_minutos) || 50,
        valor_cobrado: data.valor_cobrado ? Number(data.valor_cobrado) : null,
        pago: false,
      })
      if (error) throw error
      onSaved()
      onClose()
    } catch {
      setServerError('Erro ao salvar. Tente novamente.')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-card border border-border w-full max-w-md p-6 shadow-lg">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold text-[#1C1C1C]">Nova sessão</h2>
          <button onClick={onClose} className="text-muted hover:text-[#1C1C1C] transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Tipo */}
          <div className="flex gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value="paciente" {...register('tipo')} className="accent-primary" />
              <span className="text-sm">Paciente cadastrado</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" value="avulso" {...register('tipo')} className="accent-primary" />
              <span className="text-sm">Avulso</span>
            </label>
          </div>

          {tipo === 'paciente' ? (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#1C1C1C]">Paciente</label>
              <select {...register('paciente_id')} className={inputClass}>
                <option value="">Selecionar...</option>
                {pacientes.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>
              {errors.paciente_id && <span className="text-xs text-[#E07070]">{errors.paciente_id.message}</span>}
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#1C1C1C]">Nome</label>
                <input {...register('avulso_nome')} placeholder="Nome do paciente" className={inputClass} />
                {errors.avulso_nome && <span className="text-xs text-[#E07070]">{errors.avulso_nome.message}</span>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-[#1C1C1C]">WhatsApp (opcional)</label>
                <input {...register('avulso_telefone')} placeholder="(11) 99999-9999" className={inputClass} />
              </div>
            </>
          )}

          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-sm font-medium text-[#1C1C1C]">Modalidade de sessão</label>
              <select {...register('modalidade_sessao_id')} className={inputClass}>
                <option value="">Selecionar...</option>
                {modalidadesSessao.map(m => (
                  <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
                ))}
              </select>
              {errors.modalidade_sessao_id && <span className="text-xs text-[#E07070]">{errors.modalidade_sessao_id.message}</span>}
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-sm font-medium text-[#1C1C1C]">Meio de atendimento</label>
              <select {...register('meio_atendimento_id')} className={inputClass}>
                <option value="">Selecionar...</option>
                {meiosAtendimento.map(m => (
                  <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
                ))}
              </select>
              {errors.meio_atendimento_id && <span className="text-xs text-[#E07070]">{errors.meio_atendimento_id.message}</span>}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-sm font-medium text-[#1C1C1C]">Data e horário</label>
              <input type="datetime-local" {...register('data_hora')} className={inputClass} />
              {errors.data_hora && <span className="text-xs text-[#E07070]">{errors.data_hora.message}</span>}
            </div>
            <div className="flex flex-col gap-1 w-28">
              <label className="text-sm font-medium text-[#1C1C1C]">Duração</label>
              <select {...register('duracao_minutos')} className={inputClass}>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="50">50 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
              </select>
            </div>
          </div>

          {(tipo === 'avulso' || isConvenio) && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#1C1C1C]">
                Valor (R$){isConvenio && convenioValor != null && (
                  <span className="text-xs text-muted font-normal ml-1">
                    — valor do convênio: R$ {convenioValor.toFixed(2)}
                  </span>
                )}
              </label>
              <input
                {...register('valor_cobrado')}
                type="number"
                step="0.01"
                min="0"
                placeholder={convenioValor != null ? String(convenioValor) : '0,00'}
                className={inputClass}
              />
            </div>
          )}

          {serverError && <p className="text-sm text-[#E07070] text-center">{serverError}</p>}

          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose}
              className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
