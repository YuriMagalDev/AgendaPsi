import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { PatientFilters } from '../PatientFilters'
import type { PacienteFilters } from '@/lib/filterPacientes'

vi.mock('@/hooks/useModalidadesSessao', () => ({
  useModalidadesSessao: () => ({ modalidadesSessao: [], loading: false }),
}))

const DEFAULT: PacienteFilters = { search: '', ativoOnly: true, modalidadeId: '', tipoContrato: '' }

describe('PatientFilters', () => {
  it('shows result count', () => {
    render(<PatientFilters filters={DEFAULT} onChange={vi.fn()} resultCount={5} />)
    expect(screen.getByText('5 pacientes')).toBeInTheDocument()
  })

  it('shows singular for 1 patient', () => {
    render(<PatientFilters filters={DEFAULT} onChange={vi.fn()} resultCount={1} />)
    expect(screen.getByText('1 paciente')).toBeInTheDocument()
  })

  it('calls onChange when search changes', () => {
    const onChange = vi.fn()
    render(<PatientFilters filters={DEFAULT} onChange={onChange} resultCount={0} />)
    fireEvent.change(screen.getByPlaceholderText('Buscar por nome...'), { target: { value: 'João' } })
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT, search: 'João' })
  })

  it('hides Limpar button with default filters', () => {
    render(<PatientFilters filters={DEFAULT} onChange={vi.fn()} resultCount={3} />)
    expect(screen.queryByText('Limpar')).not.toBeInTheDocument()
  })

  it('shows Limpar button when modalidadeId is set', () => {
    const filters = { ...DEFAULT, modalidadeId: 'mod-1' }
    render(<PatientFilters filters={filters} onChange={vi.fn()} resultCount={2} />)
    expect(screen.getByText('Limpar')).toBeInTheDocument()
  })

  it('Limpar calls onChange with default values', () => {
    const onChange = vi.fn()
    const filters = { ...DEFAULT, modalidadeId: 'mod-1' }
    render(<PatientFilters filters={filters} onChange={onChange} resultCount={2} />)
    fireEvent.click(screen.getByText('Limpar'))
    expect(onChange).toHaveBeenCalledWith(DEFAULT)
  })
})
