import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Lecture tolérante : `null` si le fichier n'existe pas / est illisible. */
export async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

/**
 * Écriture ATOMIQUE : écrit un fichier temporaire puis `rename` (atomique sur
 * un même volume). Un board a des writers concurrents (web + CLI + MCP) — jamais
 * un fichier à moitié écrit. C'est le durcissement absent de question-inbox.
 */
export async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(tmp, content, 'utf8')
    await rename(tmp, path)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}

/** Suppression tolérante (no-op si déjà absent). */
export async function removeFile(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch {
    /* déjà supprimé */
  }
}
