import { ARCHIVED_STATUS } from './archive'
import type { BoardConfig } from './schema'
import type { Task } from './types'

/**
 * Tracker vocabulary: comments, dependency resolution, frontier. Pure
 * operations on tasks, meant to be driven by an agent (Matt Pocock-style
 * workflows — /triage, /wayfinder, /implement).
 */

/** Conventional comments section, always at the end of the body. */
export const COMMENTS_HEADING = '## Comments'

export interface CommentInput {
  text: string
  author?: string
  /** Injected clock (ISO) to stay pure and testable. */
  at: string
}

/**
 * Appends a timestamped comment at the end of the body, under `## Comments`
 * (created on the first one). The section lives at the end of the file by
 * convention — it is the ticket's conversation history, versioned with it.
 */
export function appendComment(body: string, comment: CommentInput): string {
  const trimmed = body.trimEnd()
  const author = comment.author ? ` — ${comment.author}` : ''
  const entry = `### ${comment.at}${author}\n\n${comment.text.trim()}`
  const prefix = hasCommentsSection(trimmed)
    ? trimmed
    : `${trimmed}\n\n${COMMENTS_HEADING}`.trimStart()
  return `${prefix}\n\n${entry}\n`
}

/**
 * Whether the body already opens a comments section. Fenced regions are
 * skipped: a task body quoting `## Comments` inside a code block must not be
 * mistaken for the real heading.
 */
function hasCommentsSection(body: string): boolean {
  let fence: string | null = null
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    const marker = /^(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence !== null) {
      // A closing fence repeats the opening character, at least as long, alone
      // on its line.
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line === marker) {
        fence = null
      }
      continue
    }
    if (marker) {
      fence = marker
      continue
    }
    if (line === COMMENTS_HEADING) return true
  }
  return false
}

/** Id of the final ("done") column: the board's last column. */
export function doneStatus(config: BoardConfig): string {
  const last = config.columns.at(-1)
  if (!last) throw new Error('No column defined in the board config')
  return last.id
}

/**
 * A dependency is resolved when its task sits in the final column, has been
 * archived, or is gone from the active tasks (deleted). An archived
 * dependency must not block forever: it has left the board for good.
 */
export function isDependencyResolved(id: string, tasks: Task[], done: string): boolean {
  const dep = tasks.find((t) => t.frontmatter.id === id)
  if (dep === undefined) return true
  const { status } = dep.frontmatter
  return status === done || status === ARCHIVED_STATUS
}

/**
 * A task is "ready" (the frontier): on the board (archived tasks are not), not
 * in the final column, unassigned, all its dependencies resolved. This is the
 * definition an agent uses to pick the next task to claim.
 */
export function isReady(task: Task, tasks: Task[], config: BoardConfig): boolean {
  const done = doneStatus(config)
  const { status, assignee, depends } = task.frontmatter
  if (status === done || status === ARCHIVED_STATUS) return false
  if (assignee) return false
  return depends.every((id) => isDependencyResolved(id, tasks, done))
}

export interface TaskFilter {
  status?: string
  label?: string
  assignee?: string
  /** Keep only ready tasks (see `isReady`). */
  ready?: boolean
}

/**
 * Filter + board sort (column order, then rank within the column). Archived
 * tasks are not board members: they are left out unless explicitly asked for
 * with `status: 'archived'`, which is the only way to list them from here.
 */
export function filterTasks(tasks: Task[], config: BoardConfig, filter: TaskFilter): Task[] {
  const columnIndex = new Map(config.columns.map((c, i) => [c.id, i]))
  return tasks
    .filter((task) => {
      const fm = task.frontmatter
      if (fm.status === ARCHIVED_STATUS && filter.status !== ARCHIVED_STATUS) return false
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
 * Next task to take. Without a sprint: the first ready task in board order.
 * With a sprint: the first ready task in sprint order (wayfinding's "frontier
 * query").
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
