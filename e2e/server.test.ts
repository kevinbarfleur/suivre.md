import { spawn } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { callTool, CLI, mcpPayload, mcpSession, startBoard, withBoard } from './harness'
import type { Board } from './harness'

/**
 * The board server. It has no authentication and it writes the same files the
 * CLI and MCP read, so its input validation and its bind address are part of
 * the data contract, not of the UI.
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** Every task file with its bytes — the witness that a request wrote nothing. */
async function snapshot(board: Board): Promise<Record<string, string>> {
  const dir = join(board.root, '.suivre', 'tasks')
  const names = (await readdir(dir)).filter((name) => name.endsWith('.md')).sort()
  const files: Record<string, string> = {}
  for (const name of names) files[name] = await readFile(join(dir, name), 'utf8')
  return files
}

/**
 * Runs the CLI and waits for it to exit, with a deadline. Not `board.cli`: a
 * `board` that wrongly took the port would never return, and spawnSync cannot
 * be given one.
 */
function runToExit(
  board: Board,
  args: readonly string[],
  timeoutMs = 20_000,
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: board.root,
      env: { ...process.env, SUIVRE_ROOT: board.root, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ status: code ?? -1, stdout, stderr })
    })
  })
}

describe('write routes', () => {
  it('clears a priority through HTTP and MCP without storing null on disk', async () => {
    await withBoard(async (board) => {
      expect(board.cli('add', 'Alpha', '--priority', 'high').status).toBe(0)
      const server = await startBoard(board)
      try {
        const patch = (body: unknown) =>
          fetch(`${server.url}/api/tasks/task-001`, {
            method: 'PATCH',
            headers: JSON_HEADERS,
            body: JSON.stringify(body),
          })

        const unrelated = await patch({ body: 'Notes' })
        expect(unrelated.status).toBe(200)
        expect((await unrelated.json()).frontmatter.priority).toBe('high')

        const cleared = await patch({ priority: null })
        expect(cleared.status).toBe(200)
        expect((await cleared.json()).frontmatter).not.toHaveProperty('priority')
        expect(await board.read('.suivre/tasks/task-001-alpha.md')).not.toMatch(/^priority:/m)
        expect(board.cli('get', 'task-001', '--json').json()).not.toHaveProperty('priority')

        expect((await patch({ priority: 'low' })).status).toBe(200)
        const responses = await board.mcp(
          mcpSession(callTool(1, 'task_edit', { id: 'task-001', priority: null })),
        )
        expect(responses.get(1)?.result?.isError).not.toBe(true)
        expect(
          mcpPayload<{ task: Record<string, unknown> }>(responses.get(1)).task,
        ).not.toHaveProperty('priority')
        expect(await board.read('.suivre/tasks/task-001-alpha.md')).not.toMatch(/^priority:/m)
      } finally {
        await server.stop()
      }
    })
  })

  it('answers a malformed body with 4xx and writes nothing', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'Alpha')
      const server = await startBoard(board)
      try {
        const before = await snapshot(board)
        const malformed = [
          ['POST', '/api/tasks', {}],
          ['POST', '/api/tasks/task-001/move', {}],
          ['PATCH', '/api/tasks/task-001', { labels: 'oops' }],
          ['POST', '/api/tasks', { title: 'Bogus', priority: 'BOGUS' }],
        ] as const

        for (const [method, path, body] of malformed) {
          const where = `${method} ${path} ${JSON.stringify(body)}`
          const res = await fetch(`${server.url}${path}`, {
            method,
            headers: JSON_HEADERS,
            body: JSON.stringify(body),
          })
          expect(res.status, where).toBeGreaterThanOrEqual(400)
          expect(res.status, where).toBeLessThan(500)
          expect(await res.json(), where).toMatchObject({ error: 'invalid-request' })
        }

        expect(await snapshot(board)).toEqual(before)
        expect((await fetch(`${server.url}/api/board`)).status).toBe(200)
      } finally {
        await server.stop()
      }
    })
  })

  it('cannot be made to rewrite id, created or order through a PATCH', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'Alpha')
      const server = await startBoard(board)
      try {
        const before = (await (await fetch(`${server.url}/api/tasks/task-001`)).json()) as {
          frontmatter: { created: string; order: string }
        }

        const res = await fetch(`${server.url}/api/tasks/task-001`, {
          method: 'PATCH',
          headers: JSON_HEADERS,
          body: JSON.stringify({
            id: 'task-999',
            created: '1999-01-01T00:00:00Z',
            order: 'zzzz',
            title: 'Renamed',
          }),
        })

        expect(res.status).toBe(200)
        const after = (await res.json()) as {
          frontmatter: { id: string; title: string; created: string; order: string }
        }
        expect(after.frontmatter.id).toBe('task-001')
        expect(after.frontmatter.created).toBe(before.frontmatter.created)
        expect(after.frontmatter.order).toBe(before.frontmatter.order)
        // The patch was applied, so the rejection above is not a no-op.
        expect(after.frontmatter.title).toBe('Renamed')

        const file = await board.read('.suivre/tasks/task-001-renamed.md')
        expect(file).toContain('id: task-001')
        expect(file).toContain(`created: ${before.frontmatter.created}`)
        expect(file).not.toContain('task-999')
        expect(file).not.toContain('zzzz')
        expect(board.cli('get', 'task-001').status).toBe(0)
      } finally {
        await server.stop()
      }
    })
  })
})

describe('the board process', () => {
  it('binds loopback only', async () => {
    await withBoard(async (board) => {
      const server = await startBoard(board)
      try {
        expect((await fetch(`${server.url}/api/health`)).ok).toBe(true)

        const lan = Object.values(networkInterfaces())
          .flat()
          .find((info) => info && info.family === 'IPv4' && !info.internal)
        // A machine with no LAN address has nothing to prove here; the loopback
        // assertion above still stands.
        if (lan) {
          await expect(
            fetch(`http://${lan.address}:${server.port}/api/health`, {
              signal: AbortSignal.timeout(5_000),
            }),
          ).rejects.toThrow()
        }
      } finally {
        await server.stop()
      }
    })
  })

  it('answers an unknown /api path with JSON, never with the SPA', async () => {
    await withBoard(async (board) => {
      const server = await startBoard(board)
      try {
        // The Accept header is what used to hand the SPA's index.html back.
        const res = await fetch(`${server.url}/api/does-not-exist`, {
          headers: { Accept: 'text/html,*/*' },
        })

        expect(res.status).toBe(404)
        expect(res.headers.get('content-type')).toContain('application/json')
        expect(await res.json()).toMatchObject({ error: 'not-found' })
      } finally {
        await server.stop()
      }
    })
  })

  it('publishes the identity of the repo it serves on /api/health', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'Alpha')
      const server = await startBoard(board)
      try {
        const health = await (await fetch(`${server.url}/api/health`)).json()

        expect(health).toEqual({ ok: true, product: 'suivre', root: board.root, name: 'e2e' })
      } finally {
        await server.stop()
      }
    })
  })

  it('refuses a second board on a port already in use, before announcing success', async () => {
    await withBoard(async (board) => {
      const server = await startBoard(board)
      try {
        const second = await runToExit(board, ['board', '--port', String(server.port)])

        expect(second.status).not.toBe(0)
        expect(second.stderr).toMatch(/already in use/i)
        expect(second.stdout).not.toContain('board on')
        expect((await fetch(`${server.url}/api/health`)).ok).toBe(true)
      } finally {
        await server.stop()
      }
    })
  })
})
