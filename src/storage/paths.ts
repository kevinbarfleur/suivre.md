import { join } from 'node:path'

/** Emplacements sur disque d'un backlog, dérivés d'une racine de repo. */
export interface BacklogPaths {
  root: string
  baseDir: string
  configFile: string
  tasksDir: string
}

/** Le backlog vit dans `<root>/<dirName>/` (config.yml + tasks/). */
export function resolvePaths(root: string, dirName = 'backlog'): BacklogPaths {
  const baseDir = join(root, dirName)
  return {
    root,
    baseDir,
    configFile: join(baseDir, 'config.yml'),
    tasksDir: join(baseDir, 'tasks'),
  }
}
