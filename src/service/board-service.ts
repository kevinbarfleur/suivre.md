import { createHash } from 'node:crypto'
import { mkdir, rmdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseDocument } from 'yaml'
import {
  atomicWrite,
  BacklogRepository,
  MarkdownCollection,
  PreferencesStore,
  readFileSafe,
  resolvePaths,
} from '../storage'
import type { BacklogPaths, CollectionItem, InvalidMarkdownFile, TaskRead } from '../storage'
import {
  appendComment,
  ARCHIVED_STATUS,
  buildArchive,
  COMMENTS_HEADING,
  createTask,
  decisionFrontmatterSchema,
  docFrontmatterSchema,
  doneStatus,
  editTask,
  filterTasks,
  globalPreferencesSchema,
  moveTask,
  nextReady,
  nextTaskId,
  parseDecision,
  parseDoc,
  projectPreferencesSchema,
  rankBetween,
  resolveSprint,
  serializeDecision,
  serializeDoc,
  serializeSprint,
  parseSprint,
  sprintFrontmatterSchema,
  slugify,
} from '../domain'
import type {
  ArchivedEntry,
  Board,
  BoardConfig,
  CreateDecisionInput,
  CreateDocInput,
  CreateSprintInput,
  CreateTaskInput,
  Decision,
  DecisionPatch,
  Doc,
  DocPatch,
  GlobalPreferences,
  Located,
  Preferences,
  ProjectPreferences,
  ResolvedSprint,
  Sprint,
  SprintPatch,
  Task,
  TaskFilter,
  TaskPatch,
} from '../domain'

export interface MoveOptions {
  beforeId?: string
  afterId?: string
}

/** An unparseable file, with the collection it belongs to. */
export interface InvalidFile extends InvalidMarkdownFile {
  collection: 'tasks' | 'decisions' | 'docs' | 'sprints'
}

/** A sprint with its steps resolved against the live tasks. */
export interface SprintProgress {
  sprint: Sprint
  resolved: ResolvedSprint
}

/** Monotonic id counters, stored in config.yml next to the columns. */
const SEQUENCES_KEY = 'sequences'

/**
 * Application layer: orchestrates the domain (pure) and the storage (disk).
 * It is what the three surfaces (server / cli / mcp) call — a single
 * orchestration logic, never duplicated per surface.
 */
export class BoardService {
  private readonly paths: BacklogPaths
  private readonly repo: BacklogRepository
  private readonly prefs: PreferencesStore
  private readonly decisions: MarkdownCollection<Decision>
  private readonly docs: MarkdownCollection<Doc>
  private readonly sprints: MarkdownCollection<Sprint>
  private readonly idLock: string
  private readonly baseDir: string

  constructor(root: string, dirName = '.suivre') {
    const paths = resolvePaths(root, dirName)
    this.paths = paths
    this.repo = new BacklogRepository(root, dirName)
    this.prefs = new PreferencesStore(paths.preferencesFile)
    this.decisions = new MarkdownCollection<Decision>(
      paths.decisionsDir,
      parseDecision,
      serializeDecision,
    )
    this.docs = new MarkdownCollection<Doc>(paths.docsDir, parseDoc, serializeDoc)
    this.sprints = new MarkdownCollection<Sprint>(paths.sprintsDir, parseSprint, serializeSprint)
    this.idLock = idLockPath(paths.baseDir)
    this.baseDir = paths.baseDir
  }

  private now(): string {
    return new Date().toISOString()
  }

  init(name: string): Promise<BoardConfig> {
    return this.repo.init(name)
  }

  loadConfig(): Promise<BoardConfig | null> {
    return this.repo.loadConfig()
  }

  getBoard(): Promise<Board | null> {
    return this.repo.getBoard()
  }

  listTasks(): Promise<Task[]> {
    return this.repo.listTasks()
  }

  getTask(id: string): Promise<Task | null> {
    return this.repo.getTask(id)
  }

