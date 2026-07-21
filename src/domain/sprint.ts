import { z } from 'zod'
import { joinFrontmatter, splitFrontmatter } from './frontmatter'

// Le résolveur pur (sans zod) vit à part pour rester importable côté web sans
// tirer zod dans le bundle SPA.
export * from './sprint-resolve'

// A sprint = an ORDERED checklist of existing tasks to ship. It does not
// duplicate tasks — it references their ids. Progress is read from the tasks'
// real status (done = checked), so the sprint and the board never disagree.
export const sprintStatusSchema = z.enum(['active', 'done'])
export type SprintStatus = z.infer<typeof sprintStatusSchema>

export const sprintFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().optional(),
  status: sprintStatusSchema.default('active'),
  /** Task ids, in sprint order. */
  items: z.array(z.string()).default([]),
  created: z.string().min(1),
  updated: z.string().min(1),
})
export type SprintFrontmatter = z.infer<typeof sprintFrontmatterSchema>

export interface Sprint {
  frontmatter: SprintFrontmatter
  body: string
  fileName: string
}

export interface CreateSprintInput {
  title: string
  goal?: string
  items?: string[]
  body?: string
}

export interface SprintPatch {
  title?: string
  goal?: string
  status?: SprintStatus
  items?: string[]
  body?: string
}

const FIELD_ORDER: readonly (keyof SprintFrontmatter)[] = [
  'id',
  'title',
  'goal',
  'status',
  'items',
  'created',
  'updated',
]

export function parseSprint(raw: string, fileName: string): Sprint {
  const { data, body } = splitFrontmatter(raw)
  return { frontmatter: sprintFrontmatterSchema.parse(data), body, fileName }
}

export function serializeSprint(sprint: Sprint): string {
  return joinFrontmatter(
    sprint.frontmatter as unknown as Record<string, unknown>,
    FIELD_ORDER as readonly string[],
    sprint.body,
  )
}
