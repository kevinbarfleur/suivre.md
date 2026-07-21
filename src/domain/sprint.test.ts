import { describe, expect, it } from 'vitest'
import { parseSprint, resolveSprint, serializeSprint } from './sprint'
import type { Task } from './types'

function task(id: string, status: string, parent?: string): Task {
  return {
    frontmatter: {
      id,
      title: id,
      status,
      order: 'a',
      labels: [],
      depends: [],
      created: 'n',
      updated: 'n',
      ...(parent ? { parent } : {}),
    },
    body: '',
    fileName: `${id}.md`,
  }
}

describe('sprint', () => {
  it('round-trips frontmatter incl. ordered items', () => {
    const raw =
      '---\nid: sprint-001\ntitle: V1\nstatus: active\nitems:\n  - task-002\n  - task-001\ncreated: n\nupdated: n\n---\ngoal'
    const s = parseSprint(raw, 'sprint-001.md')
    expect(s.frontmatter.items).toEqual(['task-002', 'task-001'])
    const again = parseSprint(serializeSprint(s), 'sprint-001.md')
    expect(again.frontmatter).toEqual(s.frontmatter)
    expect(again.body.trim()).toBe('goal')
  })

  it('resolves steps in order with progress, subtasks and current index', () => {
    const tasks = [
      task('t1', 'done'),
      task('t2', 'test'),
      task('sub', 'doing', 't2'),
      task('t3', 'todo'),
    ]
    const r = resolveSprint(['t1', 't2', 't3'], tasks)
    expect(r.total).toBe(3)
    expect(r.done).toBe(1)
    expect(r.currentIndex).toBe(1) // t2 is the first not-done step
    expect(r.steps.map((s) => s.id)).toEqual(['t1', 't2', 't3'])
    expect(r.steps[1]!.subtasks.map((s) => s.id)).toEqual(['sub'])
    expect(r.steps[1]!.subtasks[0]!.done).toBe(false)
  })

  it('flags missing (deleted) tasks', () => {
    const r = resolveSprint(['ghost'], [])
    expect(r.steps[0]!.task).toBeNull()
    expect(r.steps[0]!.done).toBe(false)
  })

  it('all done → currentIndex -1', () => {
    const r = resolveSprint(['t1'], [task('t1', 'done')])
    expect(r.currentIndex).toBe(-1)
    expect(r.done).toBe(1)
  })
})
