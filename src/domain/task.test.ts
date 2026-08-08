import { describe, expect, it } from 'vitest'
import { createTask, editTask, moveTask } from './task'
import { boardConfigSchema } from './schema'

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
