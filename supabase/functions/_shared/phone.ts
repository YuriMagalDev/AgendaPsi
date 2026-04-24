export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Brazilian numbers without country code: 10 digits (landline) or 11 digits (mobile)
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  return digits
}

export function buildReminderText(
  tipo: '48h' | '24h' | '2h',
  nome: string,
  hora: string,
  diaSemana: string
): string {
  const intros: Record<string, string> = {
    '48h': `Olá, *${nome}*! 😊\n\nLembrando que você tem uma sessão *amanhã, ${diaSemana} às ${hora}*.`,
    '24h': `Olá, *${nome}*! 😊\n\nSua sessão é *hoje às ${hora}*.`,
    '2h':  `Olá, *${nome}*! 🕐\n\nSua sessão começa em *2 horas, às ${hora}*.`,
  }
  return `${intros[tipo]}\n\nPor favor, responda:\n*1* — ✅ Confirmar presença\n*2* — ❌ Cancelar`
}

const CONFIRMAR_REGEX = /^\s*(1|sim|s|confirmar|confirmo|confirmado|ok|✅)\s*$/i
const CANCELAR_REGEX  = /^\s*(2|não|nao|n|cancelar|cancelo|cancelado|❌)\s*$/i

export function parseReplyText(raw: string): 'CONFIRMAR' | 'CANCELAR' | null {
  const text = raw.trim()
  if (CONFIRMAR_REGEX.test(text)) return 'CONFIRMAR'
  if (CANCELAR_REGEX.test(text)) return 'CANCELAR'
  return null
}
