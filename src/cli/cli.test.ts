import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cac } from 'cac'
import type { CAC } from 'cac'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerTaskCommands } from './commands/tasks'
import { registerSprintCommands } from './commands/sprints'
import { registerKnowledgeCommands } from './commands/knowledge'
import { registerSurfaceCommands } from './commands/surfaces'
import { commandRoot, initRoot, runCli } from './context'

/** `process.exit` replaced by a throw, so a failing command does not kill the runner. */
class Exited extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`)
  }
}

interface Result {
  code: number
  out: string
  err: string
}

function buildCli(): CAC {
  const cli = cac('suivre')
  registerTaskCommands(cli)
  registerSprintCommands(cli)
  registerKnowledgeCommands(cli)
  registerSurfaceCommands(cli, { webDistDir: '', desktopDir: '' })
  cli.help()
  cli.version('0.0.0-test')
  return cli
}

/** Runs the CLI the way the entry does: a fresh cac, real argv, real disk. */
async function suivre(root: string, ...args: string[]): Promise<Result> {
  const out: string[] = []
  const err: string[] = []
  const write = (...parts: unknown[]): void => void out.push(parts.join(' '))
  const log = vi.spyOn(console, 'log').mockImplementation(write)
  // cac prints the version through `console.info`.
  const info = vi.spyOn(console, 'info').mockImplementation(write)
  const error = vi
    .spyOn(console, 'error')
    .mockImplementation((...parts) => void err.push(parts.join(' ')))
  const exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Exited(code ?? 0)
  }) as never)
  const previous = process.env.SUIVRE_ROOT
  process.env.SUIVRE_ROOT = root

  let code = 0
  try {
    await runCli(buildCli(), ['node', 'suivre', ...args])
  } catch (thrown) {
    if (!(thrown instanceof Exited)) throw thrown
    code = thrown.code
  } finally {
    if (previous === undefined) delete process.env.SUIVRE_ROOT
    else process.env.SUIVRE_ROOT = previous
    log.mockRestore()
    info.mockRestore()
    error.mockRestore()
    exit.mockRestore()
  }
  return { code, out: out.join('\n'), err: err.join('\n') }
}

async function board(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'suivre-cli-'))
  const { code } = await suivre(root, 'init', 'Test')
  expect(code).toBe(0)
  return root
}

const taskJson = async (root: string, id: string): Promise<Record<string, unknown>> => {
  const { out } = await suivre(root, 'get', id, '--json')
  return JSON.parse(out) as Record<string, unknown>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('option values', () => {
  it('`--assignee ""` releases a ticket and leaves the board usable', async () => {
    const root = await board()
    await suivre(root, 'add', 'Ticket one')
    expect(await suivre(root, 'edit', 'task-001', '--assignee', 'kevin')).toMatchObject({ code: 0 })

    const released = await suivre(root, 'edit', 'task-001', '--assignee', '')
    expect(released.code).toBe(0)
    expect(await taskJson(root, 'task-001')).not.toHaveProperty('assignee')

    const listed = await suivre(root, 'list')
    expect(listed.code).toBe(0)
    expect(listed.out).toContain('task-001')
    expect((await suivre(root, 'next')).out).toContain('task-001')
  })

  it('keeps a numeric option value as text', async () => {
    const root = await board()
    await suivre(root, 'add', 'Ticket one')
    await suivre(root, 'edit', 'task-001', '--assignee', '42')
    expect(await taskJson(root, 'task-001')).toMatchObject({ assignee: '42' })
  })

  it('clears parent, priority and depends on an empty value', async () => {
    const root = await board()
    await suivre(root, 'add', 'Ticket one')
    await suivre(
      root,
      'edit',
      'task-001',
      '--parent',
      'task-000',
      '--priority',
      'urgent',
      '--depends',
      'task-002',
    )
    expect(await taskJson(root, 'task-001')).toMatchObject({
      parent: 'task-000',
      priority: 'urgent',
      depends: ['task-002'],
    })

    await suivre(root, 'edit', 'task-001', '--parent', '', '--priority', '', '--depends', '')
    const cleared = await taskJson(root, 'task-001')
    expect(cleared).not.toHaveProperty('parent')
    expect(cleared).not.toHaveProperty('priority')
    expect(cleared).toMatchObject({ depends: [] })
  })

  it('never fabricates a dependency out of an empty value', async () => {
    const root = await board()
    await suivre(root, 'add', 'Ticket one', '--depends', '')
    expect(await taskJson(root, 'task-001')).toMatchObject({ depends: [] })
  })

  it('renders an enum typo as one readable line', async () => {
    const root = await board()
    const result = await suivre(root, 'add', 'Ticket one', '--priority', 'nope')
    expect(result.code).toBe(1)
    expect(result.err).toBe('error: --priority nope — expected one of: low, medium, high, urgent')
  })
})

describe('free text', () => {
  it('creates a ticket whose body starts with a checkbox', async () => {
    const root = await board()
    const body = '## Acceptance criteria\n\n- [ ] repro the failure\n- [ ] fix it'
    const created = await suivre(root, 'add', 'Rate-limit the export', '--body', body)
    expect(created.code).toBe(0)
    expect(created.out).toContain('task-001')
    expect(await taskJson(root, 'task-001')).toMatchObject({ body })
  })

  it('comments text that starts with a dash', async () => {
    const root = await board()
    await suivre(root, 'add', 'Ticket one')
    const commented = await suivre(root, 'comment', 'task-001', '- fix the export first')
    expect(commented.code).toBe(0)
    const { body } = await taskJson(root, 'task-001')
    expect(body).toContain('- fix the export first')
  })

  it('takes text verbatim after `--`', async () => {
    const root = await board()
    await suivre(root, 'add', 'Ticket one')
    await suivre(root, 'comment', 'task-001', '--', '--json is literal here')
    expect(await taskJson(root, 'task-001')).toMatchObject({
      body: expect.stringContaining('--json is literal here') as unknown as string,
    })
  })

  it('still reports a mistyped option instead of swallowing it', async () => {
    const root = await board()
    await suivre(root, 'add', 'Ticket one')
    const result = await suivre(root, 'comment', 'task-001', 'ok', '--athor', 'me')
    expect(result.code).toBe(1)
    expect(result.err).toContain('Unknown option `--athor`')
  })

  it('reports a value-taking option left empty', async () => {
    const root = await board()
    const result = await suivre(root, 'list', '--status')
    expect(result.code).toBe(1)
    expect(result.err).toContain('value is missing')
  })
})

describe('list', () => {
  it('reads repeated --label as an AND', async () => {
    const root = await board()
    await suivre(root, 'add', 'Both', '--label', 'a', '--label', 'b')
    await suivre(root, 'add', 'One', '--label', 'a')

    const both = await suivre(root, 'list', '--label', 'a', '--label', 'b')
    expect(both.code).toBe(0)
    expect(both.out).toContain('task-001')
    expect(both.out).not.toContain('task-002')
    expect((await suivre(root, 'list', '--label', 'a')).out).toContain('task-002')
  })

  it('reports a file it could not parse instead of dropping it silently', async () => {
    const root = await board()
    await suivre(root, 'add', 'Ticket one')
    await writeFile(
      join(root, '.suivre', 'tasks', 'task-002-broken.md'),
      '---\nid: task-002\n---\n',
    )

    const result = await suivre(root, 'list')
    expect(result.code).toBe(0)
    expect(result.out).toContain('task-001')
    expect(result.err).toContain('task-002-broken.md')
  })
})

describe('--json', () => {
  it('covers rm, init and show', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suivre-cli-'))
    const initialized = await suivre(root, 'init', 'Test', '--json')
    expect(initialized.code).toBe(0)
    expect(JSON.parse(initialized.out)).toMatchObject({ name: 'Test' })

    await suivre(root, 'add', 'Ticket one')
    const removed = await suivre(root, 'rm', 'task-001', '--json')
    expect(removed.code).toBe(0)
    expect(JSON.parse(removed.out)).toEqual({ id: 'task-001', deleted: true })

    if (process.platform === 'darwin') return
    const shown = await suivre(root, 'show', 'board', '--json')
    expect(shown.code).toBe(0)
    expect(JSON.parse(shown.out)).toMatchObject({ url: 'suivre://show?view=board' })
  })
})

describe('board resolution', () => {
  it('follows the ancestor holding the backlog', async () => {
    const root = await board()
    await suivre(root, 'add', 'From the root')
    const deep = join(root, 'sub', 'deep')
    await mkdir(deep, { recursive: true })

    const listed = await suivre(deep, 'list')
    expect(listed.code).toBe(0)
    expect(listed.out).toContain('From the root')

    process.env.SUIVRE_ROOT = deep
    try {
      expect(commandRoot()).toBe(root)
      expect(() => initRoot(false)).toThrow(/Backlog already initialized/)
      expect(initRoot(true)).toBe(deep)
    } finally {
      delete process.env.SUIVRE_ROOT
    }
  })

  it('refuses to nest a second backlog', async () => {
    const root = await board()
    const deep = join(root, 'sub')
    await mkdir(deep, { recursive: true })

    const nested = await suivre(deep, 'init', 'Nested')
    expect(nested.code).toBe(1)
    expect(nested.err).toContain('Backlog already initialized at')
    await expect(readFile(join(deep, '.suivre', 'config.yml'))).rejects.toThrow()
  })

  it('re-initializing in place stays allowed', async () => {
    const root = await board()
    expect((await suivre(root, 'init', 'Test')).code).toBe(0)
  })
})

describe('a repo without a board', () => {
  it('refuses every collection command and writes nothing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'suivre-cli-'))
    for (const args of [
      ['sprint', 'list'],
      ['sprint', 'create', 'Effort'],
      ['doc', 'create', 'Spec'],
      ['decision', 'create', 'ADR'],
      ['list'],
    ]) {
      const result = await suivre(root, ...args)
      expect(result.code, args.join(' ')).toBe(1)
      expect(result.err).toContain('Backlog not initialized')
    }
    await expect(readFile(join(root, '.suivre', 'config.yml'))).rejects.toThrow()
  })
})

describe('help and version', () => {
  it('lists a group’s subcommands', async () => {
    const root = await board()
    for (const args of [['sprint'], ['sprint', '--help'], ['doc']]) {
      const result = await suivre(root, ...args)
      expect(result.code, args.join(' ')).toBe(0)
      expect(result.out).toContain('Commands:')
      expect(result.out).toContain(`${args[0]!} list`)
    }
  })

  it('prints the version instead of the help', async () => {
    const root = await board()
    const result = await suivre(root, '--version')
    expect(result.code).toBe(0)
    expect(result.out).toContain('0.0.0-test')
    expect(result.out).not.toContain('Commands:')
  })

  it('fails loudly on an unknown command', async () => {
    const root = await board()
    const result = await suivre(root, 'bogus')
    expect(result.code).toBe(1)
    expect(result.err).toBe('error: unknown command "bogus"')
  })
})

describe('sprint progress', () => {
  it('measures against the board’s final column', async () => {
    const root = await board()
    await suivre(root, 'add', 'One')
    await suivre(root, 'add', 'Two')
    await suivre(root, 'sprint', 'create', 'Effort', '--item', 'task-001', '--item', 'task-002')
    await suivre(root, 'done', 'task-001')

    const { code, out } = await suivre(root, 'sprint', 'get', 'sprint-001', '--json')
    expect(code).toBe(0)
    expect(JSON.parse(out)).toMatchObject({ progress: { done: 1, total: 2 } })
  })

  it('reports a missing sprint as not found', async () => {
    const root = await board()
    const result = await suivre(root, 'sprint', 'get', 'sprint-404')
    expect(result.code).toBe(1)
    expect(result.err).toBe('error: Sprint not found: sprint-404')
  })
})
