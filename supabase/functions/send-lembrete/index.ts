import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizePhone, buildReminderText } from '../_shared/phone.ts'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const EVOLUTION_API_KEY = Deno.env.get('EVOLUTION_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { sessao_id, tipo, test } = await req.json() as {
    sessao_id: string
    tipo: 'lembrete_noite' | 'lembrete_manha'
    test?: boolean
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 1. Fetch session (includes user_id)
  const { data: sessao } = await supabase
    .from('sessoes')
    .select('id, data_hora, user_id, avulso_nome, avulso_telefone, paciente_id, pacientes(nome, telefone)')
    .eq('id', sessao_id)
    .in('status', ['agendada', 'confirmada'])
    .single()

  if (!sessao) {
    return new Response(JSON.stringify({ error: 'Sessão não encontrada ou status inválido' }), { status: 404, headers: corsHeaders })
  }

  // 2. Fetch config for this specific tenant
  const { data: config } = await supabase
    .from('config_psicologo')
    .select('automacao_whatsapp_ativa, whatsapp_conectado, evolution_instance_name, evolution_token, nome')
    .eq('user_id', sessao.user_id)
    .single()

  // Check subscription allows WhatsApp
  const { data: assinatura } = await supabase
    .from('assinaturas')
    .select('plano, status, trial_fim')
    .eq('user_id', sessao.user_id)
    .single()

  const hoje = new Date().toISOString().slice(0, 10)
  const podUsarWhatsapp =
    assinatura?.plano === 'completo' &&
    (assinatura?.status === 'ativo' ||
      (assinatura?.status === 'trial' && (assinatura?.trial_fim ?? '') >= hoje))

  if (!podUsarWhatsapp) {
    return new Response(
      JSON.stringify({ error: 'Plano não permite WhatsApp. Faça upgrade para o plano Completo.' }),
      { status: 403, headers: corsHeaders }
    )
  }

  if (!config?.whatsapp_conectado || !config?.evolution_instance_name) {
    return new Response(JSON.stringify({ error: 'WhatsApp não conectado' }), { status: 412, headers: corsHeaders })
  }
  if (!test && !config.automacao_whatsapp_ativa) {
    return new Response(JSON.stringify({ skipped: 'automação inativa' }), { headers: corsHeaders })
  }

  const nome = (sessao.pacientes as any)?.nome ?? sessao.avulso_nome ?? 'Paciente'
  const telefoneRaw = (sessao.pacientes as any)?.telefone ?? sessao.avulso_telefone
  if (!telefoneRaw) {
    return new Response(JSON.stringify({ error: 'sem telefone cadastrado para este paciente' }), { status: 422, headers: corsHeaders })
  }

  const phone = normalizePhone(telefoneRaw)
  const dataHora = new Date(sessao.data_hora)
  const hora = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const diaSemana = dataHora.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })
  const descricao = buildReminderText(tipo, nome, hora, diaSemana)
  const texto = test
    ? `🧪 *TESTE — este é um lembrete de teste*\n\n${descricao}`
    : descricao

  const instance = config.evolution_instance_name
  const diag: Record<string, unknown> = {
    test: !!test,
    telefoneRaw,
    phoneNormalized: phone,
    instance,
    evolutionUrl: EVOLUTION_API_URL,
  }

  // 3. In test mode: verify connection state with Evolution API before sending
  if (test) {
    try {
      const stateResp = await fetch(
        `${EVOLUTION_API_URL}/instance/connectionState/${instance}`,
        { headers: { 'apikey': EVOLUTION_API_KEY } }
      )
      const stateBody = await stateResp.text()
      diag.connectionStateStatus = stateResp.status
      diag.connectionStateBody = stateBody
      console.log(`[test] connectionState [${stateResp.status}]: ${stateBody}`)

      if (!stateResp.ok) {
        return new Response(JSON.stringify({ error: 'instância não responde', ...diag }), { status: 502, headers: corsHeaders })
      }
      const parsed = JSON.parse(stateBody)
      if (parsed?.instance?.state !== 'open') {
        // Sync DB with reality so the UI shows State B and the user can reconnect
        await supabase.from('config_psicologo').update({ whatsapp_conectado: false }).eq('user_id', sessao.user_id)
        return new Response(JSON.stringify({ error: `instância não está conectada (state=${parsed?.instance?.state}). Reconecte escaneando um novo QR Code.`, ...diag }), { status: 412, headers: corsHeaders })
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: 'falha ao verificar conexão', detail: String(e), ...diag }), { status: 502, headers: corsHeaders })
    }
  }

  // 4. In production mode: insert confirmacao row (unique index prevents double-send)
  let confirmacaoId: string | null = null
  if (!test) {
    const { data: confirmacao, error: insertError } = await supabase
      .from('confirmacoes_whatsapp')
      .insert({ sessao_id, tipo_lembrete: tipo, mensagem_enviada_em: new Date().toISOString(), lida: false, remarcacao_solicitada: false, user_id: sessao.user_id })
      .select('id')
      .single()

    if (insertError?.code === '23505') {
      return new Response(JSON.stringify({ skipped: 'já enviado' }), { headers: corsHeaders })
    }
    if (insertError) throw insertError
    confirmacaoId = confirmacao!.id
  }

  // 5. Send via sendText — button messages silently drop on personal WhatsApp (Baileys)
  const evoResp = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'apikey': EVOLUTION_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: phone, text: texto }),
  })
  const evoBody = await evoResp.text()
  diag.sendStatus = evoResp.status
  diag.sendBody = evoBody
  console.log(`Evolution send [${evoResp.status}] phone=${phone} instance=${instance}: ${evoBody}`)

  if (!evoResp.ok) {
    // Rollback confirmacao in production mode
    if (confirmacaoId) {
      await supabase.from('confirmacoes_whatsapp').delete().eq('id', confirmacaoId)
    }
    return new Response(JSON.stringify({ error: 'Evolution API falhou', ...diag }), { status: 502, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ ok: true, confirmacao_id: confirmacaoId, ...diag }), { headers: corsHeaders })
})
