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
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 3 * 3600_000).toISOString()
  const todayEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 3, 0)).toISOString()

  // Sessions today still in agendada or confirmada
  const { data: sessoes, error } = await supabase
    .from('sessoes')
    .select('id, confirmacoes_whatsapp!left(tipo_lembrete, confirmado)')
    .gte('data_hora', todayStart)
    .lte('data_hora', todayEnd)
    .in('status', ['agendada', 'confirmada'])

  if (error) {
    console.error('checklist-trigger DB error:', JSON.stringify(error))
    return new Response('error', { status: 500 })
  }

  const inserted: string[] = []

  for (const s of sessoes ?? []) {
    const confs = s.confirmacoes_whatsapp as any[]

    // Only alert for sessions that received a reminder but got no response
    const receivedLembrete = confs?.some((c: any) =>
      c.tipo_lembrete === 'lembrete_noite' || c.tipo_lembrete === 'lembrete_manha'
    )
    if (!receivedLembrete) continue

    const hasResponse = confs?.some((c: any) => c.confirmado !== null)
    if (hasResponse) continue

    // Insert alerta_sem_resposta — unique index prevents duplicates
    const { error: insertError } = await supabase
      .from('confirmacoes_whatsapp')
      .insert({
        sessao_id: s.id,
        mensagem_enviada_em: now.toISOString(),
        tipo: 'alerta_sem_resposta',
        lida: false,
        remarcacao_solicitada: false,
      })

    if (insertError && insertError.code !== '23505') {
      console.error(`alerta insert error sessao=${s.id}:`, JSON.stringify(insertError))
      continue
    }

    if (!insertError) inserted.push(s.id)
  }

  console.log(`checklist-trigger: inserted ${inserted.length} alerts`)
  return new Response(JSON.stringify({ inserted: inserted.length, sessao_ids: inserted }), { status: 200 })
})
