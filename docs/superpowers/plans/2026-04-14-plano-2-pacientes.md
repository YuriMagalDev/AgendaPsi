# Módulo Pacientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o módulo completo de pacientes: lista com busca, cadastro com contrato de cobrança e perfil com histórico de sessões e ação de arquivar.

**Architecture:** Três hooks isolados (`usePacientes`, `usePacienteDetalhe`) chamam Supabase diretamente via `supabase-js`. As três páginas placeholder existentes são substituídas por implementações reais. Nenhum estado global — cada página busca seus próprios dados.

**Tech Stack:** React + TypeScript + React Hook Form + Zod + Supabase JS + date-fns + Tailwind CSS + lucide-react

---

## File Structure

**Criar:**
- `src/hooks/usePacientes.ts` — lista de pacientes ativos, createPaciente, arquivarPaciente
- `src/hooks/usePacienteDetalhe.ts` — paciente + sessões com modalidade + contrato ativo + stats
- `src/hooks/__tests__/usePacientes.test.ts`
- `src/hooks/__tests__/usePacienteDetalhe.test.ts`

**Modificar:**
- `src/lib/types.ts` — adicionar `SessaoComModalidade`
- `src/pages/PacientesPage.tsx` — lista com busca (substituir stub)
- `src/pages/NovoPacientePage.tsx` — formulário de cadastro (substituir stub)
- `src/pages/PacienteDetalhePage.tsx` — perfil do paciente (substituir stub)

---

### Task 1: Tipo `SessaoComModalidade` + hook `usePacientes`

Hook que busca todos os pacientes ativos, cria um novo paciente (com contrato opcional) e arquiva. Usado em PacientesPage e NovoPacientePage.

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/hooks/usePacientes.ts`
- Create: `src/hooks/__tests__/usePacientes.test.ts`

- [ ] **Step 1: Adicionar `SessaoComModalidade` em `src/lib/types.ts`**

Abrir `src/lib/types.ts` e adicionar ao final (após a linha 91, `}`):

```typescript
export type SessaoComModalidade = Sessao & {
  modalidades: { nome: string } | null
}
```

- [ ] **Step 2: Escrever os testes falhando**

Criar `src/hooks/__tests__/usePacientes.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePacientes } from '../usePacientes'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

/** Helper: cria um mock de fluent-builder do Supabase */
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

describe('usePacientes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('busca pacientes ativos ordenados por nome', async () => {
    const mockData = [
      { id: '1', nome: 'Ana Lima', telefone: null, email: null, data_nascimento: null, ativo: true, criado_em: '2024-01-01T00:00:00Z' },
    ]
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: mockData, error: null }) })
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.pacientes).toEqual(mockData)
    expect(supabase.from).toHaveBeenCalledWith('pacientes')
  })

  it('define error quando fetch falha', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }) })
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('DB error')
    expect(result.current.pacientes).toEqual([])
  })

  it('createPaciente retorna o id do novo paciente', async () => {
    const newId = 'uuid-novo'
    let callCount = 0

    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        // Segunda chamada = insert do paciente
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: newId }, error: null }),
            }),
          }),
        } as any
      }
      // Primeira (fetch inicial) e terceira+ (refresh pós-criação)
      return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
    })

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returnedId = ''
    await act(async () => {
      returnedId = await result.current.createPaciente({ nome: 'João' })
    })

    expect(returnedId).toBe(newId)
  })

  it('createPaciente lança exceção quando Supabase retorna erro', async () => {
    let callCount = 0
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++
      if (callCount === 2) {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } }),
            }),
          }),
        } as any
      }
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(
      act(async () => { await result.current.createPaciente({ nome: 'Erro' }) })
    ).rejects.toBeDefined()
  })

  it('arquivarPaciente chama update no Supabase', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockReturnValue(
      buildChain({ update: updateSpy }) as any
    )

    const { result } = renderHook(() => usePacientes())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.arquivarPaciente('p-123')
    })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'p-123')
  })
})
```

- [ ] **Step 3: Rodar os testes para confirmar que falham**

```
npx vitest run src/hooks/__tests__/usePacientes.test.ts
```

Expected: FAIL com "Cannot find module '../usePacientes'"

- [ ] **Step 4: Implementar `src/hooks/usePacientes.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Paciente, ContratoTipo } from '@/lib/types'

