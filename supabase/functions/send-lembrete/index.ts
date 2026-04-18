import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { normalizePhone, buildButtonText } from '../_shared/phone.ts'

const EVOLUTION_API_URL = Deno.env.get('EVOLUTION_API_URL')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const { sessao_id, tipo } = await req.json() as { sessao_id: string; tipo: '48h' | '24h' | '2h' }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // 1. Check automation is active
  const { data: config } = await supabase
    .from('config_psicologo')
    .select('automacao_whatsapp_ativa, whatsapp_conectado, evolution_instance_name, evolution_token, nome')
    .limit(1).single()

  if (!config?.automacao_whatsapp_ativa || !config?.whatsapp_conectado) {
    return new Response(JSON.stringify({ skipped: 'automação inativa' }), { headers: corsHeaders })
  }

  // 2. Fetch session + patient phone
  const { data: sessao } = await supabase
    .from('sessoes')
    .select('id, data_hora, avulso_nome, avulso_telefone, paciente_id, pacientes(nome, telefone)')
    .eq('id', sessao_id)
    .in('status', ['agendada', 'confirmada'])
    .single()

  if (!sessao) {
    return new Response(JSON.stringify({ error: 'sessão não encontrada' }), { status: 404, headers: corsHeaders })
  }

  const nome = (sessao.pacientes as any)?.nome ?? sessao.avulso_nome ?? 'Paciente'
  const telefone = (sessao.pacientes as any)?.telefone ?? sessao.avulso_telefone
  if (!telefone) {
    return new Response(JSON.stringify({ error: 'sem telefone' }), { status: 422, headers: corsHeaders })
  }

  const phone = normalizePhone(telefone)
  const dataHora = new Date(sessao.data_hora)
  const hora = dataHora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const diaSemana = dataHora.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' })
  const texto = buildButtonText(tipo, nome, hora, diaSemana)

  // 3. Insert confirmacao (unique index prevents double-send)
  const { data: confirmacao, error: insertError } = await supabase
    .from('confirmacoes_whatsapp')
    .insert({ sessao_id, tipo_lembrete: tipo, mensagem_enviada_em: new Date().toISOString(), lida: false, remarcacao_solicitada: false })
    .select('id')
    .single()

  if (insertError?.code === '23505') {
    return new Response(JSON.stringify({ skipped: 'já enviado' }), { headers: corsHeaders })
  }
  if (insertError) throw insertError

  // 4. Call Evolution API
  const evoResp = await fetch(
    `${EVOLUTION_API_URL}/message/sendButtons/${config.evolution_instance_name}`,
    {
      method: 'POST',
      headers: { 'apikey': config.evolution_token!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: phone,
        title: 'Confirmação de Sessão',
        description: texto,
        footer: config.nome ? `Psicóloga ${config.nome}` : 'Seu consultório',
        buttons: [
          { type: 'reply', reply: { id: 'CONFIRMAR', title: '✅ Confirmar' } },
          { type: 'reply', reply: { id: 'CANCELAR',  title: '❌ Cancelar' } },
        ],
      }),
    }
  )

  if (!evoResp.ok) {
    // Rollback so it can be retried
    await supabase.from('confirmacoes_whatsapp').delete().eq('id', confirmacao!.id)
    const errBody = await evoResp.text()
    return new Response(JSON.stringify({ error: 'Evolution API falhou', detail: errBody }), { status: 502, headers: corsHeaders })
  }

  return new Response(JSON.stringify({ ok: true, confirmacao_id: confirmacao!.id }), { headers: corsHeaders })
})
