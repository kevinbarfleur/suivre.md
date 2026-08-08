/** Task id and file name generation. */

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Slug for a readable file name (Latin diacritics folded, capped at 60).
 * Letters and digits of every script are kept: a fully non-latin title must
 * not collapse to the same slug as every other one.
 */
export function slugify(title: string): string {
  const cleaned = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // NFD splits Hangul into jamo; recompose so the file name stays canonical.
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
  // Cap by code point (never split a surrogate pair), and trim AFTER the cap:
  // a cut can leave a trailing dash behind.
  const slug = [...cleaned]
    .slice(0, 60)
    .join('')
    .replace(/^-+|-+$/g, '')
  return slug || 'task'
}

/** Next zero-padded sequential id (`task-001`, `task-002`, …). */
export function nextTaskId(prefix: string, existingIds: readonly string[]): string {
  const re = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`)
  let max = 0
  for (const id of existingIds) {
    const match = id.match(re)
    if (match && match[1]) {
      const n = Number(match[1])
      if (n > max) max = n
    }
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

/** Canonical task file name: `<id>-<slug>.md`. */
export function taskFileName(id: string, title: string): string {
  return `${id}-${slugify(title)}.md`
}
