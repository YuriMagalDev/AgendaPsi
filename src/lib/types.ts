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
