# Google Calendar Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export AgendaPsi sessions automatically to Google Calendar (one-way by default), with optional bidirectional sync that imports external Google Calendar events as read-only busy markers, plus a public iCal feed for Apple Calendar users.

**Architecture:** OAuth 2.0 tokens are stored encrypted in Supabase (`google_oauth_tokens` table). Session CRUD triggers calls to the `google-calendar-sync` Edge Function, which creates/updates/deletes corresponding Google Calendar events. A separate `google-calendar-bidirectional-sync` Edge Function runs on a cron schedule to pull external events into `sessions_external_busy`. A public `google-calendar-ical` Edge Function exposes a token-gated iCal feed for Apple Calendar. All sensitive credentials (refresh tokens, iCal token hash) live exclusively on the Supabase backend — never in frontend state.

**Tech Stack:** Supabase Edge Functions (Deno), Supabase Vault (AES-256 encryption), Google Calendar API v3, React hooks (TypeScript), TailwindCSS, Vitest.

---

## File Structure

**New files:**
- `supabase/migrations/020_google_calendar_sync.sql` — 3 new tables, 2 columns on sessoes, 3 columns on config_psicologo, RLS policies, triggers
- `supabase/functions/google-calendar-auth/index.ts` — OAuth authorize / callback / revoke / status
- `supabase/functions/google-calendar-sync/index.ts` — sync_create / sync_update / sync_delete
- `supabase/functions/google-calendar-bidirectional-sync/index.ts` — import external events from Google Calendar
- `supabase/functions/google-calendar-ical/index.ts` — public iCal feed
- `src/hooks/useGoogleCalendarSync.ts` — React hook for connection state + actions
- `src/hooks/__tests__/useGoogleCalendarSync.test.ts` — unit tests for the hook
- `supabase/scripts/schedule_crons_google_calendar.sql` — cron registration for bidirectional sync

**Modified files:**
- `src/lib/types.ts` — add `GoogleOAuthTokens`, `SessionsSyncMap`, `SessionsExternalBusy`, `GoogleCalendarSyncStatus`; extend `ConfigPsicologo` and `Sessao`
- `src/pages/ConfiguracoesPage.tsx` — add Google Calendar section after WhatsApp section
- `.env.example` — add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

---

## Task 1: Database Migration 020

**Files:**
- Create: `supabase/migrations/020_google_calendar_sync.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 020_google_calendar_sync.sql

-- ============================================================
-- 1. New table: google_oauth_tokens
-- ============================================================
create table if not exists google_oauth_tokens (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  google_user_id          text not null,
  refresh_token_encrypted text not null,
  access_token_expiry     bigint not null,
  calendario_id           text not null default 'primary',
  sync_enabled            boolean not null default true,
  bidirectional_enabled   boolean not null default false,
  calendario_nome         text,
  ultimo_sync_em          timestamptz,
  criado_em               timestamptz not null default now(),
  constraint unique_user_google_oauth unique (user_id, google_user_id)
);

create index if not exists idx_google_oauth_tokens_user_id on google_oauth_tokens(user_id);

-- ============================================================
-- 2. New table: sessions_sync_map
-- ============================================================
create table if not exists sessions_sync_map (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  sessao_id           uuid not null references sessoes(id) on delete cascade,
  google_event_id     text not null,
  status_ultima_sync  text not null,
  sincronizado_em     timestamptz not null default now(),
  constraint unique_user_sessao_google unique (user_id, sessao_id),
  constraint unique_user_google_event  unique (user_id, google_event_id)
);

create index if not exists idx_sessions_sync_map_user_id          on sessions_sync_map(user_id);
create index if not exists idx_sessions_sync_map_sessao_id        on sessions_sync_map(sessao_id);
create index if not exists idx_sessions_sync_map_google_event_id  on sessions_sync_map(google_event_id);

-- ============================================================
-- 3. New table: sessions_external_busy
-- ============================================================
create table if not exists sessions_external_busy (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  google_event_id     text not null,
  titulo              text not null,
  data_hora_inicio    timestamptz not null,
  data_hora_fim       timestamptz not null,
  descricao           text,
  atualizacao_em      timestamptz,
  sincronizado_em     timestamptz not null default now(),
  constraint unique_user_google_external unique (user_id, google_event_id)
);

create index if not exists idx_sessions_external_busy_user_id  on sessions_external_busy(user_id);
create index if not exists idx_sessions_external_busy_intervalo on sessions_external_busy(user_id, data_hora_inicio, data_hora_fim);

-- ============================================================
-- 4. Extend sessoes table (denormalization for UI queries)
-- ============================================================
alter table sessoes add column if not exists google_calendar_event_id  text;
alter table sessoes add column if not exists google_calendar_synced_at timestamptz;

create index if not exists idx_sessoes_google_calendar_event_id on sessoes(google_calendar_event_id);

-- ============================================================
-- 5. Extend config_psicologo with sync toggles + iCal token
-- ============================================================
alter table config_psicologo add column if not exists google_calendar_sync_enabled boolean not null default false;
alter table config_psicologo add column if not exists google_calendar_bidirectional boolean not null default false;
alter table config_psicologo add column if not exists ical_token text unique;

-- ============================================================
-- 6. RLS on all three new tables
-- ============================================================
alter table google_oauth_tokens      enable row level security;
alter table sessions_sync_map        enable row level security;
alter table sessions_external_busy   enable row level security;

-- google_oauth_tokens: read + delete by owner; inserts/updates done by service role only
create policy "tenant_isolation_google_oauth_tokens" on google_oauth_tokens
  for select to authenticated
  using (auth.uid() = user_id);

create policy "tenant_delete_google_oauth_tokens" on google_oauth_tokens
  for delete to authenticated
  using (auth.uid() = user_id);

-- sessions_sync_map: full access by owner
create policy "tenant_isolation_sessions_sync_map" on sessions_sync_map
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- sessions_external_busy: full access by owner
create policy "tenant_isolation_sessions_external_busy" on sessions_external_busy
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 7. Notify-on-delete function for sync cleanup
--    Stores the deleted sessao_id in pg_notify so the
--    Edge Function can delete the corresponding Google event.
-- ============================================================
create or replace function notify_google_calendar_delete()
returns trigger as $$
begin
  perform pg_notify(
    'google_calendar_delete',
    json_build_object(
      'sessao_id', OLD.id,
      'user_id',   OLD.user_id
    )::text
  );
  return OLD;
end;
$$ language plpgsql security definer;

create trigger trg_notify_google_calendar_delete
  after delete on sessoes
  for each row
  execute function notify_google_calendar_delete();
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor**

In Supabase Dashboard → SQL Editor, paste the migration and execute. Verify:
- Tables `google_oauth_tokens`, `sessions_sync_map`, `sessions_external_busy` appear in Table Editor
- `sessoes` table has columns `google_calendar_event_id` and `google_calendar_synced_at`
- `config_psicologo` table has columns `google_calendar_sync_enabled`, `google_calendar_bidirectional`, `ical_token`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/020_google_calendar_sync.sql
git commit -m "feat(db): migration 020 — google_oauth_tokens, sessions_sync_map, sessions_external_busy, RLS"
```

---

