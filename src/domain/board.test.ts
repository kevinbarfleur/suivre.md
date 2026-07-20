import { describe, expect, it } from 'vitest'
import { buildBoard } from './board'
import { boardConfigSchema } from './schema'
import type { Task } from './types'

function task(id: string, status: string, order: string): Task {
  return {
    frontmatter: {
      id,
      title: id,
      status,
      order,
      labels: [],
      depends: [],
      created: 'n',
      updated: 'n',
    },
    body: '',
    fileName: `${id}.md`,
  }
}

const config = boardConfigSchema.parse({
  name: 'T',
  columns: [
    { id: 'todo', label: 'À faire' },
    { id: 'done', label: 'Fait' },
  ],
})

describe('buildBoard', () => {
  it('range par colonne, trie par rang, remonte les orphelins', () => {
    const tasks = [
      task('c', 'todo', 'c'),
      task('a', 'todo', 'a'),
      task('b', 'done', 'b'),
      task('o', 'unknown', 'z'),
    ]
    const board = buildBoard(config, tasks)
    const todo = board.columns.find((c) => c.column.id === 'todo')!
    const done = board.columns.find((c) => c.column.id === 'done')!
    expect(todo.tasks.map((t) => t.frontmatter.id)).toEqual(['a', 'c'])
    expect(done.tasks).toHaveLength(1)
    expect(board.orphans.map((t) => t.frontmatter.id)).toEqual(['o'])
  })

  it('exclut les tâches archivées du board (ni colonne ni orphelin)', () => {
    const board = buildBoard(config, [
      task('a', 'todo', 'a'),
      task('z', 'archived', 'z'),
    ])
    const allIds = board.columns.flatMap((c) => c.tasks.map((t) => t.frontmatter.id))
    expect(allIds).toEqual(['a'])
    expect(board.orphans).toHaveLength(0)
  })
})
