import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * End-to-end harness. These tests drive the SHIPPED artefacts — the bundled CLI,
 * the stdio MCP entry, the HTTP server — in a throwaway repo, because that is the
 * only place where the defects this suite exists to catch actually appear: option
 * coercion, process boundaries, concurrent writers, files on disk.
 *
 * Everything runs against `dist/`, so `npm run build` must have happened. The
 * suite fails loudly rather than silently testing stale code.
 */

export const REPO = fileURLToPath(new URL('..', import.meta.url))
export const CLI = join(REPO, 'dist', 'cli', 'index.js')
export const MCP = join(REPO, 'dist', 'mcp', 'index.js')

export function requireBuild(): void {
  if (!existsSync(CLI) || !existsSync(MCP)) {
    throw new Error(`e2e needs the bundles — run \`npm run build\` first (missing ${CLI})`)
  }
}

export interface Run {
  status: number
  stdout: string
  stderr: string
  /** stdout parsed as JSON. Throws with the raw output when it is not JSON. */
  json: <T = unknown>() => T
}

function toRun(result: SpawnSyncReturns<string>): Run {
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  return {
    status: result.status ?? -1,
    stdout,
    stderr,
    json: <T>() => {
      try {
        return JSON.parse(stdout) as T
      } catch {
        throw new Error(`expected JSON on stdout, got:\n${stdout}\n--- stderr ---\n${stderr}`)
      }
    },
  }
}

/** A throwaway board, plus the ways an agent or a human can drive it. */
export interface Board {
  root: string
  /** Runs the built CLI inside the board. Never throws on a non-zero exit. */
  cli: (...args: string[]) => Run
  /** Same, from an arbitrary cwd — for root discovery and `init` guards. */
  cliIn: (cwd: string, ...args: string[]) => Run
  /**
   * Runs a shell script with a real `suivre` on PATH, so the commands the
   * adapter documents can be executed VERBATIM — no substitution, which is the
   * only way the test proves what a user's shell would actually do.
   */
  sh: (script: string, shell?: 'zsh' | 'bash') => Run
  read: (relative: string) => Promise<string>
  write: (relative: string, content: string) => Promise<void>
  /** One MCP session: a list of JSON-RPC calls in, the responses out. */
  mcp: (calls: McpCall[]) => Promise<Map<number, McpResponse>>
}

export interface McpCall {
  id?: number
  method: string
  params?: unknown
}

export interface McpResponse {
  result?: { content?: { text: string }[]; isError?: boolean; [k: string]: unknown }
  error?: { message?: string }
}

/** The JSON payload an MCP tool returned, already unwrapped. */
export function mcpPayload<T = Record<string, unknown>>(response: McpResponse | undefined): T {
  const text = response?.result?.content?.[0]?.text
  if (text === undefined) throw new Error(`no tool content in ${JSON.stringify(response)}`)
  return JSON.parse(text) as T
}

/**
 * Creates a board, hands it to `fn`, and removes it afterwards — even when the
 * assertion fails, so a red test never leaves a directory behind.
 */
