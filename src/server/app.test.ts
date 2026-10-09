import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter, once } from 'node:events'
import { resolvePaths } from '../storage'
import { BoardService } from '../service/board-service'
import { createApp } from './app'
import { startServer } from './index'
import { watchBacklog, type ChangeKind } from './watch'

const ORIGIN = 'http://localhost:45188'

const jsonInit = (body: unknown, method = 'POST', headers: HeadersInit = {}): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
})

const patchInit = (body: unknown, headers: HeadersInit = {}): RequestInit =>
  jsonInit(body, 'PATCH', headers)

/**
 * Polls until the predicate holds. A filesystem watcher has no deterministic
 * "done" signal, so the deadline is generous on purpose: it is a failure
 * detector, not a performance budget. Four seconds looked fine and then flaked
 * under CPU contention — the loop exits the moment the predicate is true, so a
 * long deadline costs nothing on a healthy run.
 */
async function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for a condition')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe('server API', () => {
  let root: string
  let events: EventEmitter
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-api-'))
    vi.stubEnv('XDG_CONFIG_HOME', join(root, '.config'))
    const service = new BoardService(root)
    await service.init('Project')
    events = new EventEmitter()
    app = createApp(service, events, { root })
  })

  afterEach(async () => {
    events.emit('close')
    vi.unstubAllEnvs()
    await rm(root, { recursive: true, force: true })
  })

  it('GET /api/board returns the columns', async () => {
    const res = await app.request('/api/board')
    expect(res.status).toBe(200)
    const board = await res.json()
    expect(board.columns.length).toBeGreaterThan(0)
  })

  it('POST /api/tasks creates a task', async () => {
    const res = await app.request('/api/tasks', jsonInit({ title: 'New one' }))
    expect(res.status).toBe(201)
    const task = await res.json()
    expect(task.frontmatter.id).toBe('task-001')
  })

  it('move reflects the status in the board', async () => {
    await app.request('/api/tasks', jsonInit({ title: 'A' }))
    const moved = await app.request('/api/tasks/task-001/move', jsonInit({ status: 'done' }))
    expect(moved.status).toBe(200)
    const board = await (await app.request('/api/board')).json()
    const done = board.columns.find((col: { column: { id: string } }) => col.column.id === 'done')
    expect(done.tasks).toHaveLength(1)
  })

  // --- Identity (the overlay adopts a board on this alone) ---

  describe('GET /api/health', () => {
    it('names the product, the root and the board', async () => {
      const res = await app.request('/api/health')
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({
        ok: true,
        product: 'suivre',
        root,
        name: 'Project',
      })
    })

    it('still answers when config.yml is unreadable', async () => {
      await writeFile(resolvePaths(root).configFile, 'columns: not-a-list\n')
      const res = await app.request('/api/health')
      expect(res.status).toBe(200)
      const health = await res.json()
      expect(health).toMatchObject({ ok: true, product: 'suivre', root, name: null })
    })
  })

  // --- Input validation (A1.2) ---

  describe('write validation', () => {
    it('rejects a task with no title', async () => {
      const res = await app.request('/api/tasks', jsonInit({}))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('invalid-request')
      expect(body.message).toContain('title')
    })

    it('rejects an unknown priority', async () => {
      const res = await app.request('/api/tasks', jsonInit({ title: 'A', priority: 'BOGUS' }))
      expect(res.status).toBe(400)
      expect((await res.json()).message).toContain('priority')
    })

    it('rejects a move with no status, leaving the file readable', async () => {
      await app.request('/api/tasks', jsonInit({ title: 'A' }))
      const res = await app.request('/api/tasks/task-001/move', jsonInit({}))
      expect(res.status).toBe(400)
      expect((await res.json()).message).toContain('status')

      const board = await (await app.request('/api/board')).json()
      expect(board.columns[0].tasks).toHaveLength(1)
      expect(board.orphans).toHaveLength(0)
    })

    it('rejects labels that are not an array, leaving the file untouched', async () => {
      await app.request('/api/tasks', jsonInit({ title: 'A' }))
      const before = await readFile(join(resolvePaths(root).tasksDir, 'task-001-a.md'), 'utf8')

      const res = await app.request('/api/tasks/task-001', patchInit({ labels: 'oops' }))
      expect(res.status).toBe(400)
      expect((await res.json()).message).toContain('labels')

      const after = await readFile(join(resolvePaths(root).tasksDir, 'task-001-a.md'), 'utf8')
      expect(after).toBe(before)
      expect((await app.request('/api/board')).status).toBe(200)
    })

    it('rejects a malformed JSON body', async () => {
      const res = await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ not json',
      })
      expect(res.status).toBe(400)
      expect((await res.json()).message).toContain('valid JSON')
    })

    it('maps an unknown status to 400, not 500', async () => {
      const res = await app.request('/api/tasks', jsonInit({ title: 'A', status: 'nope' }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('invalid-request')
      expect(body.message).toContain('Unknown status: nope')
      expect(body.message).toContain('archived')
    })

    it('ignores id, created and order in a patch', async () => {
      await app.request('/api/tasks', jsonInit({ title: 'A' }))
      const created = await (await app.request('/api/tasks/task-001')).json()

      const res = await app.request(
        '/api/tasks/task-001',
        patchInit({ id: 'hacked', created: '1999', order: 'zzz', title: 'B' }),
      )
      expect(res.status).toBe(200)
      const task = await res.json()
      expect(task.frontmatter.id).toBe('task-001')
      expect(task.frontmatter.created).toBe(created.frontmatter.created)
      expect(task.frontmatter.order).toBe(created.frontmatter.order)
      expect(task.frontmatter.title).toBe('B')
    })

    it('clears the assignee with an empty string', async () => {
      await app.request('/api/tasks', jsonInit({ title: 'A', assignee: 'kevin' }))
      const res = await app.request('/api/tasks/task-001', patchInit({ assignee: '' }))
      expect(res.status).toBe(200)
      expect((await res.json()).frontmatter.assignee).toBeUndefined()
    })

    it('rejects an unknown decision status', async () => {
      const res = await app.request('/api/decisions', jsonInit({ title: 'A', status: 'maybe' }))
      expect(res.status).toBe(400)
    })

    it('rejects an unknown sprint status', async () => {
      await app.request('/api/sprints', jsonInit({ title: 'S' }))
      const res = await app.request('/api/sprints/sprint-001', patchInit({ status: 'paused' }))
      expect(res.status).toBe(400)
    })

    it('rejects a doc with tags that are not an array', async () => {
      const res = await app.request('/api/docs', jsonInit({ title: 'D', tags: 'a,b' }))
      expect(res.status).toBe(400)
    })

    it('rejects an unknown theme', async () => {
      const res = await app.request('/api/preferences/global', patchInit({ theme: 'neon' }))
      expect(res.status).toBe(400)
    })

    it('patching one preference leaves the others alone', async () => {
      await app.request('/api/preferences/global', patchInit({ theme: 'light' }))
      const res = await app.request('/api/preferences/global', patchInit({ defaultView: 'docs' }))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ theme: 'light', defaultView: 'docs' })
    })
  })

  // --- Origin / content type (A6) ---

  describe('write guards', () => {
    it('accepts a write from the board’s own origin', async () => {
      const res = await app.request(
        `${ORIGIN}/api/tasks`,
        jsonInit({ title: 'A' }, 'POST', { origin: ORIGIN }),
      )
      expect(res.status).toBe(201)
    })

    it('refuses a write from another local port', async () => {
      const res = await app.request(
        `${ORIGIN}/api/tasks`,
        jsonInit({ title: 'A' }, 'POST', { origin: 'http://localhost:3000' }),
      )
      expect(res.status).toBe(403)
      expect((await res.json()).error).toBe('forbidden')
      expect((await (await app.request('/api/board')).json()).columns[0].tasks).toHaveLength(0)
    })

    it('refuses a write with a null Origin', async () => {
      const res = await app.request(
        `${ORIGIN}/api/tasks`,
        jsonInit({ title: 'A' }, 'POST', { origin: 'null' }),
      )
      expect(res.status).toBe(403)
    })

    it('refuses a cross-origin DELETE', async () => {
      await app.request('/api/tasks', jsonInit({ title: 'A' }))
      const res = await app.request(`${ORIGIN}/api/tasks/task-001`, {
        method: 'DELETE',
        headers: { origin: 'http://localhost:3000' },
      })
      expect(res.status).toBe(403)
      expect((await app.request('/api/tasks/task-001')).status).toBe(200)
    })

    it('guards a nested route too', async () => {
      await app.request('/api/tasks', jsonInit({ title: 'A' }))
      const foreign = await app.request(
        `${ORIGIN}/api/tasks/task-001/move`,
        jsonInit({ status: 'done' }, 'POST', { origin: 'http://localhost:3000' }),
      )
      expect(foreign.status).toBe(403)
      const plain = await app.request(`${ORIGIN}/api/tasks/task-001/move`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ status: 'done' }),
      })
      expect(plain.status).toBe(415)
    })

    it('allows a read from any origin', async () => {
      const res = await app.request(`${ORIGIN}/api/board`, {
        headers: { origin: 'http://localhost:3000' },
      })
      expect(res.status).toBe(200)
    })

    it('honours the configured extra origins', async () => {
      const service = new BoardService(root)
      const dev = createApp(service, new EventEmitter(), {
        root,
        allowedOrigins: ['http://localhost:45189'],
      })
      const res = await dev.request(
        `${ORIGIN}/api/tasks`,
        jsonInit({ title: 'A' }, 'POST', { origin: 'http://localhost:45189' }),
      )
      expect(res.status).toBe(201)
    })

    it('refuses a simple-CORS write that is not application/json', async () => {
      const res = await app.request('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ title: 'A' }),
      })
      expect(res.status).toBe(415)
      expect((await res.json()).error).toBe('unsupported-media-type')
    })

    it('does not require a content type on DELETE', async () => {
      await app.request('/api/tasks', jsonInit({ title: 'A' }))
      const res = await app.request('/api/tasks/task-001', { method: 'DELETE' })
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
    })
  })

  // --- Error conventions (B2/B3) ---

  describe('error conventions', () => {
    it('GET on a missing task is a 404 with a code', async () => {
      const res = await app.request('/api/tasks/task-999')
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('not-found')
    })

    it('PATCH on a missing task is a 404, not a 500', async () => {
      const res = await app.request('/api/tasks/task-999', patchInit({ title: 'B' }))
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('not-found')
      expect(body.message).toBe('Task not found: task-999')
    })

    it('PATCH on a missing decision, doc and sprint are all 404', async () => {
      for (const path of [
        '/api/decisions/decision-9',
        '/api/docs/doc-9',
        '/api/sprints/sprint-9',
      ]) {
        const res = await app.request(path, patchInit({ title: 'B' }))
        expect(res.status, path).toBe(404)
        expect((await res.json()).error).toBe('not-found')
      }
    })

    it('answers a JSON 404 on an unknown API path', async () => {
      const res = await app.request('/api/nope')
      expect(res.status).toBe(404)
      expect(res.headers.get('content-type')).toContain('application/json')
      expect((await res.json()).error).toBe('not-found')
    })

    it('a write on an uninitialized backlog is a 404, not a 500', async () => {
      const empty = await mkdtemp(join(tmpdir(), 'suivre-empty-'))
      try {
        const bare = createApp(new BoardService(empty), new EventEmitter(), { root: empty })
        const res = await bare.request('/api/tasks', jsonInit({ title: 'A' }))
        expect(res.status).toBe(404)
        expect((await res.json()).message).toContain('not initialized')
      } finally {
        await rm(empty, { recursive: true, force: true })
      }
    })
  })

  // --- Live updates (A17) ---

  describe('GET /api/events', () => {
    it('streams a typed event per collection', async () => {
      const res = await app.request('/api/events')
      expect(res.headers.get('content-type')).toContain('text/event-stream')
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const readUntil = async (needle: string): Promise<void> => {
        while (!buffer.includes(needle)) {
          const { value, done } = await reader.read()
          if (done) throw new Error(`stream ended before ${needle}`)
          buffer += decoder.decode(value)
        }
      }

      await readUntil('event: ready')

      events.emit('change', 'decisions')
      events.emit('change', 'tasks')
      await readUntil('event: tasks')
      await readUntil('event: board')

      expect(buffer).toContain('event: decisions')
      // Only what the board renders keeps the compatibility event.
      expect(buffer.match(/event: board/g)).toHaveLength(1)

      events.emit('close')
      await reader.cancel()
    })
  })
})