  /**
   * Unified archive list: tasks (status `archived` or `tasks/archive/` folder),
   * decisions (superseded/rejected or `decisions/archive/`), docs
   * (`docs/archive/`). One cross-cutting view, sorted by date.
   */
  async getArchive(): Promise<ArchivedEntry[]> {
    const [tasks, archivedTasks, decisions, archivedDecisions, docs, archivedDocs] =
      await Promise.all([
        this.repo.listTasks(),
        this.repo.listArchivedTasks(),
        this.decisions.list(),
        this.decisions.listArchived(),
        this.docs.list(),
        this.docs.listArchived(),
      ])
    const located = <T>(items: T[], inArchiveFolder: boolean): Located<T>[] =>
      items.map((item) => ({ item, inArchiveFolder }))
    return buildArchive({
      tasks: [...located(tasks, false), ...located(archivedTasks, true)],
      decisions: [...located(decisions, false), ...located(archivedDecisions, true)],
      docs: [...located(docs, false), ...located(archivedDocs, true)],
    })
  }

  /**
   * Every file the collections had to skip, with where it lives. A surface
   * that can report them must: a hand-edited file that parses no more is
   * invisible otherwise.
   */
  async listInvalidFiles(): Promise<InvalidFile[]> {
    const reads = await Promise.all([
      tagged('tasks', this.repo.readTasks()),
      tagged('tasks', this.repo.readArchivedTasks()),
      tagged('decisions', this.decisions.read()),
      tagged('decisions', this.decisions.readArchived()),
      tagged('docs', this.docs.read()),
      tagged('docs', this.docs.readArchived()),
      tagged('sprints', this.sprints.read()),
      tagged('sprints', this.sprints.readArchived()),
    ])
    return reads.flat()
  }

  async create(input: CreateTaskInput): Promise<Task> {
    const config = await this.requireConfig()
    const status = input.status ?? config.columns[0]!.id
    assertStatus(config, status)
    return withLock(this.idLock, async () => {
      const [active, archived] = await Promise.all([
        this.repo.listTasks(),
        this.repo.listArchivedTasks(),
      ])
      const orders = active
        .filter((task) => task.frontmatter.status === status)
        .map((task) => task.frontmatter.order)
        .sort()
      const task = createTask(
        { ...input, status },
        {
          config,
          existingIds: await this.allocatedIds(
            config.taskPrefix,
            [...active, ...archived].map((t) => t.frontmatter.id),
          ),
          lastOrderInColumn: orders.at(-1) ?? null,
          now: this.now(),
        },
      )
      await this.commitId(config.taskPrefix, task.frontmatter.id)
      await this.repo.saveTask(task)
      return task
    })
  }

  async edit(id: string, patch: TaskPatch): Promise<Task> {
    const allowed = allowedPatch(patch)
    if (typeof allowed.status === 'string') assertStatus(await this.requireConfig(), allowed.status)
    return this.withTask(id, async (task) => {
      if (allowed.body !== undefined) allowed.body = withComments(task.body, allowed.body)
      const next = editTask(task, allowed, this.now())
      await this.repo.saveTask(next, task.fileName)
      return next
    })
  }

  async move(id: string, toStatus: string, opts: MoveOptions = {}): Promise<Task> {
    const config = await this.requireConfig()
    assertStatus(config, toStatus)
    return this.withTask(id, async (task) => {
      const tasks = await this.repo.listTasks()
      const column = tasks
        .filter((t) => t.frontmatter.status === toStatus && t.frontmatter.id !== id)
        .sort((a, b) => (a.frontmatter.order < b.frontmatter.order ? -1 : 1))
      const order = computeOrder(column, opts)
      const next = moveTask(task, toStatus, order, this.now())
      await this.repo.saveTask(next, task.fileName)
      return next
    })
  }

  remove(id: string): Promise<boolean> {
    return this.repo.deleteTask(id)
  }

  // --- Tracker vocabulary (agent-driven: /triage, /wayfinder, /implement) ---

  /** Appends a timestamped comment under `## Comments` (created on first use). */
  async comment(id: string, text: string, author?: string): Promise<Task> {
    return this.withTask(id, async (task) => {
      const body = appendComment(task.body, { text, author, at: this.now() })
      const next = editTask(task, { body }, this.now())
      await this.repo.saveTask(next, task.fileName)
      return next
    })
  }

