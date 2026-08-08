import { describe, expect, it } from 'vitest'
import { parseTask, safeParseTask, serializeTask } from './markdown'
import type { Task } from './types'

const BOM = '\uFEFF'

const sample: Task = {
  frontmatter: {
    id: 'task-001',
    title: 'Task title',
    status: 'todo',
    priority: 'high',
    labels: ['ui', 'bug'],
    order: 'a0',
    depends: [],
    created: '2026-07-20T10:00:00Z',
    updated: '2026-07-20T10:00:00Z',
  },
  body: '## Description\n\nUn corps.',
  fileName: 'task-001-titre-de-la-tache.md',
}

describe('markdown', () => {
  it('round-trip parse ∘ serialize stable', () => {
    const raw = serializeTask(sample)
    const parsed = parseTask(raw, sample.fileName)
    expect(parsed.frontmatter).toEqual(sample.frontmatter)
    expect(parsed.body).toBe(sample.body)
  })

  it('omits absent optionals and empty arrays', () => {
    const raw = serializeTask(sample)
    expect(raw).not.toContain('assignee')
    expect(raw).not.toContain('parent')
    expect(raw).not.toContain('depends')
  })

  it('throws without frontmatter', () => {
    expect(() => parseTask('juste du texte', 'x.md')).toThrow()
  })

  it('throws on invalid frontmatter (missing title)', () => {
    const bad = '---\nid: task-1\nstatus: todo\norder: a0\ncreated: x\nupdated: x\n---\n'
    expect(() => parseTask(bad, 'x.md')).toThrow()
  })

  it('names the file and the field in every failure', () => {
    const missing = '---\nid: task-1\nstatus: todo\norder: a0\ncreated: x\nupdated: x\n---\n'
    expect(() => parseTask(missing, 'broken.md')).toThrow(/broken\.md/)
    expect(() => parseTask(missing, 'broken.md')).toThrow(/title/)
    expect(() => parseTask('# just a readme', 'README.md')).toThrow(/README\.md/)
    // A merge conflict leaves markers inside the frontmatter: invalid YAML.
    const conflict = `---\nid: task-1\n<<<<<<< HEAD\ntitle: [a\n=======\n---\n`
    expect(() => parseTask(conflict, 'conflict.md')).toThrow(/conflict\.md/)
  })

  it('tolerates a leading UTF-8 BOM', () => {
    const parsed = parseTask(`${BOM}${serializeTask(sample)}`, sample.fileName)
    expect(parsed.frontmatter).toEqual(sample.frontmatter)
  })

  it('tolerates CRLF line endings', () => {
    const parsed = parseTask(serializeTask(sample).replace(/\n/g, '\r\n'), sample.fileName)
    expect(parsed.frontmatter.id).toBe('task-001')
  })
})

describe('safeParseTask', () => {
  it('returns the task on valid input', () => {
    const result = safeParseTask(serializeTask(sample), sample.fileName)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.task.frontmatter.id).toBe('task-001')
  })

  it('returns the file name and a readable message on invalid input', () => {
    const result = safeParseTask('# A stray readme', 'README.md')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.fileName).toBe('README.md')
      expect(result.message).toContain('README.md')
    }
  })

  it('accepts a BOM-prefixed file', () => {
    expect(safeParseTask(`${BOM}${serializeTask(sample)}`, sample.fileName).ok).toBe(true)
  })
})
