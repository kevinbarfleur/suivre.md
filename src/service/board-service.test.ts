import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BoardService } from './board-service'

describe('BoardService', () => {
  let root: string
  let svc: BoardService

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-svc-'))
    svc = new BoardService(root)
    await svc.init('Projet')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('create places at end of column, increasing ranks, default status', async () => {
    const a = await svc.create({ title: 'A' })
    const b = await svc.create({ title: 'B' })
    expect(a.frontmatter.status).toBe('backlog')
    expect(a.frontmatter.order < b.frontmatter.order).toBe(true)
  })

  it('move afterId inserts strictly between two cards', async () => {
    const a = await svc.create({ title: 'A', status: 'todo' })
    const b = await svc.create({ title: 'B', status: 'todo' })
    const c = await svc.create({ title: 'C', status: 'todo' })
    const moved = await svc.move(c.frontmatter.id, 'todo', { afterId: a.frontmatter.id })
    expect(a.frontmatter.order < moved.frontmatter.order).toBe(true)
    expect(moved.frontmatter.order < b.frontmatter.order).toBe(true)
  })

  it('move changes the status and the board reflects it', async () => {
    const a = await svc.create({ title: 'A' })
    const moved = await svc.move(a.frontmatter.id, 'doing')
    expect(moved.frontmatter.status).toBe('doing')
    const board = await svc.getBoard()
    const doing = board!.columns.find((col) => col.column.id === 'doing')!
    expect(doing.tasks.map((t) => t.frontmatter.id)).toContain(a.frontmatter.id)
  })

  it('edit bumps the priority, remove deletes', async () => {
    const a = await svc.create({ title: 'A' })
    const edited = await svc.edit(a.frontmatter.id, { priority: 'high' })
    expect(edited.frontmatter.priority).toBe('high')
    expect(await svc.remove(a.frontmatter.id)).toBe(true)
    expect(await svc.getTask(a.frontmatter.id)).toBeNull()
  })
})
