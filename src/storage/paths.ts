import { join } from 'node:path'

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
