# Polish & Completeness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate all UI to pt-BR, add patient editing, and complete the Configurações page (Modalidades + basic settings sections).

**Architecture:** Seven focused tasks touching existing pages and hooks. No new tables or migrations needed. `updatePaciente` is added to `usePacientes`; `addModalidade`/`toggleAtivo` are added to `useModalidades`; `updateConfig` is added to `useConfigPsicologo`. A new `EditarPacientePage` reuses the same Zod schema pattern as `NovoPacientePage` but pre-fills from existing data via `usePacienteDetalhe`.

**Tech Stack:** React + TypeScript + Vite + TailwindCSS + Supabase JS + react-hook-form + Zod + Vitest

---

## File Map

| # | Action | File |
|---|--------|------|
| 1 | Modify | `src/pages/PacientesPage.tsx` |
| 2 | Modify | `src/pages/PacienteDetalhePage.tsx` |
| 3 | Modify | `src/hooks/useModalidades.ts` |
| 3 | Modify | `src/hooks/__tests__/useModalidades.test.ts` |
| 4 | Modify | `src/pages/ConfiguracoesPage.tsx` — add Modalidades section |
| 5 | Modify | `src/hooks/useConfigPsicologo.ts` — add updateConfig |
| 5 | Modify | `src/pages/ConfiguracoesPage.tsx` — add Configurações básicas section |
| 6 | Modify | `src/hooks/usePacientes.ts` — add updatePaciente |
| 6 | Modify | `src/hooks/__tests__/usePacientes.test.ts` |
| 7 | Create | `src/pages/EditarPacientePage.tsx` |
| 7 | Modify | `src/router.tsx` — add `/pacientes/:id/editar` route |
| 7 | Modify | `src/pages/PacienteDetalhePage.tsx` — add Editar button |

---

## Task 1: Translate PacientesPage to pt-BR

**Files:**
- Modify: `src/pages/PacientesPage.tsx`

- [ ] **Step 1: Replace all English strings**

Replace the full file content:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, ChevronRight, UserRound } from 'lucide-react'
import { usePacientes } from '@/hooks/usePacientes'
import type { Paciente } from '@/lib/types'