export async function withBoard<T>(
  fn: (board: Board) => Promise<T>,
  opts: { init?: string | false } = {},
): Promise<T> {
  requireBuild()
  const root = await mkdtemp(join(tmpdir(), 'suivre-e2e-'))
  const bin = await installShim(root)
  const board = makeBoard(root, bin)
  try {
    if (opts.init !== false) board.cli('init', opts.init ?? 'e2e')
    return await fn(board)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

/**
 * A `suivre` executable on PATH. Passing the bundle path through a variable is
 * not equivalent: zsh does not word-split an unquoted expansion, so `$SUIVRE`
 * would be one command name. A shim also matches what a user actually has.
 */
async function installShim(root: string): Promise<string> {
  const bin = join(root, '.e2e-bin')
  await mkdir(bin, { recursive: true })
  const shim = join(bin, 'suivre')
  await writeFile(
    shim,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(CLI)} "$@"\n`,
  )
  await chmod(shim, 0o755)
  return bin
}

function makeBoard(root: string, bin: string): Board {
  const env = { ...process.env, SUIVRE_ROOT: root, NO_COLOR: '1' }

  const cliIn = (cwd: string, ...args: string[]): Run =>
    toRun(
      spawnSync(process.execPath, [CLI, ...args], {
        cwd,
        // SUIVRE_ROOT would defeat root discovery: when a test passes a cwd it
        // wants the CLI to find (or fail to find) the board on its own.
        env: cwd === root ? env : { ...process.env, NO_COLOR: '1' },
        encoding: 'utf8',
      }),
    )

  return {
    root,
    cli: (...args) => cliIn(root, ...args),
    cliIn,
    sh: (script, shell = 'zsh') =>
      toRun(
        spawnSync(shell, ['-c', script], {
          cwd: root,
          env: { ...env, PATH: `${bin}:${process.env['PATH'] ?? ''}` },
          encoding: 'utf8',
        }),
      ),
    read: (relative) => readFile(join(root, relative), 'utf8'),
    write: async (relative, content) => {
      await writeFile(join(root, relative), content, 'utf8')
    },
    mcp: (calls) => driveMcp(root, calls),
  }
}

/** Drives the stdio MCP entry as a real client would: one JSON-RPC line each. */
async function driveMcp(root: string, calls: McpCall[]): Promise<Map<number, McpResponse>> {
  const child = spawn(process.execPath, [MCP], {
    cwd: root,
    env: { ...process.env, SUIVRE_ROOT: root },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  try {
    const expected = calls.filter((call) => call.id !== undefined).length
    const responses = new Map<number, McpResponse>()
    const settled = new Promise<void>((resolve, reject) => {
      createInterface({ input: child.stdout }).on('line', (line) => {
        let message: { id?: unknown } & McpResponse
        try {
          message = JSON.parse(line)
        } catch {
          // Anything non-protocol on stdout corrupts every message for a real
          // client, so it must fail the test rather than be skipped.
          reject(new Error(`not JSON-RPC on stdout: ${line}`))
          return
        }
        if (typeof message.id === 'number') responses.set(message.id, message)
        if (responses.size === expected) resolve()
      })
      child.on('error', reject)
      child.on('exit', (code) => reject(new Error(`mcp server exited early (${code})`)))
    })
    for (const call of calls) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...call })}\n`)
    }
    await settled
    return responses
  } finally {
    child.kill()
  }
}

/** The handshake every MCP session opens with, followed by the calls under test. */
export function mcpSession(...calls: McpCall[]): McpCall[] {
  return [
    {
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '0.0.0' },
      },
    },
    { method: 'notifications/initialized' },
    ...calls,
  ]
}

export const callTool = (
  id: number,
  name: string,
  args: Record<string, unknown> = {},
): McpCall => ({
  id,
  method: 'tools/call',
  params: { name, arguments: args },
})

/** A free TCP port, claimed by the OS so two parallel test files cannot collide. */
export async function freePort(): Promise<number> {
  const { createServer } = await import('node:net')
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

export interface Server {
  url: string
  port: number
  stop: () => Promise<void>
}

/** Starts the real board server on the board, and waits until it answers. */
export async function startBoard(board: Board): Promise<Server> {
  const port = await freePort()
  const child = spawn(process.execPath, [CLI, 'board', '--port', String(port)], {
    cwd: board.root,
    env: { ...process.env, SUIVRE_ROOT: board.root },
    stdio: 'ignore',
  })
  const url = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 20_000
  for (;;) {
    if (child.exitCode !== null) throw new Error(`board exited (${child.exitCode})`)
    try {
      const res = await fetch(`${url}/api/health`)
      if (res.ok) break
    } catch {
      /* not listening yet */
    }
    if (Date.now() > deadline) throw new Error('board did not start within 20s')
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
  return {
    url,
    port,
    stop: async () => {
      child.kill()
      await new Promise((resolve) => child.once('exit', resolve))
    },
  }
}
