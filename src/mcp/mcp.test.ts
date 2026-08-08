import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { version } from '../../package.json'
import { BoardService } from '../service/board-service'
import { createMcpServer, resolveMcpRoot } from './server'

/**
 * Drives the real MCP server over a linked transport pair — the same code path
 * as the stdio entry, minus the process. What is asserted here is the contract
 * an agent writes against: one shape per tool, one convention for "not found".
 */
describe('MCP server', () => {
  let root: string
  let client: Client

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args })
    const content = result.content as unknown as { text?: string }[]
    return { isError: result.isError === true, text: content[0]?.text ?? '' }
  }

  const json = async (name: string, args: Record<string, unknown> = {}) => {
    const { isError, text } = await call(name, args)
    if (isError) throw new Error(text)
    return JSON.parse(text)
  }

  const descriptionOf = async (name: string): Promise<string> => {
    const { tools } = await client.listTools()
    return tools.find((tool) => tool.name === name)?.description ?? ''
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-mcp-'))
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    client = new Client({ name: 'test', version: '0.0.0' })
    await Promise.all([
      client.connect(clientTransport),
      createMcpServer(root).connect(serverTransport),
    ])
    await json('backlog_init', { name: 'Project' })
  })

  afterEach(async () => {
    await client.close()
    await rm(root, { recursive: true, force: true })
  })

  it('announces the package version', () => {
    expect(client.getServerVersion()).toMatchObject({ name: 'suivre', version })
  })

  it('answers task_next with the same key whether or not a task is ready', async () => {
    const empty = await json('task_next')
    expect(empty).toEqual({ task: null })

    await json('task_add', { title: 'First' })
    const ready = await json('task_next')
    expect(ready.task.id).toBe('task-001')
  })

  it('errors on an unknown id, on reads as on writes', async () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['task_get', { id: 'task-404' }, 'Task not found: task-404'],
      ['task_edit', { id: 'task-404', title: 'x' }, 'Task not found: task-404'],
      ['task_remove', { id: 'task-404' }, 'Task not found: task-404'],
      ['sprint_get', { id: 'sprint-404' }, 'Sprint not found: sprint-404'],
      ['sprint_add', { id: 'sprint-404', taskIds: [] }, 'Sprint not found: sprint-404'],
      ['doc_get', { id: 'doc-404' }, 'Doc not found: doc-404'],
      ['doc_edit', { id: 'doc-404', title: 'x' }, 'Doc not found: doc-404'],
      ['decision_get', { id: 'decision-404' }, 'Decision not found: decision-404'],
      ['decision_edit', { id: 'decision-404', title: 'x' }, 'Decision not found: decision-404'],
    ]
    for (const [name, args, message] of cases) {
      const result = await call(name, args)
      expect({ name, ...result }).toEqual({ name, isError: true, text: message })
    }
  })

  it('returns entities in the CLI --json shape', async () => {
    const { task } = await json('task_add', { title: 'Forme', body: 'Corps' })
    expect(task).toMatchObject({ id: 'task-001', title: 'Forme', status: 'backlog', body: 'Corps' })
    expect(task).not.toHaveProperty('order')
    expect(task).not.toHaveProperty('frontmatter')

    const board = (await json('backlog_list')).board
    expect(board.columns[0].tasks[0]).not.toHaveProperty('order')
  })

  it('reports the task files it could not parse', async () => {
    await json('task_add', { title: 'Valide' })
    await writeFile(join(root, '.suivre', 'tasks', 'broken.md'), '---\nid: nope\n---\nbroken\n')

    const { tasks, invalid } = await json('task_list')
    expect(tasks).toHaveLength(1)
    expect(invalid).toHaveLength(1)
    expect(invalid[0].fileName).toBe('broken.md')
  })

  it('keeps the comments when task_edit replaces the body', async () => {
    await json('task_add', { title: 'Sujet', body: 'Avant' })
    await json('task_comment', { id: 'task-001', text: 'Vu', author: 'claude' })
    const { task } = await json('task_edit', { id: 'task-001', body: 'After' })
    expect(task.body).toContain('After')
    expect(task.body).toContain('## Comments')
    expect(await descriptionOf('task_edit')).toMatch(/REPLACES/)
  })

  it('refuses an unknown status and names the valid ones', async () => {
    await json('task_add', { title: 'Statut' })
    const moved = await call('task_move', { id: 'task-001', status: 'nope' })
    expect(moved.isError).toBe(true)
    expect(moved.text).toBe(
      'Unknown status: nope — valid statuses: backlog, todo, doing, done, archived',
    )
  })

  it('closes a task and reports an archiving that could not happen', async () => {
    await json('task_add', { title: 'À clore' })
    const closed = await json('task_close', { id: 'task-001', comment: 'Fait' })
    expect(closed).toMatchObject({ archived: false })
    expect(closed.task.status).toBe('done')

    await json('task_add', { title: 'Blocked' })
    const tasksDir = join(root, '.suivre', 'tasks')
    const fileName = (await readdir(tasksDir)).find((name) => name.startsWith('task-002'))!
    await mkdir(join(tasksDir, 'archive'), { recursive: true })
    await writeFile(join(tasksDir, 'archive', fileName), 'squatter')

    const partial = await json('task_close', { id: 'task-002', archive: true })
    expect(partial.archived).toBe(false)
    expect(partial.task.status).toBe('done')
    expect(partial.warning).toContain('Task closed but not archived: task-002')
  })

  it('appends with sprint_add where sprint_edit replaces', async () => {
    await json('task_add', { title: 'Une' })
    await json('task_add', { title: 'Deux' })
    await json('sprint_create', { title: 'Effort', items: ['task-001'] })

    const added = await json('sprint_add', { id: 'sprint-001', taskIds: ['task-002', 'task-001'] })
    expect(added.sprint.items).toEqual(['task-001', 'task-002'])

    const replaced = await json('sprint_edit', { id: 'sprint-001', items: ['task-002'] })
    expect(replaced.sprint.items).toEqual(['task-002'])
    expect(await descriptionOf('sprint_edit')).toMatch(/REPLACES/)
  })

  it('measures sprint progress against the board and closes the sprint', async () => {
    await json('task_add', { title: 'Une' })
    await json('task_add', { title: 'Deux' })
    await json('sprint_create', { title: 'Effort', items: ['task-001', 'task-002'] })
    await json('task_close', { id: 'task-001' })

    const got = await json('sprint_get', { id: 'sprint-001' })
    expect(got.progress).toEqual({ done: 1, total: 2, currentIndex: 1 })
    expect(got.steps[0]).toMatchObject({ id: 'task-001', title: 'Une', done: true })

    const done = await json('sprint_done', { id: 'sprint-001' })
    expect(done.sprint.status).toBe('done')
  })

  it('edits docs and decisions', async () => {
    await json('doc_create', { title: 'Spec', tags: ['a'], body: 'v1' })
    const doc = await json('doc_edit', { id: 'doc-001', tags: ['b'], body: 'v2' })
    expect(doc.doc).toMatchObject({ id: 'doc-001', title: 'Spec', tags: ['b'], body: 'v2' })

    await json('decision_create', { title: 'ADR' })
    const decision = await json('decision_edit', { id: 'decision-001', status: 'accepted' })
    expect(decision.decision).toMatchObject({ id: 'decision-001', status: 'accepted' })
  })

  it('works from a subdirectory of the board', async () => {
    const nested = join(root, 'src', 'deep')
    await mkdir(nested, { recursive: true })
    expect(resolveMcpRoot(nested)).toBe(root)
  })
})

