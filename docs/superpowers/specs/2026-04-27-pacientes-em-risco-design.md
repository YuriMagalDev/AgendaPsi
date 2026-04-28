# Design Spec — Pacientes em Risco

**Date:** 2026-04-27  
**Status:** Draft  
**Project:** AgendaPsi

---

## 1. Overview

### Goals
- Detect patients showing abandonment patterns (missed sessions, consecutive cancellations, inactivity)
- Enable one-click personalized follow-up via WhatsApp with customizable templates
- Track follow-up outcomes and reconnection status
- Help psychologist re-engage at-risk patients before they formally cancel

### Out of Scope
- SMS fallback (WhatsApp-only for now)
- Email follow-ups
- Automatic follow-ups (all sends are manual, one-click)
- Patient portal notifications
- Multi-language templates (Portuguese pt-BR only)

---

## 2. Risk Detection Logic

### Risk Triggers (User-Configurable Thresholds)

All thresholds are configurable per psychologist in `/configuracoes` (Settings). Defaults provided.

#### Trigger A: Consecutive Cancellations/Reschedulings
- **Condition:** 2+ consecutive sessions with status `cancelada` or `remarcada` (regardless of patient or standalone)
- **Default:** 2 consecutive
- **User Setting:** `risco_min_cancelamentos_seguidos` (int, min=2, max=10)
- **Rationale:** Suggests patient is struggling to commit; pattern of avoidance

#### Trigger B: Inactivity (No Session in N Days)
- **Condition:** Patient has NO session (completed, scheduled, or confirmed) in the last N days
- **Default:** 30 days
- **User Setting:** `risco_dias_sem_sessao` (int, min=7, max=180)
- **Rationale:** Patient has gone silent; may have dropped off

#### Trigger C: Miss with No Follow-up
- **Condition:** Session marked `faltou` (missed) with NO other session (any status) scheduled within X days after the miss
- **Default:** 7 days
- **User Setting:** `risco_dias_apos_falta_sem_agendamento` (int, min=1, max=30)
- **Rationale:** Miss followed by silence suggests abandonment risk

### Risk Levels

Computed based on how many triggers fire:

| Level | Triggers Fired | Color | Label |
|-------|---|---|---|
| **Alto** | 2+ triggers | `--accent` (#C17F59) | "Alto risco" |
| **Médio** | 1 trigger | `--primary` (#2D6A6A) | "Médio risco" |

### Computation Strategy

**Real-time query on page load.** Not materialized. Rationale:
- Risk is dynamic (changes as sessions are created/updated)
- Patient list is typically < 200; risk query is fast (< 500ms)
- Cron materialization introduces stale data risk and complexity
- UI refresh on page open is acceptable UX

**Performance:** Index on `sessoes(paciente_id, status, data_hora)` + `sessoes(data_hora)` ensures sub-second retrieval.

---

## 3. Data Model

### Migration 021_pacientes_em_risco.sql

```sql
-- 021_pacientes_em_risco.sql
-- Multi-tenant: all tables include user_id FK for RLS isolation.

-- ─────────────────────────────────────────────
-- 1. Risk threshold configuration per user
-- ─────────────────────────────────────────────
create table risco_config (
  id                                    uuid primary key default uuid_generate_v4(),
  user_id                               uuid not null references auth.users(id) on delete cascade,
  min_cancelamentos_seguidos            int not null default 2 check (min_cancelamentos_seguidos >= 2 and min_cancelamentos_seguidos <= 10),
  dias_sem_sessao                       int not null default 30 check (dias_sem_sessao >= 7 and dias_sem_sessao <= 180),
  dias_apos_falta_sem_agendamento       int not null default 7 check (dias_apos_falta_sem_agendamento >= 1 and dias_apos_falta_sem_agendamento <= 30),
  criado_em                             timestamptz not null default now(),
  atualizado_em                         timestamptz not null default now(),
  
  constraint risco_config_user_unique unique (user_id)
);

alter table risco_config enable row level security;
create policy "users own their risk config" on risco_config
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_risco_config_user_id on risco_config(user_id);

-- ─────────────────────────────────────────────
-- 2. Follow-up message templates (customizable by user)
-- ─────────────────────────────────────────────
create table risco_templates (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  nome                 text not null,  -- e.g.: "Reconexão Padrão", "Paciência e Comprometimento"
  corpo                text not null,  -- template body; supports {{nome}}, {{dias_ausente}}, {{ultima_sessao}}
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  
  constraint risco_templates_nome_unico unique (user_id, nome)
);

alter table risco_templates enable row level security;
create policy "users manage their templates" on risco_templates
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_risco_templates_user_id on risco_templates(user_id);

-- Default templates (inserted per user at account creation via Edge Function)
-- See section 7 for insert logic.

-- ─────────────────────────────────────────────
-- 3. Follow-up send log (outcome tracking)
-- ─────────────────────────────────────────────
create table risco_followups (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  paciente_id             uuid not null references pacientes(id) on delete cascade,
  template_id             uuid not null references risco_templates(id) on delete restrict,
  mensagem_completa       text not null,  -- rendered text actually sent
  mensagem_enviada_em     timestamptz not null default now(),
  resposta_whatsapp       text,           -- raw reply from patient (if any)
  resposta_em             timestamptz,    -- when patient replied
  resultado               text check (resultado in ('enviada', 'respondida_sim', 'respondida_nao', 'reconectado')),
  sessao_agendada_apos    uuid references sessoes(id) on delete set null,  -- if patient rebooked, link to new session
  reconectado_em          timestamptz,    -- when we marked as reconectado
  
  constraint risco_followups_resultado_lógica check (
    (resultado = 'enviada' and resposta_whatsapp is null and sessao_agendada_apos is null) or
    (resultado = 'respondida_sim' and resposta_whatsapp is not null) or
    (resultado = 'respondida_nao' and resposta_whatsapp is not null) or
    (resultado = 'reconectado' and sessao_agendada_apos is not null)
  )
);

alter table risco_followups enable row level security;
create policy "users access own followups" on risco_followups
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index idx_risco_followups_user_id on risco_followups(user_id);
create index idx_risco_followups_paciente_id on risco_followups(paciente_id);
create index idx_risco_followups_criado on risco_followups(mensagem_enviada_em);
create index idx_risco_followups_resultado on risco_followups(resultado);

-- ─────────────────────────────────────────────
-- 4. Ensure sessoes has user_id for multi-tenant isolation (pre-existing from prior migrations)
-- ─────────────────────────────────────────────
-- verify: alter table sessoes add column if not exists user_id uuid references auth.users(id) on delete cascade;
-- verify: create index if not exists idx_sessoes_user_id on sessoes(user_id);

-- ─────────────────────────────────────────────
-- 5. Ensure pacientes has user_id for multi-tenant isolation (pre-existing from prior migrations)
-- ─────────────────────────────────────────────
-- verify: alter table pacientes add column if not exists user_id uuid references auth.users(id) on delete cascade;
-- verify: create index if not exists idx_pacientes_user_id on pacientes(user_id);
```

---

## 4. Types

### TypeScript Interfaces (src/types/risco.ts)

```typescript
// src/types/risco.ts

/**
 * Risk configuration per psychologist (user).
 */
export interface RiscoConfig {
  id: string
  user_id: string
  min_cancelamentos_seguidos: number
  dias_sem_sessao: number
  dias_apos_falta_sem_agendamento: number
  criado_em: string
  atualizado_em: string
}

/**
 * Customizable message template with variable placeholders.
 * Variables: {{nome}}, {{dias_ausente}}, {{ultima_sessao}}
 */
export interface RiscoTemplate {
  id: string
  user_id: string
  nome: string
  corpo: string
  ativo: boolean
  criado_em: string
  atualizado_em: string
}

/**
 * At-risk patient, with reason(s) they are flagged.
 */
export interface PacienteEmRisco {
  id: string
  nome: string
  telefone: string | null
  ultima_sessao_data_hora: string | null
  triggers: RiscoTrigger[]
  risk_level: 'Alto' | 'Médio'
  dias_sem_sessao: number | null
  cancelamentos_seguidos: number | null
  dias_apos_falta: number | null
}

/**
 * Individual risk trigger that fired.
 */
export interface RiscoTrigger {
  tipo: 'cancelamentos_seguidos' | 'inatividade' | 'falta_sem_agendamento'
  motivo: string // e.g., "2 cancelamentos seguidos", "35 dias sem sessão"
  dias?: number
  count?: number
}

/**
 * Follow-up message log entry.
 */
export interface RiscoFollowup {
  id: string
  user_id: string
  paciente_id: string
  template_id: string
  mensagem_completa: string
  mensagem_enviada_em: string
  resposta_whatsapp: string | null
  resposta_em: string | null
  resultado: 'enviada' | 'respondida_sim' | 'respondida_nao' | 'reconectado'
  sessao_agendada_apos: string | null
  reconectado_em: string | null
}

/**
 * Request body for send-followup Edge Function.
 */
export interface SendFollowupRequest {
  paciente_id: string
  template_id: string
  custom_message?: string  // if provided, use instead of template
}

/**
 * Response from send-followup Edge Function.
 */
export interface SendFollowupResponse {
  success: boolean
  followup_id?: string
  error?: string
  diagnostics?: Record<string, unknown>
}
```

---

## 5. Hooks

### usePacientesEmRisco (src/hooks/usePacientesEmRisco.ts)

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react'
import type { PacienteEmRisco, RiscoConfig } from '@/types/risco'

export function usePacientesEmRisco() {
  const supabase = useSupabaseClient()
  const user = useUser()
  const [pacientes, setPacientes] = useState<PacienteEmRisco[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch risk config for this user
      const { data: config, error: configError } = await supabase
        .from('risco_config')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (configError && configError.code !== 'PGRST116') throw configError
      if (!config) throw new Error('Configuração de risco não encontrada')

      // 2. Call RPC or raw query to compute at-risk patients
      const { data: riscoData, error: riscoError } = await supabase
        .rpc('get_pacientes_em_risco', {
          p_user_id: user.id,
          p_min_cancelamentos: config.min_cancelamentos_seguidos,
          p_dias_sem_sessao: config.dias_sem_sessao,
          p_dias_apos_falta: config.dias_apos_falta_sem_agendamento,
        })

      if (riscoError) throw riscoError

      setPacientes(riscoData || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pacientes em risco')
      console.error('[usePacientesEmRisco]', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, supabase])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { pacientes, loading, error, refetch: fetch }
}
```

### useRiscoTemplates (src/hooks/useRiscoTemplates.ts)

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react'
import type { RiscoTemplate } from '@/types/risco'

export function useRiscoTemplates() {
  const supabase = useSupabaseClient()
  const user = useUser()
  const [templates, setTemplates] = useState<RiscoTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: err } = await supabase
        .from('risco_templates')
        .select('*')
        .eq('user_id', user.id)
        .eq('ativo', true)
        .order('nome')

      if (err) throw err
      setTemplates(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar templates')
      console.error('[useRiscoTemplates]', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, supabase])

  const create = useCallback(async (nome: string, corpo: string) => {
    if (!user?.id) throw new Error('Usuário não autenticado')
    const { data, error: err } = await supabase
      .from('risco_templates')
      .insert({ user_id: user.id, nome, corpo })
      .select()
      .single()
    if (err) throw err
    return data
  }, [user?.id, supabase])

  const update = useCallback(async (templateId: string, updates: Partial<RiscoTemplate>) => {
    if (!user?.id) throw new Error('Usuário não autenticado')
    const { data, error: err } = await supabase
      .from('risco_templates')
      .update(updates)
      .eq('id', templateId)
      .eq('user_id', user.id)
      .select()
      .single()
    if (err) throw err
    return data
  }, [user?.id, supabase])

  const delete_ = useCallback(async (templateId: string) => {
    if (!user?.id) throw new Error('Usuário não autenticado')
    const { error: err } = await supabase
      .from('risco_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', user.id)
    if (err) throw err
  }, [user?.id, supabase])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { templates, loading, error, fetch, create, update, delete: delete_ }
}
```

### useRiscoConfig (src/hooks/useRiscoConfig.ts)

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react'
import type { RiscoConfig } from '@/types/risco'

export function useRiscoConfig() {
  const supabase = useSupabaseClient()
  const user = useUser()
  const [config, setConfig] = useState<RiscoConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: err } = await supabase
        .from('risco_config')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (err && err.code !== 'PGRST116') throw err
      if (!data) {
        // Create default config
        const { data: created, error: createErr } = await supabase
          .from('risco_config')
          .insert({
            user_id: user.id,
            min_cancelamentos_seguidos: 2,
            dias_sem_sessao: 30,
            dias_apos_falta_sem_agendamento: 7,
          })
          .select()
          .single()
        if (createErr) throw createErr
        setConfig(created)
      } else {
        setConfig(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar configuração')
      console.error('[useRiscoConfig]', err)
    } finally {
      setLoading(false)
    }
  }, [user?.id, supabase])

  const update = useCallback(async (updates: Partial<RiscoConfig>) => {
    if (!user?.id || !config?.id) throw new Error('Config not loaded')
    const { data, error: err } = await supabase
      .from('risco_config')
      .update(updates)
      .eq('id', config.id)
      .eq('user_id', user.id)
      .select()
      .single()
    if (err) throw err
    setConfig(data)
    return data
  }, [user?.id, config?.id, supabase])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { config, loading, error, update, refetch: fetch }
}
```

---

## 6. UI Changes

### New Route: `/pacientes/risco`

**Page: PacientesRiscoPage (src/pages/pacientes-risco.tsx)**

```
Header
├─ Title: "Pacientes em Risco"
├─ Subtitle: "Acompanhamento de pacientes com risco de abandono"
└─ Right: Button "Configurar Limiares"

Tabs
├─ "Listagem" (active by default)
│  ├─ Filter dropdown: "Todos" | "Alto Risco" | "Médio Risco" | "Sem Risco"
│  ├─ Sort dropdown: "Risco (alto→médio)" | "Última sessão (mais antiga)" | "Nome (A-Z)"
│  └─ Patient cards (grid or list)
│     Each card:
│     ├─ Left border: color by risk level (accent for Alto, primary for Médio)
│     ├─ Name (large)
│     ├─ Risk badge (Alto/Médio, color-coded)
│     ├─ Trigger reasons (bulleted list)
│     │  - "2 cancelamentos seguidos"
│     │  - "35 dias sem sessão"
│     │  - "Faltou há 12 dias (sem agendamento após)"
│     ├─ "Última sessão: 2026-03-20 às 14:00" or "Nenhuma sessão"
│     ├─ Phone indicator (WhatsApp icon if phone present, greyed if not)
│     └─ Button "Enviar mensagem"
│
└─ "Histórico" (tab)
   ├─ List of all follow-ups sent (paginated, 20/page)
   ├─ Each row:
   │  ├─ Patient name + date + time
   │  ├─ Status badge (enviada/respondida_sim/respondida_nao/reconectado)
   │  ├─ Preview of message sent (truncated, click to expand)
   │  └─ Actions: "Ver detalhes"
   └─ Filters: Date range, Status, Patient
```

**Send Modal: SendFollowupModal (src/components/pacientes/SendFollowupModal.tsx)**

```
Modal Title: "Enviar Mensagem de Acompanhamento"

Section 1: Patient Info
├─ Name (bold)
├─ Risk triggers (summary)
└─ Last session date

Section 2: Template Selection
├─ Dropdown: Select template
├─ Or: "Mensagem personalizada" checkbox
   └─ If checked, show textarea for custom message

Section 3: Message Preview
├─ Rendered message (with variables expanded: {{nome}}, {{dias_ausente}}, {{ultima_sessao}})
├─ Box with monospace font, light grey background
└─ Warning if no phone number

Section 4: Action Buttons
├─ "Cancelar" (left)
└─ "Enviar via WhatsApp" (right, primary button)
   - Disabled if no phone number
   - Loading state while sending

Validation
├─ If no WhatsApp connection: error toast + disable send
├─ If template empty: error toast
├─ If phone missing: error toast
```

**History Detail Modal: FollowupDetailModal (src/components/pacientes/FollowupDetailModal.tsx)**

```
Modal Title: "Detalhes do Acompanhamento"

Section 1: Summary
├─ Patient name + date sent (with time)
├─ Status badge (larger)
└─ Template used

Section 2: Message Sent
├─ Label: "Mensagem enviada"
├─ Full text in box, monospace, light grey

Section 3: Response (if any)
├─ Label: "Resposta recebida"
├─ Date/time response came in
├─ Response text
├─ Mark as "Reconectado" button (if status != reconectado)

Section 4: Outcome
├─ If reconectado: "Nova sessão agendada: 2026-05-15 às 14:00"
├─ Timeline: "Enviada em → Respondida em → Reconectada em"

Close Button
```

### Settings Section: RiscoConfigSection (src/components/configuracoes/RiscoConfigSection.tsx)

```
Card Title: "Pacientes em Risco — Configuração de Limiares"

Section 1: Risk Thresholds (Collapsible form)

Field 1: Cancelamentos Consecutivos
├─ Label: "Mínimo de cancelamentos/remarcações consecutivas para flagging"
├─ Input: number spinner (min=2, max=10)
├─ Default: 2
├─ Hint: "2+ cancelamentos seguidos indicam risco de abandono"

Field 2: Inatividade
├─ Label: "Dias sem nenhuma sessão (qualquer status)"
├─ Input: number spinner (min=7, max=180)
├─ Default: 30
├─ Hint: "Paciente em silêncio por N dias é sinal de risco"

Field 3: Falta sem Agendamento
├─ Label: "Dias após falta sem nova sessão agendada"
├─ Input: number spinner (min=1, max=30)
├─ Default: 7
├─ Hint: "Paciente faltou e não reagendou em X dias"

Save Button: "Salvar Configuração"

─────────────────────────────

Section 2: Message Templates (Collapsible form)

Subheader: "Templates de Mensagem Personalizáveis"
Hint: "Use {{nome}}, {{dias_ausente}}, {{ultima_sessao}} para variáveis"

Template List (scrollable, max 5 visible)
├─ Each template:
│  ├─ Template name (editable inline or in modal)
│  ├─ Template body preview (first 80 chars + "...")
│  ├─ Toggle: Ativo/Inativo
│  └─ Actions: Edit icon | Delete icon
│
└─ Add Template Button: "Criar novo template"

Edit Template Modal (reusable from send flow):
├─ Name field
├─ Body textarea (monospace font)
├─ Variables legend: {{nome}}, {{dias_ausente}}, {{ultima_sessao}}
├─ Live preview below (with mock data)
└─ Save/Cancel

─────────────────────────────

Section 3: WhatsApp Connection Status

├─ Status indicator:
│  ├─ Connected: "✓ Conectado" (green)
│  ├─ Not connected: "✗ Desconectado" (red, link to Settings > WhatsApp)
│  └─ Automation off: "⚠ Automação desativada" (yellow, explain in hint)
└─ Note: "Pacientes em Risco requer WhatsApp ativo para envio de mensagens"
```

---

## 7. Edge Function

### send-followup/index.ts (supabase/functions/send-followup/index.ts)

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizePhone } from '../_shared/phone.ts'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

interface SendFollowupPayload {
  paciente_id: string
  template_id: string
  custom_message?: string
  test?: boolean
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { paciente_id, template_id, custom_message, test } = await req.json() as SendFollowupPayload
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 1. Verify auth header exists and extract user_id
  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing authorization header' }), { status: 401, headers: corsHeaders })
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser(authHeader.split(' ')[1])
  if (userError || !user?.id) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const user_id = user.id
  const diag: Record<string, unknown> = { test: !!test }

  try {
    // 2. Fetch config
    const { data: config, error: configError } = await supabase
      .from('config_psicologo')
      .select('evolution_instance_name, evolution_token, whatsapp_conectado, automacao_whatsapp_ativa')
      .eq('user_id', user_id)
      .single()

    if (configError || !config?.whatsapp_conectado || !config.evolution_instance_name) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp não conectado. Reconecte nas configurações.' }),
        { status: 412, headers: corsHeaders }
      )
    }
    if (!test && !config.automacao_whatsapp_ativa) {
      return new Response(
        JSON.stringify({ error: 'Automação WhatsApp desativada' }),
        { status: 412, headers: corsHeaders }
      )
    }

    // 3. Fetch patient
    const { data: paciente, error: pacienteError } = await supabase
      .from('pacientes')
      .select('id, nome, telefone')
      .eq('id', paciente_id)
      .eq('user_id', user_id)
      .single()

    if (pacienteError || !paciente) {
      return new Response(
        JSON.stringify({ error: 'Paciente não encontrado' }),
        { status: 404, headers: corsHeaders }
      )
    }

    if (!paciente.telefone) {
      return new Response(
        JSON.stringify({ error: 'Paciente sem telefone cadastrado' }),
        { status: 422, headers: corsHeaders }
      )
    }

    // 4. Fetch and render template
    const template_body = custom_message
      ? custom_message
      : (() => {
          const { data: template, error: templateError } = await supabase
            .from('risco_templates')
            .select('corpo')
            .eq('id', template_id)
            .eq('user_id', user_id)
            .single()

          if (templateError || !template) throw new Error('Template não encontrado')
          return template.corpo
        })()

    // 5. Compute variables
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessoes')
      .select('data_hora, status')
      .eq('paciente_id', paciente_id)
      .order('data_hora', { ascending: false })
      .limit(1)

    if (sessionsError) throw sessionsError

    const ultima_sessao = sessions?.[0]?.data_hora
      ? new Date(sessions[0].data_hora).toLocaleDateString('pt-BR')
      : 'N/A'

    const dias_sem_sessao = ultima_sessao === 'N/A'
      ? 'muitos'
      : Math.floor((Date.now() - new Date(sessions[0].data_hora).getTime()) / (1000 * 60 * 60 * 24))

    const dias_ausente = dias_sem_sessao === 'muitos' ? 'muitos' : String(dias_sem_sessao)

    // 6. Render message
    const mensagem_completa = template_body
      .replace(/\{\{nome\}\}/g, paciente.nome)
      .replace(/\{\{dias_ausente\}\}/g, dias_ausente)
      .replace(/\{\{ultima_sessao\}\}/g, ultima_sessao)

    const phone = normalizePhone(paciente.telefone)
    const instance = config.evolution_instance_name

    diag.phone = phone
    diag.instance = instance

    // 7. Send via Evolution API
    const evolutionPayload = {
      number: phone,
      text: mensagem_completa,
    }

    const evolutionResp = await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${instance}`,
      {
        method: 'POST',
        headers: {
          'apikey': EVOLUTION_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(evolutionPayload),
      }
    )

    if (!evolutionResp.ok) {
      const respBody = await evolutionResp.text()
      diag.evolutionStatus = evolutionResp.status
      diag.evolutionBody = respBody
      throw new Error(`Evolution API failed: ${evolutionResp.status} — ${respBody}`)
    }

    // 8. Log to risco_followups
    const { data: followup, error: followupError } = await supabase
      .from('risco_followups')
      .insert({
        user_id,
        paciente_id,
        template_id,
        mensagem_completa,
        resultado: 'enviada',
      })
      .select()
      .single()

    if (followupError) throw followupError

    return new Response(
      JSON.stringify({
        success: true,
        followup_id: followup.id,
        diagnostics: diag,
      }),
      { headers: corsHeaders }
    )
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.error('[send-followup]', errorMsg, diag)
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMsg,
        diagnostics: diag,
      }),
      { status: 500, headers: corsHeaders }
    )
  }
})
```

---

## 8. Settings

### ConfiguracoesPage additions (src/pages/configuracoes.tsx)

Add new import and section:

```typescript
import { RiscoConfigSection } from '@/components/configuracoes/RiscoConfigSection'

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-8">
      {/* Existing sections */}
      <WhatsAppSection />
      <ModalidadesSection />
      <HorarioConfigSection />

      {/* NEW */}
      <RiscoConfigSection />
    </div>
  )
}
```

---

## 9. Error Handling

| Scenario | Response | User Sees |
|---|---|---|
| **WhatsApp not connected** | 412 Precondition Failed | Toast: "WhatsApp não conectado. Configure nas configurações." Link to Settings |
| **Patient has no phone** | 422 Unprocessable Entity | Toast: "Paciente sem telefone cadastrado. Atualize o cadastro." |
| **Template not found** | 404 Not Found | Toast: "Template não encontrado. Recarregue a página." |
| **Evolution API offline** | 502 Bad Gateway | Toast: "Falha ao enviar. Tente novamente em alguns segundos." + Retry button |
| **Invalid message variable** | 400 Bad Request | Client-side validation; show warning in preview |
| **Unauthorized (wrong user_id)** | 401 Unauthorized | Toast: "Sessão expirada. Faça login novamente." |
| **Database error on followup log** | 500 Internal Server Error | Toast: "Erro ao salvar histórico. Mensagem foi enviada; tente sincronizar." |

### Client-Side Validation

- If WhatsApp not connected: disable "Enviar mensagem" buttons and show banner at top of page
- If patient has no phone: disable send button on card, show tooltip "Sem telefone"
- Before submit: validate template is not empty, preview is properly rendered

### Toast Notifications

Use existing toast library (Recharts/shadcn Toast):
- Success: "Mensagem enviada!"
- Error: "Erro ao enviar: [error message]"
- Warning: "WhatsApp desconectado. Reconecte nas configurações."

---

## 10. Testing

### Unit Tests

**useRiscoConfig.test.ts**
- Fetch default config if none exists
- Update config thresholds
- Handle missing config gracefully

**useRiscoTemplates.test.ts**
- Fetch active templates
- Create new template with variables
- Update and delete templates
- Validate unique constraint on (user_id, nome)

**usePacientesEmRisco.test.ts**
- Fetch at-risk patients with correct triggers
- Correctly compute risk levels (Alto/Médio)
- Filter by risk level
- Sort by various criteria

### Integration Tests (via Edge Function)

**send-followup.test.ts** (in supabase/functions/send-followup/)
- Test with valid patient, template, and WhatsApp connected
- Test message variable substitution ({{nome}}, {{dias_ausente}}, {{ultima_sessao}})
- Test error cases: no phone, WhatsApp disconnected, Evolution offline
- Test logging to risco_followups table
- Test multi-tenant isolation (user_id filter)

### Manual Tests (QA Checklist)

Before release:
1. Create 3 test patients with different risk triggers
2. Configure custom risk thresholds in Settings
3. Verify at-risk patient detection on `/pacientes/risco`
4. Create custom template with variables; verify preview renders correctly
5. Send test message via WhatsApp; verify logged in database
6. Simulate WhatsApp offline; verify error toast
7. Simulate patient reply; verify outcome logged as "respondida_sim" or "respondida_nao"
8. Mark patient as "reconectado" after new session scheduled
9. Test permissions: logged-in user A cannot see user B's templates/followups (RLS)
10. Test mobile responsiveness of patient cards and modals

---

## 11. Rollout

### Phased Rollout

**Phase 1 (Day 1):** Deploy migration 021, Edge Function, and UI components
- No feature flag needed; all behind "Configurar Limiares" link on Pacientes page
- Default templates pre-populated via Edge Function seed function
- Risk thresholds initialized to sensible defaults

**Phase 2 (Week 1):** Monitoring
- Monitor Edge Function error logs (Evolution offline, phone normalization, etc.)
- Monitor RLS policies for data leakage
- Gather user feedback on threshold defaults

**Phase 3 (Week 2+):** Iterate
- Adjust default thresholds based on user feedback
- Add additional template pre-sets if needed
- Consider expansion to SMS if WhatsApp unavailable

### Database Seeding

Upon user account creation (in onboarding), Edge Function creates:
1. `risco_config` row with defaults (min_cancelamentos=2, dias_sem_sessao=30, etc.)
2. 3 default `risco_templates`:
   - "Reconexão Padrão": *"Oi {{nome}}, tudo bem? Notei que faz {{dias_ausente}} dias que não marcamos uma sessão. Gostaria de retomar nossos encontros? Estou à disposição!"*
   - "Acompanhamento Pós-Falta": *"Oi {{nome}}, percebi que você não compareceu à última sessão ({{ultima_sessao}}). Tudo bem? Posso ajudar em algo?"*
   - "Paciência e Comprometimento": *"{{nome}}, às vezes a vida fica corrida, mas estou aqui para você. Vamos retomar nossa jornada?"*

### Monitoring

Monitor in Supabase logs:
- `send-followup` Edge Function invocations (success/failure rates)
- `risco_followups` table growth (inserts per day)
- RLS violations (if any)
- Evolution API error codes

---

## Appendix A: Database Seeding Function

**Edge Function: onboarding-create-user-defaults/index.ts** (modification)

Add this to the function that runs after Supabase Auth user creation:

```typescript
// After creating config_psicologo row, also seed risk defaults:

