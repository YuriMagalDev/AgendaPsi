import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { normalizePhone, buildButtonText } from './phone.ts'

Deno.test('normalizePhone strips non-digits', () => {
  assertEquals(normalizePhone('+55 (11) 99999-9999'), '5511999999999')
})

Deno.test('buildButtonText 48h contains nome and diaSemana', () => {
  const text = buildButtonText('48h', 'Maria', '09:00', 'sexta-feira')
  assertEquals(text.includes('Maria'), true)
  assertEquals(text.includes('sexta-feira'), true)
})

Deno.test('buildButtonText 2h mentions 2 horas', () => {
  const text = buildButtonText('2h', 'João', '14:00', 'segunda-feira')
  assertEquals(text.includes('2 horas'), true)
})
