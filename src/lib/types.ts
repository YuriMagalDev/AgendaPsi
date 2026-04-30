export type SessaoStatus =
  | 'agendada'
  | 'confirmada'
  | 'concluida'
  | 'faltou'
  | 'cancelada'
  | 'remarcada'

export type ContratoTipo = 'por_sessao' | 'pacote' | 'mensal'

export type RepasseTipoValor = 'percentual' | 'fixo'

export interface ModalidadeSessao {
  id: string
  nome: string
  emoji: string
  ativo: boolean
}

export interface MeioAtendimento {
  id: string
  nome: string
  emoji: string
  ativo: boolean
}

export interface Paciente {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  data_nascimento: string | null
  notas: string | null
  ativo: boolean
  tipo: 'particular' | 'convenio'
  convenio_id: string | null
  modalidade_sessao_id: string | null
  meio_atendimento_id: string | null
  criado_em: string
}

export interface Contrato {
  id: string
  paciente_id: string
  tipo: ContratoTipo
  valor: number
  qtd_sessoes: number | null
  dia_vencimento: number | null
  ativo: boolean
  criado_em: string
}

export type FormaPagamento = 'dinheiro' | 'pix' | 'cartao_debito' | 'cartao_credito'

export interface Sessao {
  id: string
  paciente_id: string | null
  avulso_nome: string | null
  avulso_telefone: string | null
  modalidade_sessao_id: string
  meio_atendimento_id: string
  data_hora: string
  status: SessaoStatus
  valor_cobrado: number | null
  pago: boolean
  forma_pagamento: string | null
  data_pagamento: string | null
  sessao_origem_id: string | null
  duracao_minutos: number
  notas_checklist: string | null
  criado_em: string
  google_calendar_event_id: string | null
  google_calendar_synced_at: string | null
}

export interface RegraRepasse {
  id: string
  nome: string
  tipo_valor: RepasseTipoValor
  valor: number
  ativo: boolean
}

export interface Repasse {
  id: string
  regra_repasse_id: string
  sessao_id: string
  valor_calculado: number
  pago: boolean
  data_pagamento: string | null
}

export interface RepasseMensal {
  id: string
  regra_repasse_id: string
  mes: string           // ISO date, always first of month (yyyy-MM-01)
  valor_calculado: number
  pago: boolean
  data_pagamento: string | null
}

export type TipoLembrete = '48h' | '24h' | '2h' | 'lembrete_noite' | 'lembrete_manha'

export type TipoNotificacao =
  | 'confirmacao'
  | 'cancelamento'
  | 'cancelamento_pos_confirmacao'
  | 'alerta_sem_resposta'

export interface ConfirmacaoWhatsapp {
  id: string
  sessao_id: string
  mensagem_enviada_em: string | null
  resposta: string | null
  confirmado: boolean | null
  lida: boolean
  tipo_lembrete: TipoLembrete | null
  remarcacao_solicitada: boolean
  tipo: TipoNotificacao | null
}

export type NotificacaoConfirmacao = ConfirmacaoWhatsapp & {
  sessoes: {
    data_hora: string
    paciente_id: string | null
    avulso_nome: string | null
    pacientes: { nome: string } | null
  } | null
}

export type ModoCobracaWhatsapp = 'auto' | 'manual'

export interface ConfigPsicologo {
  id: string
  nome: string | null
  horario_inicio: string | null
  horario_fim: string | null
  horario_checklist: string | null
  horario_lembrete_1: string | null
  horario_lembrete_2: string | null
  automacao_whatsapp_ativa: boolean
  evolution_instance_name: string | null
  evolution_token: string | null
  whatsapp_conectado: boolean
  user_id: string | null
  // Régua de Cobrança fields (added in migration 019)
  chave_pix: string | null
  regua_cobranca_ativa: boolean
  regua_cobranca_modo: ModoCobracaWhatsapp
  // Google Calendar Sync fields
  google_calendar_sync_enabled: boolean
  google_calendar_bidirectional: boolean
  ical_token: string | null
}

