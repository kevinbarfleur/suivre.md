import { existsSync } from 'node:fs'
import { mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { withBoard } from './harness'
import type { Board } from './harness'

/**
 * Defects that shipped once. Each one is reproduced against the built CLI on a
 * real board — the surface where they appeared — so a regression fails here
 * rather than on a user's repo.
 */

const taskFiles = async (board: Board): Promise<string[]> =>
  (await readdir(join(board.root, '.suivre', 'tasks')))
    .filter((name) => name.endsWith('.md'))
    .sort()

/** The loop an agent runs. A corrupt board takes all four down at once. */
function expectBoardUsable(board: Board): void {
  expect(board.cli('list').status).toBe(0)
  expect(board.cli('get', 'task-001').status).toBe(0)
  expect(board.cli('next').status).toBe(0)
  expect(board.cli('add', 'Still writable').status).toBe(0)
}

describe('empty and numeric option values', () => {
  it('unassigns on `--assignee ""` and leaves every command working', async () => {
    await withBoard(async (board) => {
      expect(board.cli('add', 'Alpha', '--assignee', 'kevin').status).toBe(0)

      expect(board.cli('edit', 'task-001', '--assignee', '').status).toBe(0)

      const file = await board.read('.suivre/tasks/task-001-alpha.md')
      expect(file).not.toMatch(/^assignee:/m)
      const [task] = board.cli('list', '--json').json<{ id: string; assignee?: string }[]>()
      expect(task?.id).toBe('task-001')
      expect(task?.assignee).toBeUndefined()
      expectBoardUsable(board)
    })
  })

  it('stores every other empty or numeric value without corrupting the board', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'Alpha')
      board.cli('add', 'Beta', '--parent', 'task-001', '--depends', 'task-001', '--body', 'text')

      expect(board.cli('edit', 'task-001', '--assignee', '42').status).toBe(0)
      expect(await board.read('.suivre/tasks/task-001-alpha.md')).toContain('assignee: "42"')

      // An empty title cannot be represented: it has to be refused, never stored.
      const emptyTitle = board.cli('edit', 'task-001', '--title', '')
      expect(emptyTitle.status).toBe(1)
      expect(emptyTitle.stderr).toContain('title')

      expect(board.cli('edit', 'task-002', '--parent', '').status).toBe(0)
      expect(board.cli('edit', 'task-002', '--depends', '').status).toBe(0)
      expect(board.cli('edit', 'task-002', '--body', '').status).toBe(0)
      expect(board.cli('add', 'Gamma', '--assignee', '').status).toBe(0)

      const beta = await board.read('.suivre/tasks/task-002-beta.md')
      expect(beta).not.toMatch(/^parent:/m)
      expect(beta).not.toMatch(/^depends:/m)

      const tasks = board
        .cli('list', '--json')
        .json<{ id: string; title: string; assignee?: string; body: string }[]>()
      expect(tasks.map((task) => task.title)).toEqual(['Alpha', 'Beta', 'Gamma'])
      expect(tasks[0]?.assignee).toBe('42')
      expect(tasks[1]?.body).toBe('')
      expect(tasks[2]?.assignee).toBeUndefined()
      expectBoardUsable(board)
    })
  })
})

