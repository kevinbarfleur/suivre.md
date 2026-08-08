import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TaskPatch } from '../domain'
import { BoardService } from './board-service'

describe('BoardService', () => {
  let root: string
  let svc: BoardService

  const configFile = (): string => join(root, '.suivre', 'config.yml')
  const tasksDir = (): string => join(root, '.suivre', 'tasks')

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'suivre-svc-'))
    svc = new BoardService(root)
    await svc.init('Project')
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

  // --- A1.2: only the fields a caller owns ---

  it('edit ignores id, created and order', async () => {
    const a = await svc.create({ title: 'A' })
    const edited = await svc.edit(a.frontmatter.id, {
      title: 'A renamed',
      id: 'task-999',
      created: 'not-a-date',
      order: 'zzz',
    } as unknown as TaskPatch)
    expect(edited.frontmatter.id).toBe(a.frontmatter.id)
    expect(edited.frontmatter.created).toBe(a.frontmatter.created)
    expect(edited.frontmatter.order).toBe(a.frontmatter.order)
    expect(edited.frontmatter.title).toBe('A renamed')
    const b = await svc.create({ title: 'B' })
    expect(edited.frontmatter.order < b.frontmatter.order).toBe(true)
  })

  it('edit still clears a field passed as an explicit undefined', async () => {
    const a = await svc.create({ title: 'A', assignee: 'kevin' })
    const edited = await svc.edit(a.frontmatter.id, { assignee: undefined })
    expect(edited.frontmatter.assignee).toBeUndefined()
  })

  // --- A15: a status the board can render ---

  it('refuses a status that is not a column, and names the valid ones', async () => {
    const a = await svc.create({ title: 'A' })
    await expect(svc.move(a.frontmatter.id, 'in-progress')).rejects.toThrow(
      'Unknown status: in-progress — valid statuses: backlog, todo, doing, done, archived',
    )
    await expect(svc.edit(a.frontmatter.id, { status: 'in-progress' })).rejects.toThrow(
      'Unknown status: in-progress',
    )
    await expect(svc.create({ title: 'B', status: 'in-progress' })).rejects.toThrow(
      'Unknown status: in-progress',
    )
    expect(await svc.listTasks()).toHaveLength(1)
  })

  it('accepts the reserved archived status, which leaves the board', async () => {
    const a = await svc.create({ title: 'A' })
    const moved = await svc.move(a.frontmatter.id, 'archived')
    expect(moved.frontmatter.status).toBe('archived')
    expect(await svc.queryTasks({})).toHaveLength(0)
    expect(await svc.queryTasks({ status: 'archived' })).toHaveLength(1)
  })

  // --- A3.2: parallel allocation ---

  it('parallel creates never share an id, same title included', async () => {
    const tasks = await Promise.all(
      Array.from({ length: 8 }, () => svc.create({ title: 'Same title' })),
    )
    const ids = new Set(tasks.map((task) => task.frontmatter.id))
    expect(ids.size).toBe(8)
    expect(await svc.listTasks()).toHaveLength(8)
  })

  it('parallel creates of docs, decisions and sprints never share an id', async () => {
    const [docs, decisions, sprints] = await Promise.all([
      Promise.all(Array.from({ length: 4 }, () => svc.createDoc({ title: 'Spec' }))),
      Promise.all(Array.from({ length: 4 }, () => svc.createDecision({ title: 'Choice' }))),
      Promise.all(Array.from({ length: 4 }, () => svc.createSprint({ title: 'Wave' }))),
    ])
    expect(new Set(docs.map((d) => d.frontmatter.id)).size).toBe(4)
    expect(new Set(decisions.map((d) => d.frontmatter.id)).size).toBe(4)
    expect(new Set(sprints.map((s) => s.frontmatter.id)).size).toBe(4)
    expect(await svc.listDocs()).toHaveLength(4)
    expect(await svc.listDecisions()).toHaveLength(4)
    expect(await svc.listSprints()).toHaveLength(4)
  })

  // --- A2: an id is never handed out twice ---

  it('does not reuse the id of an archived or removed task', async () => {
    const a = await svc.create({ title: 'A' })
    await svc.close(a.frontmatter.id, { archive: true })
    const b = await svc.create({ title: 'B' })
    expect(b.frontmatter.id).not.toBe(a.frontmatter.id)
    await svc.remove(b.frontmatter.id)
    const c = await svc.create({ title: 'C' })
    expect(c.frontmatter.id).not.toBe(b.frontmatter.id)
    expect(c.frontmatter.id).not.toBe(a.frontmatter.id)
  })

  it('falls back to the ids on disk when config.yml carries no counter', async () => {
    const a = await svc.create({ title: 'A' })
    await svc.close(a.frontmatter.id, { archive: true })
    const raw = await readFile(configFile(), 'utf8')
    await writeFile(configFile(), raw.replace(/sequences:\n(\s+\w+: \d+\n)+/, ''), 'utf8')
    const b = await svc.create({ title: 'B' })
    expect(b.frontmatter.id).not.toBe(a.frontmatter.id)
  })

  it('keeps config.yml valid and commented while tracking ids', async () => {
    const raw = await readFile(configFile(), 'utf8')
    await writeFile(configFile(), `# hand-written board\n${raw}`, 'utf8')
    await svc.create({ title: 'A' })
    await svc.createDoc({ title: 'Spec' })
    const after = await readFile(configFile(), 'utf8')
    expect(after).toContain('# hand-written board')
    const config = await svc.loadConfig()
    expect(config!.name).toBe('Project')
    expect(config!.columns).toHaveLength(4)
  })

  // --- A9: comments survive a body replacement ---

  it('body replacement keeps the comments history', async () => {
    const a = await svc.create({ title: 'A', body: '## Acceptance\n\n- [ ] step' })
    await svc.comment(a.frontmatter.id, 'triaged: needs a migration', 'claude')
    const edited = await svc.edit(a.frontmatter.id, { body: '## Acceptance\n\n- [x] step' })
    expect(edited.body).toContain('- [x] step')
    expect(edited.body).toContain('## Comments')
    expect(edited.body).toContain('triaged: needs a migration')
    expect(edited.body.indexOf('## Comments')).toBeGreaterThan(edited.body.indexOf('- [x] step'))
  })

  it('an incoming body carrying its own comments section wins', async () => {
    const a = await svc.create({ title: 'A' })
    await svc.comment(a.frontmatter.id, 'first', 'claude')
    const edited = await svc.edit(a.frontmatter.id, {
      body: 'rewritten\n\n## Comments\n\n### 2024-01-01T00:00:00.000Z\n\nsecond',
    })
    expect(edited.body).toContain('second')
    expect(edited.body).not.toContain('first')
  })

  it('a comments heading quoted in a code fence is not a section', async () => {
    const a = await svc.create({ title: 'A', body: 'text\n\n```md\n## Comments\n```' })
    const edited = await svc.edit(a.frontmatter.id, { body: 'rewritten' })
    expect(edited.body).toBe('rewritten')
  })

  // --- A16: progress against the board's real final column ---

  it('sprint progress uses the board final column, not a hardcoded done', async () => {
    await writeFile(
      configFile(),
      'name: Projet\ntaskPrefix: task\ncolumns:\n  - id: todo\n    label: To do\n  - id: shipped\n    label: Shipped\n',
      'utf8',
    )
    const a = await svc.create({ title: 'A' })
    const b = await svc.create({ title: 'B' })
    await svc.close(a.frontmatter.id)
    const sprint = await svc.createSprint({
      title: 'Wave 1',
      items: [a.frontmatter.id, b.frontmatter.id],
    })
    const progress = await svc.sprintProgress(sprint.frontmatter.id)
    expect(progress!.resolved.done).toBe(1)
    expect(progress!.resolved.total).toBe(2)
    expect(progress!.resolved.currentIndex).toBe(1)
    expect(await svc.sprintProgress('sprint-404')).toBeNull()
  })

  it('next follows the sprint order', async () => {
    const a = await svc.create({ title: 'A' })
    const b = await svc.create({ title: 'B' })
    const sprint = await svc.createSprint({
      title: 'Wave 1',
      items: [b.frontmatter.id, a.frontmatter.id],
    })
    const next = await svc.next(sprint.frontmatter.id)
    expect(next!.frontmatter.id).toBe(b.frontmatter.id)
  })

  // --- A1.3: an unreadable file is reported, never fatal ---

  it('reports unparseable files instead of dropping the whole read', async () => {
    const a = await svc.create({ title: 'A' })
    await writeFile(join(tasksDir(), 'broken.md'), 'no frontmatter at all\n', 'utf8')
    const read = await svc.readTasks()
    expect(read.tasks.map((t) => t.frontmatter.id)).toEqual([a.frontmatter.id])
    expect(read.invalid).toEqual([
      { fileName: 'broken.md', message: 'Task file without frontmatter: broken.md' },
    ])
    expect(await svc.queryTasks({})).toHaveLength(1)
    expect(await svc.listInvalidFiles()).toEqual([
      { collection: 'tasks', fileName: 'broken.md', message: expect.any(String) },
    ])
  })

  it('lists unparseable files of every collection', async () => {
    await svc.createDoc({ title: 'Spec' })
    await writeFile(join(root, '.suivre', 'docs', 'broken.md'), '---\nid: 1\n---\n', 'utf8')
    const invalid = await svc.listInvalidFiles()
    expect(invalid.map((file) => `${file.collection}/${file.fileName}`)).toEqual(['docs/broken.md'])
  })

  // --- close() is honest about a partial success ---

  it('reports a close that moved the task but could not archive it', async () => {
    const a = await svc.create({ title: 'A' })
    await mkdir(join(tasksDir(), 'archive'), { recursive: true })
    await writeFile(join(tasksDir(), 'archive', a.fileName), 'squatter\n', 'utf8')
    await expect(svc.close(a.frontmatter.id, { archive: true })).rejects.toThrow(
      `Task closed but not archived: ${a.frontmatter.id}`,
    )
    expect((await svc.getTask(a.frontmatter.id))!.frontmatter.status).toBe('done')
  })

  // --- Concurrent read-modify-write on one task ---

  it('keeps every comment when writers race on the same task', async () => {
    const task = await svc.create({ title: 'Target' })
    const id = task.frontmatter.id
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => svc.comment(id, `note-${i}`, `writer-${i}`)),
    )
    const body = (await svc.getTask(id))!.body
    for (let i = 0; i < 12; i += 1) expect(body).toContain(`note-${i}`)
  })

  it('does not drop a comment written while a body edit is in flight', async () => {
    const task = await svc.create({ title: 'Target', body: 'v0' })
    const id = task.frontmatter.id
    await svc.comment(id, 'first')
    await Promise.all([svc.edit(id, { body: 'v1' }), svc.comment(id, 'second')])
    const body = (await svc.getTask(id))!.body
    expect(body).toContain('first')
    expect(body).toContain('second')
    expect(body).toContain('v1')
  })
})
