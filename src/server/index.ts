import { serve } from '@hono/node-server'
import type { ServerType } from '@hono/node-server'
import { EventEmitter } from 'node:events'
import { mkdir } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { resolvePaths } from '../storage'
import { BoardService } from '../service/board-service'
import { createApp } from './app'
import { watchBacklog } from './watch'

export interface ServerOptions {
  port?: number
  /** Interface to bind. Loopback by default: the board has no authentication. */
  host?: string
  dirName?: string
  distDir?: string
  /** Extra browser origins allowed to write (the Vite dev server proxies `/api`). */
  allowedOrigins?: readonly string[]
}

export interface ServerHandle {
  port: number
  /** Address actually bound, as reported by the socket. */
  host: string
  url: string
  close: () => Promise<void>
}

const DEFAULT_PORT = 45188
const LOOPBACK = '127.0.0.1'

/** Starts the board: service + file watcher → SSE + HTTP server. */
export async function startServer(root: string, opts: ServerOptions = {}): Promise<ServerHandle> {
  const port = opts.port ?? Number(process.env.PORT ?? DEFAULT_PORT)
  const hostname = opts.host ?? process.env.SUIVRE_HOST ?? LOOPBACK
  const dirName = opts.dirName ?? '.suivre'
  const absoluteRoot = resolve(root)
  const service = new BoardService(absoluteRoot, dirName)
  const events = new EventEmitter()
  const paths = resolvePaths(absoluteRoot, dirName)
  // The watcher needs its directory to exist: started before `suivre init`, it
  // would otherwise stay dead for the whole process lifetime.
  await mkdir(paths.tasksDir, { recursive: true })
  const watcher = watchBacklog(paths, (kind) => events.emit('change', kind))
  const app = createApp(service, events, {
    root: absoluteRoot,
    ...(opts.distDir ? { distDir: opts.distDir } : {}),
    ...(opts.allowedOrigins ? { allowedOrigins: opts.allowedOrigins } : {}),
  })
  const server = serve({ fetch: app.fetch, port, hostname })

  let address: AddressInfo
  try {
    address = await bound(server, port)
  } catch (error) {
    await watcher.close()
    throw error
  }

  return {
    port: address.port,
    host: address.address,
    url: `http://${displayHost(hostname)}:${address.port}`,
    close: async () => {
      // Ends the SSE streams first: `server.close()` waits for open connections.
      events.emit('close')
      await watcher.close()
      if ('closeAllConnections' in server) server.closeAllConnections()
      await new Promise<void>((done, fail) => {
        server.close((error) => (error ? fail(error) : done()))
      })
    },
  }
}

/**
 * `serve()` returns before the socket is bound. Without waiting, the caller
 * prints a URL for a port it may not hold — another repo's board, whose write
 * routes the user then drives by mistake — and the EADDRINUSE that follows is
 * emitted where nothing can catch it.
 */
function bound(server: ServerType, port: number): Promise<AddressInfo> {
  return new Promise((ok, fail) => {
    const onError = (error: NodeJS.ErrnoException): void => {
      server.off('listening', onListening)
      fail(
        error.code === 'EADDRINUSE'
          ? new Error(`port ${port} is already in use — try --port <n>`)
          : error,
      )
    }
    const onListening = (): void => {
      server.off('error', onError)
      const address = server.address()
      if (address === null || typeof address === 'string') {
        fail(new Error(`server bound to an unexpected address: ${String(address)}`))
        return
      }
      ok(address)
    }
    server.once('error', onError)
    server.once('listening', onListening)
  })
}

/** A host a human can click: a wildcard bind has no address to print. */
function displayHost(hostname: string): string {
  return hostname === LOOPBACK || hostname === '0.0.0.0' || hostname === '::'
    ? 'localhost'
    : hostname
}
