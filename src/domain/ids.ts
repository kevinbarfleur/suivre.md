/** Génération d'identifiants et de noms de fichiers de tâche. */

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Slug ASCII pour un nom de fichier lisible (diacritiques repliés, borné à 60). */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'task'
}

/** Prochain id séquentiel zéro-paddé (`task-001`, `task-002`, …). */
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

/** Nom de fichier canonique d'une tâche : `<id>-<slug>.md`. */
export function taskFileName(id: string, title: string): string {
  return `${id}-${slugify(title)}.md`
}
