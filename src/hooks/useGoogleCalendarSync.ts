import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { GoogleCalendarSyncStatus } from '@/lib/types'

export function useGoogleCalendarSync() {
  const [status, setStatus]   = useState<GoogleCalendarSyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const popupPollRef          = useRef<ReturnType<typeof setInterval> | null>(null)

  async function fetchStatus() {
    setLoading(true)
    const { data, error: err } = await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'status' },
    })
    if (err) {
      setError(err.message)
    } else {
      setStatus(data as GoogleCalendarSyncStatus)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchStatus()
    return () => { if (popupPollRef.current) clearInterval(popupPollRef.current) }
  }, [])

  async function connect() {
    const { data, error: err } = await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'authorize_url' },
    })
    if (err || !data?.authUrl) {
      setError(err?.message ?? 'Falha ao obter URL de autorização')
      return
    }
    const popup = window.open(data.authUrl, 'google-auth', 'width=500,height=650,left=200,top=100')
    if (!popup) {
      window.location.href = data.authUrl
      return
    }
    // Poll for popup close — refetch regardless of success/error
    if (popupPollRef.current) clearInterval(popupPollRef.current)
    popupPollRef.current = setInterval(() => {
      if (popup.closed) {
        clearInterval(popupPollRef.current!)
        popupPollRef.current = null
        fetchStatus()
      }
    }, 500)
  }

  async function disconnect() {
    const { error: err } = await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'revoke' },
    })
    if (err) {
      setError(err.message)
      return
    }
    await fetchStatus()
  }

  async function updateSyncSettings(
    patch: Partial<{ sync_enabled: boolean; bidirectional_enabled: boolean }>
  ) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const dbPatch: Record<string, boolean> = {}
    if (patch.sync_enabled !== undefined)          dbPatch.google_calendar_sync_enabled = patch.sync_enabled
    if (patch.bidirectional_enabled !== undefined) dbPatch.google_calendar_bidirectional = patch.bidirectional_enabled

    const { error: err } = await supabase
      .from('config_psicologo')
      .update(dbPatch)

    if (err) {
      setError(err.message)
      return
    }

    if (patch.sync_enabled !== undefined || patch.bidirectional_enabled !== undefined) {
      const tokenPatch: Record<string, boolean> = {}
      if (patch.sync_enabled !== undefined)          tokenPatch.sync_enabled = patch.sync_enabled
      if (patch.bidirectional_enabled !== undefined) tokenPatch.bidirectional_enabled = patch.bidirectional_enabled
      const { error: tokenErr } = await supabase.from('google_oauth_tokens').update(tokenPatch).eq('user_id', user.id)
      if (tokenErr) {
        setError(tokenErr.message)
        return
      }
    }

    await fetchStatus()
  }

  async function syncNow() {
    // Push all unsynced sessions to Google first, then pull external events
    const { error: pushErr } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action: 'sync_all' },
    })
    if (pushErr) {
      setError(pushErr.message)
      return
    }
    await supabase.functions.invoke('google-calendar-bidirectional-sync', {})
    await fetchStatus()
  }

  return { status, loading, error, connect, disconnect, updateSyncSettings, syncNow, refetch: fetchStatus }
}
