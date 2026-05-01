import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useRiscoTemplates } from '../useRiscoTemplates'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mockFrom } }))

const makeChain = (resolved: { data: unknown; error: unknown }) => {
  const c: Record<string, unknown> = {}
  c.select = vi.fn().mockReturnValue(c)
  c.insert = vi.fn().mockReturnValue(c)
  c.update = vi.fn().mockReturnValue(c)
  c.delete = vi.fn().mockReturnValue(c)
  c.eq     = vi.fn().mockReturnValue(c)
  c.order  = vi.fn().mockResolvedValue(resolved)
  c.single = vi.fn().mockResolvedValue(resolved)
  return c
}

describe('useRiscoTemplates', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active templates ordered by nome', async () => {
    const data = [{ id: 't1', nome: 'Padrão', corpo: 'Olá {{nome}}', ativo: true }]
    mockFrom.mockReturnValue(makeChain({ data, error: null }))
    const { result } = renderHook(() => useRiscoTemplates())
    await act(async () => { await result.current.refetch() })
    expect(result.current.templates).toHaveLength(1)
    expect(result.current.templates[0].nome).toBe('Padrão')
  })

  it('create calls insert and refetches', async () => {
    const chain = makeChain({ data: { id: 't2', nome: 'Novo', corpo: 'Oi', ativo: true }, error: null })
    mockFrom.mockReturnValue(chain)
    const { result } = renderHook(() => useRiscoTemplates())
    await act(async () => { await result.current.create('Novo', 'Oi') })
    expect(chain.insert).toHaveBeenCalledWith({ nome: 'Novo', corpo: 'Oi' })
    expect(result.current.error).toBeNull()
  })

  it('sets error on fetch failure', async () => {
    mockFrom.mockReturnValue(makeChain({ data: null, error: { message: 'fail' } }))
    const { result } = renderHook(() => useRiscoTemplates())
    await act(async () => { await result.current.refetch() })
    expect(result.current.error).toMatch(/fail/)
  })
})
