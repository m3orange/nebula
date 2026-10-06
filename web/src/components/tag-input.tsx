import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { api, type Tag } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Same rule as the server: "#My Tag" -> "my-tag". */
export function normalizeTag(raw: string) {
  return raw
    .trim()
    .replace(/^#+/, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

/** "integration" ~ "integrations", "user-research" ~ "userresearch" */
function looksLike(a: string, b: string) {
  const squash = (s: string) => s.replace(/-/g, '').replace(/e?s$/, '')
  return a !== b && squash(a) === squash(b)
}

interface Props {
  id?: string
  value: string[]
  onChange: (tags: string[]) => void
}

/**
 * Type to search your tags. Tap a match (or press Enter) to add it; the field
 * stays focused so you can type the next one. Recent tags show as one-tap chips.
 */
export function TagInput({ id, value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Tag[]>([])
  const [recent, setRecent] = useState<Tag[]>([])
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const term = normalizeTag(query)

  useEffect(() => {
    api.tags().then(setRecent).catch(() => {})
  }, [])

  useEffect(() => {
    if (!term) return setResults([])
    const t = setTimeout(() => api.tags(term).then(setResults).catch(() => {}), 150)
    return () => clearTimeout(t)
  }, [term])

  const add = (name: string) => {
    const n = normalizeTag(name)
    if (n && !value.includes(n)) onChange([...value, n])
    setQuery('')
    inputRef.current?.focus()
  }
  const remove = (name: string) => onChange(value.filter((t) => t !== name))

  const matches = results.filter((t) => !value.includes(t.name))
  const exact = results.some((t) => t.name === term)
  const similar = useMemo(() => results.find((t) => looksLike(t.name, term)), [results, term])
  const recentChips = recent.filter((t) => !value.includes(t.name)).slice(0, 6)
  const open = focused && term.length > 0

  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card p-2 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((t) => (
          <span key={t} className="flex h-8 items-center gap-0.5 rounded-full bg-primary pl-3 pr-1 text-sm text-primary-foreground">
            #{t}
            <button
              type="button"
              aria-label={`Remove #${t}`}
              className="flex size-7 items-center justify-center rounded-full hover:bg-white/15"
              onClick={(e) => {
                e.stopPropagation()
                remove(t)
              }}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && term) {
              e.preventDefault()
              add(term)
            } else if (e.key === 'Backspace' && !query && value.length) {
              remove(value[value.length - 1])
            }
          }}
          placeholder={value.length ? 'Add another' : 'Search or create a tag'}
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="done"
          className="h-8 min-w-[8rem] flex-1 bg-transparent px-1.5 outline-none placeholder:text-muted-foreground"
        />
      </div>

      {open && (
        <div className="overflow-hidden rounded-xl border bg-card">
          {matches.map((t) => (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(t.name)}
              className="flex min-h-12 w-full items-center justify-between border-b px-3.5 text-left last:border-b-0 hover:bg-secondary"
            >
              <span>#{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.entryCount}</span>
            </button>
          ))}
          {!exact && similar && !value.includes(similar.name) && (
            <div className="flex items-start gap-2 border-b bg-amber-50 px-3.5 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span>
                Looks close to <strong>#{similar.name}</strong>. Use that one instead?
              </span>
            </div>
          )}
          {!exact && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(term)}
              className="flex min-h-12 w-full items-center gap-2 px-3.5 text-left font-semibold text-brand hover:bg-secondary"
            >
              <Plus className="size-4" /> Create #{term}
            </button>
          )}
        </div>
      )}

      {!open && recentChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-xs text-muted-foreground">Recent</span>
          {recentChips.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => add(t.name)}
              className={cn('h-8 rounded-full border bg-card px-3 text-sm hover:bg-secondary')}
            >
              #{t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