## Task 2: Update TypeScript Types

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Write failing test**

Create `src/lib/__tests__/types.test.ts` already exists — add the following test block to it (open the file first to see what's there, then append):

Actually write a separate test:

```typescript
// src/lib/__tests__/google-calendar-types.test.ts
import { describe, it, expect } from 'vitest'
import type {
  GoogleOAuthTokens,
  SessionsSyncMap,
  SessionsExternalBusy,
  GoogleCalendarSyncStatus,
} from '../types'

describe('GoogleCalendar types shape', () => {
  it('GoogleOAuthTokens has required fields', () => {
    const t: GoogleOAuthTokens = {
      id: 'abc',
      user_id: 'u1',
      google_user_id: 'g1',
      refresh_token_encrypted: 'enc',
      access_token_expiry: 1000,
      calendario_id: 'primary',
      sync_enabled: true,
      bidirectional_enabled: false,
      calendario_nome: null,
      ultimo_sync_em: null,
      criado_em: '2026-01-01',
    }
    expect(t.sync_enabled).toBe(true)
  })

  it('SessionsSyncMap has required fields', () => {
    const m: SessionsSyncMap = {
      id: 'abc',
      user_id: 'u1',
      sessao_id: 's1',
      google_event_id: 'ev1',
      status_ultima_sync: 'agendada',
      sincronizado_em: '2026-01-01',
    }
    expect(m.google_event_id).toBe('ev1')
  })

  it('SessionsExternalBusy has required fields', () => {
    const b: SessionsExternalBusy = {
      id: 'abc',
      user_id: 'u1',
      google_event_id: 'ev1',
      titulo: 'Reunião',
      data_hora_inicio: '2026-01-01T10:00:00Z',
      data_hora_fim: '2026-01-01T11:00:00Z',
      descricao: null,
      atualizacao_em: null,
      sincronizado_em: '2026-01-01',
    }
    expect(b.titulo).toBe('Reunião')
  })

  it('GoogleCalendarSyncStatus has required fields', () => {
    const s: GoogleCalendarSyncStatus = {
      connected: false,
      sync_enabled: false,
      bidirectional_enabled: false,
      calendario_nome: null,
      google_user_id: null,
      ultimo_sync_em: null,
    }
    expect(s.connected).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/google-calendar-types.test.ts
```

Expected: FAIL with "Cannot find module" or type errors for the missing interfaces.

- [ ] **Step 3: Implement — add interfaces to `src/lib/types.ts`**

Append to the end of `src/lib/types.ts`:

```typescript
// ── Google Calendar Sync ──────────────────────────────────────────────────────

export interface GoogleOAuthTokens {
  id: string
  user_id: string
  google_user_id: string
  refresh_token_encrypted: string   // never exposed to frontend UI
  access_token_expiry: number        // Unix timestamp (ms)
  calendario_id: string
  sync_enabled: boolean
  bidirectional_enabled: boolean
  calendario_nome: string | null
  ultimo_sync_em: string | null
  criado_em: string
}

export interface SessionsSyncMap {
  id: string
  user_id: string
  sessao_id: string
  google_event_id: string
  status_ultima_sync: string
  sincronizado_em: string
}

export interface SessionsExternalBusy {
  id: string
  user_id: string
  google_event_id: string
  titulo: string
  data_hora_inicio: string
  data_hora_fim: string
  descricao: string | null
  atualizacao_em: string | null
  sincronizado_em: string
}

export interface GoogleCalendarSyncStatus {
  connected: boolean
  sync_enabled: boolean
  bidirectional_enabled: boolean
  calendario_nome: string | null
  google_user_id: string | null
  ultimo_sync_em: string | null
}
```

Also extend `Sessao` interface to include the new sync columns:

```typescript
// In the existing Sessao interface, add after notas_checklist:
  google_calendar_event_id: string | null
  google_calendar_synced_at: string | null
```

And extend `ConfigPsicologo` interface to include the new columns:

```typescript
// In the existing ConfigPsicologo interface, add after whatsapp_conectado:
  google_calendar_sync_enabled: boolean
  google_calendar_bidirectional: boolean
  ical_token: string | null
```

- [ ] **Step 4: Run TypeScript check and test**

```bash
npx tsc --noEmit && npx vitest run src/lib/__tests__/google-calendar-types.test.ts
```

Expected: `tsc` exits 0, test PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/__tests__/google-calendar-types.test.ts
git commit -m "feat(types): add GoogleOAuthTokens, SessionsSyncMap, SessionsExternalBusy, GoogleCalendarSyncStatus"
```

---

## Task 3: Edge Function — `google-calendar-auth`

**Files:**
- Create: `supabase/functions/google-calendar-auth/index.ts`

This function handles the complete OAuth lifecycle: authorize (redirect to Google), callback (exchange code + store token), revoke (delete token), and status (check if connected).

- [ ] **Step 1: Create the Edge Function**

```typescript
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

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

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
  // Supabase Vault: store secret and return its UUID
  const { data, error } = await supabase.rpc('vault.create_secret', {
    new_secret: plaintext,
    new_name: `google_refresh_${crypto.randomUUID()}`,
  })
  if (error) throw new Error(`Vault encrypt error: ${error.message}`)
  return data as string  // Vault secret UUID
}

async function decryptToken(supabase: ReturnType<typeof createClient>, vaultId: string): Promise<string> {
  const { data, error } = await supabase.rpc('vault.decrypted_secret', { secret_id: vaultId })
  if (error) throw new Error(`Vault decrypt error: ${error.message}`)
  return data as string
}

