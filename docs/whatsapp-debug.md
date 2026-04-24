# WhatsApp Automation — Debug Brief for Opus

## Context

This is a psychologist practice management app. We're integrating **Evolution API v2** (self-hosted on Railway) with **Supabase Edge Functions** (Deno) to send WhatsApp session reminder messages with interactive buttons (✅ Confirmar / ❌ Cancelar).

The WhatsApp instance is **connected** (QR scanned successfully, Baileys integration). The frontend test buttons now reach the Edge Function. But **messages are not arriving on the patient's phone**.

---

## Current Problem

Clicking a test button in the UI:
1. Calls `supabase.functions.invoke('send-lembrete', { body: { sessao_id, tipo, force: true } })`
2. Edge Function inserts a `confirmacoes_whatsapp` row (succeeds — no DB error)
3. Edge Function calls Evolution API `POST /message/sendButtons/{instanceName}`
4. We don't know yet if Evolution API returns 200 or an error — logs need to be checked after the latest deploy

The `console.log` was just added, so after the next test the Supabase Edge Function logs should show:
```
Evolution API [STATUS] phone=PHONE instance=INSTANCE: BODY
```

---

## Suspected Issues

### 1. Button message format may be wrong for Baileys

We tried two formats. The **current format** (latest deploy):
```json
{
  "number": "5585979781 96",
  "title": "Confirmação de Sessão",
  "description": "Olá, *Nome*! ...",
  "footer": "Psicóloga X",
  "buttons": [
    { "buttonId": "CONFIRMAR", "buttonText": { "displayText": "✅ Confirmar" }, "type": 1 },
    { "buttonId": "CANCELAR",  "buttonText": { "displayText": "❌ Cancelar" },  "type": 1 }
  ]
}
```

The **previous format** (wrong — WhatsApp Cloud API style, not Baileys):
```json
{
  "buttons": [
    { "type": "reply", "reply": { "id": "CONFIRMAR", "title": "✅ Confirmar" } }
  ]
}
```

**Question for Opus**: Is the current `sendButtons` format correct for Evolution API v2 with Baileys? Does Baileys support button messages at all for personal WhatsApp numbers, or does Meta block them? What's the recommended approach?

### 2. Phone number format

`normalizePhone` was updated to add `55` country code if the number has 10–11 digits:
```typescript
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}
```

Evolution API expects `5585979781 96` (digits only, with country code). The log line will confirm what number is actually being sent.

### 3. Webhook may need updating if buttons don't work

If we switch to plain text messages (e.g., "Reply 1 to confirm, 2 to cancel"), the webhook currently only handles `buttonsResponseMessage`:

```typescript
const buttonReply = payload.data?.message?.buttonsResponseMessage
if (!buttonReply) return new Response('ok')  // ← drops all text replies
```

It would need to also handle `conversation` / `extendedTextMessage` for text-based replies.

---

## Full File Contents

### `supabase/functions/send-lembrete/index.ts`
```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizePhone, buildButtonText } from '../_shared/phone.ts'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { sessao_id, tipo, force } = await req.json() as { sessao_id: string; tipo: '48h' | '24h' | '2h'; force?: boolean }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 1. Check automation is active
  const { data: config } = await supabase
    .from('config_psicologo')
    .select('automacao_whatsapp_ativa, whatsapp_conectado, evolution_instance_name, evolution_token, nome')
    .limit(1).single()

  if (!config?.automacao_whatsapp_ativa || !config?.whatsapp_conectado) {
    return new Response(JSON.stringify({ skipped: 'automação inativa' }), { headers: corsHeaders })
  }

  // 2. Fetch session + patient phone
  const { data: sessao } = await supabase
    .from('sessoes')
    .select('id, data_hora, avulso_nome, avulso_telefone, paciente_id, pacientes(nome, telefone)')
    .eq('id', sessao_id)
    .in('status', ['agendada', 'confirmada'])
    .single()

  if (!sessao) {
    return new Response(JSON.stringify({ error: 'sessão não encontrada' }), { status: 404, headers: corsHeaders })
  }

  const nome = (sessao.pacientes as any)?.nome ?? sessao.avulso_nome ?? 'Paciente'
  const telefone = (sessao.pacientes as any)?.telefone ?? sessao.avulso_telefone
  if (!telefone) {
    return new Response(JSON.stringify({ error: 'sem telefone' }), { status: 422, headers: corsHeaders })
  }

  const phone = normalizePhone(telefone)
  const dataHora = new Date(sessao.data_hora)
  const hora = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const diaSemana = dataHora.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })
  const texto = buildButtonText(tipo, nome, hora, diaSemana)

  // 3. Insert confirmacao (unique index prevents double-send; force=true deletes first for test retries)
  if (force) {
    await supabase.from('confirmacoes_whatsapp').delete().eq('sessao_id', sessao_id).eq('tipo_lembrete', tipo)
  }

  const { data: confirmacao, error: insertError } = await supabase
    .from('confirmacoes_whatsapp')
    .insert({ sessao_id, tipo_lembrete: tipo, mensagem_enviada_em: new Date().toISOString(), lida: false, remarcacao_solicitada: false })
    .select('id')
    .single()

  if (insertError?.code === '23505') {
    return new Response(JSON.stringify({ skipped: 'já enviado' }), { headers: corsHeaders })
  }
  if (insertError) throw insertError

  // 4. Call Evolution API
  const evoResp = await fetch(
    `${EVOLUTION_API_URL}/message/sendButtons/${config.evolution_instance_name}`,
    {
      method: 'POST',
      headers: { 'apikey': config.evolution_token!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: phone,
        title: 'Confirmação de Sessão',
        description: texto,
        footer: config.nome ? `Psicóloga ${config.nome}` : 'Seu consultório',
        buttons: [
          { buttonId: 'CONFIRMAR', buttonText: { displayText: '✅ Confirmar' }, type: 1 },
          { buttonId: 'CANCELAR',  buttonText: { displayText: '❌ Cancelar' },  type: 1 },
        ],
      }),
    }
  )

  const evoBody = await evoResp.text()
  console.log(`Evolution API [${evoResp.status}] phone=${phone} instance=${config.evolution_instance_name}: ${evoBody}`)

  if (!evoResp.ok) {
    await supabase.from('confirmacoes_whatsapp').delete().eq('id', confirmacao!.id)
    return new Response(JSON.stringify({ error: 'Evolution API falhou', detail: evoBody }), { status: 502, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ ok: true, confirmacao_id: confirmacao!.id, evo: JSON.parse(evoBody) }), { headers: corsHeaders })
})
```

