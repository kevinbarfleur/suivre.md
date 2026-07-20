import { describe, expect, it } from 'vitest'
import { createTask, editTask, moveTask } from './task'
import { boardConfigSchema } from './schema'

const config = boardConfigSchema.parse({
  name: 'T',
  columns: [
    { id: 'todo', label: 'À faire' },
    { id: 'done', label: 'Fait' },
  ],
})

describe('createTask', () => {
  it('incrémente l’id, défaut = première colonne, nomme le fichier', () => {
    const task = createTask(
      { title: 'Faire le café' },
      {
        config,
        existingIds: ['task-001', 'task-002'],
        lastOrderInColumn: null,
        now: '2026-07-20T00:00:00Z',
      },
    )
    expect(task.frontmatter.id).toBe('task-003')
    expect(task.frontmatter.status).toBe('todo')
    expect(task.fileName).toBe('task-003-faire-le-cafe.md')
    expect(task.frontmatter.created).toBe('2026-07-20T00:00:00Z')
    expect(task.frontmatter.order.length).toBeGreaterThan(0)
  })
})

describe('editTask', () => {
  it('bump updated et resynchronise le fichier au changement de titre', () => {
    const task = createTask(
      { title: 'Ancien' },
      { config, existingIds: [], lastOrderInColumn: null, now: 'a' },
    )
    const edited = editTask(task, { title: 'Nouveau nom', priority: 'high' }, 'b')
    expect(edited.frontmatter.updated).toBe('b')
    expect(edited.frontmatter.priority).toBe('high')
    expect(edited.fileName).toBe('task-001-nouveau-nom.md')
  })
})

describe('moveTask', () => {
  it('change le statut et le rang', () => {
    const task = createTask(
      { title: 'X' },
      { config, existingIds: [], lastOrderInColumn: null, now: 'a' },
    )
    const moved = moveTask(task, 'done', 'zzz', 'b')
    expect(moved.frontmatter.status).toBe('done')
    expect(moved.frontmatter.order).toBe('zzz')
  })
})
