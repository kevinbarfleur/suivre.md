import type { Column, Priority, Task } from '../../domain'
import { acProgress } from './task-meta'

// Agrégations pures pour l'overview et l'analyse de dépendances. Aucune I/O,
// aucune dépendance Vue — testables isolément.

export interface Dist {
  key: string
  label: string
  count: number
}

export function byStatus(tasks: readonly Task[], columns: readonly Column[]): Dist[] {
  return columns.map((c) => ({
    key: c.id,
    label: c.label,
    count: tasks.filter((t) => t.frontmatter.status === c.id).length,
  }))
}

const PRIORITIES: { key: Priority | 'none'; label: string }[] = [
  { key: 'urgent', label: 'urgent' },
  { key: 'high', label: 'high' },
  { key: 'medium', label: 'medium' },
  { key: 'low', label: 'low' },
  { key: 'none', label: 'sans' },
]

export function byPriority(tasks: readonly Task[]): Dist[] {
  return PRIORITIES.map((p) => ({
    key: p.key,
    label: p.label,
    count: tasks.filter((t) => (t.frontmatter.priority ?? 'none') === p.key).length,
  }))
}

export function byLabel(tasks: readonly Task[], limit = 8): Dist[] {
  const counts = new Map<string, number>()
  for (const t of tasks)
    for (const l of t.frontmatter.labels) counts.set(l, (counts.get(l) ?? 0) + 1)
  return [...counts.entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export function byAssignee(tasks: readonly Task[]): Dist[] {
  const counts = new Map<string, number>()
  for (const t of tasks) {
    const a = t.frontmatter.assignee
    if (a) counts.set(a, (counts.get(a) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count)
}

export interface Fresh {
  id: string
  title: string
  date: string
}

export function oldestOpen(tasks: readonly Task[], doneId = 'done', limit = 4): Fresh[] {
  return tasks
    .filter((t) => t.frontmatter.status !== doneId)
    .slice()
    .sort((a, b) => a.frontmatter.created.localeCompare(b.frontmatter.created))
    .slice(0, limit)
    .map((t) => ({ id: t.frontmatter.id, title: t.frontmatter.title, date: t.frontmatter.created }))
}

export function recentlyUpdated(tasks: readonly Task[], limit = 4): Fresh[] {
  return tasks
    .slice()
    .sort((a, b) => b.frontmatter.updated.localeCompare(a.frontmatter.updated))
    .slice(0, limit)
    .map((t) => ({ id: t.frontmatter.id, title: t.frontmatter.title, date: t.frontmatter.updated }))
}

export function acAggregate(tasks: readonly Task[]): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const t of tasks) {
    const p = acProgress(t.body)
    done += p.done
    total += p.total
  }
  return { done, total }
}

// --- Dépendances ---

export interface Blocker {
  id: string
  statusLabel: string
  resolved: boolean
}
export interface BlockedTask {
  id: string
  title: string
  blockers: Blocker[]
}

function labelOf(columns: readonly Column[], status: string): string {
  return columns.find((c) => c.id === status)?.label ?? status
}

/** Tâches non terminées avec au moins un bloqueur non résolu. */
export function blockedTasks(tasks: readonly Task[], columns: readonly Column[]): BlockedTask[] {
  const byId = new Map(tasks.map((t) => [t.frontmatter.id, t]))
  const result: BlockedTask[] = []
  for (const t of tasks) {
    if (t.frontmatter.status === 'done' || t.frontmatter.depends.length === 0) continue
    const blockers = t.frontmatter.depends.map((id) => {
      const dep = byId.get(id)
      const status = dep?.frontmatter.status
      return {
        id,
        statusLabel: dep ? labelOf(columns, status ?? '') : 'inconnu',
        resolved: status === 'done',
      }
    })
    if (blockers.some((b) => !b.resolved)) {
      result.push({ id: t.frontmatter.id, title: t.frontmatter.title, blockers })
    }
  }
  return result
}

export interface Impact {
  id: string
  title: string
  count: number
}

/** Bloqueurs à fort impact : tâches ouvertes dont dépendent d'autres tâches ouvertes. */
export function highImpact(tasks: readonly Task[], limit = 6): Impact[] {
  const dependents = new Map<string, number>()
  const open = tasks.filter((t) => t.frontmatter.status !== 'done')
  for (const t of open)
    for (const d of t.frontmatter.depends) dependents.set(d, (dependents.get(d) ?? 0) + 1)
  return open
    .filter((t) => (dependents.get(t.frontmatter.id) ?? 0) > 0)
    .map((t) => ({
      id: t.frontmatter.id,
      title: t.frontmatter.title,
      count: dependents.get(t.frontmatter.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export interface ParentGroup {
  id: string
  title: string
  done: number
  total: number
  children: { id: string; title: string; statusLabel: string; done: boolean }[]
}

export function parentGroups(tasks: readonly Task[], columns: readonly Column[]): ParentGroup[] {
  const byId = new Map(tasks.map((t) => [t.frontmatter.id, t]))
  const groups = new Map<string, Task[]>()
  for (const t of tasks) {
    const parent = t.frontmatter.parent
    if (!parent) continue
    const bucket = groups.get(parent) ?? []
    bucket.push(t)
    groups.set(parent, bucket)
  }
  const result: ParentGroup[] = []
  for (const [pid, children] of groups) {
    const done = children.filter((c) => c.frontmatter.status === 'done').length
    result.push({
      id: pid,
      title: byId.get(pid)?.frontmatter.title ?? pid,
      done,
      total: children.length,
      children: children.map((c) => ({
        id: c.frontmatter.id,
        title: c.frontmatter.title,
        statusLabel: labelOf(columns, c.frontmatter.status),
        done: c.frontmatter.status === 'done',
      })),
    })
  }
  return result
}

export interface Cycle {
  a: string
  b: string
}

/** Cycles directs (A dépend de B et B dépend de A) — signal honnête, jamais masqué. */
export function directCycles(tasks: readonly Task[]): Cycle[] {
  const deps = new Map(tasks.map((t) => [t.frontmatter.id, t.frontmatter.depends]))
  const seen = new Set<string>()
  const result: Cycle[] = []
  for (const [id, list] of deps) {
    for (const d of list) {
      if ((deps.get(d) ?? []).includes(id)) {
        const key = [id, d].sort().join('|')
        if (!seen.has(key)) {
          seen.add(key)
          result.push({ a: id, b: d })
        }
      }
    }
  }
  return result
}
