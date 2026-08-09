import { describe, expect, it } from 'vitest'
import { NO_PRIORITY, useFilter } from './filter.store'
import type { Task } from '../../../domain'

function task(id: string, frontmatter: Partial<Task['frontmatter']> = {}): Task {
  return {
    frontmatter: {
      id,
      title: id,
      status: 'todo',
      labels: [],
      depends: [],
      order: 'a0',
      created: '2026-01-01T00:00:00Z',
      updated: '2026-01-01T00:00:00Z',
      ...frontmatter,
    },
    body: '',
    fileName: `${id}.md`,
  }
}

describe('priority filter', () => {
  const { priority, matches, clear } = useFilter()

  it('distinguishes "no filter" from "has no priority"', () => {
    const withPriority = task('task-001', { priority: 'high' })
    const without = task('task-002')

    clear()
    expect(matches(withPriority)).toBe(true)
    expect(matches(without)).toBe(true)

    priority.value = NO_PRIORITY
    expect(matches(withPriority)).toBe(false)
    expect(matches(without)).toBe(true)

    priority.value = 'high'
    expect(matches(withPriority)).toBe(true)
    expect(matches(without)).toBe(false)

    clear()
  })
})
