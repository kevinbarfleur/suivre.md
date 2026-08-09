// Terminal markdown parser. The inline layer is PARSED, not stripped: bold,
// italic, inline code, strikethrough and links survive to the renderer, which
// is the whole point of the document views. Dependency-free on purpose — the
// board ships offline and a markdown library would be the only runtime dep.

export type Align = 'left' | 'center' | 'right'

/** A stretch of inline text with at most one mark on it. */
export type Run =
  | { kind: 'text'; text: string }
  | { kind: 'bold'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strike'; text: string }
  | { kind: 'link'; text: string; href: string; external: boolean }

export interface Cell {
  runs: Run[]
  align: Align
}

export interface HeadCell {
  text: string
  align: Align
}

export type Block =
  | { type: 'h1' | 'h2' | 'h3' | 'h4'; runs: Run[] }
  | { type: 'p'; runs: Run[] }
  | { type: 'li'; runs: Run[]; depth: number }
  | { type: 'ol'; num: string; runs: Run[]; depth: number }
  | { type: 'check'; done: boolean; runs: Run[]; depth: number }
  | { type: 'quote'; paragraphs: { runs: Run[] }[] }
  | { type: 'table'; head: HeadCell[]; rows: { cells: Cell[] }[] }
  | { type: 'code'; text: string; lang: string }
  | { type: 'hr' }

const INLINE = /\*\*([^*]+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*([^*\n]+)\*|~~([^~]+)~~/g

/**
 * Bodies are written by agents and by hand, so a link destination is untrusted
 * input. Anything that is not an ordinary navigation is rendered as plain text
 * rather than as an anchor.
 */
const SAFE_HREF = /^(https?:\/\/|mailto:|[./#?]|[\w.-]+\/)/i

export function parseInline(text: string): Run[] {
  const runs: Run[] = []
  let last = 0
  let match: RegExpExecArray | null
  INLINE.lastIndex = 0
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) runs.push({ kind: 'text', text: text.slice(last, match.index) })
    if (match[1] != null) runs.push({ kind: 'bold', text: match[1] })
    else if (match[2] != null) runs.push({ kind: 'code', text: match[2] })
    else if (match[3] != null) {
      const href = match[4] ?? ''
      if (SAFE_HREF.test(href)) {
        runs.push({ kind: 'link', text: match[3], href, external: /^https?:/i.test(href) })
      } else {
        runs.push({ kind: 'text', text: match[3] })
      }
    } else if (match[5] != null) runs.push({ kind: 'em', text: match[5] })
    else if (match[6] != null) runs.push({ kind: 'strike', text: match[6] })
    last = match.index + match[0].length
  }
  if (last < text.length) runs.push({ kind: 'text', text: text.slice(last) })
  return runs.length > 0 ? runs : [{ kind: 'text', text }]
}

/** Nesting depth in units of two spaces, capped so a stray tab cannot run away. */
function indentOf(line: string): number {
  const lead = /^[ \t]*/.exec(line)?.[0] ?? ''
  return Math.min(3, Math.floor(lead.replace(/\t/g, '  ').length / 2))
}

const isTableRow = (line: string): boolean => line.includes('|')
const isTableSep = (line: string): boolean =>
  /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-')

const splitRow = (line: string): string[] =>
  line
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((cell) => cell.trim())

const alignOf = (spec: string): Align =>
  spec.startsWith(':') && spec.endsWith(':') ? 'center' : spec.endsWith(':') ? 'right' : 'left'

export function toBlocks(markdown: string): Block[] {
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'p', runs: parseInline(paragraph.join(' ').trim()) })
      paragraph = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flush()
      const lang = trimmed.slice(3).trim()
      const buffer: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
        buffer.push(lines[i] ?? '')
        i += 1
      }
      i += 1
      blocks.push({ type: 'code', text: buffer.join('\n'), lang })
      continue
    }

    if (trimmed === '') {
      flush()
      i += 1
      continue
    }

    if (trimmed.startsWith('>')) {
      flush()
      const buffer: string[] = []
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('>')) {
        buffer.push((lines[i] ?? '').trim().replace(/^>\s?/, ''))
        i += 1
      }
      const paragraphs = buffer
        .join('\n')
        .split(/\n\s*\n/)
        .map((part) => ({ runs: parseInline(part.replace(/\n/g, ' ').trim()) }))
      blocks.push({ type: 'quote', paragraphs })
      continue
    }

    if (isTableRow(trimmed) && isTableSep((lines[i + 1] ?? '').trim())) {
      flush()
      const head = splitRow(trimmed)
      const aligns = splitRow((lines[i + 1] ?? '').trim()).map(alignOf)
      i += 2
      const rows: { cells: Cell[] }[] = []
      while (i < lines.length && isTableRow((lines[i] ?? '').trim())) {
        rows.push({
          cells: splitRow((lines[i] ?? '').trim()).map((cell, n) => ({
            runs: parseInline(cell),
            align: aligns[n] ?? 'left',
          })),
        })
        i += 1
      }
      blocks.push({
        type: 'table',
        head: head.map((text, n) => ({ text, align: aligns[n] ?? 'left' })),
        rows,
      })
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flush()
      const level = Math.min(4, (heading[1] ?? '').length)
      blocks.push({
        type: `h${level}` as 'h1' | 'h2' | 'h3' | 'h4',
        runs: parseInline((heading[2] ?? '').trim()),
      })
      i += 1
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush()
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    const check = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(trimmed)
    if (check) {
      flush()
      blocks.push({
        type: 'check',
        done: (check[1] ?? '').toLowerCase() === 'x',
        runs: parseInline(check[2] ?? ''),
        depth: indentOf(line),
      })
      i += 1
      continue
    }

    const ordered = /^(\d+)\.\s+(.*)$/.exec(trimmed)
    if (ordered) {
      flush()
      blocks.push({
        type: 'ol',
        num: `${ordered[1]}.`,
        runs: parseInline(ordered[2] ?? ''),
        depth: indentOf(line),
      })
      i += 1
      continue
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed)
    if (bullet) {
      flush()
      blocks.push({ type: 'li', runs: parseInline(bullet[1] ?? ''), depth: indentOf(line) })
      i += 1
      continue
    }

    paragraph.push(trimmed)
    i += 1
  }

  flush()
  return blocks
}

/** Widest ordered-list marker, so the numbers align in one gutter. */
export function numberGutter(blocks: readonly Block[]): string {
  const widest = blocks.reduce((w, b) => (b.type === 'ol' ? Math.max(w, b.num.length) : w), 2)
  return `${widest}ch`
}
