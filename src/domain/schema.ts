import { z } from 'zod'

/** Priorité d'une tâche. Seul axe qui justifie de la couleur sur le board. */
export const prioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])
export type Priority = z.infer<typeof prioritySchema>

/**
 * Frontmatter YAML d'un fichier de tâche. Source de vérité du modèle : tout
 * champ structuré d'une tâche vit ici, le corps markdown porte le reste.
 */
export const taskFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  priority: prioritySchema.optional(),
  labels: z.array(z.string()).default([]),
  assignee: z.string().optional(),
  /** Rang lexicographique (fractional index) dans la colonne. */
  order: z.string().min(1),
  parent: z.string().optional(),
  depends: z.array(z.string()).default([]),
  created: z.string().min(1),
  updated: z.string().min(1),
})
export type TaskFrontmatter = z.infer<typeof taskFrontmatterSchema>

/** Une colonne du board = un statut possible. L'ordre du tableau fait l'ordre à l'écran. */
export const columnSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  wipLimit: z.number().int().positive().optional(),
})
export type Column = z.infer<typeof columnSchema>

/** config.yml d'un backlog. */
export const boardConfigSchema = z.object({
  name: z.string().min(1),
  taskPrefix: z.string().min(1).default('task'),
  columns: z.array(columnSchema).min(1),
})
export type BoardConfig = z.infer<typeof boardConfigSchema>

/** Colonnes par défaut posées par `suivre init`. */
export const DEFAULT_COLUMNS: Column[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'À faire' },
  { id: 'doing', label: 'En cours' },
  { id: 'done', label: 'Terminé' },
]
