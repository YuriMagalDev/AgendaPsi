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

  const { action } = await req.json() as { action: 'create' | 'qr' | 'status' }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Authenticate caller
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: corsHeaders })
  }

  const { data: config } = await supabase
    .from('config_psicologo')
    .select('id, evolution_instance_name, evolution_token')
    .eq('user_id', user.id)
    .single()

  if (!config) {
    return new Response(JSON.stringify({ error: 'Config não encontrada' }), { status: 404, headers: corsHeaders })
  }

  // Check subscription allows WhatsApp setup
  const { data: assinatura } = await supabase
    .from('assinaturas')
    .select('plano, status, trial_fim')
    .eq('user_id', user.id)
    .single()

  const hoje = new Date().toISOString().slice(0, 10)
  const podUsarWhatsapp =
    assinatura?.plano === 'completo' &&
    (assinatura?.status === 'ativo' ||
      (assinatura?.status === 'trial' && (assinatura?.trial_fim ?? '') >= hoje))

  if (!podUsarWhatsapp) {
    return new Response(
      JSON.stringify({ error: 'Faça upgrade para o plano Completo para usar o WhatsApp.' }),
      { status: 403, headers: corsHeaders }
    )
  }

  if (action === 'create') {
    // Skip if instance already exists
    if (config.evolution_instance_name) {
      return new Response(JSON.stringify({ instanceName: config.evolution_instance_name }), { headers: corsHeaders })
    }
    const instanceName = `psicologo-${crypto.randomUUID().slice(0, 8)}`
    const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`
    const resp = await fetch(`${EVOLUTION_API_URL}/instance/create`, {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceName,
        token: crypto.randomUUID(),
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        webhook: {
          url: webhookUrl,
          byEvents: true,
          events: ['MESSAGES_UPSERT'],
          headers: { 'x-webhook-secret': Deno.env.get('WEBHOOK_SECRET') },
        },
      }),
    })
    const data = await resp.json()
    await supabase.from('config_psicologo').update({
      evolution_instance_name: data.instance.instanceName,
      evolution_token: data.hash.apikey,
      whatsapp_conectado: false,
    }).eq('id', config.id)
    return new Response(JSON.stringify({ instanceName: data.instance.instanceName }), { headers: corsHeaders })
  }

  if (action === 'qr') {
    const resp = await fetch(
      `${EVOLUTION_API_URL}/instance/connect/${config.evolution_instance_name}`,
      { headers: { 'apikey': EVOLUTION_API_KEY } }
    )
    const data = await resp.json()
    console.log('Evolution QR response:', JSON.stringify(data))
    // Try all known field names across Evolution API versions
    const qr = data.base64
      ?? data.qrcode?.base64
      ?? data.qrcode
      ?? data.code
      ?? data.qr
      ?? null
    return new Response(JSON.stringify({ qr, _raw: data }), { headers: corsHeaders })
  }

  if (action === 'status') {
    const resp = await fetch(
      `${EVOLUTION_API_URL}/instance/connectionState/${config.evolution_instance_name}`,
      { headers: { 'apikey': EVOLUTION_API_KEY } }
    )
    const data = await resp.json()
    const connected = data.instance?.state === 'open'
    if (connected) {
      await supabase.from('config_psicologo').update({ whatsapp_conectado: true }).eq('id', config.id)
    }
    return new Response(JSON.stringify({ connected, state: data.instance?.state }), { headers: corsHeaders })
  }

  return new Response(JSON.stringify({ error: 'action inválida' }), { status: 400, headers: corsHeaders })
})
