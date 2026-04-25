import { useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Plus, Pencil, ArchiveX } from 'lucide-react'
import { usePacienteDetalhe } from '@/hooks/usePacienteDetalhe'
import { usePacientes } from '@/hooks/usePacientes'
import { useConvenios } from '@/hooks/useConvenios'
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
import { supabase } from '@/lib/supabase'
import { useSlotsSemanais } from '@/hooks/useSlotsSemanais'
import { useAllActiveSlots } from '@/hooks/useAllActiveSlots'
import { checkSlotConflict, addMinutesToTime } from '@/lib/conflictCheck'
import { gerarSessoesParaSlot } from '@/lib/sessaoUtils'
import type { SlotSemanal, SlotSemanalInput } from '@/lib/types'

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
  notas: z.string().optional(),
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
    defaultValues: { tipo: 'particular', tem_contrato: false, modalidade_sessao_id: '', meio_atendimento_id: '', notas: '' },
  })

  const tipo = watch('tipo')
  const temContrato = watch('tem_contrato')
  const contratoTipo = watch('contrato_tipo')

  const { slots, loading: slotsLoading, refetch: refetchSlots, updateSlot, deactivateSlot } = useSlotsSemanais(id!)
  const { slots: allActiveSlots } = useAllActiveSlots()
  const [editingSlot, setEditingSlot] = useState<SlotSemanal | null>(null)
  const [newSlot, setNewSlot] = useState<SlotSemanalInput | null>(null)
  const [salvandoSlot, setSalvandoSlot] = useState(false)
  const [slotErro, setSlotErro] = useState<string | null>(null)

  const DIAS_EDIT = [
    { value: 1, label: 'Segunda' }, { value: 2, label: 'Terça' }, { value: 3, label: 'Quarta' },
    { value: 4, label: 'Quinta' }, { value: 5, label: 'Sexta' }, { value: 6, label: 'Sábado' }, { value: 0, label: 'Domingo' },
  ]
  const DURACOES_EDIT = [30, 45, 50, 60, 90]

  const inputClassEdit = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
  const selectClassEdit = "h-9 px-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

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
      notas: paciente.notas ?? '',
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
        notas: data.notas || null,
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

  async function handleSaveEditingSlot() {
    if (!editingSlot) return
    const conflito = checkSlotConflict(editingSlot, allActiveSlots)
    if (conflito) return
    setSalvandoSlot(true)
    setSlotErro(null)
    try {
      await updateSlot(editingSlot)
      setEditingSlot(null)
    } catch {
      setSlotErro('Erro ao salvar horário. Tente novamente.')
    } finally {
      setSalvandoSlot(false)
    }
  }

  async function handleDeactivateSlot(slotId: string) {
    setSalvandoSlot(true)
    setSlotErro(null)
    try {
      await deactivateSlot(slotId)
    } catch {
      setSlotErro('Erro ao desativar horário.')
    } finally {
      setSalvandoSlot(false)
    }
  }

  async function handleAddSlot() {
    if (!newSlot || !paciente) return
    const conflito = checkSlotConflict(newSlot, allActiveSlots)
    if (conflito) return
    setSalvandoSlot(true)
    setSlotErro(null)
    try {
      const { error: slotErr } = await supabase
        .from('slots_semanais')
        .insert({
          paciente_id: id!,
          nome: newSlot.nome,
          dia_semana: newSlot.dia_semana,
          horario: newSlot.horario,
          duracao_minutos: newSlot.duracao_minutos,
          intervalo_semanas: newSlot.intervalo_semanas,
          is_pacote: newSlot.is_pacote,
          ativo: true,
        })
        .select('id')
        .single()
      if (slotErr) throw slotErr

      const sessoesBulk = gerarSessoesParaSlot(
        id!,
        paciente.modalidade_sessao_id ?? '',
        paciente.meio_atendimento_id ?? '',
        newSlot,
        8,
      )
      if (sessoesBulk.length > 0) {
        const { error: sessErr } = await supabase.from('sessoes').insert(sessoesBulk)
        if (sessErr) throw sessErr
      }

      setNewSlot(null)
      await refetchSlots()
    } catch {
      setSlotErro('Erro ao adicionar horário. Tente novamente.')
    } finally {
      setSalvandoSlot(false)
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

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Notas</label>
            <textarea
              {...register('notas')}
              placeholder="Informações adicionais sobre o paciente"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted resize-none"
            />
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

        {/* Horários semanais */}
        {!slotsLoading && (
          <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">Horários semanais</p>
              {!newSlot && (
                <button
                  type="button"
                  onClick={() => setNewSlot({ nome: '', dia_semana: 1, horario: '09:00', is_pacote: false, intervalo_semanas: 1, duracao_minutos: 50 })}
                  className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  <Plus size={14} />
                  Adicionar horário
                </button>
              )}
            </div>

            {slots.length === 0 && !newSlot && (
              <p className="text-sm text-muted">Nenhum horário recorrente cadastrado.</p>
            )}

            {slots.map(slot => {
              const isEditing = editingSlot?.id === slot.id
              const conflito = isEditing ? checkSlotConflict(editingSlot, allActiveSlots) : null
              return (
                <div key={slot.id} className="flex flex-col gap-2 pb-3 border-b border-border last:border-0 last:pb-0">
                  {isEditing ? (
                    <div className="flex flex-col gap-2">
                      <input
                        type="text"
                        placeholder="Nome do horário"
                        value={editingSlot.nome ?? ''}
                        onChange={e => setEditingSlot(p => p ? { ...p, nome: e.target.value } : null)}
                        className={inputClassEdit}
                      />
                      <div className="flex gap-2 flex-wrap">
                        <select value={editingSlot.dia_semana} onChange={e => setEditingSlot(p => p ? { ...p, dia_semana: Number(e.target.value) } : null)} className={selectClassEdit}>
                          {DIAS_EDIT.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                        <input type="time" value={editingSlot.horario} onChange={e => setEditingSlot(p => p ? { ...p, horario: e.target.value } : null)} className={`${selectClassEdit} w-28`} />
                        <select value={editingSlot.duracao_minutos} onChange={e => setEditingSlot(p => p ? { ...p, duracao_minutos: Number(e.target.value) } : null)} className={selectClassEdit}>
                          {DURACOES_EDIT.map(d => <option key={d} value={d}>{d} min</option>)}
                        </select>
                        <div className="flex items-center gap-1">
                          {[{ label: 'Semanal', value: 1 }, { label: 'Quinzenal', value: 2 }, { label: 'Mensal', value: 4 }].map(opt => (
                            <button key={opt.value} type="button"
                              onClick={() => setEditingSlot(p => p ? { ...p, intervalo_semanas: opt.value } : null)}
                              className={`text-xs px-2 py-1 rounded-lg border transition-colors ${editingSlot.intervalo_semanas === opt.value ? 'bg-primary text-white border-primary' : 'border-border text-[#1C1C1C] hover:border-primary'}`}
                            >{opt.label}</button>
                          ))}
                        </div>
                      </div>
                      {conflito && (
                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                          ⚠️ Conflito: outro paciente ocupa {DIAS_EDIT.find(d => d.value === conflito.dia_semana)?.label} {conflito.horario}–{addMinutesToTime(conflito.horario, conflito.duracao_minutos)}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditingSlot(null)}
                          className="flex-1 h-8 rounded-lg border border-border text-xs text-[#1C1C1C] hover:bg-bg transition-colors">
                          Cancelar
                        </button>
                        <button type="button" onClick={handleSaveEditingSlot}
                          disabled={!!conflito || salvandoSlot}
                          className="flex-1 h-8 bg-primary text-white text-xs rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                          {salvandoSlot ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-[#1C1C1C]">{slot.nome}</span>
                        <span className="text-xs text-muted">
                          {DIAS_EDIT.find(d => d.value === slot.dia_semana)?.label} {slot.horario} · {slot.duracao_minutos} min ·{' '}
                          {slot.intervalo_semanas === 1 ? 'Semanal' : slot.intervalo_semanas === 2 ? 'Quinzenal' : slot.intervalo_semanas === 4 ? 'Mensal' : `a cada ${slot.intervalo_semanas} sem.`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setEditingSlot({ ...slot })}
                          className="text-muted hover:text-[#1C1C1C] transition-colors" title="Editar horário">
                          <Pencil size={15} />
                        </button>
                        <button type="button" onClick={() => handleDeactivateSlot(slot.id)}
                          disabled={salvandoSlot}
                          className="text-muted hover:text-[#E07070] transition-colors disabled:opacity-40" title="Desativar horário">
                          <ArchiveX size={15} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* New slot form */}
            {newSlot && (
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide">Novo horário</p>
                <input
                  type="text"
                  placeholder="Nome do horário (ex: Sessão semanal)"
                  value={newSlot.nome}
                  onChange={e => setNewSlot(p => p ? { ...p, nome: e.target.value } : null)}
                  className={inputClassEdit}
                />
                <div className="flex gap-2 flex-wrap">
                  <select value={newSlot.dia_semana} onChange={e => setNewSlot(p => p ? { ...p, dia_semana: Number(e.target.value) } : null)} className={selectClassEdit}>
                    {DIAS_EDIT.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </select>
                  <input type="time" value={newSlot.horario} onChange={e => setNewSlot(p => p ? { ...p, horario: e.target.value } : null)} className={`${selectClassEdit} w-28`} />
                  <select value={newSlot.duracao_minutos} onChange={e => setNewSlot(p => p ? { ...p, duracao_minutos: Number(e.target.value) } : null)} className={selectClassEdit}>
                    {DURACOES_EDIT.map(d => <option key={d} value={d}>{d} min</option>)}
                  </select>
                </div>
                {checkSlotConflict(newSlot, allActiveSlots) && (
                  <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    ⚠️ Conflito: horário já ocupado por outro paciente.
                  </div>
                )}
                <div className="flex gap-2">
                  <button type="button" onClick={() => setNewSlot(null)}
                    className="flex-1 h-8 rounded-lg border border-border text-xs text-[#1C1C1C] hover:bg-bg transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleAddSlot}
                    disabled={!!checkSlotConflict(newSlot, allActiveSlots) || salvandoSlot || !newSlot.nome.trim()}
                    className="flex-1 h-8 bg-primary text-white text-xs rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {salvandoSlot ? 'Adicionando...' : 'Adicionar'}
                  </button>
                </div>
              </div>
            )}

            {slotErro && <p className="text-xs text-[#E07070] text-center">{slotErro}</p>}
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
