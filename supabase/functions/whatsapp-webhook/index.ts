import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizePhone, parseReplyText } from '../_shared/phone.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')!

serve(async (req) => {
  // 1. Verify secret
  if (req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 })
  }

  const payload = await req.json()
  if (payload.event !== 'messages.upsert') return new Response('ok')

  const remoteJid: string = payload.data?.key?.remoteJid ?? ''
  if (payload.data?.key?.fromMe || !remoteJid.endsWith('@s.whatsapp.net')) {
    return new Response('ok')
  }

  // Extract reply text from all possible message shapes
  const msg = payload.data?.message ?? {}
  const replyText: string =
    msg.conversation ??
    msg.extendedTextMessage?.text ??
    msg.buttonsResponseMessage?.selectedDisplayText ??
    msg.buttonsResponseMessage?.selectedButtonId ??
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ??
    msg.listResponseMessage?.title ??
    ''

  const selectedId = parseReplyText(replyText)
  console.log(`Webhook reply: jid=${remoteJid} text="${replyText}" parsed=${selectedId}`)
  if (!selectedId) return new Response('ok')

  const phone = normalizePhone(remoteJid.replace('@s.whatsapp.net', ''))

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 2. Find most-recent pending confirmacao matching this phone
  const { data: rows } = await supabase
    .from('confirmacoes_whatsapp')
    .select(`id, sessao_id, sessoes!inner(data_hora, status, paciente_id, avulso_telefone, pacientes(telefone))`)
    .is('confirmado', null)
    .gt('sessoes.data_hora', new Date(Date.now() - 3 * 3600_000).toISOString())
    .order('mensagem_enviada_em', { ascending: false })

  const match = rows?.find(r => {
    const s = r.sessoes as any
    const tel = s?.pacientes?.telefone ?? s?.avulso_telefone ?? ''
    return normalizePhone(tel) === phone
  })

  if (!match) return new Response('ok')

  const { data: config } = await supabase
    .from('config_psicologo')
    .select('evolution_instance_name')
    .limit(1).single()

  if (selectedId === 'CONFIRMAR') {
    await supabase.from('confirmacoes_whatsapp')
      .update({ confirmado: true, resposta: 'Confirmado', lida: false })
      .eq('id', match.id)
    await supabase.from('sessoes')
      .update({ status: 'confirmada' })
      .eq('id', match.sessao_id)

    await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${config!.evolution_instance_name}`,
      {
        method: 'POST',
        headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: phone,
          text: 'Confirmação recebida! ✅ Te esperamos na sessão. Até lá! 😊',
        }),
      }
    )

  } else if (selectedId === 'CANCELAR') {
    await supabase.from('confirmacoes_whatsapp')
      .update({ confirmado: false, resposta: 'Cancelado', lida: false, remarcacao_solicitada: true })
      .eq('id', match.id)

    // Follow-up message asking patient about rescheduling
    await fetch(
      `${EVOLUTION_API_URL}/message/sendText/${config!.evolution_instance_name}`,
      {
        method: 'POST',
        headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: phone,
          text: 'Entendido! 🙏 Gostaria de remarcar sua sessão? Se sim, entre em contato conosco para escolher um novo horário.',
        }),
      }
    )
  }

  return new Response('ok')
})
