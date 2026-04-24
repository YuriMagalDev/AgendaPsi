import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { getDay, nextDay, setHours, setMinutes, startOfDay, addWeeks } from 'date-fns'
import type { Day } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { usePacientes } from '@/hooks/usePacientes'
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
import { useConvenios } from '@/hooks/useConvenios'
import type { ContratoTipo, SessaoStatus, SlotSemanalInput } from '@/lib/types'

const schema = z
  .object({
    nome: z.string().min(1, 'Nome é obrigatório'),
    telefone: z.string().optional(),
    email: z.string().optional(),
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
  })
  .superRefine((data, ctx) => {
    if (data.email && data.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'E-mail inválido' })
    }
    if (data.tipo === 'convenio' && !data.convenio_id) {
      ctx.addIssue({ code: 'custom', path: ['convenio_id'], message: 'Selecione o plano de saúde' })
    }
    if (data.tem_contrato && data.tipo === 'particular') {
      if (!data.contrato_tipo) {
        ctx.addIssue({ code: 'custom', path: ['contrato_tipo'], message: 'Selecione o tipo de cobrança' })
      }
      if (!data.contrato_valor || isNaN(Number(data.contrato_valor)) || Number(data.contrato_valor) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['contrato_valor'], message: 'Informe um valor válido' })
      }
      if (data.contrato_tipo === 'pacote') {
        if (!data.contrato_qtd_sessoes || isNaN(Number(data.contrato_qtd_sessoes)) || Number(data.contrato_qtd_sessoes) < 1) {
          ctx.addIssue({ code: 'custom', path: ['contrato_qtd_sessoes'], message: 'Informe a quantidade de sessões' })
        }
      }
      if (data.contrato_tipo === 'mensal') {
        const dia = Number(data.contrato_dia_vencimento)
        if (!data.contrato_dia_vencimento || isNaN(dia) || dia < 1 || dia > 31) {
          ctx.addIssue({ code: 'custom', path: ['contrato_dia_vencimento'], message: 'Informe um dia entre 1 e 31' })
        }
      }
    }
  })

type FormData = z.infer<typeof schema>

const DIAS = [
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
  { value: 0, label: 'Domingo' },
]

