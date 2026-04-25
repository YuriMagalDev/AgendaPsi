import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { SlotSemanal } from '@/lib/types'

export function useSlotsSemanais(pacienteId: string) {
  const [slots, setSlots] = useState<SlotSemanal[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSlots = useCallback(async () => {
    const { data } = await supabase
      .from('slots_semanais')
      .select('*')
      .eq('paciente_id', pacienteId)
      .eq('ativo', true)
      .order('dia_semana')
    setSlots((data ?? []) as SlotSemanal[])
    setLoading(false)
  }, [pacienteId])

  useEffect(() => {
    fetchSlots()
  }, [fetchSlots])

  async function updateSlot(slot: SlotSemanal): Promise<void> {
    const { error } = await supabase
      .from('slots_semanais')
      .update({
        nome: slot.nome,
        dia_semana: slot.dia_semana,
        horario: slot.horario,
        duracao_minutos: slot.duracao_minutos,
        intervalo_semanas: slot.intervalo_semanas,
        is_pacote: slot.is_pacote,
      })
      .eq('id', slot.id)
    if (error) throw error
    await fetchSlots()
  }

  async function deactivateSlot(id: string): Promise<void> {
    const { error } = await supabase
      .from('slots_semanais')
      .update({ ativo: false })
      .eq('id', id)
    if (error) throw error
    await fetchSlots()
  }

  return { slots, loading, refetch: fetchSlots, updateSlot, deactivateSlot }
}
