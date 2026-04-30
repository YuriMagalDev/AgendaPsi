import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from:      vi.fn(),
    functions: { invoke: vi.fn() },
    auth:      { getUser: vi.fn() },
  },
}))
import { supabase } from '@/lib/supabase'

function expectSyncInvoked(action: string, sessaoId: string) {
  expect(vi.mocked(supabase.functions.invoke)).toHaveBeenCalledWith(
    'google-calendar-sync',
    expect.objectContaining({
      body: expect.objectContaining({ action, sessao_id: sessaoId }),
    })
  )
}

describe('Google Calendar sync on session mutation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sync_create is called after session insert', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { ok: true }, error: null } as any)
    await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'sync_create', sessao_id: 's1' },
    })
    expectSyncInvoked('sync_create', 's1')
  })

  it('sync_update is called after session status change', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { ok: true }, error: null } as any)
    await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'sync_update', sessao_id: 's2' },
    })
    expectSyncInvoked('sync_update', 's2')
  })

  it('sync_delete is called after session delete', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { ok: true }, error: null } as any)
    await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'sync_delete', sessao_id: 's3' },
    })
    expectSyncInvoked('sync_delete', 's3')
  })
})
