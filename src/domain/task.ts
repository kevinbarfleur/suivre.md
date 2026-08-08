import type { BoardConfig, Priority, TaskFrontmatter } from './schema'
import type { Task } from './types'
import { nextTaskId, taskFileName } from './ids'
import { rankAfter } from './rank'

/** Pure operations on tasks. No I/O: persistence lives in `storage`. */

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
    frontmatter,
    body: (input.body ?? '').trim(),
    fileName: taskFileName(id, input.title),
  }
}

export type TaskPatch = Partial<
  Pick<
    TaskFrontmatter,
    'title' | 'status' | 'priority' | 'labels' | 'assignee' | 'order' | 'parent' | 'depends'
  >
> & { body?: string }

/** Applies a patch, bumps `updated`, renames the file when the title changes. */
export function editTask(task: Task, patch: TaskPatch, now: string): Task {
  const { body, ...fmPatch } = patch
  const frontmatter: TaskFrontmatter = { ...task.frontmatter, ...fmPatch, updated: now }
  const fileName =
    patch.title && patch.title !== task.frontmatter.title
      ? taskFileName(frontmatter.id, patch.title)
      : task.fileName
  return {
    frontmatter,
    body: body !== undefined ? body.trim() : task.body,
    fileName,
  }
}

/** Moves a task to a given status and rank. */
export function moveTask(task: Task, toStatus: string, order: string, now: string): Task {
  return editTask(task, { status: toStatus, order }, now)
}
