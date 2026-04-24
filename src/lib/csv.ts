export const PATIENT_CSV_HEADERS = [
  'nome', 'telefone', 'email', 'data_nascimento', 'tipo', 'ativo',
] as const

export type PatientCsvRow = Record<typeof PATIENT_CSV_HEADERS[number], string>

export function buildCsv(rows: PatientCsvRow[]): string {
  const lines: string[] = [PATIENT_CSV_HEADERS.join(',')]
  for (const row of rows) {
    const values = PATIENT_CSV_HEADERS.map(h => escapeCsvValue(row[h] ?? ''))
    lines.push(values.join(','))
  }
  return lines.join('\n')
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length < 2) return []
  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  return lines.slice(1).map(line => {
    const values = splitCsvLine(line)
    return Object.fromEntries(headers.map((h, i) => [h, values[i]?.trim() ?? '']))
  })
}

function escapeCsvValue(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`
  }
  return v
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}
