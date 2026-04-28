# Design Spec — Régua de Cobrança WhatsApp

**Date:** 2026-04-27  
**Status:** Draft  
**Project:** AgendaPsi  

---

## 1. Overview

### Goals
- Automate payment reminders via WhatsApp with a configurable 3-step sequence (Régua de Cobrança)
- Allow psychologist to choose between **auto-send** (fire automatically based on schedule) or **approval queue** (review before sending each message)
- Stop reminders automatically when session is marked as paid (`sessao.pago = true`)
- Provide financial visibility: show unpaid sessions, track which reminders were sent, and their outcomes
- Integrate seamlessly with existing WhatsApp automation via Evolution API

### Out of scope
- SMS, email, or other channels (WhatsApp only for now)
- Payment processing/integration (Stripe, Pix, etc.) — only reminder trigger
- Behavioral analytics (which reminder step has highest payment rate)
- Multi-language templates (Portuguese only)

### Key decisions
1. **Three-step sequence**: Up to 3 reminders per session, each at a configurable day offset (e.g., day 1, day 3, day 7 after session completion)
2. **Template system**: Customizable message with variables `{{nome}}`, `{{valor}}`, `{{data_sessao}}`, `{{chave_pix}}`
3. **Chave PIX location**: Stored in `config_psicologo` (single shared PIX key for all patients)
4. **Mode toggle**: Psychologist picks auto-send vs. approval queue globally (not per-session)
5. **Stop condition**: Session marked `pago = true` stops the sequence mid-flow (remaining steps don't fire)
6. **Scope filter**: Only sessions with `valor_cobrado IS NOT NULL AND pago = false AND status IN ('concluida', 'faltou')`

---

## 2. Data Model

### New Table: `regras_cobranca`

Stores the template and schedule for each step of the payment reminder sequence.

```sql
-- supabase/migrations/019_regua_cobranca.sql

-- Table 1: Payment reminder sequence rules/templates
create table if not exists regras_cobranca (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  
  -- Step number in sequence (1, 2, or 3)
  etapa smallint not null check (etapa in (1, 2, 3)),
  
  -- Days after session completion to wait before sending
  -- E.g., etapa=1, dias_apos=1 means "1 day after session ends"
  dias_apos smallint not null check (dias_apos >= 0),
  
  -- Message template with variable placeholders
  -- Variables: {{nome}}, {{valor}}, {{data_sessao}}, {{chave_pix}}
  template_mensagem text not null,
  
  -- Whether this step is enabled (allows disabling step 2 or 3 without deleting)
  ativo boolean default true,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  unique (user_id, etapa)
) tablespace pg_default;

create index if not exists idx_regras_cobranca_user_id on regras_cobranca(user_id);

-- Trigger to auto-update updated_at
create or replace function regras_cobranca_update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists regras_cobranca_update_timestamp_trigger on regras_cobranca;
create trigger regras_cobranca_update_timestamp_trigger
before update on regras_cobranca
for each row
execute function regras_cobranca_update_timestamp();

-- RLS policy
alter table regras_cobranca enable row level security;
create policy "regras_cobranca_select_own" on regras_cobranca
  for select using (auth.uid() = user_id);
create policy "regras_cobranca_insert_own" on regras_cobranca
  for insert with check (auth.uid() = user_id);
create policy "regras_cobranca_update_own" on regras_cobranca
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "regras_cobranca_delete_own" on regras_cobranca
  for delete using (auth.uid() = user_id);
```

### New Table: `cobracas_enviadas`

Log of all sent payment reminder messages. Serves as the audit trail and enables retry/resend logic.

```sql
-- Table 2: Sent payment reminders log
create table if not exists cobracas_enviadas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sessao_id uuid not null references sessoes(id) on delete cascade,
  
  -- Which step in the sequence (1, 2, or 3)
  etapa smallint not null check (etapa in (1, 2, 3)),
  
  -- Status of the reminder attempt
  -- 'pendente' = waiting for approval (approval queue mode)
  -- 'agendado' = scheduled to send (auto mode)
  -- 'enviado' = successfully sent to Evolution API
  -- 'falha' = send attempt failed
  -- 'cancelado' = session paid before sending (or manually cancelled)
  status text not null default 'pendente' check (status in (
    'pendente', 'agendado', 'enviado', 'falha', 'cancelado'
  )),
  
  -- The rendered message text (for audit trail)
  mensagem_texto text not null,
  
  -- Timestamp when we attempted/scheduled to send
  data_agendado timestamptz not null default now(),
  
  -- Timestamp when actually sent (null if not sent yet)
  data_enviado timestamptz,
  
  -- Error message if status='falha'
  erro_detalhes text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now()
) tablespace pg_default;

create index if not exists idx_cobracas_enviadas_user_id on cobracas_enviadas(user_id);
create index if not exists idx_cobracas_enviadas_sessao_id on cobracas_enviadas(sessao_id);
create index if not exists idx_cobracas_enviadas_status on cobracas_enviadas(status);
create index if not exists idx_cobracas_enviadas_data_agendado on cobracas_enviadas(data_agendado);

-- Trigger to auto-update updated_at
create or replace function cobracas_enviadas_update_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists cobracas_enviadas_update_timestamp_trigger on cobracas_enviadas;
create trigger cobracas_enviadas_update_timestamp_trigger
before update on cobracas_enviadas
for each row
execute function cobracas_enviadas_update_timestamp();

-- RLS policy
alter table cobracas_enviadas enable row level security;
create policy "cobracas_enviadas_select_own" on cobracas_enviadas
  for select using (auth.uid() = user_id);
create policy "cobracas_enviadas_insert_own" on cobracas_enviadas
  for insert with check (auth.uid() = user_id);
create policy "cobracas_enviadas_update_own" on cobracas_enviadas
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cobracas_enviadas_delete_own" on cobracas_enviadas
  for delete using (auth.uid() = user_id);
```

### Modified Table: `config_psicologo`

```sql
-- Add new columns to config_psicologo
alter table config_psicologo
  add column if not exists chave_pix text,
  add column if not exists regua_cobranca_ativa boolean default false,
  add column if not exists regua_cobranca_modo text default 'manual' check (regua_cobranca_modo in ('auto', 'manual'));

-- Comment for clarity
comment on column config_psicologo.chave_pix is 'Psychologist PIX key for payment reminders (shared across all patients)';
comment on column config_psicologo.regua_cobranca_ativa is 'Whether payment reminder automation is enabled';
comment on column config_psicologo.regua_cobranca_modo is 'Sending mode: auto (automatic) or manual (approval queue)';
```

---

## 3. Types

Add to `src/lib/types.ts`:

```typescript
// ============ Régua de Cobrança Types ============

export type EtapaCobranca = 1 | 2 | 3

export type StatusCobranca = 'pendente' | 'agendado' | 'enviado' | 'falha' | 'cancelado'

export type ModoCobracaWhatsapp = 'auto' | 'manual'

export interface RegraCobranca {
  id: string
  user_id: string
  etapa: EtapaCobranca
  dias_apos: number
  template_mensagem: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface CobrancaEnviada {
  id: string
  user_id: string
  sessao_id: string
  etapa: EtapaCobranca
  status: StatusCobranca
  mensagem_texto: string
  data_agendado: string
  data_enviado: string | null
  erro_detalhes: string | null
  created_at: string
  updated_at: string
}

// Extended config type (update existing ConfigPsicologo)
export interface ConfigPsicologo {
  id: string
  nome: string | null
  horario_inicio: string | null
  horario_fim: string | null
  horario_checklist: string | null
  horario_lembrete_1: string | null
  horario_lembrete_2: string | null
  automacao_whatsapp_ativa: boolean
  evolution_instance_name: string | null
  evolution_token: string | null
  whatsapp_conectado: boolean
  user_id: string | null
  // New fields for Régua de Cobrança
  chave_pix: string | null
  regua_cobranca_ativa: boolean
  regua_cobranca_modo: ModoCobracaWhatsapp
}

// DTO for sending a payment reminder via edge function
export interface CobrancaWhatsappRequest {
  sessao_id: string
  etapa: EtapaCobranca
  test?: boolean  // for testing connection before approval
}

export interface CobrancaWhatsappResponse {
  ok?: boolean
  cobranca_id?: string
  skipped?: string
  error?: string
  [key: string]: any
}

// View type with related session + patient data
export interface CobrancaEnviadaView extends CobrancaEnviada {
  sessoes: {
    data_hora: string
    valor_cobrado: number | null
    pago: boolean
    status: SessaoStatus
    paciente_id: string | null
    avulso_nome: string | null
    pacientes: { nome: string } | null
  } | null
}

// Type for unpaid sessions eligible for payment reminders
export interface SessaoParaCobranca {
  id: string
  data_hora: string
  valor_cobrado: number
  pago: boolean
  status: SessaoStatus
  paciente_id: string | null
  avulso_nome: string | null
  avulso_telefone: string | null
  pacientes: { nome: string; telefone: string | null } | null
  // Which steps are pending (not yet sent)
  etapas_pendentes?: EtapaCobranca[]
}
```

---

## 4. Hooks

### `useReguaCobranca`

New hook in `src/hooks/useReguaCobranca.ts`:

```typescript
import { useEffect, useState } from 'react'
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react'
import { RegraCobranca, CobrancaEnviada, CobrancaEnviadaView, SessaoParaCobranca } from '../lib/types'

export function useReguaCobranca() {
  const supabase = useSupabaseClient()
  const user = useUser()
  
  const [regras, setRegras] = useState<RegraCobranca[]>([])
  const [cobracasEnviadas, setCobracasEnviadas] = useState<CobrancaEnviadaView[]>([])
  const [sessoesParaCobranca, setSessoesParaCobranca] = useState<SessaoParaCobranca[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch all payment reminder rules
  const fetchRegras = async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('regras_cobranca')
        .select('*')
        .order('etapa', { ascending: true })
      if (err) throw err
      setRegras(data ?? [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // Fetch sent payment reminders with related session data
  const fetchCobracasEnviadas = async (filters?: {
    sessao_id?: string
    status?: string
    dias?: number  // e.g., "last 7 days"
  }) => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      let query = supabase
        .from('cobracas_enviadas')
        .select(`
          *,
          sessoes!inner(
            id,
            data_hora,
            valor_cobrado,
            pago,
            status,
            paciente_id,
            avulso_nome,
            avulso_telefone,
            pacientes(nome, telefone)
          )
        `)

      if (filters?.sessao_id) {
        query = query.eq('sessao_id', filters.sessao_id)
      }
      if (filters?.status) {
        query = query.eq('status', filters.status)
      }
      if (filters?.dias) {
        const sinceDate = new Date(Date.now() - filters.dias * 24 * 3600 * 1000).toISOString()
        query = query.gte('data_agendado', sinceDate)
      }

      const { data, error: err } = await query.order('data_agendado', { ascending: false })
      if (err) throw err
      setCobracasEnviadas(data ?? [])
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // Fetch unpaid sessions (concluida or faltou) with valor_cobrado set
  const fetchSessoesParaCobranca = async () => {
    if (!user?.id) return
    setLoading(true)
    setError(null)
    try {
      const { data: sessoes, error: err } = await supabase
        .from('sessoes')
        .select(`
          id,
          data_hora,
          valor_cobrado,
          pago,
          status,
          paciente_id,
          avulso_nome,
          avulso_telefone,
          pacientes(nome, telefone),
          cobracas_enviadas!left(etapa, status)
        `)
        .in('status', ['concluida', 'faltou'])
        .eq('pago', false)
        .not('valor_cobrado', 'is', null)
        .order('data_hora', { ascending: false })

      if (err) throw err

      // Enrich with etapas_pendentes
      const enriched: SessaoParaCobranca[] = (sessoes ?? []).map((s: any) => {
        const sendAttempts = (s.cobracas_enviadas ?? [])
          .filter((c: any) => c.status !== 'cancelado')
          .map((c: any) => c.etapa)
        const etapas_pendentes = ([1, 2, 3] as const).filter(
          (e) => !sendAttempts.includes(e)
        )
        return { ...s, etapas_pendentes }
      })

      setSessoesParaCobranca(enriched)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // Create or update a rule
  const salvarRegra = async (etapa: number, template: string, dias: number, ativo: boolean) => {
    if (!user?.id) return
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('regras_cobranca')
        .upsert(
          { etapa, template_mensagem: template, dias_apos: dias, ativo, user_id: user.id },
          { onConflict: 'user_id,etapa' }
        )
        .select()
        .single()

      if (err) throw err
      await fetchRegras()
      return data
    } catch (e) {
      setError(String(e))
      throw e
    }
  }

  // Delete a rule (soft-delete by setting ativo=false is preferred, but this allows hard delete)
  const deletarRegra = async (etapa: number) => {
    setError(null)
    try {
      const { error: err } = await supabase
        .from('regras_cobranca')
        .delete()
        .eq('etapa', etapa)

      if (err) throw err
      await fetchRegras()
    } catch (e) {
      setError(String(e))
      throw e
    }
  }

  // Approve and send a pending cobranca
  const aprovarEEnviar = async (cobrancaId: string) => {
    setError(null)
    try {
      const response = await fetch('/api/functions/cobranca-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cobranca_id: cobrancaId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Falha ao enviar cobrança')
      }

      const result = await response.json()
      await fetchCobracasEnviadas()
      return result
    } catch (e) {
      setError(String(e))
      throw e
    }
  }

  // Cancel a pending cobranca (mark as 'cancelado')
  const cancelarCobranca = async (cobrancaId: string) => {
    setError(null)
    try {
      const { error: err } = await supabase
        .from('cobracas_enviadas')
        .update({ status: 'cancelado' })
        .eq('id', cobrancaId)

      if (err) throw err
      await fetchCobracasEnviadas()
    } catch (e) {
      setError(String(e))
      throw e
    }
  }

  // Resend a failed cobranca
  const reenviriarFalha = async (cobrancaId: string) => {
    setError(null)
    try {
      const response = await fetch('/api/functions/cobranca-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cobranca_id: cobrancaId, retry: true }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Falha ao reenviar')
      }

      const result = await response.json()
      await fetchCobracasEnviadas()
      return result
    } catch (e) {
      setError(String(e))
      throw e
    }
  }

  return {
    regras,
    cobracasEnviadas,
    sessoesParaCobranca,
    loading,
    error,
    fetchRegras,
    fetchCobracasEnviadas,
    fetchSessoesParaCobranca,
    salvarRegra,
    deletarRegra,
    aprovarEEnviar,
    cancelarCobranca,
    reenviriarFalha,
  }
}
```

---

## 5. UI Changes

### 5.1 Settings Page: Payment Reminder Configuration

**File:** `src/pages/ConfiguracoesPage.tsx`

Add a new section **"Régua de Cobrança"** after the WhatsApp section:

```tsx
// In ConfiguracoesPage.tsx, add this section:

<section className="mb-8 p-6 bg-surface rounded-lg shadow-sm border border-border">
  <h3 className="text-xl font-fraunces font-bold text-text mb-4">Régua de Cobrança</h3>
  
  <div className="mb-6">
    <label className="block text-sm font-dm-sans text-text mb-2">
      Ativar Régua de Cobrança WhatsApp
    </label>
    <Toggle
      checked={configPsicologo.regua_cobranca_ativa}
      onChange={(checked) => updateConfig({ regua_cobranca_ativa: checked })}
    />
    <p className="text-xs text-muted mt-1">
      Ativa lembretes automáticos de pagamento para sessões não pagas
    </p>
  </div>

  {configPsicologo.regua_cobranca_ativa && (
    <>
      {/* PIX Key Section */}
      <div className="mb-6">
        <label className="block text-sm font-dm-sans text-text font-semibold mb-2">
          Chave PIX
        </label>
        <input
          type="text"
          placeholder="Insira sua chave PIX (email, CPF, telefone ou aleatória)"
          value={configPsicologo.chave_pix ?? ''}
          onChange={(e) => updateConfig({ chave_pix: e.target.value })}
          className="w-full px-4 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-muted mt-1">
          Será incluída em cada mensagem de cobrança
        </p>
      </div>

      {/* Mode Selection */}
      <div className="mb-6">
        <label className="block text-sm font-dm-sans text-text font-semibold mb-2">
          Modo de Envio
        </label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="modo_cobranca"
              value="auto"
              checked={configPsicologo.regua_cobranca_modo === 'auto'}
              onChange={(e) => updateConfig({ regua_cobranca_modo: e.target.value as ModoCobracaWhatsapp })}
              className="mr-2"
            />
            <span className="text-sm text-text">Automático</span>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="modo_cobranca"
              value="manual"
              checked={configPsicologo.regua_cobranca_modo === 'manual'}
              onChange={(e) => updateConfig({ regua_cobranca_modo: e.target.value as ModoCobracaWhatsapp })}
              className="mr-2"
            />
            <span className="text-sm text-text">Fila de Aprovação</span>
          </label>
        </div>
        <p className="text-xs text-muted mt-1">
          {configPsicologo.regua_cobranca_modo === 'auto'
            ? 'Mensagens serão enviadas automaticamente no dia/hora configurado'
            : 'Você receberá uma notificação para revisar e aprovar cada mensagem'}
        </p>
      </div>

      {/* Templates Section */}
      <div className="mb-6">
        <h4 className="text-sm font-dm-sans text-text font-semibold mb-4">Modelos de Mensagem</h4>
        <p className="text-xs text-muted mb-4">
          Use as variáveis: <code className="bg-bg px-1 rounded">{"{{nome}}"}</code>,{' '}
          <code className="bg-bg px-1 rounded">{"{{valor}}"}</code>,{' '}
          <code className="bg-bg px-1 rounded">{"{{data_sessao}}"}</code>,{' '}
          <code className="bg-bg px-1 rounded">{"{{chave_pix}}"}</code>
        </p>

        <div className="space-y-4">
          {[1, 2, 3].map((etapa) => (
            <ReguaCobrancaTemplateEditor
              key={etapa}
              etapa={etapa as EtapaCobranca}
              regra={regras.find((r) => r.etapa === etapa)}
              onSave={(template, dias, ativo) => salvarRegra(etapa, template, dias, ativo)}
              onDelete={() => deletarRegra(etapa)}
            />
          ))}
        </div>
      </div>
    </>
  )}
</section>
```

### 5.2 New Component: `ReguaCobrancaTemplateEditor`

**File:** `src/components/regua-cobranca/ReguaCobrancaTemplateEditor.tsx`

```tsx
import { useState } from 'react'
import { EtapaCobranca, RegraCobranca } from '../../lib/types'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'

interface Props {
  etapa: EtapaCobranca
  regra?: RegraCobranca
  onSave: (template: string, dias: number, ativo: boolean) => Promise<void>
  onDelete: () => Promise<void>
}

export function ReguaCobrancaTemplateEditor({ etapa, regra, onSave, onDelete }: Props) {
  const [template, setTemplate] = useState(regra?.template_mensagem ?? '')
  const [dias, setDias] = useState(regra?.dias_apos ?? 0)
  const [ativo, setAtivo] = useState(regra?.ativo ?? true)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(template, dias, ativo)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Deseja deletar este modelo? Esta ação não pode ser desfeita.')) return
    await onDelete()
  }

  return (
    <div className="p-4 border border-border rounded-lg bg-bg">
      <div className="flex items-center justify-between mb-4">
        <h5 className="font-semibold text-text">
          Etapa {etapa}
          {regra && <span className="text-xs text-muted ml-2">({regra.dias_apos} dias)</span>}
        </h5>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-xs text-muted">Ativo</span>
        </label>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-semibold text-text mb-1">
          Enviar após (dias)
        </label>
        <Input
          type="number"
          min="0"
          value={dias}
          onChange={(e) => setDias(parseInt(e.target.value) || 0)}
          className="w-full"
        />
      </div>

      <div className="mb-4">
        <label className="block text-xs font-semibold text-text mb-1">
          Mensagem
        </label>
        <Textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder={`Olá {{nome}},\n\nSua sessão de {{data_sessao}} teve o valor de R$ {{valor}}.\n\nChave PIX: {{chave_pix}}\n\nObrigada!`}
          rows={4}
          className="w-full text-xs"
        />
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-primary text-white"
        >
          {saving ? 'Salvando...' : 'Salvar'}
        </Button>
        {regra && (
          <Button
            onClick={handleDelete}
            variant="destructive"
            className="flex-1"
          >
            Deletar
          </Button>
        )}
      </div>
    </div>
  )
}
```

### 5.3 New Page: `CobrancaPage`

**File:** `src/pages/CobrancaPage.tsx`

A dedicated page to view unpaid sessions and manage the payment reminder queue.

```tsx
import { useEffect, useState } from 'react'
import { useReguaCobranca } from '../hooks/useReguaCobranca'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { formatDate, formatCurrency } from '../lib/utils'
import { SessaoParaCobranca, StatusCobranca } from '../lib/types'

export function CobrancaPage() {
  const {
    sessoesParaCobranca,
    cobracasEnviadas,
    loading,
    error,
    fetchSessoesParaCobranca,
    fetchCobracasEnviadas,
    aprovarEEnviar,
    cancelarCobranca,
    reenviriarFalha,
  } = useReguaCobranca()

  const [view, setView] = useState<'sessoes' | 'historico'>('sessoes')
  const [expandedSession, setExpandedSession] = useState<string | null>(null)

  useEffect(() => {
    fetchSessoesParaCobranca()
    fetchCobracasEnviadas()
  }, [])

  if (loading) return <div className="p-6">Carregando...</div>
  if (error) return <div className="p-6 text-red-600">Erro: {error}</div>

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-fraunces font-bold text-text mb-2">Cobrança WhatsApp</h1>
      <p className="text-muted text-sm mb-6">Gerenciar lembretes de pagamento e fila de aprovação</p>

      {/* Tab Navigation */}
      <div className="flex gap-4 mb-6 border-b border-border">
        <button
          onClick={() => setView('sessoes')}
          className={`pb-2 px-2 font-semibold text-sm ${
            view === 'sessoes' ? 'text-primary border-b-2 border-primary' : 'text-muted'
          }`}
        >
          Sessões Não Pagas ({sessoesParaCobranca.length})
        </button>
        <button
          onClick={() => setView('historico')}
          className={`pb-2 px-2 font-semibold text-sm ${
            view === 'historico' ? 'text-primary border-b-2 border-primary' : 'text-muted'
          }`}
        >
          Histórico de Envios ({cobracasEnviadas.length})
        </button>
      </div>

      {view === 'sessoes' && (
        <div className="space-y-4">
          {sessoesParaCobranca.length === 0 ? (
            <div className="p-6 bg-bg rounded-lg text-center text-muted">
              Nenhuma sessão com pagamento pendente
            </div>
          ) : (
            sessoesParaCobranca.map((sessao) => (
              <SessaoCobrancaCard
                key={sessao.id}
                sessao={sessao}
                expanded={expandedSession === sessao.id}
                onToggle={() => setExpandedSession(expandedSession === sessao.id ? null : sessao.id)}
                onApprove={aprovarEEnviar}
                onCancel={cancelarCobranca}
              />
            ))
          )}
        </div>
      )}

      {view === 'historico' && (
        <div className="space-y-4">
          {cobracasEnviadas.length === 0 ? (
            <div className="p-6 bg-bg rounded-lg text-center text-muted">
              Nenhum envio registrado
            </div>
          ) : (
            cobracasEnviadas.map((cobranca) => (
              <CobrancaHistoricoCard
                key={cobranca.id}
                cobranca={cobranca}
                onRetry={() => reenviriarFalha(cobranca.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

interface SessaoCobrancaCardProps {
  sessao: SessaoParaCobranca
  expanded: boolean
  onToggle: () => void
  onApprove: (cobrancaId: string) => Promise<void>
  onCancel: (cobrancaId: string) => Promise<void>
}

function SessaoCobrancaCard({
  sessao,
  expanded,
  onToggle,
  onApprove,
  onCancel,
}: SessaoCobrancaCardProps) {
  const [approving, setApproving] = useState(false)
  const pacienteName = sessao.pacientes?.nome ?? sessao.avulso_nome ?? 'Paciente'

  return (
    <div className="p-4 bg-surface border border-border rounded-lg">
      <div
        className="cursor-pointer flex justify-between items-center"
        onClick={onToggle}
      >
        <div>
          <h3 className="font-semibold text-text">{pacienteName}</h3>
          <p className="text-xs text-muted">
            {formatDate(sessao.data_hora)} • {formatCurrency(sessao.valor_cobrado)}
          </p>
        </div>
        <Badge variant={sessao.etapas_pendentes?.length ? 'warning' : 'default'}>
          {sessao.etapas_pendentes?.length ?? 0} etapas pendentes
        </Badge>
      </div>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted mb-3">Status da sessão: {sessao.status}</p>
          {/* Show pending steps with action buttons */}
          {sessao.etapas_pendentes?.map((etapa) => (
            <div key={etapa} className="p-3 bg-bg rounded mb-2 flex justify-between items-center">
              <span className="text-sm font-semibold">Etapa {etapa}</span>
              <Button
                onClick={() => onApprove(sessao.id)}
                disabled={approving}
                className="bg-primary text-white text-xs"
              >
                {approving ? 'Enviando...' : 'Enviar Agora'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface CobrancaHistoricoCardProps {
  cobranca: any
  onRetry: () => Promise<void>
}

function CobrancaHistoricoCard({ cobranca, onRetry }: CobrancaHistoricoCardProps) {
  const [retrying, setRetrying] = useState(false)
  const statusColors: Record<StatusCobranca, string> = {
    pendente: 'bg-yellow-100 text-yellow-800',
    agendado: 'bg-blue-100 text-blue-800',
    enviado: 'bg-green-100 text-green-800',
    falha: 'bg-red-100 text-red-800',
    cancelado: 'bg-gray-100 text-gray-800',
  }

  return (
    <div className="p-4 bg-surface border border-border rounded-lg">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-text">
            {cobranca.sessoes?.pacientes?.nome ?? cobranca.sessoes?.avulso_nome ?? 'Paciente'}
          </h3>
          <p className="text-xs text-muted mt-1">
            Etapa {cobranca.etapa} • {formatDate(cobranca.data_agendado)}
          </p>
          {cobranca.data_enviado && (
            <p className="text-xs text-muted">
              Enviado: {formatDate(cobranca.data_enviado)}
            </p>
          )}
        </div>
        <Badge className={statusColors[cobranca.status]}>
          {cobranca.status}
        </Badge>
      </div>

      {cobranca.erro_detalhes && (
        <div className="mt-3 p-2 bg-red-50 rounded text-xs text-red-700">
          {cobranca.erro_detalhes}
        </div>
      )}

      {cobranca.status === 'falha' && (
        <Button
          onClick={() => {
            setRetrying(true)
            onRetry().finally(() => setRetrying(false))
          }}
          disabled={retrying}
          className="mt-3 bg-primary text-white text-xs"
        >
          {retrying ? 'Reenviando...' : 'Tentar Novamente'}
        </Button>
      )}
    </div>
  )
}
```

### 5.4 Add Route

Update `src/router.tsx` to include the new page:

```tsx
import { CobrancaPage } from './pages/CobrancaPage'

// In the routes array:
{
  path: '/cobranca',
  element: <CobrancaPage />,
}
```

### 5.5 Navigation Update

Update `src/components/layout/Sidebar.tsx` or `BottomNav.tsx` to add a link to `/cobranca`:

```tsx
<Link to="/cobranca" className="...">
  <span className="icon">💰</span>
  <span>Cobrança</span>
</Link>
```

---

## 6. Edge Functions

### 6.1 New Function: `cobranca-whatsapp`

**File:** `supabase/functions/cobranca-whatsapp/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { cobranca_id, retry, test } = await req.json() as {
    cobranca_id: string
    retry?: boolean
    test?: boolean
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  try {
    // 1. Fetch the cobranca record
    const { data: cobranca, error: cobrancaError } = await supabase
      .from('cobracas_enviadas')
      .select('id, user_id, sessao_id, etapa, status, mensagem_texto')
      .eq('id', cobranca_id)
      .single()

    if (cobrancaError || !cobranca) {
      return new Response(
        JSON.stringify({ error: 'Cobrança não encontrada' }),
        { status: 404, headers: corsHeaders }
      )
    }

    // 2. Fetch user config (must filter by user_id for multi-tenant)
    const { data: config, error: configError } = await supabase
      .from('config_psicologo')
      .select('whatsapp_conectado, evolution_instance_name, evolution_token')
      .eq('user_id', cobranca.user_id)
      .single()

    if (configError || !config?.whatsapp_conectado || !config?.evolution_instance_name) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp não conectado' }),
        { status: 412, headers: corsHeaders }
      )
    }

    // 3. Fetch session with patient phone
    const { data: sessao, error: sessaoError } = await supabase
      .from('sessoes')
      .select('id, paciente_id, avulso_telefone, pacientes(telefone)')
      .eq('id', cobranca.sessao_id)
      .single()

    if (sessaoError || !sessao) {
      return new Response(
        JSON.stringify({ error: 'Sessão não encontrada' }),
        { status: 404, headers: corsHeaders }
      )
    }

    const telefoneRaw = (sessao.pacientes as any)?.telefone ?? sessao.avulso_telefone
    if (!telefoneRaw) {
      const err = 'Sem telefone cadastrado para este paciente'
      await supabase
        .from('cobracas_enviadas')
        .update({ status: 'falha', erro_detalhes: err })
        .eq('id', cobranca_id)
      return new Response(
        JSON.stringify({ error: err }),
        { status: 422, headers: corsHeaders }
      )
    }

    // 4. Normalize phone (same pattern as send-lembrete)
    const normalizePhone = (phone: string): string => {
      const digits = phone.replace(/\D/g, '')
      if (digits.length === 11) return '55' + digits
      if (digits.length === 12) return '55' + digits.slice(1)
      if (digits.startsWith('55')) return digits
      return '55' + digits.slice(-11)
    }

    const phone = normalizePhone(telefoneRaw)
    const instance = config.evolution_instance_name
    const mensagem = cobranca.mensagem_texto
    const diag: Record<string, unknown> = {
      test: !!test,
      telefoneRaw,
      phoneNormalized: phone,
      instance,
    }

    // 5. In test mode: verify Evolution connection
    if (test) {
      try {
        const stateResp = await fetch(
          `${EVOLUTION_API_URL}/instance/connectionState/${instance}`,
          { headers: { 'apikey': EVOLUTION_API_KEY } }
        )
        const stateBody = await stateResp.text()
        diag.connectionStateStatus = stateResp.status
        diag.connectionStateBody = stateBody
        console.log(`[test] cobranca connectionState [${stateResp.status}]: ${stateBody}`)

        if (!stateResp.ok) {
          return new Response(
            JSON.stringify({ error: 'Instância não responde', ...diag }),
            { status: 502, headers: corsHeaders }
          )
        }

        const parsed = JSON.parse(stateBody)
        if (parsed?.instance?.state !== 'open') {
          return new Response(
            JSON.stringify({
              error: `Instância não está conectada (state=${parsed?.instance?.state})`,
              ...diag,
            }),
            { status: 412, headers: corsHeaders }
          )
        }
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Falha ao verificar conexão', detail: String(e), ...diag }),
          { status: 502, headers: corsHeaders }
        )
      }
    }

    // 6. Send message via Evolution API
    const evoResp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, text: mensagem }),
    })

    const evoBody = await evoResp.text()
    diag.sendStatus = evoResp.status
    diag.sendBody = evoBody
    console.log(`Evolution cobranca send [${evoResp.status}] phone=${phone} instance=${instance}: ${evoBody}`)

    if (!evoResp.ok) {
      // Mark as failed in database
      const errorMsg = `Evolution API failed (${evoResp.status}): ${evoBody}`
      await supabase
        .from('cobracas_enviadas')
        .update({ status: 'falha', erro_detalhes: errorMsg })
        .eq('id', cobranca_id)

      return new Response(
        JSON.stringify({ error: 'Evolution API falhou', ...diag }),
        { status: 502, headers: corsHeaders }
      )
    }

    // 7. Mark as sent in database
    const { error: updateError } = await supabase
      .from('cobracas_enviadas')
      .update({
        status: 'enviado',
        data_enviado: new Date().toISOString(),
        erro_detalhes: null,
      })
      .eq('id', cobranca_id)

    if (updateError) {
      console.error('Erro ao atualizar status de cobrança:', updateError)
    }

    return new Response(
      JSON.stringify({ ok: true, cobranca_id, ...diag }),
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Unexpected error in cobranca-whatsapp:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(error) }),
      { status: 500, headers: corsHeaders }
    )
  }
})
```

---

## 7. Cron / Trigger

### 7.1 Extend `cron-lembretes` or Create New Cron

We will extend the existing `cron-lembretes` function to also process payment reminder scheduling.

**File:** `supabase/functions/cron-cobrancas/index.ts` (new cron for payment reminders)

This cron fires every hour (or as frequently as needed) and:
1. Finds all sessions that are `concluida` or `faltou` with `pago=false` and `valor_cobrado IS NOT NULL`
2. For each session, checks which reminder steps should have fired based on the rule (`dias_apos`)
3. Creates `cobracas_enviadas` rows with status:
   - `'agendado'` if config.regua_cobranca_modo = 'auto' (and then immediately calls cobranca-whatsapp)
   - `'pendente'` if config.regua_cobranca_modo = 'manual' (waits for user approval)
4. Stops processing a session if it's marked `pago=true`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now = new Date()
  const results: Array<{ sessao_id: string; etapa: number; result: string }> = []

  try {
    // 1. Fetch all users with active payment reminder feature
    const { data: configs, error: configsError } = await supabase
      .from('config_psicologo')
      .select('user_id, regua_cobranca_ativa, regua_cobranca_modo')
      .eq('regua_cobranca_ativa', true)

    if (configsError) {
      console.error('cron-cobrancas: config fetch error', JSON.stringify(configsError))
      throw configsError
    }

    // 2. For each user, find unpaid sessions and check if reminders should fire
    for (const config of configs ?? []) {
      // Fetch this user's rules
      const { data: regras, error: regrasError } = await supabase
        .from('regras_cobranca')
        .select('*')
        .eq('user_id', config.user_id)
        .eq('ativo', true)

      if (regrasError) {
        console.error(`cron-cobrancas: regras fetch error for user ${config.user_id}`, regrasError)
        continue
      }

      // Fetch unpaid sessions for this user
      const { data: sessoes, error: sessoesError } = await supabase
        .from('sessoes')
        .select(`
          id,
          data_hora,
          valor_cobrado,
          pago,
          paciente_id,
          avulso_telefone,
          pacientes(telefone),
          cobracas_enviadas!left(etapa, status)
        `)
        .eq('user_id', config.user_id)
        .in('status', ['concluida', 'faltou'])
        .eq('pago', false)
        .not('valor_cobrado', 'is', null)

      if (sessoesError) {
        console.error(`cron-cobrancas: sessoes fetch error for user ${config.user_id}`, sessoesError)
        continue
      }

      // 3. For each session, determine which reminders should fire
      for (const sessao of sessoes ?? []) {
        const sessaoDate = new Date(sessao.data_hora)
        const hoursElapsed = (now.getTime() - sessaoDate.getTime()) / 3600000

        // Check each rule
        for (const regra of regras ?? []) {
          const daysAfter = regra.dias_apos
          const hoursAfter = daysAfter * 24

          // Has this step already been processed (sent or failed)?
          const alreadyProcessed = (sessao.cobracas_enviadas as any[])?.some(
            (c: any) => c.etapa === regra.etapa && c.status !== 'cancelado'
          )

          // If not yet processed and the time has elapsed, create cobranca record
          if (!alreadyProcessed && hoursElapsed >= hoursAfter) {
            // Fetch the template and render it
            const { data: configPsi } = await supabase
              .from('config_psicologo')
              .select('nome, chave_pix')
              .eq('user_id', config.user_id)
              .single()

            const pacienteName = (sessao.pacientes as any)?.nome ?? sessao.avulso_nome ?? 'Paciente'
            const valor = sessao.valor_cobrado
            const dataSessao = new Date(sessao.data_hora).toLocaleDateString('pt-BR')
            const chavePix = configPsi?.chave_pix ?? '(Não configurada)'

            const mensagemTexto = regra.template_mensagem
              .replace('{{nome}}', pacienteName)
              .replace('{{valor}}', String(valor))
              .replace('{{data_sessao}}', dataSessao)
              .replace('{{chave_pix}}', chavePix)

            // Create cobranca record
            const statusInicial = config.regua_cobranca_modo === 'auto' ? 'agendado' : 'pendente'
            const { data: cobranca, error: insertError } = await supabase
              .from('cobracas_enviadas')
              .insert({
                user_id: config.user_id,
                sessao_id: sessao.id,
                etapa: regra.etapa,
                status: statusInicial,
                mensagem_texto: mensagemTexto,
                data_agendado: now.toISOString(),
              })
              .select('id')
              .single()

            if (insertError) {
              console.error(`cron-cobrancas: insert error for sessao ${sessao.id}:`, insertError)
              results.push({
                sessao_id: sessao.id,
                etapa: regra.etapa,
                result: 'insert_error',
              })
              continue
            }

            // 4. If auto mode, immediately trigger send
            if (config.regua_cobranca_modo === 'auto') {
              try {
                const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/cobranca-whatsapp`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                  },
                  body: JSON.stringify({ cobranca_id: cobranca!.id }),
                })
                const sendBody = await sendResp.json()
                const resultType = sendResp.ok ? 'sent' : (sendBody.error ?? 'error')
                results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: resultType })
              } catch (e) {
                console.error(`cron-cobrancas: send error for cobranca ${cobranca!.id}:`, e)
                results.push({
                  sessao_id: sessao.id,
                  etapa: regra.etapa,
                  result: 'send_error',
                })
              }
            } else {
              // Manual mode: just created, waiting for approval
              results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: 'pending_approval' })
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { status: 200 }
    )
  } catch (error) {
    console.error('cron-cobrancas: unexpected error', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: String(error) }),
      { status: 500 }
    )
  }
})
```

**Deployment via `pg_cron`:**

Add to a migration or deploy manually:

```sql
-- Schedule cron to run every hour
select cron.schedule(
  'cron-cobrancas-hourly',
  '0 * * * *',
  $$
  select
    net.http_post(
      url := 'https://YOUR_SUPABASE_PROJECT.functions.supabase.co/cron-cobrancas',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
```

---

## 8. Error Handling

### Frontend
- Hook catches all errors and stores in `error` state
- Toast notifications on approval/send success or failure
- Retry buttons for failed reminders in UI
- Graceful degradation if Evolution API is down (show error, allow manual retry)

### Edge Function
- Validates user ownership via `user_id` filter (multi-tenant safety)
- Returns appropriate HTTP status codes:
  - `401` = no auth
  - `404` = cobranca/sessao/config not found
  - `412` = WhatsApp not connected
  - `422` = no phone number
  - `502` = Evolution API unavailable
  - `500` = unexpected error
- Logs diagnostics (phone, Evolution URL, response) for debugging
- Marks cobranca record as `'falha'` with error details if send fails

### Cron
- Catches individual user processing errors and continues with next user
- Logs errors to Supabase logs (viewable in dashboard)
- Does not throw/crash on Evolution failures (allows manual retry)
- Idempotent: if a reminder already exists for a (sessao_id, etapa) pair, skips it

### Database
- Unique constraint on (user_id, etapa) in `regras_cobranca` prevents duplicate rules
- On `sessao.pago = true`, the cron will naturally skip that session (pago=false filter)
- RLS policies ensure users only see their own data

---

## 9. Testing

### Unit Tests

**File:** `src/hooks/__tests__/useReguaCobranca.test.tsx`

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { useReguaCobranca } from '../useReguaCobranca'
import * as supabase from '@supabase/auth-helpers-react'

// Mock Supabase
jest.mock('@supabase/auth-helpers-react')

describe('useReguaCobranca', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should fetch payment reminder rules', async () => {
    const mockData = [
      { id: '1', etapa: 1, dias_apos: 1, template_mensagem: 'Test', ativo: true },
    ]
    
    ;(supabase.useSupabaseClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      }),
    })

    const { result } = renderHook(() => useReguaCobranca())
    await result.current.fetchRegras()

    await waitFor(() => {
      expect(result.current.regras).toEqual(mockData)
    })
  })

  it('should save a rule', async () => {
    ;(supabase.useSupabaseClient as jest.Mock).mockReturnValue({
      from: jest.fn().mockReturnValue({
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: { id: '1', etapa: 1 },
              error: null,
            }),
          }),
        }),
      }),
    })

    const { result } = renderHook(() => useReguaCobranca())
    await result.current.salvarRegra(1, 'Olá {{nome}}', 1, true)

    await waitFor(() => {
      expect(result.current.error).toBeNull()
    })
  })
})
```

### Component Tests

**File:** `src/components/regua-cobranca/__tests__/ReguaCobrancaTemplateEditor.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReguaCobrancaTemplateEditor } from '../ReguaCobrancaTemplateEditor'

