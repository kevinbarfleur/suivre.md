import { formatZodError, taskFrontmatterSchema } from './schema'
import type { BoardConfig, Priority, TaskFrontmatter } from './schema'
import type { Task } from './types'
import { nextTaskId, taskFileName } from './ids'
import { rankAfter } from './rank'

/** Pure operations on tasks. No I/O: persistence lives in `storage`. */

/**
 * Last line of defense before serialization. Inputs reach here already typed,
 * but they come from a CLI parser, an MCP client or an HTTP body: a single
 * wrong value written to disk makes the file unreadable for every command.
 */
function checkedFrontmatter(frontmatter: TaskFrontmatter, id: string): TaskFrontmatter {
  const result = taskFrontmatterSchema.safeParse(frontmatter)
  if (!result.success) {
    throw new Error(`Invalid task ${id}: ${formatZodError(result.error)}`)
  }
  return result.data
}

function checkedBody(body: unknown, id: string): string {
  if (typeof body !== 'string') {
    throw new Error(`Invalid task ${id}: body: expected string, received ${typeof body}`)
  }
  return body.trim()
}

export interface CreateTaskInput {
  title: string
  status?: string
  priority?: Priority
  labels?: string[]
  assignee?: string
  body?: string
  parent?: string
  depends?: string[]
}

export interface CreateTaskContext {
  config: BoardConfig
  existingIds: readonly string[]
  /** Last rank in the target column (the card is appended at the end). */
  lastOrderInColumn: string | null
  /** Injected clock (ISO) to stay pure and testable. */
  now: string
}

export function createTask(input: CreateTaskInput, ctx: CreateTaskContext): Task {
  const status = input.status ?? ctx.config.columns[0]?.id
  if (!status) {
    throw new Error('No column defined in the board config')
  }
  const id = nextTaskId(ctx.config.taskPrefix, ctx.existingIds)
  const frontmatter: TaskFrontmatter = {
    id,
    title: input.title,
    status,
    priority: input.priority,
    labels: input.labels ?? [],
    assignee: input.assignee,
    order: rankAfter(ctx.lastOrderInColumn),
    parent: input.parent,
    depends: input.depends ?? [],
    created: ctx.now,
    updated: ctx.now,
  }
  return {
    frontmatter: checkedFrontmatter(frontmatter, id),
    body: checkedBody(input.body ?? '', id),
    fileName: taskFileName(id, input.title),
  }
}

export type TaskPatch = Partial<
  Pick<TaskFrontmatter, 'title' | 'status' | 'labels' | 'assignee' | 'order' | 'parent' | 'depends'>
> & { body?: string; priority?: Priority | null }

/** Applies a patch, bumps `updated`, renames the file when the title changes. */
export function editTask(task: Task, patch: TaskPatch, now: string): Task {
  const { body, priority, ...fmPatch } = patch
  const id = task.frontmatter.id
  const next = { ...task.frontmatter, ...fmPatch, updated: now }
  if ('priority' in patch) {
    if (priority === null) delete next.priority
    else next.priority = priority
  }
  const frontmatter = checkedFrontmatter(next, id)
  const fileName =
    frontmatter.title !== task.frontmatter.title
      ? taskFileName(frontmatter.id, frontmatter.title)
      : task.fileName
  return {
    frontmatter,
    body: body !== undefined ? checkedBody(body, id) : task.body,
    fileName,
  }
}

/** Moves a task to a given status and rank. */
export function moveTask(task: Task, toStatus: string, order: string, now: string): Task {
  return editTask(task, { status: toStatus, order }, now)
}
