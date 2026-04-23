// src/hooks/useRepasses.ts
import { useState, useEffect } from 'react'
import { startOfMonth, format } from 'date-fns'
import { supabase } from '@/lib/supabase'

export interface RepasseItem {
  regra_id: string
  nome: string
  tipo_valor: 'percentual' | 'fixo'
  valorCalculado: number
  pago: boolean
  data_pagamento: string | null
}

export function useRepasses(mes: Date, totalRecebido: number) {
  const [itens, setItens] = useState<RepasseItem[]>([])
  const [loading, setLoading] = useState(true)
  const mesStr = format(startOfMonth(mes), 'yyyy-MM-dd')

  async function fetchRepasses() {
    setLoading(true)
    const [{ data: regras }, { data: repasses }] = await Promise.all([
      supabase.from('regras_repasse').select('*').eq('ativo', true).order('nome'),
      supabase.from('repasses_mensais').select('*').eq('mes', mesStr),
    ])

    const result: RepasseItem[] = (regras ?? []).map((r: any) => {
      const pago = repasses?.find((rp: any) => rp.regra_repasse_id === r.id)
      const valorCalculado = r.tipo_valor === 'percentual'
        ? Math.round((totalRecebido * r.valor) / 100 * 100) / 100
        : r.valor
      return {
        regra_id: r.id,
        nome: r.nome,
        tipo_valor: r.tipo_valor,
        valorCalculado,
        pago: pago?.pago ?? false,
        data_pagamento: pago?.data_pagamento ?? null,
      }
    })
    setItens(result)
    setLoading(false)
  }

  useEffect(() => { fetchRepasses() }, [mes.getFullYear(), mes.getMonth(), totalRecebido])

  async function marcarComoPago(regraId: string, valorCalculado: number) {
    await supabase.from('repasses_mensais').upsert({
      regra_repasse_id: regraId,
      mes: mesStr,
      valor_calculado: valorCalculado,
      pago: true,
      data_pagamento: format(new Date(), 'yyyy-MM-dd'),
    }, { onConflict: 'regra_repasse_id,mes' })
    await fetchRepasses()
  }

  const totalPago = itens.filter(i => i.pago).reduce((s, i) => s + i.valorCalculado, 0)
  const totalAPagar = itens.filter(i => !i.pago).reduce((s, i) => s + i.valorCalculado, 0)

  return { itens, loading, totalPago, totalAPagar, marcarComoPago }
}