describe('ReguaCobrancaTemplateEditor', () => {
  it('should render template editor for step 1', () => {
    const mockOnSave = jest.fn()
    const mockOnDelete = jest.fn()

    render(
      <ReguaCobrancaTemplateEditor
        etapa={1}
        onSave={mockOnSave}
        onDelete={mockOnDelete}
      />
    )

    expect(screen.getByText('Etapa 1')).toBeInTheDocument()
  })

  it('should call onSave when save button is clicked', async () => {
    const mockOnSave = jest.fn().mockResolvedValue(undefined)
    const mockOnDelete = jest.fn()

    render(
      <ReguaCobrancaTemplateEditor
        etapa={1}
        onSave={mockOnSave}
        onDelete={mockOnDelete}
      />
    )

    const saveButton = screen.getByText('Salvar')
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalled()
    })
  })
})
```

### Integration Test

**File:** `src/pages/__tests__/CobrancaPage.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import { CobrancaPage } from '../CobrancaPage'

jest.mock('../../hooks/useReguaCobranca')

describe('CobrancaPage', () => {
  it('should render both tabs', async () => {
    render(<CobrancaPage />)

    expect(screen.getByText(/Sessões Não Pagas/)).toBeInTheDocument()
    expect(screen.getByText(/Histórico de Envios/)).toBeInTheDocument()
  })

  it('should show message when no unpaid sessions', async () => {
    // Mock hook to return empty data
    const mockUseReguaCobranca = require('../../hooks/useReguaCobranca').useReguaCobranca
    mockUseReguaCobranca.mockReturnValue({
      sessoesParaCobranca: [],
      cobracasEnviadas: [],
      loading: false,
      error: null,
      fetchSessoesParaCobranca: jest.fn(),
      fetchCobracasEnviadas: jest.fn(),
    })

    render(<CobrancaPage />)

    await waitFor(() => {
      expect(screen.getByText('Nenhuma sessão com pagamento pendente')).toBeInTheDocument()
    })
  })
})
```

### Manual Testing Checklist

- [ ] Create a session with `status='concluida'`, `valor_cobrado=100`, `pago=false`
- [ ] Configure Régua de Cobrança rules in Settings (steps 1, 3, 7 days)
- [ ] Enable feature and set mode to 'manual'
- [ ] Verify pending cobrança appears in Cobrança page
- [ ] Click "Enviar Agora" and verify message was sent via WhatsApp
- [ ] Verify `cobracas_enviadas` record shows `status='enviado'`
- [ ] Change `pago=true` on session and verify next step doesn't fire
- [ ] Test 'auto' mode: verify cron creates records and sends automatically
- [ ] Test failed send: simulate Evolution API error and verify retry works
- [ ] Test phone number edge cases (different formatting, avulso vs. registered)

---

## 10. Rollout

### Phase 1: Internal Testing (Day 1-2)
- Deploy migrations (019)
- Deploy edge function `cobranca-whatsapp`
- Deploy cron `cron-cobrancas`
- Manually test with psychologist user account
- Verify Evolution API integration works
- Check database logs for errors

### Phase 2: UI Rollout (Day 3-4)
- Deploy Settings UI section
- Deploy CobrancaPage
- Deploy ReguaCobrancaTemplateEditor component
- Test Settings save/load cycle
- Verify rules persist and render correctly

### Phase 3: Feature Flag (Day 5)
- If using feature-gating (Plan 3): gate behind subscription or trial
- Display banner in Settings if inactive
- Test gate behavior

### Phase 4: Monitoring & Support (Ongoing)
- Monitor cron logs for failures
- Track Evolution API integration issues
- Watch for edge cases in phone formatting
- Gather feedback on template UX

### Rollback Plan
- All writes are isolated to new tables (`regras_cobranca`, `cobracas_enviadas`)
- No changes to existing session or patient data
- If cron fails, payment reminders simply don't send (system remains functional)
- Disable feature via config flag: `regua_cobranca_ativa = false`
- If needed, revert migrations 019 (safe: no foreign key constraints from other tables)

---

## Summary of Key Decisions

1. **Three-step sequence**: Fixed number of steps (1, 2, 3) allows simple UI and clear semantics
2. **Template variables**: Four essential variables cover the main use case; no complex expressions
3. **Chave PIX in config**: Shared PIX key simplifies UX (one setting, not per-patient)
4. **Auto vs. Manual mode**: Global toggle (not per-session) keeps config lightweight
5. **Status = 'concluida' or 'faltou'**: Covers real-world scenarios; excludes rescheduled or canceled
6. **Stop on pago=true**: Payment immediately stops the sequence; no race conditions due to cron frequency
7. **Edge function + cron split**: Edge function handles send logic; cron handles scheduling logic
8. **Hourly cron**: Sufficient granularity for day-based intervals without excessive load
9. **RLS enforcement**: All queries filter by `user_id` for multi-tenant safety
10. **Audit trail in `cobracas_enviadas`**: Full record of what was sent, when, and status for support

