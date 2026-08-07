import { describe, expect, it } from 'vitest'
import { appendComment, filterTasks, isReady, nextReady } from './tracker'
import { createTask } from './task'
import { boardConfigSchema } from './schema'
import type { Task } from './types'

const config = boardConfigSchema.parse({
  name: 'T',
  columns: [
    { id: 'todo', label: 'À faire' },
    { id: 'doing', label: 'En cours' },
    { id: 'done', label: 'Fait' },
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
  it('crée la section au premier commentaire', () => {
    const body = appendComment('## Description\n\nTexte.', {
      text: 'Premier retour',
      author: 'claude',
      at: '2026-08-08T10:00:00Z',
    })
    expect(body).toBe(
      '## Description\n\nTexte.\n\n## Comments\n\n### 2026-08-08T10:00:00Z — claude\n\nPremier retour\n',
    )
  })

  it('appende sous la section existante, sans auteur', () => {
    const first = appendComment('', { text: 'a', at: 't1' })
    const second = appendComment(first, { text: 'b', at: 't2' })
    expect(second).toBe('## Comments\n\n### t1\n\na\n\n### t2\n\nb\n')
  })
})

describe('isReady / nextReady', () => {
  it('exclut la colonne finale, les assignées et les bloquées', () => {
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

  it('résout une dépendance done ou disparue', () => {
    const dep = task('task-001', { status: 'done' })
    const t = task('task-002', { depends: ['task-001', 'task-999'] })
    expect(isReady(t, [dep, t], config)).toBe(true)
  })

  it('frontier de sprint : premier item ready dans l’ordre du sprint', () => {
    const a = task('task-001', { status: 'done' })
    const b = task('task-002', { depends: ['task-003'] })
    const c = task('task-003')
    const tasks = [a, b, c]
    const next = nextReady(tasks, config, ['task-001', 'task-002', 'task-003'])
    expect(next?.frontmatter.id).toBe('task-003')
  })
})

describe('filterTasks', () => {
  it('filtre par statut/label/assignee et trie par colonne puis rang', () => {
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
})
