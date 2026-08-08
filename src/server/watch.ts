import chokidar, { type FSWatcher } from 'chokidar'
import { relative, sep } from 'node:path'
import type { BacklogPaths } from '../storage'

/** What changed on disk. One value per thing a surface can subscribe to. */
export type ChangeKind = 'tasks' | 'decisions' | 'docs' | 'sprints' | 'config' | 'preferences'

const COLLECTIONS: Record<string, ChangeKind> = {
  tasks: 'tasks',
  decisions: 'decisions',
  docs: 'docs',
  sprints: 'sprints',
}

/**
 * Watches the WHOLE backlog directory and reports what changed. This is the
 * source of live updates: whoever writes — the web, the CLI, MCP or an agent
 * editing `.suivre/decisions/` by hand — every open board refreshes.
 *
 * `baseDir` must exist: chokidar cannot watch a path that is not there yet, and
 * would stay dead for the process lifetime.
 */
export function watchBacklog(
  paths: BacklogPaths,
  onChange: (kind: ChangeKind) => void,
  debounceMs = 120,
): FSWatcher {
  const pending = new Set<ChangeKind>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const fire = (path: string): void => {
    const kind = classify(paths.baseDir, path)
    if (kind === null) return
    pending.add(kind)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const kinds = [...pending]
      pending.clear()
      for (const changed of kinds) onChange(changed)
    }, debounceMs)
  }

  const watcher = chokidar.watch(paths.baseDir, {
    ignoreInitial: true,
    // `atomicWrite` writes `<file>.<uuid>.tmp` then renames it into place: the
    // temp file is never the change, only the rename that follows is.
    ignored: (path: string) => path.endsWith('.tmp'),
  })
  watcher.on('add', fire).on('change', fire).on('unlink', fire)
  // A transient FS error (a folder removed mid-scan) must not take the board
  // down: an unhandled 'error' on an emitter throws.
  watcher.on('error', () => {})
  return watcher
}

/** Which collection a path belongs to; `null` for anything else under the backlog. */
function classify(baseDir: string, path: string): ChangeKind | null {
  const rel = relative(baseDir, path)
  if (rel === '' || rel.startsWith('..')) return null
  const head = rel.split(sep)[0]
  if (head === undefined) return null
  if (head === 'config.yml') return 'config'
  if (head === 'preferences.json') return 'preferences'
  return COLLECTIONS[head] ?? null
}
