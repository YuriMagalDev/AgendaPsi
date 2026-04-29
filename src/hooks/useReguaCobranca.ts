import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  RegraCobranca,
  CobrancaEnviadaView,
  SessaoParaCobranca,
  EtapaCobranca,
} from '@/lib/types'

export function useReguaCobranca() {
  const [regras, setRegras]                           = useState<RegraCobranca[]>([])
  const [cobracasEnviadas, setCobracasEnviadas]       = useState<CobrancaEnviadaView[]>([])
  const [sessoesParaCobranca, setSessoesParaCobranca] = useState<SessaoParaCobranca[]>([])
  const [loading, setLoading]                         = useState(false)
  const [error, setError]                             = useState<string | null>(null)

  async function fetchRegras() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('regras_cobranca')
        .select('*')
        .order('etapa', { ascending: true })
      if (err) throw new Error(err.message)
      setRegras(data ?? [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchCobracasEnviadas(filters?: {
    sessao_id?: string
    status?: string
    dias?: number
  }) {
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('cobracas_enviadas')
        .select(`
          *,
          sessoes!inner(
            data_hora,
            valor_cobrado,
            pago,
            status,
            paciente_id,
            avulso_nome,
            pacientes(nome, telefone)
          )
        `)

      if (filters?.sessao_id) query = query.eq('sessao_id', filters.sessao_id)
      if (filters?.status)    query = query.eq('status', filters.status)
      if (filters?.dias) {
        const since = new Date(Date.now() - filters.dias * 86_400_000).toISOString()
        query = query.gte('data_agendado', since)
      }

      const { data, error: err } = await query.order('data_agendado', { ascending: false })
      if (err) throw new Error(err.message)
      setCobracasEnviadas((data ?? []) as CobrancaEnviadaView[])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function fetchSessoesParaCobranca() {
    setLoading(true)
    setError(null)
    try {
      const { data: sessoes, error: err } = await supabase
        .from('sessoes')
        .select(`
          id,
          data_hora,
          valor_cobrado,
          pago,
          status,
          paciente_id,
          avulso_nome,
          avulso_telefone,
          pacientes(nome, telefone),
          cobracas_enviadas!left(etapa, status)
        `)
        .in('status', ['concluida', 'faltou'])
        .eq('pago', false)
        .not('valor_cobrado', 'is', null)
        .order('data_hora', { ascending: false })

      if (err) throw new Error(err.message)

      const enriched: SessaoParaCobranca[] = (sessoes ?? []).map((s: any) => {
        const alreadySent: number[] = (s.cobracas_enviadas ?? [])
          .filter((c: any) => c.status !== 'cancelado')
          .map((c: any) => c.etapa)
        const etapas_pendentes = ([1, 2, 3] as EtapaCobranca[]).filter(
          (e) => !alreadySent.includes(e)
        )
        const { cobracas_enviadas: _drop, ...rest } = s
        return { ...rest, etapas_pendentes } as SessaoParaCobranca
      })

      setSessoesParaCobranca(enriched)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function salvarRegra(
    etapa: number,
    template: string,
    dias: number,
    ativo: boolean
  ): Promise<RegraCobranca> {
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error: err } = await supabase
      .from('regras_cobranca')
      .upsert(
        { etapa, template_mensagem: template, dias_apos: dias, ativo, user_id: user.id },
        { onConflict: 'user_id,etapa' }
      )
      .select()
      .single()

    if (err) { setError(err.message); throw new Error(err.message) }
    await fetchRegras()
    return data as RegraCobranca
  }

  async function deletarRegra(etapa: number): Promise<void> {
    setError(null)
    const { error: err } = await supabase
      .from('regras_cobranca')
      .delete()
      .eq('etapa', etapa)

    if (err) { setError(err.message); throw new Error(err.message) }
    await fetchRegras()
  }

  async function aprovarEEnviar(cobrancaId: string): Promise<void> {
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cobranca-whatsapp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ cobranca_id: cobrancaId }),
      }
    )
    const body = await resp.json()
    if (!resp.ok) {
      const msg = body.error ?? 'Falha ao enviar cobrança'
      setError(msg)
      throw new Error(msg)
    }
    await fetchCobracasEnviadas()
  }

  async function enfileirarEEnviar(sessaoId: string, etapa: EtapaCobranca): Promise<void> {
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token ?? ''

    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cobranca-whatsapp`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ sessao_id: sessaoId, etapa, enqueue: true }),
      }
    )
    const body = await resp.json()
    if (!resp.ok) {
      const msg = body.error ?? 'Falha ao enviar cobrança'
      setError(msg)
      throw new Error(msg)
    }
    await fetchSessoesParaCobranca()
    await fetchCobracasEnviadas()
  }

  async function cancelarCobranca(cobrancaId: string): Promise<void> {
    setError(null)
    const { error: err } = await supabase
      .from('cobracas_enviadas')
      .update({ status: 'cancelado' })
      .eq('id', cobrancaId)

    if (err) { setError(err.message); throw new Error(err.message) }
    await fetchCobracasEnviadas()
  }

  async function reenviarFalha(cobrancaId: string): Promise<void> {
    return aprovarEEnviar(cobrancaId)
  }

  return {
    regras,
    cobracasEnviadas,
    sessoesParaCobranca,
    loading,
    error,
    fetchRegras,
    fetchCobracasEnviadas,
    fetchSessoesParaCobranca,
    salvarRegra,
    deletarRegra,
    aprovarEEnviar,
    enfileirarEEnviar,
    cancelarCobranca,
    reenviarFalha,
  }
}