// --- Static assets and the SPA fallback (B4) ---

describe('static serving', () => {
  let root: string
  let dist: string
  let app: ReturnType<typeof createApp>

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-static-'))
    dist = join(root, 'dist')
    await mkdir(join(dist, 'assets'), { recursive: true })
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>board</title>')
    await writeFile(join(dist, 'assets', 'app-abc123.js'), 'export default 1\n')
    const service = new BoardService(root)
    await service.init('Project')
    app = createApp(service, new EventEmitter(), { root, distDir: dist })
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('serves index.html with no-cache', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-cache')
  })

  it('serves fingerprinted assets as immutable', async () => {
    const res = await app.request('/assets/app-abc123.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('immutable')
  })

  it('answers a deep link with the SPA', async () => {
    const res = await app.request('/board/task-001', { headers: { accept: 'text/html' } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(res.headers.get('cache-control')).toBe('no-cache')
  })

  it('404s a vanished asset instead of returning HTML', async () => {
    const res = await app.request('/assets/app-gone.js', { headers: { accept: '*/*' } })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).not.toContain('text/html')
  })

  it('keeps an unknown API path JSON even behind the SPA fallback', async () => {
    const res = await app.request('/api/nope', { headers: { accept: 'text/html' } })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toContain('application/json')
  })
})

// --- Watcher (A17) ---

describe('watchBacklog', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-watch-'))
    await new BoardService(root).init('Project')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('reports every collection, not just tasks', async () => {
    const paths = resolvePaths(root)
    await mkdir(paths.decisionsDir, { recursive: true })
    const seen: ChangeKind[] = []
    const watcher = watchBacklog(paths, (kind) => seen.push(kind), 10)
    await once(watcher, 'ready')
    try {
      await writeFile(join(paths.decisionsDir, 'decision-001-x.md'), '---\nid: x\n---\n')
      await waitFor(() => seen.includes('decisions'))

      await writeFile(join(paths.tasksDir, 'task-001-a.md'), '---\nid: a\n---\n')
      await waitFor(() => seen.includes('tasks'))

      await writeFile(paths.configFile, 'name: Projet\ncolumns: []\n')
      await waitFor(() => seen.includes('config'))

      await writeFile(paths.preferencesFile, '{}')
      await waitFor(() => seen.includes('preferences'))
    } finally {
      await watcher.close()
    }
  }, 70_000)

  it('ignores the temp files an atomic write leaves behind', async () => {
    const paths = resolvePaths(root)
    const seen: ChangeKind[] = []
    const watcher = watchBacklog(paths, (kind) => seen.push(kind), 10)
    await once(watcher, 'ready')
    try {
      await writeFile(join(paths.tasksDir, 'task-001-a.md.deadbeef.tmp'), 'x')
      await new Promise((resolve) => setTimeout(resolve, 400))
      expect(seen).not.toContain('tasks')
    } finally {
      await watcher.close()
    }
  }, 20_000)
})

