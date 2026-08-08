import type { BoardConfig, Column, TaskFrontmatter } from './schema'

/** A task in memory: its frontmatter + the markdown body + its file name. */
export interface Task {
  frontmatter: TaskFrontmatter
  body: string
  fileName: string
}

/** A board column resolved with its tasks, sorted by rank. */
export interface BoardColumn {
  column: Column
  tasks: Task[]
}

/**
 * The assembled board. `orphans` = tasks whose status matches no column: they
 * are surfaced rather than hidden.
 */
export interface Board {
  config: BoardConfig
  columns: BoardColumn[]
  orphans: Task[]
}
