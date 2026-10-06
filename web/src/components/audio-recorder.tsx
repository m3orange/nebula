import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Records a voice note in the browser and hands back an audio File. */
export function AudioRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  useEffect(() => {
    if (!recording) return
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [recording])

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) || ''
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const mime = rec.mimeType || 'audio/webm'
        const ext = mime.includes('mp4') ? 'm4a' : 'webm'
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
        onRecorded(new File(chunks.current, `voice-note-${stamp}.${ext}`, { type: mime.split(';')[0] }))
      }
      rec.start()
      recorder.current = rec
      setSeconds(0)
      setRecording(true)
    } catch {
      setError('Microphone access was blocked. Allow it in your browser settings to record.')
    }
  }

  const stop = () => {
    recorder.current?.stop()
    setRecording(false)
  }

  const mm = String(Math.floor(seconds / 60))
  const ss = String(seconds % 60).padStart(2, '0')

  return (
    <div className="flex flex-col gap-1">
      {recording ? (
        <Button type="button" variant="outline" className="h-16 w-full border-destructive text-destructive" onClick={stop}>
          <Square className="fill-current" /> Stop · {mm}:{ss}
        </Button>
      ) : (
        <Button type="button" variant="outline" className="h-16 w-full flex-col gap-1 text-[13px]" onClick={start}>
          <Mic className="!size-5 text-brand" /> Record audio
        </Button>
      )}
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  )
}
