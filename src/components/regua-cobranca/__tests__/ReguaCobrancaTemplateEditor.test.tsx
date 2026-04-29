import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { ReguaCobrancaTemplateEditor } from '../ReguaCobrancaTemplateEditor'
import type { RegraCobranca } from '@/lib/types'

const mockRegra: RegraCobranca = {
  id: 'r-1',
  user_id: 'u-1',
  etapa: 1,
  dias_apos: 1,
  template_mensagem: 'Olá {{nome}}, sua sessão de {{data_sessao}} está com pagamento pendente.',
  ativo: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('ReguaCobrancaTemplateEditor', () => {
  it('renders etapa label', () => {
    render(
      <ReguaCobrancaTemplateEditor
        etapa={1}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByText('Etapa 1')).toBeInTheDocument()
  })

  it('pre-fills fields when regra is provided', () => {
    render(
      <ReguaCobrancaTemplateEditor
        etapa={1}
        regra={mockRegra}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByDisplayValue('1')).toBeInTheDocument() // dias_apos
    expect(screen.getByDisplayValue(mockRegra.template_mensagem)).toBeInTheDocument()
  })

  it('calls onSave with template, dias, ativo when Salvar is clicked', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(
      <ReguaCobrancaTemplateEditor
        etapa={2}
        regra={{ ...mockRegra, etapa: 2, dias_apos: 3 }}
        onSave={onSave}
        onDelete={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        mockRegra.template_mensagem,
        3,
        true
      )
    })
  })

  it('shows Deletar button only when regra exists', () => {
    const { rerender } = render(
      <ReguaCobrancaTemplateEditor etapa={1} onSave={vi.fn()} onDelete={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: /deletar/i })).not.toBeInTheDocument()

    rerender(
      <ReguaCobrancaTemplateEditor
        etapa={1}
        regra={mockRegra}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /deletar/i })).toBeInTheDocument()
  })

  it('shows Salvando... while saving', async () => {
    let resolve!: () => void
    const onSave = vi.fn().mockReturnValue(new Promise<void>(r => { resolve = r }))
    render(
      <ReguaCobrancaTemplateEditor etapa={1} onSave={onSave} onDelete={vi.fn()} />
    )
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))
    expect(await screen.findByText('Salvando...')).toBeInTheDocument()
    resolve()
  })
})
