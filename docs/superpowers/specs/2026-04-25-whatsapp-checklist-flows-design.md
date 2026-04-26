# Design Spec — WhatsApp Confirmation Flow & Checklist

**Date:** 2026-04-25
**Status:** Approved
**Project:** Psicologo

---

## 1. Overview

This spec covers five interconnected behaviors that were not fully defined in the original design:

1. Checklist navigation access
2. Two-reminder WhatsApp schedule with deduplication
3. Patient cancel via WhatsApp (including cancel-after-confirm)
4. Behavior when patient does not respond to the last reminder
5. Checklist page trigger and end-of-day state

---

## 2. Decisions

### 2.1 Checklist in Navigation

`/checklist` is always visible in the bottom nav / sidebar. A badge appears on the icon when there are sessions from the current day still without a final status (`agendada` or `confirmada`) and `horario_checklist` has passed.

Badge is calculated client-side: on app open, check if current time ≥ `horario_checklist` AND sessions from today have pending status.

### 2.2 WhatsApp Reminders — Two Fixed Windows

Two cron Edge Functions replace the single D-1 reminder:

**1st reminder — 18h the day before (configurable)**
- Fires at `horario_lembrete_1` (default 18:00)
- Sends to all sessions scheduled for the next day
- Message text includes session date/time and patient name

**2nd reminder — 7h the morning of (configurable)**
- Fires at `horario_lembrete_2` (default 07:00)
- Only sends to sessions not yet confirmed or cancelled
- **Early session rule:** if `session_time - 2h < horario_lembrete_2`, the 2nd reminder fires at `session_time - 2h` instead of the fixed time. Threshold: sessions before `horario_inicio + 2h` from `config_psicologo`.

**Deduplication:** if patient responded to the 1st reminder (any response), 2nd reminder is not sent.

### 2.3 WhatsApp Message Format

Text-based, no interactive buttons. The message lists response options:

```
📅 Lembrete de sessão
Olá [nome]! Sua sessão é [dia] às [hora].

Responda:
1 - Confirmar presença
2 - Não vou conseguir comparecer
3 - Cancelar sessão
```

Webhook parses incoming text:
- `sim` or `1` → `confirmada`
- `não`, `nao`, or `2` → `cancelada`
- `cancelar` or `3` → `cancelada` (works at any time, including after confirming)

All responses trigger an insert into `confirmacoes_whatsapp` with the appropriate `tipo` and `lida = false`, which fires the Realtime notification in the bell and updates the Kanban.

### 2.4 No Response After Last Reminder

When the checklist cron fires at `horario_checklist` and finds sessions from today still in `agendada` (no response to any reminder):

- Insert a row in `confirmacoes_whatsapp` with `tipo = 'alerta_sem_resposta'`, `lida = false`
- Realtime triggers `useNotificacoes` → bell badge appears
- Bell dropdown shows: "[Nome] não confirmou a sessão das [hora]"
- The session appears highlighted in `/checklist` with a "Não confirmou" badge

No automatic status change. The psychologist resolves it manually in the checklist.

### 2.5 Checklist Page Behavior

- Page always accessible at `/checklist`
- Shows all sessions from the current day that still have `agendada` or `confirmada` status
- Sessions without confirmation response show a "Não confirmou" badge
- For each session: buttons **Concluída · Faltou · Cancelada · Remarcada**
- If "Remarcada": opens date/time picker for the new slot
- When all sessions for the day have a final status, the page transitions to a **"Dia concluído"** summary state showing counts: X concluídas, X faltaram, X canceladas, X remarcadas. No redirect.

---

## 3. Data Model Changes

### `confirmacoes_whatsapp` — add `tipo` column

```sql
ALTER TABLE confirmacoes_whatsapp
  ADD COLUMN tipo text NOT NULL DEFAULT 'confirmacao'
  CHECK (tipo IN (
    'confirmacao',
    'cancelamento',
    'cancelamento_pos_confirmacao',
    'alerta_sem_resposta'
  ));
```

