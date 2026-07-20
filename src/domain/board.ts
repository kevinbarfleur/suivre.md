import { ARCHIVED_STATUS } from './archive'
import type { BoardConfig } from './schema'
import type { Board, BoardColumn, Task } from './types'

function byOrder(a: Task, b: Task): number {
  if (a.frontmatter.order < b.frontmatter.order) return -1
  if (a.frontmatter.order > b.frontmatter.order) return 1
  return 0
}

/**
 * Assemble le board : range les tâches par colonne (ordre de la config), trie
 * chaque colonne par rang, et remonte en `orphans` les tâches au statut inconnu.
 */
export function buildBoard(config: BoardConfig, tasks: readonly Task[]): Board {
  const byStatus = new Map<string, Task[]>()
  for (const column of config.columns) byStatus.set(column.id, [])

  const orphans: Task[] = []
  for (const task of tasks) {
    // Une tâche archivée quitte le board actif : ni colonne ni orphelin. Elle
    // reste sur disque et n'apparaît que dans la vue archives.
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
