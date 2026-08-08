import { join } from 'node:path'
import {
  atomicWrite,
  isSameFileName,
  readMarkdownDir,
  removeFile,
  type InvalidMarkdownFile,
  type MarkdownFile,
} from './io'

/** Conventional subfolder for archived items (`<collection>/archive/`). */
export const ARCHIVE_SUBDIR = 'archive'

export interface CollectionItem {
  frontmatter: { id: string }
  fileName: string
}

/** Parsed items plus the files that could not be parsed. */
export interface CollectionRead<T> {
  items: T[]
  invalid: InvalidMarkdownFile[]
}

/**
 * Generic collection of `.md` files (frontmatter + body) in a directory.
 * Reuses the task logic for decisions and docs. Atomic writes; an invalid
 * file never blocks a read — it is reported through `invalid`.
 */
export class MarkdownCollection<T extends CollectionItem> {
  constructor(
    private readonly dir: string,
    private readonly parse: (raw: string, fileName: string) => T,
    private readonly serialize: (item: T) => string,
  ) {}

  private parseAll(files: MarkdownFile[]): CollectionRead<T> {
    const items: T[] = []
    const invalid: InvalidMarkdownFile[] = []
    for (const { fileName, raw } of files) {
      try {
        items.push(this.parse(raw, fileName))
      } catch (error) {
        invalid.push({ fileName, message: error instanceof Error ? error.message : String(error) })
      }
    }
    return { items, invalid }
  }

  /** Active items and unparseable files (top level, excluding archive/). */
  async read(): Promise<CollectionRead<T>> {
    return this.parseAll(await readMarkdownDir(this.dir))
  }

  /** Items and unparseable files in `<collection>/archive/`. */
  async readArchived(): Promise<CollectionRead<T>> {
    return this.parseAll(await readMarkdownDir(join(this.dir, ARCHIVE_SUBDIR)))
  }

  /** Active items (top level of the directory, excluding the archive/ subfolder). */
  async list(): Promise<T[]> {
    return (await this.read()).items
  }

  /** Items stored in `<collection>/archive/` (archived by location). */
  async listArchived(): Promise<T[]> {
    return (await this.readArchived()).items
  }

  async get(id: string): Promise<T | null> {
    const items = await this.list()
    return items.find((item) => item.frontmatter.id === id) ?? null
  }

  /** Write first, then drop the old name: a failed write must never lose the item. */
  async save(item: T, previousFileName?: string): Promise<void> {
    await atomicWrite(join(this.dir, item.fileName), this.serialize(item))
    if (previousFileName && !isSameFileName(previousFileName, item.fileName)) {
      await removeFile(join(this.dir, previousFileName))
    }
  }

  async remove(id: string): Promise<boolean> {
    const item = await this.get(id)
    if (!item) return false
    await removeFile(join(this.dir, item.fileName))
    return true
  }
}
