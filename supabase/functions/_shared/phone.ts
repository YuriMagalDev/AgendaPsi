export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  // Local-only Brazilian numbers: add country code
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  // Old 8-digit mobile (12 total with country code) — expand to 9-digit (13 total)
  // Carriers added the 9th digit; Evolution JIDs always use the 13-digit form
  if (digits.length === 12 && digits.startsWith('55')) {
    const area = digits.slice(2, 4)
    const local = digits.slice(4)
    if (['6', '7', '8', '9'].includes(local[0])) return `55${area}9${local}`
  }
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
  return intros[tipo]
}

export const REMINDER_BUTTONS = [
  { buttonId: 'CONFIRMAR', buttonText: { displayText: '✅ Confirmar presença' }, type: 'reply' },
  { buttonId: 'CANCELAR',  buttonText: { displayText: '❌ Cancelar' },           type: 'reply' },
]

const CONFIRMAR_REGEX = /^\s*(1|sim|s|confirmar|confirmo|confirmado|ok|✅)\s*$/i
const CANCELAR_REGEX  = /^\s*(2|não|nao|n|cancelar|cancelo|cancelado|❌)\s*$/i

export function parseReplyText(raw: string): 'CONFIRMAR' | 'CANCELAR' | null {
  const text = raw.trim()
  if (CONFIRMAR_REGEX.test(text)) return 'CONFIRMAR'
  if (CANCELAR_REGEX.test(text)) return 'CANCELAR'
  return null
}
