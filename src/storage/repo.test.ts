import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BacklogRepository } from './repo'
import { MarkdownCollection } from './collection'
import { fileExists } from './io'
import { createTask, serializeTask, type BoardConfig, type Task } from '../domain'

describe('BacklogRepository', () => {
  let root: string
  let repo: BacklogRepository
  let tasksDir: string

  const makeTask = (config: BoardConfig, title: string, existingIds: string[] = []): Task =>
    createTask({ title }, { config, existingIds, lastOrderInColumn: null, now: 'n' })

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-'))
    repo = new BacklogRepository(root)
    tasksDir = join(root, '.suivre', 'tasks')
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('init creates the config and the tasks directory', async () => {
    const config = await repo.init('Mon projet')
    expect(config.name).toBe('Mon projet')
    expect(config.columns.length).toBeGreaterThan(0)
    expect(await repo.loadConfig()).toEqual(config)
  })

  it('save → list → get → delete', async () => {
    const config = await repo.init('P')
    const task = createTask(
      { title: 'First task', body: '## Description\n\nOK' },
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

  it('getBoard places the task in its column', async () => {
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

  it('one unreadable file does not break the list, and is reported', async () => {
    const config = await repo.init('P')
    await repo.saveTask(makeTask(config, 'Valid'))
    await writeFile(join(tasksDir, 'broken.md'), 'no frontmatter here\n')

    const { tasks, invalid } = await repo.readTasks()
    expect(tasks.map((t) => t.frontmatter.title)).toEqual(['Valid'])
    expect(invalid).toHaveLength(1)
    expect(invalid[0]?.fileName).toBe('broken.md')
    expect(invalid[0]?.message).toBeTruthy()

    expect(await repo.listTasks()).toHaveLength(1)
    expect(await repo.getTask('task-001')).not.toBeNull()
    expect((await repo.getBoard())?.columns.flatMap((c) => c.tasks)).toHaveLength(1)
  })

  it('renaming writes the new file then removes the old one', async () => {
    const config = await repo.init('P')
    const task = makeTask(config, 'Old title')
    await repo.saveTask(task)

    const renamed: Task = {
      ...task,
      frontmatter: { ...task.frontmatter, title: 'New title' },
      fileName: 'task-001-new-title.md',
    }
    await repo.saveTask(renamed, task.fileName)

    expect(await fileExists(join(tasksDir, task.fileName))).toBe(false)
    expect(await repo.listTasks()).toHaveLength(1)
    expect((await repo.getTask('task-001'))?.frontmatter.title).toBe('New title')
  })

  it('a failed write keeps the previous file instead of losing the task', async () => {
    const config = await repo.init('P')
    const task = makeTask(config, 'Keep me')
    await repo.saveTask(task)

    // A directory at the destination makes the atomic rename fail.
    await mkdir(join(tasksDir, 'task-001-blocked.md'))
    const renamed: Task = { ...task, fileName: 'task-001-blocked.md' }
    await expect(repo.saveTask(renamed, task.fileName)).rejects.toThrow()

    expect(await fileExists(join(tasksDir, task.fileName))).toBe(true)
    expect((await repo.getTask('task-001'))?.frontmatter.title).toBe('Keep me')
  })

  it('a case-only rename does not delete the file it just wrote', async () => {
    const config = await repo.init('P')
    const task = makeTask(config, 'Alpha')
    const upper: Task = { ...task, fileName: 'Task-001-alpha.md' }
    await writeFile(join(tasksDir, upper.fileName), serializeTask(upper))

    const lower: Task = {
      ...task,
      frontmatter: { ...task.frontmatter, title: 'Alpha beta' },
      fileName: 'task-001-alpha.md',
    }
    await repo.saveTask(lower, upper.fileName)

    expect(await readFile(join(tasksDir, lower.fileName), 'utf8')).toContain('title: Alpha beta')
    expect(await repo.getTask('task-001')).not.toBeNull()
  })

  it('archiveTask refuses to overwrite an existing archive entry', async () => {
    const config = await repo.init('P')
    const first = makeTask(config, 'Reused')
    await repo.saveTask(first)
    expect(await repo.archiveTask('task-001')).toBe(true)

    const archived = join(tasksDir, 'archive', first.fileName)
    const original = await readFile(archived, 'utf8')

    await repo.saveTask({ ...first, body: 'a different task that reuses the id' })
    await expect(repo.archiveTask('task-001')).rejects.toThrow(/Archive entry already exists/)

    expect(await readFile(archived, 'utf8')).toBe(original)
    expect(await repo.getTask('task-001')).not.toBeNull()
  })

  it('archiveTask moves the task out of the board', async () => {
    const config = await repo.init('P')
    const task = makeTask(config, 'To archive')
    await repo.saveTask(task)

    expect(await repo.archiveTask(task.frontmatter.id)).toBe(true)
    expect(await repo.listTasks()).toHaveLength(0)
    expect((await repo.listArchivedTasks()).map((t) => t.frontmatter.id)).toEqual(['task-001'])
    expect((await repo.readArchivedTasks()).invalid).toEqual([])
  })
})

interface Note {
  frontmatter: { id: string }
  fileName: string
  text: string
}

function parseNote(raw: string, fileName: string): Note {
  const match = raw.match(/^id: (\S+)\n([\s\S]*)$/)
  if (!match) throw new Error(`Note without id: ${fileName}`)
  return { frontmatter: { id: match[1]! }, fileName, text: (match[2] ?? '').trim() }
}

function serializeNote(note: Note): string {
  return `id: ${note.frontmatter.id}\n${note.text}\n`
}

describe('MarkdownCollection', () => {
  let dir: string
  let collection: MarkdownCollection<Note>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'suivre-collection-'))
    collection = new MarkdownCollection<Note>(dir, parseNote, serializeNote)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('reports unparseable files instead of silently dropping them', async () => {
    await collection.save({ frontmatter: { id: 'doc-001' }, fileName: 'doc-001.md', text: 'ok' })
    await writeFile(join(dir, 'doc-002.md'), 'missing the id line\n')

    const { items, invalid } = await collection.read()
    expect(items.map((item) => item.frontmatter.id)).toEqual(['doc-001'])
    expect(invalid).toEqual([{ fileName: 'doc-002.md', message: 'Note without id: doc-002.md' }])
    expect(await collection.list()).toHaveLength(1)
  })

  it('a failed write keeps the previous file', async () => {
    const item: Note = { frontmatter: { id: 'doc-001' }, fileName: 'doc-001.md', text: 'keep me' }
    await collection.save(item)
    await mkdir(join(dir, 'doc-001-blocked.md'))

    await expect(
      collection.save({ ...item, fileName: 'doc-001-blocked.md' }, item.fileName),
    ).rejects.toThrow()
    expect((await collection.get('doc-001'))?.text).toBe('keep me')
  })

  it('a case-only rename does not delete the file it just wrote', async () => {
    await writeFile(join(dir, 'Doc-001.md'), 'id: doc-001\nold\n')
    await collection.save(
      { frontmatter: { id: 'doc-001' }, fileName: 'doc-001.md', text: 'new' },
      'Doc-001.md',
    )

    expect(await readFile(join(dir, 'doc-001.md'), 'utf8')).toContain('new')
    expect(await collection.get('doc-001')).not.toBeNull()
  })
})
