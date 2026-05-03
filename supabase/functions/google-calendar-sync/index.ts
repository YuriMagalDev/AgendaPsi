// supabase/functions/google-calendar-sync/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

const STATUS_COLOR_MAP: Record<string, string> = {
  agendada:   '8',
  confirmada: '7',
  concluida:  '10',
  faltou:     '6',
  cancelada:  '11',
  remarcada:  '3',
}

function getUserIdFromJwt(authHeader: string | null): string | null {
  if (!authHeader) return null
  try {
    const token = authHeader.replace('Bearer ', '')
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.sub ?? null
  } catch {
    return null
  }
}

async function decryptToken(supabase: ReturnType<typeof createClient>, vaultId: string): Promise<string> {
  const { data, error } = await supabase.rpc('vault_read_secret', { secret_id: vaultId })
  if (error) throw new Error(`Vault decrypt error: ${error.message}`)
  return data as string
}

async function getValidAccessToken(supabase: ReturnType<typeof createClient>, userId: string): Promise<string> {
  const { data: tokenRow, error } = await supabase
    .from('google_oauth_tokens')
    .select('refresh_token_encrypted, access_token_expiry')
    .eq('user_id', userId)
    .single()

  if (error || !tokenRow) throw new Error('Token não encontrado')

  const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

  // NOTE: google_oauth_tokens only stores refresh_token_encrypted and access_token_expiry —
  // there is no cached access_token column, so we cannot skip the refresh call even when
  // access_token_expiry is in the future. For this single-user personal app, always refreshing
  // is acceptable. To optimise, add an `access_token_cached text` column to google_oauth_tokens,
  // store the access token here, and return it early when Date.now() < access_token_expiry - 60_000.
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

  await supabase
    .from('google_oauth_tokens')
    .update({ access_token_expiry: Date.now() + json.expires_in * 1000 })
    .eq('user_id', userId)

  return json.access_token
}

interface SessaoPayload {
  id: string
  data_hora: string
  duracao_minutos: number
  status: string
  notas_checklist: string | null
  avulso_nome: string | null
  pacientes: { nome: string } | null
  modalidades_sessao: { nome: string } | null
}

function buildGoogleEvent(sessao: SessaoPayload) {
  const start   = new Date(sessao.data_hora)
  const end     = new Date(start.getTime() + sessao.duracao_minutos * 60_000)
  const nome    = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
  const modNome = sessao.modalidades_sessao?.nome ?? ''
  const descLines = [modNome, sessao.notas_checklist].filter(Boolean).join('\n')

  return {
    summary: `Sessão com ${nome}`,
    description: descLines || undefined,
    start: { dateTime: start.toISOString(), timeZone: 'America/Sao_Paulo' },
    end:   { dateTime: end.toISOString(),   timeZone: 'America/Sao_Paulo' },
    colorId: STATUS_COLOR_MAP[sessao.status] ?? '8',
    transparency: 'opaque' as const,
  }
}

async function createGoogleEvent(accessToken: string, calendarId: string, sessao: SessaoPayload): Promise<string> {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGoogleEvent(sessao)),
    }
  )
  if (!resp.ok) throw new Error(`Criar evento Google falhou: ${await resp.text()}`)
  const json = await resp.json() as { id: string }
  return json.id
}

