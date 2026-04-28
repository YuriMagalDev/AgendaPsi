# Design Spec — Google Calendar Sync

**Date:** 2026-04-27  
**Status:** Draft  
**Project:** AgendaPsi  
**Migration:** `020_google_calendar_sync.sql`  
**Branch:** feat/google-calendar-sync

---

## 1. Overview

### Goals

1. **Export-first sync** — AgendaPsi sessions automatically export to user's Google Calendar (one-way by default)
2. **Bidirectional opt-in** — user can enable in Settings to sync Google Calendar events → AgendaPsi (blocks time slots, prevents double booking)
3. **CalDAV/iCal fallback** — Apple Calendar users can subscribe to a public read-only iCal feed without OAuth
4. **Secure token storage** — OAuth tokens encrypted at rest in Supabase
5. **Reliable sync** — Edge Functions + Realtime webhooks ensure consistency; no orphaned events

### Key Decisions

- **OAuth flow:** Google OAuth 2.0 with PKCE (browser-based auth, tokens stored server-side)
- **Refresh tokens:** Stored encrypted in `google_oauth_tokens` table, refreshed automatically before use
- **Sync triggers:** On session CRUD (insert/update/delete), via Supabase Realtime → Edge Function webhook
- **CalDAV:** Read-only iCal feed exposed via Edge Function (no OAuth; unauthenticated GET)
- **External events:** Google Calendar events (non-AgendaPsi) create read-only "busy" markers in AgendaPsi (stored in `sessions_external_busy` table)

### Out of Scope

- Attendee management (no invitations sent to patients)
- Timezone conversion logic beyond ISO 8601 (assumed São Paulo: America/Sao_Paulo)
- Historical sync (only forward from feature deployment)
- Import patient emails from Google contacts
- Two-way sync for session status (e.g., patient marks "maybe" in Google Calendar)
- Conflict resolution UI (if user creates two overlapping sessions manually)

---

## 2. Data Model

### 2.1 New Tables

#### `google_oauth_tokens` — Encrypted OAuth credentials

Stores encrypted refresh tokens + metadata per user. One row per user/tenant.

```sql
create table google_oauth_tokens (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  google_user_id        text not null,
  refresh_token_encrypted text not null,
  access_token_expiry   bigint not null,
  calendario_id         text not null default 'primary',
  sync_enabled          boolean not null default true,
  bidirectional_enabled boolean not null default false,
  calendario_nome       text,
  ultimo_sync_em        timestamptz,
  criado_em             timestamptz not null default now(),
  constraint unique_user_google_oauth unique (user_id, google_user_id)
);

create index idx_google_oauth_tokens_user_id on google_oauth_tokens(user_id);
```

