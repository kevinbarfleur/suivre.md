import { join } from 'node:path'

/** Emplacements sur disque d'un backlog, dérivés d'une racine de repo. */
export interface BacklogPaths {
  root: string
  baseDir: string
  configFile: string
  tasksDir: string
  decisionsDir: string
  docsDir: string
  sprintsDir: string
  /** Préférences propres au projet (versionnées avec le repo). */
  preferencesFile: string
}

/** Les données vivent dans `<root>/<dirName>/` (config.yml + tasks/ + decisions/ + docs/ …).
 *  Défaut `.suivre` : dossier caché brandé, sans collision avec d'autres outils. */
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
