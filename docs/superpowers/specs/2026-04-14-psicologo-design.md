# Design Spec — Management Platform for Psychologists

**Date:** 2026-04-14  
**Status:** Approved  
**Project:** Psicologo  

---

## 1. Overview

Web application for psychologists to manage scheduling, confirmations, and financials in an integrated way. Personal use (a single psychologist per installation). Built for the web with future migration to mobile via Capacitor.

### Goals
- Replace manual controls (spreadsheets, paper, manual WhatsApp) with a centralized platform
- Automate session reminders and confirmations via WhatsApp
- Give real financial visibility: revenue, defaults, revenue sharing, and projections
- End of day checklist to update session statuses in batch

### Out of scope
- Clinical records (session notes, diagnoses, medications)
- Multi-user / multi-clinic
- Patient portal (the patient does not access the app)

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript |
| Mobile (future) | Capacitor (packages the same React app) |
| Backend / DB | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| WhatsApp Automation | Evolution API (self-hosted on own VPS) |
| Styling | TailwindCSS |

### Architectural decisions
- The frontend talks directly to Supabase via SDK (`supabase-js`) for all CRUD operations
- Evolution API integration is exclusively server-side via Edge Functions — credentials are never exposed to the frontend
- Supabase Realtime updates the Kanban instantly when a confirmation arrives via WhatsApp
- When creating an account, an Edge Function automatically provisions an instance in Evolution API and stores the credentials in the database

---

## 3. Data Model

### `pacientes`
```
id               uuid PK
nome             text NOT NULL
telefone         text
email            text
data_nascimento  date
ativo            boolean DEFAULT true
criado_em        timestamptz DEFAULT now()
```

### `modalidades`
```
id        uuid PK
nome      text NOT NULL  -- e.g.: "In-person", "Online", "At-home"
ativo     boolean DEFAULT true
```

### `contratos`
Form of billing per patient. A patient can have one active contract at a time.
```
id               uuid PK
paciente_id      uuid FK → pacientes
tipo             enum('por_sessao', 'pacote', 'mensal')
valor            numeric NOT NULL
qtd_sessoes      int         -- only for 'pacote' type
dia_vencimento   int         -- only for 'mensal' type (day of the month)
ativo            boolean DEFAULT true
criado_em        timestamptz DEFAULT now()
```

### `sessoes`
Each scheduled appointment, whether with a registered or standalone patient.
```
id                uuid PK
paciente_id       uuid FK → pacientes  NULLABLE
avulso_nome       text                  -- filled when paciente_id is null
avulso_telefone   text                  -- optional for standalone (avulsos)
modalidade_id     uuid FK → modalidades
data_hora         timestamptz NOT NULL
status            enum('agendada', 'confirmada', 'concluida', 'faltou', 'cancelada', 'remarcada')
valor_cobrado     numeric
pago              boolean DEFAULT false
data_pagamento    date
remarcada_para    timestamptz           -- new date when status = 'remarcada'
sessao_origem_id  uuid FK → sessoes    -- tracks rescheduling history
criado_em         timestamptz DEFAULT now()
```

### `regras_repasse`
Global revenue sharing rules defined by the psychologist (e.g.: "always send 20% to the clinic").
```
id           uuid PK
nome         text NOT NULL   -- e.g.: "Clinic share"
tipo_valor   enum('percentual', 'fixo')
valor        numeric NOT NULL
ativo        boolean DEFAULT true
```

### `repasses`
Records generated per session from the rules above.
```
id                uuid PK
regra_repasse_id  uuid FK → regras_repasse
sessao_id         uuid FK → sessoes
valor_calculado   numeric NOT NULL  -- actual value calculated at the time of the session
pago              boolean DEFAULT false
data_pagamento    date
```

### `confirmacoes_whatsapp`
Reminder automation log.
```
id                    uuid PK
sessao_id             uuid FK → sessoes
mensagem_enviada_em   timestamptz
resposta              text
confirmado            boolean
```

### `config_psicologo`
Global account settings.
```
id                       uuid PK
nome                     text
horario_inicio           time
horario_fim              time
horario_checklist        time   -- e.g.: 18:00
automacao_whatsapp_ativa boolean DEFAULT false
evolution_instance_name  text   -- internally managed, never exposed to the frontend
evolution_token          text   -- internally managed, never exposed to the frontend
whatsapp_conectado       boolean DEFAULT false
```

