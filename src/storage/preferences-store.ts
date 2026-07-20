import { homedir } from 'node:os'
import { join } from 'node:path'
import type { z } from 'zod'
import {
  globalPreferencesSchema,
  projectPreferencesSchema,
  type GlobalPreferences,
  type ProjectPreferences,
} from '../domain'
import { atomicWrite, readFileSafe } from './io'

/** Fichier de config machine (XDG). Même thème/vue par défaut pour tous les projets. */
function globalConfigFile(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(base, 'suivre', 'config.json')
}

/** Parse tolérant : fichier absent ou corrompu → valeurs par défaut du schéma. */
function parseOrDefault<T>(schema: z.ZodType<T>, raw: string | null): T {
  if (raw === null) return schema.parse({})
  try {
    return schema.parse(JSON.parse(raw))
  } catch {
    return schema.parse({})
  }
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * Persiste les préférences aux deux niveaux : machine (dossier de config
 * utilisateur) et projet (dans le backlog, versionné). Écriture atomique.
 */
export class PreferencesStore {
  constructor(private readonly projectFile: string) {}

  async loadGlobal(): Promise<GlobalPreferences> {
    return parseOrDefault(globalPreferencesSchema, await readFileSafe(globalConfigFile()))
  }

  async saveGlobal(next: GlobalPreferences): Promise<void> {
    await atomicWrite(globalConfigFile(), serialize(next))
  }

  async loadProject(): Promise<ProjectPreferences> {
    return parseOrDefault(projectPreferencesSchema, await readFileSafe(this.projectFile))
  }

  async saveProject(next: ProjectPreferences): Promise<void> {
    await atomicWrite(this.projectFile, serialize(next))
  }
}
