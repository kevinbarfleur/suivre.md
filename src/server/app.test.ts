import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { BoardService } from '../service/board-service'
import { createApp } from './app'

const jsonInit = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

describe('server API', () => {
  let root: string
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-api-'))
    const service = new BoardService(root)
    await service.init('Projet')
    app = createApp(service, new EventEmitter())
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('GET /api/board renvoie les colonnes', async () => {
    const res = await app.request('/api/board')
    expect(res.status).toBe(200)
    const board = await res.json()
    expect(board.columns.length).toBeGreaterThan(0)
  })

  it('POST /api/tasks crée une tâche', async () => {
    const res = await app.request('/api/tasks', jsonInit({ title: 'Nouvelle' }))
    expect(res.status).toBe(201)
    const task = await res.json()
    expect(task.frontmatter.id).toBe('task-001')
  })

  it('move reflète le statut dans le board', async () => {
    await app.request('/api/tasks', jsonInit({ title: 'A' }))
    const moved = await app.request('/api/tasks/task-001/move', jsonInit({ status: 'done' }))
    expect(moved.status).toBe(200)
    const board = await (await app.request('/api/board')).json()
    const done = board.columns.find((col: { column: { id: string } }) => col.column.id === 'done')
    expect(done.tasks).toHaveLength(1)
  })
})
