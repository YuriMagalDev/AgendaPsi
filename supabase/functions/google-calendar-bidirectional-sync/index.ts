// supabase/functions/google-calendar-bidirectional-sync/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

function getUserIdFromJwt(authHeader: string | null): string | null {
  if (!authHeader) return null
  try {
    const token = authHeader.replace('Bearer ', '')
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.sub ?? null
  } catch { return null }
}

async function decryptToken(supabase: ReturnType<typeof createClient>, vaultId: string): Promise<string> {
  const { data, error } = await supabase.rpc('vault.decrypted_secret', { secret_id: vaultId })
  if (error) throw new Error(`Vault decrypt error: ${error.message}`)
  return data as string
}

async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  tokenRow: { refresh_token_encrypted: string; access_token_expiry: number },
  userId: string
): Promise<string> {
  const refreshToken = await decryptToken(supabase, tokenRow.refresh_token_encrypted)
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }).toString(),
  })
  if (!resp.ok) throw new Error(`Token refresh failed: ${await resp.text()}`)
  const json = await resp.json() as { access_token: string; expires_in: number }
  await supabase.from('google_oauth_tokens').update({ access_token_expiry: Date.now() + json.expires_in * 1000 }).eq('user_id', userId)
  return json.access_token
}

interface GoogleEvent {
  id: string
  summary?: string
  start: { dateTime?: string; date?: string }
  end:   { dateTime?: string; date?: string }
  description?: string
  updated?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let userId: string | null = null
  if (req.method === 'POST') {
    const body = await req.json().catch(() => ({})) as { user_id?: string }
    userId = body.user_id ?? getUserIdFromJwt(req.headers.get('Authorization'))
  } else {
    userId = getUserIdFromJwt(req.headers.get('Authorization'))
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: 'user_id obrigatório' }), { status: 400, headers: corsHeaders })
  }

  const { data: tokenRow, error: tokenErr } = await supabase
    .from('google_oauth_tokens')
    .select('refresh_token_encrypted, access_token_expiry, calendario_id, bidirectional_enabled')
    .eq('user_id', userId)
    .single()

  if (tokenErr || !tokenRow) {
    return new Response(JSON.stringify({ skipped: 'sem conexão Google' }), { headers: corsHeaders })
  }

  if (!tokenRow.bidirectional_enabled) {
    return new Response(JSON.stringify({ skipped: 'sincronização bidirecional desativada' }), { headers: corsHeaders })
  }

  try {
    const accessToken = await getValidAccessToken(supabase, tokenRow, userId)
    const calendarId  = tokenRow.calendario_id ?? 'primary'

    const timeMin = new Date().toISOString()
    const timeMax = new Date(Date.now() + 30 * 24 * 3600_000).toISOString()

    const googleResp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
      `?timeMin=${encodeURIComponent(timeMin)}` +
      `&timeMax=${encodeURIComponent(timeMax)}` +
      `&maxResults=250` +
      `&singleEvents=true` +
      `&fields=items(id,summary,start,end,description,updated)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    if (!googleResp.ok) {
      throw new Error(`Google Calendar list failed: ${await googleResp.text()}`)
    }

    const { items } = await googleResp.json() as { items: GoogleEvent[] }

    const { data: syncMapRows } = await supabase
      .from('sessions_sync_map')
      .select('google_event_id')
      .eq('user_id', userId)

    const agendaPsiEventIds = new Set((syncMapRows ?? []).map((r: { google_event_id: string }) => r.google_event_id))

    const externalEvents = items.filter(e => !agendaPsiEventIds.has(e.id) && !!e.start.dateTime)

    for (const event of externalEvents) {
      await supabase.from('sessions_external_busy').upsert({
        user_id: userId,
        google_event_id: event.id,
        titulo: event.summary ?? 'Sem título',
        data_hora_inicio: event.start.dateTime!,
        data_hora_fim: event.end.dateTime!,
        descricao: event.description ?? null,
        atualizacao_em: event.updated ?? new Date().toISOString(),
      }, { onConflict: 'user_id,google_event_id' })
    }

    const currentExternalIds = new Set(externalEvents.map(e => e.id))
    const { data: oldExternal } = await supabase
      .from('sessions_external_busy')
      .select('google_event_id')
      .eq('user_id', userId)

    const toDelete = (oldExternal ?? []).filter((r: { google_event_id: string }) => !currentExternalIds.has(r.google_event_id))
    if (toDelete.length > 0) {
      await supabase
        .from('sessions_external_busy')
        .delete()
        .in('google_event_id', toDelete.map((r: { google_event_id: string }) => r.google_event_id))
        .eq('user_id', userId)
    }

    await supabase.from('google_oauth_tokens').update({ ultimo_sync_em: new Date().toISOString() }).eq('user_id', userId)

    console.log(`[google-calendar-bidirectional-sync] user=${userId} synced=${externalEvents.length} deleted=${toDelete.length}`)
    return new Response(JSON.stringify({ ok: true, synced: externalEvents.length, deleted: toDelete.length }), { headers: corsHeaders })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[google-calendar-bidirectional-sync] error: ${msg}`)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders })
  }
})