**Notes:**
- `refresh_token_encrypted`: encrypted via Supabase Vault (AES-256 GCM)
- `access_token_expiry`: Unix timestamp (milliseconds) when current access token expires
- `calendario_id`: Google Calendar resource ID (usually 'primary' for user's default calendar)
- `sync_enabled`: global toggle (user can disable sync without disconnecting)
- `bidirectional_enabled`: when true, Edge Function polls Google Calendar for external events
- `ultimo_sync_em`: timestamp of last successful sync (for polling logic)

---

#### `sessions_sync_map` — Track AgendaPsi→Google Calendar event IDs

Prevents duplicate syncs and enables delete propagation.

```sql
create table sessions_sync_map (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  sessao_id             uuid not null references sessoes(id) on delete cascade,
  google_event_id       text not null,
  status_ultima_sync    text not null,
  sincronizado_em       timestamptz not null default now(),
  constraint unique_user_sessao_google unique (user_id, sessao_id),
  constraint unique_user_google_event unique (user_id, google_event_id)
);

create index idx_sessions_sync_map_user_id on sessions_sync_map(user_id);
create index idx_sessions_sync_map_sessao_id on sessions_sync_map(sessao_id);
create index idx_sessions_sync_map_google_event_id on sessions_sync_map(google_event_id);
```

**Notes:**
- `status_ultima_sync`: last known `sessao.status` (to detect status changes)
- Unique index ensures one Google event per AgendaPsi session
- When session deleted: trigger deletes map row and notifies Edge Function to delete Google event

---

#### `sessions_external_busy` — Track external Google Calendar events (bidirectional mode)

Read-only busy markers. If user enables bidirectional sync, this table collects external events from Google Calendar.

```sql
create table sessions_external_busy (
  id                    uuid primary key default uuid_generate_v4(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  google_event_id       text not null,
  titulo                text not null,
  data_hora_inicio      timestamptz not null,
  data_hora_fim         timestamptz not null,
  descricao             text,
  atualizacao_em        timestamptz,
  sincronizado_em       timestamptz not null default now(),
  constraint unique_user_google_external unique (user_id, google_event_id)
);

create index idx_sessions_external_busy_user_id on sessions_external_busy(user_id);
create index idx_sessions_external_busy_intervalo on sessions_external_busy(user_id, data_hora_inicio, data_hora_fim);
```

**Notes:**
- Used by frontend to check availability in Kanban/Agenda views (visual "busy" indicator)
- Not real sessions; read-only for conflict detection
- Synced periodically (every 5–10 minutes during business hours)

---

### 2.2 Modifications to Existing Tables

#### `sessoes` — Add sync tracking columns (optional, for performance)

```sql
alter table sessoes add column google_calendar_event_id text;
alter table sessoes add column google_calendar_synced_at timestamptz;

create index idx_sessoes_google_calendar_event_id on sessoes(google_calendar_event_id);
```

**Rationale:** Denormalization for faster UI queries. Replicate `sessions_sync_map.google_event_id` here for convenience. Keep `sessions_sync_map` as source of truth.

---

#### `config_psicologo` — Add sync configuration flags

```sql
alter table config_psicologo add column google_calendar_sync_enabled boolean not null default false;
alter table config_psicologo add column google_calendar_bidirectional boolean not null default false;
```

**Rationale:** User-friendly toggles in Settings UI. Actual tokens live in `google_oauth_tokens`.

---

### 2.3 Triggers + Cleanup

```sql
-- When sessao deleted: cascade delete sync_map row (triggers Edge Function webhook)
create trigger sessions_sync_map_delete_on_sessao
after delete on sessoes
for each row
execute function notify_sync_deletion('google-calendar-delete');

-- When google_oauth_tokens deleted: clean up all related sync_map rows
alter table sessions_sync_map
  add constraint fk_sessions_sync_map_google_oauth_token
  foreign key (user_id) references google_oauth_tokens(user_id) on delete cascade;
```

---

## 3. Types

### 3.1 TypeScript Interfaces (`src/lib/types.ts`)

```typescript
export interface GoogleOAuthTokens {
  id: string
  user_id: string
  google_user_id: string
  refresh_token_encrypted: string   // never exposed to frontend
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

### 3.2 Google API Request/Response Types

```typescript
// For internal Edge Function use only (not exposed to frontend)

interface GoogleCalendarEvent {
  id: string
  summary: string
  description?: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  colorId?: string
  transparency?: 'opaque' | 'transparent'
}

interface GoogleAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: 'Bearer'
}

interface GoogleCalendarListResponse {
  items: Array<{ id: string; summary: string }>
}
```

---

## 4. OAuth Flow

### 4.1 Initial Setup (User Connects Google Calendar)

**Step 1: User clicks "Conectar Google Calendar" button in ConfiguracoesPage**

Frontend redirects to Edge Function:

```
GET https://<project>.supabase.co/functions/v1/google-calendar-auth?action=authorize&state=<random-nonce>
```

Edge Function generates authorization URL and redirects:

```
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=<GOOGLE_CLIENT_ID>
  redirect_uri=https://<project>.supabase.co/functions/v1/google-calendar-auth?action=callback
  scope=https://www.googleapis.com/auth/calendar
  response_type=code
  state=<nonce>
  access_type=offline
  prompt=consent
```

**Step 2: User grants permission in Google**

Google redirects back to callback:

```
GET https://<project>.supabase.co/functions/v1/google-calendar-auth?action=callback&code=<auth-code>&state=<nonce>
```

Edge Function:
1. Validates `state` nonce (CSRF protection)
2. Exchanges `code` for `access_token` + `refresh_token` (Google API call)
3. **Encrypts** refresh token using Supabase Vault
4. Stores in `google_oauth_tokens` with `user_id` (from `Authorization` header / JWT)
5. Fetches user's primary calendar name from Google Calendar API
6. Updates `config_psicologo.google_calendar_sync_enabled = true`
7. Redirects to `/configuracoes` with success toast

---

### 4.2 Token Refresh

Before any Google API call, Edge Function checks `access_token_expiry`:

```typescript
const now = Date.now()
const token = await getTokenRow(userId)

