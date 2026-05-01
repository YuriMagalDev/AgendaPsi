import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { RiscoTemplate } from '@/lib/types'

export function useRiscoTemplates() {
  const [templates, setTemplates] = useState<RiscoTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function refetch() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('risco_templates')
        .select('*')
        .eq('ativo', true)
        .order('nome')
      if (err) throw new Error(err.message)
      setTemplates((data ?? []) as RiscoTemplate[])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function create(nome: string, corpo: string): Promise<RiscoTemplate> {
    const { data, error: err } = await supabase
      .from('risco_templates')
      .insert({ nome, corpo })
      .select()
      .single()
    if (err) { setError(err.message); throw new Error(err.message) }
    await refetch()
    return data as RiscoTemplate
  }

  async function update(id: string, patch: Partial<Pick<RiscoTemplate, 'nome' | 'corpo' | 'ativo'>>): Promise<void> {
    const { error: err } = await supabase
      .from('risco_templates')
      .update(patch)
      .eq('id', id)
    if (err) { setError(err.message); throw new Error(err.message) }
    await refetch()
  }

  async function remove(id: string): Promise<void> {
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
