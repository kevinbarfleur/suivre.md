// Parseur markdown minimal → blocs, pour le lecteur de docs. Pas de dépendance :
// on ne gère que ce que le rendu terminal affiche (titres, paragraphes, listes,
// cases à cocher, blocs de code, règles). L'inline courant est aplati en texte.

export type Block =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'p'; text: string }
  | { type: 'li'; text: string }
  | { type: 'check'; text: string; done: boolean }
  | { type: 'code'; text: string }
  | { type: 'hr' }

function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
}

export function toBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []

  const flush = (): void => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'p', text: stripInline(paragraph.join(' ').trim()) })
      paragraph = []
    }
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      flush()
      const buffer: string[] = []
      i += 1
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
        buffer.push(lines[i] ?? '')
        i += 1
      }
      i += 1 // saute la clôture
      blocks.push({ type: 'code', text: buffer.join('\n') })
      continue
    }

    if (trimmed === '') {
      flush()
      i += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flush()
      const level = (heading[1] ?? '').length
      const text = stripInline((heading[2] ?? '').trim())
      blocks.push({ type: level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3', text })
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
        text: stripInline(check[2] ?? ''),
      })
      i += 1
      continue
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed) ?? /^\d+\.\s+(.*)$/.exec(trimmed)
    if (bullet) {
      flush()
      blocks.push({ type: 'li', text: stripInline(bullet[1] ?? '') })
      i += 1
      continue
    }

    paragraph.push(trimmed)
    i += 1
  }

  flush()
  return blocks
}
