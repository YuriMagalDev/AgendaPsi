// supabase/functions/google-calendar-ical/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface SessaoRow {
  id: string
  data_hora: string
  duracao_minutos: number
  status: string
  notas_checklist: string | null
  avulso_nome: string | null
  pacientes: { nome: string } | null
  modalidades_sessao: { nome: string } | null
}

function toICalDate(isoDate: string): string {
  return isoDate.replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function buildICalFeed(sessions: SessaoRow[]): string {
  const now = toICalDate(new Date().toISOString())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AgendaPsi//Calendar//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:AgendaPsi',
    'X-WR-CALDESC:Agenda do Psicólogo',
    'X-WR-TIMEZONE:America/Sao_Paulo',
  ]

  for (const s of sessions) {
    const startDt  = new Date(s.data_hora)
    const endDt    = new Date(startDt.getTime() + s.duracao_minutos * 60_000)
    const nome     = s.pacientes?.nome ?? s.avulso_nome ?? 'Avulso'
    const summary  = `Sessão com ${escapeICalText(nome)}`

    const descParts = [s.modalidades_sessao?.nome, s.notas_checklist].filter(Boolean) as string[]
    const description = descParts.map(escapeICalText).join('\\n')

    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@agendapsi`,
      `DTSTAMP:${now}`,
      `DTSTART:${toICalDate(startDt.toISOString())}`,
      `DTEND:${toICalDate(endDt.toISOString())}`,
      `SUMMARY:${summary}`,
      ...(description ? [`DESCRIPTION:${description}`] : []),
      'TRANSP:OPAQUE',
      'SEQUENCE:0',
      'STATUS:CONFIRMED',
      'END:VEVENT',
    )
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

serve(async (req) => {
  const url   = new URL(req.url)
  const token = url.searchParams.get('token')

  if (!token) {
    return new Response('Token obrigatório', { status: 400 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: config, error } = await supabase
    .from('config_psicologo')
    .select('user_id, ical_token')
    .eq('ical_token', token)
    .maybeSingle()

  if (error || !config) {
    return new Response('Token inválido', { status: 401 })
  }

  // Single-user app: no user_id filter on sessoes needed (all sessions belong to one user).
  // When multi-tenant (Plan 1) runs, add .eq('user_id', config.user_id).
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString()
  const until = new Date(Date.now() + 90 * 24 * 3600_000).toISOString()

  const { data: sessions } = await supabase
    .from('sessoes')
    .select('id, data_hora, duracao_minutos, status, notas_checklist, avulso_nome, pacientes(nome), modalidades_sessao(nome)')
    .gte('data_hora', since)
    .lte('data_hora', until)
    .order('data_hora')

  const icalFeed = buildICalFeed((sessions ?? []) as SessaoRow[])

  return new Response(icalFeed, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="agendapsi.ics"',
      'Cache-Control': 'no-cache',
    },
  })
})
