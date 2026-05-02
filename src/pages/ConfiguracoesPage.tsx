import { useState, useEffect } from 'react'
import { format, formatDistance } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { useConvenios } from '@/hooks/useConvenios'
import { useModalidadesSessao } from '@/hooks/useModalidadesSessao'
import { useMeiosAtendimento } from '@/hooks/useMeiosAtendimento'
import { useConfigPsicologo } from '@/hooks/useConfigPsicologo'
import { useReguaCobranca } from '@/hooks/useReguaCobranca'
import { useGoogleCalendarSync } from '@/hooks/useGoogleCalendarSync'
import { ReguaCobrancaTemplateEditor } from '@/components/regua-cobranca/ReguaCobrancaTemplateEditor'
import { RiscoConfigSection } from '@/components/configuracoes/RiscoConfigSection'
import type { EtapaCobranca, ModoCobracaWhatsapp } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2 } from 'lucide-react'

const inputClass = "h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function ConfiguracoesPage() {
  const { convenios, loading: loadingConvenios, addConvenio, toggleAtivo: toggleConvenio, updateValor } = useConvenios()
  const { modalidadesSessao, loading: loadingModalidadesSessao, addModalidadeSessao, toggleAtivo: toggleModalidadeSessao } = useModalidadesSessao()
  const { meiosAtendimento, loading: loadingMeiosAtendimento, addMeioAtendimento, toggleAtivo: toggleMeioAtendimento } = useMeiosAtendimento()
  const { config, loading: loadingConfig, updateConfig, refetch: refetchConfig } = useConfigPsicologo()

  const {
    regras,
    loading: loadingRegras,
    fetchRegras,
    salvarRegra,
    deletarRegra,
  } = useReguaCobranca()

  const { status: googleSync, loading: loadingGoogleSync, connect: conectarGoogle, disconnect: desconectarGoogle, updateSyncSettings: atualizarGoogleSync, syncNow: sincronizarAgora, error: googleSyncError, refetch: refetchGoogleSync } = useGoogleCalendarSync()

  useEffect(() => { fetchRegras() }, [])

  // Convênios state
  const [nomeConvenio, setNomeConvenio] = useState('')
  const [valorConvenio, setValorConvenio] = useState('')
  const [editandoValor, setEditandoValor] = useState<Record<string, string>>({})

  // Modalidades de Sessão state
  const [nomeModalidadeSessao, setNomeModalidadeSessao] = useState('')
  const [emojiModalidadeSessao, setEmojiModalidadeSessao] = useState('')

  // Meios de Atendimento state
  const [nomeMeioAtendimento, setNomeMeioAtendimento] = useState('')
  const [emojiMeioAtendimento, setEmojiMeioAtendimento] = useState('')

  // Config state
  const [configForm, setConfigForm] = useState({ nome: '', horario_inicio: '', horario_fim: '', horario_lembrete_1: '', horario_lembrete_2: '' })
  const [configSynced, setConfigSynced] = useState(false)
  const [salvandoConfig, setSalvandoConfig] = useState(false)

  // WhatsApp state
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [pollingStatus, setPollingStatus] = useState(false)
  const [pollingAttempts, setPollingAttempts] = useState(0)
  const [conectando, setConectando] = useState(false)
  const [testando, setTestando] = useState<'lembrete_noite' | 'lembrete_manha' | null>(null)
  const [sessaoTesteId, setSessaoTesteId] = useState<string>('')
  const [sessoesDisponiveis, setSessoesDisponiveis] = useState<Array<{ id: string; label: string }>>([])

  // Google Calendar state
  const [conectandoGoogle, setConectandoGoogle]       = useState(false)
  const [desconectandoGoogle, setDesconectandoGoogle] = useState(false)

  if (config && !configSynced) {
    setConfigForm({
      nome: config.nome ?? '',
      horario_inicio: config.horario_inicio ?? '07:00',
      horario_fim: config.horario_fim ?? '21:00',
      horario_lembrete_1: config.horario_lembrete_1 ?? '18:00',
      horario_lembrete_2: config.horario_lembrete_2 ?? '07:00',
    })
    setConfigSynced(true)
  }

  function handleAddConvenio() {
    if (!nomeConvenio.trim()) return
    addConvenio(nomeConvenio.trim(), valorConvenio ? Number(valorConvenio) : null)
    setNomeConvenio('')
    setValorConvenio('')
  }

  function handleValorBlur(id: string) {
    const v = editandoValor[id]
    if (v !== undefined) {
      updateValor(id, v === '' ? null : Number(v))
      setEditandoValor(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  function handleAddModalidadeSessao() {
    if (!nomeModalidadeSessao.trim() || !emojiModalidadeSessao.trim()) return
    addModalidadeSessao(nomeModalidadeSessao.trim(), emojiModalidadeSessao.trim())
    setNomeModalidadeSessao('')
    setEmojiModalidadeSessao('')
  }

  function handleAddMeioAtendimento() {
    if (!nomeMeioAtendimento.trim() || !emojiMeioAtendimento.trim()) return
    addMeioAtendimento(nomeMeioAtendimento.trim(), emojiMeioAtendimento.trim())
    setNomeMeioAtendimento('')
    setEmojiMeioAtendimento('')
  }

  async function carregarSessoesParaTeste() {
    const { data } = await supabase
      .from('sessoes')
      .select('id, data_hora, avulso_nome, pacientes(nome)')
      .gte('data_hora', new Date().toISOString())
      .in('status', ['agendada', 'confirmada'])
      .order('data_hora')
      .limit(10)
    const opcoes = (data ?? []).map(s => ({
      id: s.id,
      label: `${(s.pacientes as any)?.nome ?? s.avulso_nome ?? 'Avulso'} — ${format(new Date(s.data_hora), "EEE dd/MM 'às' HH:mm", { locale: ptBR })}`,
    }))
    setSessoesDisponiveis(opcoes)
    if (opcoes.length > 0) setSessaoTesteId(opcoes[0].id)
  }

  async function iniciarConexao() {
    setConectando(true)
    try {
      const { error: errCreate } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'create' } })
      if (errCreate) {
        const body = await (errCreate as any).context?.text?.()
        console.error('whatsapp-setup create error:', errCreate, body)
        toast.error(`Erro (create): ${body ?? errCreate.message}`)
        return
      }
      // Refresh config so UI transitions to State B (QR view)
      await refetchConfig()
      const { data, error: errQr } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'qr' } })
      if (errQr) {
        const body = await (errQr as any).context?.text?.()
        console.error('whatsapp-setup qr error:', errQr, body)
        toast.error(`Erro (qr): ${body ?? errQr.message}`)
        return
      }
      setQrBase64(data?.qr ?? null)
      setPollingStatus(true)
      setPollingAttempts(0)
    } catch (e: any) {
      console.error('iniciarConexao error:', e)
      toast.error(`Erro: ${e.message ?? JSON.stringify(e)}`)
    } finally {
      setConectando(false)
    }
  }

  async function verificarConexao() {
    const { data, error } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'status' } })
    console.log('[verificarConexao]', data, error)
    if (error) {
      const body = await (error as any).context?.text?.()
      toast.error(`Erro: ${body ?? error.message}`, { duration: 10000 })
      return
    }
    if (data?.connected) {
      await refetchConfig()
      toast.success('Conectado!')
      return
    }
    toast.error(`Estado atual: ${data?.state ?? 'desconhecido'}. Aguarde alguns segundos após escanear e tente novamente.`, { duration: 8000 })
  }

  async function reconectar() {
    if (!confirm('A sessão do WhatsApp caiu. Reconectar vai pedir um novo QR Code. Continuar?')) return
    if (!config?.id) return
    await supabase.from('config_psicologo').update({ whatsapp_conectado: false }).eq('id', config.id)
    await refetchConfig()
    setQrBase64(null)
  }

  async function triggerTest(tipo: 'lembrete_noite' | 'lembrete_manha') {
    if (!sessaoTesteId) return toast.error('Selecione uma sessão')
    setTestando(tipo)
    try {
      const { data, error } = await supabase.functions.invoke('send-lembrete', {
        body: { sessao_id: sessaoTesteId, tipo, test: true },
      })
      console.log('[teste WhatsApp] data:', data, 'error:', error)
      if (error) {
        const body = await (error as any).context?.text?.()
        toast.error(`Erro: ${body ?? error.message}`, { duration: 10000 })
        return
      }
      if (data?.ok) {
        toast.success(`Teste ${tipo} enviado para ${data.phoneNormalized}`, { duration: 8000 })
      } else {
        toast.error(`Falha: ${data?.error ?? 'desconhecida'} (phone=${data?.phoneNormalized ?? '?'}, status=${data?.sendStatus ?? data?.connectionStateStatus ?? '?'})`, { duration: 12000 })
      }
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`)
    } finally {
      setTestando(null)
    }
  }

  const googleOAuthMessages: Record<string, string> = {
    cancelado:          'Conexão cancelada.',
    estado_invalido:    'Erro de segurança no fluxo OAuth. Tente novamente.',
    troca_falhou:       'Falha ao trocar o código de autorização. Tente novamente.',
    sem_refresh_token:  'Google não retornou o token. Revogue o acesso em myaccount.google.com/permissions e tente novamente.',
    db_error:           'Erro ao salvar a conexão. Tente novamente.',
  }

  // Handles redirect-based callback (fallback when popup was blocked)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('google_success')) {
      if (window.opener) {
        window.opener.postMessage({ type: 'google_calendar_success' }, window.location.origin)
        window.close()
        return
      }
      toast.success('Google Calendar conectado com sucesso!')
      window.history.replaceState({}, '', '/configuracoes')
    }
    const googleError = params.get('google_error')
    if (googleError) {
      if (window.opener) {
        window.opener.postMessage({ type: 'google_calendar_error', error: googleError }, window.location.origin)
        window.close()
        return
      }
      toast.error(googleOAuthMessages[googleError] ?? 'Erro ao conectar o Google Calendar.')
      window.history.replaceState({}, '', '/configuracoes')
    }
  }, [])

  // Handles popup-based callback via postMessage
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return
      if (event.data?.type === 'google_calendar_success') {
        toast.success('Google Calendar conectado com sucesso!')
        refetchGoogleSync()
      } else if (event.data?.type === 'google_calendar_error') {
        toast.error(googleOAuthMessages[event.data.error] ?? 'Erro ao conectar o Google Calendar.')
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  useEffect(() => {
    if (googleSyncError) toast.error(googleSyncError)
  }, [googleSyncError])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pollingStatus) return
    const interval = setInterval(async () => {
      const { data } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'status' } })
      console.log('[polling]', data)
      if (data?.connected) {
        setPollingStatus(false)
        await refetchConfig()
        return
      }
      setPollingAttempts(a => {
        if (a + 1 >= 60) setPollingStatus(false)  // 60 * 3s = 3 minutos
        return a + 1
      })
    }, 3000)
    return () => clearInterval(interval)
  }, [pollingStatus])

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    setSalvandoConfig(true)
    try {
      await updateConfig({
        nome: configForm.nome || null,
        horario_inicio: configForm.horario_inicio || null,
        horario_fim: configForm.horario_fim || null,
        horario_lembrete_1: configForm.horario_lembrete_1 || null,
        horario_lembrete_2: configForm.horario_lembrete_2 || null,
      })
    } finally {
      setSalvandoConfig(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Configurações</h1>

      {/* Configurações básicas */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Configurações básicas</p>

        {loadingConfig ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <form onSubmit={handleSaveConfig} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#1C1C1C]">Seu nome</label>
              <input
                value={configForm.nome}
                onChange={e => setConfigForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do psicólogo"
                className={`${inputClass} w-full`}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm font-medium text-[#1C1C1C]">Horário de início</label>
                <input
                  type="time"
                  value={configForm.horario_inicio}
                  onChange={e => setConfigForm(f => ({ ...f, horario_inicio: e.target.value }))}
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm font-medium text-[#1C1C1C]">Horário de término</label>
                <input
                  type="time"
                  value={configForm.horario_fim}
                  onChange={e => setConfigForm(f => ({ ...f, horario_fim: e.target.value }))}
                  className={`${inputClass} w-full`}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={salvandoConfig}
              className="self-end h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {salvandoConfig ? 'Salvando...' : 'Salvar'}
            </button>
          </form>
        )}
      </div>

      {/* Convênios */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Convênios</p>

        {loadingConvenios ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {convenios.length > 0 && (
              <div className="flex flex-col gap-2">
                {convenios.map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-[#1C1C1C]">{c.nome}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="R$/sessão"
                      value={editandoValor[c.id] !== undefined
                        ? editandoValor[c.id]
                        : (c.valor_sessao != null ? String(c.valor_sessao) : '')}
                      onChange={e => setEditandoValor(prev => ({ ...prev, [c.id]: e.target.value }))}
                      onBlur={() => handleValorBlur(c.id)}
                      className={`${inputClass} w-28`}
                    />
                    <button
                      onClick={() => toggleConvenio(c.id, false)}
                      className="text-muted hover:text-[#E07070] transition-colors"
                      title="Desativar convênio"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {convenios.length === 0 && (
              <p className="text-sm text-muted">Nenhum convênio cadastrado.</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <input
                placeholder="Nome do plano"
                value={nomeConvenio}
                onChange={e => setNomeConvenio(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddConvenio())}
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="R$/sessão"
                value={valorConvenio}
                onChange={e => setValorConvenio(e.target.value)}
                className={`${inputClass} w-28`}
              />
              <button
                onClick={handleAddConvenio}
                disabled={!nomeConvenio.trim()}
                className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modalidades de Sessão */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Modalidades de Sessão</p>

        {loadingModalidadesSessao ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {modalidadesSessao.length > 0 && (
              <div className="flex flex-col gap-2">
                {modalidadesSessao.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="text-lg w-6 text-center">{m.emoji}</span>
                    <span className="flex-1 text-sm text-[#1C1C1C]">{m.nome}</span>
                    <button
                      onClick={() => toggleModalidadeSessao(m.id, false)}
                      className="text-muted hover:text-[#E07070] transition-colors"
                      title="Desativar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {modalidadesSessao.length === 0 && (
              <p className="text-sm text-muted">Nenhuma modalidade de sessão ativa.</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <input
                placeholder="Emoji"
                value={emojiModalidadeSessao}
                onChange={e => setEmojiModalidadeSessao(e.target.value)}
                className={`${inputClass} w-16 text-center`}
                maxLength={4}
              />
              <input
                placeholder="Nome da modalidade"
                value={nomeModalidadeSessao}
                onChange={e => setNomeModalidadeSessao(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddModalidadeSessao())}
                className={`${inputClass} flex-1`}
              />
              <button
                onClick={handleAddModalidadeSessao}
                disabled={!nomeModalidadeSessao.trim() || !emojiModalidadeSessao.trim()}
                className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Meios de Atendimento */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Meios de Atendimento</p>

        {loadingMeiosAtendimento ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {meiosAtendimento.length > 0 && (
              <div className="flex flex-col gap-2">
                {meiosAtendimento.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="text-lg w-6 text-center">{m.emoji}</span>
                    <span className="flex-1 text-sm text-[#1C1C1C]">{m.nome}</span>
                    <button
                      onClick={() => toggleMeioAtendimento(m.id, false)}
                      className="text-muted hover:text-[#E07070] transition-colors"
                      title="Desativar"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {meiosAtendimento.length === 0 && (
              <p className="text-sm text-muted">Nenhum meio de atendimento ativo.</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <input
                placeholder="Emoji"
                value={emojiMeioAtendimento}
                onChange={e => setEmojiMeioAtendimento(e.target.value)}
                className={`${inputClass} w-16 text-center`}
                maxLength={4}
              />
              <input
                placeholder="Nome do meio"
                value={nomeMeioAtendimento}
                onChange={e => setNomeMeioAtendimento(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddMeioAtendimento())}
                className={`${inputClass} flex-1`}
              />
              <button
                onClick={handleAddMeioAtendimento}
                disabled={!nomeMeioAtendimento.trim() || !emojiMeioAtendimento.trim()}
                className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* WhatsApp */}
      <div className="bg-surface border border-border rounded-card p-6">
        <h2 className="font-display text-lg font-semibold text-[#1C1C1C] mb-4">Automação WhatsApp</h2>

        {/* State A: not connected, no instance */}
        {!config?.evolution_instance_name && (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Envie lembretes automáticos por WhatsApp com botões de confirmação. Use um número dedicado ao consultório.
            </p>
            <button
              onClick={iniciarConexao}
              disabled={conectando}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {conectando ? 'Iniciando...' : 'Conectar WhatsApp'}
            </button>
          </div>
        )}

        {/* State B: has instance but not connected — show QR */}
        {config?.evolution_instance_name && !config.whatsapp_conectado && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#C17F59]" />
              <span className="text-sm font-medium text-[#C17F59]">Aguardando conexão</span>
            </div>
            {qrBase64 && (
              <img src={qrBase64} alt="QR Code WhatsApp" className="w-48 h-48 border border-border rounded-lg mx-auto" />
            )}
            {!qrBase64 && (
              <button onClick={async () => {
                const { data, error } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'qr' } })
                console.log('QR response:', data, error)
                if (data?.qr) setQrBase64(data.qr)
                else toast.error(`QR não disponível. Resposta: ${JSON.stringify(data?._raw ?? error)}`)
              }} className="h-9 px-4 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-bg transition-colors">
                Mostrar QR Code
              </button>
            )}
            <p className="text-xs text-muted text-center">
              Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo → Escaneie o código
            </p>
            <button onClick={verificarConexao} className="h-9 px-4 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-bg transition-colors w-full">
              Verificar conexão
            </button>
          </div>
        )}

        {/* State C: connected */}
        {config?.whatsapp_conectado && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#4CAF82]" />
                <span className="text-sm font-medium text-[#4CAF82]">Conectado</span>
                <button onClick={reconectar} className="ml-2 text-xs text-muted underline hover:text-[#1C1C1C]">
                  Reconectar
                </button>
              </div>
              {/* Toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                <span className="text-sm text-muted">Automação ativa</span>
                <input
                  type="checkbox"
                  checked={config.automacao_whatsapp_ativa}
                  onChange={e => updateConfig({ automacao_whatsapp_ativa: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-border rounded-full peer peer-checked:bg-primary transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
              </label>
            </div>

            {/* Horário dos lembretes */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium text-[#1C1C1C] mb-3">Horário dos lembretes</p>
              <div className="flex gap-3">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-muted">1º lembrete (noite anterior)</label>
                  <input
                    type="time"
                    value={configForm.horario_lembrete_1}
                    onChange={e => setConfigForm(f => ({ ...f, horario_lembrete_1: e.target.value }))}
                    className={`${inputClass} w-full`}
                  />
                </div>
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-xs text-muted">2º lembrete (manhã do dia)</label>
                  <input
                    type="time"
                    value={configForm.horario_lembrete_2}
                    onChange={e => setConfigForm(f => ({ ...f, horario_lembrete_2: e.target.value }))}
                    className={`${inputClass} w-full`}
                  />
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={() => handleSaveConfig({ preventDefault: () => {} } as any)}
                  disabled={salvandoConfig}
                  className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
                >
                  {salvandoConfig ? 'Salvando...' : 'Salvar horários'}
                </button>
              </div>
            </div>

            {/* Test section */}
            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-sm font-medium text-[#1C1C1C]">Testar lembretes</p>
              <select
                value={sessaoTesteId}
                onChange={e => setSessaoTesteId(e.target.value)}
                onFocus={carregarSessoesParaTeste}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-bg"
              >
                {sessoesDisponiveis.length === 0 && <option value="">Clique para carregar sessões...</option>}
                {sessoesDisponiveis.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <div className="flex gap-2">
                {(['lembrete_noite', 'lembrete_manha'] as const).map(tipo => (
                  <button
                    key={tipo}
                    onClick={() => triggerTest(tipo)}
                    disabled={testando !== null}
                    className="flex-1 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-bg transition-colors disabled:opacity-50"
                  >
                    {testando === tipo ? '...' : tipo === 'lembrete_noite' ? 'Teste noite' : 'Teste manhã'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Régua de Cobrança ───────────────────────────── */}
      <section className="mb-8">
        <h2 className="text-lg font-display font-semibold text-[#1C1C1C] mb-4">
          Régua de Cobrança
        </h2>

        {/* Master toggle */}
        <div className="bg-white rounded-xl border border-[#E4E0DA] p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-[#1C1C1C]">
                Ativar lembretes automáticos de cobrança
              </p>
              <p className="text-xs text-[#7A7A7A] mt-0.5">
                Envia mensagens WhatsApp para sessões com pagamento pendente
              </p>
            </div>
            <button
              role="switch"
              aria-checked={config?.regua_cobranca_ativa ?? false}
              onClick={() =>
                config && updateConfig({ regua_cobranca_ativa: !(config.regua_cobranca_ativa ?? false) })
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config?.regua_cobranca_ativa ? 'bg-[#2D6A6A]' : 'bg-[#E4E0DA]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  config?.regua_cobranca_ativa ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {config?.regua_cobranca_ativa && (
          <>
            {/* PIX Key */}
            <div className="bg-white rounded-xl border border-[#E4E0DA] p-4 mb-4">
              <label className="block text-sm font-semibold text-[#1C1C1C] mb-2">
                Chave PIX
              </label>
              <input
                type="text"
                value={config.chave_pix ?? ''}
                onChange={(e) => updateConfig({ chave_pix: e.target.value || null })}
                placeholder="email, CPF, telefone ou chave aleatória"
                className={`${inputClass} w-full`}
              />
              <p className="text-xs text-[#7A7A7A] mt-1">
                Incluída automaticamente nas mensagens como <code className="bg-[#F7F5F2] px-1 rounded">{'{{chave_pix}}'}</code>
              </p>
            </div>

            {/* Send mode */}
            <div className="bg-white rounded-xl border border-[#E4E0DA] p-4 mb-4">
              <p className="text-sm font-semibold text-[#1C1C1C] mb-3">Modo de Envio</p>
              <div className="flex flex-col gap-3">
                {([
                  {
                    value: 'auto',
                    title: 'Automático',
                    desc: 'Mensagens disparadas automaticamente pela agenda',
                  },
                  {
                    value: 'manual',
                    title: 'Fila de Aprovação',
                    desc: 'Você revisa e aprova cada mensagem antes do envio',
                  },
                ] as { value: ModoCobracaWhatsapp; title: string; desc: string }[]).map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-start gap-3 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="regua_modo"
                      value={opt.value}
                      checked={(config.regua_cobranca_modo ?? 'manual') === opt.value}
                      onChange={() => updateConfig({ regua_cobranca_modo: opt.value })}
                      className="mt-0.5 accent-[#2D6A6A]"
                    />
                    <div>
                      <p className="text-sm font-medium text-[#1C1C1C]">{opt.title}</p>
                      <p className="text-xs text-[#7A7A7A]">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Template editors */}
            <div className="mb-2">
              <p className="text-sm font-semibold text-[#1C1C1C] mb-1">Modelos de Mensagem</p>
              <p className="text-xs text-[#7A7A7A] mb-4">
                Configure até 3 etapas. Cada etapa dispara após o número de dias definido desde a data da sessão.
              </p>
            </div>
            {loadingRegras ? (
              <div className="flex justify-center py-6">
                <div className="w-5 h-5 border-2 border-[#2D6A6A] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {([1, 2, 3] as EtapaCobranca[]).map((etapa) => (
                  <ReguaCobrancaTemplateEditor
                    key={etapa}
                    etapa={etapa}
                    regra={regras.find((r) => r.etapa === etapa)}
                    onSave={(template, dias, ativo) => salvarRegra(etapa, template, dias, ativo)}
                    onDelete={() => deletarRegra(etapa)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Pacientes em Risco */}
      <RiscoConfigSection />

      {/* Google Calendar */}
      <div className="bg-surface border border-border rounded-card p-6">
        <h2 className="font-display text-lg font-semibold text-[#1C1C1C] mb-4">Google Calendar</h2>

        {loadingGoogleSync ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !googleSync?.connected ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Sincronize suas sessões automaticamente com o Google Calendar. Cada sessão criada ou
              atualizada aparece na sua agenda Google em tempo real.
            </p>
            <button
              onClick={async () => {
                setConectandoGoogle(true)
                try { await conectarGoogle() } finally { setConectandoGoogle(false) }
              }}
              disabled={conectandoGoogle}
              className="h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {conectandoGoogle ? 'Redirecionando...' : 'Conectar Google Calendar'}
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#4CAF82]" />
                  <span className="text-sm font-medium text-[#4CAF82]">Conectado</span>
                </div>
                {googleSync.calendario_nome && (
                  <p className="text-xs text-muted mt-0.5">{googleSync.calendario_nome}</p>
                )}
                {googleSync.ultimo_sync_em && (
                  <p className="text-xs text-muted">
                    Última sincronização:{' '}
                    {formatDistance(new Date(googleSync.ultimo_sync_em), new Date(), { locale: ptBR, addSuffix: true })}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-[#1C1C1C]">Manter sincronização ativa</span>
                <input
                  type="checkbox"
                  checked={googleSync.sync_enabled}
                  onChange={e => atualizarGoogleSync({ sync_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-border rounded-full peer peer-checked:bg-primary transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <span className="text-sm text-[#1C1C1C]">Sincronização bidirecional</span>
                  <p className="text-xs text-muted">Importa eventos externos do Google Calendar como bloqueios de horário</p>
                </div>
                <input
                  type="checkbox"
                  checked={googleSync.bidirectional_enabled}
                  onChange={e => atualizarGoogleSync({ bidirectional_enabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-border rounded-full peer peer-checked:bg-primary transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 ml-4 shrink-0" />
              </label>

              {googleSync.bidirectional_enabled && (
                <button
                  onClick={sincronizarAgora}
                  className="h-9 px-4 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-bg transition-colors"
                >
                  Sincronizar agora
                </button>
              )}
            </div>

            <div className="border-t border-border pt-4">
              <details>
                <summary className="cursor-pointer text-sm text-primary hover:underline">
                  Adicionar ao Apple Calendar (iCal)
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted">
                    Copie a URL abaixo e adicione em Calendário → Arquivo → Nova Assinatura de Calendário
                  </p>
                  {config?.ical_token ? (
                    <div className="p-2 bg-[#E8F4F4] rounded text-xs font-mono break-all select-all">
                      {`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-ical?token=${config.ical_token}`}
                    </div>
                  ) : (
                    <p className="text-xs text-muted italic">
                      URL disponível após a primeira conexão com o Google Calendar.
                    </p>
                  )}
                </div>
              </details>
            </div>

            <div className="border-t border-border pt-4">
              <button
                onClick={async () => {
                  if (!confirm('Desconectar o Google Calendar vai parar a sincronização e remover todos os dados de conexão. Continuar?')) return
                  setDesconectandoGoogle(true)
                  try { await desconectarGoogle() } finally { setDesconectandoGoogle(false) }
                }}
                disabled={desconectandoGoogle}
                className="h-9 px-4 rounded-lg border border-[#C17F59] text-[#C17F59] text-sm font-medium hover:bg-[#C17F59]/5 transition-colors disabled:opacity-50"
              >
                {desconectandoGoogle ? 'Desconectando...' : 'Desconectar Google Calendar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