  /**
   * Runs a read-modify-write on one task under a per-task lock, re-reading it
   * INSIDE the lock. Without this, two concurrent writers each read the same
   * body and the second write silently drops the first: measured 34 of 40
   * comments lost across parallel MCP calls, every one acknowledged as a
   * success. Atomic writes alone cannot fix that — they protect the file, not
   * the read-modify-write around it.
   */
  private withTask<T>(id: string, fn: (task: Task) => Promise<T>): Promise<T> {
    return withLock(taskLockPath(this.baseDir, id), async () => fn(await this.requireTask(id)))
  }

  /**
   * Closes a task: moves it to the final column (end of column), with an
   * optional resolution comment and optional archiving (the file goes to
   * `tasks/archive/`, off the board but versioned).
   */
  async close(
    id: string,
    opts: { comment?: string; author?: string; archive?: boolean } = {},
  ): Promise<Task> {
    const config = await this.requireConfig()
    if (opts.comment) await this.comment(id, opts.comment, opts.author)
    const task = await this.move(id, doneStatus(config))
    if (opts.archive) {
      try {
        await this.repo.archiveTask(id)
      } catch (error) {
        // The move already happened: reporting a bare failure would hide it.
        throw new Error(`Task closed but not archived: ${id}: ${messageOf(error)}`, {
          cause: error,
        })
      }
    }
    return task
  }

  /** Tasks filtered + sorted in board order (columns, then rank). */
  async queryTasks(filter: TaskFilter): Promise<Task[]> {
    return (await this.readTasks(filter)).tasks
  }

  /** Same as `queryTasks`, with the task files that could not be parsed. */
  async readTasks(filter: TaskFilter = {}): Promise<TaskRead> {
    const config = await this.requireConfig()
    const { tasks, invalid } = await this.repo.readTasks()
    return { tasks: filterTasks(tasks, config, filter), invalid }
  }

  /**
   * Next task to pick up (ready: not final, unassigned, dependencies
   * resolved). With `sprintId`, the frontier follows the sprint order.
   */
  async next(sprintId?: string): Promise<Task | null> {
    const config = await this.requireConfig()
    const tasks = await this.repo.listTasks()
    if (!sprintId) return nextReady(tasks, config)
    const sprint = await this.sprints.get(sprintId)
    if (!sprint) throw new Error(`Sprint not found: ${sprintId}`)
    return nextReady(tasks, config, sprint.frontmatter.items)
  }

  async getPreferences(): Promise<Preferences> {
    const [global, project] = await Promise.all([this.prefs.loadGlobal(), this.prefs.loadProject()])
    return { global, project }
  }

  async patchGlobalPreferences(patch: Partial<GlobalPreferences>): Promise<GlobalPreferences> {
    const current = await this.prefs.loadGlobal()
    const next = globalPreferencesSchema.parse({ ...current, ...patch })
    await this.prefs.saveGlobal(next)
    return next
  }

  async patchProjectPreferences(patch: Partial<ProjectPreferences>): Promise<ProjectPreferences> {
    const current = await this.prefs.loadProject()
    const next = projectPreferencesSchema.parse({ ...current, ...patch })
    await this.prefs.saveProject(next)
    return next
  }

  // --- Decisions (ADR) ---

  listDecisions(): Promise<Decision[]> {
    return this.decisions.list()
  }

  getDecision(id: string): Promise<Decision | null> {
    return this.decisions.get(id)
  }

  async createDecision(input: CreateDecisionInput): Promise<Decision> {
    return withLock(this.idLock, async () => {
      const id = nextTaskId('decision', await this.collectionIds('decision', this.decisions))
      const frontmatter = decisionFrontmatterSchema.parse({
        id,
        title: input.title,
        status: input.status,
        date: input.date ?? this.now(),
        supersedes: input.supersedes,
        labels: input.labels,
      })
      const decision: Decision = {
        frontmatter,
        body: input.body ?? '',
        fileName: `${id}-${slugify(input.title)}.md`,
      }
      await this.commitId('decision', id)
      await this.decisions.save(decision)
      if (frontmatter.supersedes) await this.markSuperseded(frontmatter.supersedes, id)
      return decision
    })
  }

