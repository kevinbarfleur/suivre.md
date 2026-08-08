import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { stripBom } from './frontmatter'
import { formatZodError, taskFrontmatterSchema, type TaskFrontmatter } from './schema'
import type { Task } from './types'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/**
 * Parses a task file (YAML frontmatter + body). Validates via zod, throws if
 * invalid. Every failure names the file: a caller listing a directory has no
 * other way to tell which one is broken.
 */
export function parseTask(raw: string, fileName: string): Task {
  const match = stripBom(raw).match(FRONTMATTER_RE)
  if (!match) {
    throw new Error(`Task file without frontmatter: ${fileName}`)
  }
  const yamlBlock = match[1] ?? ''
  const body = (match[2] ?? '').trim()
  let data: unknown
  try {
    data = parseYaml(yamlBlock) ?? {}
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid task file ${fileName}: ${reason}`)
  }
  const result = taskFrontmatterSchema.safeParse(data)
  if (!result.success) {
    throw new Error(`Invalid task file ${fileName}: ${formatZodError(result.error)}`)
  }
  return { frontmatter: result.data, body, fileName }
}

export type ParsedTask = { ok: true; task: Task } | { ok: false; fileName: string; message: string }

/**
 * Non-throwing `parseTask`, for readers that walk a whole directory: one stray
 * or corrupt file must degrade to a skipped entry, never take down a listing.
 */
export function safeParseTask(raw: string, fileName: string): ParsedTask {
  try {
    return { ok: true, task: parseTask(raw, fileName) }
  } catch (error) {
    return { ok: false, fileName, message: error instanceof Error ? error.message : String(error) }
  }
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
