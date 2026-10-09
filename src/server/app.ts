import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { serveStatic } from '@hono/node-server/serve-static'
import type { Context } from 'hono'
import type { EventEmitter } from 'node:events'
import { z } from 'zod'
import {
  decisionStatusSchema,
  formatZodError,
  prioritySchema,
  sprintStatusSchema,
  themeSchema,
} from '../domain'
import type { BoardService } from '../service/board-service'
import type { ChangeKind } from './watch'

export interface AppOptions {
  /** Absolute repo root served here — the identity `/api/health` publishes. */
  root: string
  /** Directory of the built SPA to serve (prod). Absent in dev (Vite serves the frontend). */
  distDir?: string
  /**
   * Browser origins allowed to write besides the board's own. Only the Vite dev
   * server needs one: it proxies `/api` and forwards the page's own Origin.
   */
  allowedOrigins?: readonly string[]
}

const PRODUCT = 'suivre'
const PING_MS = 30_000
const IMMUTABLE = 'public, max-age=31536000, immutable'

type ErrorStatus = 400 | 403 | 404 | 415 | 500

/** One machine-readable code per status: the whole API answers in this shape. */
const ERROR_CODES: Record<ErrorStatus, string> = {
  400: 'invalid-request',
  403: 'forbidden',
  404: 'not-found',
  415: 'unsupported-media-type',
  500: 'server-error',
}

// REST is the only surface whose inputs arrive as raw JSON — the CLI has cac and
// MCP has its tool schemas. Every write body is declared here, so a bad request
// is a 400 and never a markdown file that no other command can read again.

const taskFields = {
  status: z.string().min(1),
  priority: prioritySchema,
  labels: z.array(z.string()),
  assignee: z.string(),
  parent: z.string(),
  depends: z.array(z.string()),
  body: z.string(),
}

const taskCreateSchema = z.object({
  title: z.string().min(1),
  status: taskFields.status.optional(),
  priority: taskFields.priority.optional(),
  labels: taskFields.labels.optional(),
  assignee: taskFields.assignee.optional(),
  parent: taskFields.parent.optional(),
  depends: taskFields.depends.optional(),
  body: taskFields.body.optional(),
})

const taskPatchSchema = z.object({
  title: z.string().min(1).optional(),
  status: taskFields.status.optional(),
  priority: taskFields.priority.nullable().optional(),
  labels: taskFields.labels.optional(),
  assignee: taskFields.assignee.optional(),
  parent: taskFields.parent.optional(),
  depends: taskFields.depends.optional(),
  body: taskFields.body.optional(),
})

const taskMoveSchema = z.object({
  status: taskFields.status,
  beforeId: z.string().min(1).optional(),
  afterId: z.string().min(1).optional(),
})

const decisionCreateSchema = z.object({
  title: z.string().min(1),
  status: decisionStatusSchema.optional(),
  date: z.string().min(1).optional(),
  supersedes: z.string().min(1).optional(),
  labels: z.array(z.string()).optional(),
  body: z.string().optional(),
})

const decisionPatchSchema = z.object({
  title: z.string().min(1).optional(),
  status: decisionStatusSchema.optional(),
  date: z.string().min(1).optional(),
  supersedes: z.string().min(1).optional(),
  supersededBy: z.string().min(1).optional(),
  labels: z.array(z.string()).optional(),
  body: z.string().optional(),
})

const docCreateSchema = z.object({
  title: z.string().min(1),
  tags: z.array(z.string()).optional(),
  body: z.string().optional(),
})

const docPatchSchema = z.object({
  title: z.string().min(1).optional(),
  tags: z.array(z.string()).optional(),
  body: z.string().optional(),
})

const sprintCreateSchema = z.object({
  title: z.string().min(1),
  goal: z.string().optional(),
  items: z.array(z.string()).optional(),
  body: z.string().optional(),
})

const sprintPatchSchema = z.object({
  title: z.string().min(1).optional(),
  goal: z.string().optional(),
  status: sprintStatusSchema.optional(),
  items: z.array(z.string()).optional(),
  body: z.string().optional(),
})

// Spelled out rather than `.partial()`: the preferences schemas carry defaults,
// and a partial still applies them — patching `defaultView` alone would reset
// the theme.
const globalPreferencesPatchSchema = z.object({
  theme: themeSchema.optional(),
  defaultView: z.string().min(1).optional(),
})

const projectPreferencesPatchSchema = z.object({
  defaultView: z.string().min(1).nullable().optional(),
})

/**
 * Thin HTTP adapter over the service. REST for operations, SSE for live
 * updates (pushed by the file watcher). No business logic here.
 */