await supabase
  .from('risco_config')
  .insert({
    user_id,
    min_cancelamentos_seguidos: 2,
    dias_sem_sessao: 30,
    dias_apos_falta_sem_agendamento: 7,
  })
  .single()

const defaultTemplates = [
  {
    user_id,
    nome: 'Reconexão Padrão',
    corpo: 'Oi {{nome}}, tudo bem? Notei que faz {{dias_ausente}} dias que não marcamos uma sessão. Gostaria de retomar nossos encontros? Estou à disposição!',
  },
  {
    user_id,
    nome: 'Acompanhamento Pós-Falta',
    corpo: 'Oi {{nome}}, percebi que você não compareceu à última sessão ({{ultima_sessao}}). Tudo bem? Posso ajudar em algo?',
  },
  {
    user_id,
    nome: 'Paciência e Comprometimento',
    corpo: '{{nome}}, às vezes a vida fica corrida, mas estou aqui para você. Vamos retomar nossa jornada?',
  },
]

await supabase
  .from('risco_templates')
  .insert(defaultTemplates)
```

---

## Appendix B: SQL Helper Functions

**RPC: get_pacientes_em_risco (plpgsql)**

Create in migration 021 or separate file:

```sql
create or replace function get_pacientes_em_risco(
  p_user_id uuid,
  p_min_cancelamentos int default 2,
  p_dias_sem_sessao int default 30,
  p_dias_apos_falta int default 7
)
returns table (
  id uuid,
  nome text,
  telefone text,
  ultima_sessao_data_hora timestamptz,
  risk_level text,
  cancelamentos_seguidos int,
  dias_sem_sessao int,
  dias_apos_falta int,
  triggers jsonb
) as $$
declare
  v_now timestamptz := now();
  v_cutoff_inatividade timestamptz := v_now - (p_dias_sem_sessao || ' days')::interval;
  v_cutoff_falta timestamptz := v_now - (p_dias_apos_falta || ' days')::interval;
