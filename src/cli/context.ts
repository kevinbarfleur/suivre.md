import { BoardService } from '../service/board-service'
import type { Decision, Doc, Sprint, Task } from '../domain'

/** Plomberie partagée des commandes : service, sorties, gestion d'erreur. */

export const service = (): BoardService =>
  new BoardService(process.env.SUIVRE_ROOT ?? process.cwd())

/** Enveloppe une action : erreur → message sur stderr + exit 1 (jamais de stack brute). */
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

/** Normalise une option répétable de cac (absente | scalaire | tableau). */
export function toArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  return (Array.isArray(value) ? value : [value]).map(String)
}

/**
 * Retire les clés `undefined` d'un patch. Indispensable avant `editTask` : sa
 * fusion par spread écraserait un champ existant avec `undefined`.
 */
export function compact<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

/** Une tâche aplatie pour la sortie JSON (frontmatter + corps, sans le rang interne). */
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
