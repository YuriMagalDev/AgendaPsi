import { useState, useRef, useEffect } from 'react'

const EMOJIS = [
  '🧠', '💬', '🛋️', '🏥', '🏠', '💻', '📱', '🌿',
  '🎭', '👁️', '🤝', '🌀', '💆', '📝', '🎯', '🌟',
  '✨', '❤️', '🫂', '🪑', '👤', '🔵', '🟢', '🟣',
  '🟡', '🟠', '🔴', '⚪', '🔑', '📋', '🗓️', '⏰',
  '🌈', '☀️', '🌙', '💡', '🔔', '📌', '🎗️', '🌸',
]

interface Props {
  value: string
  onChange: (emoji: string) => void
  placeholder?: string
}

export function EmojiPicker({ value, onChange, placeholder = 'Emoji' }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="h-9 w-16 rounded-lg border border-border bg-surface text-center text-lg outline-none hover:border-primary focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors"
        title="Escolher emoji"
      >
        {value || <span className="text-xs text-muted">{placeholder}</span>}
      </button>

      {open && (
        <div className="absolute z-50 top-10 left-0 bg-surface border border-border rounded-xl shadow-lg p-2 w-56">
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => { onChange(e); setOpen(false) }}
                className={`h-8 w-8 flex items-center justify-center rounded-lg text-lg hover:bg-primary-light transition-colors ${value === e ? 'bg-primary-light ring-1 ring-primary' : ''}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
