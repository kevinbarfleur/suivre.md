import type { Task } from '../../domain'

// Métadonnées dérivées d'une tâche pour le rendu terminal (barres ASCII,
// indices de sous-tâches / blocage). Fonctions pures, testables.

const CHECKBOX_RE = /^[ \t]*[-*][ \t]+\[([ xX-])\]/gm
const AC_LINE_RE = /^[ \t]*[-*][ \t]+\[([ xX-])\][ \t]*(.*)$/gm
const DIACRITICS_RE = new RegExp('[\u0300-\u036f]', 'g')

export interface AcProgress {
  done: number
  total: number
}

/** Compte les cases à cocher du corps markdown (Acceptance Criteria). */
export function acProgress(body: string): AcProgress {
  let done = 0
  let total = 0
  for (const match of body.matchAll(CHECKBOX_RE)) {
    total += 1
    const mark = match[1]
    if (mark === 'x' || mark === 'X') done += 1
  }
  return { done, total }
}

export interface AcItem {
  text: string
  done: boolean
}

/** Détail des cases à cocher du corps (texte + état) pour la fiche. */
export function acItems(body: string): AcItem[] {
  const items: AcItem[] = []
  for (const match of body.matchAll(AC_LINE_RE)) {
    const mark = match[1]
    items.push({ text: (match[2] ?? '').trim(), done: mark === 'x' || mark === 'X' })
  }
  return items
}

export interface Meter {
  filled: string
  empty: string
}

/** Barre ASCII de `width` blocs, remplis au prorata de done/total. */
export function meter(done: number, total: number, width: number, fill = '▓', blank = '░'): Meter {
  const ratio = total > 0 ? done / total : 0
  const on = Math.max(0, Math.min(width, Math.round(ratio * width)))
  return { filled: fill.repeat(on), empty: blank.repeat(width - on) }
}

/** Nombre de sous-tâches : tâches dont `parent` pointe vers `id`. */
export function subtaskCount(id: string, all: readonly Task[]): number {
  return all.filter((task) => task.frontmatter.parent === id).length
}

/** Première dépendance bloquante d'une tâche, s'il y en a une. */
export function blockedBy(task: Task): string | null {
  return task.frontmatter.depends[0] ?? null
}

/** Slug d'invite terminal à partir du nom du projet (kevin@<slug>). */
export function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'backlog'
}

/** Date courte pour la fiche (« 12 juil. »). */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}
