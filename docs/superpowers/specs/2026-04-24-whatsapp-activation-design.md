# WhatsApp Automation Activation — Design Spec

**Date:** 2026-04-24
**Status:** Approved
**Migration:** `012_whatsapp_activation.sql`

---

## Context

Edge Functions for WhatsApp automation are fully written and deployed:
- `cron-lembretes` — scans sessions in 48h/24h/2h windows, dispatches reminders
- `send-lembrete` — calls Evolution API sendText, logs to `confirmacoes_whatsapp`
- `whatsapp-webhook` — parses patient replies (CONFIRMAR/CANCELAR), updates `sessoes.status`
- `whatsapp-setup` — creates Evolution API instance, registers webhook URL

Frontend is also ready:
- `useKanban` subscribes to `sessoes` via Realtime — auto-updates on webhook confirmation
- `useNotificacoes` subscribes to `confirmacoes_whatsapp` via Realtime — bell badge in TopBar

Two gaps remain: the cron job is not scheduled, and Realtime is not enabled on the required tables.

---

## Section 1 — Migration `012_whatsapp_activation.sql`

Single atomic file. Two operations.

### 1.1 Enable Realtime on required tables

```sql
alter publication supabase_realtime add table sessoes;
alter publication supabase_realtime add table confirmacoes_whatsapp;
```

Required for `useKanban` and `useNotificacoes` to receive live updates.

### 1.2 Schedule cron job via pg_cron

```sql
select cron.schedule(
  'whatsapp-lembretes',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/cron-lembretes',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

**Before running:** substitute `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>` with real values. Do NOT commit the substituted file to git — run it directly in Supabase SQL editor or via CLI with env substitution.

Frequency: every 30 min. The reminder windows in `cron-lembretes` are ±1h wide (47–49h, 23–25h, 1.5–2.5h), so 30-min polling cannot miss a window.

---

## Section 2 — Env Vars (set once in Supabase)

Set via Supabase dashboard → Edge Functions → Secrets, or via CLI:

```bash
supabase secrets set EVOLUTION_API_URL=https://...
supabase secrets set EVOLUTION_API_KEY=...
supabase secrets set WEBHOOK_SECRET=...
```

| Secret | Source |
|---|---|
| `EVOLUTION_API_URL` | Railway — public URL of Evolution API service |
| `EVOLUTION_API_KEY` | Evolution API `AUTHENTICATION_API_KEY` env var on Railway |
| `WEBHOOK_SECRET` | Any strong random string (e.g. `openssl rand -hex 32`) |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase — no action needed.

---

## Section 3 — WEBHOOK_SECRET Consistency

**Critical:** `WEBHOOK_SECRET` must match the value used when the Evolution API instance was created. During `whatsapp-setup → action: 'create'`, the function reads `WEBHOOK_SECRET` from env and passes it to Evolution API as the webhook header secret.

If the instance already exists (QR code already scanned), verify the secret matches:
- If it does → no action needed
- If it doesn't → delete the instance from Evolution API dashboard and re-run `whatsapp-setup → action: 'create'` from the app's Configurações page (triggers fresh QR scan)

---

## Section 4 — Out of Scope

- `evolution_token` encryption via Supabase Vault (separate effort)
- Retry logic for failed reminder sends (currently: silently skipped)
- Admin UI to view/cancel scheduled cron jobs
- Message templates management
