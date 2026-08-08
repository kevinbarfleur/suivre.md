import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** On-disk locations of a backlog, derived from a repo root. */
export interface BacklogPaths {
  root: string
  baseDir: string
  configFile: string
  tasksDir: string
  decisionsDir: string
  docsDir: string
  sprintsDir: string
  /** Project-specific preferences (versioned with the repo). */
  preferencesFile: string
}

/** Data lives in `<root>/<dirName>/` (config.yml + tasks/ + decisions/ + docs/ …).
 *  Default `.suivre`: branded hidden folder, no collision with other tools. */
export function resolvePaths(root: string, dirName = '.suivre'): BacklogPaths {
  const baseDir = join(root, dirName)
  return {
    root,
    baseDir,
    configFile: join(baseDir, 'config.yml'),
    tasksDir: join(baseDir, 'tasks'),
    decisionsDir: join(baseDir, 'decisions'),
    docsDir: join(baseDir, 'docs'),
    sprintsDir: join(baseDir, 'sprints'),
    preferencesFile: join(baseDir, 'preferences.json'),
  }
}

/**
 * Walks up from `startDir` for the directory holding `<dirName>/config.yml`,
 * stopping at the filesystem root; `null` if there is none. Surfaces run from
 * a subdirectory must act on the repo's backlog instead of proposing a second,
 * nested one. Synchronous: surfaces need the root before any async work.
 */
export function findRoot(startDir: string, dirName = '.suivre'): string | null {
  let dir = resolve(startDir)
  for (;;) {
    if (existsSync(join(dir, dirName, 'config.yml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}
