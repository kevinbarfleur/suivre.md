import { serve } from '@hono/node-server'
import { EventEmitter } from 'node:events'
import { resolvePaths } from '../storage'
import { BoardService } from '../service/board-service'
import { createApp } from './app'
import { watchTasks } from './watch'

export interface ServerOptions {
  port?: number
  dirName?: string
  distDir?: string
}

export interface ServerHandle {
  port: number
  url: string
  close: () => Promise<void>
}

/** Démarre le board : service + file-watcher → SSE + serveur HTTP. */
export async function startServer(root: string, opts: ServerOptions = {}): Promise<ServerHandle> {
  const port = opts.port ?? Number(process.env.PORT ?? 45188)
  const dirName = opts.dirName ?? '.suivre'
  const service = new BoardService(root, dirName)
  const events = new EventEmitter()
  const paths = resolvePaths(root, dirName)
  const watcher = watchTasks(paths.tasksDir, () => events.emit('change'))
  const app = createApp(service, events, opts.distDir ? { distDir: opts.distDir } : {})
  const server = serve({ fetch: app.fetch, port })

  return {
    port,
    url: `http://localhost:${port}`,
    close: async () => {
      await watcher.close()
      server.close()
    },
  }
}
