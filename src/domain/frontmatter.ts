import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

// Découpe générique frontmatter YAML + corps markdown, partagée par les
// collections (tâches, décisions, docs). Chaque domaine valide `data` avec son
// propre schéma zod.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

export function splitFrontmatter(raw: string): { data: unknown; body: string } {
  const match = raw.match(FRONTMATTER_RE)
  if (!match) return { data: {}, body: raw.trim() }
  return { data: parseYaml(match[1] ?? '') ?? {}, body: (match[2] ?? '').trim() }
}

/** Sérialise frontmatter + corps ; `order` détermine l'ordre des clés (diffs stables). */
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
