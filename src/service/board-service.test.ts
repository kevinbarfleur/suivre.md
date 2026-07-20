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

  it('create place en fin de colonne, rangs croissants, statut par défaut', async () => {
    const a = await svc.create({ title: 'A' })
    const b = await svc.create({ title: 'B' })
    expect(a.frontmatter.status).toBe('backlog')
    expect(a.frontmatter.order < b.frontmatter.order).toBe(true)
  })

  it('move afterId insère strictement entre deux cartes', async () => {
    const a = await svc.create({ title: 'A', status: 'todo' })
    const b = await svc.create({ title: 'B', status: 'todo' })
    const c = await svc.create({ title: 'C', status: 'todo' })
    const moved = await svc.move(c.frontmatter.id, 'todo', { afterId: a.frontmatter.id })
    expect(a.frontmatter.order < moved.frontmatter.order).toBe(true)
    expect(moved.frontmatter.order < b.frontmatter.order).toBe(true)
  })

  it('move change le statut et le board le reflète', async () => {
    const a = await svc.create({ title: 'A' })
    const moved = await svc.move(a.frontmatter.id, 'doing')
    expect(moved.frontmatter.status).toBe('doing')
    const board = await svc.getBoard()
    const doing = board!.columns.find((col) => col.column.id === 'doing')!
    expect(doing.tasks.map((t) => t.frontmatter.id)).toContain(a.frontmatter.id)
  })

  it('edit bump la priorité, remove supprime', async () => {
    const a = await svc.create({ title: 'A' })
    const edited = await svc.edit(a.frontmatter.id, { priority: 'high' })
    expect(edited.frontmatter.priority).toBe('high')
    expect(await svc.remove(a.frontmatter.id)).toBe(true)
    expect(await svc.getTask(a.frontmatter.id)).toBeNull()
  })
})