if (now > token.access_token_expiry - 60000) {  // refresh 60s early
  const newAccessToken = await refreshAccessToken(token.refresh_token_encrypted)
  // Store new expiry in token row
}
```

Refresh call to Google:

```
POST https://oauth2.googleapis.com/token
  grant_type=refresh_token
  refresh_token=<decrypted-token>
  client_id=<GOOGLE_CLIENT_ID>
  client_secret=<GOOGLE_CLIENT_SECRET>
```

Response:
```json
{
  "access_token": "ya29...",
  "expires_in": 3599,
  "token_type": "Bearer"
}
```

Update token row: `access_token_expiry = now + (expires_in * 1000)`

---

### 4.3 Disconnect

User clicks "Desconectar" in Settings:

Frontend POSTs to Edge Function:

```json
POST /google-calendar-auth
{ "action": "revoke" }
```

Edge Function:
1. Revokes token at Google:
   ```
   POST https://oauth2.googleapis.com/revoke
     token=<refresh_token>
   ```
2. Deletes `google_oauth_tokens` row
3. Deletes all `sessions_sync_map` rows (cascade cleanup)
4. Updates `config_psicologo`: `google_calendar_sync_enabled = false`, `google_calendar_bidirectional = false`
5. Returns success

---

## 5. Sync Logic

### 5.1 Export: AgendaPsi → Google Calendar (Primary)

**Trigger:** Session inserted, updated, or deleted in `sessoes` table.

**Transport:** Supabase Realtime → frontend WebSocket + internal Realtime trigger → Edge Function webhook

**Implementation:**

1. **On Insert:**
   - Edge Function `google-calendar-sync` receives event
   - Checks if `google_oauth_tokens` exists for user
   - If sync disabled, skips
   - Creates Google Calendar event
   - Stores `google_event_id` in `sessions_sync_map`

2. **On Update:**
   - Looks up `google_event_id` in `sessions_sync_map`
   - If exists, calls Google Calendar API to update event
   - Updates `status_ultima_sync` in map

3. **On Delete:**
   - Looks up `google_event_id` in `sessions_sync_map`
   - Calls Google Calendar API to delete event
   - Cascade deletes `sessions_sync_map` row

---

### 5.2 Session → Google Event Mapping

| AgendaPsi Field | Google Calendar Field | Notes |
|---|---|---|
| `data_hora` | `start.dateTime` | ISO 8601 + timezone (America/Sao_Paulo) |
| `data_hora + duracao_minutos` | `end.dateTime` | Calculated end time |
| `pacientes.nome` or `avulso_nome` | `summary` | E.g., "Sessão com João" |
| `status` | `colorId` | agendada=grey, confirmada=teal, concluida=green, faltou=amber, cancelada=red, remarcada=purple |
| `notas_checklist` | `description` | Optional; includes session notes if available |
| `modalidades_sessao.nome` | description (appended) | E.g., "Presencial" |
| — | `transparency` | Set to 'opaque' (blocks time) for all sessions |

**Example Google Calendar event JSON:**

```json
{
  "summary": "Sessão com João Silva",
  "description": "Presencial\nNotas: Paciente relou bem no encontro anterior.",
  "start": {
    "dateTime": "2026-04-28T14:00:00",
    "timeZone": "America/Sao_Paulo"
  },
  "end": {
    "dateTime": "2026-04-28T15:00:00",
    "timeZone": "America/Sao_Paulo"
  },
  "colorId": "1",
  "transparency": "opaque"
}
```

---

### 5.3 Bidirectional Sync (Import: Google Calendar → AgendaPsi)

**Enabled by:** `config_psicologo.google_calendar_bidirectional = true`

**Trigger:** Cron job (every 5 minutes during business hours) or manual sync button

**Implementation:**

1. Edge Function `google-calendar-bidirectional-sync` fetches all events from user's Google Calendar
2. Filters out events that are:
   - Already synced (exist in `sessions_sync_map`)
   - All-day events
   - Personal notes (heuristic: title starts with note-like keywords)
3. For each external event:
   - Create row in `sessions_external_busy` table
   - Frontend checks this table when rendering Kanban/Agenda (visual "busy" indicator)
4. If conflict detected (overlap with AgendaPsi session), frontend shows warning

**Busy Detection Algorithm:**

```typescript
function checkBusyTime(startTime: Date, endTime: Date, userId: string): SessionsExternalBusy[] {
  return db
    .from('sessions_external_busy')
    .select('*')
    .eq('user_id', userId)
    .or(`data_hora_inicio.lt.${endTime.toISOString()},data_hora_fim.gt.${startTime.toISOString()}`)
}
```

---

## 6. Edge Functions

### 6.1 `google-calendar-auth` — OAuth Setup

**File:** `supabase/functions/google-calendar-auth/index.ts`

**Exposed Methods:**

```typescript
// action=authorize
// Generates Google OAuth URL, redirects user

