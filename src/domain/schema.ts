import { z } from 'zod'

/** Task priority. The only axis that earns color on the board. */
export const prioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])
export type Priority = z.infer<typeof prioritySchema>

/**
 * YAML frontmatter of a task file. The model's source of truth: every
 * structured field lives here, the markdown body carries the rest.
 */
export const taskFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1),
  priority: prioritySchema.optional(),
  labels: z.array(z.string()).default([]),
  assignee: z.string().optional(),
  /** Lexicographic rank (fractional index) within the column. */
  order: z.string().min(1),
  parent: z.string().optional(),
  depends: z.array(z.string()).default([]),
  created: z.string().min(1),
  updated: z.string().min(1),
})
export type TaskFrontmatter = z.infer<typeof taskFrontmatterSchema>

/** A board column = one possible status. Array order is screen order. */
export const columnSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  wipLimit: z.number().int().positive().optional(),
})
export type Column = z.infer<typeof columnSchema>

/** A backlog's config.yml. */
export const boardConfigSchema = z.object({
  name: z.string().min(1),
  taskPrefix: z.string().min(1).default('task'),
  columns: z.array(columnSchema).min(1),
})
export type BoardConfig = z.infer<typeof boardConfigSchema>

/** Default columns created by `suivre init`. */
export const DEFAULT_COLUMNS: Column[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
]
