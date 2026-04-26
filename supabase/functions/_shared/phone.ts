export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length === 12 && digits.startsWith('55')) {
    const area = digits.slice(2, 4)
    const local = digits.slice(4)
    if (['6', '7', '8', '9'].includes(local[0])) return `55${area}9${local}`
  }
  return digits
}

export function buildReminderText(
  tipo: 'lembrete_noite' | 'lembrete_manha',
  nome: string,
  hora: string,
  diaSemana: string
): string {
  const intros: Record<string, string> = {
    lembrete_noite: `Olá, *${nome}*! 😊\n\nLembrando que você tem uma sessão *amanhã, ${diaSemana} às ${hora}*.`,
    lembrete_manha: `Olá, *${nome}*! 😊\n\nSua sessão é *hoje às ${hora}*.`,
  }
  const opcoes =
    '\n\n👉 *Responda com:*\n*1* — Confirmar presença ✅\n*2* — Não vou conseguir comparecer ❌\n*3* — Cancelar sessão'
  return `${intros[tipo]}${opcoes}`
}

const CONFIRMAR_REGEX = /^\s*(1|sim|s|confirmar|confirmo|confirmado|ok|✅)\s*$/i
const CANCELAR_REGEX  = /^\s*(2|3|não|nao|n|cancelar|cancelo|cancelado|❌)\s*$/i

export function parseReplyText(raw: string): 'CONFIRMAR' | 'CANCELAR' | null {
  const text = raw.trim()
  if (CONFIRMAR_REGEX.test(text)) return 'CONFIRMAR'
  if (CANCELAR_REGEX.test(text))  return 'CANCELAR'
  return null
}
