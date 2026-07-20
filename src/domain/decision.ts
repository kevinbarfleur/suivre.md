import { z } from 'zod'
import { joinFrontmatter, splitFrontmatter } from './frontmatter'

// Décision d'architecture / produit (ADR), versionnée en markdown comme les
// tâches. Corps conventionnel : Contexte / Décision / Conséquences.
export const decisionStatusSchema = z.enum(['proposed', 'accepted', 'rejected', 'superseded'])
export type DecisionStatus = z.infer<typeof decisionStatusSchema>

export const decisionFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: decisionStatusSchema.default('proposed'),
  date: z.string().min(1),
  /** Décision remplacée par celle-ci. */
  supersedes: z.string().optional(),
  /** Décision qui remplace celle-ci (rend celle-ci superseded). */
  supersededBy: z.string().optional(),
  labels: z.array(z.string()).default([]),
})
export type DecisionFrontmatter = z.infer<typeof decisionFrontmatterSchema>

export interface Decision {
  frontmatter: DecisionFrontmatter
  body: string
  fileName: string
}

export interface CreateDecisionInput {
  title: string
  status?: DecisionStatus
  date?: string
  supersedes?: string
  labels?: string[]
  body?: string
}

export interface DecisionPatch {
  title?: string
  status?: DecisionStatus
  date?: string
  supersedes?: string
  supersededBy?: string
  labels?: string[]
  body?: string
}

const FIELD_ORDER: readonly (keyof DecisionFrontmatter)[] = [
  'id',
  'title',
  'status',
  'date',
  'supersedes',
  'supersededBy',
  'labels',
]

export function parseDecision(raw: string, fileName: string): Decision {
  const { data, body } = splitFrontmatter(raw)
  return { frontmatter: decisionFrontmatterSchema.parse(data), body, fileName }
}

export function serializeDecision(decision: Decision): string {
  return joinFrontmatter(
    decision.frontmatter as unknown as Record<string, unknown>,
    FIELD_ORDER as readonly string[],
    decision.body,
  )
}
