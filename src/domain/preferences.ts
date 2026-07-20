import { z } from 'zod'

// Préférences à deux niveaux :
//  - globales (machine) : mêmes réglages quel que soit le projet (thème, vue
//    par défaut). Stockées dans un dossier de config utilisateur.
//  - projet : réglages qui ont du sens par repo (surcharge de la vue par défaut).
//    Stockées dans le backlog, versionnées avec le projet.

/** Thème visuel. Réglage machine (ne change pas d'un projet à l'autre). */
export const themeSchema = z.enum(['terminal', 'dark', 'light'])
export type Theme = z.infer<typeof themeSchema>

export const globalPreferencesSchema = z.object({
  theme: themeSchema.default('dark'),
  /** Vue ouverte à l'arrivée dans l'app (fallback commun à tous les projets). */
  defaultView: z.string().default('board'),
})
export type GlobalPreferences = z.infer<typeof globalPreferencesSchema>

export const projectPreferencesSchema = z.object({
  /** Surcharge la vue par défaut pour CE projet ; null = utiliser la globale. */
  defaultView: z.string().nullable().default(null),
})
export type ProjectPreferences = z.infer<typeof projectPreferencesSchema>

export interface Preferences {
  global: GlobalPreferences
  project: ProjectPreferences
}
