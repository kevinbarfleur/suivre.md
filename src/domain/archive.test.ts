import { describe, expect, it } from 'vitest'
import { buildArchive } from './archive'
import type { Decision } from './decision'
import type { Doc } from './doc'
import type { Task } from './types'

function task(id: string, status: string, body = 'corps de tâche', updated = '2026-01-01'): Task {
  return {
    frontmatter: {
      id,
      title: id,
      status,
      order: 'a',
      labels: [],
      depends: [],
      created: updated,
      updated,
    },
    body,
    fileName: `${id}.md`,
  }
}
function decision(
  id: string,
  status: Decision['frontmatter']['status'],
  date = '2026-02-01',
): Decision {
  return {
    frontmatter: { id, title: id, status, date, labels: [] },
    body: 'contexte',
    fileName: `${id}.md`,
  }
}
function doc(id: string, updated = '2026-03-01'): Doc {
  return {
    frontmatter: { id, title: id, tags: [], updated },
    body: 'doc body',
    fileName: `${id}.md`,
  }
}

describe('buildArchive', () => {
  it('inclut les tâches au statut archived, exclut les tâches actives', () => {
    const out = buildArchive({
      tasks: [
        { item: task('t-active', 'done'), inArchiveFolder: false },
        { item: task('t-arch', 'archived'), inArchiveFolder: false },
      ],
      decisions: [],
      docs: [],
    })
    expect(out.map((e) => e.id)).toEqual(['t-arch'])
    expect(out[0]!.reason).toBe('status')
    expect(out[0]!.type).toBe('task')
  })

  it('inclut tout item rangé dans un dossier archive/, quel que soit son statut', () => {
    const out = buildArchive({
      tasks: [{ item: task('t-done', 'done'), inArchiveFolder: true }],
      decisions: [{ item: decision('d-acc', 'accepted'), inArchiveFolder: true }],
      docs: [{ item: doc('doc-1'), inArchiveFolder: true }],
    })
    expect(out.map((e) => e.id).sort()).toEqual(['d-acc', 'doc-1', 't-done'])
    expect(out.every((e) => e.reason === 'folder')).toBe(true)
  })

  it('inclut les décisions superseded/rejected, exclut les décisions vivantes', () => {
    const out = buildArchive({
      tasks: [],
      decisions: [
        { item: decision('d-sup', 'superseded'), inArchiveFolder: false },
        { item: decision('d-rej', 'rejected'), inArchiveFolder: false },
        { item: decision('d-acc', 'accepted'), inArchiveFolder: false },
        { item: decision('d-prop', 'proposed'), inArchiveFolder: false },
      ],
      docs: [],
    })
    expect(out.map((e) => e.id).sort()).toEqual(['d-rej', 'd-sup'])
  })

  it("n'archive un doc que via le dossier archive/ (docs sans statut)", () => {
    const out = buildArchive({
      tasks: [],
      decisions: [],
      docs: [
        { item: doc('doc-active'), inArchiveFolder: false },
        { item: doc('doc-arch'), inArchiveFolder: true },
      ],
    })
    expect(out.map((e) => e.id)).toEqual(['doc-arch'])
    expect(out[0]!.status).toBeNull()
  })

  it('trie par date décroissante et normalise les champs', () => {
    const out = buildArchive({
      tasks: [{ item: task('t', 'archived', 'ligne un', '2026-01-01'), inArchiveFolder: false }],
      decisions: [{ item: decision('d', 'superseded', '2026-05-01'), inArchiveFolder: false }],
      docs: [{ item: doc('doc-1', '2026-03-01'), inArchiveFolder: true }],
    })
    expect(out.map((e) => e.id)).toEqual(['d', 'doc-1', 't'])
    expect(out.find((e) => e.id === 't')!.excerpt).toBe('ligne un')
  })
})