begin
  return query
  with pacientes_user as (
    select id, nome, telefone
    from pacientes
    where user_id = p_user_id and ativo = true
  ),
  ultima_sessao_per_paciente as (
    select paciente_id, max(data_hora) as data_hora
    from sessoes
    where user_id = p_user_id
    group by paciente_id
  ),
  trigger_cancelamentos as (
    -- Find patients with 2+ consecutive cancellations/reschedulings
    select distinct s1.paciente_id
    from sessoes s1
    join sessoes s2 on s1.paciente_id = s2.paciente_id
    where s1.user_id = p_user_id
      and s2.user_id = p_user_id
      and s1.status in ('cancelada', 'remarcada')
      and s2.status in ('cancelada', 'remarcada')
      and s1.id < s2.id  -- s2 is after s1 chronologically
      and s2.data_hora > s1.data_hora
      and (s2.data_hora - s1.data_hora) < '30 days'::interval  -- within 30 days
  ),
  trigger_inatividade as (
    -- Find patients with no session in p_dias_sem_sessao days
    select pu.id as paciente_id
    from pacientes_user pu
    left join ultima_sessao_per_paciente usp on pu.id = usp.paciente_id
    where usp.data_hora is null or usp.data_hora < v_cutoff_inatividade
  ),
  trigger_falta as (
    -- Find patients with faltou + no follow-up session within p_dias_apos_falta days
    select distinct s1.paciente_id
    from sessoes s1
    left join sessoes s2 on s1.paciente_id = s2.paciente_id
      and s2.user_id = p_user_id
      and s2.data_hora > s1.data_hora
      and s2.data_hora <= s1.data_hora + (p_dias_apos_falta || ' days')::interval
    where s1.user_id = p_user_id
      and s1.status = 'faltou'
      and s2.id is null
  ),
  all_triggers as (
    select paciente_id, 'cancelamentos' as trigger_type from trigger_cancelamentos
    union all
    select paciente_id, 'inatividade' from trigger_inatividade
    union all
    select paciente_id, 'falta' from trigger_falta
  ),
  pacientes_com_triggers as (
    select pu.id, pu.nome, pu.telefone,
           usp.data_hora,
           count(at.trigger_type) as num_triggers,
           array_agg(at.trigger_type) as trigger_list
    from pacientes_user pu
    join all_triggers at on pu.id = at.paciente_id
    left join ultima_sessao_per_paciente usp on pu.id = usp.paciente_id
    group by pu.id, pu.nome, pu.telefone, usp.data_hora
  )
  select
    pct.id,
    pct.nome,
    pct.telefone,
    pct.data_hora,
    case when pct.num_triggers >= 2 then 'Alto' else 'Médio' end as risk_level,
    (select count(*) from trigger_cancelamentos tc where tc.paciente_id = pct.id)::int as cancelamentos_seguidos,
    case
      when pct.data_hora is null then (p_dias_sem_sessao + 30)::int
      else ((extract(epoch from (v_now - pct.data_hora)) / 86400)::int)
    end as dias_sem_sessao,
    null::int as dias_apos_falta,
    jsonb_build_array(
      case when 'cancelamentos' = any(pct.trigger_list) then jsonb_build_object('tipo', 'cancelamentos_seguidos', 'motivo', '2+ cancelamentos seguidos') else null end,
      case when 'inatividade' = any(pct.trigger_list) then jsonb_build_object('tipo', 'inatividade', 'motivo', (p_dias_sem_sessao || ' dias sem sessão')) else null end,
      case when 'falta' = any(pct.trigger_list) then jsonb_build_object('tipo', 'falta_sem_agendamento', 'motivo', ('Faltou há ' || ((extract(epoch from (v_now - pct.data_hora)) / 86400)::int) || ' dias (sem agendamento após)')) else null end
    ) - null::jsonb as triggers
  from pacientes_com_triggers pct
  order by pct.num_triggers desc, pct.data_hora asc nulls last;
end;
$$ language plpgsql stable;
```

---

## Summary of Changes

### New Tables
1. `risco_config` — thresholds per user
2. `risco_templates` — customizable message templates
3. `risco_followups` — log of all follow-ups sent

### New Route
- `/pacientes/risco` — at-risk patient management interface

### New Edge Function
- `send-followup` — WhatsApp send via Evolution API + logging

### New Hooks
- `usePacientesEmRisco` — fetch at-risk patients with risk reasons
- `useRiscoTemplates` — CRUD on templates
- `useRiscoConfig` — read/write risk thresholds

### New Settings Section
- `RiscoConfigSection` — configure thresholds and templates in `/configuracoes`

### RLS
- All new tables use `user_id` for multi-tenant isolation
- Standard policies: users access only their own data

### Performance
- Risk computed real-time on page load (not materialized)
- Indexes on key foreign keys and filter columns
- Estimated query time: < 500ms for 100+ patients