  async editDecision(id: string, patch: DecisionPatch): Promise<Decision> {
    const current = await this.decisions.get(id)
    if (!current) throw new Error(`Decision not found: ${id}`)
    const title = patch.title ?? current.frontmatter.title
    const frontmatter = decisionFrontmatterSchema.parse({
      ...current.frontmatter,
      ...patch,
      id,
      title,
    })
    const next: Decision = {
      frontmatter,
      body: patch.body ?? current.body,
      fileName: `${id}-${slugify(title)}.md`,
    }
    await this.decisions.save(next, current.fileName)
    return next
  }

  removeDecision(id: string): Promise<boolean> {
    return this.decisions.remove(id)
  }

  private async markSuperseded(id: string, byId: string): Promise<void> {
    const decision = await this.decisions.get(id)
    if (!decision) return
    const frontmatter = decisionFrontmatterSchema.parse({
      ...decision.frontmatter,
      status: 'superseded',
      supersededBy: byId,
    })
    await this.decisions.save({ ...decision, frontmatter })
  }

  // --- Docs ---

  listDocs(): Promise<Doc[]> {
    return this.docs.list()
  }

  getDoc(id: string): Promise<Doc | null> {
    return this.docs.get(id)
  }

  async createDoc(input: CreateDocInput): Promise<Doc> {
    return withLock(this.idLock, async () => {
      const id = nextTaskId('doc', await this.collectionIds('doc', this.docs))
      const frontmatter = docFrontmatterSchema.parse({
        id,
        title: input.title,
        tags: input.tags,
        updated: this.now(),
      })
      const doc: Doc = {
        frontmatter,
        body: input.body ?? '',
        fileName: `${id}-${slugify(input.title)}.md`,
      }
      await this.commitId('doc', id)
      await this.docs.save(doc)
      return doc
    })
  }

  async editDoc(id: string, patch: DocPatch): Promise<Doc> {
    const current = await this.docs.get(id)
    if (!current) throw new Error(`Doc not found: ${id}`)
    const title = patch.title ?? current.frontmatter.title
    const frontmatter = docFrontmatterSchema.parse({
      ...current.frontmatter,
      ...patch,
      id,
      title,
      updated: this.now(),
    })
    const next: Doc = {
      frontmatter,
      body: patch.body ?? current.body,
      fileName: `${id}-${slugify(title)}.md`,
    }
    await this.docs.save(next, current.fileName)
    return next
  }

  removeDoc(id: string): Promise<boolean> {
    return this.docs.remove(id)
  }

  // --- Sprints ---

  listSprints(): Promise<Sprint[]> {
    return this.sprints.list()
  }

  getSprint(id: string): Promise<Sprint | null> {
    return this.sprints.get(id)
  }

  /**
   * A sprint and its progress, measured against the board's final column —
   * never a hardcoded `done`, or a board with renamed columns reports zero
   * progress forever. `null` when the sprint does not exist.
   */
  async sprintProgress(id: string): Promise<SprintProgress | null> {
    const config = await this.requireConfig()
    const sprint = await this.sprints.get(id)
    if (!sprint) return null
    const tasks = await this.repo.listTasks()
    return {
      sprint,
      resolved: resolveSprint(sprint.frontmatter.items, tasks, doneStatus(config)),
    }
  }

  async createSprint(input: CreateSprintInput): Promise<Sprint> {
    return withLock(this.idLock, async () => {
      const id = nextTaskId('sprint', await this.collectionIds('sprint', this.sprints))
      const now = this.now()
      const frontmatter = sprintFrontmatterSchema.parse({
        id,
        title: input.title,
        goal: input.goal,
        items: input.items,
        created: now,
        updated: now,
      })
      const sprint: Sprint = {
        frontmatter,
        body: input.body ?? '',
        fileName: `${id}-${slugify(input.title)}.md`,
      }
      await this.commitId('sprint', id)
      await this.sprints.save(sprint)
      return sprint
    })
  }

