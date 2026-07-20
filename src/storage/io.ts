import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/** Lecture tolérante : `null` si le fichier n'existe pas / est illisible. */
export async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

export interface MarkdownFile {
  fileName: string
  raw: string
}

/**
 * Liste les fichiers `.md` d'un dossier (non récursif) avec leur contenu.
 * Tolérant : dossier absent → liste vide ; fichier illisible → ignoré. Base
 * partagée des tâches, décisions, docs et de leurs dossiers `archive/`.
 */
export async function readMarkdownDir(dir: string): Promise<MarkdownFile[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }
  const files: MarkdownFile[] = []
  for (const name of names) {
    if (!name.endsWith('.md')) continue
    const raw = await readFileSafe(join(dir, name))
    if (raw === null) continue
    files.push({ fileName: name, raw })
  }
  return files
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
