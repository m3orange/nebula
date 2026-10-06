import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, FileText, Headphones, ImagePlus, LayoutGrid, Link2, Loader2, ScanText, X } from 'lucide-react'
import { AudioRecorder } from '@/components/audio-recorder'
import { Field, IntentPicker, Segmented, ToggleRow } from '@/components/form-bits'
import { TagInput } from '@/components/tag-input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api, type Entry, type ExtractMode, type Intent } from '@/lib/api'

type SaveAs = 'linked' | 'separate' | 'combined'
interface Picked {
  file: File
  preview: string | null
}

const ACCEPT = 'image/*,audio/*,video/*,application/pdf'
const VIDEO_LINK = /(youtube\.com|youtu\.be|tiktok\.com|vimeo\.com)/i

function firstUrl(text: string | null) {
  return text?.match(/https?:\/\/\S+/)?.[0] ?? ''
}

export function CapturePage() {
  const [params] = useSearchParams()
  // Links shared from an iOS Shortcut (or Android's share sheet) arrive as ?url= / ?text=
  const sharedUrl = params.get('url') || firstUrl(params.get('text'))

  const [picked, setPicked] = useState<Picked[]>([])
  const [url, setUrl] = useState(sharedUrl)
  const [title, setTitle] = useState(params.get('title') || '')
  const [whySaved, setWhySaved] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [intent, setIntent] = useState<Intent | null>(null)
  const [extractMode, setExtractMode] = useState<ExtractMode>('text')
  const [transcript, setTranscript] = useState(true)
  const [saveAs, setSaveAs] = useState<SaveAs>('linked')
  const [onDashboard, setOnDashboard] = useState(true)
  const [listenOnlyOk, setListenOnlyOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<Entry[] | null>(null)

  const files = picked.map((p) => p.file)
  const hasImage = files.some((f) => f.type.startsWith('image/'))
  const hasAudio = files.some((f) => f.type.startsWith('audio/'))
  const isVideoLink = !files.length && VIDEO_LINK.test(url)
  const canListen = hasAudio || isVideoLink || files.some((f) => f.type.startsWith('video/'))
  const several = files.length > 1

  // Free preview URLs when the page closes.
  const pickedRef = useRef(picked)
  pickedRef.current = picked
  useEffect(() => () => pickedRef.current.forEach((p) => p.preview && URL.revokeObjectURL(p.preview)), [])

  // Paste a screenshot straight in (desktop).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const pasted = [...(e.clipboardData?.files ?? [])]
      if (pasted.length) addFiles(pasted)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  function addFiles(list: File[]) {
    setPicked((prev) => [
      ...prev,
      ...list.map((file) => ({
        file,
        preview: /^(image|audio)\//.test(file.type) ? URL.createObjectURL(file) : null,
      })),
    ])
  }

  function removeFile(i: number) {
    const gone = picked[i]
    if (gone?.preview) URL.revokeObjectURL(gone.preview)
    setPicked((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    setSaving(true)
    setError(null)
    const form = new FormData()
    files.forEach((f) => form.append('files', f))
    if (url) form.append('url', url)
    form.append('title', title)
    form.append('whySaved', whySaved)
    form.append('tags', JSON.stringify(tags))
    if (intent) form.append('intent', intent)
    form.append('extractMode', hasImage ? extractMode : 'text')
    form.append('transcript', String(transcript))
    form.append('saveAs', saveAs)
    form.append('onDashboard', String(onDashboard))
    form.append('listenOnlyOk', String(canListen && listenOnlyOk))
    try {
      const { entries } = await api.createEntries(form)
      setSaved(entries)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setPicked([])
    setUrl('')
    setTitle('')
    setWhySaved('')
    setTags([])
    setIntent(null)
    setExtractMode('text')
    setTranscript(true)
    setSaveAs('linked')
    setOnDashboard(true)
    setListenOnlyOk(false)
    setSaved(null)
  }

  const saveLabel = useMemo(() => {
    if (several && saveAs !== 'combined') return `Save ${files.length} entries`
    return 'Save'
  }, [several, saveAs, files.length])

  if (saved) return <SavedScreen entries={saved} onAnother={reset} />

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pb-44 pt-4">
      <h1 className="text-xl font-semibold">New entry</h1>

      {/* What you're saving */}
      {picked.length === 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border bg-card text-[13px] font-medium hover:bg-secondary">
            <ImagePlus className="size-5 text-brand" />
            Photos & files
            <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => addFiles([...(e.target.files ?? [])])} />
          </label>
          <AudioRecorder onRecorded={(f) => addFiles([f])} />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {picked.map((p, i) => (
              <div key={i} className="relative h-36 w-28 shrink-0 overflow-hidden rounded-xl border bg-secondary">
                {p.preview && p.file.type.startsWith('image/') ? (
                  <img src={p.preview} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 p-2 text-center text-xs text-muted-foreground">
                    {p.file.type.startsWith('audio/') ? <Headphones className="size-6" /> : <FileText className="size-6" />}
                    <span className="line-clamp-2 break-all">{p.file.name}</span>
                  </div>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${p.file.name}`}
                  onClick={() => removeFile(i)}
                  className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/60 text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            <label className="flex h-36 w-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-xs text-muted-foreground hover:bg-secondary">
              <ImagePlus className="size-5" /> Add
              <input type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => addFiles([...(e.target.files ?? [])])} />
            </label>
          </div>
          {picked.length === 1 && picked[0].file.type.startsWith('audio/') && picked[0].preview && (
            <audio controls src={picked[0].preview} className="w-full" />
          )}
        </div>
      )}

      {several && (
        <fieldset className="flex flex-col gap-1 rounded-xl border bg-card p-3.5">
          <legend className="px-1 text-[13px] font-semibold">Save as</legend>
          {(
            [
              ['linked', `${files.length} entries that stay linked`, 'Each one is searchable on its own, and opening one shows the others.'],
              ['separate', `${files.length} unrelated entries`, 'Same as sharing them one at a time.'],
              ['combined', `1 entry with ${files.length} files`, 'For screenshots of one long thing, like a thread or an article.'],
            ] as const
          ).map(([value, label, hint]) => (
            <label key={value} className="flex cursor-pointer items-start gap-2.5 py-2">
              <input
                type="radio"
                name="saveAs"
                checked={saveAs === value}
                onChange={() => setSaveAs(value)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">{label}</span>
                <span className="text-[13px] leading-snug text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
          {saveAs !== 'combined' && (
            <p className="px-1 pt-1 text-[13px] text-muted-foreground">The details below apply to all of them.</p>
          )}
        </fieldset>
      )}

      {hasImage && (
        <Field>
          <Label className="flex items-center gap-1.5">
            <ScanText className="size-4 text-brand" /> Copy the text in {several ? 'these images' : 'this image'}
          </Label>
          <Segmented
            label="Copy the text"
            value={extractMode}
            onChange={setExtractMode}
            options={[
              { value: 'text', label: 'Yes' },
              { value: 'code', label: "Yes, it's code" },
              { value: 'none', label: 'No' },
            ]}
          />
          <p className="text-[13px] text-muted-foreground">Makes the words searchable. "Code" keeps line breaks and indentation.</p>
        </Field>
      )}

      {hasAudio && (
        <ToggleRow
          id="transcript"
          icon={<FileText />}
          title="Also add transcript"
          hint="Saved next to the recording, so you can search what was said"
          checked={transcript}
          onChange={setTranscript}
          highlight
        />
      )}

      <Field>
        <Label htmlFor="url">
          {files.length ? 'Source link' : 'Link'} <span className="font-normal text-muted-foreground">· optional</span>
        </Label>
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id="url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link" className="pl-10" />
        </div>
      </Field>

      <Field>
        <Label htmlFor="title">
          Title <span className="font-normal text-muted-foreground">· optional</span>
        </Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leave blank to use the first line of text" />
      </Field>

      <Field>
        <Label htmlFor="why">Why I saved {several && saveAs !== 'combined' ? 'these' : 'this'}</Label>
        <Textarea id="why" rows={2} value={whySaved} onChange={(e) => setWhySaved(e.target.value)} placeholder="One line for future-you" />
      </Field>

      <Field>
        <Label htmlFor="tags">Tags</Label>
        <TagInput id="tags" value={tags} onChange={setTags} />
      </Field>

      <Field>
        <Label>What's it for?</Label>
        <IntentPicker value={intent} onChange={setIntent} />
      </Field>

      <div className="flex flex-col gap-2.5 border-t pt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Also send to</p>
        <ToggleRow
          id="dashboard"
          icon={<LayoutGrid />}
          title="Show on dashboard"
          hint="Stays there until you hide it"
          checked={onDashboard}
          onChange={setOnDashboard}
        />
        {canListen && (
          <ToggleRow
            id="listen"
            icon={<Headphones />}
            title="OK to just listen"
            hint="You don't need to see the screen to follow it, so it's safe for the car"
            checked={listenOnlyOk}
            onChange={setListenOnlyOk}
          />
        )}
        <p className="px-1 text-[13px] text-muted-foreground">Playlists arrive in a later release.</p>
      </div>

      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

      <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          <Button size="lg" className="w-full" disabled={saving} onClick={save}>
            {saving && <Loader2 className="animate-spin" />} {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SavedScreen({ entries, onAnother }: { entries: Entry[]; onAnother: () => void }) {
  const onDash = entries.some((e) => e.onDashboard)
  const extracting = entries.some((e) => e.extractStatus === 'pending')
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col justify-center gap-5 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-18 items-center justify-center rounded-full bg-accent">
          <Check className="size-9 text-brand" strokeWidth={2.5} />
        </span>
        <h1 className="text-2xl font-bold">Saved</h1>
      </div>
      <Card className="divide-y">
        <p className="px-4 py-3.5">
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'} in your library
        </p>
        {onDash && <p className="px-4 py-3.5">On your dashboard</p>}
        {extracting && <p className="px-4 py-3.5 text-muted-foreground">Text and transcripts will be added in a later release</p>}
      </Card>
      <div className="flex flex-col gap-2.5">
        <Button size="lg" onClick={onAnother}>
          Save another
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/">Go to dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
