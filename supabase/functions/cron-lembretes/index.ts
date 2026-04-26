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

  // Fetch reminder schedule config
  const { data: config } = await supabase
    .from('config_psicologo')
    .select('horario_lembrete_1, horario_lembrete_2, horario_inicio')
    .limit(1)
    .single()

  const horarioLembrete2 = config?.horario_lembrete_2 ?? '07:00'
  const horarioInicio = config?.horario_inicio ?? '07:00'

  function todayAt(hhmm: string): Date {
    const [h, m] = hhmm.split(':').map(Number)
    const d = new Date(now)
    d.setUTCHours(h, m, 0, 0)
    return d
  }

  const lembrete2Time = todayAt(horarioLembrete2)
  const inicioTime = todayAt(horarioInicio)

  // Threshold for "early session": session_time < horario_inicio + 2h
  const earlyThresholdMs = inicioTime.getTime() + 2 * 3600_000

  const results: Array<{ sessao_id: string; tipo: string; result: string }> = []

  // --- WINDOW A: lembrete_noite ---
  // Sessions scheduled for [now + 17.5h, now + 24h] that haven't received lembrete_noite
  const noiteFrom = new Date(nowMs + 17.5 * 3600_000).toISOString()
  const nioteTo   = new Date(nowMs + 24   * 3600_000).toISOString()

  const { data: sessoesNoite } = await supabase
    .from('sessoes')
    .select('id, confirmacoes_whatsapp!left(tipo_lembrete)')
    .gte('data_hora', noiteFrom)
    .lte('data_hora', nioteTo)
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
    results.push({ sessao_id: s.id, tipo: 'lembrete_noite', result: body.ok ? 'sent' : (body.skipped ?? 'error') })
  }

  // --- WINDOW B: lembrete_manha ---
  // B1 (early sessions): session_time < earlyThreshold AND session_time - 2h is near now (±15min)
  // B2 (standard sessions): session_time >= earlyThreshold AND current time is within 15min of horario_lembrete_2

  const isNearLembrete2 = Math.abs(nowMs - lembrete2Time.getTime()) <= 15 * 60_000

  // B1: sessions in [now + 1.5h, now + 2.5h]
  const manhaEarlyFrom = new Date(nowMs + 1.5 * 3600_000).toISOString()
  const manhaEarlyTo   = new Date(nowMs + 2.5 * 3600_000).toISOString()

  // B2: sessions from now until end of day (if within lembrete_2 window)
  const manhaTodayFrom = now.toISOString()
  const manhaTodayTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59).toISOString()

  const fromTime = isNearLembrete2 ? manhaTodayFrom : manhaEarlyFrom
  const toTime   = isNearLembrete2 ? manhaTodayTo   : manhaEarlyTo

  const { data: sessoesManha } = await supabase
    .from('sessoes')
    .select('id, data_hora, confirmacoes_whatsapp!left(tipo_lembrete, confirmado)')
    .gte('data_hora', fromTime)
    .lte('data_hora', toTime)
    .in('status', ['agendada', 'confirmada'])

  for (const s of sessoesManha ?? []) {
    const confs = s.confirmacoes_whatsapp as any[]

    // Skip if already sent lembrete_manha
    if (confs?.some((c: any) => c.tipo_lembrete === 'lembrete_manha')) continue

    // Skip if patient already responded to lembrete_noite (confirmed or cancelled)
    if (confs?.some((c: any) => c.confirmado !== null)) continue

    const sessaoMs = new Date(s.data_hora).getTime()
    const isEarly = sessaoMs < earlyThresholdMs

    // B1: early session — only send if session_time - 2h is near now
    if (isEarly) {
      const twoHourBefore = sessaoMs - 2 * 3600_000
      if (Math.abs(nowMs - twoHourBefore) > 15 * 60_000) continue
    } else {
      // B2: standard session — only send if we're in the lembrete_2 window
      if (!isNearLembrete2) continue
    }

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-lembrete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ sessao_id: s.id, tipo: 'lembrete_manha' }),
    })
    const body = await resp.json()
    results.push({ sessao_id: s.id, tipo: 'lembrete_manha', result: body.ok ? 'sent' : (body.skipped ?? 'error') })
  }

  return new Response(JSON.stringify({ processed: results.length, results }), { status: 200 })
})
