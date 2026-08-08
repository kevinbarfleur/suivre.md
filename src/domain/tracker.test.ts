import { describe, expect, it } from 'vitest'
import { appendComment, filterTasks, isDependencyResolved, isReady, nextReady } from './tracker'
import { createTask } from './task'
import { slugify, taskFileName } from './ids'
import { boardConfigSchema } from './schema'
import type { Task } from './types'

const config = boardConfigSchema.parse({
  name: 'T',
  columns: [
    { id: 'todo', label: 'To do' },
    { id: 'doing', label: 'In progress' },
    { id: 'done', label: 'Done' },
  ],
})

function task(id: string, overrides: Partial<Task['frontmatter']> = {}, body = ''): Task {
  const base = createTask(
    { title: id },
    { config, existingIds: [], lastOrderInColumn: null, now: '2026-01-01T00:00:00Z' },
  )
  return { ...base, body, frontmatter: { ...base.frontmatter, id, ...overrides } }
}

describe('appendComment', () => {
  it('creates the section on the first comment', () => {
    const body = appendComment('## Description\n\nText.', {
      text: 'First note',
      author: 'claude',
      at: '2026-08-08T10:00:00Z',
    })
    expect(body).toBe(
      '## Description\n\nText.\n\n## Comments\n\n### 2026-08-08T10:00:00Z — claude\n\nFirst note\n',
    )
  })

  it('appends under the existing section, no author', () => {
    const first = appendComment('', { text: 'a', at: 't1' })
    const second = appendComment(first, { text: 'b', at: 't2' })
    expect(second).toBe('## Comments\n\n### t1\n\na\n\n### t2\n\nb\n')
  })

  it('ignores a heading quoted inside a fenced block', () => {
    const body = '## Description\n\n```md\n## Comments\n```'
    expect(appendComment(body, { text: 'x', at: 't1' })).toBe(
      '## Description\n\n```md\n## Comments\n```\n\n## Comments\n\n### t1\n\nx\n',
    )
  })

  it('still sees the real heading after a closed fence', () => {
    const body = '~~~\n## Comments\n~~~\n\n## Comments\n\n### t0\n\na'
    expect(appendComment(body, { text: 'b', at: 't1' })).toBe(`${body}\n\n### t1\n\nb\n`)
  })
})

describe('isReady / nextReady', () => {
  it('excludes the final column, assigned and blocked tasks', () => {
    const done = task('task-001', { status: 'done' })
    const claimed = task('task-002', { assignee: 'kevin' })
    const blocked = task('task-003', { depends: ['task-002'] })
    const free = task('task-004')
    const tasks = [done, claimed, blocked, free]
    expect(isReady(done, tasks, config)).toBe(false)
    expect(isReady(claimed, tasks, config)).toBe(false)
    expect(isReady(blocked, tasks, config)).toBe(false)
    expect(isReady(free, tasks, config)).toBe(true)
  })

  it('resolves a done or missing dependency', () => {
    const dep = task('task-001', { status: 'done' })
    const t = task('task-002', { depends: ['task-001', 'task-999'] })
    expect(isReady(t, [dep, t], config)).toBe(true)
  })

  it('sprint frontier: first ready item in sprint order', () => {
    const a = task('task-001', { status: 'done' })
    const b = task('task-002', { depends: ['task-003'] })
    const c = task('task-003')
    const tasks = [a, b, c]
    const next = nextReady(tasks, config, ['task-001', 'task-002', 'task-003'])
    expect(next?.frontmatter.id).toBe('task-003')
  })

  it('never hands out an archived task', () => {
    const archived = task('task-001', { status: 'archived' })
    const free = task('task-002')
    const tasks = [archived, free]
    expect(isReady(archived, tasks, config)).toBe(false)
    expect(nextReady(tasks, config)?.frontmatter.id).toBe('task-002')
    expect(nextReady(tasks, config, ['task-001'])).toBeNull()
  })

  it('an archived dependency stops blocking its dependents', () => {
    const dep = task('task-001', { status: 'archived' })
    const t = task('task-002', { depends: ['task-001'] })
    expect(isDependencyResolved('task-001', [dep, t], 'done')).toBe(true)
    expect(isReady(t, [dep, t], config)).toBe(true)
  })

  it('reads the final column from the config, not from the name "done"', () => {
    const renamed = boardConfigSchema.parse({
      name: 'T',
      columns: [
        { id: 'inbox', label: 'Inbox' },
        { id: 'shipped', label: 'Shipped' },
      ],
    })
    const dep = task('task-001', { status: 'shipped' })
    const t = task('task-002', { depends: ['task-001'], status: 'inbox' })
    expect(isReady(dep, [dep, t], renamed)).toBe(false)
    expect(isReady(t, [dep, t], renamed)).toBe(true)
  })
})

describe('filterTasks', () => {
  it('filters by status/label/assignee and sorts by column then rank', () => {
    const a = task('task-001', { status: 'doing', labels: ['bug'] })
    const b = task('task-002', { status: 'todo', labels: ['bug'], assignee: 'kevin' })
    const c = task('task-003', { status: 'todo' })
    const tasks = [a, b, c]
    expect(filterTasks(tasks, config, { label: 'bug' }).map((t) => t.frontmatter.id)).toEqual([
      'task-002',
      'task-001',
    ])
    expect(filterTasks(tasks, config, { assignee: 'kevin' })).toHaveLength(1)
    expect(filterTasks(tasks, config, { status: 'doing' })).toHaveLength(1)
  })

  it('leaves archived tasks out unless they are asked for by status', () => {
    const live = task('task-001', { status: 'todo' })
    const archived = task('task-002', { status: 'archived' })
    const tasks = [live, archived]
    expect(filterTasks(tasks, config, {}).map((t) => t.frontmatter.id)).toEqual(['task-001'])
    expect(filterTasks(tasks, config, { ready: true }).map((t) => t.frontmatter.id)).toEqual([
      'task-001',
    ])
    expect(filterTasks(tasks, config, { status: 'archived' }).map((t) => t.frontmatter.id)).toEqual(
      ['task-002'],
    )
  })
})

describe('slugify', () => {
  it('keeps letters and digits of any script', () => {
    expect(slugify('日本語のタスク')).toBe('日本語のタスク')
    expect(taskFileName('task-004', '日本語のタスク')).toBe('task-004-日本語のタスク.md')
    expect(slugify('Тестовая задача')).toBe('тестовая-задача')
  })

  it('distinguishes two non-latin titles', () => {
    expect(slugify('タスク一')).not.toBe(slugify('タスク二'))
  })

  it('folds latin diacritics and separators', () => {
    expect(slugify('Créer le café !')).toBe('creer-le-cafe')
  })

  it('trims after truncating, never leaving a trailing dash', () => {
    const title = `${'a'.repeat(60)} tail`
    expect(slugify(title)).toBe('a'.repeat(60))
    expect(slugify(`${'b'.repeat(59)} tail`)).toBe('b'.repeat(59))
  })

  it('falls back when nothing is left', () => {
    expect(slugify('!!! ???')).toBe('task')
  })
})
