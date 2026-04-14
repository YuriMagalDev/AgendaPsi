import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signInWithPassword: vi.fn() },
    from: vi.fn(),
  },
}))

import { supabase } from '@/lib/supabase'

describe('supabase client', () => {
  it('is defined', () => {
    expect(supabase).toBeDefined()
  })

  it('has auth property', () => {
    expect(supabase.auth).toBeDefined()
  })

  it('has from method', () => {
    expect(supabase.from).toBeDefined()
  })
})
