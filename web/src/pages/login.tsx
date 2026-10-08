import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'

/**
 * Sign-in screen. On the very first visit (no account yet) it becomes
 * "Create your account" instead; after that, sign-up is closed for good.
 */
export function LoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.setupStatus().then(
      (s) => setMode(s.needsSetup ? 'setup' : 'login'),
      () => setMode('login'),
    )
  }, [])

  const isSetup = mode === 'setup'

  async function submit() {
    setError(null)
    if (isSetup && password !== confirm) return setError("The passwords don't match")
    setBusy(true)
    try {
      if (isSetup) await api.setup(email, password)
      else await api.login(email, password)
      onSignedIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <img src="/icon.svg" alt="" className="size-16 rounded-2xl" />
        <h1 className="text-2xl font-bold">{isSetup ? 'Welcome to Nebula' : 'Nebula'}</h1>
        {isSetup && <p className="text-sm text-muted-foreground">Create your account. This screen only appears once.</p>}
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            minLength={isSetup ? 12 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {isSetup && <p className="text-[13px] text-muted-foreground">At least 12 characters.</p>}
        </div>
        {isSetup && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />} {isSetup ? 'Create account' : 'Sign in'}
        </Button>
      </form>
    </div>
  )
}
