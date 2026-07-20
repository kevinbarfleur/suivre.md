import type { Board, Priority, Task } from '../../domain'

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
