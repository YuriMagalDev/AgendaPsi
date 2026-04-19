import { useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { usePacienteDetalhe } from '@/hooks/usePacienteDetalhe'
import { usePacientes } from '@/hooks/usePacientes'
import { useConvenios } from '@/hooks/useConvenios'
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'

const schema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  telefone: z.string().optional(),
  email: z.string().email('E-mail inválido').or(z.literal('')).optional(),
  data_nascimento: z.string().optional(),
  tipo: z.enum(['particular', 'convenio']).default('particular'),
  convenio_id: z.string().optional(),
  modalidade_sessao_id: z.string().min(1, 'Selecione a modalidade de sessão'),
  meio_atendimento_id: z.string().min(1, 'Selecione o meio de atendimento'),
  tem_contrato: z.boolean(),
  contrato_tipo: z.enum(['por_sessao', 'pacote', 'mensal']).optional(),
  contrato_valor: z.string().optional(),
  contrato_qtd_sessoes: z.string().optional(),
  contrato_dia_vencimento: z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.tipo === 'convenio' && !d.convenio_id) {
    ctx.addIssue({ code: 'custom', path: ['convenio_id'], message: 'Selecione o convênio' })
  }
  if (d.tem_contrato && d.tipo === 'particular') {
    if (!d.contrato_tipo) {
      ctx.addIssue({ code: 'custom', path: ['contrato_tipo'], message: 'Selecione o tipo de contrato' })
    }
    if (!d.contrato_valor || Number(d.contrato_valor) <= 0) {
      ctx.addIssue({ code: 'custom', path: ['contrato_valor'], message: 'Informe o valor' })
    }
  }
})

type FormData = z.infer<typeof schema>

const inputClass = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function EditarPacientePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { paciente, contrato, loading } = usePacienteDetalhe(id!)
  const { updatePaciente } = usePacientes()
  const { convenios } = useConvenios()
  const { modalidadesSessao } = useModalidadesSessao()
  const { meiosAtendimento } = useMeiosAtendimento()

  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'particular', tem_contrato: false, modalidade_sessao_id: '', meio_atendimento_id: '' },
  })

  const tipo = watch('tipo')
  const temContrato = watch('tem_contrato')
  const contratoTipo = watch('contrato_tipo')

  useEffect(() => {
    if (!paciente) return
    reset({
      nome: paciente.nome,
      telefone: paciente.telefone ?? '',
      email: paciente.email ?? '',
      data_nascimento: paciente.data_nascimento ?? '',
      tipo: paciente.tipo,
      convenio_id: paciente.convenio_id ?? '',
      modalidade_sessao_id: paciente.modalidade_sessao_id,
      meio_atendimento_id: paciente.meio_atendimento_id,
      tem_contrato: !!contrato,
      contrato_tipo: contrato?.tipo,
      contrato_valor: contrato ? String(contrato.valor) : '',
      contrato_qtd_sessoes: contrato?.qtd_sessoes ? String(contrato.qtd_sessoes) : '',
      contrato_dia_vencimento: contrato?.dia_vencimento ? String(contrato.dia_vencimento) : '',
    })
  }, [paciente, contrato, reset])

  async function onSubmit(data: FormData) {
    try {
      await updatePaciente(id!, {
        nome: data.nome,
        telefone: data.telefone || null,
        email: data.email || null,
        data_nascimento: data.data_nascimento || null,
        tipo: data.tipo,
        convenio_id: data.tipo === 'convenio' ? (data.convenio_id || null) : null,
        modalidade_sessao_id: data.modalidade_sessao_id,
        meio_atendimento_id: data.meio_atendimento_id,
        contrato: data.tem_contrato && data.tipo === 'particular' && data.contrato_tipo
          ? {
              tipo: data.contrato_tipo,
              valor: Number(data.contrato_valor),
              qtd_sessoes: data.contrato_qtd_sessoes ? Number(data.contrato_qtd_sessoes) : null,
              dia_vencimento: data.contrato_dia_vencimento ? Number(data.contrato_dia_vencimento) : null,
            }
          : null,
      })
      navigate(`/pacientes/${id}`)
    } catch {
      setError('root', { message: 'Erro ao salvar. Tente novamente.' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!paciente) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted">Paciente não encontrado.</p>
        <Link to="/pacientes" className="text-primary text-sm mt-2 inline-block hover:underline">
          Voltar para Pacientes
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/pacientes/${id}`} className="text-muted hover:text-[#1C1C1C] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Editar paciente</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

        {/* Dados pessoais */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Dados pessoais</p>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Nome completo</label>
            <input {...register('nome')} className={inputClass} />
            {errors.nome && <span className="text-xs text-[#E07070]">{errors.nome.message}</span>}
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#1C1C1C]">Tipo de atendimento</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" value="particular" {...register('tipo')} className="accent-primary" />
                Particular
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" value="convenio" {...register('tipo')} className="accent-primary" />
                Convênio
              </label>
            </div>
          </div>

          {tipo === 'convenio' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#1C1C1C]">Plano de saúde</label>
              <select {...register('convenio_id')} className={inputClass}>
                <option value="">Selecionar...</option>
                {convenios.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              {errors.convenio_id && <span className="text-xs text-[#E07070]">{errors.convenio_id.message}</span>}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Telefone / WhatsApp</label>
            <input {...register('telefone')} placeholder="(11) 99999-9999" className={inputClass} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">E-mail</label>
            <input {...register('email')} type="email" placeholder="email@exemplo.com" className={inputClass} />
            {errors.email && <span className="text-xs text-[#E07070]">{errors.email.message}</span>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Data de nascimento</label>
            <input {...register('data_nascimento')} type="date" className={inputClass} />
          </div>

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
        </div>

        {/* Cobrança */}
        {tipo === 'particular' && (
          <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Cobrança</p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('tem_contrato')} className="accent-primary w-4 h-4" />
              <span className="text-sm">Definir contrato de cobrança</span>
            </label>

            {temContrato && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-[#1C1C1C]">Tipo de cobrança</label>
                  <select {...register('contrato_tipo')} className={inputClass}>
                    <option value="">Selecionar...</option>
                    <option value="por_sessao">Por sessão</option>
                    <option value="pacote">Pacote de sessões</option>
                    <option value="mensal">Mensal</option>
                  </select>
                  {errors.contrato_tipo && <span className="text-xs text-[#E07070]">{errors.contrato_tipo.message}</span>}
                </div>

                {contratoTipo && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-[#1C1C1C]">Valor (R$)</label>
                    <input {...register('contrato_valor')} type="number" step="0.01" min="0" className={inputClass} />
                    {errors.contrato_valor && <span className="text-xs text-[#E07070]">{errors.contrato_valor.message}</span>}
                  </div>
                )}

                {contratoTipo === 'pacote' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-[#1C1C1C]">Número de sessões no pacote</label>
                    <input {...register('contrato_qtd_sessoes')} type="number" min="1" className={inputClass} />
                  </div>
                )}

                {contratoTipo === 'mensal' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-[#1C1C1C]">Dia de vencimento</label>
                    <input {...register('contrato_dia_vencimento')} type="number" min="1" max="31" className={inputClass} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {errors.root && (
          <p className="text-sm text-[#E07070] text-center">{errors.root.message}</p>
        )}

        <div className="flex gap-3">
          <Link
            to={`/pacientes/${id}`}
            className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors flex items-center justify-center"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
