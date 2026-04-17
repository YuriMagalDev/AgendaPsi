export type SessaoStatus =
  | 'agendada'
  | 'confirmada'
  | 'concluida'
  | 'faltou'
  | 'cancelada'
  | 'remarcada'

export type ContratoTipo = 'por_sessao' | 'pacote' | 'mensal'

export type RepasseTipoValor = 'percentual' | 'fixo'

export interface Paciente {
  id: string
  nome: string
  telefone: string | null
  email: string | null
  data_nascimento: string | null
  ativo: boolean
  tipo: 'particular' | 'convenio'
  convenio_id: string | null
  criado_em: string
}

export interface Modalidade {
  id: string
  nome: string
  ativo: boolean
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
  modalidade_id: string
  data_hora: string
  status: SessaoStatus
  valor_cobrado: number | null
  pago: boolean
  forma_pagamento: string | null
  data_pagamento: string | null
  remarcada_para: string | null
  sessao_origem_id: string | null
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

export interface ConfirmacaoWhatsapp {
  id: string
  sessao_id: string
  mensagem_enviada_em: string | null
  resposta: string | null
  confirmado: boolean | null
  lida: boolean
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
  automacao_whatsapp_ativa: boolean
  evolution_instance_name: string | null
  evolution_token: string | null
  whatsapp_conectado: boolean
}

export type SessaoComModalidade = Sessao & {
  modalidades: { nome: string } | null
}

export type SessaoView = Sessao & {
  modalidades: { nome: string } | null
  pacientes: { nome: string } | null
}

export interface SlotSemanal {
  id: string
  paciente_id: string
  nome: string | null
  dia_semana: number       // 0=Dom … 6=Sab
  horario: string          // "HH:MM"
  modalidade_id: string
  is_pacote: boolean
  ativo: boolean
  criado_em: string
}

export interface SlotSemanalInput {
  nome: string
  dia_semana: number
  horario: string
  modalidade_id: string
  is_pacote: boolean
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
  mes: string          // 'YYYY-MM-DD' — first day of the month
  descricao: string
  valor: number
  criado_em: string
}

export type PacienteComConvenio = Paciente & {
  convenios: { nome: string; valor_sessao: number | null } | null
}
