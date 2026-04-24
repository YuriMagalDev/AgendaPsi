# WhatsApp Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the WhatsApp automation that's already coded — enable Realtime on required tables, schedule the pg_cron reminder job, and configure Supabase secrets.

**Architecture:** One migration enables Realtime on `sessoes` and `confirmacoes_whatsapp`. A separate, non-committed SQL script runs the pg_cron job (contains SERVICE_ROLE_KEY — must not be in git). Supabase secrets are set via CLI for the three env vars the Edge Functions need.

**Tech Stack:** Supabase pg_cron, pg_net, Supabase Realtime, Evolution API (Railway), Supabase CLI

---

## File Map

| Action | Path |
|---|---|
| Create | `supabase/migrations/012_whatsapp_activation.sql` |
| Create | `supabase/scripts/schedule_cron.sql` (template — substituted at runtime, committed with placeholders) |

No TypeScript changes. All Edge Functions are already deployed.

---

### Task 1: Create Realtime migration

**Files:**
- Create: `supabase/migrations/012_whatsapp_activation.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/012_whatsapp_activation.sql
-- Enable Realtime publication on tables used by useKanban and useNotificacoes

alter publication supabase_realtime add table sessoes;
alter publication supabase_realtime add table confirmacoes_whatsapp;
```

- [ ] **Step 2: Apply the migration**

Run in Supabase SQL editor (Dashboard → SQL Editor → paste and run), OR via CLI:

```bash
supabase db push
```

Expected: no errors. If either table is already in the publication, Postgres will throw "already exists" — safe to ignore.

- [ ] **Step 3: Verify Realtime is enabled**

In Supabase dashboard → Database → Replication → supabase_realtime publication. Confirm `sessoes` and `confirmacoes_whatsapp` appear in the table list.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/012_whatsapp_activation.sql
git commit -m "feat(db): enable Realtime on sessoes and confirmacoes_whatsapp"
```

---

### Task 2: Set Supabase Edge Function secrets

**Files:** (no file changes — Supabase secrets are set via CLI)

- [ ] **Step 1: Locate the three values**

| Secret | Where to find it |
|---|---|
| `EVOLUTION_API_URL` | Railway dashboard → Evolution API service → Settings → Domains → public URL (e.g. `https://evolution-api-xxx.up.railway.app`) |
| `EVOLUTION_API_KEY` | Railway dashboard → Evolution API service → Variables → `AUTHENTICATION_API_KEY` |
| `WEBHOOK_SECRET` | Generate with: `openssl rand -hex 32` — save it somewhere safe, you'll need it in Task 4 |

- [ ] **Step 2: Set secrets via Supabase CLI**

```bash
supabase secrets set EVOLUTION_API_URL=https://your-evolution-api.up.railway.app
supabase secrets set EVOLUTION_API_KEY=your_api_key_here
supabase secrets set WEBHOOK_SECRET=your_generated_secret_here
```

Expected output for each: `Finished supabase secrets set.`

- [ ] **Step 3: Verify secrets are set**

```bash
supabase secrets list
```

Expected: all three secrets appear in the output (values are redacted).

---

### Task 3: Create pg_cron script template

**Files:**
- Create: `supabase/scripts/schedule_cron.sql`

- [ ] **Step 1: Create the script file with placeholders**