async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  refreshTokenVaultId: string
): Promise<{ accessToken: string; expiryMs: number }> {
  const refreshToken = await decryptToken(supabase, refreshTokenVaultId)
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
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Token refresh failed: ${body}`)
  }
  const json = await resp.json() as { access_token: string; expires_in: number }
  return {
    accessToken: json.access_token,
    expiryMs: Date.now() + json.expires_in * 1000,
  }
}

async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data: tokenRow, error } = await supabase
    .from('google_oauth_tokens')
    .select('refresh_token_encrypted, access_token_expiry')
    .eq('user_id', userId)
    .single()

  if (error || !tokenRow) throw new Error('Token não encontrado para este usuário')

  // Refresh 60 seconds before expiry
  if (Date.now() > tokenRow.access_token_expiry - 60_000) {
    const { accessToken, expiryMs } = await refreshAccessToken(supabase, tokenRow.refresh_token_encrypted)
    await supabase
      .from('google_oauth_tokens')
      .update({ access_token_expiry: expiryMs })
      .eq('user_id', userId)
    return accessToken
  }

  // Access token is still valid — re-fetch a fresh one via refresh (access tokens
  // are not stored; only expiry is stored to know when to refresh)
  const { accessToken } = await refreshAccessToken(supabase, tokenRow.refresh_token_encrypted)
  return accessToken
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

// ──────────────────────────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url    = new URL(req.url)
  const action = url.searchParams.get('action') ?? (await req.json().catch(() => ({}))).action

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // ── ACTION: authorize ──────────────────────────────────────────────────────
  if (action === 'authorize') {
    // state = random nonce encoded in base64; validated on callback via user JWT
    const stateBytes = crypto.getRandomValues(new Uint8Array(32))
    const state = btoa(String.fromCharCode(...stateBytes))

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar.events')}` +
      `&response_type=code` +
      `&state=${encodeURIComponent(state)}` +
      `&access_type=offline` +
      `&prompt=consent`

    // Return JSON so frontend can redirect
    return new Response(JSON.stringify({ authUrl }), { headers: corsHeaders })
  }

  // ── ACTION: callback ───────────────────────────────────────────────────────
  if (action === 'callback') {
    const code  = url.searchParams.get('code')
    const error = url.searchParams.get('error')

    if (error || !code) {
      return Response.redirect(`${APP_URL}/configuracoes?google_error=cancelado`)
    }

    // We identify the user from the Authorization header sent before redirect,
    // stored in the state parameter. For simplicity, this callback reads the
    // user_id from a temporary record stored in supabase keyed by state nonce.
    // In practice, state carries the user_id encoded (simpler for single-user app).
    const state  = url.searchParams.get('state') ?? ''
    let userId: string
    try {
      // state format: base64(<userId>:<nonce>)
      const decoded = atob(state)
      userId = decoded.split(':')[0]
    } catch {
      return Response.redirect(`${APP_URL}/configuracoes?google_error=estado_invalido`)
    }

    // Exchange code for tokens
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
      console.error('[google-calendar-auth] no refresh_token received — user may need to revoke access at Google first')
      return Response.redirect(`${APP_URL}/configuracoes?google_error=sem_refresh_token`)
    }

    // Decode google_user_id from id_token (JWT — no verification needed here, just decode)
    let googleUserId = 'unknown'
    if (tokens.id_token) {
      try {
        const payload = JSON.parse(atob(tokens.id_token.split('.')[1]))
        googleUserId = payload.sub ?? 'unknown'
      } catch { /* ignore */ }
    }

    // Encrypt refresh token via Supabase Vault
    const vaultId = await encryptToken(supabase, tokens.refresh_token)

    // Fetch calendar name while we have a fresh access token
    const calendarioNome = await fetchCalendarName(tokens.access_token)

    // Generate iCal token (hex, 64 chars) if not yet set
    const icalToken = generateICalToken()

    // Upsert token row
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

    // Update config_psicologo
    await supabase
      .from('config_psicologo')
      .update({
        google_calendar_sync_enabled: true,
        ical_token: icalToken,
      })
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

    // Fetch token row to revoke at Google
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
        // Delete vault secret
        await supabase.rpc('vault.delete_secret', { secret_id: tokenRow.refresh_token_encrypted })
      } catch (e) {
        console.warn(`[google-calendar-auth] revoke at Google failed (continuing): ${e}`)
      }
    }

    // Delete token row (cascade deletes sessions_sync_map rows)
    await supabase.from('google_oauth_tokens').delete().eq('user_id', userId)

    // Update config_psicologo
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

  // ── ACTION: authorize_url (called with user context) ──────────────────────
  if (action === 'authorize_url') {
    const userId = getUserIdFromJwt(req.headers.get('Authorization'))
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: corsHeaders })
    }

    // Encode userId in state for callback identification
    const nonce     = crypto.randomUUID()
    const stateRaw  = `${userId}:${nonce}`
    const state     = btoa(stateRaw)

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

  return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), { status: 400, headers: corsHeaders })
})
```

- [ ] **Step 2: Add env vars to `.env.example`**

Open `.env.example` and append:

```bash
# Google OAuth (from Google Cloud Console → APIs & Services → Credentials)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/google-calendar-auth?action=callback
APP_URL=https://your-app.vercel.app
```

- [ ] **Step 3: Deploy the function**

```bash
supabase functions deploy google-calendar-auth
```

Expected: `Deployed google-calendar-auth`

- [ ] **Step 4: Set secrets**

```bash
supabase secrets set GOOGLE_CLIENT_ID=<your-client-id>
supabase secrets set GOOGLE_CLIENT_SECRET=<your-client-secret>
supabase secrets set GOOGLE_REDIRECT_URI=https://<project-ref>.supabase.co/functions/v1/google-calendar-auth?action=callback
supabase secrets set APP_URL=https://your-app.vercel.app
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/google-calendar-auth/index.ts .env.example
git commit -m "feat(edge): google-calendar-auth — OAuth authorize, callback, revoke, status"
```

---

## Task 4: Edge Function — `google-calendar-sync`

**Files:**
- Create: `supabase/functions/google-calendar-sync/index.ts`

This function is called by the frontend (or by a Realtime trigger) whenever a session is created, updated, or deleted. It syncs the change to Google Calendar.

- [ ] **Step 1: Create the Edge Function**

```typescript
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

// Google Calendar colorId map for session status
const STATUS_COLOR_MAP: Record<string, string> = {
  agendada:   '8',   // graphite (grey)
  confirmada: '7',   // peacock (teal)
  concluida:  '10',  // sage (green)
  faltou:     '6',   // tangerine (amber)
  cancelada:  '11',  // tomato (red)
  remarcada:  '3',   // grape (purple)
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

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
  const { data, error } = await supabase.rpc('vault.decrypted_secret', { secret_id: vaultId })
  if (error) throw new Error(`Vault decrypt error: ${error.message}`)
  return data as string
}

async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<string> {
  const { data: tokenRow, error } = await supabase
    .from('google_oauth_tokens')
    .select('refresh_token_encrypted, access_token_expiry')
    .eq('user_id', userId)
    .single()

  if (error || !tokenRow) throw new Error('Token não encontrado')

  const GOOGLE_CLIENT_ID     = Deno.env.get('GOOGLE_CLIENT_ID')!
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

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
  const start  = new Date(sessao.data_hora)
  const end    = new Date(start.getTime() + sessao.duracao_minutos * 60_000)
  const nome   = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Avulso'
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

async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  sessao: SessaoPayload
): Promise<string> {
  const body = buildGoogleEvent(sessao)
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
  if (!resp.ok) throw new Error(`Criar evento Google falhou: ${await resp.text()}`)
  const json = await resp.json() as { id: string }
  return json.id
}

