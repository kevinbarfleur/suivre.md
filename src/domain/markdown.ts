import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { taskFrontmatterSchema, type TaskFrontmatter } from './schema'
import type { Task } from './types'

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

/** Parse un fichier de tâche (frontmatter YAML + corps). Valide via zod, lève si invalide. */
export function parseTask(raw: string, fileName: string): Task {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) {
    throw new Error(`Fichier de tâche sans frontmatter: ${fileName}`)
  }
  const yamlBlock = match[1] ?? ''
  const body = (match[2] ?? '').trim()
  const data = parseYaml(yamlBlock) ?? {}
  const frontmatter = taskFrontmatterSchema.parse(data)
  return { frontmatter, body, fileName }
}

/** Ordre de champ déterministe → diffs git propres et stables. */
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

/** Sérialise une tâche en markdown. Omet les optionnels absents et les tableaux vides. */
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