| tipo | When inserted |
|---|---|
| `confirmacao` | Patient replies sim/1 |
| `cancelamento` | Patient replies não/2 |
| `cancelamento_pos_confirmacao` | Patient replies cancelar/3 after previously confirming |
| `alerta_sem_resposta` | Checklist cron fires and session has no response |

### `config_psicologo` — add reminder time columns

```sql
ALTER TABLE config_psicologo
  ADD COLUMN horario_lembrete_1 time NOT NULL DEFAULT '18:00',
  ADD COLUMN horario_lembrete_2 time NOT NULL DEFAULT '07:00';
```

`horario_checklist` already exists — no change.

---

## 4. Hook Change — `useNotificacoes`

Remove the `.not('confirmado', 'is', null)` filter. Query all rows where `lida = false`, ordered by `mensagem_enviada_em` descending.

Bell dropdown renders different messages per `tipo`:
- `confirmacao` → "[Nome] confirmou a sessão" (green)
- `cancelamento` / `cancelamento_pos_confirmacao` → "[Nome] cancelou a sessão" (red)
- `alerta_sem_resposta` → "[Nome] não confirmou a sessão das [hora]" (amber)

---

## 5. Edge Functions

### `lembrete-whatsapp-1` (cron at `horario_lembrete_1`)
1. Fetch all sessions for tomorrow with `status = 'agendada'` or `'confirmada'`
2. For each: send WhatsApp message to `pacientes.telefone` (skip if null)
3. Insert row in `confirmacoes_whatsapp` with `mensagem_enviada_em = now()`

### `lembrete-whatsapp-2` (cron every 30min from 05:00 to 10:00)

Runs on a rolling window instead of a single fixed time. On each fire:

1. Fetch sessions for today where:
   - No response received yet (no `confirmacoes_whatsapp` row with `tipo IN ('confirmacao', 'cancelamento', 'cancelamento_pos_confirmacao')`)
   - `session_time - 2h` falls within `[now() - 30min, now()]` (early sessions, before 09:00), OR `session_time >= 09:00` AND current time is between `horario_lembrete_2` and `horario_lembrete_2 + 30min` (standard sessions, sent once at 07:00 window)
2. For each matching session: send WhatsApp and insert `confirmacoes_whatsapp` row

This means:
- Session at 07:00 → 2nd reminder sent at 05:00
- Session at 08:00 → 2nd reminder sent at 06:00
- Session at 09:00+ → 2nd reminder sent at 07:00 (standard window)

### `checklist-trigger` (cron at `horario_checklist`)
1. Fetch sessions from today still in `agendada` with no response to any reminder
2. For each: insert `confirmacoes_whatsapp` row with `tipo = 'alerta_sem_resposta'`, `lida = false`
3. Realtime propagates to frontend automatically

### `webhook-whatsapp` (existing, extended)
- Parse incoming message text
- Match against: `sim`/`1` → confirmacao; `não`/`nao`/`2` → cancelamento; `cancelar`/`3` → cancelamento or cancelamento_pos_confirmacao (check if session was previously `confirmada`)
- Update `sessoes.status` accordingly
- Insert `confirmacoes_whatsapp` row

---

## 6. Settings Page

Add to **Configurações → WhatsApp**:
- Horário do 1º lembrete (default 18:00)
- Horário do 2º lembrete (default 07:00)

Both fields editable, saved to `config_psicologo`.

---

## 7. Error Handling

| Situation | Behavior |
|---|---|
| Patient has no phone registered | Skip reminder silently, no error |
| WhatsApp offline when cron fires | Log failure, retry once after 5 min, then skip |
| Patient replies with unrecognized text | Ignore, no status change, no notification |
| Checklist cron fires but all sessions already resolved | No alerts inserted |
| Patient cancels a session that is already `cancelada` | Idempotent — no duplicate insert |
