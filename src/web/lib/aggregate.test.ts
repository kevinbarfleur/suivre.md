import { describe, expect, it } from 'vitest'
import type { Column, Task } from '../../domain'
import { blockedTasks, finalColumnId, highImpact, oldestOpen, parentGroups } from './aggregate'

// A board whose final column is NOT called "done" — the whole point of A16.
const columns: Column[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'doing', label: 'Doing' },
  { id: 'shipped', label: 'Shipped' },
]

function task(id: string, over: Partial<Task['frontmatter']> = {}, body = ''): Task {
  return {
    frontmatter: {
      id,
      title: `Title ${id}`,
      status: 'inbox',
      labels: [],
      depends: [],
      order: 'a0',
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-01-01T00:00:00.000Z',
      ...over,
    },
    body,
    fileName: `${id}.md`,
  }
}

describe('finalColumnId', () => {
  it('is the last column, whatever it is named', () => {
    expect(finalColumnId(columns)).toBe('shipped')
  })

  it('is null when the board has no column', () => {
    expect(finalColumnId([])).toBeNull()
  })
})

describe('oldestOpen', () => {
  it('leaves out the tasks in the final column', () => {
    const tasks = [
      task('task-1', { status: 'shipped', created: '2026-01-01T00:00:00.000Z' }),
      task('task-2', { status: 'doing', created: '2026-02-01T00:00:00.000Z' }),
    ]
    expect(oldestOpen(tasks, columns).map((f) => f.id)).toEqual(['task-2'])
  })
})

describe('blockedTasks', () => {
  it('resolves a dependency sitting in the final column', () => {
    const tasks = [
      task('task-1', { status: 'shipped' }),
      task('task-2', { status: 'doing', depends: ['task-1'] }),
    ]
    expect(blockedTasks(tasks, columns)).toEqual([])
  })

  it('resolves a dependency that left the board (archived or deleted)', () => {
    const tasks = [task('task-2', { status: 'doing', depends: ['task-gone'] })]
    expect(blockedTasks(tasks, columns)).toEqual([])
  })

  it('resolves an archived dependency still present in the payload', () => {
    const tasks = [
      task('task-1', { status: 'archived' }),
      task('task-2', { status: 'doing', depends: ['task-1'] }),
    ]
    expect(blockedTasks(tasks, columns)).toEqual([])
  })

  it('reports an unfinished blocker with its column label', () => {
    const tasks = [
      task('task-1', { status: 'doing' }),
      task('task-2', { status: 'inbox', depends: ['task-1'] }),
    ]
    expect(blockedTasks(tasks, columns)).toEqual([
      {
        id: 'task-2',
        title: 'Title task-2',
        blockers: [{ id: 'task-1', statusLabel: 'Doing', resolved: false }],
      },
    ])
  })

  it('skips a task already in the final column', () => {
    const tasks = [
      task('task-1', { status: 'doing' }),
      task('task-2', { status: 'shipped', depends: ['task-1'] }),
    ]
    expect(blockedTasks(tasks, columns)).toEqual([])
  })
})

describe('highImpact', () => {
  it('counts only open dependents of open tasks', () => {
    const tasks = [
      task('task-1', { status: 'doing' }),
      task('task-2', { status: 'inbox', depends: ['task-1'] }),
      task('task-3', { status: 'shipped', depends: ['task-1'] }),
    ]
    expect(highImpact(tasks, columns)).toEqual([{ id: 'task-1', title: 'Title task-1', count: 1 }])
  })

  it('drops a blocker that reached the final column', () => {
    const tasks = [
      task('task-1', { status: 'shipped' }),
      task('task-2', { status: 'inbox', depends: ['task-1'] }),
    ]
    expect(highImpact(tasks, columns)).toEqual([])
  })
})

describe('parentGroups', () => {
  it('counts progress against the final column', () => {
    const tasks = [
      task('task-1', { status: 'inbox' }),
      task('task-2', { status: 'shipped', parent: 'task-1' }),
      task('task-3', { status: 'doing', parent: 'task-1' }),
    ]
    const [group] = parentGroups(tasks, columns)
    expect(group?.done).toBe(1)
    expect(group?.total).toBe(2)
    expect(group?.children.map((c) => c.done)).toEqual([true, false])
  })
})
