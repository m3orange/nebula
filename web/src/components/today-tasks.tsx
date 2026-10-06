import { useState } from 'react'
import { CalendarClock, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { Task } from '@/lib/api'
import { cn } from '@/lib/utils'

function startOfTomorrow() {
  const d = new Date()
  d.setHours(24, 0, 0, 0)
  return d
}

function timeLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

interface Props {
  tasks: Task[]
  onAdd: (title: string, dueAt: string | null) => Promise<void>
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
}

/** Overdue + due today + no-date tasks. Later ones are counted, not listed. */
export function TodayTasks({ tasks, onAdd, onToggle, onDelete }: Props) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [showDue, setShowDue] = useState(false)

  const now = new Date()
  const tomorrow = startOfTomorrow()
  const visible = tasks.filter((t) => t.done || !t.dueAt || new Date(t.dueAt) < tomorrow)
  const later = tasks.filter((t) => !t.done && t.dueAt && new Date(t.dueAt) >= tomorrow)

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today</h2>
      <Card className="divide-y">
        {visible.length === 0 && <p className="px-4 py-3.5 text-sm text-muted-foreground">Nothing due. Add a to-do below.</p>}
        {visible.map((t) => {
          const overdue = !t.done && t.dueAt && new Date(t.dueAt) < now
          return (
            <div key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <Checkbox checked={t.done} onCheckedChange={() => onToggle(t)} aria-label={`Mark "${t.title}" done`} />
              <div className={cn('flex min-w-0 flex-1 flex-col', t.done && 'opacity-50')}>
                <span className={cn('truncate', t.done && 'line-through')}>{t.title}</span>
                {(t.dueAt || t.entryTitle) && (
                  <span className={cn('truncate text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                    {t.dueAt ? (overdue ? `Overdue · ${timeLabel(t.dueAt)}` : timeLabel(t.dueAt)) : ''}
                    {t.dueAt && t.entryTitle ? ' · ' : ''}
                    {t.entryTitle ? `About: ${t.entryTitle}` : ''}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="icon" className="size-9 text-muted-foreground" aria-label={`Delete "${t.title}"`} onClick={() => onDelete(t)}>
                <Trash2 />
              </Button>
            </div>
          )
        })}
        <form
          className="flex flex-col gap-2 p-2.5"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!title.trim()) return
            await onAdd(title.trim(), due ? new Date(due).toISOString() : null)
            setTitle('')
            setDue('')
            setShowDue(false)
          }}
        >
          <div className="flex gap-2">
            <label htmlFor="new-task" className="sr-only">
              New to-do
            </label>
            <Input id="new-task" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a to-do" className="h-11 flex-1" />
            <Button type="button" variant="outline" size="icon" aria-label="Add a due date" aria-pressed={showDue} onClick={() => setShowDue((s) => !s)}>
              <CalendarClock />
            </Button>
            <Button type="submit" size="icon" aria-label="Add to-do">
              <Plus />
            </Button>
          </div>
          {showDue && (
            <>
              <label htmlFor="new-task-due" className="sr-only">
                Due
              </label>
              <Input id="new-task-due" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className="h-11" />
            </>
          )}
        </form>
      </Card>
      {later.length > 0 && (
        <p className="px-1 text-[13px] text-muted-foreground">
          {later.length} more coming up later ({later.map((t) => t.title).slice(0, 2).join(', ')}
          {later.length > 2 ? '…' : ''})
        </p>
      )}
    </section>
  )
}
