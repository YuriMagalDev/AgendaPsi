import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EVOLUTION_API_URL  = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY  = Deno.env.get('EVOLUTION_API_KEY')!
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type':                 'application/json',
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 11) return '55' + digits
  if (digits.length === 10) return '55' + digits
  return '55' + digits.slice(-11)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const { data: { user }, error: userError } = await supabase.auth.getUser(token)
  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'Não autenticado' }),
      { status: 401, headers: corsHeaders }
    )
  }

  const body = await req.json() as {
    cobranca_id?: string
    sessao_id?:   string
    etapa?:       number
    enqueue?:     boolean
    test?:        boolean
  }

  const { cobranca_id, sessao_id, etapa, enqueue, test } = body
  let cobrancaId = cobranca_id

  // Mode 2: enqueue + send immediately
  if (enqueue && sessao_id && etapa) {
    const { data: sessao, error: sessaoErr } = await supabase
      .from('sessoes')
      .select('id, data_hora, valor_cobrado, pago, avulso_nome, avulso_telefone, pacientes(nome, telefone)')
      .eq('id', sessao_id)
      .single()

    if (sessaoErr || !sessao) {
      return new Response(
        JSON.stringify({ error: 'Sessão não encontrada' }),
        { status: 404, headers: corsHeaders }
      )
    }

    if (sessao.pago) {
      return new Response(
        JSON.stringify({ skipped: 'Sessão já marcada como paga' }),
        { headers: corsHeaders }
      )
    }

    const { data: regra, error: regraErr } = await supabase
      .from('regras_cobranca')
      .select('template_mensagem, dias_apos, ativo')
      .eq('etapa', etapa)
      .single()

    if (regraErr || !regra || !regra.ativo) {
      return new Response(
        JSON.stringify({ error: `Regra de etapa ${etapa} não encontrada ou inativa` }),
        { status: 404, headers: corsHeaders }
      )
    }

    const { data: cfg } = await supabase
      .from('config_psicologo')
      .select('chave_pix')
      .single()

    const pacienteName = (sessao.pacientes as any)?.nome ?? sessao.avulso_nome ?? 'Paciente'
    const dataSessao   = new Date(sessao.data_hora).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    const valor        = sessao.valor_cobrado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) ?? '0,00'
    const chavePix     = (cfg as any)?.chave_pix ?? '(não configurada)'

    const mensagemTexto = regra.template_mensagem
      .replace(/\{\{nome\}\}/g,        pacienteName)
      .replace(/\{\{valor\}\}/g,       valor)
      .replace(/\{\{data_sessao\}\}/g, dataSessao)
      .replace(/\{\{chave_pix\}\}/g,   chavePix)

    const { data: nova, error: insertErr } = await supabase
      .from('cobracas_enviadas')
      .insert({
        sessao_id,
        etapa,
        status:         'agendado',
        mensagem_texto: mensagemTexto,
        data_agendado:  new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertErr || !nova) {
      return new Response(
        JSON.stringify({ error: 'Erro ao criar registro de cobrança', detail: insertErr?.message }),
        { status: 500, headers: corsHeaders }
      )
    }

    cobrancaId = nova.id
  }

  if (!cobrancaId) {
    return new Response(
      JSON.stringify({ error: 'Parâmetro cobranca_id ou (sessao_id + etapa) obrigatório' }),
      { status: 400, headers: corsHeaders }
    )
  }

  const { data: cobranca, error: cobrancaErr } = await supabase
    .from('cobracas_enviadas')
    .select('id, sessao_id, etapa, status, mensagem_texto')
    .eq('id', cobrancaId)
    .single()

  if (cobrancaErr || !cobranca) {
    return new Response(
      JSON.stringify({ error: 'Cobrança não encontrada' }),
      { status: 404, headers: corsHeaders }
    )
  }

  if (cobranca.status === 'enviado') {
    return new Response(JSON.stringify({ skipped: 'Já enviado anteriormente' }), { headers: corsHeaders })
  }

  if (cobranca.status === 'cancelado') {
    return new Response(JSON.stringify({ skipped: 'Cobrança cancelada' }), { headers: corsHeaders })
  }

  const { data: config, error: configErr } = await supabase
    .from('config_psicologo')
    .select('whatsapp_conectado, evolution_instance_name')
    .single()

  if (configErr || !config?.whatsapp_conectado || !config?.evolution_instance_name) {
    return new Response(
      JSON.stringify({ error: 'WhatsApp não conectado' }),
      { status: 412, headers: corsHeaders }
    )
  }

  const { data: sessao, error: sessaoErr2 } = await supabase
    .from('sessoes')
    .select('avulso_telefone, pago, pacientes(telefone)')
    .eq('id', cobranca.sessao_id)
    .single()

  if (sessaoErr2 || !sessao) {
    return new Response(
      JSON.stringify({ error: 'Sessão não encontrada' }),
      { status: 404, headers: corsHeaders }
    )
  }

  if (sessao.pago) {
    await supabase
      .from('cobracas_enviadas')
      .update({ status: 'cancelado', erro_detalhes: 'Sessão paga antes do envio' })
      .eq('id', cobrancaId)
    return new Response(
      JSON.stringify({ skipped: 'Sessão paga — cobrança cancelada automaticamente' }),
      { headers: corsHeaders }
    )
  }

  const telefoneRaw = (sessao.pacientes as any)?.telefone ?? sessao.avulso_telefone
  if (!telefoneRaw) {
    const err = 'Sem telefone cadastrado para este paciente'
    await supabase
      .from('cobracas_enviadas')
      .update({ status: 'falha', erro_detalhes: err })
      .eq('id', cobrancaId)
    return new Response(JSON.stringify({ error: err }), { status: 422, headers: corsHeaders })
  }

  const phone    = normalizePhone(telefoneRaw)
  const instance = config.evolution_instance_name
  const diag: Record<string, unknown> = { telefoneRaw, phoneNormalized: phone, instance, test: !!test }

  if (test) {
    try {
      const stateResp = await fetch(
        `${EVOLUTION_API_URL}/instance/connectionState/${instance}`,
        { headers: { apikey: EVOLUTION_API_KEY } }
      )
      const stateBody = await stateResp.text()
      diag.connectionStateStatus = stateResp.status
      diag.connectionStateBody   = stateBody
      if (!stateResp.ok) {
        return new Response(
          JSON.stringify({ error: 'Instância não responde', ...diag }),
          { status: 502, headers: corsHeaders }
        )
      }
      const parsed = JSON.parse(stateBody)
      if (parsed?.instance?.state !== 'open') {
        return new Response(
          JSON.stringify({ error: `Instância não está conectada (state=${parsed?.instance?.state})`, ...diag }),
          { status: 412, headers: corsHeaders }
        )
      }
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Falha ao verificar conexão', detail: String(e), ...diag }),
        { status: 502, headers: corsHeaders }
      )
    }
  }

  const evoResp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
    method:  'POST',
    headers: { apikey: EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ number: phone, text: cobranca.mensagem_texto }),
  })
  const evoBody = await evoResp.text()
  diag.sendStatus = evoResp.status
  diag.sendBody   = evoBody

  if (!evoResp.ok) {
    const errMsg = `Evolution API falhou (${evoResp.status}): ${evoBody}`
    await supabase
      .from('cobracas_enviadas')
      .update({ status: 'falha', erro_detalhes: errMsg })
      .eq('id', cobrancaId)
    return new Response(
      JSON.stringify({ error: 'Falha no envio via Evolution API', ...diag }),
      { status: 502, headers: corsHeaders }
    )
  }

  await supabase
    .from('cobracas_enviadas')
    .update({ status: 'enviado', data_enviado: new Date().toISOString(), erro_detalhes: null })
    .eq('id', cobrancaId)

  return new Response(
    JSON.stringify({ ok: true, cobranca_id: cobrancaId, ...diag }),
    { headers: corsHeaders }
  )
})