export interface CreatePacienteInput {
  nome: string
  telefone?: string
  email?: string
  data_nascimento?: string
  contrato?: {
    tipo: ContratoTipo
    valor: number
    qtd_sessoes?: number
    dia_vencimento?: number
  }
}

export function usePacientes() {
  const [pacientes, setPacientes] = useState<Paciente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchPacientes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pacientes')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    if (error) {
      setError(error.message)
      setPacientes([])
    } else {
      setPacientes(data ?? [])
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

  async function arquivarPaciente(id: string): Promise<void> {
    const { error } = await supabase
      .from('pacientes')
      .update({ ativo: false })
      .eq('id', id)

    if (error) throw error
    await fetchPacientes()
  }

  return { pacientes, loading, error, createPaciente, arquivarPaciente }
}
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

```
npx vitest run src/hooks/__tests__/usePacientes.test.ts
```

Expected: PASS — 5 testes passando

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/hooks/usePacientes.ts src/hooks/__tests__/usePacientes.test.ts
git commit -m "feat: add SessaoComModalidade type and usePacientes hook"
```

---

### Task 2: Hook `usePacienteDetalhe`

Hook que busca em paralelo: o paciente pelo ID, suas sessões com nome da modalidade e o contrato ativo. Calcula stats de sessões. Usado em PacienteDetalhePage.

**Files:**
- Create: `src/hooks/usePacienteDetalhe.ts`
- Create: `src/hooks/__tests__/usePacienteDetalhe.test.ts`

- [ ] **Step 1: Escrever os testes falhando**

Criar `src/hooks/__tests__/usePacienteDetalhe.test.ts`:

```typescript
import { renderHook, waitFor, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { usePacienteDetalhe } from '../usePacienteDetalhe'

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { supabase } from '@/lib/supabase'

const mockPaciente = {
  id: 'p-1',
  nome: 'Maria Souza',
  telefone: '11988887777',
  email: 'maria@email.com',
  data_nascimento: '1985-06-15',
  ativo: true,
  criado_em: '2024-01-01T00:00:00Z',
}

const mockSessoes = [
  { id: 's-1', paciente_id: 'p-1', status: 'concluida', pago: true, valor_cobrado: 150, data_hora: '2024-03-01T14:00:00Z', modalidades: { nome: 'Presencial' }, avulso_nome: null, avulso_telefone: null, modalidade_id: 'm-1', remarcada_para: null, sessao_origem_id: null, criado_em: '2024-03-01T00:00:00Z', data_pagamento: null },
  { id: 's-2', paciente_id: 'p-1', status: 'faltou', pago: false, valor_cobrado: 150, data_hora: '2024-03-08T14:00:00Z', modalidades: { nome: 'Presencial' }, avulso_nome: null, avulso_telefone: null, modalidade_id: 'm-1', remarcada_para: null, sessao_origem_id: null, criado_em: '2024-03-08T00:00:00Z', data_pagamento: null },
  { id: 's-3', paciente_id: 'p-1', status: 'concluida', pago: false, valor_cobrado: 150, data_hora: '2024-03-15T14:00:00Z', modalidades: { nome: 'Presencial' }, avulso_nome: null, avulso_telefone: null, modalidade_id: 'm-1', remarcada_para: null, sessao_origem_id: null, criado_em: '2024-03-15T00:00:00Z', data_pagamento: null },
]

const mockContrato = {
  id: 'c-1',
  paciente_id: 'p-1',
  tipo: 'por_sessao' as const,
  valor: 150,
  qtd_sessoes: null,
  dia_vencimento: null,
  ativo: true,
  criado_em: '2024-01-01T00:00:00Z',
}

function buildChain(overrides: Record<string, any> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    ...overrides,
  }
}

