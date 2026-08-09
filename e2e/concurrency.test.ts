import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { callTool, CLI, mcpPayload, mcpSession, withBoard } from './harness'
import type { Board } from './harness'

/**
 * Concurrent writers, the class of bug atomic writes cannot fix: the lost
 * update is in the read-modify-write around the file, not in the file.
 *
 * `board.cli` is spawnSync, so two of its calls can never overlap. These tests
 * start every process before awaiting any of them — what an agent batching Bash
 * calls, or two surfaces on one board, actually do.
 */

interface AsyncRun {
  status: number
  stdout: string
  stderr: string
}

function cliAsync(board: Board, ...args: string[]): Promise<AsyncRun> {
  return new Promise<AsyncRun>((resolve, reject) => {
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
    child.on('error', reject)
    child.on('close', (code) => resolve({ status: code ?? -1, stdout, stderr }))
  })
}

const taskFiles = async (board: Board): Promise<string[]> =>
  (await readdir(join(board.root, '.suivre', 'tasks'))).filter((name) => name.endsWith('.md'))

const statuses = (runs: readonly AsyncRun[]): number[] => runs.map((run) => run.status)
const zeros = (n: number): number[] => Array.from({ length: n }, () => 0)

it('gives ten concurrent `add` ten distinct ids, even with one identical title', async () => {
  await withBoard(async (board) => {
    const runs = await Promise.all(
      Array.from({ length: 10 }, () => cliAsync(board, 'add', 'Same title', '--json')),
    )

    expect(statuses(runs)).toEqual(zeros(10))
    const ids = runs.map((run) => (JSON.parse(run.stdout) as { id: string }).id)
    expect(new Set(ids).size).toBe(10)
    expect(await taskFiles(board)).toHaveLength(10)
    expect(board.cli('list', '--json').json<unknown[]>()).toHaveLength(10)
  })
})

it('keeps every comment when twelve land on one task at once', async () => {
  await withBoard(async (board) => {
    board.cli('add', 'Target')
    const texts = Array.from({ length: 12 }, (_, i) => `comment-${i}`)

    const runs = await Promise.all(
      texts.map((text) => cliAsync(board, 'comment', 'task-001', text, '--author', 'agent')),
    )

    expect(statuses(runs)).toEqual(zeros(texts.length))
    const file = await board.read('.suivre/tasks/task-001-target.md')
    for (const text of texts) expect(file).toContain(text)
    expect(file.split('## Comments')).toHaveLength(2)
    expect(board.cli('get', 'task-001').status).toBe(0)
  })
})

it('loses no comment when comments and body rewrites interleave', async () => {
  await withBoard(async (board) => {
    board.cli('add', 'Target')
    const texts = Array.from({ length: 20 }, (_, i) => `comment-${i}`)
    const pending: Promise<AsyncRun>[] = []
    texts.forEach((text, i) => {
      pending.push(cliAsync(board, 'comment', 'task-001', text))
      if (i % 4 === 3) pending.push(cliAsync(board, 'edit', 'task-001', '--body', `BODY-${i}`))
    })

    const runs = await Promise.all(pending)

    expect(statuses(runs)).toEqual(zeros(pending.length))
    const file = await board.read('.suivre/tasks/task-001-target.md')
    for (const text of texts) expect(file).toContain(text)
    expect(file.split('## Comments')).toHaveLength(2)
    // The file still parses, and a body rewrite still won the body itself.
    const task = board.cli('get', 'task-001', '--json').json<{ body: string }>()
    expect(task.body).toMatch(/^BODY-\d+/)
  })
})

it('loses no write when parallel MCP sessions comment and edit the same task', async () => {
  await withBoard(async (board) => {
    board.cli('add', 'Target')
    const sessions = Array.from({ length: 4 }, (_, session) =>
      board.mcp(
        mcpSession(
          callTool(1, 'task_comment', { id: 'task-001', text: `mcp-${session}-a` }),
          callTool(2, 'task_edit', { id: 'task-001', body: `MCP-BODY-${session}` }),
          callTool(3, 'task_comment', { id: 'task-001', text: `mcp-${session}-b` }),
        ),
      ),
    )

    const results = await Promise.all(sessions)

    for (const responses of results) {
      for (const id of [1, 2, 3]) {
        const response = responses.get(id)
        expect(response?.error).toBeUndefined()
        expect(response?.result?.isError).toBeFalsy()
        expect(mcpPayload<{ task: { id: string } }>(response).task.id).toBe('task-001')
      }
    }
    const file = await board.read('.suivre/tasks/task-001-target.md')
    for (let session = 0; session < results.length; session++) {
      expect(file).toContain(`mcp-${session}-a`)
      expect(file).toContain(`mcp-${session}-b`)
    }
    expect(file).toMatch(/^MCP-BODY-\d+$/m)
    expect(board.cli('get', 'task-001').status).toBe(0)
  })
})
