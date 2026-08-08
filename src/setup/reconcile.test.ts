import { describe, expect, it } from 'vitest'
import { parseAdapter, planAdapterWrite, renderAdapter, upsertBlock } from './reconcile'

const BODY_V1 = '# Issue tracker: suivre.md\n\nContent v1.\n'
const BODY_V2 = '# Issue tracker: suivre.md\n\nContent v2, enriched.\n'

describe('renderAdapter / parseAdapter', () => {
  it('round-trips marker + body', () => {
    const content = renderAdapter(BODY_V1, 1)
    const marker = parseAdapter(content)
    expect(marker?.version).toBe(1)
    expect(marker?.body).toBe(BODY_V1)
  })
})

describe('planAdapterWrite', () => {
  it('missing → create', () => {
    expect(planAdapterWrite(null, BODY_V1)).toEqual({ action: 'create' })
  })

  it('intact and identical → up-to-date', () => {
    const existing = renderAdapter(BODY_V1, 1)
    expect(planAdapterWrite(existing, BODY_V1)).toEqual({ action: 'up-to-date' })
  })

  it('intact but newer template → update', () => {
    const existing = renderAdapter(BODY_V1, 1)
    expect(planAdapterWrite(existing, BODY_V2)).toEqual({ action: 'update', fromVersion: 1 })
  })

  it('edited by the user → diverged (never overwritten)', () => {
    const edited = renderAdapter(BODY_V1, 1).replace('Content v1.', 'Customized content.')
    expect(planAdapterWrite(edited, BODY_V2)).toEqual({ action: 'diverged', fromVersion: 1 })
  })

  it('no marker (hand-written) → diverged', () => {
    expect(planAdapterWrite('# My very own tracker\n', BODY_V2)).toEqual({
      action: 'diverged',
      fromVersion: null,
    })
  })
})

describe('upsertBlock', () => {
  const block = '<!-- s -->\npointer\n<!-- e -->'

  it('missing file → just the block', () => {
    expect(upsertBlock(null, block, '<!-- s -->', '<!-- e -->')).toBe(`${block}\n`)
  })

  it('appends at the end of an existing file', () => {
    const out = upsertBlock('# AGENTS\n\nSome text.\n', block, '<!-- s -->', '<!-- e -->')
    expect(out).toBe(`# AGENTS\n\nSome text.\n\n${block}\n`)
  })

  it('replaces the existing block without touching the rest', () => {
    const existing = `# AGENTS\n\n<!-- s -->\nold pointer\n<!-- e -->\n\nMore.\n`
    const out = upsertBlock(existing, block, '<!-- s -->', '<!-- e -->')
    expect(out).toBe(`# AGENTS\n\n${block}\n\nMore.\n`)
  })
})