// action=callback
// Exchanges auth code for tokens, stores encrypted refresh token

// action=revoke
// Revokes token at Google, deletes local row

// action=status
// Returns { connected: bool, calendario_nome?: string }

// action=refresh
// Internal: refreshes access token if expired
```

**Environment Variables:**

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<project>.supabase.co/functions/v1/google-calendar-auth?action=callback
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**Key Implementation Details:**

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jwtDecode } from 'https://esm.sh/jwt-decode'

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface AuthorizationRequest {
  action: 'authorize' | 'callback' | 'revoke' | 'status' | 'refresh'
  code?: string
  state?: string
}

serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // 1. Authorize: generate URL
  if (action === 'authorize') {
    const state = crypto.getRandomValues(new Uint8Array(32))
    const stateb64 = btoa(String.fromCharCode(...state))
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${GOOGLE_CLIENT_ID}&` +
      `redirect_uri=${GOOGLE_REDIRECT_URI}&` +
      `scope=${encodeURIComponent('https://www.googleapis.com/auth/calendar')}&` +
      `response_type=code&` +
      `state=${stateb64}&` +
      `access_type=offline&` +
      `prompt=consent`
    return Response.redirect(authUrl)
  }

  // 2. Callback: exchange code
  if (action === 'callback') {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    
    // Verify state (store in Redis or return as opaque token)
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code: code!,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI,
      }).toString(),
    })

    const tokens = await tokenResponse.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      id_token: string
    }

    // Decode ID token to get google_user_id
    const decoded = jwtDecode<{ sub: string }>(tokens.id_token)

    // Get user_id from JWT Authorization header
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '')
    const user = jwtDecode<{ sub: string }>(auth!)

    // Encrypt refresh token (Supabase Vault)
    const encrypted = await encryptToken(tokens.refresh_token)

    // Store in Supabase
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    await supabase.from('google_oauth_tokens').upsert({
      user_id: user.sub,
      google_user_id: decoded.sub,
      refresh_token_encrypted: encrypted,
      access_token_expiry: Date.now() + (tokens.expires_in * 1000),
      calendario_id: 'primary',
      sync_enabled: true,
    })

    // Fetch calendar name
    const calendarName = await fetchCalendarName(tokens.access_token)
    await supabase.from('google_oauth_tokens')
      .update({ calendario_nome: calendarName })
      .eq('user_id', user.sub)

    // Update config_psicologo
    await supabase.from('config_psicologo')
      .update({ google_calendar_sync_enabled: true })
      .eq('user_id', user.sub)

    return Response.redirect('/configuracoes?toast=Conectado com sucesso')
  }

  // 3. Revoke: delete token
  if (action === 'revoke') {
    // Similar pattern: get user from JWT, lookup token, revoke at Google, delete row
  }
})
```

**Error Handling:**

```typescript
// Invalid state: 403 Forbidden
// Token exchange fails: 502 Bad Gateway
// Calendar API unreachable: 503 Service Unavailable
// User cancels auth: redirect to /configuracoes?error=cancelled
```

---

### 6.2 `google-calendar-sync` — Sync Sessions

**File:** `supabase/functions/google-calendar-sync/index.ts`

**Triggered by:** Supabase Realtime (session INSERT/UPDATE/DELETE)

**Implementation:**

```typescript
interface SyncRequest {
  action: 'sync_create' | 'sync_update' | 'sync_delete'
  sessao_id: string
  user_id: string
  // For sync_create/sync_update: include full session data
  sessao?: Sessao & {
    pacientes?: { nome: string }
    modalidades_sessao?: { nome: string }
  }
}

