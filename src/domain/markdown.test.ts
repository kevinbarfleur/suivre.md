import { describe, expect, it } from 'vitest'
import { parseTask, serializeTask } from './markdown'
import type { Task } from './types'

const sample: Task = {
  frontmatter: {
    id: 'task-001',
    title: 'Titre de la tâche',
    status: 'todo',
    priority: 'high',
    labels: ['ui', 'bug'],
    order: 'a0',
    depends: [],
    created: '2026-07-20T10:00:00Z',
    updated: '2026-07-20T10:00:00Z',
  },
  body: '## Description\n\nUn corps.',
  fileName: 'task-001-titre-de-la-tache.md',
}

describe('markdown', () => {
  it('round-trip parse ∘ serialize stable', () => {
    const raw = serializeTask(sample)
    const parsed = parseTask(raw, sample.fileName)
    expect(parsed.frontmatter).toEqual(sample.frontmatter)
    expect(parsed.body).toBe(sample.body)
  })

  it('omet les optionnels absents et les tableaux vides', () => {
    const raw = serializeTask(sample)
    expect(raw).not.toContain('assignee')
    expect(raw).not.toContain('parent')
    expect(raw).not.toContain('depends')
  })

  it('lève sans frontmatter', () => {
    expect(() => parseTask('juste du texte', 'x.md')).toThrow()
  })

  it('lève sur un frontmatter invalide (titre manquant)', () => {
    const bad = '---\nid: task-1\nstatus: todo\norder: a0\ncreated: x\nupdated: x\n---\n'
    expect(() => parseTask(bad, 'x.md')).toThrow()
  })
})