### `supabase/functions/whatsapp-webhook/index.ts`
```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizePhone } from '../_shared/phone.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!

serve(async (req) => {
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const payload = await req.json()
  if (payload.event !== 'messages.upsert') return new Response('ok')

  const remoteJid: string = payload.data?.key?.remoteJid ?? ''
  if (payload.data?.key?.fromMe || !remoteJid.endsWith('@s.whatsapp.net')) {
    return new Response('ok')
  }

  const buttonReply = payload.data?.message?.buttonsResponseMessage
  if (!buttonReply) return new Response('ok')  // ← drops text replies

  const selectedId: string = buttonReply.selectedButtonId
  const phone = normalizePhone(remoteJid.replace('@s.whatsapp.net', ''))

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: rows } = await supabase
    .from('confirmacoes_whatsapp')
    .select(`id, sessao_id, sessoes!inner(data_hora, status, paciente_id, avulso_telefone, pacientes(telefone))`)
    .is('confirmado', null)
    .gt('sessoes.data_hora', new Date().toISOString())
    .order('mensagem_enviada_em', { ascending: false })

  const match = rows?.find(r => {
    const s = r.sessoes as any
    const tel = s?.pacientes?.telefone ?? s?.avulso_telefone ?? ''
    return normalizePhone(tel) === phone
  })

  if (!match) return new Response('ok')

  const { data: config } = await supabase
    .from('config_psicologo')
    .select('evolution_instance_name, evolution_token')
    .limit(1).single()

  if (selectedId === 'CONFIRMAR') {
    await supabase.from('confirmacoes_whatsapp')
      .update({ confirmado: true, resposta: 'Confirmado', lida: false })
      .eq('id', match.id)
    await supabase.from('sessoes')
      .update({ status: 'confirmada' })
      .eq('id', match.sessao_id)
  } else if (selectedId === 'CANCELAR') {
    await supabase.from('confirmacoes_whatsapp')
      .update({ confirmado: false, resposta: 'Cancelado', lida: false, remarcacao_solicitada: true })
      .eq('id', match.id)
    await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${config!.evolution_instance_name}`,
      {
        method: 'POST',
        headers: { 'apikey': config!.evolution_token!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: phone,
          text: 'Entendido! 🙏 Gostaria de remarcar sua sessão? Se sim, entre em contato conosco para escolher um novo horário.',
        }),
      }
    )
  }

  return new Response('ok')
})
```

### `supabase/functions/_shared/phone.ts`
```typescript
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function buildButtonText(
  tipo: '48h' | '24h' | '2h',
  nome: string,
  hora: string,
  diaSemana: string
): string {
  const textos: Record<string, string> = {
    '48h': `Olá, *${nome}*! 😊 Lembrando que você tem uma sessão *amanhã, ${diaSemana} às ${hora}*. Gostaria de confirmar sua presença?`,
    '24h': `Olá, *${nome}*! 😊 Sua sessão é *hoje às ${hora}*. Confirme sua presença:`,
    '2h':  `Olá, *${nome}*! 🕐 Sua sessão começa em *2 horas, às ${hora}*. Confirme:`,
  }
  return textos[tipo]
}
```

---

## Key Questions for Opus

1. **Is `sendButtons` the right endpoint for Evolution API v2 + Baileys?** Or does it only work with WhatsApp Business API? Many reports say Meta blocks button messages on personal numbers.

2. **If buttons don't work**, what's the correct fallback? Options:
   - Plain text: "Responda *1* para confirmar ou *2* para cancelar"
   - Poll messages (`sendPoll`)
   - List messages (`sendList`)
   - What endpoint + payload format should be used?

3. **If switching to text replies**, how should the webhook be updated to match replies like "1", "confirmar", etc. instead of `buttonsResponseMessage`?

4. **What does Evolution API v2 return** when `sendButtons` succeeds vs. fails? Is a 200 response with no actual delivery a known issue?

---

## Infrastructure

- Evolution API v2 hosted on Railway (Docker image `atendai/evolution-api:latest`)
- Supabase Edge Functions (Deno), deployed with `--no-verify-jwt`
- WhatsApp instance type: **Baileys** (personal number, not Business API)
- Secrets set via `supabase secrets set`