serve(async (req) => {
  const payload = await req.json() as SyncRequest
  const { action, sessao_id, user_id, sessao } = payload

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 1. Check if sync enabled
  const { data: tokens } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('user_id', user_id)
    .single()

  if (!tokens || !tokens.sync_enabled) {
    return new Response(JSON.stringify({ skipped: 'sync disabled' }), { status: 200 })
  }

  // 2. Refresh token if needed
  let accessToken = await getOrRefreshToken(tokens)

  // 3. Handle actions
  if (action === 'sync_create') {
    const eventId = await createGoogleEvent(accessToken, sessao, tokens.calendario_id)
    await supabase.from('sessions_sync_map').insert({
      user_id,
      sessao_id,
      google_event_id: eventId,
      status_ultima_sync: sessao.status,
    })
  } else if (action === 'sync_update') {
    const { data: map } = await supabase
      .from('sessions_sync_map')
      .select('google_event_id')
      .eq('sessao_id', sessao_id)
      .single()

    if (map) {
      await updateGoogleEvent(accessToken, map.google_event_id, sessao, tokens.calendario_id)
      await supabase.from('sessions_sync_map')
        .update({ status_ultima_sync: sessao.status })
        .eq('sessao_id', sessao_id)
    }
  } else if (action === 'sync_delete') {
    const { data: map } = await supabase
      .from('sessions_sync_map')
      .select('google_event_id')
      .eq('sessao_id', sessao_id)
      .single()

    if (map) {
      await deleteGoogleEvent(accessToken, map.google_event_id, tokens.calendario_id)
    }
    // cascade delete via trigger handles sessions_sync_map
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})
```

---

### 6.3 `google-calendar-bidirectional-sync` — Import External Events

**File:** `supabase/functions/google-calendar-bidirectional-sync/index.ts`

**Triggered by:** Cron (every 5 minutes, 8 AM–8 PM São Paulo time) or manual button

**Implementation:**

```typescript
serve(async (req) => {
  const { user_id } = await req.json() as { user_id: string }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: tokens } = await supabase
    .from('google_oauth_tokens')
    .select('*')
    .eq('user_id', user_id)
    .single()

  if (!tokens || !tokens.bidirectional_enabled) {
    return new Response(JSON.stringify({ skipped: 'bidirectional disabled' }), { status: 200 })
  }

  let accessToken = await getOrRefreshToken(tokens)

  // Fetch all events from Google Calendar (with minimal fields)
  const googleEvents = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${tokens.calendario_id}/events?` +
    `timeMin=${new Date().toISOString()}&` +
    `maxResults=250&` +
    `fields=items(id,summary,start,end,transparency)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )

  const { items } = await googleEvents.json() as { items: GoogleCalendarEvent[] }

  // Filter out AgendaPsi-synced events
  const { data: syncMap } = await supabase
    .from('sessions_sync_map')
    .select('google_event_id')
    .eq('user_id', user_id)

  const syncedEventIds = new Set(syncMap?.map(m => m.google_event_id) || [])

  // Upsert external events
  const externalEvents = items
    .filter(e => !syncedEventIds.has(e.id) && !e.start.date)  // skip all-day events

  for (const event of externalEvents) {
    await supabase.from('sessions_external_busy').upsert({
      user_id,
      google_event_id: event.id,
      titulo: event.summary,
      data_hora_inicio: event.start.dateTime,
      data_hora_fim: event.end.dateTime,
      atualizacao_em: new Date().toISOString(),
    })
  }

  // Cleanup: delete external events that no longer exist in Google Calendar
  const currentExternalIds = new Set(externalEvents.map(e => e.id))
  const { data: oldExternal } = await supabase
    .from('sessions_external_busy')
    .select('google_event_id')
    .eq('user_id', user_id)

  for (const old of oldExternal || []) {
    if (!currentExternalIds.has(old.google_event_id)) {
      await supabase.from('sessions_external_busy')
        .delete()
        .eq('google_event_id', old.google_event_id)
    }
  }

  // Update last sync timestamp
  await supabase.from('google_oauth_tokens')
    .update({ ultimo_sync_em: new Date().toISOString() })
    .eq('user_id', user_id)

  return new Response(JSON.stringify({ ok: true, synced: externalEvents.length }), { status: 200 })
})
```

---

### 6.4 `google-calendar-ical` — CalDAV/iCal Export

**File:** `supabase/functions/google-calendar-ical/index.ts`

**Exposed:** Public (no auth required) — returns iCal format

**Query Params:**

- `token`: read-only iCal token (stored in `config_psicologo.ical_token`)
- `user_id`: optional, matched against token

**Implementation:**

```typescript
serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return new Response('Missing token', { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Lookup user by iCal token (hashed comparison)
  const { data: config } = await supabase
    .from('config_psicologo')
    .select('user_id, ical_token')
    .eq('ical_token', hashToken(token))
    .single()

  if (!config) {
    return new Response('Invalid token', { status: 401 })
  }

  // Fetch all sessions for this user
  const { data: sessions } = await supabase
    .from('sessoes')
    .select('id, data_hora, duracao_minutos, pacientes(nome), avulso_nome, status, notas_checklist, modalidades_sessao(nome)')
    .eq('user_id', config.user_id)
    .gte('data_hora', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())  // last 30 days
    .order('data_hora')

  // Build iCal format (RFC 5545)
  const ical = buildICalString(sessions, config.user_id)

  return new Response(ical, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="agendapsi.ics"',
    },
  })
})

