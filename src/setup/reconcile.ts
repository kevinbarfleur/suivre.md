import { createHash } from 'node:crypto'

/**
 * Adapter convergence WITHOUT overwriting the user's work. The generated file
 * carries a marker (version + fingerprint of the generated body). On re-run:
 * fingerprint intact → the file is ours, we may replace it; fingerprint
 * different or missing → the user has taken ownership, we don't touch it and
 * offer a `.new` instead. Pure logic, tested.
 */

const MARKER_RE = /^<!-- suivre-adapter v(\d+) content:([a-f0-9]{64}) -->\n/

export function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
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
  const match = MARKER_RE.exec(content)
  if (!match) return null
  return {
    version: Number(match[1]),
    hash: match[2]!,
    body: content.slice(match[0].length),
  }
}

export type AdapterPlan =
  | { action: 'create' }
  | { action: 'update'; fromVersion: number | null }
  | { action: 'up-to-date' }
  /** File taken over by the user: do not overwrite (except with --force). */
  | { action: 'diverged'; fromVersion: number | null }

/** Decides what to do with the existing file given the current template. */
export function planAdapterWrite(existing: string | null, freshBody: string): AdapterPlan {
  if (existing === null) return { action: 'create' }
  const marker = parseAdapter(existing)
  if (!marker) return { action: 'diverged', fromVersion: null }
  const untouched = hashBody(marker.body) === marker.hash
  if (!untouched) return { action: 'diverged', fromVersion: marker.version }
  if (marker.body === freshBody) return { action: 'up-to-date' }
  return { action: 'update', fromVersion: marker.version }
}

/**
 * Inserts or replaces a marker-delimited block in existing content
 * (AGENTS.md). Absent → append; present → replaced in place.
 */
export function upsertBlock(
  existing: string | null,
  block: string,
  startMarker: string,
  endMarker: string,
): string {
  if (existing === null || existing.trim() === '') return `${block}\n`
  const start = existing.indexOf(startMarker)
  const end = existing.indexOf(endMarker)
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start)
    const after = existing.slice(end + endMarker.length)
    return `${before}${block}${after}`
  }
  return `${existing.trimEnd()}\n\n${block}\n`
}
