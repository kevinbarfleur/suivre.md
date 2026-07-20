import type { Decision } from './decision'
import type { Doc } from './doc'
import type { Task } from './types'

// Vue « archives » : liste unifiée, tous types confondus (tâches, décisions,
// docs). Un item est archivé s'il porte un statut d'archive OU s'il est rangé
// dans le sous-dossier `archive/` de sa collection. Ces fonctions sont pures :
// la lecture disque (dossiers archive/) vit dans `storage`.

/** Statut de tâche réservé : une tâche « archived » quitte le board actif et
 *  n'apparaît plus que dans les archives. Ce n'est pas une colonne. */
export const ARCHIVED_STATUS = 'archived'

/** Statuts de décision (ADR) considérés comme historiques donc archivés. */
export const ARCHIVED_DECISION_STATUSES: readonly string[] = ['superseded', 'rejected']

export type ArchivedType = 'task' | 'decision' | 'doc'

/** Ligne normalisée de la vue archives, indépendante du type d'origine. */
export interface ArchivedEntry {
  type: ArchivedType
  id: string
  title: string
  /** Date de référence ISO (task.updated / decision.date / doc.updated). */
  date: string
  /** Étiquettes (task.labels / decision.labels / doc.tags). */
  labels: string[]
  /** Statut d'origine quand il est porteur de sens (task/decision), sinon null. */
  status: string | null
  /** Pourquoi c'est archivé : le statut de l'item, ou un dossier `archive/`. */
  reason: 'status' | 'folder'
  fileName: string
  /** Corps markdown complet (rendu dans le panneau de détail). */
  body: string
  /** Première ligne de contenu, pour la recherche et l'aperçu. */
  excerpt: string
}

/** Un item lu depuis le disque, avec l'info « venait-il d'un dossier archive/ ». */
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
 * Construit la liste unifiée des archives à partir des items lus (actifs +
 * dossiers archive/). Ne garde que les items réellement archivés, triés par
 * date décroissante. On peut lui passer TOUS les items : le filtrage est ici.
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