function buildICalString(sessions: Sessao[], userId: string): string {
  let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//AgendaPsi//Calendar//PT
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALDESC:Agenda do Psicólogo
X-WR-CALNAME:AgendaPsi
X-WR-TIMEZONE:America/Sao_Paulo
`

  for (const session of sessions) {
    const startTime = new Date(session.data_hora).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const endTime = new Date(new Date(session.data_hora).getTime() + session.duracao_minutos * 60000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const summary = `Sessão com ${session.pacientes?.nome ?? session.avulso_nome ?? 'Avulso'}`

    ical += `BEGIN:VEVENT
UID:${session.id}@agendapsi
DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}
DTSTART:${startTime}
DTEND:${endTime}
SUMMARY:${summary}
DESCRIPTION:${session.notas_checklist ?? ''}
TRANSP:OPAQUE
SEQUENCE:0
STATUS:CONFIRMED
END:VEVENT
`
  }

  ical += `END:VCALENDAR`
  return ical
}
```

**Usage:**

User adds calendar subscription in Apple Calendar:

```
https://<project>.supabase.co/functions/v1/google-calendar-ical?token=<iCal-token>
```

---

## 7. UI Changes

### 7.1 ConfiguracoesPage — Google Calendar Section

**Location:** `src/pages/ConfiguracoesPage.tsx`

**New UI Section (after WhatsApp section):**

```jsx
/* — Google Calendar Sync — */
<section className="space-y-4">
  <h2 className="text-lg font-semibold text-text">Google Calendar</h2>

  {!googleSync?.connected ? (
    // State A: Not connected
    <div className="p-4 rounded-lg border border-border bg-surface space-y-3">
      <p className="text-sm text-muted">
        Sincronize suas sessões automaticamente com Google Calendar.
      </p>
      <button
        onClick={conectarGoogleCalendar}
        disabled={conectandoGoogle}
        className="w-full py-2 px-4 bg-primary text-surface rounded-lg hover:bg-primary/90 disabled:opacity-50"
      >
        {conectandoGoogle ? 'Conectando...' : 'Conectar Google Calendar'}
      </button>
    </div>
  ) : (
    // State B: Connected
    <div className="p-4 rounded-lg border border-border bg-surface space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text">Conectado</p>
          <p className="text-xs text-muted">{googleSync.calendario_nome}</p>
          {googleSync.ultimo_sync_em && (
            <p className="text-xs text-muted">
              Últimas sincronizadas: {formatDistance(new Date(googleSync.ultimo_sync_em), new Date(), { locale: ptBR, addSuffix: true })}
            </p>
          )}
        </div>
        <span className="text-2xl">✓</span>
      </div>

      {/* Toggle sync */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={googleSync.sync_enabled}
          onChange={(e) => updateGoogleSync({ sync_enabled: e.target.checked })}
          className="w-4 h-4 rounded"
        />
        <span className="text-sm text-text">Manter sincronização ativa</span>
      </label>

      {/* Bidirectional toggle */}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={googleSync.bidirectional_enabled}
          onChange={(e) => updateGoogleSync({ bidirectional_enabled: e.target.checked })}
          className="w-4 h-4 rounded"
        />
        <span className="text-sm text-text">
          Sincronização bidirecional (importar eventos do Google Calendar)
        </span>
      </label>

      {/* iCal link for Apple Calendar */}
      <details className="text-sm">
        <summary className="cursor-pointer text-primary hover:underline">
          Adicionar a Apple Calendar (iCal)
        </summary>
        <div className="mt-2 p-2 bg-primary-light rounded text-xs font-mono break-all">
          {icalUrl}
        </div>
      </details>

      {/* Disconnect */}
      <button
        onClick={desconectarGoogleCalendar}
        disabled={desconectando}
        className="w-full py-2 px-4 border border-accent text-accent rounded-lg hover:bg-accent/5 disabled:opacity-50"
      >
        {desconectando ? 'Desconectando...' : 'Desconectar'}
      </button>
    </div>
  )}
</section>
```

**New Hook:** `useGoogleCalendarSync` (similar pattern to `useConfigPsicologo`)

