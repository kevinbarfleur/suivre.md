import { join } from 'node:path'
import { atomicWrite, readMarkdownDir, removeFile } from './io'

/** Sous-dossier conventionnel des items archivés (`<collection>/archive/`). */
export const ARCHIVE_SUBDIR = 'archive'

export interface CollectionItem {
  frontmatter: { id: string }
  fileName: string
}

/**
 * Collection générique de fichiers `.md` (frontmatter + corps) dans un dossier.
 * Mutualise la logique de tâches pour décisions et docs. Écriture atomique ;
 * un fichier invalide est ignoré à la lecture (jamais bloquant).
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
        /* fichier invalide : on l'ignore plutôt que de casser la liste */
      }
    }
    return items
  }

  /** Items actifs (top-level du dossier, hors sous-dossier archive/). */
  async list(): Promise<T[]> {
    return this.parseAll(await readMarkdownDir(this.dir))
  }

  /** Items rangés dans `<collection>/archive/` (archivés par emplacement). */
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
