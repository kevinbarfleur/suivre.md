import { BacklogRepository } from '../storage'
import { createTask, editTask, moveTask, rankBetween } from '../domain'
import type { Board, BoardConfig, CreateTaskInput, Task, TaskPatch } from '../domain'

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

  constructor(root: string, dirName = 'backlog') {
    this.repo = new BacklogRepository(root, dirName)
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

  private async requireConfig(): Promise<BoardConfig> {
    const config = await this.repo.loadConfig()
    if (!config) throw new Error('Backlog non initialisé — lance `suivre init`.')
    return config
  }

  private async requireTask(id: string): Promise<Task> {
    const task = await this.repo.getTask(id)
    if (!task) throw new Error(`Tâche introuvable: ${id}`)
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