/** One JSON-RPC message per line, as an MCP client writes them. */
async function driveStdio(
  root: string,
  requests: { id?: number; method: string; params?: unknown }[],
): Promise<Map<number, { result?: Record<string, unknown> }>> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/mcp/index.ts'], {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    env: { ...process.env, SUIVRE_ROOT: root },
    stdio: ['pipe', 'pipe', 'ignore'],
  })
  try {
    const expected = requests.filter((request) => request.id !== undefined).length
    const responses = new Map<number, { result?: Record<string, unknown> }>()
    const settled = new Promise<void>((resolve, reject) => {
      createInterface({ input: child.stdout }).on('line', (line) => {
        let message: { id?: unknown; result?: Record<string, unknown> }
        try {
          message = JSON.parse(line)
        } catch {
          reject(new Error(`Not JSON-RPC on stdout: ${line}`))
          return
        }
        if (typeof message.id === 'number') responses.set(message.id, message)
        if (responses.size === expected) resolve()
      })
      child.on('error', reject)
      child.on('exit', (code) => reject(new Error(`stdio server exited (${code})`)))
    })
    for (const request of requests) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...request })}\n`)
    }
    await settled
    return responses
  } finally {
    child.kill()
  }
}

/**
 * The stdio entry driven as a real process: anything written to stdout outside
 * the protocol corrupts every message, and only a process shows that.
 */
describe('MCP stdio entry', () => {
  it('answers a client over stdio', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suivre-stdio-'))
    try {
      const service = new BoardService(root)
      await service.init('Project')
      await service.create({ title: 'Ready one' })

      const responses = await driveStdio(root, [
        {
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test', version: '0.0.0' },
          },
        },
        { method: 'notifications/initialized' },
        { id: 2, method: 'tools/list' },
        { id: 3, method: 'tools/call', params: { name: 'task_next', arguments: {} } },
      ])

      expect(responses.get(1)?.result?.['serverInfo']).toEqual({ name: 'suivre', version })
      const tools = responses.get(2)?.result?.['tools'] as { name: string }[]
      expect(tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['task_next', 'sprint_add', 'sprint_done', 'doc_edit']),
      )
      const content = responses.get(3)?.result?.['content'] as { text: string }[]
      expect(JSON.parse(content[0]!.text).task.id).toBe('task-001')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 20_000)
})
