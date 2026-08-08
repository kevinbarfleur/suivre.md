import { z } from 'zod'

// Two-level preferences:
//  - global (machine): same settings whatever the project (theme, default
//    view). Stored in a user config folder.
//  - project: settings that make sense per repo (default view override).
//    Stored in the backlog, versioned with the project.

/** Visual theme. Machine setting (does not change from one project to another). */
export const themeSchema = z.enum(['terminal', 'dark', 'light'])
export type Theme = z.infer<typeof themeSchema>

export const globalPreferencesSchema = z.object({
  theme: themeSchema.default('dark'),
  /** View opened when entering the app (fallback shared by all projects). */
  defaultView: z.string().default('board'),
})
export type GlobalPreferences = z.infer<typeof globalPreferencesSchema>

export const projectPreferencesSchema = z.object({
  /** Overrides the default view for THIS project; null = use the global one. */
  defaultView: z.string().nullable().default(null),
})
export type ProjectPreferences = z.infer<typeof projectPreferencesSchema>

export interface Preferences {
  global: GlobalPreferences
  project: ProjectPreferences
}
