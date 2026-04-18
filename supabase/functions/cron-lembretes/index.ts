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

  const windows: Array<[number, number, '48h' | '24h' | '2h']> = [
    [47 * 3600_000, 49 * 3600_000, '48h'],
    [23 * 3600_000, 25 * 3600_000, '24h'],
    [1.5 * 3600_000, 2.5 * 3600_000, '2h'],
  ]

  const results: Array<{ sessao_id: string; tipo: string; result: string }> = []

  for (const [minMs, maxMs, tipo] of windows) {
    const from = new Date(now.getTime() + minMs).toISOString()
    const to   = new Date(now.getTime() + maxMs).toISOString()

    const { data: sessoes } = await supabase
      .from('sessoes')
      .select('id, confirmacoes_whatsapp!left(tipo_lembrete)')
      .gte('data_hora', from)
      .lte('data_hora', to)
      .in('status', ['agendada', 'confirmada'])

    if (!sessoes) continue

    for (const s of sessoes) {
      const jaEnviado = (s.confirmacoes_whatsapp as any[])?.some((c: any) => c.tipo_lembrete === tipo)
      if (jaEnviado) continue

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-lembrete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({ sessao_id: s.id, tipo }),
      })
      const body = await resp.json()
      results.push({ sessao_id: s.id, tipo, result: body.ok ? 'sent' : (body.skipped ?? 'error') })
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), { status: 200 })
})
