import type { Task } from './types'

// PURE sprint resolution (ids → steps + progress). Deliberately zod-free: the
// web view imports it directly, so zod stays out of the SPA bundle. The schema
// and parser (with zod) live in `sprint.ts`.

// The final column is board-configurable (`doneStatus(config)`); this is only
// the fallback for callers that have no config at hand.
const DEFAULT_DONE_STATUS = 'done'

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

function stepFor(
  id: string,
  byId: Map<string, Task>,
  tasks: readonly Task[],
  done: string,
): SprintStep {
  const task = byId.get(id) ?? null
  const subtasks = tasks
    .filter((t) => t.frontmatter.parent === id)
    .map<SprintStep>((t) => ({
      id: t.frontmatter.id,
      task: t,
      status: t.frontmatter.status,
      done: t.frontmatter.status === done,
      subtasks: [],
    }))
  return {
    id,
    task,
    status: task?.frontmatter.status ?? null,
    done: task?.frontmatter.status === done,
    subtasks,
  }
}

/**
 * Resolves a sprint's ordered ids against the live task set. Pure/testable.
 * `done` is the board's final column id — pass `doneStatus(config)`, or a
 * board with renamed columns reports zero progress forever.
 */
export function resolveSprint(
  items: readonly string[],
  tasks: readonly Task[],
  done: string = DEFAULT_DONE_STATUS,
): ResolvedSprint {
  const byId = new Map(tasks.map((t) => [t.frontmatter.id, t]))
  const steps = items.map((id) => stepFor(id, byId, tasks, done))
  const total = steps.length
  const currentIndex = steps.findIndex((s) => !s.done)
  return { steps, done: steps.filter((s) => s.done).length, total, currentIndex }
}