```typescript
export function useGoogleCalendarSync() {
  const [sync, setSync] = useState<GoogleCalendarSyncStatus | null>(null)

  useEffect(() => {
    fetchSyncStatus()
  }, [])

  async function fetchSyncStatus() {
    const { data } = await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'status' },
    })
    setSync(data)
  }

  async function connect() {
    window.location.href = (await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'authorize' },
    })).data.authUrl
  }

  async function disconnect() {
    await supabase.functions.invoke('google-calendar-auth', {
      body: { action: 'revoke' },
    })
    await fetchSyncStatus()
  }

  async function updateSync(patch: Partial<GoogleCalendarSyncStatus>) {
    await supabase.from('config_psicologo')
      .update({
        google_calendar_sync_enabled: patch.sync_enabled,
        google_calendar_bidirectional: patch.bidirectional_enabled,
      })
      .eq('user_id', currentUserId)
    await fetchSyncStatus()
  }

  return { sync, connect, disconnect, updateSync, loading: !sync }
}
```

### 7.2 KanbanPage / AgendaPage — Show Busy Markers

**In Agenda/Kanban views, check for conflicts with external Google events:**

```typescript
const { data: busyTimes } = await supabase
  .from('sessions_external_busy')
  .select('*')
  .eq('user_id', currentUserId)
  .gte('data_hora_fim', today.toISOString())
  .lte('data_hora_inicio', tomorrowEnd.toISOString())

// In session card: check if overlaps
const isOverlapWithBusy = busyTimes.some(busy =>
  new Date(session.data_hora) < new Date(busy.data_hora_fim) &&
  new Date(session.data_hora).getTime() + session.duracao_minutos * 60000 > new Date(busy.data_hora_inicio).getTime()
)

// Render warning badge if overlap
if (isOverlapWithBusy) {
  <span className="text-xs text-accent">⚠️ Conflito com Google Calendar</span>
}
```

---

## 8. CalDAV/iCal Alternative

### 8.1 iCal Token Generation

When user first connects or disconnects Google Calendar, generate a unique iCal token:

```typescript
// In config_psicologo table
alter table config_psicologo add column ical_token text unique;

// Generate on first use
const icalToken = crypto.randomUUID()
await supabase.from('config_psicologo')
  .update({ ical_token: hashToken(icalToken) })
  .eq('user_id', userId)
```

### 8.2 Apple Calendar Subscription URL

Display in ConfiguracoesPage:

```
https://<project>.supabase.co/functions/v1/google-calendar-ical?token=<ical-token>
```

User copies URL and adds in Apple Calendar app:

1. Calendar app → File → New Calendar Subscription
2. Paste URL → Subscribe
3. Calendar auto-refreshes every 15–60 minutes

---

## 9. Error Handling

### 9.1 Common Scenarios

| Scenario | Response | Recovery |
|---|---|---|
| User revokes Google Calendar permission | Sync paused; show notification in UI | User re-connects; backlog resync on connect |
| Access token expired; refresh fails | Log error; disable sync for user | Daily cron retry; user must reconnect |
| Google Calendar API rate limit (429) | Backoff exponential; retry later | Automatic retry via cron |
| Session has no patient name | Use "Avulso" as fallback | Non-blocking |
| Duplicate google_event_id in DB | Skip sync; log warning | Manual cleanup script |
| Conflict between AgendaPsi session and external Google event | Show visual warning in UI; allow proceed | User resolves manually |

### 9.2 Logging & Observability

Edge Functions log to Supabase logs:

```typescript
console.log(`[google-calendar-sync] user=${userId} action=${action} status=ok`)
console.error(`[google-calendar-sync] user=${userId} error=${error.message}`)
```

Frontend logs sync errors to toast:

```typescript
toast.error('Erro ao sincronizar com Google Calendar. Tente novamente.')
```

---

## 10. Testing

### 10.1 Unit Tests

**File:** `src/hooks/__tests__/useGoogleCalendarSync.test.ts`

```typescript
describe('useGoogleCalendarSync', () => {
  it('should fetch sync status on mount', async () => {
    const { result } = renderHook(() => useGoogleCalendarSync())
    await waitFor(() => expect(result.current.sync).toBeDefined())
    expect(result.current.sync?.connected).toBe(false)
  })

  it('should connect to Google Calendar', async () => {
    const { result } = renderHook(() => useGoogleCalendarSync())
    // Mock OAuth flow
    await act(() => result.current.connect())
    // Assert redirect happened
  })
})
```

### 10.2 Integration Tests

**File:** `supabase/functions/google-calendar-sync/__tests__/index.test.ts`

