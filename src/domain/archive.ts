import type { Decision } from './decision'
import type { Doc } from './doc'
import type { Task } from './types'

// "Archives" view: a unified list across all types (tasks, decisions, docs).
// An item is archived if it carries an archive status OR if it lives in its
// collection's `archive/` subfolder. These functions are pure: disk reads
// (archive/ folders) live in `storage`.

/** Reserved task status: an "archived" task leaves the active board and
 *  only shows up in the archives. It is not a column. */
export const ARCHIVED_STATUS = 'archived'

/** Decision (ADR) statuses considered historical, hence archived. */
export const ARCHIVED_DECISION_STATUSES: readonly string[] = ['superseded', 'rejected']

export type ArchivedType = 'task' | 'decision' | 'doc'

/** Normalized row of the archives view, independent of the source type. */
export interface ArchivedEntry {
  type: ArchivedType
  id: string
  title: string
  /** ISO reference date (task.updated / decision.date / doc.updated). */
  date: string
  /** Labels (task.labels / decision.labels / doc.tags). */
  labels: string[]
  /** Original status when it carries meaning (task/decision), otherwise null. */
  status: string | null
  /** Why it is archived: the item's status, or an `archive/` folder. */
  reason: 'status' | 'folder'
  fileName: string
  /** Full markdown body (rendered in the detail panel). */
  body: string
  /** First content line, for search and preview. */
  excerpt: string
}

/** An item read from disk, with whether it came from an archive/ folder. */
export interface Located<T> {
  item: T
  inArchiveFolder: boolean
}

export interface ArchiveInput {
  tasks: Located<Task>[]
  decisions: Located<Decision>[]
  docs: Located<Doc>[]
}

function excerptOf(body: string): string {
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('---') || line.startsWith('```')) continue
    return line.length > 160 ? `${line.slice(0, 159)}…` : line
  }
  return ''
}

export function isTaskArchived(task: Task, inArchiveFolder: boolean): boolean {
  return inArchiveFolder || task.frontmatter.status === ARCHIVED_STATUS
}

export function isDecisionArchived(decision: Decision, inArchiveFolder: boolean): boolean {
  return inArchiveFolder || ARCHIVED_DECISION_STATUSES.includes(decision.frontmatter.status)
}

export function isDocArchived(_doc: Doc, inArchiveFolder: boolean): boolean {
  return inArchiveFolder
}

function taskEntry(task: Task, inFolder: boolean): ArchivedEntry {
  return {
    type: 'task',
    id: task.frontmatter.id,
    title: task.frontmatter.title,
    date: task.frontmatter.updated,
    labels: task.frontmatter.labels,
    status: task.frontmatter.status,
    reason: inFolder ? 'folder' : 'status',
    fileName: task.fileName,
    body: task.body,
    excerpt: excerptOf(task.body),
  }
}

function decisionEntry(decision: Decision, inFolder: boolean): ArchivedEntry {
  return {
    type: 'decision',
    id: decision.frontmatter.id,
    title: decision.frontmatter.title,
    date: decision.frontmatter.date,
    labels: decision.frontmatter.labels,
    status: decision.frontmatter.status,
    reason: inFolder ? 'folder' : 'status',
    fileName: decision.fileName,
    body: decision.body,
    excerpt: excerptOf(decision.body),
  }
}

function docEntry(doc: Doc, inFolder: boolean): ArchivedEntry {
  return {
    type: 'doc',
    id: doc.frontmatter.id,
    title: doc.frontmatter.title,
    date: doc.frontmatter.updated,
    labels: doc.frontmatter.tags,
    status: null,
    reason: inFolder ? 'folder' : 'status',
    fileName: doc.fileName,
    body: doc.body,
    excerpt: excerptOf(doc.body),
  }
}

/**
 * Builds the unified archive list from the items read (active + archive/
 * folders). Keeps only the items actually archived, sorted by descending
 * date. It can be given ALL items: the filtering happens here.
 */
export function buildArchive(input: ArchiveInput): ArchivedEntry[] {
  const entries: ArchivedEntry[] = []
  for (const { item, inArchiveFolder } of input.tasks) {
    if (isTaskArchived(item, inArchiveFolder)) entries.push(taskEntry(item, inArchiveFolder))
  }
  for (const { item, inArchiveFolder } of input.decisions) {
    if (isDecisionArchived(item, inArchiveFolder))
      entries.push(decisionEntry(item, inArchiveFolder))
  }
  for (const { item, inArchiveFolder } of input.docs) {
    if (isDocArchived(item, inArchiveFolder)) entries.push(docEntry(item, inArchiveFolder))
  }
  return entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}
