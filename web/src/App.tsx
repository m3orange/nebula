import { useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import { LayoutGrid, Loader2, LogOut, PlusCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CapturePage } from '@/pages/capture'
import { DashboardPage } from '@/pages/dashboard'
import { LoginPage } from '@/pages/login'

type AuthState = 'checking' | 'in' | 'out'

export default function App() {
  const [auth, setAuth] = useState<AuthState>('checking')

  useEffect(() => {
    api.me().then(
      () => setAuth('in'),
      () => setAuth('out'),
    )
  }, [])

  if (auth === 'checking') {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    )
  }
  if (auth === 'out') return <LoginPage onSignedIn={() => setAuth('in')} />

  return (
    <BrowserRouter>
      <main className="min-h-dvh">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="*" element={<DashboardPage />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-xl">
          <TabLink to="/" icon={<LayoutGrid />} label="Dashboard" />
          <TabLink to="/capture" icon={<PlusCircle />} label="Capture" />
          <button
            type="button"
            onClick={() => api.logout().finally(() => setAuth('out'))}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"
          >
            <LogOut className="size-5" /> Sign out
          </button>
        </div>
      </nav>
    </BrowserRouter>
  )
}

function TabLink({ to, icon, label }: { to: string; icon: ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] [&_svg]:size-5',
          isActive ? 'font-semibold text-brand' : 'text-muted-foreground',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