  async editSprint(id: string, patch: SprintPatch): Promise<Sprint> {
    const current = await this.sprints.get(id)
    if (!current) throw new Error(`Sprint not found: ${id}`)
    const title = patch.title ?? current.frontmatter.title
    const frontmatter = sprintFrontmatterSchema.parse({
      ...current.frontmatter,
      ...patch,
      id,
      title,
      updated: this.now(),
    })
    const next: Sprint = {
      frontmatter,
      body: patch.body ?? current.body,
      fileName: `${id}-${slugify(title)}.md`,
    }
    await this.sprints.save(next, current.fileName)
    return next
  }

  removeSprint(id: string): Promise<boolean> {
    return this.sprints.remove(id)
  }

  // --- Id allocation ---

  /** Active + archived ids of a collection, extended with the persisted counter. */
  private async collectionIds<T extends CollectionItem>(
    prefix: string,
    collection: MarkdownCollection<T>,
  ): Promise<string[]> {
    const [items, archived] = await Promise.all([collection.list(), collection.listArchived()])
    return this.allocatedIds(
      prefix,
      [...items, ...archived].map((item) => item.frontmatter.id),
    )
  }

  /**
   * Ids already handed out for `prefix`: the ones on disk, plus everything the
   * persisted counter covers. Ids are never reused — a `depends` entry or a
   * sprint step that outlives its ticket must never resolve to another one —
   * so neither archiving nor `rm` frees an id. Boards written before the
   * counter simply fall back to the highest id on disk.
   */
  private async allocatedIds(prefix: string, existingIds: readonly string[]): Promise<string[]> {
    const counter = await this.readSequence(prefix)
    // The counter holds the next free sequence; the domain reasons on ids, so
    // it is handed the id sitting just below it.
    return counter > 0 ? [...existingIds, `${prefix}-${counter - 1}`] : [...existingIds]
  }

  private async readSequence(prefix: string): Promise<number> {
    const raw = await readFileSafe(this.paths.configFile)
    if (raw === null) return 0
    const value = parseDocument(raw).getIn([SEQUENCES_KEY, prefix])
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
  }

  /**
   * Moves the counter past `id`. Written through the YAML document so the
   * user's config.yml keeps its comments, and read back through it because the
   * config schema strips the key.
   */
  private async commitId(prefix: string, id: string): Promise<void> {
    const sequence = Number(id.slice(prefix.length + 1))
    const raw = await readFileSafe(this.paths.configFile)
    if (raw === null || !Number.isInteger(sequence)) return
    const doc = parseDocument(raw)
    const current = doc.getIn([SEQUENCES_KEY, prefix])
    const next = Math.max(typeof current === 'number' ? current : 0, sequence + 1)
    doc.setIn([SEQUENCES_KEY, prefix], next)
    await atomicWrite(this.paths.configFile, String(doc))
  }

  private async requireConfig(): Promise<BoardConfig> {
    const config = await this.repo.loadConfig()
    if (!config) throw new Error('Backlog not initialized — run `suivre init` first.')
    return config
  }

  private async requireTask(id: string): Promise<Task> {
    const task = await this.repo.getTask(id)
    if (!task) throw new Error(`Task not found: ${id}`)
    return task
  }
}

/** Computes the target rank of a move (end of column, or between two cards). */
function computeOrder(column: Task[], opts: MoveOptions): string {
  const indexOf = (id?: string): number =>
    id ? column.findIndex((t) => t.frontmatter.id === id) : -1

  if (opts.afterId) {
    const i = indexOf(opts.afterId)
    const a = i >= 0 ? column[i]!.frontmatter.order : null
    const b = i >= 0 ? (column[i + 1]?.frontmatter.order ?? null) : null
    return rankBetween(a, b)
  }
  if (opts.beforeId) {
    const i = indexOf(opts.beforeId)
    const a = i > 0 ? column[i - 1]!.frontmatter.order : null
    const b = i >= 0 ? column[i]!.frontmatter.order : null
    return rankBetween(a, b)
  }
  const last = column.at(-1)?.frontmatter.order ?? null
  return rankBetween(last, null)
}

/**
 * A status the board can render: one of its columns, or the reserved
 * `archived`. Nothing else — an unknown status silently orphans the ticket
 * (off every column, still listed), and the valid ids are the only discovery
 * path a surface offers.
 */
