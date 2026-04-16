import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { usePacientes } from '@/hooks/usePacientes'
import type { ContratoTipo } from '@/lib/types'

const schema = z
  .object({
    nome: z.string().min(1, 'Name is required'),
    telefone: z.string().optional(),
    email: z.string().optional(),
    data_nascimento: z.string().optional(),
    tem_contrato: z.boolean(),
    contrato_tipo: z.enum(['por_sessao', 'pacote', 'mensal']).optional(),
    contrato_valor: z.string().optional(),
    contrato_qtd_sessoes: z.string().optional(),
    contrato_dia_vencimento: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.email && data.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'Invalid E-mail' })
    }
    if (data.tem_contrato) {
      if (!data.contrato_tipo) {
        ctx.addIssue({ code: 'custom', path: ['contrato_tipo'], message: 'Select billing type' })
      }
      if (!data.contrato_valor || isNaN(Number(data.contrato_valor)) || Number(data.contrato_valor) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['contrato_valor'], message: 'Enter a valid amount' })
      }
      if (data.contrato_tipo === 'pacote') {
        if (!data.contrato_qtd_sessoes || isNaN(Number(data.contrato_qtd_sessoes)) || Number(data.contrato_qtd_sessoes) < 1) {
          ctx.addIssue({ code: 'custom', path: ['contrato_qtd_sessoes'], message: 'Enter the amount of sessions' })
        }
      }
      if (data.contrato_tipo === 'mensal') {
        const dia = Number(data.contrato_dia_vencimento)
        if (!data.contrato_dia_vencimento || isNaN(dia) || dia < 1 || dia > 31) {
          ctx.addIssue({ code: 'custom', path: ['contrato_dia_vencimento'], message: 'Enter a day between 1 and 31' })
        }
      }
    }
  })

type FormData = z.infer<typeof schema>

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span className="text-xs text-[#E07070] mt-1">{message}</span>
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm font-medium text-[#1C1C1C]">
      {children}
      {required && <span className="text-[#E07070] ml-0.5">*</span>}
    </label>
  )
}

const inputClass = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted"

export function NovoPacientePage() {
  const navigate = useNavigate()
  const { createPaciente } = usePacientes()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tem_contrato: false },
  })

  const temContrato = watch('tem_contrato')
  const contratoTipo = watch('contrato_tipo')

  async function onSubmit(data: FormData) {
    setServerError(null)
    try {
      const id = await createPaciente({
        nome: data.nome,
        telefone: data.telefone || undefined,
        email: data.email || undefined,
        data_nascimento: data.data_nascimento || undefined,
        contrato: data.tem_contrato && data.contrato_tipo
          ? {
              tipo: data.contrato_tipo as ContratoTipo,
              valor: Number(data.contrato_valor),
              qtd_sessoes: data.contrato_tipo === 'pacote' ? Number(data.contrato_qtd_sessoes) : undefined,
              dia_vencimento: data.contrato_tipo === 'mensal' ? Number(data.contrato_dia_vencimento) : undefined,
            }
          : undefined,
      })
      navigate(`/pacientes/${id}`)
    } catch {
      setServerError('Error saving. Try again.')
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/pacientes" className="text-muted hover:text-[#1C1C1C] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">New Patient</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Personal data */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Personal data</p>

          <div className="flex flex-col gap-1">
            <FieldLabel required>Name</FieldLabel>
            <input {...register('nome')} placeholder="Full name" className={inputClass} />
            <FieldError message={errors.nome?.message} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>WhatsApp</FieldLabel>
            <input {...register('telefone')} placeholder="(11) 99999-9999" className={inputClass} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>E-mail</FieldLabel>
            <input {...register('email')} type="email" placeholder="email@example.com" className={inputClass} />
            <FieldError message={errors.email?.message} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>Birth date</FieldLabel>
            <input {...register('data_nascimento')} type="date" className={inputClass} />
          </div>
        </div>

        {/* Contract */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Billing</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('tem_contrato')}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-[#1C1C1C]">Define now</span>
            </label>
          </div>

          {temContrato && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel>Billing type</FieldLabel>
                <select
                  {...register('contrato_tipo')}
                  className={inputClass}
                >
                  <option value="">Select...</option>
                  <option value="por_sessao">Per session</option>
                  <option value="pacote">Session package</option>
                  <option value="mensal">Monthly</option>
                </select>
                <FieldError message={errors.contrato_tipo?.message} />
              </div>

              <div className="flex flex-col gap-1">
                <FieldLabel>Amount (R$)</FieldLabel>
                <input
                  {...register('contrato_valor')}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className={inputClass}
                />
                <FieldError message={errors.contrato_valor?.message} />
              </div>

              {contratoTipo === 'pacote' && (
                <div className="flex flex-col gap-1">
                  <FieldLabel>Amount of sessions</FieldLabel>
                  <input
                    {...register('contrato_qtd_sessoes')}
                    type="number"
                    min="1"
                    placeholder="Ex: 10"
                    className={inputClass}
                  />
                  <FieldError message={errors.contrato_qtd_sessoes?.message} />
                </div>
              )}

              {contratoTipo === 'mensal' && (
                <div className="flex flex-col gap-1">
                  <FieldLabel>Due day</FieldLabel>
                  <input
                    {...register('contrato_dia_vencimento')}
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Ex: 5"
                    className={inputClass}
                  />
                  <FieldError message={errors.contrato_dia_vencimento?.message} />
                </div>
              )}
            </div>
          )}

          {!temContrato && (
            <p className="text-sm text-muted">You can define the billing method later in the patient's profile.</p>
          )}
        </div>

        {serverError && (
          <p className="text-sm text-[#E07070] text-center">{serverError}</p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Link
            to="/pacientes"
            className="flex-1 h-10 flex items-center justify-center rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
