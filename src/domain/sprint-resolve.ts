import type { Task } from './types'

// Résolution PURE d'un sprint (ids → étapes + progression). Volontairement
// SANS zod : la vue web l'importe directement pour ne pas tirer zod dans le
// bundle SPA. Le schéma/parse (avec zod) vit dans `sprint.ts`.

const DONE_STATUS = 'done'

export interface SprintStep {
  id: string
  /** null = referenced task not found (deleted). */
  task: Task | null
  status: string | null
  done: boolean
  subtasks: SprintStep[]
}

export interface ResolvedSprint {
  steps: SprintStep[]
  /** Top-level tasks done / total. */
  done: number
  total: number
  /** Index of the first not-done step (« you are here »); -1 when all done. */
  currentIndex: number
}

function stepFor(id: string, byId: Map<string, Task>, tasks: readonly Task[]): SprintStep {
  const task = byId.get(id) ?? null
  const subtasks = tasks
    .filter((t) => t.frontmatter.parent === id)
    .map<SprintStep>((t) => ({
      id: t.frontmatter.id,
      task: t,
      status: t.frontmatter.status,
      done: t.frontmatter.status === DONE_STATUS,
      subtasks: [],
    }))
  return {
    id,
    task,
    status: task?.frontmatter.status ?? null,
    done: task?.frontmatter.status === DONE_STATUS,
    subtasks,
  }
}

/** Resolves a sprint's ordered ids against the live task set. Pure/testable. */
export function resolveSprint(items: readonly string[], tasks: readonly Task[]): ResolvedSprint {
  const byId = new Map(tasks.map((t) => [t.frontmatter.id, t]))
  const steps = items.map((id) => stepFor(id, byId, tasks))
  const total = steps.length
  const done = steps.filter((s) => s.done).length
  const currentIndex = steps.findIndex((s) => !s.done)
  return { steps, done, total, currentIndex }
}