```sql
-- supabase/scripts/schedule_cron.sql
-- DO NOT commit with real values substituted.
-- Before running: replace <PROJECT_REF> and <SERVICE_ROLE_KEY> with real values.
-- Find PROJECT_REF: Supabase dashboard → Settings → General → Reference ID
-- Find SERVICE_ROLE_KEY: Supabase dashboard → Settings → API → service_role key

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

- [ ] **Step 2: Commit the template (with placeholders, not real values)**

```bash
git add supabase/scripts/schedule_cron.sql
git commit -m "feat(db): add pg_cron schedule template for whatsapp-lembretes"
```

- [ ] **Step 3: Substitute real values and run in SQL editor**

Open Supabase dashboard → SQL Editor. Copy contents of `supabase/scripts/schedule_cron.sql`.

Replace:
- `<PROJECT_REF>` → your Supabase project reference ID (e.g. `abcdefghijklmnop`)
- `<SERVICE_ROLE_KEY>` → your service_role JWT from Supabase dashboard → Settings → API

Paste the substituted SQL into the editor and run it. Do NOT save the substituted version to disk or git.

Expected: `SELECT 1` (pg_cron returns the job ID).

- [ ] **Step 4: Verify cron job is scheduled**

Run in SQL editor:

```sql
select jobname, schedule, command from cron.job where jobname = 'whatsapp-lembretes';
```

Expected: one row with `*/30 * * * *` schedule.

---

### Task 4: Verify WEBHOOK_SECRET consistency

The `WEBHOOK_SECRET` set in Task 2 must match the value used when the Evolution API instance was created in `whatsapp-setup`. If the instance was created before secrets were set, the webhook header won't match and replies will be silently rejected.

**Files:** (no file changes)

- [ ] **Step 1: Check if instance already exists**

In the app, go to Configurações → WhatsApp. If QR code was already scanned and status shows "conectado", the instance exists.

- [ ] **Step 2: Determine if secret matches**

Query in Supabase SQL editor:

```sql
select evolution_instance_name, whatsapp_conectado from config_psicologo limit 1;
```

If `evolution_instance_name` is not null, an instance was created. The webhook secret it was registered with depends on what `WEBHOOK_SECRET` was set to at that time.

- [ ] **Step 3a: If instance was created BEFORE secrets were set → re-create it**

The webhook was registered without the secret header. Need to delete and re-create:

1. In Evolution API dashboard (Railway URL → Swagger or `/manager`), delete the existing instance.
2. In Supabase SQL editor, clear the instance fields:
   ```sql
   update config_psicologo
   set evolution_instance_name = null,
       evolution_token = null,
       whatsapp_conectado = false;
   ```
3. In the app, go to Configurações → WhatsApp → click "Conectar" to trigger `whatsapp-setup → action: 'create'`. This re-creates the instance with `WEBHOOK_SECRET` now set correctly.
4. Scan the QR code to reconnect.

- [ ] **Step 3b: If instance was created AFTER secrets were set → no action needed**

Secret is already consistent. Move to Task 5.

---

### Task 5: Smoke test end-to-end

- [ ] **Step 1: Test send-lembrete manually**

Find a session ID from a patient with a phone number registered. Run in Supabase SQL editor:

```sql
select id, data_hora, status from sessoes where status in ('agendada', 'confirmada') order by data_hora limit 5;
```

Copy one `id`. Then call `send-lembrete` in test mode from the Supabase Edge Functions dashboard → `send-lembrete` → Test:

```json
{
  "sessao_id": "<id from above>",
  "tipo": "24h",
  "test": true
}
```

Expected response: `{ "ok": true, ... }` with `sendStatus: 200`. The patient's WhatsApp receives a message prefixed with "🧪 TESTE".

- [ ] **Step 2: Test webhook reply parsing**

Reply "sim" or "1" to the test message from the patient's phone. Then check in Supabase:

```sql
select confirmado, resposta, lida from confirmacoes_whatsapp order by mensagem_enviada_em desc limit 1;
```

Expected: `confirmado = true`, `resposta = 'Confirmado'`.

Also check the Kanban in the app — the session card should have moved to "confirmada" column without a page refresh (Realtime).

- [ ] **Step 3: Verify pg_cron fires**

Wait up to 30 minutes after Task 3. Then check cron execution log:

```sql
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'whatsapp-lembretes')
order by start_time desc
limit 5;
```

Expected: `status = 'succeeded'` rows appearing every 30 minutes.

- [ ] **Step 4: Verify notification bell**

After a patient replies "sim", check the TopBar bell icon in the app. Badge count should increment and the dropdown should show "Confirmou a sessão" with patient name and session time.

---

### Task 6: Final commit

- [ ] **Step 1: Confirm clean working tree**

```bash
git status
```

Expected: `nothing to commit, working tree clean` (all changes committed in Tasks 1 and 3).

- [ ] **Step 2: Tag completion**

```bash
git tag whatsapp-activation-live
```
