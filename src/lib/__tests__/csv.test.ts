import { describe, it, expect } from 'vitest'
import { buildCsv, parseCsv, PATIENT_CSV_HEADERS } from '../csv'

describe('buildCsv', () => {
  it('outputs header row first', () => {
    const csv = buildCsv([])
    expect(csv.split('\n')[0]).toBe(PATIENT_CSV_HEADERS.join(','))
  })

  it('outputs one data row per patient', () => {
    const rows = [
      { nome: 'Ana', telefone: '11999', email: 'ana@x.com', data_nascimento: '1990-01-01', tipo: 'particular', ativo: 'true' },
    ]
    const lines = buildCsv(rows).split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Ana')
    expect(lines[1]).toContain('11999')
  })

  it('wraps values containing commas in double quotes', () => {
    const rows = [
      { nome: 'Silva, João', telefone: '', email: '', data_nascimento: '', tipo: 'particular', ativo: 'true' },
    ]
    const csv = buildCsv(rows)
    expect(csv).toContain('"Silva, João"')
  })
})

describe('parseCsv', () => {
  it('returns empty array for header-only content', () => {
    expect(parseCsv(PATIENT_CSV_HEADERS.join(','))).toHaveLength(0)
  })

  it('parses a valid data row into keyed object', () => {
    const text = `${PATIENT_CSV_HEADERS.join(',')}\nMaria,11888,,1992-05-10,particular,true`
    const rows = parseCsv(text)
    expect(rows).toHaveLength(1)
    expect(rows[0].nome).toBe('Maria')
    expect(rows[0].tipo).toBe('particular')
    expect(rows[0].data_nascimento).toBe('1992-05-10')
  })

  it('handles quoted values with embedded commas', () => {
    const text = `${PATIENT_CSV_HEADERS.join(',')}\n"Silva, João",,,,particular,true`
    const rows = parseCsv(text)
    expect(rows[0].nome).toBe('Silva, João')
  })

  it('trims whitespace from values', () => {
    const text = `${PATIENT_CSV_HEADERS.join(',')}\n  Pedro , , , , particular , true `
    const rows = parseCsv(text)
    expect(rows[0].nome).toBe('Pedro')
  })
})