export type SessaoView = Sessao & {
  modalidades_sessao: { nome: string; emoji: string } | null
  meios_atendimento:  { nome: string; emoji: string } | null
  pacientes: { nome: string } | null
}

export interface SlotSemanal {
  id: string
  paciente_id: string
  nome: string | null
  dia_semana: number
  horario: string
  duracao_minutos: number
  modalidade_sessao_id: string | null
  meio_atendimento_id: string | null
  is_pacote: boolean
  intervalo_semanas: number
  ativo: boolean
  data_fim: string | null
  criado_em: string
}

export interface SlotSemanalInput {
  nome: string
  dia_semana: number
  horario: string
  duracao_minutos: number
  is_pacote: boolean
  intervalo_semanas: number
}

export interface Convenio {
  id: string
  nome: string
  valor_sessao: number | null
  ativo: boolean
  criado_em: string
}

export interface Despesa {
  id: string
  mes: string
  descricao: string
  valor: number
  criado_em: string
}

export type PacienteComConvenio = Paciente & {
  convenios: { nome: string; valor_sessao: number | null } | null
  modalidades_sessao?: { nome: string; emoji: string } | null
  meios_atendimento?:  { nome: string; emoji: string } | null
  contratos?: { tipo: ContratoTipo; ativo: boolean }[] | null
}

// ============================================================
// Régua de Cobrança
// ============================================================

export type EtapaCobranca = 1 | 2 | 3

export type StatusCobranca = 'pendente' | 'agendado' | 'enviado' | 'falha' | 'cancelado'

export interface RegraCobranca {
  id: string
  user_id: string
  etapa: EtapaCobranca
  dias_apos: number
  template_mensagem: string
  ativo: boolean
  created_at: string
  updated_at: string
}

export interface CobrancaEnviada {
  id: string
  user_id: string
  sessao_id: string
  etapa: EtapaCobranca
  status: StatusCobranca
  mensagem_texto: string
  data_agendado: string
  data_enviado: string | null
  erro_detalhes: string | null
  created_at: string
  updated_at: string
}

export interface CobrancaEnviadaView extends CobrancaEnviada {
  sessoes: {
    data_hora: string
    valor_cobrado: number | null
    pago: boolean
    status: SessaoStatus
    paciente_id: string | null
    avulso_nome: string | null
    pacientes: { nome: string; telefone: string | null } | null
  } | null
}

export interface SessaoParaCobranca {
  id: string
  data_hora: string
  valor_cobrado: number
  pago: boolean
  status: SessaoStatus
  paciente_id: string | null
  avulso_nome: string | null
  avulso_telefone: string | null
  pacientes: { nome: string; telefone: string | null } | null
  etapas_pendentes: EtapaCobranca[]
}

// ── Google Calendar Sync ──────────────────────────────────────────────────────

export interface GoogleOAuthTokens {
  id: string
  user_id: string
  google_user_id: string
  refresh_token_encrypted: string
  access_token_expiry: number
  calendario_id: string
  sync_enabled: boolean
  bidirectional_enabled: boolean
  calendario_nome: string | null
  ultimo_sync_em: string | null
  criado_em: string
}

export interface SessionsSyncMap {
  id: string
  user_id: string
  sessao_id: string
  google_event_id: string
  status_ultima_sync: string
  sincronizado_em: string
}

export interface SessionsExternalBusy {
  id: string
  user_id: string
  google_event_id: string
  titulo: string
  data_hora_inicio: string
  data_hora_fim: string
  descricao: string | null
  atualizacao_em: string | null
  sincronizado_em: string
}

export interface GoogleCalendarSyncStatus {
  connected: boolean
  sync_enabled: boolean
  bidirectional_enabled: boolean
  calendario_nome: string | null
  google_user_id: string | null
  ultimo_sync_em: string | null
}
