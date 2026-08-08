import { join } from 'node:path'
import { atomicWrite, readMarkdownDir, removeFile } from './io'

/** Conventional subfolder for archived items (`<collection>/archive/`). */
export const ARCHIVE_SUBDIR = 'archive'

export interface CollectionItem {
  frontmatter: { id: string }
  fileName: string
}

/**
 * Generic collection of `.md` files (frontmatter + body) in a directory.
 * Reuses the task logic for decisions and docs. Atomic writes; an invalid
 * file is skipped on read (never blocking).
 */
export class MarkdownCollection<T extends CollectionItem> {
  constructor(
    private readonly dir: string,
    private readonly parse: (raw: string, fileName: string) => T,
    private readonly serialize: (item: T) => string,
  ) {}

  private parseAll(files: { fileName: string; raw: string }[]): T[] {
    const items: T[] = []
    for (const { fileName, raw } of files) {
      try {
        items.push(this.parse(raw, fileName))
      } catch {
        /* invalid file: skip it rather than break the list */
      }
    }
    return items
  }

  /** Active items (top level of the directory, excluding the archive/ subfolder). */
  async list(): Promise<T[]> {
    return this.parseAll(await readMarkdownDir(this.dir))
  }

  /** Items stored in `<collection>/archive/` (archived by location). */
  async listArchived(): Promise<T[]> {
    return this.parseAll(await readMarkdownDir(join(this.dir, ARCHIVE_SUBDIR)))
  }

  async get(id: string): Promise<T | null> {
    const items = await this.list()
    return items.find((item) => item.frontmatter.id === id) ?? null
  }

  async save(item: T, previousFileName?: string): Promise<void> {
    if (previousFileName && previousFileName !== item.fileName) {
      await removeFile(join(this.dir, previousFileName))
    }
    await atomicWrite(join(this.dir, item.fileName), this.serialize(item))
  }

  async remove(id: string): Promise<boolean> {
    const item = await this.get(id)
    if (!item) return false
    await removeFile(join(this.dir, item.fileName))
    return true
  }
}
