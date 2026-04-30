import type { SessionsExternalBusy } from './types'

export function checkGoogleConflict(
  sessaoDataHora: string,
  duracaoMinutos: number,
  busyPeriods: SessionsExternalBusy[]
): SessionsExternalBusy[] {
  const sessaoStart = new Date(sessaoDataHora).getTime()
  const sessaoEnd   = sessaoStart + duracaoMinutos * 60_000

  return busyPeriods.filter(b => {
    const busyStart = new Date(b.data_hora_inicio).getTime()
    const busyEnd   = new Date(b.data_hora_fim).getTime()
    return sessaoStart < busyEnd && sessaoEnd > busyStart
  })
}
