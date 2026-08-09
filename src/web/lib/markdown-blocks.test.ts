import { describe, expect, it } from 'vitest'
import { parseInline, toBlocks, numberGutter } from './markdown-blocks'

describe('parseInline', () => {
  it('renders the marks instead of stripping them', () => {
    const runs = parseInline('a **b** and `c` and *d* and ~~e~~')
    expect(runs.map((r) => r.kind)).toEqual([
      'text',
      'bold',
      'text',
      'code',
      'text',
      'em',
      'text',
      'strike',
    ])
  })

  it('keeps a link destination and flags externals', () => {
    const [run] = parseInline('[docs](https://example.com)')
    expect(run).toEqual({
      kind: 'link',
      text: 'docs',
      href: 'https://example.com',
      external: true,
    })
    const [local] = parseInline('[task](#board/task-001)')
    expect(local).toMatchObject({ kind: 'link', external: false })
  })

  it('renders a dangerous destination as plain text, never as an anchor', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,x', 'vbscript:x']) {
      const runs = parseInline(`[click](${href})`)
      expect(runs.some((r) => r.kind === 'link')).toBe(false)
      expect(runs.map((r) => r.text).join('')).toContain('click')
    }
  })

  it('returns one text run when there is nothing to mark', () => {
    expect(parseInline('plain')).toEqual([{ kind: 'text', text: 'plain' }])
  })
})

describe('toBlocks', () => {
  it('parses a table with alignments', () => {
    const [block] = toBlocks('| a | b |\n|:--|--:|\n| 1 | 2 |')
    expect(block).toMatchObject({
      type: 'table',
      head: [
        { text: 'a', align: 'left' },
        { text: 'b', align: 'right' },
      ],
    })
    expect(block?.type === 'table' ? block.rows : []).toHaveLength(1)
  })

  it('parses a blockquote into paragraphs', () => {
    const [block] = toBlocks('> one\n>\n> two')
    expect(block).toMatchObject({ type: 'quote' })
    expect(block?.type === 'quote' ? block.paragraphs : []).toHaveLength(2)
  })

  it('keeps ordered and unordered lists apart, with their depth', () => {
    const blocks = toBlocks('1. first\n- flat\n  - nested')
    expect(blocks.map((b) => b.type)).toEqual(['ol', 'li', 'li'])
    expect(blocks[1]).toMatchObject({ depth: 0 })
    expect(blocks[2]).toMatchObject({ depth: 1 })
  })

  it('reads a fenced block language', () => {
    const [block] = toBlocks('```bash\nsuivre list\n```')
    expect(block).toEqual({ type: 'code', text: 'suivre list', lang: 'bash' })
  })

  it('caps headings at h4', () => {
    expect(toBlocks('###### deep')[0]).toMatchObject({ type: 'h4' })
  })

  it('keeps checkboxes, with their state', () => {
    const blocks = toBlocks('- [x] done\n- [ ] open')
    expect(blocks).toMatchObject([
      { type: 'check', done: true },
      { type: 'check', done: false },
    ])
  })
})

describe('numberGutter', () => {
  it('sizes the gutter on the widest marker', () => {
    expect(numberGutter(toBlocks('1. a'))).toBe('2ch')
    expect(numberGutter(toBlocks('10. a'))).toBe('3ch')
  })
})
