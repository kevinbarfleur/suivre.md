import { describe, expect, it } from 'vitest'
import { createTask, editTask, moveTask } from './task'
import { boardConfigSchema, DEFAULT_COLUMNS } from './schema'

const config = boardConfigSchema.parse({
  name: 'T',
  columns: [
    { id: 'todo', label: 'To do' },
    { id: 'done', label: 'Done' },
  ],
})

describe('createTask', () => {
  it('increments the id, defaults to the first column, names the file', () => {
    const task = createTask(
      { title: 'Make coffee' },
      {
        config,
        existingIds: ['task-001', 'task-002'],
        lastOrderInColumn: null,
        now: '2026-07-20T00:00:00Z',
      },
    )
    expect(task.frontmatter.id).toBe('task-003')
    expect(task.frontmatter.status).toBe('todo')
    expect(task.fileName).toBe('task-003-make-coffee.md')
    expect(task.frontmatter.created).toBe('2026-07-20T00:00:00Z')
    expect(task.frontmatter.order.length).toBeGreaterThan(0)
  })
})

describe('editTask', () => {
  it('bumps updated and renames the file when the title changes', () => {
    const task = createTask(
      { title: 'Old' },
      { config, existingIds: [], lastOrderInColumn: null, now: 'a' },
    )
    const edited = editTask(task, { title: 'New name', priority: 'high' }, 'b')
    expect(edited.frontmatter.updated).toBe('b')
    expect(edited.frontmatter.priority).toBe('high')
    expect(edited.fileName).toBe('task-001-new-name.md')
  })
})

describe('frontmatter revalidation', () => {
  const base = createTask(
    { title: 'Base' },
    { config, existingIds: [], lastOrderInColumn: null, now: 'a' },
  )

  // `--assignee ""` is coerced to the number 0 by the CLI parser: written as-is
  // it made every later read of the file fail.
  it('rejects a non-string assignee instead of writing it', () => {
    expect(() => editTask(base, { assignee: 0 as unknown as string }, 'b')).toThrow(/assignee/)
  })

  it('rejects an empty title', () => {
    expect(() => editTask(base, { title: '' }, 'b')).toThrow(/title/)
  })

  it('names the task in the error', () => {
    expect(() => editTask(base, { assignee: 0 as unknown as string }, 'b')).toThrow(
      /Invalid task task-001/,
    )
  })

  it('rejects garbage at creation time too', () => {
    expect(() =>
      createTask(
        { title: 'X', labels: 'ui' as unknown as string[] },
        {
          config,
          existingIds: [],
          lastOrderInColumn: null,
          now: 'a',
        },
      ),
    ).toThrow(/labels/)
  })

  it('drops unknown fields rather than serializing them', () => {
    const edited = editTask(base, { nope: 1 } as never, 'b')
    expect(edited.frontmatter).not.toHaveProperty('nope')
  })

  it('still unassigns with an explicit undefined', () => {
    const assigned = editTask(base, { assignee: 'kevin' }, 'b')
    const cleared = editTask(assigned, { assignee: undefined }, 'c')
    expect(cleared.frontmatter.assignee).toBeUndefined()
  })

  it('rejects a non-string body instead of crashing on body.trim', () => {
    expect(() => editTask(base, { body: 42 as unknown as string }, 'b')).toThrow(
      /Invalid task task-001: body: expected string, received number/,
    )
    expect(() =>
      createTask(
        { title: 'X', body: 42 as unknown as string },
        {
          config,
          existingIds: [],
          lastOrderInColumn: null,
          now: 'a',
        },
      ),
    ).toThrow(/body/)
  })
})

describe('boardConfigSchema', () => {
  it('rejects duplicate column ids, naming the id', () => {
    expect(() =>
      boardConfigSchema.parse({
        name: 'T',
        columns: [
          { id: 'todo', label: 'To do' },
          { id: 'todo', label: 'Again' },
        ],
      }),
    ).toThrow(/Duplicate column id: todo/)
  })

  it('rejects a column named `archived` (reserved status)', () => {
    expect(() =>
      boardConfigSchema.parse({
        name: 'T',
        columns: [
          { id: 'todo', label: 'To do' },
          { id: 'archived', label: 'Archived' },
        ],
      }),
    ).toThrow(/archived/)
  })

  it('accepts the default columns', () => {
    expect(() => boardConfigSchema.parse({ name: 'T', columns: DEFAULT_COLUMNS })).not.toThrow()
  })
})

describe('moveTask', () => {
  it('changes the status and the rank', () => {
    const task = createTask(
      { title: 'X' },
      { config, existingIds: [], lastOrderInColumn: null, now: 'a' },
    )
    const moved = moveTask(task, 'done', 'zzz', 'b')
    expect(moved.frontmatter.status).toBe('done')
    expect(moved.frontmatter.order).toBe('zzz')
  })
})
