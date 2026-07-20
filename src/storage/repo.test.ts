import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BacklogRepository } from './repo'
import { createTask } from '../domain'

describe('BacklogRepository', () => {
  let root: string
  let repo: BacklogRepository

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-'))
    repo = new BacklogRepository(root)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('init crée la config et le dossier tasks', async () => {
    const config = await repo.init('Mon projet')
    expect(config.name).toBe('Mon projet')
    expect(config.columns.length).toBeGreaterThan(0)
    expect(await repo.loadConfig()).toEqual(config)
  })

  it('save → list → get → delete', async () => {
    const config = await repo.init('P')
    const task = createTask(
      { title: 'Première tâche', body: '## Description\n\nOK' },
      { config, existingIds: [], lastOrderInColumn: null, now: '2026-07-20T00:00:00Z' },
    )
    await repo.saveTask(task)

    const list = await repo.listTasks()
    expect(list).toHaveLength(1)
    expect(list[0]?.frontmatter.id).toBe('task-001')

    const got = await repo.getTask('task-001')
    expect(got?.body).toContain('OK')

    expect(await repo.deleteTask('task-001')).toBe(true)
    expect(await repo.listTasks()).toHaveLength(0)
  })

  it('getBoard range la tâche dans sa colonne', async () => {
    const config = await repo.init('P')
    const firstColumn = config.columns[0]!.id
    const task = createTask(
      { title: 'X' },
      { config, existingIds: [], lastOrderInColumn: null, now: 'n' },
    )
    await repo.saveTask(task)

    const board = await repo.getBoard()
    const column = board?.columns.find((c) => c.column.id === firstColumn)
    expect(column?.tasks).toHaveLength(1)
  })
})