function gerarSessoesParaSlot(pacienteId: string, slot: SlotSemanalInput, semanas = 8) {
  const hoje = startOfDay(new Date())
  const [hh, mm] = slot.horario.split(':').map(Number)
  const dia = slot.dia_semana as Day
  const inicio = getDay(hoje) === dia ? hoje : nextDay(hoje, dia)
  const pagoAutomatico = slot.is_pacote
  return Array.from({ length: semanas }, (_, i) => {
    const base = addWeeks(inicio, i)
    return {
      paciente_id: pacienteId,
      avulso_nome: null,
      avulso_telefone: null,
      modalidade_sessao_id: slot.modalidade_sessao_id,
      meio_atendimento_id: slot.meio_atendimento_id,
      data_hora: setMinutes(setHours(base, hh), mm).toISOString(),
      status: 'agendada' as SessaoStatus,
      valor_cobrado: null,
      pago: pagoAutomatico,
      data_pagamento: pagoAutomatico ? new Date().toISOString() : null,
      sessao_origem_id: null,
      duracao_minutos: 50,
    }
  })
}

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
const selectClass = "h-9 px-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function NovoPacientePage() {
  const navigate = useNavigate()
  const { createPaciente } = usePacientes()
  const { modalidadesSessao } = useModalidadesSessao()
  const { meiosAtendimento } = useMeiosAtendimento()
  const { convenios } = useConvenios()
  const [serverError, setServerError] = useState<string | null>(null)
  const [slots, setSlots] = useState<SlotSemanalInput[]>([])
  const [semanas, setSemanas] = useState(8)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tem_contrato: false, tipo: 'particular' },
  })

  const temContrato = watch('tem_contrato')
  const contratoTipo = watch('contrato_tipo')
  const tipo = watch('tipo')

  const adicionarSlot = () =>
    setSlots(p => [...p, { nome: '', dia_semana: 1, horario: '09:00', modalidade_sessao_id: '', meio_atendimento_id: '', is_pacote: false }])
  const removerSlot = (i: number) => setSlots(p => p.filter((_, j) => j !== i))
  const atualizarSlot = (i: number, campo: keyof SlotSemanalInput, val: unknown) =>
    setSlots(p => p.map((s, j) => j === i ? { ...s, [campo]: val } : s))

  async function onSubmit(data: FormData) {
    setServerError(null)

    const slotsInvalidos = slots.some(s => !s.modalidade_sessao_id || !s.meio_atendimento_id || !s.horario || !s.nome.trim())
    if (slotsInvalidos) {
      setServerError('Preencha modalidade e horário em todos os horários semanais.')
      return
    }

    try {
      const id = await createPaciente({
        nome: data.nome,
        telefone: data.telefone || undefined,
        email: data.email || undefined,
        data_nascimento: data.data_nascimento || undefined,
        tipo: data.tipo,
        convenio_id: data.tipo === 'convenio' ? data.convenio_id : undefined,
        modalidade_sessao_id: data.modalidade_sessao_id,
        meio_atendimento_id: data.meio_atendimento_id,
        contrato: data.tem_contrato && data.contrato_tipo && data.tipo === 'particular'
          ? {
              tipo: data.contrato_tipo as ContratoTipo,
              valor: Number(data.contrato_valor),
              qtd_sessoes: data.contrato_tipo === 'pacote' ? Number(data.contrato_qtd_sessoes) : undefined,
              dia_vencimento: data.contrato_tipo === 'mensal' ? Number(data.contrato_dia_vencimento) : undefined,
            }
          : undefined,
      })

      if (slots.length > 0) {
        const { error: slotErr } = await supabase.from('slots_semanais').insert(
          slots.map(s => ({ paciente_id: id, ...s, ativo: true }))
        )
        if (slotErr) throw slotErr

        const sessoesBulk = slots.flatMap(s => gerarSessoesParaSlot(id, s, semanas))
        const { error: sessErr } = await supabase.from('sessoes').insert(sessoesBulk)
        if (sessErr) throw sessErr
      }

      navigate(`/pacientes/${id}`)
    } catch {
      setServerError('Erro ao salvar. Tente novamente.')
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/pacientes" className="text-muted hover:text-[#1C1C1C] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Novo paciente</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Dados pessoais */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Dados pessoais</p>

          <div className="flex flex-col gap-1">
            <FieldLabel required>Nome</FieldLabel>
            <input {...register('nome')} placeholder="Nome completo" className={inputClass} />
            <FieldError message={errors.nome?.message} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel required>Tipo de atendimento</FieldLabel>
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
              <FieldLabel required>Plano de saúde</FieldLabel>
              <select {...register('convenio_id')} className={inputClass}>
                <option value="">Selecionar...</option>
                {convenios.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              <FieldError message={errors.convenio_id?.message} />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <FieldLabel>WhatsApp</FieldLabel>
            <input {...register('telefone')} placeholder="(11) 99999-9999" className={inputClass} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>E-mail</FieldLabel>
            <input {...register('email')} type="email" placeholder="email@exemplo.com" className={inputClass} />
            <FieldError message={errors.email?.message} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>Data de nascimento</FieldLabel>
            <input {...register('data_nascimento')} type="date" className={inputClass} />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <FieldLabel required>Modalidade de sessão</FieldLabel>
              <select {...register('modalidade_sessao_id')} className={inputClass}>
                <option value="">Selecionar...</option>
                {modalidadesSessao.map(m => (
                  <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
                ))}
              </select>
              <FieldError message={errors.modalidade_sessao_id?.message} />
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <FieldLabel required>Meio de atendimento</FieldLabel>
              <select {...register('meio_atendimento_id')} className={inputClass}>
                <option value="">Selecionar...</option>
                {meiosAtendimento.map(m => (
                  <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
                ))}
              </select>
              <FieldError message={errors.meio_atendimento_id?.message} />
            </div>
          </div>
        </div>

        {/* Horários semanais */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Horários semanais</p>
            <button
              type="button"
              onClick={adicionarSlot}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
            >
              <Plus size={14} />
              Adicionar horário
            </button>
          </div>

          {slots.length === 0 && (
            <p className="text-sm text-muted">
              Defina os dias e horários recorrentes do paciente. As sessões serão criadas automaticamente.
            </p>
          )}

          {slots.map((slot, i) => (
            <div key={i} className="flex flex-col gap-2 pb-3 border-b border-border last:border-0 last:pb-0">
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Nome do horário (ex: Sessão semanal)"
                  value={slot.nome}
                  onChange={e => atualizarSlot(i, 'nome', e.target.value)}
                  className={`${inputClass} flex-1 min-w-[160px]`}
                />
                <button
                  type="button"
                  onClick={() => removerSlot(i)}
                  className="text-muted hover:text-[#E07070] transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={slot.dia_semana}
                  onChange={e => atualizarSlot(i, 'dia_semana', Number(e.target.value))}
                  className={selectClass}
                >
                  {DIAS.map(d => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>

                <input
                  type="time"
                  value={slot.horario}
                  onChange={e => atualizarSlot(i, 'horario', e.target.value)}
                  className={`${selectClass} w-28`}
                />

                <select
                  value={slot.modalidade_sessao_id}
                  onChange={e => atualizarSlot(i, 'modalidade_sessao_id', e.target.value)}
                  className={`${selectClass} flex-1 min-w-[120px]`}
                >
                  <option value="">Modalidade...</option>
                  {modalidadesSessao.map(m => (
                    <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
                  ))}
                </select>
                <select
                  value={slot.meio_atendimento_id}
                  onChange={e => atualizarSlot(i, 'meio_atendimento_id', e.target.value)}
                  className={`${selectClass} flex-1 min-w-[100px]`}
                >
                  <option value="">Meio...</option>
                  {meiosAtendimento.map(m => (
                    <option key={m.id} value={m.id}>{m.emoji} {m.nome}</option>
                  ))}
                </select>

                <label className="flex items-center gap-1.5 text-sm text-[#1C1C1C] cursor-pointer whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={slot.is_pacote}
                    onChange={e => atualizarSlot(i, 'is_pacote', e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  É pacote
                </label>
              </div>
            </div>
          ))}

          {slots.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#1C1C1C] whitespace-nowrap">Gerar para as próximas</label>
              <input
                type="number"
                min="1"
                max="52"
                value={semanas}
                onChange={e => setSemanas(Math.max(1, Number(e.target.value)))}
                className={`${selectClass} w-20`}
              />
              <span className="text-sm text-[#1C1C1C]">semanas</span>
            </div>
          )}
        </div>

        {/* Cobrança */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Cobrança</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('tem_contrato')}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-[#1C1C1C]">Definir agora</span>
            </label>
          </div>

          {temContrato && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel>Tipo de cobrança</FieldLabel>
                <select {...register('contrato_tipo')} className={inputClass}>
                  <option value="">Selecionar...</option>
                  <option value="por_sessao">Por sessão</option>
                  <option value="pacote">Pacote de sessões</option>
                  <option value="mensal">Mensal</option>
                </select>
                <FieldError message={errors.contrato_tipo?.message} />
              </div>

              <div className="flex flex-col gap-1">
                <FieldLabel>Valor (R$)</FieldLabel>
                <input
                  {...register('contrato_valor')}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  className={inputClass}
                />
                <FieldError message={errors.contrato_valor?.message} />
              </div>

              {contratoTipo === 'pacote' && (
                <div className="flex flex-col gap-1">
                  <FieldLabel>Quantidade de sessões</FieldLabel>
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
                  <FieldLabel>Dia de vencimento</FieldLabel>
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

          {tipo === 'convenio' && !temContrato && (
            <p className="text-sm text-muted">
              Pacientes de convênio geralmente não precisam de contrato — o valor é definido pelo plano.
            </p>
          )}

          {!temContrato && tipo === 'particular' && (
            <p className="text-sm text-muted">Você pode definir a forma de cobrança depois no perfil do paciente.</p>
          )}
        </div>

        {serverError && (
          <p className="text-sm text-[#E07070] text-center">{serverError}</p>
        )}

        {/* Ações */}
        <div className="flex gap-3">
          <Link
            to="/pacientes"
            className="flex-1 h-10 flex items-center justify-center rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
