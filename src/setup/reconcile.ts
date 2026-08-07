import { createHash } from 'node:crypto'

/**
 * Convergence de l'adaptateur SANS écraser le travail de l'utilisateur. Le
 * fichier généré porte un marqueur (version + empreinte du corps généré). Au
 * re-run : empreinte intacte → le fichier est à nous, on peut le remplacer ;
 * empreinte différente ou absente → l'utilisateur se l'est approprié, on ne
 * touche pas et on propose un `.new`. Logique pure, testée.
 */

const MARKER_RE = /^<!-- suivre-adapter v(\d+) content:([a-f0-9]{64}) -->\n/

export function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex')
}

/** Corps → fichier complet, marqueur en tête. */
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
  /** Fichier approprié par l'utilisateur : ne pas écraser (sauf --force). */
  | { action: 'diverged'; fromVersion: number | null }

/** Décide quoi faire du fichier existant face au template courant. */
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
 * Insère ou remplace un bloc délimité par des marqueurs dans un contenu
 * existant (AGENTS.md). Absent → append ; présent → remplacé sur place.
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
