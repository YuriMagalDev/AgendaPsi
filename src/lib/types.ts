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
  dia_semana: number       // 0=Dom … 6=Sab
  horario: string          // "HH:MM"
  modalidade_id: string
  valor_cobrado: number | null
  ativo: boolean
  criado_em: string
}

export interface SlotSemanalInput {
  dia_semana: number
  horario: string
  modalidade_id: string
  valor_cobrado: number | null
}