describe('usePacienteDetalhe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('busca paciente, sessões e contrato em paralelo', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'pacientes') {
        return buildChain({ single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }) }) as any
      }
      if (table === 'sessoes') {
        return buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) }) as any
      }
      if (table === 'contratos') {
        return buildChain({ maybeSingle: vi.fn().mockResolvedValue({ data: mockContrato, error: null }) }) as any
      }
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacienteDetalhe('p-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.paciente).toEqual(mockPaciente)
    expect(result.current.sessoes).toHaveLength(3)
    expect(result.current.contrato).toEqual(mockContrato)
  })

  it('calcula stats corretamente a partir das sessões', async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'pacientes') return buildChain({ single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }) }) as any
      if (table === 'sessoes') return buildChain({ order: vi.fn().mockResolvedValue({ data: mockSessoes, error: null }) }) as any
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacienteDetalhe('p-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.stats.total).toBe(3)
    expect(result.current.stats.concluidas).toBe(2)
    expect(result.current.stats.faltas).toBe(1)
    expect(result.current.stats.totalPago).toBe(150) // só s-1 é pago
  })

  it('arquivar chama update com ativo=false', async () => {
    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === 'pacientes') {
        return buildChain({
          single: vi.fn().mockResolvedValue({ data: mockPaciente, error: null }),
          update: updateSpy,
        }) as any
      }
      if (table === 'sessoes') return buildChain({ order: vi.fn().mockResolvedValue({ data: [], error: null }) }) as any
      return buildChain() as any
    })

    const { result } = renderHook(() => usePacienteDetalhe('p-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => { await result.current.arquivar() })

    expect(updateSpy).toHaveBeenCalledWith({ ativo: false })
    expect(eqSpy).toHaveBeenCalledWith('id', 'p-1')
  })
})
```

- [ ] **Step 2: Rodar os testes para confirmar que falham**

```
npx vitest run src/hooks/__tests__/usePacienteDetalhe.test.ts
```

Expected: FAIL com "Cannot find module '../usePacienteDetalhe'"

- [ ] **Step 3: Implementar `src/hooks/usePacienteDetalhe.ts`**

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Paciente, Contrato, SessaoComModalidade } from '@/lib/types'

interface Stats {
  total: number
  concluidas: number
  faltas: number
  totalPago: number
}

export function usePacienteDetalhe(id: string) {
  const [paciente, setPaciente] = useState<Paciente | null>(null)
  const [sessoes, setSessoes] = useState<SessaoComModalidade[]>([])
  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return

    async function fetchAll() {
      const [pacienteRes, sessoesRes, contratoRes] = await Promise.all([
        supabase.from('pacientes').select('*').eq('id', id).single(),
        supabase
          .from('sessoes')
          .select('*, modalidades(nome)')
          .eq('paciente_id', id)
          .order('data_hora', { ascending: false }),
        supabase
          .from('contratos')
          .select('*')
          .eq('paciente_id', id)
          .eq('ativo', true)
          .maybeSingle(),
      ])

      setPaciente(pacienteRes.data)
      setSessoes((sessoesRes.data ?? []) as SessaoComModalidade[])
      setContrato(contratoRes.data)
      setLoading(false)
    }

    fetchAll()
  }, [id])

  const stats: Stats = {
    total: sessoes.length,
    concluidas: sessoes.filter(s => s.status === 'concluida').length,
    faltas: sessoes.filter(s => s.status === 'faltou').length,
    totalPago: sessoes
      .filter(s => s.pago)
      .reduce((sum, s) => sum + (s.valor_cobrado ?? 0), 0),
  }

  async function arquivar(): Promise<void> {
    const { error } = await supabase
      .from('pacientes')
      .update({ ativo: false })
      .eq('id', id)
    if (error) throw error
  }

  return { paciente, sessoes, contrato, stats, loading, arquivar }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

```
npx vitest run src/hooks/__tests__/usePacienteDetalhe.test.ts
```

Expected: PASS — 3 testes passando

- [ ] **Step 5: Rodar todos os testes para confirmar que não quebrou nada**

```
npx vitest run
```

Expected: todos passando (ignorar o erro de tipo em types.test.ts — é pré-existente)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/usePacienteDetalhe.ts src/hooks/__tests__/usePacienteDetalhe.test.ts
git commit -m "feat: add usePacienteDetalhe hook with stats computation"
```

---

### Task 3: `PacientesPage` — lista com busca

Lista todos os pacientes ativos com campo de busca por nome. Link para cada perfil e botão "Novo Paciente".

**Files:**
- Modify: `src/pages/PacientesPage.tsx`

- [ ] **Step 1: Substituir o stub pela implementação**

Substituir todo o conteúdo de `src/pages/PacientesPage.tsx`:

```typescript
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, ChevronRight, UserRound } from 'lucide-react'
import { usePacientes } from '@/hooks/usePacientes'
import type { Paciente } from '@/lib/types'

const contratoLabel: Record<string, string> = {
  por_sessao: 'Por sessão',
  pacote: 'Pacote',
  mensal: 'Mensal',
}

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
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Pacientes</h1>
        <Link to="/pacientes/novo">
          <button className="flex items-center gap-1.5 bg-primary text-white text-sm font-medium px-3 py-2 rounded-lg hover:bg-primary/90 transition-colors">
            <Plus size={16} />
            Novo
          </button>
        </Link>
      </div>

      {/* Busca */}
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

      {/* Estados */}
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

- [ ] **Step 2: Verificar no browser**

Com o dev server rodando (`npm run dev`), navegar para `/pacientes`.

Expected: página com header "Pacientes", campo de busca e estado vazio (nenhum paciente cadastrado ainda) ou lista de pacientes se já houver dados no Supabase.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PacientesPage.tsx
git commit -m "feat: implement PacientesPage with search and patient list"
```

---

### Task 4: `NovoPacientePage` — formulário de cadastro

Formulário para criar paciente com nome, contato, data de nascimento e seção opcional de contrato de cobrança. Após salvar, navega para o perfil do paciente criado.

**Files:**
- Modify: `src/pages/NovoPacientePage.tsx`

- [ ] **Step 1: Substituir o stub pela implementação**

Substituir todo o conteúdo de `src/pages/NovoPacientePage.tsx`:

```typescript
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft } from 'lucide-react'
import { usePacientes } from '@/hooks/usePacientes'
import type { ContratoTipo } from '@/lib/types'

const schema = z
  .object({
    nome: z.string().min(1, 'Nome é obrigatório'),
    telefone: z.string().optional(),
    email: z.string().optional(),
    data_nascimento: z.string().optional(),
    tem_contrato: z.boolean(),
    contrato_tipo: z.enum(['por_sessao', 'pacote', 'mensal']).optional(),
    contrato_valor: z.string().optional(),
    contrato_qtd_sessoes: z.string().optional(),
    contrato_dia_vencimento: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.email && data.email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'E-mail inválido' })
    }
    if (data.tem_contrato) {
      if (!data.contrato_tipo) {
        ctx.addIssue({ code: 'custom', path: ['contrato_tipo'], message: 'Selecione o tipo de cobrança' })
      }
      if (!data.contrato_valor || isNaN(Number(data.contrato_valor)) || Number(data.contrato_valor) <= 0) {
        ctx.addIssue({ code: 'custom', path: ['contrato_valor'], message: 'Informe um valor válido' })
      }
      if (data.contrato_tipo === 'pacote') {
        if (!data.contrato_qtd_sessoes || isNaN(Number(data.contrato_qtd_sessoes)) || Number(data.contrato_qtd_sessoes) < 1) {
          ctx.addIssue({ code: 'custom', path: ['contrato_qtd_sessoes'], message: 'Informe a quantidade de sessões' })
        }
      }
      if (data.contrato_tipo === 'mensal') {
        const dia = Number(data.contrato_dia_vencimento)
        if (!data.contrato_dia_vencimento || isNaN(dia) || dia < 1 || dia > 31) {
          ctx.addIssue({ code: 'custom', path: ['contrato_dia_vencimento'], message: 'Informe um dia entre 1 e 31' })
        }
      }
    }
  })

type FormData = z.infer<typeof schema>

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <span className="text-xs text-[#E07070] mt-1">{message}</span>
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-sm font-medium text-[#1C1C1C]">
      {children}
      {required && <span className="text-[#E07070] ml-0.5">*</span>}
    </label>
  )
}

const inputClass = "w-full h-9 px-3 rounded-lg border border-border bg-surface text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors placeholder:text-muted"

export function NovoPacientePage() {
  const navigate = useNavigate()
  const { createPaciente } = usePacientes()
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tem_contrato: false },
  })

  const temContrato = watch('tem_contrato')
  const contratoTipo = watch('contrato_tipo')

  async function onSubmit(data: FormData) {
    setServerError(null)
    try {
      const id = await createPaciente({
        nome: data.nome,
        telefone: data.telefone || undefined,
        email: data.email || undefined,
        data_nascimento: data.data_nascimento || undefined,
        contrato: data.tem_contrato && data.contrato_tipo
          ? {
              tipo: data.contrato_tipo as ContratoTipo,
              valor: Number(data.contrato_valor),
              qtd_sessoes: data.contrato_tipo === 'pacote' ? Number(data.contrato_qtd_sessoes) : undefined,
              dia_vencimento: data.contrato_tipo === 'mensal' ? Number(data.contrato_dia_vencimento) : undefined,
            }
          : undefined,
      })
      navigate(`/pacientes/${id}`)
    } catch {
      setServerError('Erro ao salvar. Tente novamente.')
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/pacientes" className="text-muted hover:text-[#1C1C1C] transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="font-display text-2xl font-semibold text-[#1C1C1C]">Novo Paciente</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        {/* Dados pessoais */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Dados pessoais</p>

          <div className="flex flex-col gap-1">
            <FieldLabel required>Nome</FieldLabel>
            <input {...register('nome')} placeholder="Nome completo" className={inputClass} />
            <FieldError message={errors.nome?.message} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>WhatsApp</FieldLabel>
            <input {...register('telefone')} placeholder="(11) 99999-9999" className={inputClass} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>E-mail</FieldLabel>
            <input {...register('email')} type="email" placeholder="email@exemplo.com" className={inputClass} />
            <FieldError message={errors.email?.message} />
          </div>

          <div className="flex flex-col gap-1">
            <FieldLabel>Data de nascimento</FieldLabel>
            <input {...register('data_nascimento')} type="date" className={inputClass} />
          </div>
        </div>

        {/* Contrato */}
        <div className="bg-surface rounded-card border border-border p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Cobrança</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                {...register('tem_contrato')}
                className="w-4 h-4 accent-primary"
              />
              <span className="text-sm text-[#1C1C1C]">Definir agora</span>
            </label>
          </div>

          {temContrato && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <FieldLabel>Tipo de cobrança</FieldLabel>
                <select
                  {...register('contrato_tipo')}
                  className={inputClass}
                >
                  <option value="">Selecione...</option>
                  <option value="por_sessao">Por sessão</option>
                  <option value="pacote">Pacote de sessões</option>
                  <option value="mensal">Mensalidade</option>
                </select>
                <FieldError message={errors.contrato_tipo?.message} />
              </div>

              <div className="flex flex-col gap-1">
                <FieldLabel>Valor (R$)</FieldLabel>
                <input
                  {...register('contrato_valor')}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  className={inputClass}
                />
                <FieldError message={errors.contrato_valor?.message} />
              </div>

              {contratoTipo === 'pacote' && (
                <div className="flex flex-col gap-1">
                  <FieldLabel>Quantidade de sessões</FieldLabel>
                  <input
                    {...register('contrato_qtd_sessoes')}
                    type="number"
                    min="1"
                    placeholder="Ex: 10"
                    className={inputClass}
                  />
                  <FieldError message={errors.contrato_qtd_sessoes?.message} />
                </div>
              )}

              {contratoTipo === 'mensal' && (
                <div className="flex flex-col gap-1">
                  <FieldLabel>Dia de vencimento</FieldLabel>
                  <input
                    {...register('contrato_dia_vencimento')}
                    type="number"
                    min="1"
                    max="31"
                    placeholder="Ex: 5"
                    className={inputClass}
                  />
                  <FieldError message={errors.contrato_dia_vencimento?.message} />
                </div>
              )}
            </div>
          )}

          {!temContrato && (
            <p className="text-sm text-muted">Você pode definir a forma de cobrança depois no perfil do paciente.</p>
          )}
        </div>

        {serverError && (
          <p className="text-sm text-[#E07070] text-center">{serverError}</p>
        )}

        {/* Ações */}
        <div className="flex gap-3">
          <Link
            to="/pacientes"
            className="flex-1 h-10 flex items-center justify-center rounded-lg border border-border text-sm font-medium text-[#1C1C1C] hover:bg-bg transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 h-10 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verificar no browser**

Navegar para `/pacientes/novo`.

Expected:
- Formulário com seção "Dados pessoais" (Nome*, WhatsApp, E-mail, Data nascimento)
- Seção "Cobrança" com checkbox "Definir agora"
- Ao marcar o checkbox: aparecem campos de contrato (tipo, valor, campos condicionais)
- Botões Cancelar e Salvar
- Preencher nome + marcar pacote + informar valor e qtd → clicar Salvar → redireciona para `/pacientes/:id`

- [ ] **Step 3: Commit**

```bash
git add src/pages/NovoPacientePage.tsx
git commit -m "feat: implement NovoPacientePage with patient creation form"
```

---

### Task 5: `PacienteDetalhePage` — perfil do paciente

Exibe dados do paciente, contrato ativo, stats de sessões e histórico cronológico. Botão de arquivar com confirmação.

**Files:**
- Modify: `src/pages/PacienteDetalhePage.tsx`

- [ ] **Step 1: Substituir o stub pela implementação**

Substituir todo o conteúdo de `src/pages/PacienteDetalhePage.tsx`:

```typescript
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, Archive, Phone, Mail, Calendar, Banknote } from 'lucide-react'
import { format, differenceInYears } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { usePacienteDetalhe } from '@/hooks/usePacienteDetalhe'
import type { SessaoStatus, ContratoTipo } from '@/lib/types'