describe('an unparseable file in .suivre/tasks/', () => {
  it('is reported by name on stderr and stops neither list, add nor next', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'Alpha')
      await board.write('.suivre/tasks/README.md', '# Notes\n\nHow this backlog works.\n')
      await board.write('.suivre/tasks/bom.md', '\uFEFFid: task-900\nnot frontmatter at all\n')
      await board.write(
        '.suivre/tasks/conflict.md',
        [
          '---',
          '<<<<<<< HEAD',
          'id: task-901',
          '=======',
          'id: task-902',
          '>>>>>>> other',
          'title: Conflicted',
          'status: backlog',
          'order: a0',
          'created: 2026-01-01T00:00:00Z',
          'updated: 2026-01-01T00:00:00Z',
          '---',
          '',
          'body',
          '',
        ].join('\n'),
      )

      const list = board.cli('list')
      expect(list.status).toBe(0)
      for (const name of ['README.md', 'bom.md', 'conflict.md']) expect(list.stderr).toContain(name)
      expect(list.stdout).toContain('task-001')

      expect(board.cli('add', 'Beta').status).toBe(0)
      expect(board.cli('next').status).toBe(0)
      expect(board.cli('list', '--json').json<unknown[]>()).toHaveLength(2)
    })
  })

  it('does not swallow a task file that merely carries a BOM', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'Alpha')
      const raw = await board.read('.suivre/tasks/task-001-alpha.md')
      await board.write('.suivre/tasks/task-001-alpha.md', `\uFEFF${raw}`)

      const list = board.cli('list')
      expect(list.status).toBe(0)
      expect(list.stderr).toBe('')
      expect(list.stdout).toContain('task-001')
    })
  })
})

describe('id allocation', () => {
  it('never hands out an id again, after --archive or after rm', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'One')
      board.cli('add', 'Two')
      board.cli('add', 'Three')

      expect(board.cli('done', 'task-003', '--archive').status).toBe(0)
      expect(board.cli('add', 'Four', '--json').json<{ id: string }>().id).toBe('task-004')

      expect(board.cli('rm', 'task-004').status).toBe(0)
      expect(board.cli('add', 'Five', '--json').json<{ id: string }>().id).toBe('task-005')

      expect(await taskFiles(board)).toEqual([
        'task-001-one.md',
        'task-002-two.md',
        'task-005-five.md',
      ])
    })
  })

  it('refuses to overwrite an occupied archive entry', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'Alpha')
      await mkdir(join(board.root, '.suivre', 'tasks', 'archive'), { recursive: true })
      const occupant = [
        '---',
        'id: task-001',
        'title: Alpha',
        'status: archived',
        'order: a0',
        'created: 2026-01-01T00:00:00Z',
        'updated: 2026-01-01T00:00:00Z',
        '---',
        '',
        'ORIGINAL ARCHIVED COPY',
        '',
      ].join('\n')
      await board.write('.suivre/tasks/archive/task-001-alpha.md', occupant)

      const done = board.cli('done', 'task-001', '--archive')
      expect(done.status).toBe(1)
      expect(done.stderr).toContain('task-001')

      expect(await board.read('.suivre/tasks/archive/task-001-alpha.md')).toBe(occupant)
      // The close itself landed — only the archiving was refused.
      expect(await board.read('.suivre/tasks/task-001-alpha.md')).toContain('status: done')
    })
  })
})

it('takes an archived task off the ready frontier and unblocks its dependents', async () => {
  await withBoard(async (board) => {
    board.cli('add', 'Blocker')
    board.cli('add', 'Dependent', '--depends', 'task-001')
    expect(board.cli('next', '--json').json<{ id: string }>().id).toBe('task-001')

    expect(board.cli('edit', 'task-001', '--status', 'archived').status).toBe(0)

    expect(board.cli('next', '--json').json<{ id: string }>().id).toBe('task-002')
    const ids = (run: { json: <T>() => T }): string[] =>
      run.json<{ id: string }[]>().map((task) => task.id)
    expect(ids(board.cli('list', '--ready', '--json'))).toEqual(['task-002'])
    expect(ids(board.cli('list', '--json'))).toEqual(['task-002'])
    // Off the board, not lost: `--status archived` is the way back to it.
    expect(ids(board.cli('list', '--status', 'archived', '--json'))).toEqual(['task-001'])
  })
})

