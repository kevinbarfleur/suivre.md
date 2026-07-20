import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import {
  boardConfigSchema,
  buildBoard,
  DEFAULT_COLUMNS,
  parseTask,
  serializeTask,
} from '../domain'
import type { Board, BoardConfig, Task } from '../domain'
import { ARCHIVE_SUBDIR } from './collection'
import { resolvePaths, type BacklogPaths } from './paths'
import { atomicWrite, readFileSafe, readMarkdownDir, removeFile } from './io'

/**
 * Dépôt de stockage : seul composant qui touche le disque. Les surfaces
 * (server / cli / mcp) passent par lui, jamais par `fs` directement.
 */
export class BacklogRepository {
  private readonly paths: BacklogPaths

  constructor(root: string, dirName = '.suivre') {
    this.paths = resolvePaths(root, dirName)
  }

  /** Crée le backlog s'il n'existe pas ; renvoie la config (existante ou neuve). */
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

  async listTasks(): Promise<Task[]> {
    const files = await readMarkdownDir(this.paths.tasksDir)
    return files.map(({ fileName, raw }) => parseTask(raw, fileName))
  }

  /** Tâches rangées dans `tasks/archive/` (archivées par emplacement). */
  async listArchivedTasks(): Promise<Task[]> {
    const files = await readMarkdownDir(join(this.paths.tasksDir, ARCHIVE_SUBDIR))
    const tasks: Task[] = []
    for (const { fileName, raw } of files) {
      try {
        tasks.push(parseTask(raw, fileName))
      } catch {
        /* fichier d'archive invalide : ignoré plutôt que bloquant */
      }
    }
    return tasks
  }

  async getTask(id: string): Promise<Task | null> {
    const tasks = await this.listTasks()
    return tasks.find((task) => task.frontmatter.id === id) ?? null
  }

  /** Écrit une tâche. Si le nom de fichier a changé (titre édité), retire l'ancien. */
  async saveTask(task: Task, previousFileName?: string): Promise<void> {
    if (previousFileName && previousFileName !== task.fileName) {
      await removeFile(join(this.paths.tasksDir, previousFileName))
    }
    await atomicWrite(join(this.paths.tasksDir, task.fileName), serializeTask(task))
  }

  async deleteTask(id: string): Promise<boolean> {
    const task = await this.getTask(id)
    if (!task) return false
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
