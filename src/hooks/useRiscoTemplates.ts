import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { RiscoTemplate } from '@/lib/types'

export function useRiscoTemplates(options?: { soAtivos?: boolean }) {
  const soAtivos = options?.soAtivos ?? true
  const [templates, setTemplates] = useState<RiscoTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refetch() {
    setLoading(true)
    setError(null)
    let query = supabase.from('risco_templates').select('*')
    if (soAtivos) query = query.eq('ativo', true)
    const { data, error: err } = await query.order('nome')
    if (err) {
      setError(err.message)
    } else {
      setTemplates((data ?? []) as RiscoTemplate[])
    }
    setLoading(false)
  }

  async function create(nome: string, corpo: string): Promise<RiscoTemplate> {
    setError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Não autenticado')
    const { data, error: err } = await supabase
      .from('risco_templates')
      .insert({ nome, corpo, user_id: user.id })
      .select()
      .single()
    if (err) { setError(err.message); throw new Error(err.message) }
    await refetch()
    return data as RiscoTemplate
  }

  async function update(id: string, patch: Partial<Pick<RiscoTemplate, 'nome' | 'corpo' | 'ativo'>>): Promise<void> {
    setError(null)
    const { error: err } = await supabase
      .from('risco_templates')
      .update(patch)
      .eq('id', id)
    if (err) { setError(err.message); throw new Error(err.message) }
    await refetch()
  }

  async function remove(id: string): Promise<void> {
    setError(null)
    const { error: err } = await supabase
      .from('risco_templates')
      .delete()
      .eq('id', id)
    if (err) { setError(err.message); throw new Error(err.message) }
    await refetch()
  }

  useEffect(() => { refetch() }, [])

  return { templates, loading, error, refetch, create, update, remove }
}
