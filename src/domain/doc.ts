import { z } from 'zod'
import { joinFrontmatter, splitFrontmatter } from './frontmatter'

// Document de connaissance (spec, note, référence), rendu en lecture dans l'app.
export const docFrontmatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  updated: z.string().min(1),
})
export type DocFrontmatter = z.infer<typeof docFrontmatterSchema>

export interface Doc {
  frontmatter: DocFrontmatter
  body: string
  fileName: string
}

export interface CreateDocInput {
  title: string
  tags?: string[]
  body?: string
}

export interface DocPatch {
  title?: string
  tags?: string[]
  body?: string
}

const FIELD_ORDER: readonly (keyof DocFrontmatter)[] = ['id', 'title', 'tags', 'updated']

export function parseDoc(raw: string, fileName: string): Doc {
  const { data, body } = splitFrontmatter(raw)
  return { frontmatter: docFrontmatterSchema.parse(data), body, fileName }
}

export function serializeDoc(doc: Doc): string {
  return joinFrontmatter(
    doc.frontmatter as unknown as Record<string, unknown>,
    FIELD_ORDER as readonly string[],
    doc.body,
  )
}
