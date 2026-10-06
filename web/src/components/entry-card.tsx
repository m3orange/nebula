import { useState } from 'react'
import { Bell, Check, EyeOff, ExternalLink, FileText, Globe, Headphones, Image as ImageIcon, PlayCircle, StickyNote } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { INTENTS, type ContentType, type Entry } from '@/lib/api'

const TYPE_ICON: Record<ContentType, typeof Globe> = {
  image: ImageIcon,
  video: PlayCircle,
  audio: Headphones,
  document: FileText,
  url: Globe,
  note: StickyNote,
}

const TYPE_LABEL: Record<ContentType, string> = {
  image: 'Screenshot',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
  url: 'Link',
  note: 'Note',
}

/** YouTube links get their real thumbnail as a cover. */
function youtubeThumb(url: string | null) {
  if (!url) return null
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/)
  return m ? `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg` : null
}

function hostOf(url: string | null) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : null
  } catch {
    return null
  }
}

export function displayTitle(e: Entry) {
  return e.title || e.whySaved || e.assets[0]?.originalName || hostOf(e.sourceUrl) || TYPE_LABEL[e.contentType]
}

function relativeDay(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface Props {
  entry: Entry
  onHide: () => void
  onDone: () => void
  onRemind: (dueAt: string) => void
}

export function EntryCard({ entry, onHide, onDone, onRemind }: Props) {
  const [reminding, setReminding] = useState(false)
  const [when, setWhen] = useState('')
  const Icon = TYPE_ICON[entry.contentType]
  const cover = entry.coverUrl || youtubeThumb(entry.sourceUrl)
  const audio = entry.contentType === 'audio' ? entry.assets[0] : null
  const openHref = entry.sourceUrl || entry.assets[0]?.url
  const title = displayTitle(entry)
  const intentLabel = INTENTS.find((i) => i.value === entry.intent)?.label

  return (
    <Card className="overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-muted-foreground">
          {cover ? <img src={cover} alt="" loading="lazy" className="size-full object-cover" /> : <Icon className="size-7" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="line-clamp-2 font-semibold leading-snug">{title}</p>
          {entry.whySaved && entry.whySaved !== title && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{entry.whySaved}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {TYPE_LABEL[entry.contentType]}
            {hostOf(entry.sourceUrl) ? ` · ${hostOf(entry.sourceUrl)}` : ''} · {relativeDay(entry.createdAt)}
            {entry.listenOnlyOk ? ' · OK to just listen' : ''}
          </p>
          {(entry.tags.length > 0 || intentLabel) && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {intentLabel && <Badge variant="accent">{intentLabel}</Badge>}
              {entry.tags.map((t) => (
                <Badge key={t}>#{t}</Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {audio && <audio controls preload="none" src={audio.url} className="w-full px-3 pb-2" />}

      {reminding && (
        <form
          className="flex gap-2 border-t px-3 py-2.5"
          onSubmit={(ev) => {
            ev.preventDefault()
            if (!when) return
            onRemind(new Date(when).toISOString())
            setReminding(false)
            setWhen('')
          }}
        >
          <label htmlFor={`remind-${entry.id}`} className="sr-only">
            Remind me at
          </label>
          <Input id={`remind-${entry.id}`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-10 flex-1" required />
          <Button type="submit" size="sm" variant="brand" className="h-10">
            Set
          </Button>
        </form>
      )}

      <div className="flex border-t">
        {openHref && (
          <Button variant="ghost" className="flex-1 rounded-none text-[13px]" asChild>
            <a href={openHref} target="_blank" rel="noreferrer">
              <ExternalLink /> Open
            </a>
          </Button>
        )}
        <Button variant="ghost" className="flex-1 rounded-none text-[13px]" onClick={() => setReminding((r) => !r)}>
          <Bell /> Remind
        </Button>
        <Button variant="ghost" className="flex-1 rounded-none text-[13px]" onClick={onDone}>
          <Check /> Done
        </Button>
        <Button variant="ghost" className="flex-1 rounded-none text-[13px]" onClick={onHide}>
          <EyeOff /> Hide
        </Button>
      </div>
    </Card>
  )
}