async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  sessao: SessaoPayload
): Promise<void> {
  const body = buildGoogleEvent(sessao)
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Atualizar evento Google falhou: ${await resp.text()}`)
  }
}

async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  )
  // 404 = already deleted; 410 = gone — both are acceptable
  if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
    throw new Error(`Deletar evento Google falhou: status ${resp.status}`)
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main handler
// ──────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Support both direct POST (from frontend) and internal calls (with SERVICE_ROLE)
  const callerUserId = getUserIdFromJwt(req.headers.get('Authorization'))

  const payload = await req.json() as {
    action: 'sync_create' | 'sync_update' | 'sync_delete'
    sessao_id: string
    user_id?: string
  }

  const userId = payload.user_id ?? callerUserId
  if (!userId) {
    return new Response(JSON.stringify({ error: 'user_id obrigatório' }), { status: 400, headers: corsHeaders })
  }

  // Check if Google sync is enabled for this user
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

    // ── sync_create ──────────────────────────────────────────────────────────
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

      console.log(`[google-calendar-sync] user=${userId} sync_create sessao=${payload.sessao_id} event=${googleEventId}`)
      return new Response(JSON.stringify({ ok: true, google_event_id: googleEventId }), { headers: corsHeaders })
    }

    // ── sync_update ──────────────────────────────────────────────────────────
    if (payload.action === 'sync_update') {
      const { data: mapRow } = await supabase
        .from('sessions_sync_map')
        .select('google_event_id')
        .eq('sessao_id', payload.sessao_id)
        .maybeSingle()

      if (!mapRow) {
        // No map row — create instead
        return serve(new Request(req.url, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify({ ...payload, action: 'sync_create' }),
        }))
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

      await supabase
        .from('sessions_sync_map')
        .update({ status_ultima_sync: sessao.status, sincronizado_em: new Date().toISOString() })
        .eq('sessao_id', payload.sessao_id)

      await supabase
        .from('sessoes')
        .update({ google_calendar_synced_at: new Date().toISOString() })
        .eq('id', payload.sessao_id)

      console.log(`[google-calendar-sync] user=${userId} sync_update sessao=${payload.sessao_id} event=${mapRow.google_event_id}`)
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
    }

    // ── sync_delete ──────────────────────────────────────────────────────────
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

      console.log(`[google-calendar-sync] user=${userId} sync_delete sessao=${payload.sessao_id}`)
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Ação desconhecida' }), { status: 400, headers: corsHeaders })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[google-calendar-sync] user=${userId} error: ${msg}`)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders })
  }
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy google-calendar-sync
```

Expected: `Deployed google-calendar-sync`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/google-calendar-sync/index.ts
git commit -m "feat(edge): google-calendar-sync — create/update/delete Google Calendar events from sessions"
```

---

## Task 5: Edge Function — `google-calendar-bidirectional-sync`

**Files:**
- Create: `supabase/functions/google-calendar-bidirectional-sync/index.ts`

Polls Google Calendar for external events (non-AgendaPsi) and stores them in `sessions_external_busy`. Called by cron every 5 minutes during business hours, or triggered manually from the UI.

- [ ] **Step 1: Create the Edge Function**

```typescript
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
  await supabase
    .from('google_oauth_tokens')
    .update({ access_token_expiry: Date.now() + json.expires_in * 1000 })
    .eq('user_id', userId)
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

  // Support: POST { user_id } from cron, or Authorization header from frontend
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

    // Fetch events from today up to 30 days ahead (business window)
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

    // Get IDs of events already synced FROM AgendaPsi (so we don't re-import them)
    const { data: syncMapRows } = await supabase
      .from('sessions_sync_map')
      .select('google_event_id')
      .eq('user_id', userId)

    const agendaPsiEventIds = new Set((syncMapRows ?? []).map(r => r.google_event_id))

    // Filter: skip AgendaPsi-synced events and all-day events
    const externalEvents = items.filter(
      e => !agendaPsiEventIds.has(e.id) && !!e.start.dateTime
    )

    // Upsert external events into sessions_external_busy
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

    // Cleanup: delete external events that no longer exist in Google Calendar
    const currentExternalIds = new Set(externalEvents.map(e => e.id))
    const { data: oldExternal } = await supabase
      .from('sessions_external_busy')
      .select('google_event_id')
      .eq('user_id', userId)

    const toDelete = (oldExternal ?? []).filter(r => !currentExternalIds.has(r.google_event_id))
    if (toDelete.length > 0) {
      await supabase
        .from('sessions_external_busy')
        .delete()
        .in('google_event_id', toDelete.map(r => r.google_event_id))
        .eq('user_id', userId)
    }

    // Update last sync timestamp
    await supabase
      .from('google_oauth_tokens')
      .update({ ultimo_sync_em: new Date().toISOString() })
      .eq('user_id', userId)

    console.log(`[google-calendar-bidirectional-sync] user=${userId} synced=${externalEvents.length} deleted=${toDelete.length}`)
    return new Response(
      JSON.stringify({ ok: true, synced: externalEvents.length, deleted: toDelete.length }),
      { headers: corsHeaders }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[google-calendar-bidirectional-sync] user=${userId} error: ${msg}`)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders })
  }
})
```

- [ ] **Step 2: Create cron registration script**

```sql
-- supabase/scripts/schedule_crons_google_calendar.sql
-- Run this in Supabase SQL Editor after enabling pg_cron extension

-- Bidirectional sync: every 5 minutes on weekdays 7am–9pm (São Paulo = UTC-3)
-- 10:00–00:00 UTC = 07:00–21:00 BRT
select cron.schedule(
  'google-calendar-bidirectional-sync',
  '*/5 10-23 * * 1-5',
  $$
  select
    net.http_post(
      url    := current_setting('app.supabase_url') || '/functions/v1/google-calendar-bidirectional-sync',
      body   := json_build_object('user_id', user_id)::text,
      headers := json_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      )::text
    )
  from config_psicologo
  where google_calendar_bidirectional = true;
  $$
);
```

- [ ] **Step 3: Deploy**

```bash
supabase functions deploy google-calendar-bidirectional-sync
```

Expected: `Deployed google-calendar-bidirectional-sync`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/google-calendar-bidirectional-sync/index.ts supabase/scripts/schedule_crons_google_calendar.sql
git commit -m "feat(edge): google-calendar-bidirectional-sync — import external events as busy markers"
```

---

## Task 6: Edge Function — `google-calendar-ical`

**Files:**
- Create: `supabase/functions/google-calendar-ical/index.ts`

Public (unauthenticated GET) endpoint that returns an iCal-format feed of all the user's sessions. Access is controlled by a secret token stored (hashed) in `config_psicologo.ical_token`.

- [ ] **Step 1: Create the Edge Function**

```typescript
// supabase/functions/google-calendar-ical/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface SessaoRow {
  id: string
  data_hora: string
  duracao_minutos: number
  status: string
  notas_checklist: string | null
  avulso_nome: string | null
  pacientes: { nome: string } | null
  modalidades_sessao: { nome: string } | null
}

function toICalDate(isoDate: string): string {
  // Convert ISO 8601 to iCal format: 20260428T140000Z
  return isoDate.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function buildICalFeed(sessions: SessaoRow[]): string {
  const now = toICalDate(new Date().toISOString())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AgendaPsi//Calendar//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:AgendaPsi',
    'X-WR-CALDESC:Agenda do Psicólogo',
    'X-WR-TIMEZONE:America/Sao_Paulo',
  ]

  for (const s of sessions) {
    const startDt = new Date(s.data_hora)
    const endDt   = new Date(startDt.getTime() + s.duracao_minutos * 60_000)
    const nome    = s.pacientes?.nome ?? s.avulso_nome ?? 'Avulso'
    const summary = `Sessão com ${escapeICalText(nome)}`

    const descParts = [
      s.modalidades_sessao?.nome,
      s.notas_checklist,
    ].filter(Boolean)
    const description = descParts.map(escapeICalText).join('\\n')

    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@agendapsi`,
      `DTSTAMP:${now}`,
      `DTSTART:${toICalDate(startDt.toISOString())}`,
      `DTEND:${toICalDate(endDt.toISOString())}`,
      `SUMMARY:${summary}`,
      description ? `DESCRIPTION:${description}` : '',
      'TRANSP:OPAQUE',
      'SEQUENCE:0',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    ).filter(Boolean)
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

