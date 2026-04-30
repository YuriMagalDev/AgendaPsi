import { describe, it, expect } from 'vitest'
import type {
  GoogleOAuthTokens,
  SessionsSyncMap,
  SessionsExternalBusy,
  GoogleCalendarSyncStatus,
} from '../types'

describe('GoogleCalendar types shape', () => {
  it('GoogleOAuthTokens has required fields', () => {
    const t: GoogleOAuthTokens = {
      id: 'abc',
      user_id: 'u1',
      google_user_id: 'g1',
      refresh_token_encrypted: 'enc',
      access_token_expiry: 1000,
      calendario_id: 'primary',
      sync_enabled: true,
      bidirectional_enabled: false,
      calendario_nome: null,
      ultimo_sync_em: null,
      criado_em: '2026-01-01',
    }
    expect(t.sync_enabled).toBe(true)
  })

  it('SessionsSyncMap has required fields', () => {
    const m: SessionsSyncMap = {
      id: 'abc',
      user_id: 'u1',
      sessao_id: 's1',
      google_event_id: 'ev1',
      status_ultima_sync: 'agendada',
      sincronizado_em: '2026-01-01',
    }
    expect(m.google_event_id).toBe('ev1')
  })

  it('SessionsExternalBusy has required fields', () => {
    const b: SessionsExternalBusy = {
      id: 'abc',
      user_id: 'u1',
      google_event_id: 'ev1',
      titulo: 'Reunião',
      data_hora_inicio: '2026-01-01T10:00:00Z',
      data_hora_fim: '2026-01-01T11:00:00Z',
      descricao: null,
      atualizacao_em: null,
      sincronizado_em: '2026-01-01',
    }
    expect(b.titulo).toBe('Reunião')
  })

  it('GoogleCalendarSyncStatus has required fields', () => {
    const s: GoogleCalendarSyncStatus = {
      connected: false,
      sync_enabled: false,
      bidirectional_enabled: false,
      calendario_nome: null,
      google_user_id: null,
      ultimo_sync_em: null,
    }
    expect(s.connected).toBe(false)
  })
})
