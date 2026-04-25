export interface SlotConflictInput {
  id?: string
  dia_semana: number
  horario: string       // "HH:mm"
  duracao_minutos: number
}

function timeToMinutes(horario: string): number {
  const [h, m] = horario.split(':').map(Number)
  return h * 60 + m
}

function timeOverlaps(t1: string, d1: number, t2: string, d2: number): boolean {
  const start1 = timeToMinutes(t1)
  const end1 = start1 + d1
  const start2 = timeToMinutes(t2)
  const end2 = start2 + d2
  return start1 < end2 && start2 < end1
}

export function checkSlotConflict(
  slot: SlotConflictInput,
  existing: SlotConflictInput[],
): SlotConflictInput | null {
  return existing.find(e =>
    e.id !== slot.id &&
    e.dia_semana === slot.dia_semana &&
    timeOverlaps(slot.horario, slot.duracao_minutos, e.horario, e.duracao_minutos)
  ) ?? null
}

export function addMinutesToTime(horario: string, minutes: number): string {
  const total = timeToMinutes(horario) + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
