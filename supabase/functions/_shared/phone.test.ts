import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts'
import { normalizePhone, buildReminderText, parseReplyText } from './phone.ts'

Deno.test('normalizePhone strips non-digits', () => {
  assertEquals(normalizePhone('+55 (11) 99999-9999'), '5511999999999')
})

Deno.test('buildReminderText lembrete_noite contains nome and diaSemana', () => {
  const text = buildReminderText('lembrete_noite', 'Maria', '09:00', 'sexta-feira')
  assertEquals(text.includes('Maria'), true)
  assertEquals(text.includes('sexta-feira'), true)
})

Deno.test('buildReminderText lembrete_manha mentions hoje', () => {
  const text = buildReminderText('lembrete_manha', 'João', '14:00', 'segunda-feira')
  assertEquals(text.includes('hoje'), true)
})

Deno.test('parseReplyText returns CONFIRMAR for sim and 1', () => {
  assertEquals(parseReplyText('sim'), 'CONFIRMAR')
  assertEquals(parseReplyText('1'), 'CONFIRMAR')
})

Deno.test('parseReplyText returns CANCELAR for nao, 2, cancelar, and 3', () => {
  assertEquals(parseReplyText('não'), 'CANCELAR')
  assertEquals(parseReplyText('2'), 'CANCELAR')
  assertEquals(parseReplyText('cancelar'), 'CANCELAR')
  assertEquals(parseReplyText('3'), 'CANCELAR')
})

Deno.test('parseReplyText returns null for unrecognized text', () => {
  assertEquals(parseReplyText('talvez'), null)
  assertEquals(parseReplyText(''), null)
})
