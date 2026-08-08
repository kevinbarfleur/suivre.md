import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { taskFrontmatterSchema, type TaskFrontmatter } from './schema'
import type { Task } from './types'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/** Parses a task file (YAML frontmatter + body). Validates via zod, throws if invalid. */
export function parseTask(raw: string, fileName: string): Task {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {
    throw new Error(`Task file without frontmatter: ${fileName}`)
  }
  const yamlBlock = match[1] ?? ''
  const body = (match[2] ?? '').trim()
  const data = parseYaml(yamlBlock) ?? {}
  const frontmatter = taskFrontmatterSchema.parse(data)
  return { frontmatter, body, fileName }
}

/** Deterministic field order → clean, stable git diffs. */
const FIELD_ORDER: readonly (keyof TaskFrontmatter)[] = [
  'id',
  'title',
  'status',
  'priority',
  'labels',
  'assignee',
  'order',
  'parent',
  'depends',
  'created',
  'updated',
]

/** Serializes a task to markdown. Omits absent optionals and empty arrays. */
export function serializeTask(task: Task): string {
  const fm = task.frontmatter
  const ordered: Record<string, unknown> = {}
  for (const key of FIELD_ORDER) {
    const value = fm[key]
    if (value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    ordered[key] = value
  }
  const yaml = stringifyYaml(ordered).trimEnd()
  const body = task.body.trim()
  return `---\n${yaml}\n---\n\n${body}\n`
}
