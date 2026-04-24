import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { KanbanFilters } from '../KanbanFilters'
import type { SessaoFilters } from '@/lib/filterSessoes'

vi.mock('@/hooks/useModalidadesSessao', () => ({
  useModalidadesSessao: () => ({ modalidadesSessao: [], loading: false }),
}))

const EMPTY: SessaoFilters = { search: '', modalidadeId: '' }

describe('KanbanFilters', () => {
  it('shows hidden sessions message when hiddenCount > 0', () => {
    render(<KanbanFilters filters={EMPTY} onChange={vi.fn()} hiddenCount={3} />)
    expect(screen.getByText(/3/)).toBeInTheDocument()
    expect(screen.getByText(/ocultas/)).toBeInTheDocument()
  })

  it('does not show hidden message when hiddenCount is 0', () => {
    render(<KanbanFilters filters={EMPTY} onChange={vi.fn()} hiddenCount={0} />)
    expect(screen.queryByText(/oculta/)).not.toBeInTheDocument()
  })

  it('calls onChange when search input changes', () => {
    const onChange = vi.fn()
    render(<KanbanFilters filters={EMPTY} onChange={onChange} hiddenCount={0} />)
    fireEvent.change(screen.getByPlaceholderText('Buscar paciente...'), { target: { value: 'João' } })
    expect(onChange).toHaveBeenCalledWith({ search: 'João', modalidadeId: '' })
  })

  it('shows Limpar button when search is active', () => {
    render(<KanbanFilters filters={{ search: 'João', modalidadeId: '' }} onChange={vi.fn()} hiddenCount={0} />)
    expect(screen.getByText('Limpar')).toBeInTheDocument()
  })

  it('Limpar resets to empty filters', () => {
    const onChange = vi.fn()
    render(<KanbanFilters filters={{ search: 'João', modalidadeId: '' }} onChange={onChange} hiddenCount={0} />)
    fireEvent.click(screen.getByText('Limpar'))
    expect(onChange).toHaveBeenCalledWith(EMPTY)
  })
})
