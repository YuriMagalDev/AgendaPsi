import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useGoogleCalendarSync } from '../useGoogleCalendarSync'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    functions: { invoke: vi.fn() },
    from: vi.fn(),
    auth: { getUser: vi.fn() },
  },
}))
import { supabase } from '@/lib/supabase'

const disconnectedStatus = {
  connected: false,
  sync_enabled: false,
  bidirectional_enabled: false,
  calendario_nome: null,
  google_user_id: null,
  ultimo_sync_em: null,
}

const connectedStatus = {
  connected: true,
  sync_enabled: true,
  bidirectional_enabled: false,
  calendario_nome: 'Minha Agenda',
  google_user_id: 'google-123',
  ultimo_sync_em: '2026-04-29T10:00:00Z',
}

describe('useGoogleCalendarSync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('fetches sync status on mount', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: disconnectedStatus,
      error: null,
    } as any)

    const { result } = renderHook(() => useGoogleCalendarSync())

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.status).toEqual(disconnectedStatus)
    expect(result.current.status?.connected).toBe(false)
  })

  it('status is null while loading', () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: disconnectedStatus,
      error: null,
    } as any)
    const { result } = renderHook(() => useGoogleCalendarSync())
    expect(result.current.status).toBeNull()
  })

  it('connect calls authorize_url and redirects', async () => {
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: disconnectedStatus, error: null } as any) // initial status
      .mockResolvedValueOnce({ data: { authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...' }, error: null } as any)

    const originalLocation = window.location
    Object.defineProperty(window, 'location', { value: { href: '' }, writable: true })

    const { result } = renderHook(() => useGoogleCalendarSync())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.connect() })

    expect(window.location.href).toBe('https://accounts.google.com/o/oauth2/v2/auth?...')
    Object.defineProperty(window, 'location', { value: originalLocation })
  })

  it('disconnect calls revoke and refreshes status', async () => {
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: connectedStatus,    error: null } as any) // initial status
      .mockResolvedValueOnce({ data: { ok: true },       error: null } as any) // revoke
      .mockResolvedValueOnce({ data: disconnectedStatus, error: null } as any) // re-fetch status

    const { result } = renderHook(() => useGoogleCalendarSync())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.disconnect() })

    expect(result.current.status?.connected).toBe(false)
    expect(vi.mocked(supabase.functions.invoke)).toHaveBeenCalledWith(
      'google-calendar-auth',
      expect.objectContaining({ body: { action: 'revoke' } })
    )
  })

  it('updateSyncSettings calls supabase.from and refreshes status', async () => {
    const mockUpdate = vi.fn().mockReturnThis()
    const mockEq     = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate, eq: mockEq } as any)
    mockUpdate.mockReturnValue({ eq: mockEq })

    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: connectedStatus, error: null } as any)
      .mockResolvedValueOnce({ data: { ...connectedStatus, sync_enabled: false }, error: null } as any)

    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-1' } }, error: null,
    } as any)

    const { result } = renderHook(() => useGoogleCalendarSync())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.updateSyncSettings({ sync_enabled: false }) })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ google_calendar_sync_enabled: false })
    )
  })

  it('syncNow calls google-calendar-bidirectional-sync and refreshes status', async () => {
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: connectedStatus,           error: null } as any) // mount
      .mockResolvedValueOnce({ data: { ok: true, synced: 3 }, error: null } as any)  // syncNow
      .mockResolvedValueOnce({ data: connectedStatus,           error: null } as any) // fetchStatus after sync

    const { result } = renderHook(() => useGoogleCalendarSync())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.syncNow() })

    expect(vi.mocked(supabase.functions.invoke)).toHaveBeenCalledWith('google-calendar-bidirectional-sync', {})
    expect(vi.mocked(supabase.functions.invoke)).toHaveBeenCalledTimes(3)
  })
})
