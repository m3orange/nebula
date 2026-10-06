import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { EntryCard, displayTitle } from '@/components/entry-card'
import { Segmented } from '@/components/form-bits'
import { TodayTasks } from '@/components/today-tasks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, INTENTS, type Entry, type Intent, type Task } from '@/lib/api'
import { cn } from '@/lib/utils'

type Layout = 'grouped' | 'list'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function readLayout(): Layout {
  try {
    return localStorage.getItem('nebula.layout') === 'list' ? 'list' : 'grouped'
  } catch {
    return 'grouped'
  }
}

export function DashboardPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [intent, setIntent] = useState<Intent | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [layout, setLayoutState] = useState<Layout>(readLayout)

  const setLayout = (l: Layout) => {
    setLayoutState(l)
    try {
      localStorage.setItem('nebula.layout', l)
    } catch {
      /* private mode: just don't remember */
    }
  }

  const load = useCallback(async () => {
    try {
      const [e, t] = await Promise.all([api.entries({ dashboard: '1' }), api.tasks()])
      setEntries(e)
      setTasks(t)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const allTags = useMemo(() => [...new Set(entries.flatMap((e) => e.tags))].sort(), [entries])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return entries.filter(
      (e) =>
        (!intent || e.intent === intent) &&
        (!tag || e.tags.includes(tag)) &&
        (!term ||
          [displayTitle(e), e.whySaved, e.sourceUrl, e.extractedText, ...e.tags].some((s) => s?.toLowerCase().includes(term))),
    )
  }, [entries, intent, tag, q])

  const groups = useMemo(() => {
    const order = [...INTENTS.map((i) => i.value), null] as (Intent | null)[]
    return order
      .map((key) => ({
        key,
        label: key ? INTENTS.find((i) => i.value === key)!.label : 'No intent yet',
        items: shown.filter((e) => e.intent === key),
      }))
      .filter((g) => g.items.length > 0)
  }, [shown])

  // Optimistic updates: the card leaves at once, and comes back if the server says no.
  const removeFromDashboard = async (entry: Entry, patch: { onDashboard?: boolean; status?: 'done' }) => {
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    try {
      await api.updateEntry(entry.id, { onDashboard: false, ...patch })
    } catch {
      setEntries((prev) => [entry, ...prev])
    }
  }

  const remind = async (entry: Entry, dueAt: string) => {
    await api.createTask({ title: `Follow up: ${displayTitle(entry)}`.slice(0, 255), dueAt, entryId: entry.id })
    setTasks(await api.tasks())
  }

  const card = (e: Entry) => (
    <EntryCard
      key={e.id}
      entry={e}
      onHide={() => removeFromDashboard(e, {})}
      onDone={() => removeFromDashboard(e, { status: 'done' })}
      onRemind={(dueAt) => remind(e, dueAt)}
    />
  )

  const openTasks = tasks.filter((t) => !t.done).length

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-28 pt-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{greeting()}</h1>
          <p className="text-sm text-muted-foreground">
            {loading
              ? 'Loading…'
              : `${entries.length} on your dashboard · ${openTasks} to-do${openTasks === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button asChild size="sm" variant="brand" className="h-10">
          <Link to="/capture">
            <Plus /> New
          </Link>
        </Button>
      </header>

      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <TodayTasks
        tasks={tasks}
        onAdd={async (title, dueAt) => {
          await api.createTask({ title, dueAt })
          setTasks(await api.tasks())
        }}
        onToggle={async (t) => {
          setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !t.done } : x)))
          await api.updateTask(t.id, { done: !t.done }).catch(load)
        }}
        onDelete={async (t) => {
          setTasks((prev) => prev.filter((x) => x.id !== t.id))
          await api.deleteTask(t.id).catch(load)
        }}
      />

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Saved for you</h2>
          <div className="w-44">
            <Segmented
              label="Layout"
              value={layout}
              onChange={setLayout}
              options={[
                { value: 'grouped', label: 'By intent' },
                { value: 'list', label: 'One list' },
              ]}
            />
          </div>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="search" className="sr-only">
            Search the dashboard
          </label>
          <Input id="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, notes, tags" className="h-11 pl-10" />
        </div>

        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <FilterChip active={!intent} onClick={() => setIntent(null)}>
            All
          </FilterChip>
          {INTENTS.map((i) => (
            <FilterChip key={i.value} active={intent === i.value} onClick={() => setIntent(intent === i.value ? null : i.value)}>
              {i.label}
            </FilterChip>
          ))}
        </div>
        {allTags.length > 0 && (
          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
            {allTags.map((t) => (
              <FilterChip key={t} small active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                #{t}
              </FilterChip>
            ))}
          </div>
        )}

        {!loading && shown.length === 0 && (
          <div className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            {entries.length === 0 ? (
              <>
                Nothing here yet.{' '}
                <Link to="/capture" className="font-medium text-brand underline-offset-4 hover:underline">
                  Save your first thing
                </Link>
              </>
            ) : (
              'Nothing matches these filters.'
            )}
          </div>
        )}

        {layout === 'list' ? (
          <div className="flex flex-col gap-3">{shown.map(card)}</div>
        ) : (
          groups.map((g) => (
            <div key={g.key ?? 'none'} className="flex flex-col gap-3 pt-1">
              <h3 className="font-semibold">
                {g.label} <span className="font-normal text-muted-foreground">· {g.items.length}</span>
              </h3>
              {g.items.map(card)}
            </div>
          ))
        )}
      </section>
    </div>
  )
}

function FilterChip({
  active,
  small,
  onClick,
  children,
}: {
  active: boolean
  small?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full border px-3.5 transition-colors',
        small ? 'h-8 text-[13px]' : 'h-9 text-sm',
        active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-secondary',
      )}
    >
      {children}
    </button>
  )
}
