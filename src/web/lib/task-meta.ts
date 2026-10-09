import type { Task } from '../../domain'

// Metadata derived from a task for the terminal rendering (ASCII bars,
// subtask / blocking hints). Pure, testable functions.

const CHECKBOX_RE = /^[ \t]*[-*][ \t]+\[([ xX-])\]/gm
const AC_LINE_RE = /^[ \t]*[-*][ \t]+\[([ xX-])\][ \t]*(.*)$/gm
const DIACRITICS_RE = new RegExp('[\u0300-\u036f]', 'g')

export interface AcProgress {
  done: number
  total: number
}

/** Counts the checkboxes in the markdown body (Acceptance Criteria). */
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

/** Checkbox details from the body (text + state) for the detail card. */
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

/** ASCII bar of `width` blocks, filled proportionally to done/total. */
export function meter(done: number, total: number, width: number, fill = '▓', blank = '░'): Meter {
  const ratio = total > 0 ? done / total : 0
  const on = Math.max(0, Math.min(width, Math.round(ratio * width)))
  return { filled: fill.repeat(on), empty: blank.repeat(width - on) }
}

/** Subtask count: tasks whose `parent` points to `id`. */
export function subtaskCount(id: string, all: readonly Task[]): number {
  return all.filter((task) => task.frontmatter.parent === id).length
}

/** Terminal prompt slug from the project name (suivre@<slug>). */
export function slug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'backlog'
}

/** Short date for the detail card ("Jul 12"). */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
}