export function createApp(service: BoardService, events: EventEmitter, opts: AppOptions): Hono {
  const app = new Hono()
  const extraOrigins = new Set(opts.allowedOrigins ?? [])
  // One 'change' + one 'close' listener per SSE client: the default cap of 10
  // would print a MaxListenersExceededWarning in the board's terminal at five.
  events.setMaxListeners(0)

  app.onError((error, c) => {
    const status = statusOf(error)
    return c.json({ error: ERROR_CODES[status], message: messageOf(error) }, status)
  })

  // Registered before every route: a middleware added later would not cover them.
  app.use('/api/*', async (c, next) => {
    if (!isWrite(c.req.method)) return next()
    guardOrigin(c, extraOrigins)
    guardContentType(c)
    return next()
  })

  app.get('/api/health', async (c) => {
    // Never fails: a board whose config.yml is broken must still be able to say
    // which repo it serves, or the overlay adopts a different one.
    const config = await service.loadConfig().catch(() => null)
    return c.json({ ok: true, product: PRODUCT, root: opts.root, name: config?.name ?? null })
  })

  app.get('/api/board', async (c) => {
    const board = await service.getBoard()
    return board ? c.json(board) : c.json(notFound('Backlog not initialized'), 404)
  })

  app.post('/api/tasks', async (c) => {
    return c.json(await service.create(await readBody(c, taskCreateSchema)), 201)
  })

  app.get('/api/tasks/:id', async (c) => {
    const id = c.req.param('id')
    const task = await service.getTask(id)
    return task ? c.json(task) : c.json(notFound(`Task not found: ${id}`), 404)
  })

  app.patch('/api/tasks/:id', async (c) => {
    const patch = await readBody(c, taskPatchSchema)
    // `assignee: ""` clears, like `suivre edit --assignee ""` and MCP task_edit.
    if (patch.assignee === '') patch.assignee = undefined
    return c.json(await service.edit(c.req.param('id'), patch))
  })

  app.post('/api/tasks/:id/move', async (c) => {
    const { status, beforeId, afterId } = await readBody(c, taskMoveSchema)
    return c.json(await service.move(c.req.param('id'), status, { beforeId, afterId }))
  })

  app.delete('/api/tasks/:id', async (c) => {
    return c.json({ ok: await service.remove(c.req.param('id')) })
  })

  app.get('/api/preferences', async (c) => c.json(await service.getPreferences()))

  app.patch('/api/preferences/global', async (c) => {
    return c.json(
      await service.patchGlobalPreferences(await readBody(c, globalPreferencesPatchSchema)),
    )
  })

  app.patch('/api/preferences/project', async (c) => {
    return c.json(
      await service.patchProjectPreferences(await readBody(c, projectPreferencesPatchSchema)),
    )
  })

  app.get('/api/archive', async (c) => c.json(await service.getArchive()))

  app.get('/api/decisions', async (c) => c.json(await service.listDecisions()))
  app.post('/api/decisions', async (c) =>
    c.json(await service.createDecision(await readBody(c, decisionCreateSchema)), 201),
  )
  app.get('/api/decisions/:id', async (c) => {
    const id = c.req.param('id')
    const decision = await service.getDecision(id)
    return decision ? c.json(decision) : c.json(notFound(`Decision not found: ${id}`), 404)
  })
  app.patch('/api/decisions/:id', async (c) => {
    const patch = await readBody(c, decisionPatchSchema)
    return c.json(await service.editDecision(c.req.param('id'), patch))
  })
  app.delete('/api/decisions/:id', async (c) => {
    return c.json({ ok: await service.removeDecision(c.req.param('id')) })
  })

  app.get('/api/docs', async (c) => c.json(await service.listDocs()))
  app.post('/api/docs', async (c) =>
    c.json(await service.createDoc(await readBody(c, docCreateSchema)), 201),
  )
  app.get('/api/docs/:id', async (c) => {
    const id = c.req.param('id')
    const doc = await service.getDoc(id)
    return doc ? c.json(doc) : c.json(notFound(`Doc not found: ${id}`), 404)
  })
  app.patch('/api/docs/:id', async (c) => {
    return c.json(await service.editDoc(c.req.param('id'), await readBody(c, docPatchSchema)))
  })
  app.delete('/api/docs/:id', async (c) => {
    return c.json({ ok: await service.removeDoc(c.req.param('id')) })
  })

  app.get('/api/sprints', async (c) => c.json(await service.listSprints()))
  app.post('/api/sprints', async (c) =>
    c.json(await service.createSprint(await readBody(c, sprintCreateSchema)), 201),
  )
  app.get('/api/sprints/:id', async (c) => {
    const id = c.req.param('id')
    const sprint = await service.getSprint(id)
    return sprint ? c.json(sprint) : c.json(notFound(`Sprint not found: ${id}`), 404)
  })
  app.patch('/api/sprints/:id', async (c) => {
    return c.json(await service.editSprint(c.req.param('id'), await readBody(c, sprintPatchSchema)))
  })
  app.delete('/api/sprints/:id', async (c) => {
    return c.json({ ok: await service.removeSprint(c.req.param('id')) })
  })

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      let open = true
      let wake = (): void => {}
      const push = (kind: ChangeKind): void => {
        void stream.writeSSE({ event: kind, data: kind })
        // Kept for clients that only know the original event name.
        if (kind === 'tasks' || kind === 'config')
          void stream.writeSSE({ event: 'board', data: kind })
      }
      const stop = (): void => {
        open = false
        wake()
      }
      events.on('change', push)
      events.on('close', stop)
      stream.onAbort(stop)
      try {
        await stream.writeSSE({ event: 'ready', data: 'ok' })
        while (open) {
          // Not `stream.sleep`: a shutdown has to end the stream now, not in
          // thirty seconds, or `close()` waits on a socket that never ends.
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, PING_MS)
            wake = (): void => {
              clearTimeout(timer)
              resolve()
            }
          })
          if (open) await stream.writeSSE({ event: 'ping', data: '' })
        }
      } finally {
        events.off('change', push)
        events.off('close', stop)
      }
    }),
  )

  // Before the SPA fallback: an unknown API path must not answer with HTML.
  app.all('/api/*', (c) => c.json(notFound(`No API route: ${c.req.method} ${c.req.path}`), 404))

  if (opts.distDir) {
    const distDir = opts.distDir
    // On the way out: `serveStatic` builds its Response before `onFound` runs,
    // so a header set from that hook never reaches the client.
    app.use('/*', async (c, next) => {
      await next()
      if (!c.res.ok) return
      // npm normalizes mtimes to 1985, so with no Cache-Control the browser
      // grants index.html years of heuristic freshness — and after an upgrade
      // asks for an asset hash that no longer exists. Only /assets is
      // fingerprinted by Vite, so only /assets may be kept forever.
      if (c.req.path.startsWith('/assets/')) c.header('Cache-Control', IMMUTABLE)
      else if (c.res.headers.get('Content-Type')?.includes('text/html')) {
        c.header('Cache-Control', 'no-cache')
      }
    })
    app.use('/*', serveStatic({ root: distDir }))
    const indexFallback = serveStatic({ path: 'index.html', root: distDir })
    app.get('*', async (c, next) => {
      // Navigations only. A missing `.js` answered with HTML is MIME-blocked by
      // the browser, and the user gets a blank page with no message.
      if (c.req.header('Accept')?.includes('text/html')) {
        const res = await indexFallback(c, next)
        if (res) return res
      }
      return c.json(notFound(`Not found: ${c.req.path}`), 404)
    })
  }

  return app
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

