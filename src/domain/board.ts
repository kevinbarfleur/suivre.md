import { ARCHIVED_STATUS } from './archive'
import type { BoardConfig } from './schema'
import type { Board, BoardColumn, Task } from './types'

function byOrder(a: Task, b: Task): number {
  if (a.frontmatter.order < b.frontmatter.order) return -1
  if (a.frontmatter.order > b.frontmatter.order) return 1
  return 0
}

/**
 * Assembles the board: buckets tasks by column (config order), sorts each
 * column by rank, and surfaces tasks with an unknown status as `orphans`.
 */
export function buildBoard(config: BoardConfig, tasks: readonly Task[]): Board {
  const byStatus = new Map<string, Task[]>()
  for (const column of config.columns) byStatus.set(column.id, [])

  const orphans: Task[] = []
  for (const task of tasks) {
    // An archived task leaves the active board: no column, no orphan. It
    // stays on disk and only shows up in the archives view.
    if (task.frontmatter.status === ARCHIVED_STATUS) continue
    const bucket = byStatus.get(task.frontmatter.status)
    if (bucket) bucket.push(task)
    else orphans.push(task)
  }

  const columns: BoardColumn[] = config.columns.map((column) => ({
    column,
    tasks: (byStatus.get(column.id) ?? []).sort(byOrder),
  }))

  return { config, columns, orphans: orphans.sort(byOrder) }
}
