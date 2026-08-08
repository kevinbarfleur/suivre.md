import { describe, expect, it } from 'vitest'
import { hasBlock, parseAdapter, planAdapterWrite, renderAdapter, upsertBlock } from './reconcile'

const BODY_V1 = '# Issue tracker: suivre.md\n\nContent v1.\n'
const BODY_V2 = '# Issue tracker: suivre.md\n\nContent v2, enriched.\n'

describe('renderAdapter / parseAdapter', () => {
  it('round-trips marker + body', () => {
    const content = renderAdapter(BODY_V1, 1)
    const marker = parseAdapter(content)
    expect(marker?.version).toBe(1)
    expect(marker?.body).toBe(BODY_V1)
  })

  it('reads a file checked out with CRLF line endings and a BOM', () => {
    const content = `﻿${renderAdapter(BODY_V1, 1).replace(/\n/g, '\r\n')}`
    const marker = parseAdapter(content)
    expect(marker?.body).toBe(BODY_V1)
  })
})

describe('planAdapterWrite', () => {
  it('missing → create', () => {
    expect(planAdapterWrite(null, BODY_V1, 1)).toEqual({ action: 'create' })
  })

  it('intact and identical → up-to-date', () => {
    const existing = renderAdapter(BODY_V1, 1)
    expect(planAdapterWrite(existing, BODY_V1, 1)).toEqual({ action: 'up-to-date' })
  })

  it('intact but newer template → update', () => {
    const existing = renderAdapter(BODY_V1, 1)
    expect(planAdapterWrite(existing, BODY_V2, 2)).toEqual({ action: 'update', fromVersion: 1 })
  })

  it('edited by the user → diverged (never overwritten)', () => {
    const edited = renderAdapter(BODY_V1, 1).replace('Content v1.', 'Customized content.')
    expect(planAdapterWrite(edited, BODY_V2, 2)).toEqual({ action: 'diverged', fromVersion: 1 })
  })

  it('no marker (hand-written) → diverged', () => {
    expect(planAdapterWrite('# My very own tracker\n', BODY_V2, 2)).toEqual({
      action: 'diverged',
      fromVersion: null,
    })
  })

  it('written by a NEWER suivre → newer (never silently downgraded)', () => {
    const existing = renderAdapter(BODY_V2, 7)
    expect(planAdapterWrite(existing, BODY_V1, 1)).toEqual({ action: 'newer', fromVersion: 7 })
  })

  it('a CRLF checkout of our own file stays up-to-date', () => {
    const existing = renderAdapter(BODY_V1, 1).replace(/\n/g, '\r\n')
    expect(planAdapterWrite(existing, BODY_V1, 1)).toEqual({ action: 'up-to-date' })
  })
})

describe('upsertBlock', () => {
  const START = '<!-- s -->'
  const END = '<!-- e -->'
  const block = `${START}\npointer\n${END}`
  const upsert = (existing: string | null) => upsertBlock(existing, block, START, END)

  it('missing file → just the block', () => {
    expect(upsert(null)).toEqual({ action: 'create', content: `${block}\n` })
  })

  it('appends at the end of an existing file', () => {
    expect(upsert('# AGENTS\n\nSome text.\n')).toEqual({
      action: 'update',
      content: `# AGENTS\n\nSome text.\n\n${block}\n`,
    })
  })

  it('replaces the existing block without touching the rest', () => {
    const existing = `# AGENTS\n\n${START}\nold pointer\n${END}\n\nMore.\n`
    expect(upsert(existing)).toEqual({
      action: 'update',
      content: `# AGENTS\n\n${block}\n\nMore.\n`,
    })
  })

  it('already converged → up-to-date, byte for byte', () => {
    const existing = `# AGENTS\n\n${block}\n\nMore.\n`
    expect(upsert(existing)).toEqual({ action: 'up-to-date' })
  })

  it('replaces EVERY well-formed pair, not just the first', () => {
    const stale = `${START}\nold\n${END}`
    const existing = `# AGENTS\n\n${stale}\n\nMiddle.\n\n${stale}\n`
    expect(upsert(existing)).toEqual({
      action: 'update',
      content: `# AGENTS\n\n${block}\n\nMiddle.\n\n${block}\n`,
    })
  })

  it('a marker QUOTED in prose is prose: the real block is what gets replaced', () => {
    const existing = `# AGENTS\n\nThe block is delimited by \`${START}\`.\n\n## Build\n\nRun npm ci.\n\n${START}\nold\n${END}\n`
    expect(upsert(existing)).toEqual({
      action: 'update',
      content: `# AGENTS\n\nThe block is delimited by \`${START}\`.\n\n## Build\n\nRun npm ci.\n\n${block}\n`,
    })
  })

  it('an orphan start marker → unbalanced, file untouched', () => {
    const existing = `# AGENTS\n\n${START}\n\n## Build\n\nRun npm ci.\n`
    expect(upsert(existing)).toEqual({ action: 'unbalanced', starts: 1, ends: 0 })
  })

  it('an orphan start marker beside a real block → unbalanced, file untouched', () => {
    const existing = `# AGENTS\n\n${START}\n\n## Build\n\nRun npm ci.\n\n${block}\n`
    expect(upsert(existing)).toEqual({ action: 'unbalanced', starts: 2, ends: 1 })
  })

  it('end before start → unbalanced (never appends, never grows)', () => {
    const existing = `# AGENTS\n\n${END}\n\ntext\n\n${START}\n`
    expect(upsert(existing)).toEqual({ action: 'unbalanced', starts: 1, ends: 1 })
  })

  it('is idempotent on a CRLF file', () => {
    const first = upsert('# AGENTS\r\n\r\nSome text.\r\n')
    expect(first.action).toBe('update')
    const content = first.action === 'update' ? first.content : ''
    expect(upsert(content)).toEqual({ action: 'up-to-date' })
  })
})

describe('hasBlock', () => {
  const START = '<!-- s -->'
  const END = '<!-- e -->'

  it('is true only for a well-formed pair, each marker owning its line', () => {
    expect(hasBlock(`a\n${START}\nx\n${END}\nb\n`, START, END)).toBe(true)
    expect(hasBlock(`see \`${START}\` and \`${END}\`\n`, START, END)).toBe(false)
    expect(hasBlock(`${END}\n${START}\n`, START, END)).toBe(false)
  })
})
