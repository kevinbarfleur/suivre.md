import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { serveStatic } from '@hono/node-server/serve-static'
import type { EventEmitter } from 'node:events'
import type { BoardService } from '../service/board-service'

export interface AppOptions {
  /** Dossier de la SPA buildée à servir (prod). Absent en dev (Vite sert le front). */
  distDir?: string
}

/**
 * Adaptateur HTTP mince sur le service. REST pour les opérations, SSE pour le
 * live (poussé par le file-watcher). Aucune logique métier ici.
 */
export function createApp(service: BoardService, events: EventEmitter, opts: AppOptions = {}): Hono {
  const app = new Hono()

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.get('/api/board', async (c) => {
    const board = await service.getBoard()
    return board ? c.json(board) : c.json({ error: 'not-initialized' }, 404)
  })

  app.get('/api/config', async (c) => {
    const config = await service.loadConfig()
    return config ? c.json(config) : c.json({ error: 'not-initialized' }, 404)
  })

  app.post('/api/tasks', async (c) => {
    const task = await service.create(await c.req.json())
    return c.json(task, 201)
  })

  app.get('/api/tasks/:id', async (c) => {
    const task = await service.getTask(c.req.param('id'))
    return task ? c.json(task) : c.json({ error: 'not-found' }, 404)
  })

  app.patch('/api/tasks/:id', async (c) => {
    const task = await service.edit(c.req.param('id'), await c.req.json())
    return c.json(task)
  })

  app.post('/api/tasks/:id/move', async (c) => {
    const body = await c.req.json()
    const task = await service.move(c.req.param('id'), body.status, {
      beforeId: body.beforeId,
      afterId: body.afterId,
    })
    return c.json(task)
  })

  app.delete('/api/tasks/:id', async (c) => {
    return c.json({ ok: await service.remove(c.req.param('id')) })
  })

  app.get('/api/preferences', async (c) => c.json(await service.getPreferences()))

  app.patch('/api/preferences/global', async (c) => {
    return c.json(await service.patchGlobalPreferences(await c.req.json()))
  })

  app.patch('/api/preferences/project', async (c) => {
    return c.json(await service.patchProjectPreferences(await c.req.json()))
  })

  app.get('/api/archive', async (c) => c.json(await service.getArchive()))

  app.get('/api/decisions', async (c) => c.json(await service.listDecisions()))
  app.post('/api/decisions', async (c) => c.json(await service.createDecision(await c.req.json()), 201))
  app.get('/api/decisions/:id', async (c) => {
    const decision = await service.getDecision(c.req.param('id'))
    return decision ? c.json(decision) : c.json({ error: 'not-found' }, 404)
  })
  app.patch('/api/decisions/:id', async (c) => {
    return c.json(await service.editDecision(c.req.param('id'), await c.req.json()))
  })
  app.delete('/api/decisions/:id', async (c) => {
    return c.json({ ok: await service.removeDecision(c.req.param('id')) })
  })

  app.get('/api/docs', async (c) => c.json(await service.listDocs()))
  app.post('/api/docs', async (c) => c.json(await service.createDoc(await c.req.json()), 201))
  app.get('/api/docs/:id', async (c) => {
    const doc = await service.getDoc(c.req.param('id'))
    return doc ? c.json(doc) : c.json({ error: 'not-found' }, 404)
  })
  app.patch('/api/docs/:id', async (c) => {
    return c.json(await service.editDoc(c.req.param('id'), await c.req.json()))
  })
  app.delete('/api/docs/:id', async (c) => {
    return c.json({ ok: await service.removeDoc(c.req.param('id')) })
  })

  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      let open = true
      const send = (): void => {
        void stream.writeSSE({ event: 'board', data: 'changed' })
      }
      events.on('change', send)
      stream.onAbort(() => {
        open = false
        events.off('change', send)
      })
      await stream.writeSSE({ event: 'ready', data: 'ok' })
      while (open) {
        await stream.sleep(30000)
        if (open) await stream.writeSSE({ event: 'ping', data: '' })
      }
    }),
  )

  if (opts.distDir) {
    const distDir = opts.distDir
    app.use('/*', serveStatic({ root: distDir }))
    app.get('*', serveStatic({ path: 'index.html', root: distDir }))
  }

  return app
}
