import type { BoardConfig } from './schema'
import type { Task } from './types'

/**
 * Vocabulaire "tracker" : commentaires, résolution de dépendances, frontier.
 * Opérations pures sur les tâches, pensées pour être pilotées par un agent
 * (workflows type Matt Pocock — /triage, /wayfinder, /implement).
 */

/** Section conventionnelle des commentaires, toujours en fin de corps. */
export const COMMENTS_HEADING = '## Comments'

export interface CommentInput {
  text: string
  author?: string
  /** Horloge injectée (ISO) pour rester pur/testable. */
  at: string
}

/**
 * Ajoute un commentaire horodaté en fin de corps, sous `## Comments` (créé au
 * premier commentaire). La section vit en fin de fichier par convention — c'est
 * l'historique de conversation du ticket, versionné avec lui.
 */
export function appendComment(body: string, comment: CommentInput): string {
  const trimmed = body.trimEnd()
  const author = comment.author ? ` — ${comment.author}` : ''
  const entry = `### ${comment.at}${author}\n\n${comment.text.trim()}`
  const hasSection = trimmed.split('\n').some((line) => line.trim() === COMMENTS_HEADING)
  const prefix = hasSection ? trimmed : `${trimmed}\n\n${COMMENTS_HEADING}`.trimStart()
  return `${prefix}\n\n${entry}\n`
}

/** Id de la colonne finale ("done") : la dernière colonne du board. */
export function doneStatus(config: BoardConfig): string {
  const last = config.columns.at(-1)
  if (!last) throw new Error('Aucune colonne définie dans la config du board')
  return last.id
}

/**
 * Une dépendance est résolue si la tâche est dans la colonne finale — ou si
 * elle n'existe plus dans les tâches actives (supprimée ou archivée).
 */
export function isDependencyResolved(id: string, tasks: Task[], done: string): boolean {
  const dep = tasks.find((t) => t.frontmatter.id === id)
  return dep === undefined || dep.frontmatter.status === done
}

/**
 * Une tâche est "ready" (frontier) : pas dans la colonne finale, non assignée,
 * toutes ses dépendances résolues. C'est la définition qu'un agent utilise pour
 * choisir la prochaine tâche à réclamer.
 */
export function isReady(task: Task, tasks: Task[], config: BoardConfig): boolean {
  const done = doneStatus(config)
  const { status, assignee, depends } = task.frontmatter
  if (status === done) return false
  if (assignee) return false
  return depends.every((id) => isDependencyResolved(id, tasks, done))
}

export interface TaskFilter {
  status?: string
  label?: string
  assignee?: string
  /** Ne garder que les tâches ready (voir `isReady`). */
  ready?: boolean
}

/** Filtre + tri board (ordre des colonnes, puis rang dans la colonne). */
export function filterTasks(tasks: Task[], config: BoardConfig, filter: TaskFilter): Task[] {
  const columnIndex = new Map(config.columns.map((c, i) => [c.id, i]))
  return tasks
    .filter((task) => {
      const fm = task.frontmatter
      if (filter.status && fm.status !== filter.status) return false
      if (filter.label && !fm.labels.includes(filter.label)) return false
      if (filter.assignee && fm.assignee !== filter.assignee) return false
      if (filter.ready && !isReady(task, tasks, config)) return false
      return true
    })
    .sort((a, b) => {
      const ca = columnIndex.get(a.frontmatter.status) ?? Number.MAX_SAFE_INTEGER
      const cb = columnIndex.get(b.frontmatter.status) ?? Number.MAX_SAFE_INTEGER
      if (ca !== cb) return ca - cb
      return a.frontmatter.order < b.frontmatter.order ? -1 : 1
    })
}

/**
 * Prochaine tâche à prendre. Sans sprint : première tâche ready dans l'ordre du
 * board. Avec sprint : première tâche ready dans l'ordre du sprint (la "frontier
 * query" du wayfinding).
 */
export function nextReady(
  tasks: Task[],
  config: BoardConfig,
  sprintItems?: readonly string[],
): Task | null {
  if (sprintItems) {
    for (const id of sprintItems) {
      const task = tasks.find((t) => t.frontmatter.id === id)
      if (task && isReady(task, tasks, config)) return task
    }
    return null
  }
  return filterTasks(tasks, config, { ready: true })[0] ?? null
}