function PacienteCard({ paciente }: { paciente: Paciente }) {
  return (
    <Link
      to={`/pacientes/${paciente.id}`}
      className="flex items-center justify-between p-4 bg-surface rounded-card border border-border hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center shrink-0">
          <UserRound size={18} className="text-primary" />
        </div>
        <div>
          <p className="font-medium text-[#1C1C1C] leading-tight">{paciente.nome}</p>
          {paciente.telefone && (
            <p className="text-sm text-muted mt-0.5">{paciente.telefone}</p>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-muted shrink-0" />
    </Link>
  )
}

export function PacientesPage() {
  const { pacientes, loading, error } = usePacientes()
  const [search, setSearch] = useState('')

  const filtered = pacientes.filter(p =>
    p.nome.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Pacientes</h1>
        <Link
          to="/pacientes/novo"
          className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} />
          Novo
        </Link>
      </div>

      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar paciente..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <p className="text-center py-8 text-sm text-[#E07070]">Erro ao carregar pacientes.</p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <UserRound size={40} className="text-border mx-auto mb-3" />
          <p className="text-muted text-sm">
            {search ? 'Nenhum paciente encontrado.' : 'Nenhum paciente cadastrado ainda.'}
          </p>
          {!search && (
            <Link to="/pacientes/novo" className="inline-block mt-4 text-sm text-primary font-medium hover:underline">
              Cadastrar primeiro paciente
            </Link>
          )}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map(p => (
            <PacienteCard key={p.id} paciente={p} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/PacientesPage.tsx
git commit -m "fix: translate PacientesPage to pt-BR"
```

---

## Task 2: Translate PacienteDetalhePage to pt-BR

**Files:**
- Modify: `src/pages/PacienteDetalhePage.tsx`

The current file has English status labels, contract descriptions, and all UI strings. Replace using `STATUS_CONFIG` from `@/lib/statusConfig` (already in the project) instead of the local `statusConfig` duplicate.

- [ ] **Step 1: Replace full file content**

```tsx
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Archive, Phone, Mail, Calendar, Banknote, Pencil } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { usePacienteDetalhe } from '@/hooks/usePacienteDetalhe'
import { STATUS_CONFIG } from '@/lib/statusConfig'
import type { ContratoTipo } from '@/lib/types'

const contratoDescricao = (tipo: ContratoTipo, valor: number, qtd?: number | null, dia?: number | null) => {
  const valorFmt = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (tipo === 'por_sessao') return `${valorFmt} por sessão`
  if (tipo === 'pacote') return `${qtd ?? '?'} sessões por ${valorFmt}`
  return `${valorFmt}/mês — vencimento dia ${dia ?? '?'}`
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface rounded-card border border-border p-4 flex flex-col gap-1">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold text-[#1C1C1C] font-mono">{value}</p>
    </div>
  )
}

export function PacienteDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { paciente, sessoes, contrato, stats, loading, arquivar, error } = usePacienteDetalhe(id!)

  async function handleArquivar() {
    if (!window.confirm(`Arquivar ${paciente?.nome}? O histórico de sessões será mantido.`)) return
    try {
      await arquivar()
      navigate('/pacientes')
    } catch {
      alert('Erro ao arquivar. Tente novamente.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-[#E07070] mb-2">Erro ao carregar dados do paciente.</p>
        <Link to="/pacientes" className="text-primary text-sm hover:underline">
          Voltar para Pacientes
        </Link>
      </div>
    )
  }

  if (!paciente) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted">Paciente não encontrado.</p>
        <Link to="/pacientes" className="text-primary text-sm mt-2 inline-block hover:underline">
          Voltar para Pacientes
        </Link>
      </div>
    )
  }

  const idade = paciente.data_nascimento
    ? differenceInYears(new Date(), new Date(paciente.data_nascimento))
    : null

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/pacientes" className="text-muted hover:text-[#1C1C1C] transition-colors mt-0.5">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">{paciente.nome}</h1>
            {idade !== null && (
              <p className="text-sm text-muted">{idade} anos</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={`/pacientes/${id}/editar`}
            className="flex items-center gap-1.5 text-sm text-primary border border-primary/30 px-3 py-2 rounded-lg hover:bg-primary-light transition-colors"
          >
            <Pencil size={14} />
            Editar
          </Link>
          <button
            onClick={handleArquivar}
            className="flex items-center gap-1.5 text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg hover:text-[#1C1C1C] transition-colors"
          >
            <Archive size={15} />
            Arquivar
          </button>
        </div>
      </div>

      {/* Contact */}
      <div className="bg-surface rounded-card border border-border p-4 mb-4 flex flex-col gap-2">
        {paciente.telefone && (
          <div className="flex items-center gap-2 text-sm text-[#1C1C1C]">
            <Phone size={14} className="text-muted shrink-0" />
            {paciente.telefone}
          </div>
        )}
        {paciente.email && (
          <div className="flex items-center gap-2 text-sm text-[#1C1C1C]">
            <Mail size={14} className="text-muted shrink-0" />
            {paciente.email}
          </div>
        )}
        {paciente.data_nascimento && (
          <div className="flex items-center gap-2 text-sm text-[#1C1C1C]">
            <Calendar size={14} className="text-muted shrink-0" />
            {format(new Date(paciente.data_nascimento), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
          </div>
        )}
        {!paciente.telefone && !paciente.email && !paciente.data_nascimento && (
          <p className="text-sm text-muted">Nenhum dado de contato cadastrado.</p>
        )}
      </div>

      {/* Active contract */}
      {contrato && (
        <div className="bg-primary-light rounded-card border border-primary/20 p-4 mb-4 flex items-center gap-2">
          <Banknote size={16} className="text-primary shrink-0" />
          <p className="text-sm text-primary font-medium">
            {contratoDescricao(contrato.tipo, contrato.valor, contrato.qtd_sessoes, contrato.dia_vencimento)}
          </p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Total de sessões" value={stats.total} />
        <StatCard label="Concluídas" value={stats.concluidas} />
        <StatCard label="Faltas" value={stats.faltas} />
        <StatCard
          label="Total recebido"
          value={stats.totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        />
      </div>

      {/* History */}
      <div>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Histórico de sessões</h2>

        {sessoes.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted">Nenhuma sessão registrada.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessoes.map(s => {
              const cfg = STATUS_CONFIG[s.status]
              return (
                <div
                  key={s.id}
                  className="bg-surface rounded-card border border-border p-4 flex items-center justify-between"
                  style={{ borderLeftWidth: 3, borderLeftColor: cfg.cor }}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${cfg.cor}20`, color: cfg.cor }}
                      >
                        {cfg.label}
                      </span>
                      {s.modalidades?.nome && (
                        <span className="text-xs text-muted">{s.modalidades.nome}</span>
                      )}
                    </div>
                    <p className="text-sm text-[#1C1C1C]">
                      {format(new Date(s.data_hora), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  <div className="text-right">
                    {s.valor_cobrado != null && (
                      <p className="text-sm font-mono font-medium text-[#1C1C1C]">
                        {s.valor_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    )}
                    {s.pago && (
                      <p className="text-xs text-[#4CAF82] mt-0.5">Pago</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/PacienteDetalhePage.tsx
git commit -m "fix: translate PacienteDetalhePage to pt-BR, reuse STATUS_CONFIG"
```

---

## Task 3: Extend useModalidades with CRUD

**Files:**
- Modify: `src/hooks/useModalidades.ts`
- Modify: `src/hooks/__tests__/useModalidades.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/hooks/__tests__/useModalidades.test.ts`:

```typescript
  it('addModalidade inserts a new modality', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null })
    let callCount = 0

    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return { insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'new-id', nome: 'Casal', ativo: true }, error: null }) }) }) } as any
      }
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    })

    const { result } = renderHook(() => useModalidades())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addModalidade('Casal')
    })

    expect(supabase.from).toHaveBeenCalledWith('modalidades')
  })

  it('toggleAtivo deactivates a modality', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy, order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    const { result } = renderHook(() => useModalidades())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.toggleAtivo('m-1', false)
    })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'm-1')
  })
```

Note: the test file likely needs the `buildChain` helper and imports. Check if they already exist; if not, add the same pattern used in `usePacientes.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useModalidades } from '../useModalidades'

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }))
import { supabase } from '@/lib/supabase'

function buildChain(overrides: Record<string, any> = {}) {
  const base: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
  return base
}

describe('useModalidades', () => {
  beforeEach(() => vi.clearAllMocks())
  // ... existing tests here ...
})
```

- [ ] **Step 2: Run tests to see failures**

```bash
npx vitest run src/hooks/__tests__/useModalidades.test.ts
```
Expected: new tests FAIL with "result.current.addModalidade is not a function"

- [ ] **Step 3: Add addModalidade and toggleAtivo to useModalidades**

Replace `src/hooks/useModalidades.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Modalidade } from '@/lib/types'

export function useModalidades() {
  const [modalidades, setModalidades] = useState<Modalidade[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchModalidades() {
    const { data } = await supabase
      .from('modalidades')
      .select('*')
      .eq('ativo', true)
      .order('nome')
    setModalidades(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchModalidades()
  }, [])

  async function addModalidade(nome: string): Promise<void> {
    const { error } = await supabase
      .from('modalidades')
      .insert({ nome: nome.trim(), ativo: true })
    if (error) throw error
    await fetchModalidades()
  }

  async function toggleAtivo(id: string, ativo: boolean): Promise<void> {
    const { error } = await supabase
      .from('modalidades')
      .update({ ativo })
      .eq('id', id)
    if (error) throw error
    await fetchModalidades()
  }

  return { modalidades, loading, addModalidade, toggleAtivo }
}
```

- [ ] **Step 4: Run tests — all must pass**

```bash
npx vitest run src/hooks/__tests__/useModalidades.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useModalidades.ts src/hooks/__tests__/useModalidades.test.ts
git commit -m "feat: add addModalidade and toggleAtivo to useModalidades"
```

---

## Task 4: Add Modalidades section to ConfiguracoesPage

**Files:**
- Modify: `src/pages/ConfiguracoesPage.tsx`

The existing file has only the Convênios section. Add a Modalidades section below it using the same card pattern.

- [ ] **Step 1: Update ConfiguracoesPage with Modalidades section**

Replace the full content of `src/pages/ConfiguracoesPage.tsx`:

```tsx
import { useState } from 'react'
import { useConvenios } from '@/hooks/useConvenios'
import { useModalidades } from '@/hooks/useModalidades'
import { Plus, Trash2 } from 'lucide-react'

const inputClass = "h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function ConfiguracoesPage() {
  const { convenios, loading: loadingConvenios, addConvenio, toggleAtivo: toggleConvenio, updateValor } = useConvenios()
  const { modalidades, loading: loadingModalidades, addModalidade, toggleAtivo: toggleModalidade } = useModalidades()

  const [nomeConvenio, setNomeConvenio] = useState('')
  const [valorConvenio, setValorConvenio] = useState('')
  const [editandoValor, setEditandoValor] = useState<Record<string, string>>({})

  const [nomeModalidade, setNomeModalidade] = useState('')

  function handleAddConvenio() {
    if (!nomeConvenio.trim()) return
    addConvenio(nomeConvenio.trim(), valorConvenio ? Number(valorConvenio) : null)
    setNomeConvenio('')
    setValorConvenio('')
  }

  function handleValorBlur(id: string) {
    const v = editandoValor[id]
    if (v !== undefined) {
      updateValor(id, v === '' ? null : Number(v))
      setEditandoValor(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  function handleAddModalidade() {
    if (!nomeModalidade.trim()) return
    addModalidade(nomeModalidade.trim())
    setNomeModalidade('')
  }

  return (
    <div className="p-6 max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Configurações</h1>

      {/* Convênios */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Convênios</p>

        {loadingConvenios ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {convenios.length > 0 && (
              <div className="flex flex-col gap-2">
                {convenios.map(c => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-[#1C1C1C]">{c.nome}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="R$/sessão"
                      value={editandoValor[c.id] !== undefined
                        ? editandoValor[c.id]
                        : (c.valor_sessao != null ? String(c.valor_sessao) : '')}
                      onChange={e => setEditandoValor(prev => ({ ...prev, [c.id]: e.target.value }))}
                      onBlur={() => handleValorBlur(c.id)}
                      className={`${inputClass} w-28`}
                    />
                    <button
                      onClick={() => toggleConvenio(c.id, false)}
                      className="text-muted hover:text-[#E07070] transition-colors"
                      title="Desativar convênio"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {convenios.length === 0 && (
              <p className="text-sm text-muted">Nenhum convênio cadastrado.</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <input
                placeholder="Nome do plano"
                value={nomeConvenio}
                onChange={e => setNomeConvenio(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddConvenio())}
                className={`${inputClass} flex-1`}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="R$/sessão"
                value={valorConvenio}
                onChange={e => setValorConvenio(e.target.value)}
                className={`${inputClass} w-28`}
              />
              <button
                onClick={handleAddConvenio}
                disabled={!nomeConvenio.trim()}
                className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Modalidades */}
      <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Modalidades</p>

        {loadingModalidades ? (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {modalidades.length > 0 && (
              <div className="flex flex-col gap-2">
                {modalidades.map(m => (
                  <div key={m.id} className="flex items-center gap-3">
                    <span className="flex-1 text-sm text-[#1C1C1C]">{m.nome}</span>
                    <button
                      onClick={() => toggleModalidade(m.id, false)}
                      className="text-muted hover:text-[#E07070] transition-colors"
                      title="Desativar modalidade"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {modalidades.length === 0 && (
              <p className="text-sm text-muted">Nenhuma modalidade cadastrada.</p>
            )}

            <div className="flex gap-2 pt-1 border-t border-border">
              <input
                placeholder="Nome da modalidade"
                value={nomeModalidade}
                onChange={e => setNomeModalidade(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddModalidade())}
                className={`${inputClass} flex-1`}
              />
              <button
                onClick={handleAddModalidade}
                disabled={!nomeModalidade.trim()}
                className="h-9 px-3 rounded-lg bg-primary text-white disabled:opacity-40 hover:bg-primary/90 transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/ConfiguracoesPage.tsx
git commit -m "feat: add Modalidades section to ConfiguracoesPage"
```

---

## Task 5: Add Configurações básicas section + updateConfig

**Files:**
- Modify: `src/hooks/useConfigPsicologo.ts`
- Modify: `src/pages/ConfiguracoesPage.tsx`

- [ ] **Step 1: Add updateConfig to useConfigPsicologo**

Replace `src/hooks/useConfigPsicologo.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { ConfigPsicologo } from '@/lib/types'

export function useConfigPsicologo() {
  const [config, setConfig] = useState<ConfigPsicologo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('config_psicologo').select('*').limit(1)
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setConfig((data?.[0] as ConfigPsicologo) ?? null)
        setLoading(false)
      })
  }, [])

  async function updateConfig(patch: Partial<Pick<ConfigPsicologo, 'nome' | 'horario_inicio' | 'horario_fim'>>): Promise<void> {
    if (!config?.id) throw new Error('Config não carregada')
    const { data, error: err } = await supabase
      .from('config_psicologo')
      .update(patch)
      .eq('id', config.id)
      .select('*')
      .single()
    if (err) throw err
    setConfig(data as ConfigPsicologo)
  }

  return { config, loading, error, updateConfig }
}
```

- [ ] **Step 2: Add Configurações básicas section to ConfiguracoesPage**

In `src/pages/ConfiguracoesPage.tsx`, add the import and section. Add to the existing imports:

```tsx
import { useConfigPsicologo } from '@/hooks/useConfigPsicologo'
```

Add state after the existing state declarations:

```tsx
const { config, loading: loadingConfig, updateConfig } = useConfigPsicologo()
const [configForm, setConfigForm] = useState({ nome: '', horario_inicio: '', horario_fim: '' })
const [salvandoConfig, setSalvandoConfig] = useState(false)

// Sync config into form once loaded
const [configSynced, setConfigSynced] = useState(false)
if (config && !configSynced) {
  setConfigForm({
    nome: config.nome ?? '',
    horario_inicio: config.horario_inicio ?? '07:00',
    horario_fim: config.horario_fim ?? '21:00',
  })
  setConfigSynced(true)
}
```

Add the save handler:

```tsx
async function handleSaveConfig(e: React.FormEvent) {
  e.preventDefault()
  setSalvandoConfig(true)
  try {
    await updateConfig({
      nome: configForm.nome || null,
      horario_inicio: configForm.horario_inicio || null,
      horario_fim: configForm.horario_fim || null,
    } as any)
  } finally {
    setSalvandoConfig(false)
  }
}
```

Add this section **before** the Convênios section (at the top after the `<h1>`):

```tsx
{/* Configurações básicas */}
<div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
  <p className="text-xs font-semibold text-muted uppercase tracking-wide">Configurações básicas</p>

  {loadingConfig ? (
    <div className="flex justify-center py-4">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ) : (
    <form onSubmit={handleSaveConfig} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-[#1C1C1C]">Seu nome</label>
        <input
          value={configForm.nome}
          onChange={e => setConfigForm(f => ({ ...f, nome: e.target.value }))}
          placeholder="Nome do psicólogo"
          className={inputClass}
        />
      </div>
      <div className="flex gap-3">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-sm font-medium text-[#1C1C1C]">Horário de início</label>
          <input
            type="time"
            value={configForm.horario_inicio}
            onChange={e => setConfigForm(f => ({ ...f, horario_inicio: e.target.value }))}
            className={`${inputClass} w-full`}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-sm font-medium text-[#1C1C1C]">Horário de término</label>
          <input
            type="time"
            value={configForm.horario_fim}
            onChange={e => setConfigForm(f => ({ ...f, horario_fim: e.target.value }))}
            className={`${inputClass} w-full`}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={salvandoConfig}
        className="self-end h-9 px-4 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
      >
        {salvandoConfig ? 'Salvando...' : 'Salvar'}
      </button>
    </form>
  )}
</div>
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: all existing tests pass

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useConfigPsicologo.ts src/pages/ConfiguracoesPage.tsx
git commit -m "feat: add updateConfig + Configurações básicas section"
```

---

## Task 6: Add updatePaciente to usePacientes

**Files:**
- Modify: `src/hooks/usePacientes.ts`
- Modify: `src/hooks/__tests__/usePacientes.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the `describe('usePacientes', ...)` block in `src/hooks/__tests__/usePacientes.test.ts`:

```typescript
  it('updatePaciente calls update on pacientes table', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy, order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updatePaciente('p-1', { nome: 'Novo Nome' })
    })

    expect(updateSpy).toHaveBeenCalledWith({ nome: 'Novo Nome' })
    expect(eqSpy).toHaveBeenCalledWith('id', 'p-1')
  })

  it('updatePaciente throws when Supabase returns error', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: { message: 'update failed' } })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy, order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.updatePaciente('p-1', { nome: 'X' }) })
    ).rejects.toBeDefined()
  })
```

- [ ] **Step 2: Run tests to see failures**

```bash
npx vitest run src/hooks/__tests__/usePacientes.test.ts
```
Expected: new tests FAIL with "result.current.updatePaciente is not a function"

- [ ] **Step 3: Add UpdatePacienteInput type and updatePaciente function**

Replace `src/hooks/usePacientes.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { PacienteComConvenio, ContratoTipo } from '@/lib/types'

export interface CreatePacienteInput {
  nome: string
  telefone?: string
  email?: string
  data_nascimento?: string
  tipo?: 'particular' | 'convenio'
  convenio_id?: string
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number
    dia_vencimento?: number
  }
}

export interface UpdatePacienteInput {
  nome?: string
  telefone?: string | null
  email?: string | null
  data_nascimento?: string | null
  tipo?: 'particular' | 'convenio'
  convenio_id?: string | null
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number | null
    dia_vencimento?: number | null
  } | null
}

export function usePacientes() {
  const [pacientes, setPacientes] = useState<PacienteComConvenio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchPacientes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pacientes')
      .select('*, convenios(nome, valor_sessao)')
      .eq('ativo', true)
      .order('nome')

    if (error) {
      setError(error.message)
      setPacientes([])
    } else {
      setPacientes((data as PacienteComConvenio[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchPacientes()
  }, [])

  async function createPaciente(input: CreatePacienteInput): Promise<string> {
    const { data: paciente, error: pacienteError } = await supabase
      .from('pacientes')
      .insert({
        nome: input.nome,
        telefone: input.telefone ?? null,
        email: input.email ?? null,
        data_nascimento: input.data_nascimento ?? null,
        tipo: input.tipo ?? 'particular',
        convenio_id: input.convenio_id ?? null,
      })
      .select('id')
      .single()

    if (pacienteError) throw pacienteError

    if (input.contrato) {
      const { error: contratoError } = await supabase
        .from('contratos')
        .insert({
          paciente_id: paciente.id,
          tipo: input.contrato.tipo,
          valor: input.contrato.valor,
          qtd_sessoes: input.contrato.qtd_sessoes ?? null,
          dia_vencimento: input.contrato.dia_vencimento ?? null,
          ativo: true,
        })
      if (contratoError) throw contratoError
    }

    await fetchPacientes()
    return paciente.id
  }

  async function updatePaciente(id: string, input: UpdatePacienteInput): Promise<void> {
    const patch: Record<string, unknown> = {}
    if (input.nome !== undefined) patch.nome = input.nome
    if (input.telefone !== undefined) patch.telefone = input.telefone
    if (input.email !== undefined) patch.email = input.email
    if (input.data_nascimento !== undefined) patch.data_nascimento = input.data_nascimento
    if (input.tipo !== undefined) patch.tipo = input.tipo
    if (input.convenio_id !== undefined) patch.convenio_id = input.convenio_id

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('pacientes').update(patch).eq('id', id)
      if (error) throw error
    }

    if (input.contrato !== undefined) {
      await supabase.from('contratos').update({ ativo: false }).eq('paciente_id', id)
      if (input.contrato !== null) {
        const { error } = await supabase.from('contratos').insert({
          paciente_id: id,
          tipo: input.contrato.tipo,
          valor: input.contrato.valor,
          qtd_sessoes: input.contrato.qtd_sessoes ?? null,
          dia_vencimento: input.contrato.dia_vencimento ?? null,
          ativo: true,
        })
        if (error) throw error
      }
    }

    await fetchPacientes()
  }

  async function arquivarPaciente(id: string): Promise<void> {
    const { error } = await supabase
      .from('pacientes')
      .update({ ativo: false })
      .eq('id', id)

    if (error) throw error
    await fetchPacientes()
  }

  return { pacientes, loading, error, createPaciente, updatePaciente, arquivarPaciente }
}
```

- [ ] **Step 4: Run tests — all must pass**

```bash
npx vitest run src/hooks/__tests__/usePacientes.test.ts
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePacientes.ts src/hooks/__tests__/usePacientes.test.ts
git commit -m "feat: add updatePaciente to usePacientes"
```

---

## Task 7: Create EditarPacientePage + route + edit button

**Files:**
- Create: `src/pages/EditarPacientePage.tsx`
- Modify: `src/router.tsx`

(The edit button was already added to `PacienteDetalhePage` in Task 2.)

- [ ] **Step 1: Create EditarPacientePage**

Create `src/pages/EditarPacientePage.tsx`:

```tsx
import { useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { usePacienteDetalhe } from '@/hooks/usePacienteDetalhe'
import { usePacientes } from '@/hooks/usePacientes'
import { useConvenios } from '@/hooks/useConvenios'

const schema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório'),
  telefone: z.string().optional(),
  email: z.string().email('E-mail inválido').or(z.literal('')).optional(),
  data_nascimento: z.string().optional(),
  tipo: z.enum(['particular', 'convenio']).default('particular'),
  convenio_id: z.string().optional(),
  tem_contrato: z.boolean(),
  contrato_tipo: z.enum(['por_sessao', 'pacote', 'mensal']).optional(),
  contrato_valor: z.string().optional(),
  contrato_qtd_sessoes: z.string().optional(),
  contrato_dia_vencimento: z.string().optional(),
}).superRefine((d, ctx) => {
  if (d.tipo === 'convenio' && !d.convenio_id) {
    ctx.addIssue({ code: 'custom', path: ['convenio_id'], message: 'Selecione o convênio' })
  }
  if (d.tem_contrato && d.tipo === 'particular') {
    if (!d.contrato_tipo) {
      ctx.addIssue({ code: 'custom', path: ['contrato_tipo'], message: 'Selecione o tipo de contrato' })
    }
    if (!d.contrato_valor || Number(d.contrato_valor) <= 0) {
      ctx.addIssue({ code: 'custom', path: ['contrato_valor'], message: 'Informe o valor' })
    }
  }
})

type FormData = z.infer<typeof schema>

const inputClass = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"

export function EditarPacientePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { paciente, contrato, loading } = usePacienteDetalhe(id!)
  const { updatePaciente } = usePacientes()
  const { convenios } = useConvenios()

  const { register, handleSubmit, watch, reset, setError, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'particular', tem_contrato: false },
  })

  const tipo = watch('tipo')
  const temContrato = watch('tem_contrato')
  const contratoTipo = watch('contrato_tipo')

  // Pre-fill form once data is loaded
  useEffect(() => {
    if (!paciente) return
    reset({
      nome: paciente.nome,
      telefone: paciente.telefone ?? '',
      email: paciente.email ?? '',
      data_nascimento: paciente.data_nascimento ?? '',
      tipo: paciente.tipo,
      convenio_id: paciente.convenio_id ?? '',
      tem_contrato: !!contrato,
      contrato_tipo: contrato?.tipo,
      contrato_valor: contrato ? String(contrato.valor) : '',
      contrato_qtd_sessoes: contrato?.qtd_sessoes ? String(contrato.qtd_sessoes) : '',
      contrato_dia_vencimento: contrato?.dia_vencimento ? String(contrato.dia_vencimento) : '',
    })
  }, [paciente, contrato, reset])

  async function onSubmit(data: FormData) {
    try {
      await updatePaciente(id!, {
        nome: data.nome,
        telefone: data.telefone || null,
        email: data.email || null,
        data_nascimento: data.data_nascimento || null,
        tipo: data.tipo,
        convenio_id: data.tipo === 'convenio' ? (data.convenio_id || null) : null,
        contrato: data.tem_contrato && data.tipo === 'particular' && data.contrato_tipo
          ? {
              tipo: data.contrato_tipo,
              valor: Number(data.contrato_valor),
              qtd_sessoes: data.contrato_qtd_sessoes ? Number(data.contrato_qtd_sessoes) : null,
              dia_vencimento: data.contrato_dia_vencimento ? Number(data.contrato_dia_vencimento) : null,
            }
          : null,
      })
      navigate(`/pacientes/${id}`)
    } catch {
      setError('root', { message: 'Erro ao salvar. Tente novamente.' })
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!paciente) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted">Paciente não encontrado.</p>
        <Link to="/pacientes" className="text-primary text-sm mt-2 inline-block hover:underline">
          Voltar para Pacientes
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to={`/pacientes/${id}`} className="text-muted hover:text-[#1C1C1C] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Editar paciente</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">

        {/* Dados pessoais */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Dados pessoais</p>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Nome completo</label>
            <input {...register('nome')} className={inputClass} />
            {errors.nome && <span className="text-xs text-[#E07070]">{errors.nome.message}</span>}
          </div>

          {/* Tipo */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[#1C1C1C]">Tipo de atendimento</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" value="particular" {...register('tipo')} className="accent-primary" />
                Particular
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" value="convenio" {...register('tipo')} className="accent-primary" />
                Convênio
              </label>
            </div>
          </div>

          {tipo === 'convenio' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#1C1C1C]">Plano de saúde</label>
              <select {...register('convenio_id')} className={inputClass}>
                <option value="">Selecionar...</option>
                {convenios.map(c => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
              {errors.convenio_id && <span className="text-xs text-[#E07070]">{errors.convenio_id.message}</span>}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Telefone / WhatsApp</label>
            <input {...register('telefone')} placeholder="(11) 99999-9999" className={inputClass} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">E-mail</label>
            <input {...register('email')} type="email" placeholder="email@exemplo.com" className={inputClass} />
            {errors.email && <span className="text-xs text-[#E07070]">{errors.email.message}</span>}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#1C1C1C]">Data de nascimento</label>
            <input {...register('data_nascimento')} type="date" className={inputClass} />
          </div>
        </div>

        {/* Cobrança */}
        {tipo === 'particular' && (
          <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Cobrança</p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" {...register('tem_contrato')} className="accent-primary w-4 h-4" />
              <span className="text-sm">Definir contrato de cobrança</span>
            </label>

            {temContrato && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-[#1C1C1C]">Tipo de cobrança</label>
                  <select {...register('contrato_tipo')} className={inputClass}>
                    <option value="">Selecionar...</option>
                    <option value="por_sessao">Por sessão</option>
                    <option value="pacote">Pacote de sessões</option>
                    <option value="mensal">Mensal</option>
                  </select>
                  {errors.contrato_tipo && <span className="text-xs text-[#E07070]">{errors.contrato_tipo.message}</span>}
                </div>

                {contratoTipo && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-[#1C1C1C]">Valor (R$)</label>
                    <input {...register('contrato_valor')} type="number" step="0.01" min="0" className={inputClass} />
                    {errors.contrato_valor && <span className="text-xs text-[#E07070]">{errors.contrato_valor.message}</span>}
                  </div>
                )}

                {contratoTipo === 'pacote' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-[#1C1C1C]">Número de sessões no pacote</label>
                    <input {...register('contrato_qtd_sessoes')} type="number" min="1" className={inputClass} />
                  </div>
                )}

                {contratoTipo === 'mensal' && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-[#1C1C1C]">Dia de vencimento</label>
                    <input {...register('contrato_dia_vencimento')} type="number" min="1" max="31" className={inputClass} />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {errors.root && (
          <p className="text-sm text-[#E07070] text-center">{errors.root.message}</p>
        )}

        <div className="flex gap-3">
          <Link
            to={`/pacientes/${id}`}
            className="flex-1 h-10 rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors flex items-center justify-center"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Add route to router.tsx**

In `src/router.tsx`, add the import and route:

```tsx
import { EditarPacientePage } from '@/pages/EditarPacientePage'
```

Add route after `/pacientes/:id`:

```tsx
{ path: '/pacientes/:id/editar', element: <EditarPacientePage /> },
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/pages/EditarPacientePage.tsx src/router.tsx
git commit -m "feat: add EditarPacientePage with route /pacientes/:id/editar"
```

---

## Verification

1. `npx tsc --noEmit` → 0 errors
2. `npx vitest run` → all tests pass
3. Open `/pacientes` → heading shows "Pacientes", search placeholder "Buscar paciente...", empty state in Portuguese
4. Open a patient detail → all labels in Portuguese, "Editar" and "Arquivar" buttons visible
5. Click "Editar" → `/pacientes/:id/editar` opens, form pre-filled with patient data
6. Edit patient name, save → redirected back to detail page with updated data
7. Open `/configuracoes` → three sections: "Configurações básicas", "Convênios", "Modalidades"
8. Add a modalidade → appears in list; click trash → disappears
9. Edit horario_inicio/fim → save → `/kanban` reflects new time range