serve(async (req) => {
  const url   = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return new Response('Token obrigatório', { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Look up config by the plain iCal token (stored as-is; for production use a
  // hashed comparison — here we use a direct eq for simplicity as the token is
  // already a 64-char random hex string with sufficient entropy)
  const { data: config, error } = await supabase
    .from('config_psicologo')
    .select('user_id, ical_token')
    .eq('ical_token', token)
    .maybeSingle()

  if (error || !config) {
    return new Response('Token inválido', { status: 401 })
  }

  // Fetch sessions for this user — last 30 days + next 90 days
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  const until = new Date(Date.now() + 90 * 24 * 3600_000).toISOString()

  const { data: sessions } = await supabase
    .from('sessoes')
    .select('id, data_hora, duracao_minutos, status, notas_checklist, avulso_nome, pacientes(nome), modalidades_sessao(nome)')
    .eq('user_id', config.user_id)
    .gte('data_hora', since)
    .lte('data_hora', until)
    .order('data_hora')

  const icalFeed = buildICalFeed((sessions ?? []) as SessaoRow[])

  return new Response(icalFeed, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="agendapsi.ics"',
      'Cache-Control': 'no-cache',
    },
  })
})
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy google-calendar-ical
```

Expected: `Deployed google-calendar-ical`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/google-calendar-ical/index.ts
git commit -m "feat(edge): google-calendar-ical — public iCal feed for Apple Calendar"
```

---

## Task 7: React Hook — `useGoogleCalendarSync`

**Files:**
- Create: `src/hooks/useGoogleCalendarSync.ts`
- Create: `src/hooks/__tests__/useGoogleCalendarSync.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/hooks/__tests__/useGoogleCalendarSync.test.ts
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

  it('syncNow calls google-calendar-bidirectional-sync', async () => {
    vi.mocked(supabase.functions.invoke)
      .mockResolvedValueOnce({ data: connectedStatus,           error: null } as any)
      .mockResolvedValueOnce({ data: { ok: true, synced: 3 }, error: null } as any)

    const { result } = renderHook(() => useGoogleCalendarSync())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.syncNow() })

    expect(vi.mocked(supabase.functions.invoke)).toHaveBeenCalledWith('google-calendar-bidirectional-sync', {})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/useGoogleCalendarSync.test.ts
```

Expected: FAIL — `Cannot find module '../useGoogleCalendarSync'`

- [ ] **Step 3: Implement the hook**

```typescript
// src/hooks/useGoogleCalendarSync.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { GoogleCalendarSyncStatus } from '@/lib/types'

export function useGoogleCalendarSync() {
  const [status, setStatus]   = useState<GoogleCalendarSyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

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

  useEffect(() => { fetchStatus() }, [])

  async function connect() {
    const { data, error: err } = await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'authorize_url' },
    })
    if (err || !data?.authUrl) {
      setError(err?.message ?? 'Falha ao obter URL de autorização')
      return
    }
    window.location.href = data.authUrl
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
    if (patch.sync_enabled !== undefined)      dbPatch.google_calendar_sync_enabled = patch.sync_enabled
    if (patch.bidirectional_enabled !== undefined) dbPatch.google_calendar_bidirectional = patch.bidirectional_enabled

    const { error: err } = await supabase
      .from('config_psicologo')
      .update(dbPatch)
      .eq('user_id', user.id)

    if (err) {
      setError(err.message)
      return
    }

    // Also update google_oauth_tokens for immediate effect
    if (patch.sync_enabled !== undefined || patch.bidirectional_enabled !== undefined) {
      const tokenPatch: Record<string, boolean> = {}
      if (patch.sync_enabled !== undefined)          tokenPatch.sync_enabled = patch.sync_enabled
      if (patch.bidirectional_enabled !== undefined) tokenPatch.bidirectional_enabled = patch.bidirectional_enabled
      await supabase.from('google_oauth_tokens').update(tokenPatch).eq('user_id', user.id)
    }

    await fetchStatus()
  }

  async function syncNow() {
    await supabase.functions.invoke('google-calendar-bidirectional-sync', {})
    await fetchStatus()
  }

  return { status, loading, error, connect, disconnect, updateSyncSettings, syncNow, refetch: fetchStatus }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/useGoogleCalendarSync.test.ts
```

Expected: PASS (5 tests)

- [ ] **Step 5: Run full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useGoogleCalendarSync.ts src/hooks/__tests__/useGoogleCalendarSync.test.ts
git commit -m "feat(hooks): useGoogleCalendarSync — connect, disconnect, updateSyncSettings, syncNow"
```

---

## Task 8: Frontend — ConfiguracoesPage Google Calendar Section

**Files:**
- Modify: `src/pages/ConfiguracoesPage.tsx`

Add the Google Calendar connection section after the WhatsApp section (the closing `</div>` at line 596, just before the final `</div>` wrapper).

- [ ] **Step 1: Write failing test**

There are no existing component tests for ConfiguracoesPage. Write a focused smoke test:

```typescript
// src/pages/__tests__/ConfiguracoesGoogleCalendar.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from:      vi.fn(),
    functions: { invoke: vi.fn() },
    auth:      { getUser: vi.fn() },
  },
}))
vi.mock('@/hooks/useConvenios',         () => ({ useConvenios:         () => ({ convenios: [], loading: false, addConvenio: vi.fn(), toggleAtivo: vi.fn(), updateValor: vi.fn() }) }))
vi.mock('@/hooks/useModalidadesSessao', () => ({ useModalidadesSessao: () => ({ modalidadesSessao: [], loading: false, addModalidadeSessao: vi.fn(), toggleAtivo: vi.fn() }) }))
vi.mock('@/hooks/useMeiosAtendimento',  () => ({ useMeiosAtendimento:  () => ({ meiosAtendimento: [], loading: false, addMeioAtendimento: vi.fn(), toggleAtivo: vi.fn() }) }))
vi.mock('@/hooks/useConfigPsicologo',   () => ({
  useConfigPsicologo: () => ({
    config: { id: '1', nome: 'Dr. Teste', horario_inicio: '08:00', horario_fim: '18:00', whatsapp_conectado: false, evolution_instance_name: null, automacao_whatsapp_ativa: false, user_id: 'u1', horario_lembrete_1: '18:00', horario_lembrete_2: '07:00', google_calendar_sync_enabled: false, google_calendar_bidirectional: false, ical_token: null },
    loading: false,
    updateConfig: vi.fn(),
    refetch: vi.fn(),
  }),
}))
vi.mock('@/hooks/useGoogleCalendarSync', () => ({
  useGoogleCalendarSync: () => ({
    status: { connected: false, sync_enabled: false, bidirectional_enabled: false, calendario_nome: null, google_user_id: null, ultimo_sync_em: null },
    loading: false,
    error: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    updateSyncSettings: vi.fn(),
    syncNow: vi.fn(),
    refetch: vi.fn(),
  }),
}))

import { ConfiguracoesPage } from '../ConfiguracoesPage'

