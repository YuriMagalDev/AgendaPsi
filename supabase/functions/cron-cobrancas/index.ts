import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const now      = new Date()
  const results: Array<{ sessao_id: string; etapa: number; result: string }> = []

  try {
    // 1. Find all users with régua de cobrança enabled
    const { data: configs, error: configsErr } = await supabase
      .from('config_psicologo')
      .select('user_id, regua_cobranca_modo, chave_pix')
      .eq('regua_cobranca_ativa', true)

    if (configsErr) {
      return new Response(
        JSON.stringify({ error: 'Config fetch failed', detail: configsErr.message }),
        { status: 500 }
      )
    }

    for (const config of configs ?? []) {
      // 2. Fetch active rules for this user
      const { data: regras, error: regrasErr } = await supabase
        .from('regras_cobranca')
        .select('etapa, dias_apos, template_mensagem')
        .eq('ativo', true)

      if (regrasErr || !regras || regras.length === 0) continue

      // 3. Fetch unpaid sessions
      const { data: sessoes, error: sessoesErr } = await supabase
        .from('sessoes')
        .select(`
          id,
          data_hora,
          valor_cobrado,
          avulso_nome,
          avulso_telefone,
          pacientes(nome),
          cobracas_enviadas!left(etapa, status)
        `)
        .in('status', ['concluida', 'faltou'])
        .eq('pago', false)
        .not('valor_cobrado', 'is', null)

      if (sessoesErr) continue

      for (const sessao of sessoes ?? []) {
        const sessaoDate   = new Date(sessao.data_hora)
        const hoursElapsed = (now.getTime() - sessaoDate.getTime()) / 3_600_000

        for (const regra of regras) {
          const hoursRequired = regra.dias_apos * 24
          if (hoursElapsed < hoursRequired) continue

          const alreadyDone = (sessao.cobracas_enviadas as any[] ?? []).some(
            (c: any) => c.etapa === regra.etapa && c.status !== 'cancelado'
          )
          if (alreadyDone) continue

          const pacienteName = (sessao.pacientes as any)?.nome ?? sessao.avulso_nome ?? 'Paciente'
          const dataSessao   = sessaoDate.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          const valor        = (sessao.valor_cobrado as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
          const chavePix     = config.chave_pix ?? '(não configurada)'

          const mensagemTexto = regra.template_mensagem
            .replace(/\{\{nome\}\}/g,        pacienteName)
            .replace(/\{\{valor\}\}/g,       valor)
            .replace(/\{\{data_sessao\}\}/g, dataSessao)
            .replace(/\{\{chave_pix\}\}/g,   chavePix)

          const statusInicial = config.regua_cobranca_modo === 'auto' ? 'agendado' : 'pendente'

          const { data: nova, error: insertErr } = await supabase
            .from('cobracas_enviadas')
            .insert({
              user_id:        config.user_id,
              sessao_id:      sessao.id,
              etapa:          regra.etapa,
              status:         statusInicial,
              mensagem_texto: mensagemTexto,
              data_agendado:  now.toISOString(),
            })
            .select('id')
            .single()

          if (insertErr) {
            if (insertErr.code === '23505') {
              results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: 'duplicate_skipped' })
              continue
            }
            results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: 'insert_error' })
            continue
          }

          if (config.regua_cobranca_modo === 'auto') {
            try {
              const sendResp = await fetch(`${SUPABASE_URL}/functions/v1/cobranca-whatsapp`, {
                method:  'POST',
                headers: {
                  'Content-Type':  'application/json',
                  'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({ cobranca_id: nova!.id }),
              })
              const sendBody = await sendResp.json()
              const resultStr = sendResp.ok
                ? (sendBody.ok ? 'sent' : (sendBody.skipped ?? 'unknown'))
                : (sendBody.error ?? 'send_error')
              results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: resultStr })
            } catch (e) {
              results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: 'send_exception' })
            }
          } else {
            results.push({ sessao_id: sessao.id, etapa: regra.etapa, result: 'pending_approval' })
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { status: 200 }
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Erro interno', detail: String(e) }),
      { status: 500 }
    )
  }
})
