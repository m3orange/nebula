import type { ReactNode } from 'react'
import { Switch } from '@/components/ui/switch'
import { INTENTS, type Intent } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Single-select chip row for "What's it for?". Tap the selected chip again to clear it. */
export function IntentPicker({ value, onChange }: { value: Intent | null; onChange: (v: Intent | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="What's it for?">
      {INTENTS.map((i) => {
        const on = value === i.value
        return (
          <button
            key={i.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : i.value)}
            className={cn(
              'h-10 rounded-lg border px-3.5 text-[15px] transition-colors',
              on ? 'border-brand bg-accent font-semibold text-accent-foreground' : 'bg-card hover:bg-secondary',
            )}
          >
            {i.label}
          </button>
        )
      })}
    </div>
  )
}

/** iOS-style segmented control. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div className="flex gap-0.5 rounded-lg bg-secondary p-[3px]" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 flex-1 rounded-md px-2 text-sm transition-colors',
            value === o.value ? 'bg-card font-semibold shadow-sm' : 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A full-width row with an icon, a title, a hint and a switch. */
export function ToggleRow({
  id,
  icon,
  title,
  hint,
  checked,
  onChange,
  highlight,
}: {
  id: string
  icon: ReactNode
  title: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
  highlight?: boolean
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 py-2.5',
        highlight && 'border-brand',
      )}
    >
      <span className="text-brand [&_svg]:size-[22px]">{icon}</span>
      <span className="flex flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="text-[13px] text-muted-foreground">{hint}</span>
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

export function Field({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-2', className)}>{children}</div>
}
