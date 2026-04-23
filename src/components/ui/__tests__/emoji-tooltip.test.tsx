import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmojiTooltip } from '../emoji-tooltip'

describe('EmojiTooltip', () => {
  it('renders children', () => {
    render(<EmojiTooltip label="Online">🖥️</EmojiTooltip>)
    expect(screen.getByText('🖥️')).toBeInTheDocument()
  })

  it('shows label on hover', async () => {
    const user = userEvent.setup()
    render(<EmojiTooltip label="Online">🖥️</EmojiTooltip>)
    await user.hover(screen.getByText('🖥️'))
    expect(await screen.findByText('Online')).toBeInTheDocument()
  })

  it('hides label after unhover', async () => {
    const user = userEvent.setup()
    render(<EmojiTooltip label="Online">🖥️</EmojiTooltip>)
    const trigger = screen.getByText('🖥️')
    await user.hover(trigger)
    await screen.findByText('Online')
    await user.unhover(trigger)
    await waitFor(() => expect(screen.queryByText('Online')).not.toBeInTheDocument())
  })

  it('shows label on keyboard focus', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <EmojiTooltip label="Online">🖥️</EmojiTooltip>
      </div>
    )
    await user.tab()
    expect(await screen.findByText('Online')).toBeInTheDocument()
  })
})