```typescript
Deno.test('sync_create: creates Google event and sync_map row', async () => {
  const mockAccessToken = 'ya29...'
  const mockEventId = 'abc123'

  // Mock Google Calendar API
  mock.stub(globalThis, 'fetch', () =>
    Promise.resolve(new Response(JSON.stringify({ id: mockEventId })))
  )

  // Call function
  const req = new Request('http://localhost/', {
    method: 'POST',
    body: JSON.stringify({
      action: 'sync_create',
      sessao_id: '123',
      user_id: '456',
      sessao: { data_hora: '2026-05-01T14:00:00', duracao_minutos: 60, /* ... */ },
    }),
  })

  const res = await serve(req)
  assertEquals(res.status, 200)

  // Assert sessions_sync_map row created
})
```

### 10.3 Manual Testing Checklist

- [ ] User can click "Conectar Google Calendar" and see Google OAuth screen
- [ ] After auth, Settings shows "Conectado" with calendar name
- [ ] Creating a session creates corresponding Google event
- [ ] Updating session status updates Google event color
- [ ] Deleting session deletes Google event
- [ ] Toggling `Manter sincronização ativa` pauses/resumes sync
- [ ] Enabling bidirectional sync fetches external Google events
- [ ] External events appear as visual warnings in Kanban/Agenda
- [ ] iCal URL works in Apple Calendar app
- [ ] Disconnecting revokes Google permission and clears local tokens
- [ ] Refreshing page after disconnect shows "Not connected" state

---

## 11. Rollout

### 11.1 Deployment Order

1. **Database migration (020_google_calendar_sync.sql)**
   - Create tables: `google_oauth_tokens`, `sessions_sync_map`, `sessions_external_busy`
   - Modify `sessoes`: add `google_calendar_event_id`, `google_calendar_synced_at`
   - Modify `config_psicologo`: add `google_calendar_sync_enabled`, `google_calendar_bidirectional`, `ical_token`
   - Create triggers for cascade delete

2. **Edge Functions**
   - Deploy `google-calendar-auth`
   - Deploy `google-calendar-sync`
   - Deploy `google-calendar-bidirectional-sync`
   - Deploy `google-calendar-ical`

3. **TypeScript types & hooks**
   - Update `src/lib/types.ts`
   - Create `src/hooks/useGoogleCalendarSync.ts`

4. **Frontend UI**
   - Update `src/pages/ConfiguracoesPage.tsx`
   - Update Kanban/Agenda pages to show busy markers

5. **Feature flag (optional)**
   - Add `FEATURE_GOOGLE_CALENDAR_SYNC=true` to `.env`
   - Wrap new UI in feature flag for gradual rollout

### 11.2 Backwards Compatibility

- Feature is opt-in (user must click "Conectar")
- Existing users unaffected (no required migration)
- Can be disabled globally via `FEATURE_GOOGLE_CALENDAR_SYNC=false`

### 11.3 Monitoring

- Track sync success rate: `google-calendar-sync` function invocations
- Alert on sync errors > 5% over 1 hour
- Monitor token refresh failures (indicates auth issues)
- Check Google Calendar API quota usage (free tier: 10,000 calls/day per user)

---

## Appendix A — Environment Variables

```
# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://<project>.supabase.co/functions/v1/google-calendar-auth?action=callback

# Supabase
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

# Encryption key for tokens (Supabase Vault)
# Already managed by Supabase; no explicit env var needed
```

---

## Appendix B — Database Permissions (RLS)

All tables require RLS policies:

```sql
-- google_oauth_tokens: users can only see/modify their own
alter table google_oauth_tokens enable row level security;

create policy "user can view own tokens" on google_oauth_tokens
  for select to authenticated using (auth.uid() = user_id);

create policy "user can delete own tokens" on google_oauth_tokens
  for delete to authenticated using (auth.uid() = user_id);

-- sessions_sync_map: users can only see/modify their own
alter table sessions_sync_map enable row level security;

create policy "user can view own sync map" on sessions_sync_map
  for all to authenticated using (auth.uid() = user_id);

-- sessions_external_busy: users can only see/modify their own
alter table sessions_external_busy enable row level security;

create policy "user can view own busy times" on sessions_external_busy
  for all to authenticated using (auth.uid() = user_id);
```

---

## Appendix C — Google Calendar API Scopes

| Scope | Purpose | Risk |
|---|---|---|
| `https://www.googleapis.com/auth/calendar` | Read/write calendar events | Full calendar access |

**Consideration:** Could use narrower scope `https://www.googleapis.com/auth/calendar.events` to limit to events only (not calendar metadata). Recommended for production.

---

**End of Spec**