function isWrite(method: string): boolean {
  return WRITE_METHODS.has(method)
}

/**
 * A write may only come from the board's own page. Without this, any other
 * local dev server can POST a ticket as a simple CORS request — and a ticket is
 * something /triage and /implement later read and act on.
 */
function guardOrigin(c: Context, extra: ReadonlySet<string>): void {
  const origin = c.req.header('Origin')
  // Absent: a non-browser client (curl, the CLI, the desktop app). `null`:
  // a sandboxed iframe or a file:// page — never this board.
  if (origin === undefined) return
  if (origin === new URL(c.req.url).origin || extra.has(origin)) return
  throw new HTTPException(403, { message: `Cross-origin write refused from ${origin}` })
}

/** Forces a preflight: a simple CORS request cannot send this content type. */
function guardContentType(c: Context): void {
  if (!BODY_METHODS.has(c.req.method)) return
  const type = c.req.header('Content-Type')?.split(';')[0]?.trim().toLowerCase()
  if (type === 'application/json') return
  throw new HTTPException(415, { message: 'Content-Type must be application/json' })
}

/** Parses a write body against its schema, or raises the 400 `onError` renders. */
async function readBody<T>(c: Context, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw new HTTPException(400, { message: 'Body must be valid JSON' })
  }
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new HTTPException(400, { message: formatZodError(result.error) })
  }
  return result.data
}

function notFound(message: string): { error: string; message: string } {
  return { error: ERROR_CODES[404], message }
}

/**
 * The service throws plain `Error`s with a stable wording (`Task not found:
 * task-013`, `Unknown status: x — valid statuses: …`), so the message is the
 * only classifier available here. Anything unrecognized stays a 500.
 */
function statusOf(error: Error): ErrorStatus {
  if (error instanceof HTTPException) return (error.status as ErrorStatus) ?? 500
  if (error instanceof z.ZodError) return 400
  const message = error.message
  if (/ not found: /i.test(message) || message.includes('not initialized')) return 404
  if (message.startsWith('Unknown status:') || message.startsWith('Invalid ')) return 400
  return 500
}

function messageOf(error: Error): string {
  return error instanceof z.ZodError ? formatZodError(error) : error.message
}