// --- Lifecycle (A12, A6) ---

describe('startServer', () => {
  let root: string
  const open: Array<{ close: () => Promise<void> }> = []

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-serve-'))
    await new BoardService(root).init('Project')
  })

  afterEach(async () => {
    while (open.length) await open.pop()!.close()
    await rm(root, { recursive: true, force: true })
  })

  it('binds loopback and reports the port it actually holds', async () => {
    const handle = await startServer(root, { port: 0 })
    open.push(handle)
    expect(handle.host).toBe('127.0.0.1')
    expect(handle.port).toBeGreaterThan(0)
    expect(handle.url).toBe(`http://localhost:${handle.port}`)

    const res = await fetch(`${handle.url}/api/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ product: 'suivre', name: 'Project' })
  })

  it('rejects on a busy port instead of crashing later', async () => {
    const first = await startServer(root, { port: 0 })
    open.push(first)
    await expect(startServer(root, { port: first.port })).rejects.toThrow(
      `port ${first.port} is already in use — try --port <n>`,
    )
  })

  it('creates the tasks directory so the watcher is alive from the start', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'suivre-fresh-'))
    const handle = await startServer(empty, { port: 0 })
    try {
      const res = await fetch(`${handle.url}/api/board`)
      expect(res.status).toBe(404)
      expect((await res.json()).error).toBe('not-found')
    } finally {
      await handle.close()
      await rm(empty, { recursive: true, force: true })
    }
  })

  it('close() releases the port even with an SSE client connected', async () => {
    const handle = await startServer(root, { port: 0 })
    const stream = await fetch(`${handle.url}/api/events`)
    const reader = stream.body!.getReader()
    await reader.read()

    await handle.close()
    await reader.cancel().catch(() => {})

    const reused = await startServer(root, { port: handle.port })
    open.push(reused)
    expect(reused.port).toBe(handle.port)
  })

  it('honours an explicit host', async () => {
    const handle = await startServer(root, { port: 0, host: '127.0.0.1' })
    open.push(handle)
    expect(handle.host).toBe('127.0.0.1')
  })
})
