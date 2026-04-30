// supabase/functions/google-calendar-auth/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const GOOGLE_REDIRECT_URI  = Deno.env.get('GOOGLE_REDIRECT_URI')!
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL              = Deno.env.get('APP_URL') ?? 'http://localhost:5173'

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
  } catch {
    return null
  }
}

async function encryptToken(supabase: ReturnType<typeof createClient>, plaintext: string): Promise<string> {
  const { data, error } = await supabase.rpc('vault.create_secret', {
    new_secret: plaintext,
    new_name: `google_refresh_${crypto.randomUUID()}`,
  })
  if (error) throw new Error(`Vault encrypt error: ${error.message}`)
  return data as string
}

async function decryptToken(supabase: ReturnType<typeof createClient>, vaultId: string): Promise<string> {
  const { data, error } = await supabase.rpc('vault.decrypted_secret', { secret_id: vaultId })
  if (error) throw new Error(`Vault decrypt error: ${error.message}`)
  return data as string
}

async function fetchCalendarName(accessToken: string): Promise<string | null> {
  try {
    const resp = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) return null
    const json = await resp.json() as { summary?: string }
    return json.summary ?? null
  } catch {
    return null
  }
}

function generateICalToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  let action: string | undefined

  if (req.method === 'GET') {
    action = url.searchParams.get('action') ?? undefined
  } else {
    try {
      const body = await req.json()
      action = body.action
    } catch {
      action = url.searchParams.get('action') ?? undefined
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── ACTION: authorize_url ──────────────────────────────────────────────────
  if (action === 'authorize_url') {
    const userId = getUserIdFromJwt(req.headers.get('Authorization'))
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: corsHeaders })
    }

    const nonce    = crypto.randomUUID()
    const stateRaw = `${userId}:${nonce}`
    const state    = btoa(stateRaw)

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar.events')}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}` +
      `&access_type=offline` +
      `&prompt=consent`

    return new Response(JSON.stringify({ authUrl }), { headers: corsHeaders })
  }

  // ── ACTION: callback ───────────────────────────────────────────────────────
  if (action === 'callback') {
    const code  = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error || !code) {
      return Response.redirect(`${APP_URL}/configuracoes?google_error=cancelado`)
    }

    const state = url.searchParams.get('state') ?? ''
    let userId: string
    try {
      const decoded = atob(state)
      userId = decoded.split(':')[0]
    } catch {
      return Response.redirect(`${APP_URL}/configuracoes?google_error=estado_invalido`)
    }

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      }).toString(),
    })

    if (!tokenResp.ok) {
      const errBody = await tokenResp.text()
      console.error(`[google-calendar-auth] token exchange failed: ${errBody}`)
      return Response.redirect(`${APP_URL}/configuracoes?google_error=troca_falhou`)
    }

    const tokens = await tokenResp.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      id_token?: string
    }

    if (!tokens.refresh_token) {
      console.error('[google-calendar-auth] no refresh_token received')
      return Response.redirect(`${APP_URL}/configuracoes?google_error=sem_refresh_token`)
    }

    let googleUserId = 'unknown'
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(atob(tokens.id_token.split('.')[1]))
        googleUserId = payload.sub ?? 'unknown'
      } catch { /* ignore */ }
    }

    const vaultId = await encryptToken(supabase, tokens.refresh_token)
    const calendarioNome = await fetchCalendarName(tokens.access_token)
    const icalToken = generateICalToken()

    const { error: upsertErr } = await supabase
      .from('google_oauth_tokens')
      .upsert({
        user_id: userId,
        google_user_id: googleUserId,
        refresh_token_encrypted: vaultId,
        access_token_expiry: Date.now() + tokens.expires_in * 1000,
        calendario_id: 'primary',
        sync_enabled: true,
        bidirectional_enabled: false,
        calendario_nome: calendarioNome,
      }, { onConflict: 'user_id,google_user_id' })

    if (upsertErr) {
      console.error(`[google-calendar-auth] upsert error: ${upsertErr.message}`)
      return Response.redirect(`${APP_URL}/configuracoes?google_error=db_error`)
    }

    await supabase
      .from('config_psicologo')
      .update({ google_calendar_sync_enabled: true, ical_token: icalToken })
      .eq('user_id', userId)

    console.log(`[google-calendar-auth] user=${userId} connected google_user=${googleUserId}`)
    return Response.redirect(`${APP_URL}/configuracoes?google_success=1`)
  }

  // ── ACTION: revoke ─────────────────────────────────────────────────────────
  if (action === 'revoke') {
    const userId = getUserIdFromJwt(req.headers.get('Authorization'))
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: corsHeaders })
    }

    const { data: tokenRow } = await supabase
      .from('google_oauth_tokens')
      .select('refresh_token_encrypted')
      .eq('user_id', userId)
      .single()

    if (tokenRow) {
      try {
        const refreshToken = await decryptToken(supabase, tokenRow.refresh_token_encrypted)
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, {
          method: 'POST',
        })
        await supabase.rpc('vault.delete_secret', { secret_id: tokenRow.refresh_token_encrypted })
      } catch (e) {
        console.warn(`[google-calendar-auth] revoke at Google failed: ${e}`)
      }
    }

    await supabase.from('google_oauth_tokens').delete().eq('user_id', userId)
    await supabase
      .from('config_psicologo')
      .update({ google_calendar_sync_enabled: false, google_calendar_bidirectional: false })
      .eq('user_id', userId)

    console.log(`[google-calendar-auth] user=${userId} disconnected`)
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
  }

  // ── ACTION: status ─────────────────────────────────────────────────────────
  if (action === 'status') {
    const userId = getUserIdFromJwt(req.headers.get('Authorization'))
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: corsHeaders })
    }

    const { data: tokenRow } = await supabase
      .from('google_oauth_tokens')
      .select('google_user_id, sync_enabled, bidirectional_enabled, calendario_nome, ultimo_sync_em')
      .eq('user_id', userId)
      .maybeSingle()

    const status = {
      connected: !!tokenRow,
      sync_enabled: tokenRow?.sync_enabled ?? false,
      bidirectional_enabled: tokenRow?.bidirectional_enabled ?? false,
      calendario_nome: tokenRow?.calendario_nome ?? null,
      google_user_id: tokenRow?.google_user_id ?? null,
      ultimo_sync_em: tokenRow?.ultimo_sync_em ?? null,
    }

    return new Response(JSON.stringify(status), { headers: corsHeaders })
  }

  return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), { status: 400, headers: corsHeaders })
})
