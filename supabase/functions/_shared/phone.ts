export function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export function buildButtonText(
  tipo: '48h' | '24h' | '2h',
  nome: string,
  hora: string,
  diaSemana: string
): string {
  const textos: Record<string, string> = {
    '48h': `Olá, *${nome}*! 😊 Lembrando que você tem uma sessão *amanhã, ${diaSemana} às ${hora}*. Gostaria de confirmar sua presença?`,
    '24h': `Olá, *${nome}*! 😊 Sua sessão é *hoje às ${hora}*. Confirme sua presença:`,
    '2h':  `Olá, *${nome}*! 🕐 Sua sessão começa em *2 horas, às ${hora}*. Confirme:`,
  }
  return textos[tipo]
}
