import type { BoardConfig, Priority, TaskFrontmatter } from './schema'
import type { Task } from './types'
import { nextTaskId, taskFileName } from './ids'
import { rankAfter } from './rank'

/** Opérations pures sur les tâches. Aucune I/O : la persistance vit dans `storage`. */

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
  /** Dernier rang de la colonne cible (la carte est ajoutée à la fin). */
  lastOrderInColumn: string | null
  /** Horloge injectée (ISO) pour rester pur/testable. */
  now: string
}

export function createTask(input: CreateTaskInput, ctx: CreateTaskContext): Task {
  const status = input.status ?? ctx.config.columns[0]?.id
  if (!status) {
    throw new Error('Aucune colonne définie dans la config du board')
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

/** Applique un patch, bump `updated`, resynchronise le nom de fichier si le titre change. */
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

/** Déplace une tâche vers un statut et un rang donnés. */
export function moveTask(task: Task, toStatus: string, order: string, now: string): Task {
  return editTask(task, { status: toStatus, order }, now)
}
