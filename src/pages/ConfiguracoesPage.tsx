import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import { useConvenios } from '@/hooks/useConvenios'
import { useModalidades } from '@/hooks/useModalidades'
import { useConfigPsicologo } from '@/hooks/useConfigPsicologo'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2 } from 'lucide-react'

const inputClass = "h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function ConfiguracoesPage() {
  const { convenios, loading: loadingConvenios, addConvenio, toggleAtivo: toggleConvenio, updateValor } = useConvenios()
  const { modalidades, loading: loadingModalidades, addModalidade, toggleAtivo: toggleModalidade } = useModalidades()
  const { config, loading: loadingConfig, updateConfig } = useConfigPsicologo()

  // Convênios state
  const [nomeConvenio, setNomeConvenio] = useState('')
  const [valorConvenio, setValorConvenio] = useState('')
  const [editandoValor, setEditandoValor] = useState<Record<string, string>>({})

  // Modalidades state
  const [nomeModalidade, setNomeModalidade] = useState('')

  // Config state
  const [configForm, setConfigForm] = useState({ nome: '', horario_inicio: '', horario_fim: '' })
  const [configSynced, setConfigSynced] = useState(false)
  const [salvandoConfig, setSalvandoConfig] = useState(false)

  // WhatsApp state
  const [qrBase64, setQrBase64] = useState<string | null>(null)
  const [pollingStatus, setPollingStatus] = useState(false)
  const [pollingAttempts, setPollingAttempts] = useState(0)
  const [conectando, setConectando] = useState(false)
  const [testando, setTestando] = useState<'48h' | '24h' | '2h' | null>(null)
  const [sessaoTesteId, setSessaoTesteId] = useState<string>('')
  const [sessoesDisponiveis, setSessoesDisponiveis] = useState<Array<{ id: string; label: string }>>([])

  if (config && !configSynced) {
    setConfigForm({
      nome: config.nome ?? '',
      horario_inicio: config.horario_inicio ?? '07:00',
      horario_fim: config.horario_fim ?? '21:00',
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

  function handleAddModalidade() {
    if (!nomeModalidade.trim()) return
    addModalidade(nomeModalidade.trim())
    setNomeModalidade('')
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
      await supabase.functions.invoke('whatsapp-setup', { body: { action: 'create' } })
      const { data } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'qr' } })
      setQrBase64(data?.qr ?? null)
      setPollingStatus(true)
      setPollingAttempts(0)
    } finally {
      setConectando(false)
    }
  }

  async function verificarConexao() {
    const { data } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'status' } })
    if (data?.connected) {
      window.location.reload()
    } else {
      toast.error('Ainda não conectado. Escaneie o QR Code.')
    }
  }

  async function triggerTest(tipo: '48h' | '24h' | '2h') {
    if (!sessaoTesteId) return toast.error('Selecione uma sessão')
    setTestando(tipo)
    try {
      const { data, error } = await supabase.functions.invoke('send-lembrete', {
        body: { sessao_id: sessaoTesteId, tipo },
      })
      if (error) throw error
      if (data?.skipped) toast.success(`Lembrete ${tipo} já foi enviado anteriormente`)
      else toast.success(`Lembrete ${tipo} enviado com sucesso!`)
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`)
    } finally {
      setTestando(null)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pollingStatus) return
    const interval = setInterval(async () => {
      const { data } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'status' } })
      if (data?.connected) {
        setPollingStatus(false)
        window.location.reload()
        return
      }
      setPollingAttempts(a => {
        if (a + 1 >= 12) setPollingStatus(false)
        return a + 1
      })
    }, 5000)
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
      } as any)
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

      {/* Modalidades */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Modalidades</p>

        {loadingModalidades ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {modalidades.length > 0 && (
              <div className="flex flex-col gap-2">
                {modalidades.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-[#1C1C1C]">{m.nome}</span>
                    <button
                      onClick={() => toggleModalidade(m.id, false)}
                      className="text-muted hover:text-[#E07070] transition-colors"
                      title="Desativar modalidade"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {modalidades.length === 0 && (
              <p className="text-sm text-muted">Nenhuma modalidade cadastrada.</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <input
                placeholder="Nome da modalidade"
                value={nomeModalidade}
                onChange={e => setNomeModalidade(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddModalidade())}
                className={`${inputClass} flex-1`}
              />
              <button
                onClick={handleAddModalidade}
                disabled={!nomeModalidade.trim()}
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
                const { data } = await supabase.functions.invoke('whatsapp-setup', { body: { action: 'qr' } })
                setQrBase64(data?.qr ?? null)
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
                {(['48h', '24h', '2h'] as const).map(tipo => (
                  <button
                    key={tipo}
                    onClick={() => triggerTest(tipo)}
                    disabled={testando !== null}
                    className="flex-1 h-9 px-3 rounded-lg border border-border bg-surface text-sm font-medium hover:bg-bg transition-colors disabled:opacity-50"
                  >
                    {testando === tipo ? '...' : `Teste ${tipo}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
