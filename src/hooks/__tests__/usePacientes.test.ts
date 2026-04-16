import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePacientes } from '../usePacientes'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

/** Helper: creates a mock of Supabase fluent-builder */
function buildChain(overrides: Record<string, any> = {}) {
  const base: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  return base
}

describe('usePacientes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches active patients ordered by name', async () => {
    const mockData = [
      { id: '1', nome: 'Ana Lima', telefone: null, email: null, data_nascimento: null, ativo: true, criado_em: '2024-01-01T00:00:00Z' },
    ]
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mockData, error: null }) })
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.pacientes).toEqual(mockData)
    expect(supabase.from).toHaveBeenCalledWith('pacientes')
  })

  it('sets error when fetch fails', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }) })
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('DB error')
    expect(result.current.pacientes).toEqual([])
  })

  it('createPaciente returns the new patient id', async () => {
    const newId = 'uuid-novo'
    let callCount = 0

    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        // Second call = patient insert
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: newId }, error: null }),
            }),
          }),
        } as any
      }
      // First (initial fetch) and third+ (post-creation refresh)
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    })

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returnedId = ''
    await act(async () => {
      returnedId = await result.current.createPaciente({ nome: 'João' })
    })

    expect(returnedId).toBe(newId)
  })

  it('createPaciente throws an exception when Supabase returns an error', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
            }),
          }),
        } as any
      }
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.createPaciente({ nome: 'Erro' }) })
    ).rejects.toBeDefined()
  })

  it('arquivarPaciente calls update in Supabase', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy }) as any
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.arquivarPaciente('p-123')
    })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'p-123')
  })
})
