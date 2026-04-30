import { supabase } from './supabase'

type SyncAction = 'sync_create' | 'sync_update' | 'sync_delete'

export async function triggerGoogleCalendarSync(
  action: SyncAction,
  sessaoId: string
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('google-calendar-sync', {
      body: { action, sessao_id: sessaoId },
    })
    if (error) {
      console.warn(`[googleCalendarSync] ${action} sessao=${sessaoId} error: ${error.message}`)
    }
  } catch (e) {
    // Never block UI on sync failure
    console.warn(`[googleCalendarSync] ${action} sessao=${sessaoId} exception: ${e}`)
  }
}
