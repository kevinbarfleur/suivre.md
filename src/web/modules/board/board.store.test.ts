import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Board, Task } from '../../../domain'

const api = vi.hoisted(() => ({
  fetchBoard: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  moveTask: vi.fn(),
  deleteTask: vi.fn(),
}))
vi.mock('../../lib/api', () => api)

/** Minimal EventSource: the store only subscribes and reacts to `onerror`. */
class FakeEventSource {
  static last: FakeEventSource | null = null
  readonly listeners = new Map<string, ((event: unknown) => void)[]>()
  onerror: (() => void) | null = null

  constructor() {
    FakeEventSource.last = this
  }

  addEventListener(type: string, fn: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }

  emit(type: string): void {
    for (const fn of this.listeners.get(type) ?? []) fn({})
  }
}

function task(id: string, over: Partial<Task['frontmatter']> = {}, body = ''): Task {
  return {
    frontmatter: {
      id,
      title: `Title ${id}`,
      status: 'todo',
      labels: [],
      depends: [],
      order: 'a0',
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
      ...over,
    },
    body,
    fileName: `${id}.md`,
  }
}

function board(tasks: Task[]): Board {
  return {
    config: { name: 'demo', taskPrefix: 'task', columns: [{ id: 'todo', label: 'To do' }] },
    columns: [{ column: { id: 'todo', label: 'To do' }, tasks }],
    orphans: [],
  }
}

type Store = ReturnType<typeof import('./board.store').useBoard>

async function freshStore(): Promise<Store> {
  vi.resetModules()
  const module = await import('./board.store')
  return module.useBoard()
}

beforeEach(() => {
  api.fetchBoard.mockResolvedValue(board([task('task-1')]))
  api.createTask.mockResolvedValue(task('task-2'))
  api.updateTask.mockResolvedValue(task('task-1'))
  api.moveTask.mockResolvedValue(task('task-1'))
  api.deleteTask.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('write actions', () => {
  it('reports a failed write without dropping the board', async () => {
    const store = await freshStore()
    await store.ensureLoaded()
    api.moveTask.mockRejectedValue(new Error('Unknown status: nope — valid statuses: todo'))

    const done = await store.move('task-1', { status: 'nope' })

    expect(done).toBe(false)
    expect(store.actionError.value).toBe('Unknown status: nope — valid statuses: todo')
    expect(store.error.value).toBeNull()
    expect(store.board.value).not.toBeNull()
  })

  it('answers true and reloads on success', async () => {
    const store = await freshStore()
    await store.ensureLoaded()
    api.fetchBoard.mockClear()

    expect(await store.create({ title: 'New' })).toBe(true)
    expect(api.fetchBoard).toHaveBeenCalledTimes(1)
    expect(store.actionError.value).toBeNull()
  })

  it('clears the previous failure when the next write starts', async () => {
    const store = await freshStore()
    api.deleteTask.mockRejectedValueOnce(new Error('Task not found: task-9'))
    await store.remove('task-9')
    expect(store.actionError.value).toBe('Task not found: task-9')

    await store.remove('task-1')
    expect(store.actionError.value).toBeNull()
  })
})

describe('reload', () => {
  it('re-resolves the open card so a concurrent edit is not overwritten', async () => {
    const store = await freshStore()
    const initial = task('task-1', { status: 'todo' }, 'body')
    api.fetchBoard.mockResolvedValue(board([initial]))
    await store.ensureLoaded()
    store.openTask(initial)

    api.fetchBoard.mockResolvedValue(
      board([task('task-1', { status: 'doing' }, 'body\n\n## Comments\n\nfrom an agent')]),
    )
    await store.reload()

    expect(store.selected.value?.frontmatter.status).toBe('doing')
    expect(store.selected.value?.body).toContain('from an agent')
  })

  it('closes the dialog when the open card is gone', async () => {
    const store = await freshStore()
    const initial = task('task-1')
    api.fetchBoard.mockResolvedValue(board([initial]))
    await store.ensureLoaded()
    store.openTask(initial)

    api.fetchBoard.mockResolvedValue(board([]))
    await store.reload()

    expect(store.selected.value).toBeNull()
  })

  it('keeps the rendered board when a refresh fails', async () => {
    const store = await freshStore()
    await store.ensureLoaded()
    api.fetchBoard.mockRejectedValue(new Error('Failed to fetch'))

    await store.reload()

    expect(store.board.value).not.toBeNull()
    expect(store.error.value).toBeNull()
    expect(store.actionError.value).toBe('Failed to fetch')
  })

  it('blanks the pane when the very first load fails', async () => {
    const store = await freshStore()
    api.fetchBoard.mockRejectedValue(new Error('Failed to fetch'))

    await store.ensureLoaded()

    expect(store.board.value).toBeNull()
    expect(store.error.value).toBe('Failed to fetch')
  })
})

describe('live subscription', () => {
  it('goes disconnected when the stream errors, and recovers on reconnect', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const store = await freshStore()
    store.startLive()
    const source = FakeEventSource.last
    expect(source).not.toBeNull()

    source?.emit('ready')
    expect(store.live.value).toBe(true)

    source?.onerror?.()
    expect(store.live.value).toBe(false)

    api.fetchBoard.mockClear()
    source?.emit('ready')
    expect(store.live.value).toBe(true)
    // A reconnect reloads: the board drifted while the stream was down.
    expect(api.fetchBoard).toHaveBeenCalledTimes(1)
  })

  it('reloads once per change, not twice via the legacy `board` alias', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    const store = await freshStore()
    store.startLive()
    api.fetchBoard.mockClear()

    FakeEventSource.last?.emit('tasks')
    FakeEventSource.last?.emit('board')

    expect(api.fetchBoard).toHaveBeenCalledTimes(1)
  })
})
