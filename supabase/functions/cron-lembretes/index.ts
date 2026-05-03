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
  const nowMs = now.getTime()

  // 1. Get all tenants with WhatsApp active and connected
  const { data: configs, error: configsError } = await supabase
    .from('config_psicologo')
    .select('user_id, horario_lembrete_1, horario_lembrete_2, horario_inicio')
    .eq('automacao_whatsapp_ativa', true)
    .eq('whatsapp_conectado', true)

  if (configsError) console.error('cron-lembretes: configs fetch error', JSON.stringify(configsError))

  const allResults: Array<{ sessao_id: string; tipo: string; result: string }> = []

  for (const config of configs ?? []) {
    const horarioLembrete1 = config.horario_lembrete_1 ?? '18:00'
    const horarioLembrete2 = config.horario_lembrete_2 ?? '07:00'
    const horarioInicio    = config.horario_inicio ?? '07:00'

    function todayAt(hhmm: string): Date {
      const [h, m] = hhmm.split(':').map(Number)
      const d = new Date(now)
      d.setUTCHours(h + 3, m, 0, 0)
      return d
    }

    const lembrete1Time    = todayAt(horarioLembrete1)
    const lembrete2Time    = todayAt(horarioLembrete2)
    const inicioTime       = todayAt(horarioInicio)
    const earlyThresholdMs = inicioTime.getTime() + 2 * 3600_000
    const isNearLembrete1  = Math.abs(nowMs - lembrete1Time.getTime()) <= 15 * 60_000
    const isNearLembrete2  = Math.abs(nowMs - lembrete2Time.getTime()) <= 15 * 60_000

    if (isNearLembrete1) {
      const noiteFrom = new Date(nowMs + 17.5 * 3600_000).toISOString()
      const noiteTo   = new Date(nowMs + 24   * 3600_000).toISOString()

      const { data: sessoesNoite } = await supabase
        .from('sessoes')
        .select('id, confirmacoes_whatsapp!left(tipo_lembrete)')
        .eq('user_id', config.user_id)
        .gte('data_hora', noiteFrom)
        .lte('data_hora', noiteTo)
        .in('status', ['agendada', 'confirmada'])

      for (const s of sessoesNoite ?? []) {
        const jaEnviado = (s.confirmacoes_whatsapp as any[])?.some((c: any) => c.tipo_lembrete === 'lembrete_noite')
        if (jaEnviado) continue
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-lembrete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
          body: JSON.stringify({ sessao_id: s.id, tipo: 'lembrete_noite' }),
        })
        const body = await resp.json()
        allResults.push({ sessao_id: s.id, tipo: 'lembrete_noite', result: body.ok ? 'sent' : (body.skipped ?? 'error') })
      }
    }

    const manhaEarlyFrom = new Date(nowMs + 1.5 * 3600_000).toISOString()
    const manhaEarlyTo   = new Date(nowMs + 2.5 * 3600_000).toISOString()
    const manhaTodayFrom = now.toISOString()
    const manhaTodayTo   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 3, 0)).toISOString()

    const fromTime = isNearLembrete2 ? manhaTodayFrom : manhaEarlyFrom
    const toTime   = isNearLembrete2 ? manhaTodayTo   : manhaEarlyTo

    const { data: sessoesManha } = await supabase
      .from('sessoes')
      .select('id, data_hora, confirmacoes_whatsapp!left(tipo_lembrete, confirmado)')
      .eq('user_id', config.user_id)
      .gte('data_hora', fromTime)
      .lte('data_hora', toTime)
      .in('status', ['agendada', 'confirmada'])

    for (const s of sessoesManha ?? []) {
      const confs = s.confirmacoes_whatsapp as any[]
      if (confs?.some((c: any) => c.tipo_lembrete === 'lembrete_manha')) continue
      if (confs?.some((c: any) => c.confirmado !== null)) continue

      const sessaoMs = new Date(s.data_hora).getTime()
      const isEarly  = sessaoMs < earlyThresholdMs
      if (isEarly) {
        const twoHourBefore = sessaoMs - 2 * 3600_000
        if (Math.abs(nowMs - twoHourBefore) > 15 * 60_000) continue
      } else {
        if (!isNearLembrete2) continue
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-lembrete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ sessao_id: s.id, tipo: 'lembrete_manha' }),
      })
      const body = await resp.json()
      allResults.push({ sessao_id: s.id, tipo: 'lembrete_manha', result: body.ok ? 'sent' : (body.skipped ?? 'error') })
    }
  }

  return new Response(JSON.stringify({ processed: allResults.length, results: allResults }), { status: 200 })
})
