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
  console.log(`Webhook: event="${payload.event}" fromMe=${payload.data?.key?.fromMe} jid="${payload.data?.key?.remoteJid}"`)

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
  console.log(`Reply: text="${replyText}" parsed=${selectedId}`)
  if (!selectedId) return new Response('ok')

  const phone = normalizePhone(remoteJid.replace('@s.whatsapp.net', ''))
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 2. Find most-recent pending confirmacao sent within the last 24h matching this phone
  const { data: rows, error: rowsError } = await supabase
    .from('confirmacoes_whatsapp')
    .select(`id, sessao_id, mensagem_enviada_em, sessoes!inner(data_hora, status, paciente_id, avulso_telefone, pacientes(telefone))`)
    .is('confirmado', null)
    .gt('mensagem_enviada_em', new Date(Date.now() - 24 * 3600_000).toISOString())
    .order('mensagem_enviada_em', { ascending: false })

  if (rowsError) {
    console.error(`DB error: ${JSON.stringify(rowsError)}`)
    return new Response('error', { status: 500 })
  }

  console.log(`Candidates: ${rows?.length ?? 0} pending rows, looking for phone=${phone}`)
  rows?.forEach(r => {
    const s = r.sessoes as any
    const tel = s?.pacientes?.telefone ?? s?.avulso_telefone ?? ''
    console.log(`  candidate sessao_id=${r.sessao_id} raw="${tel}" normalized="${normalizePhone(tel)}"`)
  })

  const match = rows?.find(r => {
    const s = r.sessoes as any
    const tel = s?.pacientes?.telefone ?? s?.avulso_telefone ?? ''
    return normalizePhone(tel) === phone
  })

  if (!match) {
    console.warn(`No match for phone=${phone}`)
    return new Response('ok')
  }
  console.log(`Match: confirmacao=${match.id} sessao=${match.sessao_id}`)

  const { data: config } = await supabase
    .from('config_psicologo')
    .select('evolution_instance_name')
    .limit(1).single()

  const isCancelar = selectedId === 'CANCELAR'
  const isConfirmar = selectedId === 'CONFIRMAR'

  // Determine tipo for notification bell
  let tipo: string
  if (isConfirmar) {
    tipo = 'confirmacao'
  } else {
    // Check if session was previously confirmada — if so this is a post-confirm cancel
    const sessaoStatus = (match.sessoes as any)?.status ?? ''
    tipo = sessaoStatus === 'confirmada' ? 'cancelamento_pos_confirmacao' : 'cancelamento'
  }

  // Update confirmacao row with response + tipo
  await supabase.from('confirmacoes_whatsapp')
    .update({
      confirmado: isConfirmar,
      resposta: isConfirmar ? 'Confirmado' : 'Cancelado',
      lida: false,
      tipo,
    })
    .eq('id', match.id)

  // Update session status
  const newStatus = isConfirmar ? 'confirmada' : 'cancelada'
  await supabase.from('sessoes')
    .update({ status: newStatus })
    .eq('id', match.sessao_id)

  // Send acknowledgement via WhatsApp
  const replyText = isConfirmar
    ? 'Confirmação recebida! ✅ Te esperamos na sessão. Até lá! 😊'
    : 'Entendido! 🙏 Sessão cancelada. Entre em contato se quiser remarcar.'

  const r = await fetch(
    `${EVOLUTION_API_URL}/message/sendText/${config!.evolution_instance_name}`,
    {
      method: 'POST',
      headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone, text: replyText }),
    }
  )
  console.log(`Evolution ${selectedId} send [${r.status}]: ${await r.text()}`)

  return new Response('ok')
})
