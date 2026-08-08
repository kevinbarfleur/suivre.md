import { BoardService } from '../service/board-service'
import type { Decision, Doc, Sprint, Task } from '../domain'

/** Shared command plumbing: service, outputs, error handling. */

export const service = (): BoardService =>
  new BoardService(process.env.SUIVRE_ROOT ?? process.cwd())

/** Wraps an action: error → message on stderr + exit 1 (never a raw stack). */
export function run<A extends unknown[]>(
  fn: (...args: A) => Promise<void>,
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args)
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`)
      process.exit(1)
    }
  }
}

/** Normalizes a repeatable cac option (absent | scalar | array). */
export function toArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  return (Array.isArray(value) ? value : [value]).map(String)
}

/**
 * Strips `undefined` keys from a patch. Required before `editTask`: its
 * spread-based merge would overwrite an existing field with `undefined`.
 */
export function compact<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

/** A task flattened for JSON output (frontmatter + body, without the internal rank). */
export function taskJson(task: Task): Record<string, unknown> {
  const { order: _order, ...fm } = task.frontmatter
  return { ...fm, body: task.body }
}

export function sprintJson(sprint: Sprint): Record<string, unknown> {
  return { ...sprint.frontmatter, body: sprint.body }
}

export function docJson(doc: Doc): Record<string, unknown> {
  return { ...doc.frontmatter, body: doc.body }
}

export function decisionJson(decision: Decision): Record<string, unknown> {
  return { ...decision.frontmatter, body: decision.body }
}

export function taskLine(task: Task): string {
  const fm = task.frontmatter
  const extras = [
    fm.priority && `!${fm.priority}`,
    fm.assignee && `@${fm.assignee}`,
    fm.labels.length > 0 && fm.labels.map((l) => `#${l}`).join(' '),
    fm.depends.length > 0 && `deps:${fm.depends.join(',')}`,
  ]
    .filter(Boolean)
    .join('  ')
  return `${fm.id}  [${fm.status}]  ${fm.title}${extras ? `  ${extras}` : ''}`
}

export function printTask(task: Task): void {
  console.log(taskLine(task))
  if (task.body.trim()) console.log(`\n${task.body.trim()}\n`)
}