function assertStatus(config: BoardConfig, status: string): void {
  if (status === ARCHIVED_STATUS || config.columns.some((column) => column.id === status)) return
  const valid = [...config.columns.map((column) => column.id), ARCHIVED_STATUS].join(', ')
  throw new Error(`Unknown status: ${status} — valid statuses: ${valid}`)
}

/**
 * Fields a caller may patch. `id`, `created` and `order` are not among them:
 * the REST surface has no schema of its own, and an `order` written by hand
 * breaks every later insert in that column. Ranks come from `move` only.
 * Key presence is preserved, not value: an explicit `undefined` clears a field.
 */
function allowedPatch(patch: TaskPatch): TaskPatch {
  const allowed: TaskPatch = {}
  if ('title' in patch) allowed.title = patch.title
  if ('status' in patch) allowed.status = patch.status
  if ('priority' in patch) allowed.priority = patch.priority
  if ('labels' in patch) allowed.labels = patch.labels
  if ('assignee' in patch) allowed.assignee = patch.assignee
  if ('parent' in patch) allowed.parent = patch.parent
  if ('depends' in patch) allowed.depends = patch.depends
  if ('body' in patch) allowed.body = patch.body
  return allowed
}

/**
 * Body replacement keeps the `## Comments` history: comments live in the body,
 * and ticking an acceptance checkbox is a full-body write — /implement must
 * not wipe what /triage recorded. An incoming body carrying its own comments
 * section wins.
 */
function withComments(previous: string, next: string): string {
  const section = commentsSectionOf(previous)
  if (section === null || commentsSectionOf(next) !== null) return next
  return `${next.trimEnd()}\n\n${section}\n`
}

/** The `## Comments` section of a body, fences skipped (a quoted heading is text). */
function commentsSectionOf(body: string): string | null {
  const lines = body.split('\n')
  let fence: string | null = null
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim()
    const marker = /^(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence !== null) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line === marker) {
        fence = null
      }
      continue
    }
    if (marker) {
      fence = marker
      continue
    }
    if (line === COMMENTS_HEADING) return lines.slice(index).join('\n').trimEnd()
  }
  return null
}

async function tagged(
  collection: InvalidFile['collection'],
  read: Promise<{ invalid: InvalidMarkdownFile[] }>,
): Promise<InvalidFile[]> {
  return (await read).invalid.map((file) => ({ collection, ...file }))
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const LOCK_POLL_MS = 5
const LOCK_STALE_MS = 5_000
const LOCK_TIMEOUT_MS = 10_000

/**
 * Lives outside the repo: a crashed process must not leave a file to commit.
 * Keyed by the absolute base dir, so two processes given the same board by
 * different spellings still queue behind the same lock.
 */
function idLockPath(baseDir: string): string {
  return join(tmpdir(), `suivre-ids-${boardKey(baseDir)}`)
}

/** One lock per task, so writers to different tickets never queue on each other. */
function taskLockPath(baseDir: string, id: string): string {
  const safe = id.replace(/[^A-Za-z0-9._-]/g, '_')
  return join(tmpdir(), `suivre-task-${boardKey(baseDir)}-${safe}`)
}

/** Keyed by the resolved base dir, so two spellings of one board share a lock. */
function boardKey(baseDir: string): string {
  return createHash('sha256').update(resolve(baseDir)).digest('hex').slice(0, 16)
}

/**
 * Serializes id allocation across processes. Allocation is a
 * read-max-then-write: four parallel `suivre add` (an agent batching Bash
 * calls) otherwise hand out the same id, and three tickets are lost.
 * `mkdir` without `recursive` is the atomic primitive — it fails with EEXIST
 * when the directory is already there, so exactly one caller creates it.
 */
async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await acquireLock(path)
  try {
    return await fn()
  } finally {
    await rmdir(path).catch(() => {})
  }
}

async function acquireLock(path: string): Promise<void> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  for (;;) {
    try {
      await mkdir(path)
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      // A holder killed mid-write must not block the board for good.
      const held = await stat(path).catch(() => null)
      if (held && Date.now() - held.mtimeMs > LOCK_STALE_MS) {
        await rmdir(path).catch(() => {})
        continue
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for the id lock: ${path}`)
      await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_MS))
    }
  }
}
