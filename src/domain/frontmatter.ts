import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

// Generic split of YAML frontmatter + markdown body, shared by the
// collections (tasks, decisions, docs). Each domain validates `data` with its
// own zod schema.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function splitFrontmatter(raw: string): { data: unknown; body: string } {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) return { data: {}, body: raw.trim() }
  return { data: parseYaml(match[1] ?? '') ?? {}, body: (match[2] ?? '').trim() }
}

/** Serializes frontmatter + body; `order` sets the key order (stable diffs). */
export function joinFrontmatter(
  data: Record<string, unknown>,
  order: readonly string[],
  body: string,
): string {
  const ordered: Record<string, unknown> = {}
  for (const key of order) {
    const value = data[key]
    if (value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    ordered[key] = value
  }
  const yaml = stringifyYaml(ordered).trimEnd()
  return `---\n${yaml}\n---\n\n${body.trim()}\n`
}
