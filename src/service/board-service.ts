import { BacklogRepository, MarkdownCollection, PreferencesStore, resolvePaths } from '../storage'
import {
  appendComment,
  buildArchive,
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

/**
 * Couche applicative : orchestre le domaine (pur) et le storage (disque). C'est
 * elle que les trois surfaces (server / cli / mcp) appellent — une seule logique
 * d'orchestration, jamais dupliquée par surface.
 */
export class BoardService {
  private readonly repo: BacklogRepository
  private readonly prefs: PreferencesStore
  private readonly decisions: MarkdownCollection<Decision>
  private readonly docs: MarkdownCollection<Doc>
  private readonly sprints: MarkdownCollection<Sprint>

  constructor(root: string, dirName = '.suivre') {
    const paths = resolvePaths(root, dirName)
    this.repo = new BacklogRepository(root, dirName)
    this.prefs = new PreferencesStore(paths.preferencesFile)
    this.decisions = new MarkdownCollection<Decision>(
      paths.decisionsDir,
      parseDecision,
      serializeDecision,
    )
    this.docs = new MarkdownCollection<Doc>(paths.docsDir, parseDoc, serializeDoc)
    this.sprints = new MarkdownCollection<Sprint>(paths.sprintsDir, parseSprint, serializeSprint)
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
   * Liste unifiée des archives : tâches (statut `archived` ou dossier
   * `tasks/archive/`), décisions (superseded/rejected ou `decisions/archive/`),
   * docs (`docs/archive/`). Une seule vue transverse, triée par date.
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

  async create(input: CreateTaskInput): Promise<Task> {
    const config = await this.requireConfig()
    const tasks = await this.repo.listTasks()
    const status = input.status ?? config.columns[0]!.id
    const orders = tasks
      .filter((task) => task.frontmatter.status === status)
      .map((task) => task.frontmatter.order)
      .sort()
    const task = createTask(
      { ...input, status },
      {
        config,
        existingIds: tasks.map((t) => t.frontmatter.id),
        lastOrderInColumn: orders.at(-1) ?? null,
        now: this.now(),
      },
    )
    await this.repo.saveTask(task)
    return task
  }

  async edit(id: string, patch: TaskPatch): Promise<Task> {
    const task = await this.requireTask(id)
    const next = editTask(task, patch, this.now())
    await this.repo.saveTask(next, task.fileName)
    return next
  }

  async move(id: string, toStatus: string, opts: MoveOptions = {}): Promise<Task> {
    const task = await this.requireTask(id)
    const tasks = await this.repo.listTasks()
    const column = tasks
      .filter((t) => t.frontmatter.status === toStatus && t.frontmatter.id !== id)
      .sort((a, b) => (a.frontmatter.order < b.frontmatter.order ? -1 : 1))
    const order = computeOrder(column, opts)
    const next = moveTask(task, toStatus, order, this.now())
    await this.repo.saveTask(next, task.fileName)
    return next
  }

  remove(id: string): Promise<boolean> {
    return this.repo.deleteTask(id)
  }

  // --- Vocabulaire tracker (piloté par agent : /triage, /wayfinder, /implement) ---

  /** Ajoute un commentaire horodaté sous `## Comments` (créée au premier). */
  async comment(id: string, text: string, author?: string): Promise<Task> {
    const task = await this.requireTask(id)
    const body = appendComment(task.body, { text, author, at: this.now() })
    const next = editTask(task, { body }, this.now())
    await this.repo.saveTask(next, task.fileName)
    return next
  }

  /**
   * Ferme une tâche : déplacement en colonne finale (fin de colonne), avec
   * commentaire de résolution optionnel, et archivage optionnel (le fichier part
   * dans `tasks/archive/`, hors board mais versionné).
   */
  async close(
    id: string,
    opts: { comment?: string; author?: string; archive?: boolean } = {},
  ): Promise<Task> {
    const config = await this.requireConfig()
    if (opts.comment) await this.comment(id, opts.comment, opts.author)
    const task = await this.move(id, doneStatus(config))
    if (opts.archive) await this.repo.archiveTask(id)
    return task
  }

  /** Tâches filtrées + triées dans l'ordre du board (colonnes puis rang). */
  async queryTasks(filter: TaskFilter): Promise<Task[]> {
    const config = await this.requireConfig()
    const tasks = await this.repo.listTasks()
    return filterTasks(tasks, config, filter)
  }

  /**
   * Prochaine tâche à prendre (ready : non finale, non assignée, dépendances
   * résolues). Avec `sprintId`, la frontier suit l'ordre du sprint.
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

  // --- Décisions (ADR) ---

  listDecisions(): Promise<Decision[]> {
    return this.decisions.list()
  }

  getDecision(id: string): Promise<Decision | null> {
    return this.decisions.get(id)
  }

  async createDecision(input: CreateDecisionInput): Promise<Decision> {
    const items = await this.decisions.list()
    const id = nextTaskId(
      'decision',
      items.map((d) => d.frontmatter.id),
    )
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
    await this.decisions.save(decision)
    if (frontmatter.supersedes) await this.markSuperseded(frontmatter.supersedes, id)
    return decision
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
    const items = await this.docs.list()
    const id = nextTaskId(
      'doc',
      items.map((d) => d.frontmatter.id),
    )
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
    await this.docs.save(doc)
    return doc
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

  async createSprint(input: CreateSprintInput): Promise<Sprint> {
    const items = await this.sprints.list()
    const id = nextTaskId(
      'sprint',
      items.map((s) => s.frontmatter.id),
    )
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
    await this.sprints.save(sprint)
    return sprint
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

/** Calcule le rang cible d'un déplacement (fin de colonne, ou entre deux cartes). */
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
