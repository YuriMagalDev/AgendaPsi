import { Tooltip } from '@base-ui/react'

interface Props {
  label: string
  children: React.ReactNode
}

export function EmojiTooltip({ label, children }: Props) {
  return (
    <Tooltip.Root delay={0}>
      <Tooltip.Trigger render={<span tabIndex={0} className="inline-flex items-center outline-none" />}>
        {children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner side="top" sideOffset={6}>
          <Tooltip.Popup className="bg-white border border-[#E4E0DA] shadow-sm rounded-lg px-2 py-1 text-[11px] text-[#1C1C1C] z-50 pointer-events-none">
            {label}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}