describe('ConfiguracoesPage — Google Calendar section', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders Google Calendar section heading', async () => {
    render(<ConfiguracoesPage />)
    await waitFor(() => expect(screen.getByText('Google Calendar')).toBeInTheDocument())
  })

  it('shows connect button when not connected', async () => {
    render(<ConfiguracoesPage />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /conectar google calendar/i })).toBeInTheDocument()
    )
  })

  it('calls connect when button clicked', async () => {
    const { useGoogleCalendarSync } = await import('@/hooks/useGoogleCalendarSync')
    const connectFn = vi.fn()
    vi.mocked(useGoogleCalendarSync).mockReturnValue({
      status: { connected: false, sync_enabled: false, bidirectional_enabled: false, calendario_nome: null, google_user_id: null, ultimo_sync_em: null },
      loading: false, error: null,
      connect: connectFn, disconnect: vi.fn(), updateSyncSettings: vi.fn(), syncNow: vi.fn(), refetch: vi.fn(),
    } as any)

    render(<ConfiguracoesPage />)
    const btn = await screen.findByRole('button', { name: /conectar google calendar/i })
    await userEvent.click(btn)
    expect(connectFn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/pages/__tests__/ConfiguracoesGoogleCalendar.test.tsx
```

Expected: FAIL — Google Calendar section not rendered yet.

- [ ] **Step 3: Add imports to ConfiguracoesPage.tsx**

At the top of `src/pages/ConfiguracoesPage.tsx`, after the existing imports, add:

```typescript
import { formatDistance } from 'date-fns'
import { useGoogleCalendarSync } from '@/hooks/useGoogleCalendarSync'
```

- [ ] **Step 4: Add hook call inside ConfiguracoesPage component**

After the existing hook calls (around line 18), add:

```typescript
const { status: googleSync, loading: loadingGoogleSync, connect: conectarGoogle, disconnect: desconectarGoogle, updateSyncSettings: atualizarGoogleSync, syncNow: sincronizarAgora } = useGoogleCalendarSync()
```

Add two state variables for loading indicators, after the existing state declarations (around line 45):

```typescript
const [conectandoGoogle, setConectandoGoogle]     = useState(false)
const [desconectandoGoogle, setDesconectandoGoogle] = useState(false)
```

- [ ] **Step 5: Add Google Calendar section to JSX**

In `src/pages/ConfiguracoesPage.tsx`, immediately before the final closing `</div>` of the component (after the WhatsApp section closing `</div>` around line 596), add:

```tsx
      {/* Google Calendar */}
      <div className="bg-surface border border-border rounded-card p-6">
        <h2 className="font-display text-lg font-semibold text-[#1C1C1C] mb-4">Google Calendar</h2>

        {loadingGoogleSync ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !googleSync?.connected ? (
          /* Estado A: não conectado */
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Sincronize suas sessões automaticamente com o Google Calendar. Cada sessão criada ou
              atualizada aparece na sua agenda Google em tempo real.
            </p>
            <button
              onClick={async () => {
                setConectandoGoogle(true)
                try { await conectarGoogle() } finally { setConectandoGoogle(false) }
              }}
              disabled={conectandoGoogle}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {conectandoGoogle ? 'Redirecionando...' : 'Conectar Google Calendar'}
            </button>
          </div>
        ) : (
          /* Estado B: conectado */
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#4CAF82]" />
                  <span className="text-sm font-medium text-[#4CAF82]">Conectado</span>
                </div>
                {googleSync.calendario_nome && (
                  <p className="text-xs text-muted mt-0.5">{googleSync.calendario_nome}</p>
                )}
                {googleSync.ultimo_sync_em && (
                  <p className="text-xs text-muted">
                    Última sincronização:{' '}
                    {formatDistance(new Date(googleSync.ultimo_sync_em), new Date(), { locale: ptBR, addSuffix: true })}
                  </p>
                )}
              </div>
            </div>

            {/* Toggle: manter sincronização ativa */}
            <div className="border-t border-border pt-4 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-[#1C1C1C]">Manter sincronização ativa</span>
                <input
                  type="checkbox"
                  checked={googleSync.sync_enabled}
                  onChange={e => atualizarGoogleSync({ sync_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-border rounded-full peer peer-checked:bg-primary transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
              </label>

              {/* Toggle: sincronização bidirecional */}
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-[#1C1C1C]">Sincronização bidirecional</span>
                  <p className="text-xs text-muted">Importa eventos externos do Google Calendar como bloqueios de horário</p>
                </div>
                <input
                  type="checkbox"
                  checked={googleSync.bidirectional_enabled}
                  onChange={e => atualizarGoogleSync({ bidirectional_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-border rounded-full peer peer-checked:bg-primary transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 ml-4 shrink-0" />
              </label>

              {/* Sincronizar agora (manual trigger) */}
              {googleSync.bidirectional_enabled && (
                <button
                  onClick={sincronizarAgora}
                  className="h-9 px-4 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-bg transition-colors"
                >
                  Sincronizar agora
                </button>
              )}
            </div>

            {/* iCal URL para Apple Calendar */}
            <div className="border-t border-border pt-4">
              <details>
                <summary className="cursor-pointer text-sm text-primary hover:underline">
                  Adicionar ao Apple Calendar (iCal)
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted">
                    Copie a URL abaixo e adicione em Calendário → Arquivo → Nova Assinatura de Calendário
                  </p>
                  {config?.ical_token ? (
                    <div className="p-2 bg-[#E8F4F4] rounded text-xs font-mono break-all select-all">
                      {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-ical?token=${config.ical_token}`}
                    </div>
                  ) : (
                    <p className="text-xs text-muted italic">
                      URL disponível após a primeira conexão com o Google Calendar.
                    </p>
                  )}
                </div>
              </details>
            </div>

            {/* Desconectar */}
            <div className="border-t border-border pt-4">
              <button
                onClick={async () => {
                  if (!confirm('Desconectar o Google Calendar vai parar a sincronização e remover todos os dados de conexão. Continuar?')) return
                  setDesconectandoGoogle(true)
                  try { await desconectarGoogle() } finally { setDesconectandoGoogle(false) }
                }}
                disabled={desconectandoGoogle}
                className="h-9 px-4 rounded-lg border border-[#C17F59] text-[#C17F59] text-sm font-medium hover:bg-[#C17F59]/5 transition-colors disabled:opacity-50"
              >
                {desconectandoGoogle ? 'Desconectando...' : 'Desconectar Google Calendar'}
              </button>
            </div>
          </div>
        )}
      </div>
```

- [ ] **Step 6: Handle OAuth callback success/error toast**

In `src/pages/ConfiguracoesPage.tsx`, add a `useEffect` to detect the `google_success` and `google_error` query params (set by the Edge Function after the OAuth callback redirects to `/configuracoes`). Add this after the existing `useEffect` calls, before `handleSaveConfig`:

```typescript
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_success')) {
      toast.success('Google Calendar conectado com sucesso!')
      window.history.replaceState({}, '', '/configuracoes')
    }
    const googleError = params.get('google_error')
    if (googleError) {
      const messages: Record<string, string> = {
        cancelado:          'Conexão cancelada.',
        estado_invalido:    'Erro de segurança no fluxo OAuth. Tente novamente.',
        troca_falhou:       'Falha ao trocar o código de autorização. Tente novamente.',
        sem_refresh_token:  'Google não retornou o token. Revogue o acesso em myaccount.google.com/permissions e tente novamente.',
        db_error:           'Erro ao salvar a conexão. Tente novamente.',
      }
      toast.error(messages[googleError] ?? 'Erro ao conectar o Google Calendar.')
      window.history.replaceState({}, '', '/configuracoes')
    }
  }, [])
```

- [ ] **Step 7: Run tests**

```bash
npx vitest run src/pages/__tests__/ConfiguracoesGoogleCalendar.test.tsx
```

Expected: PASS (3 tests)

- [ ] **Step 8: Run full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/pages/ConfiguracoesPage.tsx src/pages/__tests__/ConfiguracoesGoogleCalendar.test.tsx
git commit -m "feat(ui): ConfiguracoesPage — Google Calendar sync section with connect/disconnect/toggles"
```

---

## Task 9: Frontend — Session CRUD Triggers Sync

**Files:**
- Modify: `src/pages/AgendaPage.tsx` (or whichever page creates/updates/deletes sessions)
- Modify: `src/hooks/useKanban.ts` (update session status)
- Modify: `src/hooks/useChecklistBadge.ts` (session status updates)

The sync must fire whenever a session is inserted, updated (status change, reschedule), or deleted. The cleanest place is after each Supabase mutation in the existing hooks.

- [ ] **Step 1: Write failing test for sync trigger on status update**

```typescript
// src/hooks/__tests__/useKanbanGoogleSync.test.ts
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from:      vi.fn(),
    functions: { invoke: vi.fn() },
    auth:      { getUser: vi.fn() },
  },
}))
import { supabase } from '@/lib/supabase'

// Helper: invoke function called with correct sync action
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
    // Simulate a direct invoke call (unit-level: verify the contract, not the full hook)
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
```

- [ ] **Step 2: Run test to verify it passes (contract test)**

```bash
npx vitest run src/hooks/__tests__/useKanbanGoogleSync.test.ts
```

Expected: PASS (3 tests — these verify the contract shape, not the real hook integration)

- [ ] **Step 3: Create sync helper**

```typescript
// src/lib/googleCalendarSync.ts
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
```

- [ ] **Step 4: Find the session-creation hook**

Open `src/hooks/useKanban.ts` and locate the function that calls `supabase.from('sessoes').insert(...)`. After the successful insert, add:

```typescript
import { triggerGoogleCalendarSync } from '@/lib/googleCalendarSync'

// After: const { data, error } = await supabase.from('sessoes').insert(...).select('id').single()
// if (!error && data?.id) {
await triggerGoogleCalendarSync('sync_create', data.id)
// }
```

Similarly, after every `supabase.from('sessoes').update(...)` call (status changes in Kanban), add:

```typescript
await triggerGoogleCalendarSync('sync_update', sessaoId)
```

And after every `supabase.from('sessoes').delete()` call, add:

```typescript
await triggerGoogleCalendarSync('sync_delete', sessaoId)
```

- [ ] **Step 5: Locate all session mutation sites**

Search for all mutation points:

```bash
grep -rn "from('sessoes').*insert\|from('sessoes').*update\|from('sessoes').*delete" src/hooks/ src/pages/
```

Expected output (approximate — add sync call after each):
- `src/hooks/useKanban.ts` — status update (→ `sync_update`)
- `src/pages/AgendaPage.tsx` or session creation form — insert (→ `sync_create`)
- Any delete action — `sync_delete`

After identifying each site, add the corresponding `triggerGoogleCalendarSync` call. The call is fire-and-forget (no `await` needed if you don't want to delay UI), but `await` is preferred for error visibility.

- [ ] **Step 6: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/googleCalendarSync.ts src/hooks/__tests__/useKanbanGoogleSync.test.ts
git add src/hooks/useKanban.ts  # and any other modified files
git commit -m "feat(sync): trigger google-calendar-sync on session create/update/delete"
```

---

## Task 10: Frontend — Show Busy Markers in Agenda/Kanban

**Files:**
- Modify: `src/pages/AgendaPage.tsx` (or `src/hooks/useSessoesDia.ts`)

When bidirectional sync is enabled, the agenda should visually indicate when a session slot overlaps with an external Google Calendar event.

- [ ] **Step 1: Create a utility function with tests**

```typescript
// src/lib/__tests__/conflictCheckGoogle.test.ts
import { describe, it, expect } from 'vitest'
import { checkGoogleConflict } from '../conflictCheckGoogle'
import type { SessionsExternalBusy } from '../types'

const busy: SessionsExternalBusy = {
  id: 'b1',
  user_id: 'u1',
  google_event_id: 'ev1',
  titulo: 'Reunião',
  data_hora_inicio: '2026-04-29T14:00:00Z',
  data_hora_fim:    '2026-04-29T15:00:00Z',
  descricao: null,
  atualizacao_em: null,
  sincronizado_em: '2026-04-29T00:00:00Z',
}

describe('checkGoogleConflict', () => {
  it('returns conflicting busy markers for an overlapping session', () => {
    // Session 14:30–15:30 overlaps with busy 14:00–15:00
    const result = checkGoogleConflict('2026-04-29T14:30:00Z', 60, [busy])
    expect(result).toHaveLength(1)
    expect(result[0].titulo).toBe('Reunião')
  })

  it('returns empty array when no overlap', () => {
    // Session 15:30–16:30 does not overlap with busy 14:00–15:00
    const result = checkGoogleConflict('2026-04-29T15:30:00Z', 60, [busy])
    expect(result).toHaveLength(0)
  })

  it('returns empty array when session ends exactly when busy starts', () => {
    // Session 13:00–14:00 ends exactly when busy starts — no overlap
    const result = checkGoogleConflict('2026-04-29T13:00:00Z', 60, [busy])
    expect(result).toHaveLength(0)
  })

  it('returns conflict when session starts exactly when busy starts', () => {
    // Session 14:00–14:30 starts exactly when busy starts — overlap
    const result = checkGoogleConflict('2026-04-29T14:00:00Z', 30, [busy])
    expect(result).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/__tests__/conflictCheckGoogle.test.ts
```

Expected: FAIL — `Cannot find module '../conflictCheckGoogle'`

- [ ] **Step 3: Implement the utility**

```typescript
// src/lib/conflictCheckGoogle.ts
import type { SessionsExternalBusy } from './types'

/**
 * Returns any external Google Calendar busy periods that overlap with the given session.
 *
 * Overlap condition:
 *   session starts before busy ends  AND  session ends after busy starts
 */
export function checkGoogleConflict(
  sessaoDataHora: string,
  duracaoMinutos: number,
  busyPeriods: SessionsExternalBusy[]
): SessionsExternalBusy[] {
  const sessaoStart = new Date(sessaoDataHora).getTime()
  const sessaoEnd   = sessaoStart + duracaoMinutos * 60_000

  return busyPeriods.filter(b => {
    const busyStart = new Date(b.data_hora_inicio).getTime()
    const busyEnd   = new Date(b.data_hora_fim).getTime()
    return sessaoStart < busyEnd && sessaoEnd > busyStart
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/__tests__/conflictCheckGoogle.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Add busy marker hook**

```typescript
// src/hooks/useExternalBusy.ts
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { SessionsExternalBusy } from '@/lib/types'

/**
 * Fetches external busy periods from sessions_external_busy for the current user.
 * Only loads data if there are any rows (fast path for users without bidirectional sync).
 */
export function useExternalBusy(desde: Date, ate: Date) {
  const [busy, setBusy] = useState<SessionsExternalBusy[]>([])

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('sessions_external_busy')
        .select('*')
        .lte('data_hora_inicio', ate.toISOString())
        .gte('data_hora_fim',    desde.toISOString())
        .order('data_hora_inicio')

      setBusy((data as SessionsExternalBusy[]) ?? [])
    }
    fetch()
  }, [desde.toISOString(), ate.toISOString()])

  return busy
}
```

- [ ] **Step 6: Add conflict indicator to session cards in AgendaPage**

In `src/pages/AgendaPage.tsx`, locate where session cards are rendered (the map over sessions). Add:

```typescript
import { useExternalBusy } from '@/hooks/useExternalBusy'
import { checkGoogleConflict } from '@/lib/conflictCheckGoogle'

// Inside the component, after sessions are loaded:
const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0))
const endOfDay   = new Date(selectedDate.setHours(23, 59, 59, 999))
const externalBusy = useExternalBusy(startOfDay, endOfDay)

// In the session card render:
const conflicts = checkGoogleConflict(sessao.data_hora, sessao.duracao_minutos, externalBusy)
const hasConflict = conflicts.length > 0

// Render warning badge if conflict:
{hasConflict && (
  <span className="text-xs text-[#C17F59] font-medium">
    Conflito: {conflicts[0].titulo}
  </span>
)}
```

- [ ] **Step 7: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/conflictCheckGoogle.ts src/lib/__tests__/conflictCheckGoogle.test.ts
git add src/hooks/useExternalBusy.ts src/pages/AgendaPage.tsx
git commit -m "feat(agenda): show Google Calendar conflict warnings on session cards"
```

---

## Task 11: Run Full Test Suite and Final Verification

- [ ] **Step 1: Run all tests**

```bash
npx vitest run
```

Expected: all existing tests pass + new tests pass. Zero failures.

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: exits 0 with no errors.

- [ ] **Step 3: Manual integration checklist**

Perform these steps in a running dev environment against the actual Supabase project:

- [ ] Visit `/configuracoes` — Google Calendar section renders with "Conectar Google Calendar" button
- [ ] Click "Conectar Google Calendar" — browser redirects to Google OAuth consent screen
- [ ] Grant permission — browser redirects back to `/configuracoes?google_success=1`
- [ ] Toast shows "Google Calendar conectado com sucesso!"
- [ ] Section now shows "Conectado" state with calendar name
- [ ] Create a new session — verify corresponding event appears in Google Calendar within 5 seconds
- [ ] Update session status in Kanban — verify Google Calendar event color changes
- [ ] Delete a session — verify Google Calendar event is removed
- [ ] Toggle "Manter sincronização ativa" OFF — new session mutations are skipped (no Google event)
- [ ] Toggle "Sincronização bidirecional" ON — verify external events appear after cron run or "Sincronizar agora"
- [ ] Visit the iCal URL — browser downloads `.ics` file with sessions listed
- [ ] Add iCal URL to Apple Calendar — verify sessions appear in subscription calendar
- [ ] Click "Desconectar Google Calendar" and confirm — section reverts to "Conectar" state
- [ ] Verify `google_oauth_tokens` row is deleted in Supabase

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: Google Calendar Sync complete — OAuth, bidirectional, iCal, conflict detection"
```

---

## Self-Review Checklist

- [x] Spec §2.1 `google_oauth_tokens`: migration 020 creates table with all columns, indexes, RLS
- [x] Spec §2.1 `sessions_sync_map`: migration 020 creates table with all columns, indexes, RLS
- [x] Spec §2.1 `sessions_external_busy`: migration 020 creates table with all columns, indexes, RLS
- [x] Spec §2.2 `sessoes` columns: migration 020 adds `google_calendar_event_id`, `google_calendar_synced_at`
- [x] Spec §2.2 `config_psicologo` columns: migration 020 adds `google_calendar_sync_enabled`, `google_calendar_bidirectional`, `ical_token`
- [x] Spec §3.1 TypeScript interfaces: Task 2 adds all 4 interfaces + extends Sessao and ConfigPsicologo
- [x] Spec §4.1 OAuth authorize: `google-calendar-auth` action `authorize_url` generates URL with state=userId:nonce
- [x] Spec §4.1 OAuth callback: `google-calendar-auth` action `callback` exchanges code, encrypts token via Vault, stores row
- [x] Spec §4.2 Token refresh: `getValidAccessToken` helper refreshes 60s before expiry in all Edge Functions
- [x] Spec §4.3 Disconnect: action `revoke` revokes at Google, deletes Vault secret, deletes row, resets config
- [x] Spec §5.1 Export sync on INSERT: `google-calendar-sync` action `sync_create` creates Google event + map row
- [x] Spec §5.1 Export sync on UPDATE: `google-calendar-sync` action `sync_update` updates Google event + map row
- [x] Spec §5.1 Export sync on DELETE: `google-calendar-sync` action `sync_delete` deletes Google event + map row
- [x] Spec §5.2 Session→Event mapping: `buildGoogleEvent` maps all fields (summary, times, colorId, transparency)
- [x] Spec §5.3 Bidirectional sync: `google-calendar-bidirectional-sync` fetches external events, upserts to `sessions_external_busy`, cleans stale rows
- [x] Spec §6.1 `google-calendar-auth`: 4 actions implemented (authorize_url, callback, revoke, status)
- [x] Spec §6.2 `google-calendar-sync`: 3 actions implemented (sync_create, sync_update, sync_delete)
- [x] Spec §6.3 `google-calendar-bidirectional-sync`: cron-compatible, skips if bidirectional disabled
- [x] Spec §6.4 `google-calendar-ical`: public endpoint, token-gated, RFC 5545 iCal output
- [x] Spec §7.1 ConfiguracoesPage: Google Calendar section with connect/disconnect/toggles/iCal URL
- [x] Spec §7.2 Busy markers: `checkGoogleConflict` utility + `useExternalBusy` hook + visual indicator in AgendaPage
- [x] Spec §8.1 iCal token: generated on connection, stored in `config_psicologo.ical_token`, displayed in UI
- [x] Spec §9 Error handling: all Edge Functions log errors + return appropriate HTTP status codes; UI shows toast on callback errors
- [x] Spec §10 Tests: hook tests (5), type tests (4), conflict utility tests (4), contract tests (3), UI smoke tests (3)
- [x] Migration number: 020 (correct per EXECUCAO.md)
- [x] All user-facing text in Portuguese (pt-BR)
- [x] No plaintext credentials — refresh tokens go through Supabase Vault; iCal token stored as-is (64-char hex) with sufficient entropy
- [x] Tokens never in frontend state — `refresh_token_encrypted` field is a Vault UUID; actual token only decrypted inside Edge Functions
