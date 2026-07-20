import type {
  ArchivedEntry,
  Board,
  CreateDecisionInput,
  CreateDocInput,
  Decision,
  DecisionPatch,
  Doc,
  DocPatch,
  Priority,
  Task,
} from '../../domain'

export type { ArchivedEntry, ArchivedType } from '../../domain'

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Requête échouée (${res.status})`)
  return (await res.json()) as T
}

export async function fetchBoard(): Promise<Board> {
  return json<Board>(await fetch('/api/board'))
}

export interface CreateInput {
  title: string
  status?: string
  priority?: Priority
  labels?: string[]
  body?: string
}

export async function createTask(input: CreateInput): Promise<Task> {
  return json<Task>(
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export interface UpdateInput {
  title?: string
  status?: string
  priority?: Priority
  labels?: string[]
  body?: string
}

export async function updateTask(id: string, patch: UpdateInput): Promise<Task> {
  return json<Task>(
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}

export interface MoveInput {
  status: string
  beforeId?: string
  afterId?: string
}

export async function moveTask(id: string, body: MoveInput): Promise<Task> {
  return json<Task>(
    await fetch(`/api/tasks/${id}/move`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Suppression échouée (${res.status})`)
}

// --- Préférences (machine + projet) ---

export type Theme = 'terminal' | 'dark' | 'light'
export interface GlobalPreferences {
  theme: Theme
  defaultView: string
}
export interface ProjectPreferences {
  defaultView: string | null
}
export interface Preferences {
  global: GlobalPreferences
  project: ProjectPreferences
}

export async function fetchPreferences(): Promise<Preferences> {
  return json<Preferences>(await fetch('/api/preferences'))
}

export async function patchGlobalPreferences(
  patch: Partial<GlobalPreferences>,
): Promise<GlobalPreferences> {
  return json<GlobalPreferences>(
    await fetch('/api/preferences/global', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}

export async function patchProjectPreferences(
  patch: Partial<ProjectPreferences>,
): Promise<ProjectPreferences> {
  return json<ProjectPreferences>(
    await fetch('/api/preferences/project', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}

// --- Archives (vue transverse) ---

export async function fetchArchive(): Promise<ArchivedEntry[]> {
  return json<ArchivedEntry[]>(await fetch('/api/archive'))
}

// --- Décisions (ADR) ---

export async function fetchDecisions(): Promise<Decision[]> {
  return json<Decision[]>(await fetch('/api/decisions'))
}
export async function createDecision(input: CreateDecisionInput): Promise<Decision> {
  return json<Decision>(
    await fetch('/api/decisions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}
export async function updateDecision(id: string, patch: DecisionPatch): Promise<Decision> {
  return json<Decision>(
    await fetch(`/api/decisions/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}
export async function deleteDecision(id: string): Promise<void> {
  const res = await fetch(`/api/decisions/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Suppression échouée (${res.status})`)
}

// --- Docs ---

export async function fetchDocs(): Promise<Doc[]> {
  return json<Doc[]>(await fetch('/api/docs'))
}
export async function createDoc(input: CreateDocInput): Promise<Doc> {
  return json<Doc>(
    await fetch('/api/docs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}
export async function updateDoc(id: string, patch: DocPatch): Promise<Doc> {
  return json<Doc>(
    await fetch(`/api/docs/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  )
}
export async function deleteDoc(id: string): Promise<void> {
  const res = await fetch(`/api/docs/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Suppression échouée (${res.status})`)
}
