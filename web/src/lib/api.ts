// Typed wrapper around the Nebula API.

export type ContentType = 'image' | 'video' | 'document' | 'url' | 'audio' | 'note'
export type Intent = 'watch' | 'read' | 'try' | 'research' | 'reference'
export type ExtractMode = 'text' | 'code' | 'none'
export type EntryStatus = 'new' | 'done' | 'archived'

export const INTENTS: { value: Intent; label: string }[] = [
  { value: 'watch', label: 'Watch' },
  { value: 'read', label: 'Read' },
  { value: 'try', label: 'Try' },
  { value: 'research', label: 'Research' },
  { value: 'reference', label: 'Reference' },
]

export interface Asset {
  id: string
  originalName: string | null
  mimeType: string
  sizeBytes: number
  url: string
}

export interface Entry {
  id: string
  sessionId: string | null
  contentType: ContentType
  title: string | null
  whySaved: string | null
  intent: Intent | null
  sourceUrl: string | null
  coverUrl: string | null
  extractMode: ExtractMode
  extractStatus: 'pending' | 'done' | 'failed' | 'skipped'
  extractedText: string | null
  listenOnlyOk: boolean
  onDashboard: boolean
  addedToDashboardAt: string | null
  status: EntryStatus
  createdAt: string
  tags: string[]
  assets: Asset[]
}

export interface Tag {
  id: string
  name: string
  entryCount: number
}

export interface Task {
  id: string
  entryId: string | null
  entryTitle: string | null
  title: string
  notes: string | null
  dueAt: string | null
  done: boolean
  doneAt: string | null
  createdAt: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData
  const res = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: isForm || !init.body ? init.headers : { 'content-type': 'application/json', ...init.headers },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`)
  return data as T
}

const json = (body: unknown) => JSON.stringify(body)

export const api = {
  me: () => request<{ id: string; email: string }>('/api/auth/me'),
  login: (email: string, password: string) =>
    request<{ id: string; email: string }>('/api/auth/login', { method: 'POST', body: json({ email, password }) }),
  setupStatus: () => request<{ needsSetup: boolean }>('/api/auth/setup'),
  setup: (email: string, password: string) =>
    request<{ id: string; email: string }>('/api/auth/setup', { method: 'POST', body: json({ email, password }) }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  tags: (q = '') => request<{ tags: Tag[] }>(`/api/tags?q=${encodeURIComponent(q)}`).then((r) => r.tags),

  createEntries: (form: FormData) => request<{ entries: Entry[] }>('/api/entries', { method: 'POST', body: form }),
  entries: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][])
    return request<{ entries: Entry[] }>(`/api/entries?${qs}`).then((r) => r.entries)
  },
  updateEntry: (id: string, patch: Partial<Pick<Entry, 'onDashboard' | 'status' | 'title' | 'whySaved' | 'intent' | 'tags'>>) =>
    request<{ entry: Entry }>(`/api/entries/${id}`, { method: 'PATCH', body: json(patch) }).then((r) => r.entry),

  tasks: () => request<{ tasks: Task[] }>('/api/tasks').then((r) => r.tasks),
  createTask: (task: { title: string; dueAt?: string | null; entryId?: string }) =>
    request<{ id: string }>('/api/tasks', { method: 'POST', body: json(task) }),
  updateTask: (id: string, patch: Partial<Pick<Task, 'title' | 'dueAt' | 'done' | 'notes'>>) =>
    request(`/api/tasks/${id}`, { method: 'PATCH', body: json(patch) }),
  deleteTask: (id: string) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
}
