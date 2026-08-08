import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  boardConfigSchema,
  buildBoard,
  DEFAULT_COLUMNS,
  safeParseTask,
  serializeTask,
} from '../domain'
import type { Board, BoardConfig, Task } from '../domain'
import { ARCHIVE_SUBDIR } from './collection'
import { resolvePaths, type BacklogPaths } from './paths'
import {
  atomicWrite,
  fileExists,
  isSameFileName,
  readFileSafe,
  readMarkdownDir,
  removeFile,
  type InvalidMarkdownFile,
} from './io'

/** Parsed tasks plus the files that could not be parsed. */
export interface TaskRead {
  tasks: Task[]
  invalid: InvalidMarkdownFile[]
}

/**
 * Storage repository: the only component that touches the disk. Surfaces
 * (server / cli / mcp) go through it, never through `fs` directly.
 */
export class BacklogRepository {
  private readonly paths: BacklogPaths

  constructor(root: string, dirName = '.suivre') {
    this.paths = resolvePaths(root, dirName)
  }

  /** Creates the backlog if missing; returns the config (existing or new). */
  async init(name: string): Promise<BoardConfig> {
    const existing = await this.loadConfig()
    if (existing) return existing
    const config = boardConfigSchema.parse({ name, columns: DEFAULT_COLUMNS })
    await mkdir(this.paths.tasksDir, { recursive: true })
    await this.saveConfig(config)
    return config
  }

  async loadConfig(): Promise<BoardConfig | null> {
    const raw = await readFileSafe(this.paths.configFile)
    if (raw === null) return null
    return boardConfigSchema.parse(parseYaml(raw))
  }

  async saveConfig(config: BoardConfig): Promise<void> {
    await atomicWrite(this.paths.configFile, stringifyYaml(config))
  }

  private async readDir(dir: string): Promise<TaskRead> {
    const files = await readMarkdownDir(dir)
    const tasks: Task[] = []
    const invalid: InvalidMarkdownFile[] = []
    for (const { fileName, raw } of files) {
      const result = safeParseTask(raw, fileName)
      if (result.ok) tasks.push(result.task)
      else invalid.push({ fileName: result.fileName, message: result.message })
    }
    return { tasks, invalid }
  }

  /**
   * Tolerant read: a single hand-edited file must never take down the board.
   * Callers that can report the problem use `invalid`; the rest use `listTasks`.
   */
  async readTasks(): Promise<TaskRead> {
    return this.readDir(this.paths.tasksDir)
  }

  /** Tasks stored in `tasks/archive/` (archived by location), and their invalid files. */
  async readArchivedTasks(): Promise<TaskRead> {
    return this.readDir(join(this.paths.tasksDir, ARCHIVE_SUBDIR))
  }

  async listTasks(): Promise<Task[]> {
    return (await this.readTasks()).tasks
  }

  /** Tasks stored in `tasks/archive/` (archived by location). */
  async listArchivedTasks(): Promise<Task[]> {
    return (await this.readArchivedTasks()).tasks
  }

  async getTask(id: string): Promise<Task | null> {
    const tasks = await this.listTasks()
    return tasks.find((task) => task.frontmatter.id === id) ?? null
  }

  /**
   * Writes a task, then removes the old file if the title changed its name.
   * Never the reverse: dropping the old name first loses the task whenever the
   * write fails.
   */
  async saveTask(task: Task, previousFileName?: string): Promise<void> {
    await atomicWrite(join(this.paths.tasksDir, task.fileName), serializeTask(task))
    if (previousFileName && !isSameFileName(previousFileName, task.fileName)) {
      await removeFile(join(this.paths.tasksDir, previousFileName))
    }
  }

  async deleteTask(id: string): Promise<boolean> {
    const task = await this.getTask(id)
    if (!task) return false
    await removeFile(join(this.paths.tasksDir, task.fileName))
    return true
  }

  /**
   * Moves a task into `tasks/archive/` (off the board, kept in the repo).
   * Refuses to overwrite: ids are reused after archiving, and the archive is
   * the only remaining copy.
   */
  async archiveTask(id: string): Promise<boolean> {
    const task = await this.getTask(id)
    if (!task) return false
    const target = join(this.paths.tasksDir, ARCHIVE_SUBDIR, task.fileName)
    if (await fileExists(target)) {
      throw new Error(`Archive entry already exists: ${target}`)
    }
    await atomicWrite(target, serializeTask(task))
    await removeFile(join(this.paths.tasksDir, task.fileName))
    return true
  }

  async getBoard(): Promise<Board | null> {
    const config = await this.loadConfig()
    if (!config) return null
    const tasks = await this.listTasks()
    return buildBoard(config, tasks)
  }
}