async function updateGoogleEvent(accessToken: string, calendarId: string, eventId: string, sessao: SessaoPayload): Promise<void> {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGoogleEvent(sessao)),
    }
  )
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Atualizar evento Google falhou: ${await resp.text()}`)
  }
}

async function deleteGoogleEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
    throw new Error(`Deletar evento Google falhou: status ${resp.status}`)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const callerUserId = getUserIdFromJwt(req.headers.get('Authorization'))

  const payload = await req.json() as {
    action: 'sync_create' | 'sync_update' | 'sync_delete' | 'sync_all'
    sessao_id?: string
    user_id?: string
  }

  const userId = payload.user_id ?? callerUserId
  if (!userId) {
    return new Response(JSON.stringify({ error: 'user_id obrigatório' }), { status: 400, headers: corsHeaders })
  }

  const { data: tokenRow } = await supabase
    .from('google_oauth_tokens')
    .select('sync_enabled, calendario_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!tokenRow || !tokenRow.sync_enabled) {
    console.log(`[google-calendar-sync] user=${userId} skipped — sync disabled or not connected`)
    return new Response(JSON.stringify({ skipped: 'sync desativado' }), { headers: corsHeaders })
  }

  const calendarId = tokenRow.calendario_id ?? 'primary'

  try {
    const accessToken = await getValidAccessToken(supabase, userId)

    if (payload.action === 'sync_create') {
      const { data: sessao, error: sessaoErr } = await supabase
        .from('sessoes')
        .select('id, data_hora, duracao_minutos, status, notas_checklist, avulso_nome, pacientes(nome), modalidades_sessao(nome)')
        .eq('id', payload.sessao_id)
        .single()

      if (sessaoErr || !sessao) {
        return new Response(JSON.stringify({ error: 'Sessão não encontrada' }), { status: 404, headers: corsHeaders })
      }

      const googleEventId = await createGoogleEvent(accessToken, calendarId, sessao as SessaoPayload)

      await supabase.from('sessions_sync_map').upsert({
        user_id: userId,
        sessao_id: payload.sessao_id,
        google_event_id: googleEventId,
        status_ultima_sync: sessao.status,
      }, { onConflict: 'user_id,sessao_id' })

      await supabase
        .from('sessoes')
        .update({ google_calendar_event_id: googleEventId, google_calendar_synced_at: new Date().toISOString() })
        .eq('id', payload.sessao_id)

      console.log(`[google-calendar-sync] sync_create sessao=${payload.sessao_id} event=${googleEventId}`)
      return new Response(JSON.stringify({ ok: true, google_event_id: googleEventId }), { headers: corsHeaders })
    }

    if (payload.action === 'sync_update') {
      const { data: mapRow } = await supabase
        .from('sessions_sync_map')
        .select('google_event_id')
        .eq('sessao_id', payload.sessao_id)
        .maybeSingle()

      if (!mapRow) {
        // No map row yet — treat as create
        const { data: sessao } = await supabase
          .from('sessoes')
          .select('id, data_hora, duracao_minutos, status, notas_checklist, avulso_nome, pacientes(nome), modalidades_sessao(nome)')
          .eq('id', payload.sessao_id)
          .single()

        if (sessao) {
          const googleEventId = await createGoogleEvent(accessToken, calendarId, sessao as SessaoPayload)
          await supabase.from('sessions_sync_map').upsert({
            user_id: userId, sessao_id: payload.sessao_id, google_event_id: googleEventId, status_ultima_sync: sessao.status,
          }, { onConflict: 'user_id,sessao_id' })
          await supabase.from('sessoes').update({ google_calendar_event_id: googleEventId, google_calendar_synced_at: new Date().toISOString() }).eq('id', payload.sessao_id)
        }
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
      }

      const { data: sessao, error: sessaoErr } = await supabase
        .from('sessoes')
        .select('id, data_hora, duracao_minutos, status, notas_checklist, avulso_nome, pacientes(nome), modalidades_sessao(nome)')
        .eq('id', payload.sessao_id)
        .single()

      if (sessaoErr || !sessao) {
        return new Response(JSON.stringify({ error: 'Sessão não encontrada' }), { status: 404, headers: corsHeaders })
      }

      await updateGoogleEvent(accessToken, calendarId, mapRow.google_event_id, sessao as SessaoPayload)
      await supabase.from('sessions_sync_map').update({ status_ultima_sync: sessao.status, sincronizado_em: new Date().toISOString() }).eq('sessao_id', payload.sessao_id)
      await supabase.from('sessoes').update({ google_calendar_synced_at: new Date().toISOString() }).eq('id', payload.sessao_id)

      console.log(`[google-calendar-sync] sync_update sessao=${payload.sessao_id}`)
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
    }

    if (payload.action === 'sync_all') {
      // Bulk push all sessions without a sync map row (never pushed to Google)
      const { data: sessions } = await supabase
        .from('sessoes')
        .select('id, data_hora, duracao_minutos, status, notas_checklist, avulso_nome, pacientes(nome), modalidades_sessao(nome)')
        .not('status', 'in', '(cancelada)')
        .gte('data_hora', new Date(Date.now() - 90 * 24 * 3600_000).toISOString()) // last 90 days + future

      if (!sessions || sessions.length === 0) {
        return new Response(JSON.stringify({ ok: true, synced: 0 }), { headers: corsHeaders })
      }

      // Get already-synced session IDs
      const { data: syncedRows } = await supabase
        .from('sessions_sync_map')
        .select('sessao_id')
        .eq('user_id', userId)

      const syncedIds = new Set((syncedRows ?? []).map((r: { sessao_id: string }) => r.sessao_id))
      const unsynced = sessions.filter((s: { id: string }) => !syncedIds.has(s.id))

      let count = 0
      for (const sessao of unsynced) {
        try {
          const googleEventId = await createGoogleEvent(accessToken, calendarId, sessao as SessaoPayload)
          await supabase.from('sessions_sync_map').upsert({
            user_id: userId,
            sessao_id: sessao.id,
            google_event_id: googleEventId,
            status_ultima_sync: (sessao as SessaoPayload).status,
          }, { onConflict: 'user_id,sessao_id' })
          await supabase.from('sessoes').update({
            google_calendar_event_id: googleEventId,
            google_calendar_synced_at: new Date().toISOString(),
          }).eq('id', sessao.id)
          count++
        } catch (e) {
          console.warn(`[google-calendar-sync] sync_all skip sessao=${sessao.id}: ${e}`)
        }
      }

      await supabase.from('google_oauth_tokens').update({ ultimo_sync_em: new Date().toISOString() }).eq('user_id', userId)
      console.log(`[google-calendar-sync] sync_all user=${userId} pushed=${count} of ${unsynced.length}`)
      return new Response(JSON.stringify({ ok: true, synced: count }), { headers: corsHeaders })
    }

    if (payload.action === 'sync_delete') {
      const { data: mapRow } = await supabase
        .from('sessions_sync_map')
        .select('google_event_id')
        .eq('sessao_id', payload.sessao_id)
        .maybeSingle()

      if (mapRow) {
        await deleteGoogleEvent(accessToken, calendarId, mapRow.google_event_id)
        await supabase.from('sessions_sync_map').delete().eq('sessao_id', payload.sessao_id)
      }

      console.log(`[google-calendar-sync] sync_delete sessao=${payload.sessao_id}`)
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), { status: 400, headers: corsHeaders })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[google-calendar-sync] error: ${msg}`)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders })
  }
})