const statusConfig: Record<SessaoStatus, { label: string; color: string }> = {
  agendada:   { label: 'Agendada',   color: '#9CA3AF' },
  confirmada: { label: 'Confirmada', color: '#2D6A6A' },
  concluida:  { label: 'Concluída',  color: '#4CAF82' },
  faltou:     { label: 'Faltou',     color: '#C17F59' },
  cancelada:  { label: 'Cancelada',  color: '#E07070' },
  remarcada:  { label: 'Remarcada',  color: '#9B7EC8' },
}

const contratoDescricao = (tipo: ContratoTipo, valor: number, qtd?: number | null, dia?: number | null) => {
  const valorFmt = valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (tipo === 'por_sessao') return `${valorFmt} por sessão`
  if (tipo === 'pacote') return `${qtd ?? '?'} sessões por ${valorFmt}`
  return `${valorFmt}/mês — venc. dia ${dia ?? '?'}`
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-surface rounded-card border border-border p-4 flex flex-col gap-1">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold text-[#1C1C1C] font-mono">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  )
}

export function PacienteDetalhePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { paciente, sessoes, contrato, stats, loading, arquivar } = usePacienteDetalhe(id!)

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
        <button
          onClick={handleArquivar}
          className="flex items-center gap-1.5 text-sm text-muted border border-border px-3 py-2 rounded-lg hover:bg-bg hover:text-[#1C1C1C] transition-colors"
        >
          <Archive size={15} />
          Arquivar
        </button>
      </div>

      {/* Contato */}
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
          <p className="text-sm text-muted">Sem dados de contato cadastrados.</p>
        )}
      </div>

      {/* Contrato ativo */}
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
          label="Total pago"
          value={stats.totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        />
      </div>

      {/* Histórico */}
      <div>
        <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-3">Histórico de sessões</h2>

        {sessoes.length === 0 ? (
          <p className="text-center py-8 text-sm text-muted">Nenhuma sessão registrada.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessoes.map(s => {
              const cfg = statusConfig[s.status]
              return (
                <div
                  key={s.id}
                  className="bg-surface rounded-card border border-border p-4 flex items-center justify-between"
                  style={{ borderLeftWidth: 3, borderLeftColor: cfg.color }}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-medium px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${cfg.color}20`, color: cfg.color }}
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

- [ ] **Step 2: Verificar no browser**

Navegar para `/pacientes`, criar um paciente com contrato, clicar no card para abrir o perfil.

Expected:
- Header com nome do paciente, idade (se data de nascimento preenchida), botão Arquivar
- Card de contato com telefone/email/nascimento
- Banner teal com info do contrato (se cadastrado)
- 4 stat cards: Total, Concluídas, Faltas, Total Pago
- Seção "Histórico de sessões" (vazio se nenhuma sessão ainda)
- Clicar "Arquivar" → confirm dialog → redireciona para `/pacientes`

- [ ] **Step 3: Rodar todos os testes para confirmar que nenhum quebrou**

```
npx vitest run
```

Expected: todos passando

- [ ] **Step 4: Commit**

```bash
git add src/pages/PacienteDetalhePage.tsx
git commit -m "feat: implement PacienteDetalhePage with stats and session history"
```

---

## Checklist de verificação final

Após todos os tasks:

- [ ] `npx vitest run` — todos os testes passam
- [ ] `npx vite build` — build sem erros
- [ ] No browser: `/pacientes` → lista vazia com botão "Novo"
- [ ] `/pacientes/novo` → formulário funciona, validação funciona, submit redireciona
- [ ] `/pacientes/:id` → perfil com stats, contrato, histórico
- [ ] Arquivar paciente → some da lista, histórico preservado no Supabase