describe('ticket text that starts with a dash', () => {
  it('is written verbatim instead of printing help and exiting 0', async () => {
    await withBoard(async (board) => {
      const add = board.cli('add', 'Dash body', '--body', '- [ ] repro')
      expect(add.status).toBe(0)
      expect(add.stdout).not.toContain('Usage:')
      expect(await board.read('.suivre/tasks/task-001-dash-body.md')).toContain('- [ ] repro')

      const comment = board.cli('comment', 'task-001', '- [ ] follow-up')
      expect(comment.status).toBe(0)
      expect(comment.stdout).not.toContain('Usage:')
      expect(await board.read('.suivre/tasks/task-001-dash-body.md')).toContain('- [ ] follow-up')
    })
  })

  it('survives the zsh heredoc form the adapter documents', async () => {
    await withBoard(async (board) => {
      const run = board.sh(
        `suivre add "Heredoc" --body "$(cat <<'MD'
- [ ] first
- [ ] second
MD
)"`,
        'zsh',
      )
      expect(run.status, run.stderr).toBe(0)
      expect(run.stdout).not.toContain('Usage:')
      const file = await board.read('.suivre/tasks/task-001-heredoc.md')
      expect(file).toContain('- [ ] first')
      expect(file).toContain('- [ ] second')
    })
  })
})

describe('a board whose columns were renamed', () => {
  const RENAMED = [
    'name: Renamed',
    'taskPrefix: task',
    'columns:',
    '  - id: inbox',
    '    label: Inbox',
    '  - id: building',
    '    label: Building',
    '  - id: shipped',
    '    label: Shipped',
    '',
  ].join('\n')

  it('closes into the last configured column and measures sprint progress against it', async () => {
    await withBoard(async (board) => {
      await board.write('.suivre/config.yml', RENAMED)
      board.cli('add', 'One')
      board.cli('add', 'Two')
      expect(board.cli('add', 'Three', '--status', 'building').status).toBe(0)
      expect(
        board.cli('sprint', 'create', 'S1', '--item', 'task-001', '--item', 'task-002').status,
      ).toBe(0)

      expect(board.cli('done', 'task-001', '--json').json<{ status: string }>().status).toBe(
        'shipped',
      )

      const sprint = board
        .cli('sprint', 'get', 'sprint-001', '--json')
        .json<{ progress: { done: number; total: number } }>()
      expect(sprint.progress).toEqual({ done: 1, total: 2 })
    })
  })

  it('rejects an unknown status with the valid ids in the message', async () => {
    await withBoard(async (board) => {
      await board.write('.suivre/config.yml', RENAMED)
      board.cli('add', 'One')

      const rejected = [
        board.cli('move', 'task-001', 'done'),
        board.cli('add', 'Two', '--status', 'done'),
        board.cli('edit', 'task-001', '--status', 'done'),
      ]
      for (const run of rejected) {
        expect(run.status).toBe(1)
        for (const id of ['inbox', 'building', 'shipped']) expect(run.stderr).toContain(id)
      }
      expect(await taskFiles(board)).toEqual(['task-001-one.md'])
      expect(board.cli('list', '--json').json<{ status: string }[]>()[0]?.status).toBe('inbox')
    })
  })
})

it('acts on the repo board from a subdirectory, and refuses to nest a second one', async () => {
  await withBoard(async (board) => {
    board.cli('add', 'Alpha')
    const deep = join(board.root, 'packages', 'app', 'src')
    await mkdir(deep, { recursive: true })

    const list = board.cliIn(deep, 'list')
    expect(list.status).toBe(0)
    expect(list.stdout).toContain('task-001')
    expect(board.cliIn(deep, 'add', 'From a subdirectory').status).toBe(0)
    expect(await taskFiles(board)).toEqual(['task-001-alpha.md', 'task-002-from-a-subdirectory.md'])

    const init = board.cliIn(deep, 'init', 'nested')
    expect(init.status).toBe(1)
    expect(init.stderr).toMatch(/already initialized/i)
    expect(existsSync(join(deep, '.suivre'))).toBe(false)
  })
})
