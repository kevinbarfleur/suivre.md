import type { BoardConfig, Column, TaskFrontmatter } from './schema'

/** Une tâche en mémoire : son frontmatter + le corps markdown + le nom de son fichier. */
export interface Task {
  frontmatter: TaskFrontmatter
  body: string
  fileName: string
}

/** Une colonne du board résolue avec ses tâches, triées par rang. */
export interface BoardColumn {
  column: Column
  tasks: Task[]
}

/**
 * Le board assemblé. `orphans` = tâches dont le statut ne correspond à aucune
 * colonne : on les remonte au lieu de les cacher (honnêteté > silence).
 */
export interface Board {
  config: BoardConfig
  columns: BoardColumn[]
  orphans: Task[]
}