---

## 4. Modules and Features

### 4.1 Authentication
- Login with email + password via Supabase Auth
- Persistent session
- Manually created account (no public registration)

### 4.2 Patients
- Registration: name, WhatsApp, email, birth date, default modality, billing contract
- Listing with search by name
- Profile: session history, total paid, absences, reschedulings
- Archive patient (without deleting history)

### 4.3 Schedule (two views)

**Kanban view by status:**
Columns: `To confirm` · `Confirmed` · `Completed` · `Missed` · `Canceled` · `Rescheduled`
Each card: patient name, time, modality, amount

**Schedule view by day:**
Chronological list of the selected day with the same cards

- Navigation between days in both views
- Creation of a standalone session or for a registered patient directly from the schedule
- Kanban updated in real-time via Supabase Realtime

### 4.4 Standalone Sessions (Avulsos)
- Session without registered patient: fills name + phone (optional) + amount + modality
- "Convert to patient" button on the standalone card
- When converting: opens pre-filled form; previous standalone sessions are linked to the new registration

### 4.5 End of Day Checklist
- Automatic trigger at configured time (default: 18:00)
- Displays all sessions of the day with status still in `agendada` or `confirmada`
- For each session: buttons **Completed · Missed · Canceled · Rescheduled**
- If "Rescheduled": opens new date/time selector
- Batch update upon completion

### 4.6 WhatsApp Automation (Evolution API) — optional
- **Check-in QR Code:** QR generated per patient; upon scanning, registers the number in the system
- **D-1 Reminder:** daily Edge Function cron sends message with yes/no button for each session of the next day
- **Reply Webhook:** Evolution API → Edge Function → updates status in database → Realtime reflects in Kanban
- When disabled: app works normally; confirmations are manual

### 4.7 Financials
- Monthly dashboard: total revenue, paid/pending sessions, defaults
- Details per patient: historical total, last session, pending balance
- Revenue sharing: amount owed per clinic/supervisor in the month (fixed or percentage)
- Projection: month estimation based on scheduled sessions

### 4.8 Settings
- Manage modalities (create, edit, archive)
- Configure end of day checklist time
- WhatsApp connection status + reconnect
- Psychologist data (name, working hours)

---

## 5. Onboarding (First Access)

3-step wizard upon account creation:

**Step 1 — Basic data**
Name, working hours, checklist time.

**Step 2 — Modalities**
Confirms "In-person" and "Online"; can add others.

**Step 3 — WhatsApp (optional)**
Presents a best practices warning before any configuration:

> "We recommend using a dedicated WhatsApp number for the office — not your personal number. This avoids mixing conversations with patients and protects your privacy. You will need a separate SIM card or virtual number."

Options:
- **Configure now:** app automatically provisions Evolution API instance → displays QR Code → confirms connection
- **Configure later:** skips to the app
- **Do not use automation:** disables (reversible in Settings)

The psychologist never sees the URL, token, or any technical data of the Evolution API.

---

## 6. Navigation

```
/login
/onboarding

/agenda          (default)
/kanban
/checklist

/pacientes
/pacientes/novo
/pacientes/:id

/financeiro
/financeiro/paciente/:id

/configuracoes
```

**Bottom navigation (mobile) / Sidebar (desktop):**
Schedule (Agenda) · Kanban · Patients · Financials · Settings

---

## 7. Error Handling

| Situation | Behavior |
|---|---|
| Evolution API offline | Discreet banner; app works normally without automation |
| Patient does not reply to reminder | Session stays in `a confirmar` (to confirm); appears highlighted in the checklist |
| Rescheduling | New session created with `sessao_origem_id`; history visible in profile |
| Session without contract | Allows standalone amount upon creation |
| Standalone without phone | WhatsApp reminder not sent; no error |

---

## 8. Testing

- Integration tests in Edge Functions (D-1 reminder, webhook, provisioning)
- Manual tests on main screens before each deploy
- No automated E2E in the initial phase

---

## 9. Infrastructure

- Own VPS running Evolution API (self-hosted)
- Supabase project (hosted)
- Frontend deploy: Vercel or Netlify
- Mobile (future): Capacitor packages the React build for iOS/Android
