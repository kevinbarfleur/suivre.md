import { createHash } from 'node:crypto'

/**
 * Adapter convergence WITHOUT overwriting the user's work. The generated file
 * carries a marker (version + fingerprint of the generated body). On re-run:
 * fingerprint intact → the file is ours, we may replace it; fingerprint
 * different or missing → the user has taken ownership, we don't touch it and
 * offer a `.new` instead. Pure logic, tested.
 */

const MARKER_RE = /^<!-- suivre-adapter v(\d+) content:([a-f0-9]{64}) -->\n/

/**
 * A repo with `eol=crlf` (or an editor that adds a BOM) hands back bytes we
 * never wrote. Normalize before matching AND before hashing, otherwise every
 * run reports our own file as hand-edited, with no way out.
 */
export function normalizeText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
}

export function hashBody(body: string): string {
  return createHash('sha256').update(normalizeText(body), 'utf8').digest('hex')
}

/** Body → full file, marker on top. */
export function renderAdapter(body: string, version: number): string {
  return `<!-- suivre-adapter v${version} content:${hashBody(body)} -->\n${body}`
}

export interface AdapterMarker {
  version: number
  hash: string
  body: string
}

export function parseAdapter(content: string): AdapterMarker | null {
  const normalized = normalizeText(content)
  const match = MARKER_RE.exec(normalized)
  if (!match) return null
  return {
    version: Number(match[1]),
    hash: match[2]!,
    body: normalized.slice(match[0].length),
  }
}

export type AdapterPlan =
  | { action: 'create' }
  | { action: 'update'; fromVersion: number | null }
  | { action: 'up-to-date' }
  /** File taken over by the user: do not overwrite (except with --force). */
  | { action: 'diverged'; fromVersion: number | null }
  /** Written by a newer suivre: replacing it would DOWNGRADE the contract. */
  | { action: 'newer'; fromVersion: number }

/** Decides what to do with the existing file given the current template. */
export function planAdapterWrite(
  existing: string | null,
  freshBody: string,
  freshVersion: number,
): AdapterPlan {
  if (existing === null) return { action: 'create' }
  const marker = parseAdapter(existing)
  if (!marker) return { action: 'diverged', fromVersion: null }
  const untouched = hashBody(marker.body) === marker.hash
  if (!untouched) return { action: 'diverged', fromVersion: marker.version }
  if (marker.version > freshVersion) return { action: 'newer', fromVersion: marker.version }
  if (marker.body === freshBody) return { action: 'up-to-date' }
  return { action: 'update', fromVersion: marker.version }
}

const escapeRe = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A marker counts only when it OWNS its line: quoted inside a sentence it is
 * prose, and treating it as a delimiter deletes everything up to the real block.
 */
const anchored = (marker: string): string => `^${escapeRe(marker)}[ \\t]*\\r?$`

const pairRe = (startMarker: string, endMarker: string): RegExp =>
  new RegExp(`${anchored(startMarker)}[\\s\\S]*?${anchored(endMarker)}`, 'gm')

const count = (text: string, re: RegExp): number => {
  let total = 0
  re.lastIndex = 0
  while (re.exec(text) !== null) total++
  return total
}

/** True when the text carries at least one well-formed marker pair. */
export function hasBlock(text: string, startMarker: string, endMarker: string): boolean {
  return pairRe(startMarker, endMarker).test(text)
}

export type BlockPlan =
  | { action: 'create'; content: string }
  | { action: 'update'; content: string }
  | { action: 'up-to-date' }
  /** Lone or crossed markers: any splice would eat the user's prose. */
  | { action: 'unbalanced'; starts: number; ends: number }

/**
 * Inserts or replaces marker-delimited blocks in existing content (the AGENTS.md
 * / CLAUDE.md pointer). Absent → append; present → every well-formed pair is
 * replaced in place. This file is the user's, and unlike the adapter it has no
 * fingerprint to fall back on: when the markers do not pair up we cannot tell
 * where our block ends, so we refuse rather than guess.
 */
export function upsertBlock(
  existing: string | null,
  block: string,
  startMarker: string,
  endMarker: string,
): BlockPlan {
  if (existing === null || existing.trim() === '') {
    return { action: 'create', content: `${block}\n` }
  }
  // A fenced block is documentation ABOUT the pointer, not the pointer: an
  // AGENTS.md that shows the markers inside ```md had its example overwritten
  // with the live block, and the run reported success.
  const { text, restore } = maskFences(existing)
  const pairs = pairRe(startMarker, endMarker)
  const paired = count(text, pairs)
  const starts = count(text, new RegExp(anchored(startMarker), 'gm'))
  const ends = count(text, new RegExp(anchored(endMarker), 'gm'))
  if (starts !== paired || ends !== paired) return { action: 'unbalanced', starts, ends }
  const replaced = paired > 0 ? text.replace(pairs, () => block) : `${text.trimEnd()}\n\n${block}\n`
  const next = restore(replaced)
  return next === existing ? { action: 'up-to-date' } : { action: 'update', content: next }
}

/**
 * Replaces every fenced region with a same-shape placeholder so the marker scan
 * cannot see inside one, and hands back the inverse. Fences are matched by their
 * own opening run, so a ``` inside a ~~~ block stays content.
 */
function maskFences(text: string): { text: string; restore: (masked: string) => string } {
  const fences: string[] = []
  const masked = text.replace(/^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1?\2[^\n]*$/gm, (hit) => {
    fences.push(hit)
    return `\u0000FENCE${fences.length - 1}\u0000`
  })
  return {
    text: masked,
    restore: (out) => out.replace(/\u0000FENCE(\d+)\u0000/g, (_, i) => fences[Number(i)] ?? ''),
  }
}
