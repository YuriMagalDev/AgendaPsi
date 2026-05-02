import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizePhone } from '../_shared/phone.ts'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const { data: { user }, error: userErr } = await supabase.auth.getUser(
    (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  )
  if (userErr || !user) return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: cors })

  const { paciente_id, template_id, custom_message } = await req.json()

  const { data: config } = await supabase
    .from('config_psicologo')
    .select('whatsapp_conectado, evolution_instance_name')
    .eq('user_id', user.id).single()

  if (!config?.whatsapp_conectado || !config.evolution_instance_name)
    return new Response(JSON.stringify({ error: 'WhatsApp não conectado' }), { status: 412, headers: cors })

  const { data: paciente } = await supabase
    .from('pacientes').select('id, nome, telefone')
    .eq('id', paciente_id).eq('user_id', user.id).single()

  if (!paciente) return new Response(JSON.stringify({ error: 'Paciente não encontrado' }), { status: 404, headers: cors })
  if (!paciente.telefone) return new Response(JSON.stringify({ error: 'Sem telefone' }), { status: 422, headers: cors })

  let corpo = custom_message as string | undefined
  if (!corpo && template_id) {
    const { data: tpl } = await supabase.from('risco_templates').select('corpo')
      .eq('id', template_id).eq('user_id', user.id).single()
    if (!tpl) return new Response(JSON.stringify({ error: 'Template não encontrado' }), { status: 404, headers: cors })
    corpo = tpl.corpo
  }
  if (!corpo) return new Response(JSON.stringify({ error: 'Mensagem vazia' }), { status: 400, headers: cors })

  const { data: sessions } = await supabase.from('sessoes')
    .select('data_hora').eq('paciente_id', paciente_id)
    .order('data_hora', { ascending: false }).limit(1)

  const ultima_sessao = sessions?.[0]?.data_hora
    ? new Date(sessions[0].data_hora).toLocaleDateString('pt-BR') : 'N/A'
  const dias_ausente = sessions?.[0]?.data_hora
    ? String(Math.floor((Date.now() - new Date(sessions[0].data_hora).getTime()) / 86_400_000)) : 'muitos'

  const mensagem_completa = corpo
    .replace(/\{\{nome\}\}/g, paciente.nome)
    .replace(/\{\{dias_ausente\}\}/g, dias_ausente)
    .replace(/\{\{ultima_sessao\}\}/g, ultima_sessao)

  const evoResp = await fetch(
    `${EVOLUTION_API_URL}/message/sendText/${config.evolution_instance_name}`,
    { method: 'POST', headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: normalizePhone(paciente.telefone), text: mensagem_completa }) }
  )
  if (!evoResp.ok)
    return new Response(JSON.stringify({ error: `Evolution API ${evoResp.status}` }), { status: 502, headers: cors })

  const { data: followup } = await supabase.from('risco_followups')
    .insert({ user_id: user.id, paciente_id, template_id: template_id ?? null, mensagem_completa, resultado: 'enviada' })
    .select().single()

  return new Response(JSON.stringify({ success: true, followup_id: followup?.id }), { headers: cors })
})
